import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { CCAvenuePaymentResponse } from './ccavenue.service';
import { Prisma } from '@prisma/client';
import { ApiResponseDto } from '../../common/dto/response.dto';

export interface CreatePaymentRecordDto {
  orderId: string;
  userId: number;
  organizationId: number;
  planId: number;
  amount: string;
  currency: string;
  paymentType: 'NEW_SUBSCRIPTION' | 'RENEWAL' | 'UPGRADE';
  status: 'INITIATED' | 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'PENDING';
  metadata?: Prisma.InputJsonValue;
}

export interface UpdatePaymentRecordDto {
  status: 'INITIATED' | 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'PENDING';
  trackingId?: string;
  bankRefNo?: string;
  paymentMode?: string;
  statusCode?: string;
  statusMessage?: string;
  failureMessage?: string;
  responseData?: Prisma.InputJsonValue;
}

type SubscriptionPaymentRow = {
  user_id: number;
  organization_id: number;
  plan_id: number;
};

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a new subscription payment record
   */
  async createPaymentRecord(data: CreatePaymentRecordDto) {
    this.logger.log(`Creating subscription payment record for order: ${data.orderId}`);

    const paymentRecord = await this.prisma.subscription_payments.create({
      data: {
        order_id: data.orderId,
        user_id: data.userId,
        organization_id: data.organizationId,
        plan_id: data.planId,
        amount: data.amount,
        currency: data.currency,
        payment_type: data.paymentType,
        status: data.status,
        metadata: data.metadata || null,
      },
    });

    this.logger.log(`Subscription payment record created: ${paymentRecord.s_no}`);
    return ResponseUtil.success(paymentRecord, 'Payment record created successfully');
  }

  /**
   * Update subscription payment record with response from CCAvenue
   */
  async updatePaymentRecord(orderId: string, data: UpdatePaymentRecordDto) {
    this.logger.log(`Updating subscription payment record for order: ${orderId}`);

    await this.prisma.subscription_payments.update({
      where: { order_id: orderId },
      data: {
        status: data.status,
        tracking_id: data.trackingId,
        bank_ref_no: data.bankRefNo,
        payment_mode: data.paymentMode,
        status_code: data.statusCode,
        status_message: data.statusMessage,
        failure_message: data.failureMessage,
        response_data: data.responseData || null,
      },
    });

    this.logger.log(`Subscription payment record updated for order: ${orderId}`);
  }

  /**
   * Get subscription payment by order ID
   */
  async getPaymentByOrderId(orderId: string) {
    this.logger.log(`Fetching subscription payment record for order: ${orderId}`);

    const payment = await this.prisma.subscription_payments.findUnique({
      where: { order_id: orderId },
      include: {
        subscription_plans: true,
        user_subscriptions: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with order ID ${orderId} not found`);
    }

    return ResponseUtil.success(payment, 'Payment fetched successfully');
  }

  /**
   * Process successful subscription payment - Create/Update user subscription
   */
  async processSuccessfulPayment(paymentResponse: CCAvenuePaymentResponse) {
    this.logger.log(`Processing successful subscription payment for order: ${paymentResponse.orderId}`);

    try {
      // Get payment record
      const paymentEnvelope = await this.getPaymentByOrderId(paymentResponse.orderId);
      const payment = paymentEnvelope.data as SubscriptionPaymentRow;

      // Get plan details
      const plan = await this.prisma.subscription_plans.findUnique({
        where: { s_no: payment.plan_id },
      });

      if (!plan) {
        throw new NotFoundException('Subscription plan not found');
      }

      // Calculate subscription dates
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration);

      // Create or update user subscription
      const subscription = await this.prisma.user_subscriptions.create({
        data: {
          user_id: payment.user_id,
          organization_id: payment.organization_id,
          plan_id: payment.plan_id,
          status: 'ACTIVE',
          start_date: startDate,
          end_date: endDate,
          auto_renew: false,
        },
      });

      // Link subscription to payment
      await this.prisma.subscription_payments.update({
        where: { order_id: paymentResponse.orderId },
        data: {
          subscription_id: subscription.s_no,
        },
      });

      this.logger.log(`Subscription activated for user ${payment.user_id} until ${endDate.toISOString()}`);
      this.logger.log(`Successfully processed payment for order: ${paymentResponse.orderId}`);

      return ResponseUtil.success(subscription, 'Payment processed successfully');
    } catch (error) {
      this.logger.error(`Failed to process payment for order: ${paymentResponse.orderId}`, error);
      throw error;
    }
  }

  /**
   * Get active subscription for an organization
   */
  async getActiveSubscriptionForOrganization(organizationId: number) {
    const subscription = await this.prisma.user_subscriptions.findFirst({
      where: {
        organization_id: organizationId,
        status: 'ACTIVE',
        end_date: {
          gte: new Date(),
        },
      },
      include: {
        subscription_plans: true,
      },
      orderBy: {
        end_date: 'desc',
      },
    });

    return ResponseUtil.success(subscription, 'Active subscription fetched successfully');
  }

  /**
   * Backward compatible: Get active subscription for a user
   * NOTE: Subscriptions are organization-scoped; this resolves organization_id from the user.
   */
  async getActiveSubscription(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { s_no: userId },
      select: { organization_id: true },
    });

    if (!user?.organization_id) {
      return ResponseUtil.success(null, 'Active subscription fetched successfully');
    }

    return this.getActiveSubscriptionForOrganization(user.organization_id);
  }

  /**
   * Check if organization has active subscription
   */
  async hasActiveSubscriptionForOrganization(organizationId: number): Promise<boolean> {
    const result = await this.getActiveSubscriptionForOrganization(organizationId);
    return Boolean((result as ApiResponseDto<unknown> | null | undefined)?.data);
  }

  /**
   * Backward compatible: Check if user has active subscription
   * NOTE: Subscriptions are organization-scoped; this resolves organization_id from the user.
   */
  async hasActiveSubscription(userId: number): Promise<boolean> {
    const user = await this.prisma.users.findUnique({
      where: { s_no: userId },
      select: { organization_id: true },
    });

    if (!user?.organization_id) return false;
    return this.hasActiveSubscriptionForOrganization(user.organization_id);
  }

  /**
   * Get payment status for mobile app (formatted response)
   */
  async getPaymentStatus(orderId: string) {
    const payment = await this.getPaymentByOrderId(orderId);

    return ResponseUtil.success({
      orderId: payment.order_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      trackingId: payment.tracking_id,
      bankRefNo: payment.bank_ref_no,
      paymentMode: payment.payment_mode,
      statusMessage: payment.status_message,
      createdAt: payment.created_at,
      updatedAt: payment.updated_at,
    }, 'Payment status fetched successfully');
  }
}
