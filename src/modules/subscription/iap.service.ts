import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { Prisma } from '@prisma/client';
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  JWSTransactionDecodedPayload,
  NotificationTypeV2,
  Subtype,
  ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import * as fs from 'fs';
import * as path from 'path';

/**
 * IAP (In-App Purchase) Service — Apple App Store integration.
 *
 * App Store Guideline 3.1.1 requires paid digital subscriptions sold inside
 * the iOS app to use Apple In-App Purchase. This service:
 *
 *   1. Validates StoreKit 2 JWS transactions with Apple's App Store Server API.
 *   2. Maps Apple product ids → subscription_plans.s_no and grants entitlement.
 *   3. Processes App Store Server Notifications V2 (renewals, cancellations,
 *      billing issues, refunds) so entitlement stays in sync without the app
 *      being open.
 *
 * Required configuration (env vars):
 *   APPLE_IAP_BUNDLE_ID            — App bundle id, e.g. com.indianpgmanagement.app
 *   APPLE_IAP_APP_APPLE_ID         — App Apple ID (numeric) from App Store Connect
 *   APPLE_IAP_ISSUER_ID            — In-App Purchase key issuer id
 *   APPLE_IAP_KEY_ID               — In-App Purchase key id
 *   APPLE_IAP_PRIVATE_KEY_PATH     — Path to the .p8 private key file
 *   APPLE_IAP_ENVIRONMENT          — 'sandbox' | 'production'
 *   APPLE_IAP_S2S_BUNDLE_ID        — (same as bundle id) used for notification verification
 *   APPLE_IAP_APP_APPLE_ID_FOR_S2S — (same as app apple id) for notification verification
 *
 * The Apple Root CA certificates are bundled with this service
 * (./AppleRootCAs.p8 / downloaded at deploy time). See deploy notes.
 */

// Apple IAP product id → backend subscription_plans.s_no (explicit mapping).
// Keep in sync with the client (IPMS-mob-ui/src/config/iapProducts.ts).
//
// DB plan reference:
//   s_no=6 → Testing Plan   (30 days,  ₹10)   → MONTHLY
//   s_no=4 → PremiumX Lite  (180 days, ₹5999) → PREMIUMX_LITE
//   s_no=3 → PremiumX       (365 days, ₹9999) → PREMIUMX
//   s_no=2 → EnterpriseX    (365 days, ₹24999)→ ENTERPRISEX
const IAP_PRODUCT_IDS = {
  MONTHLY: 'com.indianpgmanagement.sub.monthly',
  PREMIUMX_LITE: 'com.indianpgmanagement.sub.premiumxlite',
  PREMIUMX: 'com.indianpgmanagement.sub.premiumx',
  ENTERPRISEX: 'com.indianpgmanagement.sub.enterprisex',
} as const;

type IapProductId = (typeof IAP_PRODUCT_IDS)[keyof typeof IAP_PRODUCT_IDS];

// Explicit Apple Product ID → subscription_plans.s_no mapping.
const IAP_PRODUCT_TO_PLAN_ID: Record<IapProductId, number> = {
  [IAP_PRODUCT_IDS.MONTHLY]: 6,
  [IAP_PRODUCT_IDS.PREMIUMX_LITE]: 4,
  [IAP_PRODUCT_IDS.PREMIUMX]: 3,
  [IAP_PRODUCT_IDS.ENTERPRISEX]: 2,
};

@Injectable()
export class IapService {
  private readonly logger = new Logger(IapService.name);

  private readonly bundleId: string;
  private readonly appAppleId: number;
  private readonly issuerId: string;
  private readonly keyId: string;
  private readonly privateKey: string | null;
  private readonly environment: Environment;
  private readonly client: AppStoreServerAPIClient | null;
  private readonly verifier: SignedDataVerifier | null;
  private readonly isConfigured: boolean;

