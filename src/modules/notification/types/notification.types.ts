/**
 * Shared notification DTOs and types.
 * Re-exported from notification.service.ts for backward compatibility.
 */

export interface SendNotificationDto {
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface RegisterTokenDto {
  fcm_token: string;
  device_type?: string;
  device_id?: string;
  device_name?: string;
}

export type NotificationChannel = 'push' | 'sms' | 'email' | 'in_app';

export interface NotificationPayload {
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
  channel?: NotificationChannel;
}
