import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { CreatePaymentConfigDto, UpdatePaymentConfigDto, PaymentConfigScopeType } from './dto';

@Injectable()
export class OwnerPaymentConfigService {
  private readonly logger = new Logger(OwnerPaymentConfigService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a payment config for the owner's organization.
   * - ALL_PG: one config for all PGs (pg_id must be null)
   * - SPECIFIC_PG: one config per PG (pg_id required)
   */
  async create(dto: CreatePaymentConfigDto, organizationId: number, ownerUserId: number) {
    // Validate pg_id requirement
    if (dto.scope_type === PaymentConfigScopeType.SPECIFIC_PG) {
      if (!dto.pg_id) {
        throw new BadRequestException('pg_id is required when scope_type is SPECIFIC_PG');
      }
      // Verify the PG belongs to this organization
      const pg = await this.prisma.pg_locations.findFirst({
        where: { s_no: dto.pg_id, organization_id: organizationId, is_deleted: false },
      });
      if (!pg) {
        throw new NotFoundException('PG not found in your organization');
      }
    } else if (dto.scope_type === PaymentConfigScopeType.ALL_PG) {
      // ALL_PG must have null pg_id
      dto.pg_id = undefined;
    }

    // Check for duplicate (same org + scope + pg_id)
    const existing = await this.prisma.owner_payment_configs.findFirst({
      where: {
        organization_id: organizationId,
        scope_type: dto.scope_type,
        pg_id: dto.scope_type === PaymentConfigScopeType.ALL_PG ? null : dto.pg_id,
      },
    });
    if (existing) {
      const scopeDesc = dto.scope_type === PaymentConfigScopeType.ALL_PG
        ? 'ALL_PG (all PGs)'
        : `SPECIFIC_PG (PG #${dto.pg_id})`;
      throw new BadRequestException(`A payment config already exists for ${scopeDesc}. Update it instead.`);
    }

    const config = await this.prisma.owner_payment_configs.create({
      data: {
        organization_id: organizationId,
        owner_user_id: ownerUserId,
        scope_type: dto.scope_type,
        pg_id: dto.scope_type === PaymentConfigScopeType.ALL_PG ? null : dto.pg_id,
        upi_id: dto.upi_id,
        upi_qr_image_url: dto.upi_qr_image_url || null,
        account_holder_name: dto.account_holder_name || null,
        bank_name: dto.bank_name || null,
        account_number: dto.account_number || null,
        ifsc_code: dto.ifsc_code || null,
        payment_instructions: dto.payment_instructions || null,
        is_active: dto.is_active ?? true,
      },
    });

    return ResponseUtil.created(config, 'Payment config created successfully');
  }

  /**
   * List all payment configs for the organization.
   */
  async findAll(organizationId: number) {
    const configs = await this.prisma.owner_payment_configs.findMany({
      where: { organization_id: organizationId },
      include: {
        pg_locations: {
          select: { s_no: true, location_name: true, address: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return ResponseUtil.success(configs);
  }

  /**
   * Get a single config by ID (must belong to the org).
   */
  async findOne(id: number, organizationId: number) {
    const config = await this.prisma.owner_payment_configs.findFirst({
      where: { s_no: id, organization_id: organizationId },
      include: {
        pg_locations: {
          select: { s_no: true, location_name: true, address: true },
        },
      },
    });
    if (!config) {
      throw new NotFoundException('Payment config not found');
    }
    return ResponseUtil.success(config);
  }

  /**
   * Update a config (cannot change scope_type or pg_id).
   */
  async update(id: number, dto: UpdatePaymentConfigDto, organizationId: number) {
    const existing = await this.prisma.owner_payment_configs.findFirst({
      where: { s_no: id, organization_id: organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Payment config not found');
    }

    const config = await this.prisma.owner_payment_configs.update({
      where: { s_no: id },
      data: {
        upi_id: dto.upi_id ?? existing.upi_id,
        upi_qr_image_url: dto.upi_qr_image_url ?? existing.upi_qr_image_url,
        account_holder_name: dto.account_holder_name ?? existing.account_holder_name,
        bank_name: dto.bank_name ?? existing.bank_name,
        account_number: dto.account_number ?? existing.account_number,
        ifsc_code: dto.ifsc_code ?? existing.ifsc_code,
        payment_instructions: dto.payment_instructions ?? existing.payment_instructions,
        is_active: dto.is_active ?? existing.is_active,
      },
    });

    return ResponseUtil.success(config, 'Payment config updated successfully');
  }

  /**
   * Delete a config (soft — just deactivate).
   */
  async remove(id: number, organizationId: number) {
    const existing = await this.prisma.owner_payment_configs.findFirst({
      where: { s_no: id, organization_id: organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Payment config not found');
    }

    await this.prisma.owner_payment_configs.update({
      where: { s_no: id },
      data: { is_active: false },
    });

    return ResponseUtil.success({ id }, 'Payment config deactivated');
  }

  /**
   * Resolve the effective payment config for a specific PG.
   * Priority: SPECIFIC_PG config > ALL_PG config.
   * Returns null if no config exists.
   */
  async resolveForPg(pgId: number, organizationId: number) {
    // 1. Check for SPECIFIC_PG config
    const specificConfig = await this.prisma.owner_payment_configs.findFirst({
      where: {
        organization_id: organizationId,
        scope_type: 'SPECIFIC_PG',
        pg_id: pgId,
        is_active: true,
      },
    });

    if (specificConfig) return specificConfig;

    // 2. Fall back to ALL_PG config
    const allPgConfig = await this.prisma.owner_payment_configs.findFirst({
      where: {
        organization_id: organizationId,
        scope_type: 'ALL_PG',
        pg_id: null,
        is_active: true,
      },
    });

    return allPgConfig || null;
  }
}
