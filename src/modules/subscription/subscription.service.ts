import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { EmailService } from '../email/email.service';
import { OWNER_NOTIFICATION_EMAILS } from '../email/email.constants';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

type DecimalLike = Prisma.Decimal | { toNumber(): number };

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

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

  // CCAvenue configuration (hardcoded for debugging)
  private readonly CCAVENUE_MERCHANT_ID = '4422142';
  private readonly CCAVENUE_ACCESS_CODE = 'AVAE94NG00AB68EABA';
  private readonly CCAVENUE_WORKING_KEY = 'B2779D53659D72AD12DD229F49FE01B4';
  private readonly CCAVENUE_REDIRECT_URL = 'https://mobapi.indianpgmanagement.com/api/v1/subscription/payment/callback';
  private readonly CCAVENUE_CANCEL_URL = 'https://mobapi.indianpgmanagement.com/api/v1/subscription/payment/cancel';
  private readonly CCAVENUE_PAYMENT_URL = 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction';

  // CCAvenue AES encryption (matches old working implementation)
  // Key: MD5(working_key) → 16 bytes → AES-128-CBC
  // IV: [0x00, 0x01, ... 0x0f] (fixed)
  private ccavEncrypt(plainText: string): string {
    const key = crypto.createHash('md5').update(this.CCAVENUE_WORKING_KEY).digest();
    const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private ccavDecrypt(encryptedText: string): string {
    const key = crypto.createHash('md5').update(this.CCAVENUE_WORKING_KEY).digest();
    const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

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
      include: { city: true, state: true },
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
      billing_name: (user.name || 'User').replace(/[^\x20-\x7E]/g, '').slice(0, 100) || 'User',
      billing_email: (user.email && user.email.includes('@') ? user.email : 'user@example.com').slice(0, 100),
      billing_tel: (user.phone || '9999999999').toString().replace(/\D/g, '').slice(0, 20) || '9999999999',
      billing_address: (user.address || 'Not Provided').toString().slice(0, 200),
      billing_city: (user.city?.name || 'Not Provided').toString().slice(0, 50),
      billing_state: (user.state?.name || 'Not Provided').toString().slice(0, 50),
      billing_zip: (user.pincode || '000000').toString().slice(0, 20),
      billing_country: 'India',
      merchant_param1: subscription.s_no.toString(),
      merchant_param2: userId.toString(),
      merchant_param3: organizationId.toString(),
      merchant_param4: planId.toString(),
    };

    // Convert to query string (no encodeURIComponent - matches CCAvenue demo)
    const queryString = Object.entries(paymentData)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    console.log('📝 Payment data query string:', queryString.substring(0, 200));
    console.log('📝 Payment data query string length:', queryString.length);
    console.log('🔑 Working key available:', !!this.CCAVENUE_WORKING_KEY);
    console.log('🔑 Working key length:', this.CCAVENUE_WORKING_KEY?.length);

    // Encrypt the data
    const encryptedData = this.ccavEncrypt(queryString);
    console.log('🔐 Encrypted data length:', encryptedData.length);

    // Generate payment URL
    const paymentUrl = `${this.CCAVENUE_PAYMENT_URL}&encRequest=${encryptedData}&access_code=${this.CCAVENUE_ACCESS_CODE}`;

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
      include: {
        subscription_plans: true,
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
      include: { city: true, state: true },
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
      billing_name: (user.name || 'User').replace(/[^\x20-\x7E]/g, '').slice(0, 100) || 'User',
      billing_email: (user.email && user.email.includes('@') ? user.email : 'user@example.com').slice(0, 100),
      billing_tel: (user.phone || '9999999999').toString().replace(/\D/g, '').slice(0, 20) || '9999999999',
      billing_address: (user.address || 'Not Provided').toString().slice(0, 200),
      billing_city: (user.city?.name || 'Not Provided').toString().slice(0, 50),
      billing_state: (user.state?.name || 'Not Provided').toString().slice(0, 50),
      billing_zip: (user.pincode || '000000').toString().slice(0, 20),
      billing_country: 'India',
      merchant_param1: subscription.s_no.toString(),
      merchant_param2: userId.toString(),
      merchant_param3: organizationId.toString(),
      merchant_param4: newPlanId.toString(),
    };

    const queryString = Object.entries(paymentData)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    console.log('📝 [Upgrade] Payment data query string:', queryString.substring(0, 200));
    console.log('📝 [Upgrade] Query string length:', queryString.length);

    const encryptedData = this.ccavEncrypt(queryString);
    console.log('🔐 [Upgrade] Encrypted data length:', encryptedData.length);

    const paymentUrl = `${this.CCAVENUE_PAYMENT_URL}&encRequest=${encryptedData}&access_code=${this.CCAVENUE_ACCESS_CODE}`;
    console.log('💳 [Upgrade] Payment URL generated:', { orderId, paymentUrlLength: paymentUrl.length });

    // Notify owner about the upgrade attempt
    try {
      await this.sendUpgradeInitiatedNotification({
        user,
        orderId,
        organizationId,
        currentPlanName: (currentSubscription.subscription_plans as unknown as { name?: string } | null)?.name || 'Unknown Plan',
        newPlanName: plan.name || 'Unknown Plan',
        amount: totalPriceIncludingGst,
        currency: plan.currency,
        currentEndDate: currentSubscription.end_date,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send upgrade initiated notification for order ${orderId}: ${(error as Error).message}`,
      );
    }

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
   * Regenerate CCAvenue URL for an existing payment order with a selected payment method.
   * This keeps the same order_id but adds the payment_option parameter so CCAvenue
   * can pre-select the payment method (UPI, Net Banking, Card, Wallet, etc.).
   */
  async preparePayment(orderId: string, paymentMethod: string) {
    this.validateCCAvenueConfig();

    if (!orderId) {
      throw new BadRequestException('Order ID is required');
    }

    const payment = await this.prisma.subscription_payments.findUnique({
      where: { order_id: orderId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment record not found for order ${orderId}`);
    }

    const user = await this.prisma.users.findUnique({
      where: { s_no: payment.user_id },
      include: { city: true, state: true },
    });

    if (!user) {
      throw new NotFoundException('User not found for this payment');
    }

    const paymentData: Record<string, string> = {
      merchant_id: this.CCAVENUE_MERCHANT_ID,
      order_id: orderId,
      amount: payment.amount,
      currency: payment.currency,
      redirect_url: this.CCAVENUE_REDIRECT_URL,
      cancel_url: this.CCAVENUE_CANCEL_URL,
      language: 'EN',
      billing_name: (user.name || 'User').replace(/[^\x20-\x7E]/g, '').slice(0, 100) || 'User',
      billing_email: (user.email && user.email.includes('@') ? user.email : 'user@example.com').slice(0, 100),
      billing_tel: (user.phone || '9999999999').toString().replace(/\D/g, '').slice(0, 20) || '9999999999',
      billing_address: (user.address || 'Not Provided').toString().slice(0, 200),
      billing_city: (user.city?.name || 'Not Provided').toString().slice(0, 50),
      billing_state: (user.state?.name || 'Not Provided').toString().slice(0, 50),
      billing_zip: (user.pincode || '000000').toString().slice(0, 20),
      billing_country: 'India',
      merchant_param1: payment.subscription_id?.toString() || '',
      merchant_param2: payment.user_id.toString(),
      merchant_param3: payment.organization_id.toString(),
      merchant_param4: payment.plan_id.toString(),
    };

    // Map selected payment method to CCAvenue payment_option codes for pre-selection
    const paymentOptionMap: Record<string, string> = {
      upi: 'OPTUPI',
      card: 'OPTCRDC',
      netbanking: 'OPTNBK',
      wallet: 'OPTWLT',
    };
    const paymentOption = paymentMethod ? paymentOptionMap[paymentMethod.toLowerCase()] : '';
    if (paymentOption) {
      paymentData.payment_option = paymentOption;
    }

    const queryString = Object.entries(paymentData)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    const encryptedData = this.ccavEncrypt(queryString);
    const paymentUrl = `${this.CCAVENUE_PAYMENT_URL}&encRequest=${encryptedData}&access_code=${this.CCAVENUE_ACCESS_CODE}`;

    console.log('💳 Prepared payment URL:', {
      orderId,
      paymentMethod,
      paymentUrlLength: paymentUrl.length,
    });

    return ResponseUtil.success({
      payment_url: paymentUrl,
      order_id: orderId,
      payment_method: paymentMethod,
    }, 'Payment prepared successfully');
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

      const decryptedData = this.ccavDecrypt(encResponse);
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

      // Send subscription confirmation email on successful payment
      if (orderStatus === 'Success' && payment.subscription_id) {
        try {
          const subscriptionDetails = await this.prisma.user_subscriptions.findUnique({
            where: { s_no: payment.subscription_id },
            include: { subscription_plans: true },
          });

          if (subscriptionDetails) {
            const user = await this.prisma.users.findUnique({
              where: { s_no: payment.user_id },
              select: { name: true, email: true, phone: true },
            });

            await this.sendSubscriptionConfirmationEmail({
              name: user?.name || 'User',
              email: user?.email,
              phone: user?.phone,
              planName: subscriptionDetails.subscription_plans?.name || 'Selected Plan',
              amount: Number(payment.amount || 0),
              currency: payment.currency,
              startDate: subscriptionDetails.start_date,
              endDate: subscriptionDetails.end_date,
              orderId,
            });
          }
        } catch (error) {
          this.logger.error(
            `Failed to send subscription confirmation email for order ${orderId}: ${(error as Error).message}`,
          );
        }
      }

      return ResponseUtil.success({
        orderId,
        orderStatus,
        trackingId,
        message: statusMessage,
      }, orderStatus === 'Success' ? 'Payment successful' : 'Payment failed');
    } catch (error) {
      console.error('❌ Payment callback processing error:', error);
      throw error;
    }
  }

  /**
   * Send subscription purchase/activation confirmation email
   */
  private async sendSubscriptionConfirmationEmail(args: {
    name: string;
    email?: string | null;
    phone?: string | null;
    planName: string;
    amount: number;
    currency: string;
    startDate: Date;
    endDate: Date;
    orderId: string;
  }) {
    const { name, email, phone, planName, amount, currency, startDate, endDate, orderId } = args;

    const start = new Date(startDate).toLocaleDateString('en-IN');
    const end = new Date(endDate).toLocaleDateString('en-IN');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <div style="background: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">IPGM Subscription Confirmed</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px;">Hi ${name},</p>
          <p>Thank you for subscribing to IPGM. Your payment was successful and your subscription is now active.</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Plan</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${planName}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Amount Paid</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${currency} ${amount.toFixed(2)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Order ID</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${orderId}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Start Date</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${start}</td></tr>
            <tr><td style="padding: 8px; color: #6b7280;">End Date</td><td style="padding: 8px; font-weight: 600;">${end}</td></tr>
          </table>

          <p>You can continue using all the features of IPGM until the end date shown above.</p>
          <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">If you have any questions, please contact support.</p>
        </div>
      </div>
    `;

    if (email) {
      await this.emailService.sendMail({
        to: email,
        subject: 'IPGM Subscription Confirmation',
        html,
      });

      this.logger.log(`Subscription confirmation email sent to ${email} for order ${orderId}`);
      return;
    }

    // User has no email on record — notify owners directly
    const ownerHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <div style="background: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">IPGM Subscription Activated</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
          <p>A user's subscription was activated. The user does not have an email on record, so this notification is being sent to you.</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">User</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${name}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Phone</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${phone || 'N/A'}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Plan</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${planName}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Amount Paid</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${currency} ${amount.toFixed(2)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Order ID</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${orderId}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Start Date</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${start}</td></tr>
            <tr><td style="padding: 8px; color: #6b7280;">End Date</td><td style="padding: 8px; font-weight: 600;">${end}</td></tr>
          </table>
        </div>
      </div>
    `;

    await this.emailService.sendMail({
      to: OWNER_NOTIFICATION_EMAILS,
      subject: `IPGM Subscription Activated - ${name}`,
      html: ownerHtml,
    });

    this.logger.log(`Owner subscription activation notification sent for order ${orderId}`);
  }

  /**
   * Notify owners when a user initiates a subscription upgrade
   */
  private async sendUpgradeInitiatedNotification(args: {
    user: {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      pincode?: string | null;
      city?: { name?: string | null } | null;
      state?: { name?: string | null } | null;
    };
    orderId: string;
    organizationId: number;
    currentPlanName: string;
    newPlanName: string;
    amount: number;
    currency: string;
    currentEndDate: Date;
  }) {
    const { user, orderId, organizationId, currentPlanName, newPlanName, amount, currency, currentEndDate } = args;

    const endDate = new Date(currentEndDate).toLocaleDateString('en-IN');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <div style="background: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">Subscription Upgrade Attempted</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
          <p>A user has initiated a subscription upgrade. Details below:</p>

          <h3 style="margin-top: 24px; margin-bottom: 8px; color: #111827;">User Details</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Name</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${user.name || 'N/A'}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Email</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${user.email || 'N/A'}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Phone</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${user.phone || 'N/A'}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Address</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${[user.address, user.city?.name, user.state?.name, user.pincode].filter(Boolean).join(', ') || 'N/A'}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Organization ID</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${organizationId}</td></tr>
          </table>

          <h3 style="margin-top: 24px; margin-bottom: 8px; color: #111827;">Upgrade Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Order ID</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${orderId}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Current Plan</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${currentPlanName}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">New Plan</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${newPlanName}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Amount to Pay</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${currency} ${amount.toFixed(2)}</td></tr>
            <tr><td style="padding: 8px; color: #6b7280;">Current Plan Ends On</td><td style="padding: 8px; font-weight: 600;">${endDate}</td></tr>
          </table>

          <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">This is an automated notification. The user is being redirected to the payment gateway.</p>
        </div>
      </div>
    `;

    await this.emailService.sendMail({
      to: OWNER_NOTIFICATION_EMAILS,
      subject: `Subscription Upgrade Attempted - ${user.name || 'User'}`,
      html,
    });

    this.logger.log(`Upgrade initiated notification sent for order ${orderId}`);
  }
}
