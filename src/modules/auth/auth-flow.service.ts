import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhoneNumber } from '../../common/utils/phone.utils';
import { ResponseUtil } from '../../common/utils/response.util';
import { AuthDbService } from './auth-db.service';
import { JwtTokenService } from './jwt.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActionType } from '../activity-logs/dto/log-activity.dto';

export type AuthFlow = 'LOGIN' | 'SIGNUP';

@Injectable()
export class AuthFlowService {
  private readonly SETUP_TOKEN_EXPIRY = '15m';

  constructor(
    private readonly authDbService: AuthDbService,
    private readonly jwtService: JwtService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  /**
   * Unified OTP send.
   * - Existing active user => login OTP flow.
   * - New phone number => signup OTP flow.
   */
  async sendOtp(dto: SendOtpDto, ipAddress?: string, userAgent?: string) {
    const normalizedPhone = normalizePhoneNumber(dto.phone);

    const existingUser = await this.prisma.users.findFirst({
      where: {
        phone: normalizedPhone,
        is_deleted: false,
        status: 'ACTIVE',
      },
      select: { s_no: true },
    });

    if (existingUser) {
      await this.authDbService.sendOtp({ phone: normalizedPhone }, ipAddress, userAgent);
      return {
        phone: normalizedPhone,
        flow: 'LOGIN' as AuthFlow,
        expiresIn: this.getOtpExpiryMinutes(),
      };
    }

    await this.authDbService.sendSignupOtp({ phone: normalizedPhone }, ipAddress, userAgent);
    return {
      phone: normalizedPhone,
      flow: 'SIGNUP' as AuthFlow,
      expiresIn: this.getOtpExpiryMinutes(),
    };
  }

  /**
   * Unified OTP verify.
   * - Existing user => returns full login response (user + tokens).
   * - New user => returns a short-lived setup token to continue signup.
   */
  async verifyOtp(dto: VerifyOtpDto, ipAddress?: string, userAgent?: string) {
    const normalizedPhone = normalizePhoneNumber(dto.phone);

    const existingUser = await this.prisma.users.findFirst({
      where: {
        phone: normalizedPhone,
        is_deleted: false,
        status: 'ACTIVE',
      },
      select: { s_no: true },
    });

    if (existingUser) {
      return this.authDbService.verifyOtp(
        { phone: normalizedPhone, otp: dto.otp },
        ipAddress,
        userAgent,
      );
    }

    await this.authDbService.verifySignupOtp({ phone: normalizedPhone, otp: dto.otp });

    const setupToken = this.generateSetupToken(normalizedPhone);

    return ResponseUtil.success(
      {
        flow: 'SIGNUP',
        setupToken,
        phone: normalizedPhone,
      },
      'Phone number verified. Please complete your account setup.',
    );
  }

  /**
   * Create the organization/user/PG and immediately log the user in.
   */
  async setupAndLogin(dto: SignupDto, setupToken: string, ipAddress?: string, userAgent?: string) {
    const tokenPhone = this.verifySetupToken(setupToken);
    const normalizedPhone = normalizePhoneNumber(dto.phone || tokenPhone);

    if (normalizedPhone !== tokenPhone) {
      throw new BadRequestException('Phone number does not match the verified number.');
    }

    const existingUser = await this.prisma.users.findFirst({
      where: {
        phone: normalizedPhone,
        is_deleted: false,
        status: 'ACTIVE',
      },
      select: { s_no: true },
    });

    if (existingUser) {
      throw new BadRequestException('Account already exists. Please login.');
    }

    // Create account (organization + user + PG + subscription)
    const account = await this.authDbService.createAccount({
      ...dto,
      phone: normalizedPhone,
    });

    // Fetch the newly created user with role details
    const user = await this.prisma.users.findUnique({
      where: { s_no: account.userId },
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
      throw new NotFoundException('User not found after account creation.');
    }

    await this.authDbService.validateOrganizationActive(user.organization_id, user.roles?.role_name);

    const userResponse: Record<string, unknown> = {
      s_no: user.s_no,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role_id: user.role_id,
      role_name: user.roles.role_name,
      organization_id: user.organization_id,
      status: user.status,
      address: user.address,
      city_id: user.city_id,
      state_id: user.state_id,
      gender: user.gender,
    };

    if (user.organization_id) {
      const organization = await this.prisma.organization.findUnique({
        where: { s_no: user.organization_id },
        select: { s_no: true, name: true },
      });
      userResponse.organization_name = organization?.name;
    }

    const tokens = await this.jwtTokenService.generateTokens(user, ipAddress, userAgent);

    // Log LOGIN activity (non-blocking)
    this.activityLogsService
      .logActivity({
        action_type: 'LOGIN' as ActionType,
        user_id: user.s_no,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .catch((): void => undefined);

    return ResponseUtil.success(
      {
        user: userResponse,
        pgId: account.pgId,
        ...tokens,
      },
      'Account created and logged in successfully.',
    );
  }

  private generateSetupToken(phone: string): string {
    const secret = this.configService.get<string>('jwt.secret');
    if (!secret) {
      throw new UnauthorizedException('JWT secret is not configured');
    }
    return this.jwtService.sign(
      { phone, scope: 'setup' },
      { secret, expiresIn: this.SETUP_TOKEN_EXPIRY },
    );
  }

  private verifySetupToken(token: string): string {
    const secret = this.configService.get<string>('jwt.secret');
    if (!secret) {
      throw new UnauthorizedException('JWT secret is not configured');
    }
    try {
      const payload = this.jwtService.verify<{ phone: string; scope?: string }>(token, { secret });
      if (payload.scope !== 'setup' || !payload.phone) {
        throw new UnauthorizedException('Invalid setup token');
      }
      return normalizePhoneNumber(payload.phone);
    } catch {
      throw new UnauthorizedException('Invalid or expired setup token');
    }
  }

  private getOtpExpiryMinutes(): string {
    return `${this.configService.get<number>('app.auth.otpExpiryMinutes', 5)} minutes`;
  }
}
