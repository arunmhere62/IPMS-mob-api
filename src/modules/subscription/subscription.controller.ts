import { Controller, Get, Post, Req, Res, Body, Query, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { IapService } from './iap.service';
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
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly iapService: IapService,
  ) {}

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
   * Prepare payment URL with selected payment method
   */
  @Post('payment/prepare')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Regenerate CCAvenue payment URL with selected payment method' })
  async preparePayment(@Body() body: { order_id: string; payment_method: string }) {
    const { order_id, payment_method } = body;

    console.log('📦 Prepare payment request:', { order_id, payment_method });

    return this.subscriptionService.preparePayment(order_id, payment_method);
  }

  @Get('payment/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fetch payment status for an order' })
  async getPaymentStatus(@Query('order_id') orderId: string) {
    console.log('📦 Payment status request:', { orderId });
    return this.subscriptionService.getPaymentStatus(orderId);
  }

  /**
   * Validate an Apple In-App Purchase receipt (StoreKit 2 JWS) and grant
   * subscription entitlement. iOS-only purchase path.
   *
   * App Store Guideline 3.1.1: paid digital subscriptions inside the iOS
   * app must be sold via Apple IAP. The client sends the signed transaction
   * token from StoreKit; the server verifies it with Apple's App Store
   * Server API and activates the subscription.
   */
  @Post('iap/validate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate Apple IAP receipt and activate subscription (iOS)' })
  async validateIapReceipt(
    @Req() req: RequestWithHeaders,
    @Body()
    body: {
      transactionToken: string;
      productId: string;
      transactionId?: string;
      originalTransactionId?: string;
    },
  ) {
    const userId = parseInt(headerToString(req.headers['x-user-id']), 10);
    const organizationId = parseInt(headerToString(req.headers['x-organization-id']), 10);

    if (!Number.isFinite(userId) || !Number.isFinite(organizationId)) {
      throw new BadRequestException('Missing user or organization id in request headers.');
    }

    const { transactionToken, productId, transactionId, originalTransactionId } = body;

    console.log('🍎 IAP validate request:', {
      userId,
      organizationId,
      productId,
      transactionId,
    });

    return this.iapService.validateReceiptAndGrantEntitlement({
      userId,
      organizationId,
      transactionToken,
      productId,
      transactionId,
      originalTransactionId,
    });
  }

  /**
   * App Store Server Notifications V2 endpoint.
   *
   * Apple calls this from its servers (NOT the app) to notify us of
   * subscription lifecycle events: renewals, expirations, refunds, billing
   * issues. The body is `{ signedPayload: '<JWS>' }`. We verify the JWS
   * signature with Apple's root CAs and update entitlement state.
   *
   * Configure this URL in App Store Connect → App → App Information →
   * App Store Server Notifications → Production/Sandbox URL:
   *   https://mobapi.indianpgmanagement.com/api/v1/subscription/iap/notifications
   * Version: V2.
   */
  @Post('iap/notifications')
  @ApiOperation({ summary: 'App Store Server Notifications V2 webhook (Apple → server)' })
  async appleServerNotification(@Body() body: { signedPayload?: string }) {
    const signedPayload = body?.signedPayload;
    if (!signedPayload) {
      throw new BadRequestException('Missing signedPayload.');
    }
    console.log('🍎 Apple S2S notification received');
    return this.iapService.handleServerNotification(signedPayload);
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
      const responseData = (result as { data?: { orderId?: string; orderStatus?: string } }).data;
      const orderId = responseData?.orderId ?? '';
      const paymentStatus = responseData?.orderStatus ?? 'Success';
      const mappedStatus = paymentStatus === 'Success' ? 'Success' : paymentStatus === 'Aborted' ? 'Aborted' : 'Failure';
      const deepLink = `pgapp://payment-result?orderId=${encodeURIComponent(orderId)}&status=${mappedStatus}`;
      console.log('💳 Payment callback done, redirecting to:', deepLink);
      return res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Complete</title>
  <style>
    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; text-align: center; }
    .container { padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 320px; }
    h2 { margin-top: 0; color: #333; }
    p { color: #666; }
    .btn { display: inline-block; margin-top: 16px; padding: 12px 24px; background: #3B82F6; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Payment ${mappedStatus === 'Success' ? 'Successful' : mappedStatus === 'Aborted' ? 'Cancelled' : 'Failed'}</h2>
    <p>Returning you to the app...</p>
    <a id="returnLink" class="btn" href="${deepLink}">Open App</a>
  </div>
  <script>
    // Ensure deep link navigation works in WebView
    setTimeout(() => {
      window.location.href = '${deepLink}';
    }, 500);
  </script>
</body>
</html>`);
    } catch (error) {
      console.error('❌ Payment callback error:', error);
      const deepLink = `pgapp://payment-result?status=Failure`;
      return this.sendRedirectHtml(res, deepLink, 'Failure');
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
  async paymentCancel(@Body() body: Record<string, unknown>, @Res() res: Response) {
    console.log('🚫 Payment cancelled by user');
    try {
      await this.subscriptionService.handlePaymentCancel(body);
    } catch (error) {
      console.error('❌ Payment cancel handling error:', error);
    }
    const deepLink = `pgapp://payment-result?status=Aborted`;
    return this.sendRedirectHtml(res, deepLink, 'Aborted');
  }

  @Get('payment/cancel')
  @ApiOperation({ summary: 'CCAvenue payment cancel (GET)' })
  async paymentCancelGet(@Query() query: Record<string, unknown>, @Res() res: Response) {
    console.log('🚫 Payment cancel GET');
    try {
      await this.subscriptionService.handlePaymentCancel({ encResp: query.encResp });
    } catch (error) {
      console.error('❌ Payment cancel GET handling error:', error);
    }
    const deepLink = `pgapp://payment-result?status=Aborted`;
    return this.sendRedirectHtml(res, deepLink, 'Aborted');
  }

  private sendRedirectHtml(res: Response, deepLink: string, status: string) {
    return res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Complete</title>
  <style>
    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; text-align: center; }
    .container { padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 320px; }
    h2 { margin-top: 0; color: #333; }
    p { color: #666; }
    .btn { display: inline-block; margin-top: 16px; padding: 12px 24px; background: #3B82F6; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Payment ${status === 'Success' ? 'Successful' : status === 'Aborted' ? 'Cancelled' : 'Failed'}</h2>
    <p>Returning you to the app...</p>
    <a id="returnLink" class="btn" href="${deepLink}">Open App</a>
  </div>
  <script>
    // Ensure deep link navigation works in WebView
    setTimeout(() => {
      window.location.href = '${deepLink}';
    }, 500);
  </script>
</body>
</html>`);
  }
}
