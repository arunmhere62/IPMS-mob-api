/**
 * Development OTP Strategy
 * Allows bypass OTP (12345) for testing
 * Also sends real SMS for testing actual flow
 */

import { Injectable, Logger } from '@nestjs/common';
import { OtpStrategy } from './otp-strategy.interface';
import { SmsService } from '../sms.service';

@Injectable()
export class DevelopmentOtpStrategy implements OtpStrategy {
  private readonly logger = new Logger(DevelopmentOtpStrategy.name);
  private readonly BYPASS_OTP = '1234'; // Development bypass OTP

  constructor(private readonly smsService: SmsService) {}

  async sendOtp(phoneNumber: string, otp: string): Promise<boolean> {
    this.logger.warn(`[DEVELOPMENT] Sending OTP to ${phoneNumber}`);
    this.logger.warn(`[DEVELOPMENT] Generated OTP: ${otp}`);
    this.logger.warn(`[DEVELOPMENT] Bypass OTP: ${this.BYPASS_OTP}`);
    this.logger.warn(`[DEVELOPMENT] SMS API skipped - Development mode`);
    
    // Skip SMS API call entirely in development to prevent timeouts
    return true;
  }

  verifyOtp(phoneNumber: string, otp: string, storedOtp: string): boolean {
    this.logger.warn(`[DEVELOPMENT] Verifying OTP for ${phoneNumber}`);
    this.logger.warn(`[DEVELOPMENT] Provided OTP: ${otp}`);
    this.logger.warn(`[DEVELOPMENT] Stored OTP: ${storedOtp}`);
    this.logger.warn(`[DEVELOPMENT] Bypass OTP: ${this.BYPASS_OTP}`);

    // Accept bypass OTP (12345) OR the actual generated OTP
    if (otp === this.BYPASS_OTP) {
      this.logger.warn(`[DEVELOPMENT] ✅ Bypass OTP used - Login allowed`);
      return true;
    }

    if (otp === storedOtp) {
      this.logger.warn(`[DEVELOPMENT] ✅ Correct OTP provided`);
      return true;
    }

    this.logger.warn(`[DEVELOPMENT] ❌ Invalid OTP`);
    return false;
  }

  getStrategyName(): string {
    return 'Development';
  }
}
