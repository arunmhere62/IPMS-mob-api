import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';

@Injectable()
export class AppSettingsService {
  constructor(private prisma: PrismaService) {}

  async findOne() {
    const settings = await this.prisma.app_settings.findFirst({
      orderBy: { s_no: 'asc' },
    });

    if (!settings) {
      throw new NotFoundException('App settings not found');
    }

    return ResponseUtil.success(settings, 'App settings fetched successfully');
  }

  async update(headers: { user_id?: number }, dto: UpdateAppSettingsDto) {
    // Get first settings record or create if not exists
    let settings = await this.prisma.app_settings.findFirst({
      orderBy: { s_no: 'asc' },
    });

    if (!settings) {
      // Create default settings if none exists
      settings = await this.prisma.app_settings.create({
        data: {
          is_maintenance_mode: dto.is_maintenance_mode ?? false,
          maintenance_message: dto.maintenance_message ?? null,
          is_registration_open: dto.is_registration_open ?? true,
          force_update_android: dto.force_update_android ?? false,
          force_update_ios: dto.force_update_ios ?? false,
          android_store_url: dto.android_store_url ?? null,
          ios_store_url: dto.ios_store_url ?? null,
          current_version_android: dto.current_version_android ?? null,
          current_version_ios: dto.current_version_ios ?? null,
          minimum_version_android: dto.minimum_version_android ?? null,
          minimum_version_ios: dto.minimum_version_ios ?? null,
          max_login_attempts: dto.max_login_attempts ?? 5,
          otp_expiry_seconds: dto.otp_expiry_seconds ?? 300,
          otp_resend_cooldown_seconds: dto.otp_resend_cooldown_seconds ?? 60,
          payment_gateway_enabled: dto.payment_gateway_enabled ?? false,
          announcement_title: dto.announcement_title ?? null,
          announcement_message: dto.announcement_message ?? null,
          show_announcement: dto.show_announcement ?? false,
          announcement_start_date: dto.announcement_start_date ?? null,
          announcement_end_date: dto.announcement_end_date ?? null,
          updated_by: headers.user_id ?? null,
        },
      });
    } else {
      // Update existing settings
      settings = await this.prisma.app_settings.update({
        where: { s_no: settings.s_no },
        data: {
          ...dto,
          updated_by: headers.user_id ?? null,
          updated_at: new Date(),
        },
      });
    }

    return ResponseUtil.success(settings, 'App settings updated successfully');
  }

  // Public endpoint for app to check version/maintenance (no auth needed)
  async getPublicStatus() {
    const settings = await this.prisma.app_settings.findFirst({
      orderBy: { s_no: 'asc' },
      select: {
        is_maintenance_mode: true,
        maintenance_message: true,
        is_registration_open: true,
        force_update_android: true,
        force_update_ios: true,
        current_version_android: true,
        current_version_ios: true,
        minimum_version_android: true,
        minimum_version_ios: true,
        show_announcement: true,
        announcement_title: true,
        announcement_message: true,
        payment_gateway_enabled: true,
      },
    });

    if (!settings) {
      return ResponseUtil.success(
        {
          is_maintenance_mode: false,
          is_registration_open: true,
          force_update_android: false,
          force_update_ios: false,
          show_announcement: false,
          payment_gateway_enabled: false,
        },
        'Default app status'
      );
    }

    return ResponseUtil.success(settings, 'App status fetched successfully');
  }
}