  constructor(private prisma: PrismaService) {
    this.bundleId = process.env.APPLE_IAP_BUNDLE_ID ?? '';
    this.appAppleId = Number(process.env.APPLE_IAP_APP_APPLE_ID ?? '0');
    this.issuerId = process.env.APPLE_IAP_ISSUER_ID ?? '';
    this.keyId = process.env.APPLE_IAP_KEY_ID ?? '';
    const keyPath = process.env.APPLE_IAP_PRIVATE_KEY_PATH ?? '';
    this.privateKey = keyPath && fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8') : null;
    const envRaw = (process.env.APPLE_IAP_ENVIRONMENT ?? 'production').toLowerCase();
    this.environment = envRaw === 'sandbox' ? Environment.SANDBOX : Environment.PRODUCTION;

    this.isConfigured = Boolean(
      this.bundleId && this.appAppleId && this.issuerId && this.keyId && this.privateKey,
    );

    if (this.isConfigured) {
      this.client = new AppStoreServerAPIClient(
        this.privateKey!,
        this.keyId,
        this.issuerId,
        this.bundleId,
        this.environment,
      );
      this.verifier = this.buildVerifier();
      this.logger.log(`Apple IAP configured (env=${envRaw}, bundle=${this.bundleId})`);
    } else {
      this.client = null;
      this.verifier = null;
      this.logger.warn(
        'Apple IAP not configured — set APPLE_IAP_* env vars to enable receipt validation.',
      );
    }
  }

