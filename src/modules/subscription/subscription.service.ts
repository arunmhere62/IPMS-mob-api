import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

type DecimalLike = Prisma.Decimal | { toNumber(): number };

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  private normalizePrice(price: DecimalLike | number | string | null | undefined): number {
    if (price && typeof price === 'object' && 'toNumber' in price && typeof (price as DecimalLike).toNumber === 'function') {
      return Number(price.toNumber().toFixed(2));
    }

    const parsed = Number.parseFloat(String(price ?? '0'));
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return Number(parsed.toFixed(2));
  }

  private calculateGstBreakdown(basePrice: number) {
    const gstRate = 18;
    const cgstRate = gstRate / 2;
    const sgstRate = gstRate / 2;

    const base = Number(basePrice.toFixed(2));
    const cgstAmount = Number(((base * cgstRate) / 100).toFixed(2));
    const sgstAmount = Number(((base * sgstRate) / 100).toFixed(2));
    const totalAmount = Number((base + cgstAmount + sgstAmount).toFixed(2));

    return {
      cgst_rate: cgstRate,
      cgst_amount: cgstAmount,
      sgst_rate: sgstRate,
      sgst_amount: sgstAmount,
      total_amount: totalAmount,
    };
  }

  // CCAvenue configuration
  private readonly CCAVENUE_MERCHANT_ID = process.env.CCAVENUE_MERCHANT_ID;
  private readonly CCAVENUE_ACCESS_CODE = process.env.CCAVENUE_ACCESS_CODE;
  private readonly CCAVENUE_WORKING_KEY = process.env.CCAVENUE_WORKING_KEY;
  private readonly CCAVENUE_REDIRECT_URL = process.env.CCAVENUE_REDIRECT_URL || 'http://localhost:3000/api/v1/subscription/payment/callback';
  private readonly CCAVENUE_CANCEL_URL = process.env.CCAVENUE_CANCEL_URL || 'http://localhost:3000/api/v1/subscription/payment/cancel';
  private readonly CCAVENUE_PAYMENT_URL = process.env.CCAVENUE_PAYMENT_URL || 'https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction';

  /**
   * Validate CCAvenue configuration
   */
  private validateCCAvenueConfig() {
    if (!this.CCAVENUE_MERCHANT_ID || !this.CCAVENUE_ACCESS_CODE || !this.CCAVENUE_WORKING_KEY) {
      console.error('❌ CCAvenue configuration missing:', {
        hasMerchantId: !!this.CCAVENUE_MERCHANT_ID,
        hasAccessCode: !!this.CCAVENUE_ACCESS_CODE,
        hasWorkingKey: !!this.CCAVENUE_WORKING_KEY,
      });
      throw new BadRequestException(
        'Payment gateway not configured. Please contact support.'
      );
    }
  }

  /**
   * Test CCAvenue configuration (for debugging)
   */
  async testCCAvenueConfig() {
    return ResponseUtil.success({
      merchantId: this.CCAVENUE_MERCHANT_ID,
      merchantIdLength: this.CCAVENUE_MERCHANT_ID?.length,
      hasAccessCode: !!this.CCAVENUE_ACCESS_CODE,
      accessCodeLength: this.CCAVENUE_ACCESS_CODE?.length,
      hasWorkingKey: !!this.CCAVENUE_WORKING_KEY,
      workingKeyLength: this.CCAVENUE_WORKING_KEY?.length,
      paymentUrl: this.CCAVENUE_PAYMENT_URL,
      redirectUrl: this.CCAVENUE_REDIRECT_URL,
      cancelUrl: this.CCAVENUE_CANCEL_URL,
      note: 'Check if Merchant ID should be 176853 (6 digits) not 1769853 (7 digits)',
    }, 'CCAvenue configuration test');
  }

  /**
   * Get all active subscription plans
   */
  async getActivePlans() {
    const select = {
      s_no: true,
      name: true,
      description: true,
      duration: true,
      price: true,
      currency: true,
      features: true,
      max_tenants: true,
      max_pg_locations: true,
      max_beds: true,
      max_employees: true,
      max_rooms: true,
      max_users: true,
      max_invoices_per_month: true,
      max_sms_per_month: true,
      max_whatsapp_per_month: true,
      is_free: true,
      is_trial: true,
      is_active: true,
    } as const;

    const plans = await this.prisma.subscription_plans.findMany({
      where: { is_active: true },
      orderBy: { price: 'asc' },
      select:
        select as unknown as Parameters<
          PrismaService['subscription_plans']['findMany']
        >[0]['select'],
    });

    type Plan = (typeof plans)[number];

    const grouped = plans.map((plan: Plan) => {
      const basePrice = this.normalizePrice(plan.price);
      const gstDetails = this.calculateGstBreakdown(basePrice);

      return {
        ...plan,
        price: basePrice,
        limits: {
          max_pg_locations: plan.max_pg_locations ?? null,
          max_tenants: plan.max_tenants ?? null,
          max_rooms: plan.max_rooms ?? null,
          max_beds: plan.max_beds ?? null,
          max_employees: plan.max_employees ?? null,
          max_users: plan.max_users ?? null,
          max_invoices_per_month: plan.max_invoices_per_month ?? null,
          max_sms_per_month: plan.max_sms_per_month ?? null,
          max_whatsapp_per_month: plan.max_whatsapp_per_month ?? null,
        },
        gst_breakdown: {
          cgst_rate: gstDetails.cgst_rate,
          cgst_amount: gstDetails.cgst_amount,
          sgst_rate: gstDetails.sgst_rate,
          sgst_amount: gstDetails.sgst_amount,
          igst_rate: 0,
          igst_amount: 0,
          total_price_including_gst: gstDetails.total_amount,
        },
      };
    });

    return ResponseUtil.success(grouped, 'Subscription plans fetched successfully');
  }

  /**
   * Get current active subscription for an organization
   */
  private async findCurrentActiveSubscription(userId: number, organizationId: number) {
    void userId;
    const now = new Date();

    // Normalize: ACTIVE subscriptions with past end_date should become EXPIRED
    await this.prisma.user_subscriptions.updateMany({
      where: {
        organization_id: organizationId,
        status: 'ACTIVE',
        end_date: { lt: now },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    return this.prisma.user_subscriptions.findFirst({
      where: {
        organization_id: organizationId,
        status: 'ACTIVE',
        end_date: { gte: now },
      },
      include: {
        subscription_plans: true,
      },
      orderBy: {
        end_date: 'desc',
      },
    });
  }

  async getCurrentSubscription(userId: number, organizationId: number) {
    const subscription = await this.findCurrentActiveSubscription(userId, organizationId);
    return ResponseUtil.success(subscription, 'Current organization subscription fetched successfully');
  }

  /**
   * Check if organization has active subscription
   */
  async checkSubscriptionStatus(userId: number, organizationId: number) {
    const now = new Date();

    // Normalize: ACTIVE subscriptions with past end_date should become EXPIRED
    await this.prisma.user_subscriptions.updateMany({
      where: {
        organization_id: organizationId,
        status: 'ACTIVE',
        end_date: { lt: now },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    const subscription = await this.findCurrentActiveSubscription(userId, organizationId);

    const lastSubscription = await this.prisma.user_subscriptions.findFirst({
      where: {
        organization_id: organizationId,
      },
      include: {
        subscription_plans: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    let normalizedSubscription: Record<string, unknown> | null = null;
    if (subscription) {
      const { subscription_plans, ...rest } = subscription as unknown as Record<string, unknown>;
      normalizedSubscription = {
        ...rest,
        plan: subscription_plans || null,
      };
    }

    let normalizedLastSubscription: Record<string, unknown> | null = null;
    if (lastSubscription) {
      const { subscription_plans, ...rest } = lastSubscription as unknown as Record<string, unknown>;
      normalizedLastSubscription = {
        ...rest,
        plan: subscription_plans || null,
      };
    }

    let daysRemaining = 0;
    if (subscription?.end_date) {
      const endDate = new Date(subscription.end_date);
      const now = new Date();
      const diffTime = endDate.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    return ResponseUtil.success(
      {
        has_active_subscription: !!subscription,
        subscription: normalizedSubscription,
        last_subscription: normalizedLastSubscription,
        days_remaining: daysRemaining,
        is_trial: Boolean((subscription as unknown as { is_trial?: boolean } | null)?.is_trial),
      },
      'Subscription status checked successfully',
    );
  }

  /**
   * Get subscription by ID
   */
  async getSubscriptionById(subscriptionId: number) {
    const subscription = await this.prisma.user_subscriptions.findUnique({
      where: { s_no: subscriptionId },
      include: {
        subscription_plans: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return ResponseUtil.success(subscription, 'Subscription fetched successfully');
  }


  /**
   * Get all subscriptions for a user (no pagination)
   */
  async getUserSubscriptionsAll(userId: number, organizationId: number) {
    const subscriptions = await this.prisma.user_subscriptions.findMany({
      where: {
        organization_id: organizationId,
      },
      include: {
        subscription_plans: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    const normalizedSubscriptions = (subscriptions || []).map((sub) => {
      const { subscription_plans, ...rest } = sub as unknown as Record<string, unknown>;
      return {
        ...rest,
        plan: subscription_plans || null,
      };
    });

    return ResponseUtil.success(
      normalizedSubscriptions,
      'Organization subscriptions fetched successfully',
    );
  }

  async getSubscriptionInvoices(organizationId: number) {
    const invoices = await this.prisma.subscription_invoices.findMany({
      where: { organization_id: organizationId },
      orderBy: { invoice_date: 'desc' },
    });

    return ResponseUtil.success(
      invoices,
      'Subscription invoices fetched successfully',
    );
  }

  /**
   * Initiate subscription and generate CCAvenue payment URL
   */
  async initiateSubscription(userId: number, organizationId: number, planId: number) {
    // Validate CCAvenue configuration
    this.validateCCAvenueConfig();

    // Get plan details
    const plan = await this.prisma.subscription_plans.findUnique({
      where: { s_no: planId },
    });

    if (!plan || !plan.is_active) {
      throw new BadRequestException('Invalid or inactive plan');
    }

    const basePrice = this.normalizePrice(plan.price);
    const gstDetails = this.calculateGstBreakdown(basePrice);
    const totalPriceIncludingGst = gstDetails.total_amount;

    const planSummary = {
      s_no: plan.s_no,
      name: plan.name,
      description: plan.description,
      duration: plan.duration,
      currency: plan.currency,
      price: basePrice,
      is_free: Boolean((plan as unknown as { is_free?: boolean }).is_free),
      is_trial: Boolean((plan as unknown as { is_trial?: boolean }).is_trial),
      gst_breakdown: {
        cgst_rate: gstDetails.cgst_rate,
        cgst_amount: gstDetails.cgst_amount,
        sgst_rate: gstDetails.sgst_rate,
        sgst_amount: gstDetails.sgst_amount,
        igst_rate: 0,
        igst_amount: 0,
        total_price_including_gst: gstDetails.total_amount,
      },
    };

    // Get user details
    const user = await this.prisma.users.findUnique({
      where: { s_no: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate unique order ID first
    const orderId = `SUB_${userId}_${planId}_${Date.now()}`;

    // Create pending subscription record
    const subscription = await this.prisma.user_subscriptions.create({
      data: {
        user_id: userId,
        organization_id: organizationId,
        plan_id: planId,
        start_date: new Date(),
        end_date: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
        status: 'PENDING',
        auto_renew: false,
        // Note: amount_paid field doesn't exist in schema, amount is stored in subscription_payments table
      },
    });

    // Create payment record
    await this.prisma.subscription_payments.create({
      data: {
        order_id: orderId,
        user_id: userId,
        organization_id: organizationId,
        subscription_id: subscription.s_no,
        plan_id: planId,
        amount: totalPriceIncludingGst.toFixed(2),
        currency: plan.currency,
        payment_type: 'NEW_SUBSCRIPTION',
        status: 'INITIATED',
      },
    });

    // Prepare CCAvenue payment data
    const paymentData = {
      merchant_id: this.CCAVENUE_MERCHANT_ID,
      order_id: orderId,
      amount: totalPriceIncludingGst.toFixed(2),
      currency: plan.currency,
      redirect_url: this.CCAVENUE_REDIRECT_URL,
      cancel_url: this.CCAVENUE_CANCEL_URL,
      language: 'EN',
      billing_name: user.name || 'User',
      billing_email: user.email,
      billing_tel: user.phone || '',
      billing_address: '',
      billing_city: '',
      billing_state: '',
      billing_zip: '',
      billing_country: 'India',
      merchant_param1: subscription.s_no.toString(),
      merchant_param2: userId.toString(),
      merchant_param3: organizationId.toString(),
      merchant_param4: planId.toString(),
    };

    // Convert to query string
    const queryString = Object.entries(paymentData)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');

    console.log('📝 Payment data query string length:', queryString.length);
    console.log('🔑 Working key available:', !!this.CCAVENUE_WORKING_KEY);
    console.log('🔑 Working key length:', this.CCAVENUE_WORKING_KEY?.length);

    // Encrypt the data
    const encryptedData = this.ccavenueEncrypt(queryString);
    console.log('🔐 Encrypted data length:', encryptedData.length);

    // Generate payment URL
    const paymentUrl = `${this.CCAVENUE_PAYMENT_URL}&encRequest=${encodeURIComponent(encryptedData)}&access_code=${this.CCAVENUE_ACCESS_CODE}`;

    // Update subscription with order ID
    await this.prisma.user_subscriptions.update({
      where: { s_no: subscription.s_no },
      data: { 
        // Store order ID in a custom field if available, or use a separate payments table
      },
    });

    console.log('💳 Payment URL generated:', { 
      orderId, 
      subscriptionId: subscription.s_no,
      paymentUrlLength: paymentUrl.length 
    });

    return ResponseUtil.success({
      subscription,
      plan: planSummary,
      pricing: {
        currency: plan.currency,
        base_price: basePrice,
        cgst_amount: gstDetails.cgst_amount,
        sgst_amount: gstDetails.sgst_amount,
        total_price_including_gst: gstDetails.total_amount,
      },
      payment_url: paymentUrl,
      order_id: orderId,
    }, 'Subscription initiated successfully');
  }

  /**
   * Initiate an upgrade from an ACTIVE subscription to a new plan (Option A: immediate upgrade, no proration)
   */
  async initiateUpgrade(userId: number, organizationId: number, newPlanId: number) {
    // Validate CCAvenue configuration
    this.validateCCAvenueConfig();

    const currentSubscription = await this.prisma.user_subscriptions.findFirst({
      where: {
        organization_id: organizationId,
        status: 'ACTIVE',
        end_date: { gte: new Date() },
      },
      orderBy: { end_date: 'desc' },
    });

    if (!currentSubscription) {
      throw new BadRequestException('No active subscription found to upgrade');
    }

    if (currentSubscription.plan_id === newPlanId) {
      throw new BadRequestException('You are already on this plan');
    }

    const plan = await this.prisma.subscription_plans.findUnique({
      where: { s_no: newPlanId },
    });

    if (!plan || !plan.is_active) {
      throw new BadRequestException('Invalid or inactive plan');
    }

    const user = await this.prisma.users.findUnique({
      where: { s_no: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const orderId = `UPG_${userId}_${newPlanId}_${Date.now()}`;

    const subscription = await this.prisma.user_subscriptions.create({
      data: {
        user_id: userId,
        organization_id: organizationId,
        plan_id: newPlanId,
        start_date: new Date(),
        end_date: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
        status: 'PENDING',
        auto_renew: false,
        is_trial: Boolean(plan.is_trial),
      },
    });

    const basePrice = this.normalizePrice(plan.price);
    const gstDetails = this.calculateGstBreakdown(basePrice);
    const totalPriceIncludingGst = gstDetails.total_amount;

    await this.prisma.subscription_payments.create({
      data: {
        order_id: orderId,
        user_id: userId,
        organization_id: organizationId,
        subscription_id: subscription.s_no,
        plan_id: newPlanId,
        amount: totalPriceIncludingGst.toFixed(2),
        currency: plan.currency,
        payment_type: 'UPGRADE',
        status: 'INITIATED',
        metadata: {
          action: 'UPGRADE',
          from_subscription_id: currentSubscription.s_no,
          from_plan_id: currentSubscription.plan_id,
          to_plan_id: newPlanId,
        },
      },
    });

    const planSummary = {
      s_no: plan.s_no,
      name: plan.name,
      description: plan.description,
      duration: plan.duration,
      currency: plan.currency,
      price: basePrice,
      is_free: Boolean((plan as unknown as { is_free?: boolean }).is_free),
      is_trial: Boolean((plan as unknown as { is_trial?: boolean }).is_trial),
      gst_breakdown: {
        cgst_rate: gstDetails.cgst_rate,
        cgst_amount: gstDetails.cgst_amount,
        sgst_rate: gstDetails.sgst_rate,
        sgst_amount: gstDetails.sgst_amount,
        igst_rate: 0,
        igst_amount: 0,
        total_price_including_gst: gstDetails.total_amount,
      },
    };

    const paymentData = {
      merchant_id: this.CCAVENUE_MERCHANT_ID,
      order_id: orderId,
      amount: totalPriceIncludingGst.toFixed(2),
      currency: plan.currency,
      redirect_url: this.CCAVENUE_REDIRECT_URL,
      cancel_url: this.CCAVENUE_CANCEL_URL,
      language: 'EN',
      billing_name: user.name || 'User',
      billing_email: user.email,
      billing_tel: user.phone || '',
      billing_address: '',
      billing_city: '',
      billing_state: '',
      billing_zip: '',
      billing_country: 'India',
      merchant_param1: subscription.s_no.toString(),
      merchant_param2: userId.toString(),
      merchant_param3: organizationId.toString(),
      merchant_param4: newPlanId.toString(),
    };

    const queryString = Object.entries(paymentData)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');

    const encryptedData = this.ccavenueEncrypt(queryString);
    const paymentUrl = `${this.CCAVENUE_PAYMENT_URL}&encRequest=${encodeURIComponent(encryptedData)}&access_code=${this.CCAVENUE_ACCESS_CODE}`;

    return ResponseUtil.success({
      subscription,
      plan: planSummary,
      pricing: {
        currency: plan.currency,
        base_price: basePrice,
        cgst_amount: gstDetails.cgst_amount,
        sgst_amount: gstDetails.sgst_amount,
        total_price_including_gst: gstDetails.total_amount,
      },
      payment_url: paymentUrl,
      order_id: orderId,
    }, 'Upgrade initiated successfully');
  }

  /**
   * CCAvenue encryption
   */
  private ccavenueEncrypt(plainText: string): string {
    try {
      const key = crypto.createHash('md5').update(this.CCAVENUE_WORKING_KEY).digest();
      const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
      
      const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
      let encrypted = cipher.update(plainText, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return encrypted;
    } catch (error) {
      console.error('❌ Encryption error:', error);
      throw new Error('Payment encryption failed');
    }
  }

  /**
   * CCAvenue decryption
   */
  private ccavenueDecrypt(encryptedText: string): string {
    try {
      const key = crypto.createHash('md5').update(this.CCAVENUE_WORKING_KEY).digest();
      const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
      
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('❌ Decryption error:', error);
      throw new Error('Payment decryption failed');
    }
  }

  /**
   * Manually activate subscription (for debugging/testing)
   */
  async manuallyActivateSubscription(orderId: string, upiTransactionId?: string) {
    console.log('🔧 Manual activation requested for order:', orderId);

    // Find subscription by order ID pattern
    // Order ID format: SUB_34_1_timestamp
    const orderParts = orderId.split('_');
    const userId = parseInt(orderParts[1]);
    const planId = parseInt(orderParts[2]);

    console.log('📋 Parsed order:', { userId, planId, orderId });

    // Find the most recent PENDING subscription for this user and plan
    const subscription = await this.prisma.user_subscriptions.findFirst({
      where: {
        user_id: userId,
        plan_id: planId,
        status: 'PENDING',
      },
      orderBy: {
        created_at: 'desc',
      },
      include: {
        subscription_plans: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException(
        `No pending subscription found for order ${orderId}`,
      );
    }

    console.log('✅ Found subscription:', subscription.s_no);

    // Activate the subscription
    const updatedSubscription = await this.prisma.user_subscriptions.update({
      where: { s_no: subscription.s_no },
      data: {
        status: 'ACTIVE',
      },
      include: {
        subscription_plans: true,
      },
    });

    console.log('🎉 Subscription activated:', updatedSubscription.s_no);

    return ResponseUtil.success({
      subscription: updatedSubscription,
      orderId,
      upiTransactionId,
    }, 'Subscription activated successfully');
  }

  /**
   * Handle payment callback from CCAvenue
   */
  async handlePaymentCallback(body: Record<string, unknown>) {
    try {
      // Decrypt the response
      const encResponse = typeof body.encResp === 'string' ? body.encResp : '';
      if (!encResponse) {
        throw new Error('No encrypted response received');
      }

      const decryptedData = this.ccavenueDecrypt(encResponse);
      console.log('🔓 Decrypted payment response:', decryptedData);

      // Parse the response
      const params = new URLSearchParams(decryptedData);
      const orderId = params.get('order_id');
      const orderStatus = params.get('order_status');
      const trackingId = params.get('tracking_id');
      const bankRefNo = params.get('bank_ref_no');
      const paymentMode = params.get('payment_mode');
      const statusCode = params.get('status_code');
      const statusMessage = params.get('status_message');

      if (!orderId) {
        throw new Error('Missing order_id in payment response');
      }

      console.log('💳 Payment details:', {
        orderId,
        orderStatus,
        trackingId,
        statusCode,
      });

      // Find the payment record
      const payment = await this.prisma.subscription_payments.findUnique({
        where: { order_id: orderId },
        include: { user_subscriptions: true },
      });

      if (!payment) {
        throw new NotFoundException('Payment record not found');
      }

      // Idempotency: if already processed, do not process again
      if (payment.status === 'SUCCESS' || payment.status === 'FAILURE') {
        return ResponseUtil.success(
          {
            orderId,
            trackingId: payment.tracking_id,
            message: payment.status_message,
          },
          payment.status === 'SUCCESS' ? 'Payment successful' : 'Payment failed',
        );
      }

      // Update payment status
      await this.prisma.subscription_payments.update({
        where: { order_id: orderId },
        data: {
          status: orderStatus === 'Success' ? 'SUCCESS' : 'FAILURE',
          tracking_id: trackingId,
          bank_ref_no: bankRefNo,
          payment_mode: paymentMode,
          status_code: statusCode,
          status_message: statusMessage,
          response_data: JSON.parse(JSON.stringify(Object.fromEntries(params))),
        },
      });

      // Update subscription status if payment successful
      if (orderStatus === 'Success' && payment.subscription_id) {
        const plan = await this.prisma.subscription_plans.findUnique({
          where: { s_no: payment.plan_id },
        });

        const startDate = new Date();
        const endDate = new Date(Date.now() + (plan?.duration ?? 0) * 24 * 60 * 60 * 1000);

        const metadata = isRecord(payment.metadata) ? payment.metadata : null;
        const isUpgrade =
          payment.payment_type === 'UPGRADE' ||
          (metadata?.action === 'UPGRADE');

        if (isUpgrade) {
          const fromSubscriptionIdRaw = metadata?.from_subscription_id;
          const fromSubscriptionId = typeof fromSubscriptionIdRaw === 'number'
            ? fromSubscriptionIdRaw
            : parseInt(String(fromSubscriptionIdRaw || ''), 10);

          await this.prisma.$transaction(async (tx) => {
            if (Number.isFinite(fromSubscriptionId)) {
              await tx.user_subscriptions.updateMany({
                where: {
                  s_no: fromSubscriptionId,
                  organization_id: payment.organization_id,
                  status: 'ACTIVE',
                },
                data: {
                  status: 'CANCELLED',
                  end_date: startDate,
                },
              });
            }

            await tx.user_subscriptions.update({
              where: { s_no: payment.subscription_id! },
              data: {
                status: 'ACTIVE',
                start_date: startDate,
                end_date: endDate,
              },
            });
          });

          console.log('✅ Upgrade activated:', payment.subscription_id, 'from:', fromSubscriptionId);
        } else {
          await this.prisma.user_subscriptions.update({
            where: { s_no: payment.subscription_id },
            data: {
              status: 'ACTIVE',
              start_date: startDate,
              end_date: endDate,
            },
          });

          console.log('✅ Subscription activated:', payment.subscription_id);
        }
      }

      // Mark subscription failed if payment failed
      if (orderStatus !== 'Success' && payment.subscription_id) {
        await this.prisma.user_subscriptions.updateMany({
          where: { s_no: payment.subscription_id, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      }

      return ResponseUtil.success({
        orderId,
        trackingId,
        message: statusMessage,
      }, orderStatus === 'Success' ? 'Payment successful' : 'Payment failed');
    } catch (error) {
      console.error('❌ Payment callback processing error:', error);
      throw error;
    }
  }
}
