import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly smsApiUrl: string;
  private readonly smsUser: string;
  private readonly smsPassword: string;
  private readonly smsSenderId: string;
  private readonly smsChannel: string;
  private readonly smsRoute: string;

  constructor(private configService: ConfigService) {
    // SMS API Configuration - Hardcoded values
    this.smsApiUrl = 'http://cannyinfotech.in/api/mt/SendSMS';
    this.smsUser = 'SATZTECHNOSOLUTIONS';
    this.smsPassword = 'demo1234';
    this.smsSenderId = 'SATZTH';
    this.smsChannel = 'Trans';
    this.smsRoute = '10';
  }

  /**
   * Send OTP via SMS
   */
  async sendOtp(phoneNumber: string, otp: string): Promise<boolean> {
    try {
      const message = `Your OTP number for registration is ${otp}. Please verify your OTP - SATZ/TNYADAVS.COM`;

      const normalizedNumber = String(phoneNumber || '').replace(/[^0-9]/g, '');
      if (!normalizedNumber) {
        this.logger.error(`Invalid phone number for SMS provider: "${phoneNumber}"`);
        return false;
      }

      const url = new URL(this.smsApiUrl);
      url.searchParams.append('user', this.smsUser);
      url.searchParams.append('password', this.smsPassword);
      url.searchParams.append('senderid', this.smsSenderId);
      url.searchParams.append('channel', this.smsChannel);
      url.searchParams.append('DCS', '0');
      url.searchParams.append('flashsms', '0');
      url.searchParams.append('number', normalizedNumber);
      url.searchParams.append('text', message);
      url.searchParams.append('route', this.smsRoute);

      this.logger.log(`Sending OTP to ${normalizedNumber}`);

      const response = await fetch(url.toString());
      const result = await response.text();

      this.logger.log(`SMS API Response: ${result}`);

      // Check if SMS was sent successfully
      const resultLower = String(result || '').toLowerCase();
      const hasExplicitSuccessErrorCode = /error\s*[:=]\s*0\b/.test(resultLower);
      const hasExplicitFailureErrorCode = /error\s*[:=]\s*[1-9][0-9]*\b/.test(resultLower);

      const looksLikeError =
        hasExplicitFailureErrorCode ||
        (!hasExplicitSuccessErrorCode &&
          (resultLower.includes('invalid') ||
            resultLower.includes('failed') ||
            resultLower.includes('unauthor') ||
            resultLower.includes('incorrect')));

      if (response.ok && !looksLikeError) {
        this.logger.log(`OTP sent successfully to ${normalizedNumber}`);
        return true;
      } else {
        this.logger.error(`Failed to send OTP to ${normalizedNumber}: ${result}`);
        return false;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error sending OTP: ${msg}`);
      return false;
    }
  }

  /**
   * Send custom SMS message
   */
  async sendSms(phoneNumber: string, message: string): Promise<boolean> {
    try {
      const normalizedNumber = String(phoneNumber || '').replace(/[^0-9]/g, '');
      if (!normalizedNumber) {
        this.logger.error(`Invalid phone number for SMS provider: "${phoneNumber}"`);
        return false;
      }

      const url = new URL(this.smsApiUrl);
      url.searchParams.append('user', this.smsUser);
      url.searchParams.append('password', this.smsPassword);
      url.searchParams.append('senderid', this.smsSenderId);
      url.searchParams.append('channel', this.smsChannel);
      url.searchParams.append('DCS', '0');
      url.searchParams.append('flashsms', '0');
      url.searchParams.append('number', normalizedNumber);
      url.searchParams.append('text', message);
      url.searchParams.append('route', this.smsRoute);

      const response = await fetch(url.toString());
      const result = await response.text();

      this.logger.log(`SMS sent to ${normalizedNumber}: ${result}`);

      return response.ok;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error sending SMS: ${msg}`);
      return false;
    }
  }
}