  /**
   * Build the SignedDataVerifier used to verify JWS transactions and S2S
   * notifications. Loads Apple Root CAs from the bundled certs directory.
   */
  private buildVerifier(): SignedDataVerifier | null {
    try {
      const certsDir = path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        'certs',
        'apple-root-cas',
      );
      if (!fs.existsSync(certsDir)) {
        this.logger.warn(
          `Apple Root CA certs directory not found at ${certsDir}. ` +
            'S2S notification verification will be unavailable. ' +
            'Download from https://www.apple.com/certificateauthority/ and place .cer files there.',
        );
        return null;
      }
      const rootCerts: Buffer[] = fs
        .readdirSync(certsDir)
        .filter((f) => f.endsWith('.cer') || f.endsWith('.pem') || f.endsWith('.crt'))
        .map((f) => fs.readFileSync(path.join(certsDir, f)));

      if (rootCerts.length === 0) {
        this.logger.warn(`No Apple Root CA .cer files found in ${certsDir}.`);
        return null;
      }

      return new SignedDataVerifier(
        rootCerts,
        true, // enable online checks (OCSP)
        this.environment,
        this.bundleId,
      );
    } catch (err) {
      this.logger.error(`Failed to build Apple SignedDataVerifier: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Validate an Apple StoreKit 2 JWS transaction and grant subscription
   * entitlement for the authenticated user's organization.
   *
   * Called by the iOS client (POST /subscription/iap/validate) after a
   * successful IAP purchase. The client sends the signed transaction token
   * (Purchase.purchaseToken on iOS) plus the productId it purchased.
   */
  async validateReceiptAndGrantEntitlement(args: {
    userId: number;
    organizationId: number;
    transactionToken: string;
    productId: string;
    transactionId?: string;
    originalTransactionId?: string;
  }) {
    const { userId, organizationId, transactionToken, productId } = args;

    if (!this.isConfigured || !this.client || !this.verifier) {
      throw new BadRequestException(
        'Apple In-App Purchase validation is not configured on the server.',
      );
    }

    if (!transactionToken) {
      throw new BadRequestException('Missing Apple transaction token.');
    }

    // 1. Verify the JWS signature with Apple's SignedDataVerifier.
    let payload: JWSTransactionDecodedPayload;
    try {
      payload = await this.verifier.verifyAndDecodeTransaction(transactionToken);
    } catch (err) {
      this.logger.error(
        `Apple JWS verification failed for product ${productId}: ${(err as Error).message}`,
      );
      throw new BadRequestException('Apple transaction verification failed.');
    }

    // 2. Defensive checks — the productId in the verified payload must match
    //    what the client claims to have purchased.
    const payloadProductId = (payload as unknown as { productId?: string }).productId ?? productId;
    if (payloadProductId !== productId) {
      this.logger.error(
        `Product id mismatch: client=${productId}, apple=${payloadProductId}`,
      );
      throw new BadRequestException('Apple transaction product id mismatch.');
    }

    const appleTransactionId =
      args.transactionId ??
      (payload as unknown as { transactionId?: string }).transactionId ??
      '';
    const originalTransactionId =
      args.originalTransactionId ??
      (payload as unknown as { originalTransactionId?: string }).originalTransactionId ??
      appleTransactionId;

    // 3. Map Apple product id → backend plan id by duration.
    const plan = await this.findPlanForProductId(productId);
    if (!plan) {
      throw new BadRequestException(
        `No subscription plan configured for Apple product id ${productId}.`,
      );
    }

    // 4. Idempotency: if we've already processed this Apple transaction id,
    //    return the existing subscription without re-granting.
    const existingPayment = await this.prisma.subscription_payments.findFirst({
      where: { tracking_id: appleTransactionId },
      include: { user_subscriptions: true },
    });
    if (existingPayment && existingPayment.status === 'SUCCESS') {
      return ResponseUtil.success(
        {
          subscription: existingPayment.user_subscriptions,
          plan,
        },
        'Subscription already active.',
      );
    }

    // 5. Create / activate the subscription record (mirrors CCAvenue flow).
    const startDate = new Date();
    const endDate = new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000);
    const orderId = `IAP_${userId}_${plan.s_no}_${appleTransactionId}`;

    const result = await this.prisma.$transaction(async (tx) => {
      // Cancel any other active subscriptions for this org.
      await tx.user_subscriptions.updateMany({
        where: {
          organization_id: organizationId,
          status: 'ACTIVE',
        },
        data: { status: 'CANCELLED', end_date: startDate },
      });

      const subscription = await tx.user_subscriptions.create({
        data: {
          user_id: userId,
          organization_id: organizationId,
          plan_id: plan.s_no,
          start_date: startDate,
          end_date: endDate,
          status: 'ACTIVE',
          auto_renew: true,
          is_trial: false,
        },
        include: { subscription_plans: true },
      });

      await tx.subscription_payments.create({
        data: {
          order_id: orderId,
          user_id: userId,
          organization_id: organizationId,
          subscription_id: subscription.s_no,
          plan_id: plan.s_no,
          amount: this.normalizePrice(plan.price).toFixed(2),
          currency: plan.currency,
          payment_type: 'NEW_SUBSCRIPTION',
          status: 'SUCCESS',
          tracking_id: appleTransactionId,
          payment_mode: 'APPLE_IAP',
          status_message: 'Apple In-App Purchase',
          response_data: {
            apple_transaction_id: appleTransactionId,
            apple_original_transaction_id: originalTransactionId,
            apple_product_id: productId,
            apple_environment: (payload as unknown as { environment?: string }).environment ?? null,
          } as unknown as Prisma.InputJsonValue,
          metadata: {
            source: 'APPLE_IAP',
            original_transaction_id: originalTransactionId,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return subscription;
    });

    this.logger.log(
      `Apple IAP entitlement granted: org=${organizationId} plan=${plan.s_no} txn=${appleTransactionId}`,
    );

    return ResponseUtil.success(
      { subscription: result, plan },
      'Apple In-App Purchase validated and subscription activated.',
    );
  }

  /**
   * Handle an App Store Server Notification V2 payload (signed JWS).
   *
   * Apple calls POST /subscription/iap/notifications with a body of shape
   * { signedPayload: '<JWS>' }. We verify + decode it and update entitlement
   * state for renewals, cancellations, refunds, and billing issues.
   */
  async handleServerNotification(signedPayload: string) {
    if (!this.verifier) {
      this.logger.warn('S2S notification received but verifier is not configured — ignoring.');
      return ResponseUtil.success({ received: true, processed: false }, 'Verifier not configured.');
    }

    if (!signedPayload) {
      throw new BadRequestException('Missing signedPayload.');
    }

    let notificationBody: ResponseBodyV2DecodedPayload;
    try {
      notificationBody = await this.verifier.verifyAndDecodeNotification(signedPayload);
    } catch (err) {
      this.logger.error(`S2S notification verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Apple notification verification failed.');
    }

    const notificationType = notificationBody?.notificationType as NotificationTypeV2 | undefined;
    const subtype = notificationBody?.subtype as Subtype | undefined;
    const data = (notificationBody?.data ?? {}) as { signedTransactionInfo?: string; originalTransactionId?: string };
    const signedTransactionInfo = data?.signedTransactionInfo as string | undefined;
    const originalTransactionId =
      data?.originalTransactionId ?? (signedTransactionInfo
        ? ((await this.tryDecodeTransaction(signedTransactionInfo))?.originalTransactionId ?? null)
        : null);

    this.logger.log(
      `Apple S2S notification: type=${notificationType} subtype=${subtype} originalTx=${originalTransactionId}`,
    );

    // Look up the subscription by the Apple original transaction id stored
    // in subscription_payments.metadata.original_transaction_id.
    const payment = originalTransactionId
      ? await this.prisma.subscription_payments.findFirst({
          where: {
            tracking_id: String(originalTransactionId),
          },
          include: { user_subscriptions: true },
        })
      : null;

    if (!payment || !payment.user_subscriptions) {
      this.logger.warn(
        `S2S notification for unknown original transaction id: ${originalTransactionId}`,
      );
      return ResponseUtil.success(
        { received: true, processed: false },
        'No matching subscription.',
      );
    }

    const subscription = payment.user_subscriptions;

    switch (notificationType) {
      case NotificationTypeV2.DID_RENEW:
      case NotificationTypeV2.RENEWAL_EXTENDED: {
        // Renewal succeeded — extend end_date by one plan duration from now.
        const plan = await this.prisma.subscription_plans.findUnique({
          where: { s_no: payment.plan_id },
        });
        const newEndDate = new Date(
          Date.now() + (plan?.duration ?? 30) * 24 * 60 * 60 * 1000,
        );
        await this.prisma.user_subscriptions.update({
          where: { s_no: subscription.s_no },
          data: { status: 'ACTIVE', end_date: newEndDate },
        });
        this.logger.log(`Renewal applied: sub=${subscription.s_no} newEnd=${newEndDate.toISOString()}`);
        break;
      }

      case NotificationTypeV2.EXPIRED:
      case NotificationTypeV2.GRACE_PERIOD_EXPIRED: {
        await this.prisma.user_subscriptions.update({
          where: { s_no: subscription.s_no },
          data: { status: 'EXPIRED' },
        });
        this.logger.log(`Subscription expired via S2S: sub=${subscription.s_no}`);
        break;
      }

      case NotificationTypeV2.REFUND: {
        await this.prisma.user_subscriptions.update({
          where: { s_no: subscription.s_no },
          data: { status: 'CANCELLED', end_date: new Date() },
        });
        await this.prisma.subscription_payments.update({
          where: { s_no: payment.s_no },
          data: { status: 'FAILURE', status_message: 'Apple refund' },
        });
        this.logger.log(`Refund applied via S2S: sub=${subscription.s_no}`);
        break;
      }

      case NotificationTypeV2.DID_FAIL_TO_RENEW: {
        // Apple is retrying billing — keep ACTIVE but flag for attention.
        // subtype GRACE_PERIOD = inside grace period, RETRY = retry window.
        this.logger.warn(
          `Billing issue for sub=${subscription.s_no} subtype=${subtype}`,
        );
        break;
      }

      default:
        this.logger.log(`Unhandled Apple S2S notification type: ${notificationType}`);
    }

    return ResponseUtil.success(
      { received: true, processed: true, notificationType, subtype },
      'Apple notification processed.',
    );
  }

