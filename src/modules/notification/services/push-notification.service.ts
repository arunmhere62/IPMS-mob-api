import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { getMessaging, MulticastMessage, BatchResponse, SendResponse } from 'firebase-admin/messaging';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { getErrorMessage } from '../utils/error.util';
import { getFirebaseApp } from '../providers/firebase.provider';
import { getExpoClient, isExpoReceipt } from '../providers/expo.provider';
import { SendNotificationDto } from '../types/notification.types';

// Initialize Firebase app at module load (side effect — no assignment needed).
getFirebaseApp();

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private expo: Expo;

  constructor(private prisma: PrismaService) {
    this.expo = getExpoClient();
  }



  async deactivateOtherTokensForDevice(params: {
    userId: number;
    deviceId: string;
    keepToken: string;
  }) {
    const { userId, deviceId, keepToken } = params;
    try {
      await this.prisma.user_fcm_tokens.updateMany({
        where: {
          user_id: userId,
          device_id: deviceId,
          is_active: true,
          fcm_token: { not: keepToken },
        },
        data: {
          is_active: false,
          updated_at: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `❌ Failed to deactivate other tokens user=${userId} device_id=${deviceId} keep=${this.maskToken(keepToken)} err=${getErrorMessage(error)}`,
      );
    }
  }


  dedupeActiveTokens(
    tokens: Array<{ fcm_token: string; device_id: string | null; updated_at: Date; created_at: Date }>,
  ) {
    // Group by device_id first (if present)
    const byDevice = new Map<
      string | null,
      { fcm_token: string; device_id: string | null; updated_at: Date; created_at: Date }
    >();

    for (const t of tokens) {
      const prev = byDevice.get(t.device_id);
      if (!prev) {
        byDevice.set(t.device_id, t);
        continue;
      }

      // Keep the most recent token for each device
      const prevTime = prev.updated_at?.getTime?.() ?? prev.created_at?.getTime?.() ?? 0;
      const nextTime = t.updated_at?.getTime?.() ?? t.created_at?.getTime?.() ?? 0;
      if (nextTime >= prevTime) {
        byDevice.set(t.device_id, t);
      }
    }

    // If we have multiple devices, keep only the most recently updated one
    // This prevents sending duplicate notifications to multiple old tokens
    const deviceTokens = Array.from(byDevice.values());
    if (deviceTokens.length > 1) {
      deviceTokens.sort((a, b) => {
        const timeA = a.updated_at?.getTime?.() ?? a.created_at?.getTime?.() ?? 0;
        const timeB = b.updated_at?.getTime?.() ?? b.created_at?.getTime?.() ?? 0;
        return timeB - timeA; // Sort descending (most recent first)
      });
      // Keep only the most recent token
      return [deviceTokens[0]];
    }

    // Finally, deduplicate by token (in case of exact duplicates)
    const uniqByToken = new Map<
      string,
      { fcm_token: string; device_id: string | null; updated_at: Date; created_at: Date }
    >();
    for (const t of deviceTokens) {
      if (!uniqByToken.has(t.fcm_token)) {
        uniqByToken.set(t.fcm_token, t);
      }
    }

    return Array.from(uniqByToken.values());
  }


  private getExpoTicketId(ticket: unknown): string | null {
    if (!ticket || typeof ticket !== 'object') return null;
    const t = ticket as Record<string, unknown>;
    return typeof t.id === 'string' && t.id.length > 0 ? t.id : null;
  }


  private async fetchExpoReceipts(ticketIdToToken: Record<string, string>) {
    const ticketIds = Object.keys(ticketIdToToken);
    if (ticketIds.length === 0) {
      return { receiptErrors: [] as Array<{ message?: string }>, receiptOkCount: 0, receiptErrorCount: 0 };
    }

    try {
      const receiptIdChunks = this.expo.chunkPushNotificationReceiptIds(ticketIds);
      let receiptOkCount = 0;
      let receiptErrorCount = 0;
      const receiptErrors: Array<{ receiptId: string; token: string; message?: string; details?: Record<string, unknown> }> = [];

      for (const receiptIdChunk of receiptIdChunks) {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(receiptIdChunk);
        for (const receiptId of Object.keys(receipts)) {
          const receipt = (receipts as Record<string, unknown>)[receiptId];
          if (!receipt) continue;
          if (isExpoReceipt(receipt) && receipt.status === 'ok') {
            receiptOkCount++;
            continue;
          }

          receiptErrorCount++;
          const token = ticketIdToToken[receiptId];
          const message = isExpoReceipt(receipt) ? receipt.message : undefined;
          const details = isExpoReceipt(receipt) ? receipt.details : undefined;
          receiptErrors.push({
            receiptId,
            token,
            message,
            details,
          });

          this.logger.warn(
            `❌ Expo receipt error receiptId=${receiptId} token=${this.maskToken(token)} message=${String(message ?? '')} details=${JSON.stringify(details ?? {})}`,
          );

          if ((details as Record<string, unknown> | undefined)?.error === 'DeviceNotRegistered') {
            await this.markTokenInactive(token);
          }
        }
      }

      return { receiptErrors, receiptOkCount, receiptErrorCount };
    } catch (error) {
      this.logger.error(`❌ Expo receipt fetch failed: ${getErrorMessage(error)}`);
      return { receiptErrors: [{ message: getErrorMessage(error) }], receiptOkCount: 0, receiptErrorCount: 1 };
    }
  }


  private getAndroidChannelId(type?: string): string {
    if (!type) return 'default';
    switch (type) {
      case 'RENT_REMINDER':
      case 'PAYMENT_DUE_SOON':
        return 'rent-reminders';
      case 'PAYMENT_CONFIRMATION':
      case 'PARTIAL_PAYMENT':
      case 'FULL_PAYMENT':
        return 'payments';
      case 'OVERDUE_ALERT':
      case 'PAYMENT_OVERDUE':
        return 'alerts';
      default:
        return 'default';
    }
  }


  maskToken(token: string) {
    if (!token) return '';
    const t = String(token);
    if (t.length <= 12) return `${t.slice(0, 4)}…${t.slice(-2)}`;
    return `${t.slice(0, 8)}…${t.slice(-6)}`;
  }


  async sendToExpoToken(token: string, notification: SendNotificationDto) {
    if (!Expo.isExpoPushToken(token)) {
      this.logger.warn(`❌ sendToExpoToken invalid token: ${this.maskToken(token)}`);
      return { success: false, message: 'Invalid Expo push token' };
    }

    this.logger.log(
      `📤 sendToExpoToken to=${this.maskToken(token)} title=${notification.title} type=${notification.type}`,
    );
    const result = await this.sendViaExpo([token], notification);
    return {
      success: result.successCount > 0,
      ...result,
    };
  }



  /**
   * Send via Expo Push Service
   */
  async sendViaExpo(tokens: string[], notification: SendNotificationDto) {
    try {
      this.logger.log(
        `🚀 Expo send start tokens=${tokens.length} sample=${this.maskToken(tokens[0])} title=${notification.title} type=${notification.type}`,
      );

      const messages: ExpoPushMessage[] = tokens.map(token => ({
        to: token,
        sound: 'default',
        priority: 'high',
        channelId: this.getAndroidChannelId(notification.type),
        title: notification.title,
        body: notification.body,
        data: {
          type: notification.type,
          ...(notification.data || {}),
        },
      }));

      const chunks = this.expo.chunkPushNotifications(messages);
      let successCount = 0;
      let failureCount = 0;
      const ticketIds: string[] = [];
      const ticketIdToToken: Record<string, string> = {};

      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          
          ticketChunk.forEach((ticket, index) => {
            if (ticket.status === 'ok') {
              successCount++;

              const ticketId = this.getExpoTicketId(ticket);
              if (ticketId) {
                ticketIds.push(ticketId);
                const token = chunk[index]?.to ? String(chunk[index].to) : tokens[index];
                ticketIdToToken[ticketId] = token;
              }
            } else {
              failureCount++;
              const token = chunk[index]?.to ? String(chunk[index].to) : tokens[index];
              this.logger.warn(
                `❌ Expo push failed token=${this.maskToken(token)} message=${ticket.message} details=${JSON.stringify(ticket.details ?? {})}`,
              );
              
              // Mark token as inactive if error is token-related
              if (ticket.details?.error === 'DeviceNotRegistered') {
                this.markTokenInactive(token);
              }
            }
          });
        } catch (error) {
          this.logger.error(`❌ Expo chunk send failed: ${getErrorMessage(error)}`);
          failureCount += chunk.length;
        }
      }

      const receiptSummary = await this.fetchExpoReceipts(ticketIdToToken);

      this.logger.log(
        `📬 Expo receipts done ok=${receiptSummary.receiptOkCount} failed=${receiptSummary.receiptErrorCount} ticketIds=${ticketIds.length}`,
      );

      this.logger.log(
        `✅ Expo send done success=${successCount} failed=${failureCount} total=${tokens.length}`,
      );
      return {
        successCount,
        failureCount,
        ticketIds,
        receiptSummary,
      };
    } catch (error) {
      this.logger.error(`❌ Expo send failed: ${getErrorMessage(error)}`);
      return {
        successCount: 0,
        failureCount: tokens.length,
        ticketIds: [],
        receiptSummary: { receiptErrors: [{ message: getErrorMessage(error) }], receiptOkCount: 0, receiptErrorCount: 1 },
      };
    }
  }


  /**
   * Send via Firebase Cloud Messaging
   */
  async sendViaFirebase(tokens: string[], notification: SendNotificationDto) {
    try {
      this.logger.log(
        `🚀 Firebase send start tokens=${tokens.length} title=${notification.title} type=${notification.type}`,
      );
      const message: MulticastMessage = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          type: notification.type,
          ...(notification.data || {}),
        },
        tokens: tokens,
      };

      const response = await getMessaging().sendEachForMulticast(message);

      this.logger.log(
        `✅ Firebase send done success=${response.successCount} failed=${response.failureCount} total=${tokens.length}`,
      );

      // Handle failed tokens
      if (response.failureCount > 0) {
        await this.handleFailedTokens(response, tokens);
      }

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      this.logger.error(`❌ Firebase send failed: ${getErrorMessage(error)}`);
      return { successCount: 0, failureCount: tokens.length };
    }
  }


  /**
   * Mark token as inactive
   */
  private async markTokenInactive(token: string) {
    try {
      await this.prisma.user_fcm_tokens.update({
        where: { fcm_token: token },
        data: { is_active: false },
      });
    } catch (error) {
      this.logger.error(`Failed to mark token inactive: ${getErrorMessage(error)}`);
    }
  }


  /**
   * Handle failed tokens (mark as inactive)
   */
  private async handleFailedTokens(
    response: BatchResponse,
    tokens: string[],
  ) {
    const failedTokens: string[] = [];

    response.responses.forEach((resp: SendResponse, idx: number) => {
      if (!resp.success) {
        failedTokens.push(tokens[idx]);
      }
    });

    if (failedTokens.length > 0) {
      await this.prisma.user_fcm_tokens.updateMany({
        where: {
          fcm_token: { in: failedTokens },
        },
        data: {
          is_active: false,
          updated_at: new Date(),
        },
      });

      this.logger.log(`🗑️ Marked ${failedTokens.length} failed tokens as inactive`);
    }
  }
}
