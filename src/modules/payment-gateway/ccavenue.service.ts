import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface CCAvenuePaymentRequest {
  orderId: string;
  amount: string;
  currency: string;
  redirectUrl: string;
  cancelUrl: string;
  billingName: string;
  billingAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingZip?: string;
  billingCountry?: string;
  billingTel?: string;
  billingEmail?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  deliveryCountry?: string;
  deliveryTel?: string;
  merchantParam1?: string;
  merchantParam2?: string;
  merchantParam3?: string;
  merchantParam4?: string;
  merchantParam5?: string;
  promoCode?: string;
  customerIdentifier?: string;
}

export interface CCAvenuePaymentResponse {
  orderId: string;
  trackingId: string;
  bankRefNo: string;
  orderStatus: string;
  failureMessage?: string;
  paymentMode: string;
  cardName?: string;
  statusCode: string;
  statusMessage: string;
  currency: string;
  amount: string;
  billingName: string;
  billingAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingZip?: string;
  billingCountry?: string;
  billingTel?: string;
  billingEmail?: string;
}

@Injectable()
export class CCavenueService {
  private readonly logger = new Logger(CCavenueService.name);
  private readonly merchantId: string;
  private readonly accessCode: string;
  private readonly workingKey: string;
  private readonly ccavenueUrl: string;

  constructor(private configService: ConfigService) {
    this.merchantId = this.configService.get<string>('CCAVENUE_MERCHANT_ID');
    this.accessCode = this.configService.get<string>('CCAVENUE_ACCESS_CODE');
    this.workingKey = this.configService.get<string>('CCAVENUE_WORKING_KEY');
    this.ccavenueUrl = this.configService.get<string>('CCAVENUE_PAYMENT_URL') || 
                       'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction';
  }

  private getAESKey(): Buffer {
    const workingKey = (this.workingKey || '').trim();
    if (workingKey.length === 32 && /^[0-9a-fA-F]+$/.test(workingKey)) {
      this.logger.log('Using 32-char hex working key directly as AES key');
      return Buffer.from(workingKey, 'hex');
    }
    this.logger.log('Using MD5 of working key as AES key (legacy format)');
    return crypto.createHash('md5').update(workingKey).digest();
  }

  /**
   * Encrypt data using CCAvenue working key
   */
  encrypt(plainText: string): string {
    try {
      const key = this.getAESKey();
      const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
      const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
      let encoded = cipher.update(plainText, 'utf8', 'hex');
      encoded += cipher.final('hex');
      return encoded;
    } catch (error) {
      this.logger.error('Encryption error:', error);
      throw new Error('Failed to encrypt payment data');
    }
  }

  /**
   * Decrypt data received from CCAvenue
   */
  decrypt(encText: string): string {
    try {
      const key = this.getAESKey();
      const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      let decoded = decipher.update(encText, 'hex', 'utf8');
      decoded += decipher.final('utf8');
      return decoded;
    } catch (error) {
      this.logger.error('Decryption error:', error);
      throw new Error('Failed to decrypt payment response');
    }
  }

