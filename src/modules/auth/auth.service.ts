import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsService } from './sms.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { normalizePhoneNumber } from '../../common/utils/phone.utils';

interface OtpStore {
  otp: string;
  expiresAt: Date;
  attempts: number;
}

@Injectable()
export class AuthService {
  // In-memory OTP storage (for production, use Redis or database)
  private otpStore: Map<string, OtpStore> = new Map();
  private readonly OTP_EXPIRY_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;

  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
  ) {}

  /**
   * Generate a 4-digit OTP
   */
  private generateOtp(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Send OTP to user's phone (for login - user must exist)
   */
  async sendOtp(sendOtpDto: SendOtpDto) {
    const { phone } = sendOtpDto;
    
    // Normalize phone number (remove spaces)
    const normalizedPhone = normalizePhoneNumber(phone);

    // Check if user exists with this phone number
    const user = await this.prisma.users.findFirst({
      where: {
        phone: normalizedPhone,
        is_deleted: false,
        status: 'ACTIVE',
      },
      select: {
        s_no: true,
        name: true,
        email: true,
        phone: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found with this phone number');
    }

    return this.generateAndSendOtp(normalizedPhone);
  }

  /**
   * Send OTP for signup (user doesn't need to exist yet)
   */
  async sendSignupOtp(sendOtpDto: SendOtpDto) {
    const { phone } = sendOtpDto;
    const normalizedPhone = normalizePhoneNumber(phone);
    return this.generateAndSendOtp(normalizedPhone);
  }

  /**
   * Generate and send OTP via SMS
   */
  private async generateAndSendOtp(phone: string) {
    // Generate OTP
    const otp = this.generateOtp();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

    // Store OTP
    this.otpStore.set(phone, {
      otp,
      expiresAt,
      attempts: 0,
    });

    // Send OTP via SMS
    const smsSent = await this.smsService.sendOtp(phone, otp);

    if (!smsSent) {
      throw new BadRequestException('Failed to send OTP. Please try again.');
    }

    return {
      success: true,
      message: 'OTP sent successfully',
      data: {
        phone,
        expiresIn: `${this.OTP_EXPIRY_MINUTES} minutes`,
      },
    };
  }

  /**
   * Verify OTP and login user (for login flow)
   */
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { phone, otp } = verifyOtpDto;
    
    // Normalize phone number (remove spaces)
    const normalizedPhone = normalizePhoneNumber(phone);

    // Verify OTP validity
    const isValidOtp = this.validateOtp(normalizedPhone, otp);
    if (!isValidOtp) {
      return isValidOtp; // Returns error response
    }

    // OTP is valid, remove from store
    this.otpStore.delete(normalizedPhone);

    // Get user details
    const user = await this.prisma.users.findFirst({
      where: {
        phone: normalizedPhone,
        is_deleted: false,
        status: 'ACTIVE',
      },
      select: {
        s_no: true,
        name: true,
        email: true,
        phone: true,
        role_id: true,
        organization_id: true,
        status: true,
        address: true,
        city_id: true,
        state_id: true,
        gender: true,
        roles: {
          select: {
            s_no: true,
            role_name: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user is superadmin
    const isSuperAdmin = user.roles.role_name === 'SUPER_ADMIN' || 
                         user.roles.role_name.toLowerCase() === 'super_admin' ||
                         user.roles.role_name.toLowerCase() === 'superadmin';

    // Build user response object
    const userResponse: any = {
      s_no: user.s_no,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role_id: user.role_id,
      role_name: user.roles.role_name,
      status: user.status,
      address: user.address,
      city_id: user.city_id,
      state_id: user.state_id,
      gender: user.gender,
    };

    // Add organization details only if not superadmin
    if (!isSuperAdmin && user.organization_id) {
      // Fetch organization details
      const organization = await this.prisma.organization.findUnique({
        where: { s_no: user.organization_id },
        select: { s_no: true, name: true },
      });

      userResponse.organization_id = user.organization_id;
      userResponse.organization_name = organization?.name;
    }

    // In production, generate JWT token here
    // For now, returning user data
    return {
      success: true,
      message: 'Login successful',
      user: userResponse,
      // TODO: Add JWT token generation
      // token: 'jwt_token_here'
    };
  }

  /**
   * Verify OTP for signup (doesn't require user to exist)
   */
  async verifySignupOtp(verifyOtpDto: VerifyOtpDto) {
    const { phone, otp } = verifyOtpDto;

    // Validate OTP (will throw if invalid)
    this.validateOtp(phone, otp);

    // OTP is valid, remove from store
    this.otpStore.delete(phone);

    return {
      success: true,
      message: 'Phone number verified successfully',
      data: {
        phone,
        verified: true,
      },
    };
  }

  /**
   * Validate OTP without throwing errors
   */
  private validateOtp(phone: string, otp: string) {
    // Get stored OTP
    const storedOtp = this.otpStore.get(phone);

    if (!storedOtp) {
      throw new UnauthorizedException('OTP not found or expired. Please request a new OTP.');
    }

    // Check if OTP is expired
    if (new Date() > storedOtp.expiresAt) {
      this.otpStore.delete(phone);
      throw new UnauthorizedException('OTP has expired. Please request a new OTP.');
    }

    // Check attempts
    if (storedOtp.attempts >= this.MAX_ATTEMPTS) {
      this.otpStore.delete(phone);
      throw new UnauthorizedException(
        'Maximum verification attempts exceeded. Please request a new OTP.',
      );
    }

    // Verify OTP
    if (storedOtp.otp !== otp) {
      storedOtp.attempts += 1;
      this.otpStore.set(phone, storedOtp);
      throw new UnauthorizedException(
        `Invalid OTP. ${this.MAX_ATTEMPTS - storedOtp.attempts} attempts remaining.`,
      );
    }

    return { success: true };
  }

  /**
   * Resend OTP
   */
  async resendOtp(sendOtpDto: SendOtpDto) {
    // Delete existing OTP
    this.otpStore.delete(sendOtpDto.phone);

    // Send new OTP
    return this.sendOtp(sendOtpDto);
  }

  /**
   * Clean up expired OTPs (call this periodically)
   */
  cleanupExpiredOtps() {
    const now = new Date();
    for (const [phone, otpData] of this.otpStore.entries()) {
      if (now > otpData.expiresAt) {
        this.otpStore.delete(phone);
      }
    }
  }
}
