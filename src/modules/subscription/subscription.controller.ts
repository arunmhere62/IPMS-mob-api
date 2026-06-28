import { Controller, Get, Post, Req, Res, Body, Query } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { ResponseUtil } from '../../common/utils/response.util';

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
  user?: Record<string, unknown>;
};

const headerToString = (v: string | string[] | undefined): string => {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
};

const toIntOrNaN = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseInt(String(v || ''), 10);
  return Number.isFinite(n) ? n : Number.NaN;
};

@ApiTags('subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * Get all active subscription plans (Public - No auth required)
   */
  @Get('plans')
  @ApiOperation({ summary: 'Get all active subscription plans' })
  async getPlans() {
    console.log('📋 Fetching subscription plans...');
    return await this.subscriptionService.getActivePlans();
  }

  /**
   * Get current organization's active subscription
   */
  @Get('current')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current organization active subscription' })
  async getCurrentSubscription(@Req() req: RequestWithHeaders) {
    const userId = parseInt(headerToString(req.headers['x-user-id']), 10);
    const organizationId = parseInt(headerToString(req.headers['x-organization-id']), 10);

    const subscription = await this.subscriptionService.getCurrentSubscription(
      userId,
      organizationId,
    );

    return ResponseUtil.success(subscription, 'Current organization subscription fetched successfully');
  }

  /**
   * Check subscription status
   */
  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if organization has active subscription' })
  async checkStatus(@Req() req: RequestWithHeaders) {
    const headerUserId = parseInt(headerToString(req.headers['x-user-id']), 10);
    const headerOrgId = parseInt(headerToString(req.headers['x-organization-id']), 10);
    const userId = Number.isFinite(headerUserId) ? headerUserId : toIntOrNaN(req.user?.userId);
    const organizationId = Number.isFinite(headerOrgId) ? headerOrgId : toIntOrNaN(req.user?.organizationId);

    if (!userId || !organizationId) {
      console.log('⚠️ Missing user info - userId:', userId, 'orgId:', organizationId);
      return ResponseUtil.success(
        {
          has_active_subscription: false,
          subscription: null,
          days_remaining: 0,
          is_trial: false,
        },
        'Subscription status checked successfully',
      );
    }

    console.log('✅ Checking subscription for org:', organizationId, 'requestedByUser:', userId);

    return this.subscriptionService.checkSubscriptionStatus(userId, organizationId);
  }

  /**
   * Get all organization subscriptions (history)
   */
  @Get('history')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get organization subscription history' })
  async getHistory(
    @Req() req: RequestWithHeaders,
  ) {
    const userId = parseInt(headerToString(req.headers['x-user-id']), 10);
    const organizationId = parseInt(headerToString(req.headers['x-organization-id']), 10);

    return this.subscriptionService.getUserSubscriptionsAll(userId, organizationId);
  }

  /**
   * Subscribe to a plan
   */
  @Post('subscribe')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subscribe to a plan' })
  async subscribe(@Req() req: RequestWithHeaders, @Body() body: { plan_id: number }) {
    const userId = parseInt(headerToString(req.headers['x-user-id']), 10);
    const organizationId = parseInt(headerToString(req.headers['x-organization-id']), 10);
    const { plan_id } = body;

    console.log('📦 Subscribe request:', { userId, organizationId, plan_id });

    const result = await this.subscriptionService.initiateSubscription(
      userId,
      organizationId,
      plan_id,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Upgrade active subscription to a new plan
   */
  @Post('upgrade')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upgrade active subscription to a new plan' })
  async upgrade(@Req() req: RequestWithHeaders, @Body() body: { plan_id: number }) {
    const userId = parseInt(headerToString(req.headers['x-user-id']), 10);
    const organizationId = parseInt(headerToString(req.headers['x-organization-id']), 10);
    const { plan_id } = body;

    console.log('📦 Upgrade request:', { userId, organizationId, plan_id });

    const result = await this.subscriptionService.initiateUpgrade(
      userId,
      organizationId,
      plan_id,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Test CCAvenue configuration
   */
  @Get('test-ccavenue')
  @ApiOperation({ summary: 'Test CCAvenue configuration' })
  async testCCAvenue() {
    return this.subscriptionService.testCCAvenueConfig();
  }

  /**
   * Manual payment verification (for testing/debugging)
   */
  @Post('payment/verify-manual')
  @ApiOperation({ summary: 'Manually verify and activate payment' })
  async verifyManualPayment(@Body() body: { order_id: string; upi_transaction_id?: string }) {
    const result = await this.subscriptionService.manuallyActivateSubscription(
      body.order_id,
      body.upi_transaction_id,
    );
    return ResponseUtil.success(result, 'Subscription activated successfully');
  }

  /**
   * Payment callback - Success (POST) - called by CCAvenue after payment
   */
  @Post('payment/callback')
  @ApiOperation({ summary: 'CCAvenue payment callback' })
  async paymentCallback(@Body() body: Record<string, unknown>, @Res() res: Response) {
    console.log('💳 Payment callback received');
    try {
      const result = await this.subscriptionService.handlePaymentCallback(body);
      const orderId = (result as any)?.data?.orderId ?? '';
      const paymentStatus = (result as any)?.data?.orderStatus ?? 'Success';
      const mappedStatus = paymentStatus === 'Success' ? 'Success' : paymentStatus === 'Aborted' ? 'Aborted' : 'Failure';
      const deepLink = `pgapp://payment-result?orderId=${encodeURIComponent(orderId)}&status=${mappedStatus}`;
      console.log('💳 Payment callback done, redirecting to:', deepLink);
      return res.redirect(302, deepLink);
    } catch (error) {
      console.error('❌ Payment callback error:', error);
      const deepLink = `pgapp://payment-result?status=Failure`;
      return res.redirect(302, deepLink);
    }
  }

  /**
   * Payment callback - GET (for CCAvenue redirect)
   */
  @Get('payment/callback')
  @ApiOperation({ summary: 'CCAvenue payment callback (GET)' })
  async paymentCallbackGet(@Query() query: Record<string, unknown>, @Res() res: Response) {
    console.log('💳 Payment callback GET received');
    return this.paymentCallback({ encResp: query.encResp }, res);
  }

  /**
   * Payment cancel - called by CCAvenue when user cancels
   */
  @Post('payment/cancel')
  @ApiOperation({ summary: 'CCAvenue payment cancel' })
  async paymentCancel(@Body() _body: Record<string, unknown>, @Res() res: Response) {
    console.log('🚫 Payment cancelled by user');
    const deepLink = `pgapp://payment-result?status=Aborted`;
    return res.redirect(302, deepLink);
  }

  @Get('payment/cancel')
  @ApiOperation({ summary: 'CCAvenue payment cancel (GET)' })
  async paymentCancelGet(@Res() res: Response) {
    console.log('🚫 Payment cancel GET');
    const deepLink = `pgapp://payment-result?status=Aborted`;
    return res.redirect(302, deepLink);
  }
}
