import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantSendOtpDto } from './dto/tenant-send-otp.dto';
import { TenantVerifyOtpDto } from './dto/tenant-verify-otp.dto';
import { UserRole } from '../../../common/enums/user-role.enum';
import { PrismaService } from '@/prisma/prisma.service';
import { OtpStrategyFactory } from '../../auth/strategies/otp-strategy.factory';

@Injectable()
export class TenantAuthService {
  private readonly logger = new Logger(TenantAuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private otpStrategyFactory: OtpStrategyFactory,
  ) {}

  async sendOtp(dto: TenantSendOtpDto) {
    const { phone } = dto;

    // Normalize phone by removing spaces for database search
    const normalizedPhone = phone.replace(/\s/g, '');

    // Find tenant by phone
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        phone_no: normalizedPhone,
        is_deleted: false,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        'No tenant account found with this phone number. Please contact your PG owner.',
      );
    }

    // Check if tenant status is ACTIVE
    if (tenant.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Your account is ${tenant.status}. Please contact your PG owner.`,
      );
    }

    // Check if portal access is enabled (if you add this field)
    // if (!tenant.is_portal_enabled) {
    //   throw new BadRequestException(
    //     'Portal access is not enabled for your account. Please contact your PG owner.',
    //   );
    // }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Store OTP in database with normalized phone
    await this.prisma.otp_verifications.create({
      data: {
        phone: normalizedPhone,
        otp,
        expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        is_verified: false,
        attempts: 0,
      },
    });

    // Dispatch via strategy: dev skips SMS + allows bypass 5555, prod sends real SMS
    const strategy = this.otpStrategyFactory.getStrategy();
    const smsSent = await strategy.sendOtp(normalizedPhone, otp);
    this.logger.log(`[TenantAuth] OTP dispatch via ${strategy.getStrategyName()} strategy, sent=${smsSent}`);

    return {
      success: true,
      message: 'OTP sent successfully to your registered phone number',
      data: {
        phone,
        expiresIn: 600, // seconds
      },
    };
  }

  async verifyOtp(dto: TenantVerifyOtpDto, deviceInfo?: string, ipAddress?: string) {
    const { phone, otp } = dto;

    // Normalize phone by removing spaces for database search
    const normalizedPhone = phone.replace(/\s/g, '');

    // Verify OTP using normalized phone
    // Fetch the latest unverified OTP record (strategy may allow bypass OTP)
    const otpRecord = await this.prisma.otp_verifications.findFirst({
      where: {
        phone: normalizedPhone,
        is_verified: false,
        expires_at: { gte: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!otpRecord) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Strategy handles bypass (5555 in dev) or exact match (prod)
    const strategy = this.otpStrategyFactory.getStrategy();
    const isValid = strategy.verifyOtp(normalizedPhone, otp, otpRecord.otp);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Mark OTP as verified
    await this.prisma.otp_verifications.update({
      where: { s_no: otpRecord.s_no },
      data: { is_verified: true },
    });

    // Get tenant details with PG info
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        phone_no: normalizedPhone,
        is_deleted: false,
        status: 'ACTIVE',
      },
      include: {
        pg_locations: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant account not found');
    }

    // Generate JWT token
    const payload = {
      sub: tenant.s_no,
      tenantId: tenant.s_no,
      phone: tenant.phone_no,
      role: UserRole.TENANT,
      pgId: tenant.pg_id,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '30d' });

    // Store refresh token in database
    await this.prisma.tenant_tokens.create({
      data: {
        tenant_id: tenant.s_no,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        refresh_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        is_revoked: false,
        device_info: deviceInfo || null,
        ip_address: ipAddress || null,
      },
    });

    return {
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        tenant: {
          tenant_id: tenant.s_no,
          name: tenant.name,
          phone: tenant.phone_no,
          email: tenant.email,
          status: tenant.status,
          organization_id: tenant.pg_locations?.organization_id,
        },
        pg: tenant.pg_locations
          ? {
              pg_id: tenant.pg_locations.s_no,
              location_name: tenant.pg_locations.location_name,
              address: tenant.pg_locations.address,
            }
          : null,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);

      if (payload.role !== UserRole.TENANT) {
        throw new UnauthorizedException('Invalid token');
      }

      // Check if refresh token exists and is not revoked
      const tokenRecord = await this.prisma.tenant_tokens.findFirst({
        where: {
          refresh_token: refreshToken,
          is_revoked: false,
          refresh_expires_at: { gte: new Date() },
        },
      });

      if (!tokenRecord) {
        throw new UnauthorizedException('Refresh token has been revoked or expired');
      }

      // Revoke the old refresh token (token rotation for security)
      await this.prisma.tenant_tokens.update({
        where: { s_no: tokenRecord.s_no },
        data: { is_revoked: true, updated_at: new Date() },
      });

      // Generate new tokens
      const newPayload = {
        sub: payload.sub,
        tenantId: payload.tenantId,
        phone: payload.phone,
        role: payload.role,
        pgId: payload.pgId,
      };

      const newAccessToken = this.jwtService.sign(newPayload, { expiresIn: '1h' });
      const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '30d' });

      // Store new refresh token in database
      await this.prisma.tenant_tokens.create({
        data: {
          tenant_id: payload.tenantId,
          refresh_token: newRefreshToken,
          token_type: 'Bearer',
          refresh_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          is_revoked: false,
          device_info: tokenRecord.device_info,
          ip_address: tokenRecord.ip_address,
        },
      });

      return {
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(tenantId: number, refreshToken?: string) {
    if (refreshToken) {
      // Revoke specific token (if provided)
      await this.prisma.tenant_tokens.updateMany({
        where: {
          tenant_id: tenantId,
          refresh_token: refreshToken,
        },
        data: {
          is_revoked: true,
          updated_at: new Date(),
        },
      });
    } else {
      // Revoke all tokens for this tenant
      await this.prisma.tenant_tokens.updateMany({
        where: {
          tenant_id: tenantId,
          is_revoked: false,
        },
        data: {
          is_revoked: true,
          updated_at: new Date(),
        },
      });
    }

    return {
      success: true,
      message: 'Logout successful',
    };
  }
}
