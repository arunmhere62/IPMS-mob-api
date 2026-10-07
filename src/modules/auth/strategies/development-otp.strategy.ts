/**
 * Development OTP Strategy
 * Allows bypass OTP (5555) for testing
 * Skips SMS delivery in development
 */

import { Injectable, Logger } from '@nestjs/common';
import { OtpStrategy } from './otp-strategy.interface';
import { SmsService } from '../sms.service';

@Injectable()
export class DevelopmentOtpStrategy implements OtpStrategy {
  private readonly logger = new Logger(DevelopmentOtpStrategy.name);
  private readonly BYPASS_OTP = '5555'; // Development bypass OTP

  constructor(private readonly smsService: SmsService) {}

  async sendOtp(phoneNumber: string, _otp: string): Promise<boolean> {
    this.logger.warn(`[DEVELOPMENT] Sending OTP to ${phoneNumber}`);
    this.logger.warn(`[DEVELOPMENT] SMS API skipped - Development mode`);
    
    // Skip SMS API call entirely in development to prevent timeouts
    return true;
  }

  verifyOtp(phoneNumber: string, otp: string, storedOtp: string): boolean {
    this.logger.warn(`[DEVELOPMENT] Verifying OTP for ${phoneNumber}`);

    // Accept bypass OTP (5555) or the actual generated OTP
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
