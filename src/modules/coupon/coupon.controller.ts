import { Controller, Get, Post, Patch, Body, Param, Query, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CouponService } from './coupon.service';

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

const headerToString = (v: string | string[] | undefined): string => {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
};

@ApiTags('coupon')
@Controller('coupon')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  // ─── Admin: CRUD ────────────────────────────────────────────

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new coupon (Admin)' })
  async createCoupon(@Req() req: RequestWithHeaders, @Body() body: {
    code: string;
    description?: string;
    discount_type: 'PERCENTAGE' | 'FLAT_AMOUNT';
    discount_value: number;
    max_discount_amount?: number | null;
    min_order_amount?: number | null;
    max_uses?: number | null;
    max_uses_per_user?: number | null;
    applicable_plan_ids?: number[] | null;
    valid_from?: string;
    valid_until?: string | null;
    is_active?: boolean;
  }) {
    const createdBy = parseInt(headerToString(req.headers['x-user-id']), 10);
    if (!Number.isFinite(createdBy)) {
      throw new BadRequestException('Missing x-user-id header');
    }

    return this.couponService.createCoupon({
      ...body,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      valid_until: body.valid_until ? new Date(body.valid_until) : null,
    }, createdBy);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all coupons (Admin)' })
  async getAllCoupons(
    @Query('is_active') isActive?: string,
    @Query('search') search?: string,
  ) {
    const filters: { is_active?: boolean; search?: string } = {};
    if (isActive === 'true') filters.is_active = true;
    if (isActive === 'false') filters.is_active = false;
    if (search) filters.search = search;

    return this.couponService.getAllCoupons(filters);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get coupon by ID with redemption history (Admin)' })
  async getCouponById(@Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (!Number.isFinite(id)) {
      throw new BadRequestException('Invalid coupon ID');
    }
    return this.couponService.getCouponById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update coupon (Admin)' })
  async updateCoupon(
    @Req() req: RequestWithHeaders,
    @Param('id') idParam: string,
    @Body() body: {
      description?: string;
      discount_type?: 'PERCENTAGE' | 'FLAT_AMOUNT';
      discount_value?: number;
      max_discount_amount?: number | null;
      min_order_amount?: number | null;
      max_uses?: number | null;
      max_uses_per_user?: number | null;
      applicable_plan_ids?: number[] | null;
      valid_from?: string;
      valid_until?: string | null;
      is_active?: boolean;
    },
  ) {
    const updatedBy = parseInt(headerToString(req.headers['x-user-id']), 10);
    if (!Number.isFinite(updatedBy)) {
      throw new BadRequestException('Missing x-user-id header');
    }

    const id = parseInt(idParam, 10);
    if (!Number.isFinite(id)) {
      throw new BadRequestException('Invalid coupon ID');
    }

    return this.couponService.updateCoupon(id, {
      ...body,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      valid_until: body.valid_until ? new Date(body.valid_until) : null,
    }, updatedBy);
  }

  @Post(':id/deactivate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate coupon (soft delete, preserves history)' })
  async deleteCoupon(@Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (!Number.isFinite(id)) {
      throw new BadRequestException('Invalid coupon ID');
    }
    return this.couponService.deleteCoupon(id);
  }

  @Get(':id/redemptions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get redemption history for a coupon (Admin)' })
  async getRedemptions(
    @Param('id') idParam: string,
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    const id = parseInt(idParam, 10);
    if (!Number.isFinite(id)) {
      throw new BadRequestException('Invalid coupon ID');
    }
    const page = parseInt(pageParam || '1', 10) || 1;
    const limit = parseInt(limitParam || '20', 10) || 20;
    return this.couponService.getRedemptions(id, page, limit);
  }

  // ─── User: Validate ─────────────────────────────────────────

  @Post('validate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate a coupon code against a plan (User)' })
  async validateCoupon(
    @Req() req: RequestWithHeaders,
    @Body() body: { code: string; plan_id: number },
  ) {
    const userId = parseInt(headerToString(req.headers['x-user-id']), 10);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('Missing x-user-id header');
    }

    if (!body.code || !body.plan_id) {
      throw new BadRequestException('code and plan_id are required');
    }

    return this.couponService.validateCoupon(body.code, body.plan_id, userId);
  }
}