  private async tryDecodeTransaction(
    signedTransactionInfo: string,
  ): Promise<{ originalTransactionId?: string } | null> {
    if (!this.verifier) return null;
    try {
      const decoded = await this.verifier.verifyAndDecodeTransaction(signedTransactionInfo);
      return decoded as unknown as { originalTransactionId?: string };
    } catch (err) {
      this.logger.error(`Failed to decode signedTransactionInfo: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Map an Apple IAP product id to a backend subscription_plans row by
   * explicit s_no lookup (IAP_PRODUCT_TO_PLAN_ID). This allows multiple
   * plans with the same duration (e.g. PremiumX and EnterpriseX are both
   * 365 days) to each have their own IAP product.
   */
  private async findPlanForProductId(productId: string) {
    const planId = IAP_PRODUCT_TO_PLAN_ID[productId as IapProductId];
    if (!planId) return null;

    const plan = await this.prisma.subscription_plans.findUnique({
      where: { s_no: planId },
    });
    return plan;
  }

  private normalizePrice(price: { toNumber(): number } | number | string | null | undefined): number {
    if (price && typeof price === 'object' && 'toNumber' in price) {
      return Number((price as { toNumber(): number }).toNumber().toFixed(2));
    }
    const parsed = Number.parseFloat(String(price ?? '0'));
    return Number.isNaN(parsed) ? 0 : Number(parsed.toFixed(2));
  }
}