  /**
   * Generate encrypted payment request
   */
  generatePaymentRequest(paymentData: CCAvenuePaymentRequest): {
    encRequest: string;
    accessCode: string;
    ccavenueUrl: string;
  } {
    // Build payment parameters string
    const params = new URLSearchParams();
    params.append('merchant_id', this.merchantId);
    params.append('order_id', paymentData.orderId);
    params.append('amount', paymentData.amount);
    params.append('currency', paymentData.currency);
    params.append('redirect_url', paymentData.redirectUrl);
    params.append('cancel_url', paymentData.cancelUrl);
    params.append('language', 'EN');
    
    // Billing details
    params.append('billing_name', paymentData.billingName);
    if (paymentData.billingAddress) params.append('billing_address', paymentData.billingAddress);
    if (paymentData.billingCity) params.append('billing_city', paymentData.billingCity);
    if (paymentData.billingState) params.append('billing_state', paymentData.billingState);
    if (paymentData.billingZip) params.append('billing_zip', paymentData.billingZip);
    if (paymentData.billingCountry) params.append('billing_country', paymentData.billingCountry);
    if (paymentData.billingTel) params.append('billing_tel', paymentData.billingTel);
    if (paymentData.billingEmail) params.append('billing_email', paymentData.billingEmail);

    // Delivery details (optional)
    if (paymentData.deliveryName) params.append('delivery_name', paymentData.deliveryName);
    if (paymentData.deliveryAddress) params.append('delivery_address', paymentData.deliveryAddress);
    if (paymentData.deliveryCity) params.append('delivery_city', paymentData.deliveryCity);
    if (paymentData.deliveryState) params.append('delivery_state', paymentData.deliveryState);
    if (paymentData.deliveryZip) params.append('delivery_zip', paymentData.deliveryZip);
    if (paymentData.deliveryCountry) params.append('delivery_country', paymentData.deliveryCountry);
    if (paymentData.deliveryTel) params.append('delivery_tel', paymentData.deliveryTel);

    // Merchant parameters (for custom data)
    if (paymentData.merchantParam1) params.append('merchant_param1', paymentData.merchantParam1);
    if (paymentData.merchantParam2) params.append('merchant_param2', paymentData.merchantParam2);
    if (paymentData.merchantParam3) params.append('merchant_param3', paymentData.merchantParam3);
    if (paymentData.merchantParam4) params.append('merchant_param4', paymentData.merchantParam4);
    if (paymentData.merchantParam5) params.append('merchant_param5', paymentData.merchantParam5);

    if (paymentData.promoCode) params.append('promo_code', paymentData.promoCode);
    if (paymentData.customerIdentifier) params.append('customer_identifier', paymentData.customerIdentifier);

    const plainText = Array.from(params.keys())
      .map(key => `${key}=${params.get(key)}`)
      .join('&');
    this.logger.log(`Payment request for order ${paymentData.orderId}: ${paymentData.amount} ${paymentData.currency}`);

    const encRequest = this.encrypt(plainText);

    return {
      encRequest,
      accessCode: this.accessCode,
      ccavenueUrl: this.ccavenueUrl,
    };
  }

  /**
   * Parse encrypted payment response
   */
  parsePaymentResponse(encResponse: string): CCAvenuePaymentResponse {
    const decrypted = this.decrypt(encResponse);
    const params = new URLSearchParams(decrypted);

    const response: CCAvenuePaymentResponse = {
      orderId: params.get('order_id') || '',
      trackingId: params.get('tracking_id') || '',
      bankRefNo: params.get('bank_ref_no') || '',
      orderStatus: params.get('order_status') || '',
      failureMessage: params.get('failure_message') || undefined,
      paymentMode: params.get('payment_mode') || '',
      cardName: params.get('card_name') || undefined,
      statusCode: params.get('status_code') || '',
      statusMessage: params.get('status_message') || '',
      currency: params.get('currency') || '',
      amount: params.get('amount') || '',
      billingName: params.get('billing_name') || '',
      billingAddress: params.get('billing_address') || undefined,
      billingCity: params.get('billing_city') || undefined,
      billingState: params.get('billing_state') || undefined,
      billingZip: params.get('billing_zip') || undefined,
      billingCountry: params.get('billing_country') || undefined,
      billingTel: params.get('billing_tel') || undefined,
      billingEmail: params.get('billing_email') || undefined,
    };

    this.logger.log(`Payment response for order ${response.orderId}: ${response.orderStatus}`);
    return response;
  }

  /**
   * Check if payment was successful
   */
  isPaymentSuccessful(response: CCAvenuePaymentResponse): boolean {
    return response.orderStatus === 'Success';
  }

  /**
   * Get payment status description
   */
  getPaymentStatusDescription(response: CCAvenuePaymentResponse): string {
    switch (response.orderStatus) {
      case 'Success':
        return 'Payment successful';
      case 'Failure':
        return response.failureMessage || 'Payment failed';
      case 'Aborted':
        return 'Payment aborted by user';
      case 'Invalid':
        return 'Invalid payment request';
      default:
        return 'Unknown payment status';
    }
  }
}
