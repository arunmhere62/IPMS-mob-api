import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  HttpStatus,
  Logger,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CCavenueService } from './ccavenue.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentGatewayService } from './payment-gateway.service';

@ApiTags('payment-gateway')
@Controller('payment-gateway')
export class PaymentGatewayController {
  private readonly logger = new Logger(PaymentGatewayController.name);

  constructor(
    private readonly ccavenueService: CCavenueService,
    private readonly paymentGatewayService: PaymentGatewayService,
  ) {}

  /**
   * Initiate payment - Called from mobile app
   */
  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate subscription payment transaction' })
  async initiatePayment(
    @Body() initiatePaymentDto: InitiatePaymentDto,
    @Req() req: Request,
  ) {
    this.logger.log(`Initiating subscription payment for order: ${initiatePaymentDto.orderId}`);

    // Get user info from request (set by JWT guard)
    const userId = req.headers['x-user-id'] || 1; // Fallback for testing
    const organizationId = req.headers['x-organization-id'] || 1; // Fallback for testing

    // Save payment request to database
    const paymentRecord = await this.paymentGatewayService.createPaymentRecord({
      orderId: initiatePaymentDto.orderId,
      userId: parseInt(userId.toString()),
      organizationId: parseInt(organizationId.toString()),
      planId: initiatePaymentDto.planId,
      amount: initiatePaymentDto.amount,
      currency: initiatePaymentDto.currency,
      paymentType: initiatePaymentDto.paymentType,
      status: 'INITIATED',
      metadata: initiatePaymentDto.metadata as Prisma.InputJsonValue,
    });

    // Generate encrypted payment request
    const paymentRequest = this.ccavenueService.generatePaymentRequest({
      orderId: initiatePaymentDto.orderId,
      amount: initiatePaymentDto.amount,
      currency: initiatePaymentDto.currency,
      redirectUrl: initiatePaymentDto.redirectUrl,
      cancelUrl: initiatePaymentDto.cancelUrl,
      billingName: initiatePaymentDto.billingName,
      billingAddress: initiatePaymentDto.billingAddress,
      billingCity: initiatePaymentDto.billingCity,
      billingState: initiatePaymentDto.billingState,
      billingZip: initiatePaymentDto.billingZip,
      billingCountry: initiatePaymentDto.billingCountry || 'India',
      billingTel: initiatePaymentDto.billingTel,
      billingEmail: initiatePaymentDto.billingEmail,
      merchantParam1: userId.toString(),
      merchantParam2: organizationId.toString(),
      merchantParam3: initiatePaymentDto.paymentType,
    });

    return {
      success: true,
      paymentId: paymentRecord.s_no,
      paymentUrl: paymentRequest.ccavenueUrl,
      encRequest: paymentRequest.encRequest,
      accessCode: paymentRequest.accessCode,
    };
  }

  /**
   * Payment callback - Called by CCAvenue after payment
   */
  @Post('callback')
  @ApiOperation({ summary: 'Payment callback from CCAvenue' })
  async paymentCallback(
    @Body('encResp') encResp: string,
    @Res() res: Response,
  ) {
    try {
      this.logger.log('Received payment callback from CCAvenue');

      // Decrypt response
      const paymentResponse = this.ccavenueService.parsePaymentResponse(encResp);
      
      this.logger.log(`Payment callback for order ${paymentResponse.orderId}: ${paymentResponse.orderStatus}`);

      // Update payment record in database
      const statusMap: Record<string, 'INITIATED' | 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'PENDING'> = {
        'Success': 'SUCCESS',
        'Failure': 'FAILURE',
        'Aborted': 'ABORTED',
        'Invalid': 'FAILURE',
      };
      
      const mappedStatus = statusMap[paymentResponse.orderStatus] || 'PENDING';

      await this.paymentGatewayService.updatePaymentRecord(
        paymentResponse.orderId,
        {
          status: mappedStatus,
          trackingId: paymentResponse.trackingId,
          bankRefNo: paymentResponse.bankRefNo,
          paymentMode: paymentResponse.paymentMode,
          statusCode: paymentResponse.statusCode,
          statusMessage: paymentResponse.statusMessage,
          failureMessage: paymentResponse.failureMessage,
          responseData: JSON.parse(JSON.stringify(paymentResponse)),
        },
      );

      // If payment successful, process the payment (update tenant payment records)
      if (this.ccavenueService.isPaymentSuccessful(paymentResponse)) {
        await this.paymentGatewayService.processSuccessfulPayment(paymentResponse);
      }

      // Redirect to mobile app with deep link
      const deepLink = `pgapp://payment-result?orderId=${paymentResponse.orderId}&status=${paymentResponse.orderStatus}`;
      
      return res.redirect(deepLink);
    } catch (error) {
      this.logger.error('Payment callback error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to process payment callback',
      });
    }
  }

  /**
   * Get payment status - Called from mobile app to verify payment
   */
  @Get('status/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment status by order ID' })
  async getPaymentStatus(@Query('orderId') orderId: string) {
    return this.paymentGatewayService.getPaymentStatus(orderId);
  }

  /**
   * Test endpoint to generate payment page HTML (for testing)
   */
  @Get('test-payment-page')
  @ApiOperation({ summary: 'Generate test payment page HTML' })
  testPaymentPage(
    @Query('encRequest') encRequest: string,
    @Query('accessCode') accessCode: string,
    @Res() res: Response,
  ) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Processing Payment...</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .loader {
            text-align: center;
          }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="loader">
          <div class="spinner"></div>
          <p>Redirecting to payment gateway...</p>
        </div>
        <form id="paymentForm" method="post" action="https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction">
          <input type="hidden" name="encRequest" value="${encRequest}">
          <input type="hidden" name="access_code" value="${accessCode}">
        </form>
        <script>
          document.getElementById('paymentForm').submit();
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }
}
