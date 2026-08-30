import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Helpers ────────────────────────────────────────────────

  private normalizePrice(value: Prisma.Decimal | number | string | null | undefined): number {
    if (value && typeof value === 'object' && 'toNumber' in value) {
      return Number((value as { toNumber: () => number }).toNumber().toFixed(2));
    }
    const parsed = Number.parseFloat(String(value ?? '0'));
    return Number.isNaN(parsed) ? 0 : Number(parsed.toFixed(2));
  }

  /**
   * Core discount calculation logic.
   * Applies discount BEFORE GST (reduces taxable value).
   */
  calculateDiscount(
    basePrice: number,
    coupon: { discount_type: string; discount_value: Prisma.Decimal; max_discount_amount: Prisma.Decimal | null },
  ): { discountAmount: number; finalBasePrice: number } {
    const value = this.normalizePrice(coupon.discount_value);

    let discountAmount = 0;
    if (coupon.discount_type === 'PERCENTAGE') {
      discountAmount = Number(((basePrice * value) / 100).toFixed(2));
      // Cap at max_discount_amount if set
      const maxCap = this.normalizePrice(coupon.max_discount_amount);
      if (maxCap > 0 && discountAmount > maxCap) {
        discountAmount = maxCap;
      }
    } else if (coupon.discount_type === 'FLAT_AMOUNT') {
      discountAmount = Math.min(value, basePrice);
    }

    // Ensure discount doesn't exceed base price
    discountAmount = Math.min(discountAmount, basePrice);
    const finalBasePrice = Number((basePrice - discountAmount).toFixed(2));

    return { discountAmount, finalBasePrice };
  }

  /**
   * Validate a coupon code against a plan and user.
   * Returns the coupon record + pricing breakdown if valid.
   * Does NOT redeem — call redeemCoupon() after payment success.
   */
  async validateCoupon(code: string, planId: number, userId: number) {
    const upperCode = code.trim().toUpperCase();

    // 1. Find coupon
    const coupon = await this.prisma.coupons.findUnique({
      where: { code: upperCode },
    });

    if (!coupon) {
      return ResponseUtil.success(
        { valid: false, error_code: 'COUPON_NOT_FOUND', message: 'Invalid coupon code' },
        'Coupon validation failed',
      );
    }

    // 2. Check active
    if (!coupon.is_active) {
      return ResponseUtil.success(
        { valid: false, error_code: 'COUPON_INACTIVE', message: 'This coupon is no longer active' },
        'Coupon validation failed',
      );
    }

    // 3. Check validity window
    const now = new Date();
    if (coupon.valid_from && now < coupon.valid_from) {
      return ResponseUtil.success(
        { valid: false, error_code: 'COUPON_NOT_YET_VALID', message: 'This coupon is not yet valid' },
        'Coupon validation failed',
      );
    }
    if (coupon.valid_until && now > coupon.valid_until) {
      return ResponseUtil.success(
        { valid: false, error_code: 'COUPON_EXPIRED', message: 'This coupon has expired' },
        'Coupon validation failed',
      );
    }

    // 4. Check global usage limit
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      return ResponseUtil.success(
        { valid: false, error_code: 'COUPON_MAX_USES_REACHED', message: 'This coupon has reached its usage limit' },
        'Coupon validation failed',
      );
    }

    // 5. Check plan applicability
    if (coupon.applicable_plan_ids) {
      const planIds = coupon.applicable_plan_ids as unknown as number[];
      if (Array.isArray(planIds) && planIds.length > 0 && !planIds.includes(planId)) {
        return ResponseUtil.success(
          { valid: false, error_code: 'COUPON_NOT_APPLICABLE', message: 'This coupon is not valid for the selected plan' },
          'Coupon validation failed',
        );
      }
    }

    // 6. Get plan price
    const plan = await this.prisma.subscription_plans.findUnique({
      where: { s_no: planId },
    });

    if (!plan) {
      return ResponseUtil.success(
        { valid: false, error_code: 'PLAN_NOT_FOUND', message: 'Invalid plan' },
        'Coupon validation failed',
      );
    }

    const basePrice = this.normalizePrice(plan.price);

    // 7. Check minimum order amount
    const minOrder = this.normalizePrice(coupon.min_order_amount);
    if (minOrder > 0 && basePrice < minOrder) {
      return ResponseUtil.success(
        { valid: false, error_code: 'COUPON_MIN_ORDER_NOT_MET', message: `Minimum order amount for this coupon is ₹${minOrder}` },
        'Coupon validation failed',
      );
    }

    // 8. Check per-user usage limit
    if (coupon.max_uses_per_user !== null && coupon.max_uses_per_user > 0) {
      const userRedemptionCount = await this.prisma.coupon_redemptions.count({
        where: {
          coupon_id: coupon.s_no,
          user_id: userId,
        },
      });
      if (userRedemptionCount >= coupon.max_uses_per_user) {
        return ResponseUtil.success(
          { valid: false, error_code: 'COUPON_USER_LIMIT_REACHED', message: 'You have already used this coupon the maximum number of times' },
          'Coupon validation failed',
        );
      }
    }

    // 9. Calculate discount
    const { discountAmount, finalBasePrice } = this.calculateDiscount(basePrice, coupon);

    // 10. Calculate GST on discounted price
    const gstRate = 18;
    const cgstAmount = Number(((finalBasePrice * gstRate / 2) / 100).toFixed(2));
    const sgstAmount = Number(((finalBasePrice * gstRate / 2) / 100).toFixed(2));
    const totalAmount = Number((finalBasePrice + cgstAmount + sgstAmount).toFixed(2));

    return ResponseUtil.success(
      {
        valid: true,
        coupon: {
          s_no: coupon.s_no,
          code: coupon.code,
          description: coupon.description,
          discount_type: coupon.discount_type,
          discount_value: this.normalizePrice(coupon.discount_value),
          max_discount_amount: this.normalizePrice(coupon.max_discount_amount),
        },
        pricing: {
          original_base_price: basePrice,
          discount_amount: discountAmount,
          final_base_price: finalBasePrice,
          cgst_amount: cgstAmount,
          sgst_amount: sgstAmount,
          total_price_including_gst: totalAmount,
          currency: plan.currency,
        },
      },
      'Coupon is valid',
    );
  }

  /**
   * Redeem a coupon — called after payment success.
   * Creates a redemption record + increments used_count.
   * Wrapped in a transaction for atomicity.
   */
  async redeemCoupon(
    couponId: number,
    couponCode: string,
    paymentId: number,
    userId: number,
    organizationId: number,
    planId: number,
    originalAmount: number,
    discountAmount: number,
    finalAmount: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Create redemption record
      const redemption = await tx.coupon_redemptions.create({
        data: {
          coupon_id: couponId,
          subscription_payment_id: paymentId,
          user_id: userId,
          organization_id: organizationId,
          plan_id: planId,
          original_amount: originalAmount,
          discount_amount: discountAmount,
          final_amount: finalAmount,
          coupon_code: couponCode,
        },
      });

      // Increment used_count atomically
      await tx.coupons.update({
        where: { s_no: couponId },
        data: { used_count: { increment: 1 } },
      });

      this.logger.log(
        `Coupon ${couponCode} redeemed by user ${userId} — discount: ₹${discountAmount}`,
      );

      return redemption;
    });
  }

  // ─── Admin CRUD ─────────────────────────────────────────────

  async createCoupon(data: {
    code: string;
    description?: string;
    discount_type: 'PERCENTAGE' | 'FLAT_AMOUNT';
    discount_value: number;
    max_discount_amount?: number | null;
    min_order_amount?: number | null;
    max_uses?: number | null;
    max_uses_per_user?: number | null;
    applicable_plan_ids?: number[] | null;
    valid_from?: Date;
    valid_until?: Date | null;
    is_active?: boolean;
  }, createdBy: number) {
    const code = data.code.trim().toUpperCase();

    // Check for duplicate code
    const existing = await this.prisma.coupons.findUnique({ where: { code } });
    if (existing) {
      throw new BadRequestException(`Coupon code "${code}" already exists`);
    }

    // Validate discount_value
    if (data.discount_value <= 0) {
      throw new BadRequestException('Discount value must be greater than 0');
    }

    // Validate percentage cap
    if (data.discount_type === 'PERCENTAGE' && data.discount_value > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }

    const coupon = await this.prisma.coupons.create({
      data: {
        code,
        description: data.description || null,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        max_discount_amount: data.max_discount_amount ?? null,
        min_order_amount: data.min_order_amount ?? 0,
        max_uses: data.max_uses ?? null,
        max_uses_per_user: data.max_uses_per_user ?? 1,
        applicable_plan_ids: data.applicable_plan_ids ?? null,
        valid_from: data.valid_from || new Date(),
        valid_until: data.valid_until ?? null,
        is_active: data.is_active ?? true,
        created_by: createdBy,
        updated_by: createdBy,
      },
    });

    return ResponseUtil.success(coupon, 'Coupon created successfully');
  }

  async getAllCoupons(filters?: { is_active?: boolean; search?: string }) {
    const where: Prisma.couponsWhereInput = {};

    if (filters?.is_active !== undefined) {
      where.is_active = filters.is_active;
    }

    if (filters?.search) {
      where.code = { contains: filters.search };
    }

    const coupons = await this.prisma.coupons.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: { coupon_redemptions: true },
        },
      },
    });

    return ResponseUtil.success(coupons, 'Coupons fetched successfully');
  }

  async getCouponById(id: number) {
    const coupon = await this.prisma.coupons.findUnique({
      where: { s_no: id },
      include: {
        coupon_redemptions: {
          orderBy: { redeemed_at: 'desc' },
          take: 50,
        },
        _count: {
          select: { coupon_redemptions: true },
        },
      },
    });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    return ResponseUtil.success(coupon, 'Coupon fetched successfully');
  }

  async updateCoupon(id: number, data: {
    description?: string;
    discount_type?: 'PERCENTAGE' | 'FLAT_AMOUNT';
    discount_value?: number;
    max_discount_amount?: number | null;
    min_order_amount?: number | null;
    max_uses?: number | null;
    max_uses_per_user?: number | null;
    applicable_plan_ids?: number[] | null;
    valid_from?: Date;
    valid_until?: Date | null;
    is_active?: boolean;
  }, updatedBy: number) {
    const existing = await this.prisma.coupons.findUnique({ where: { s_no: id } });
    if (!existing) {
      throw new NotFoundException('Coupon not found');
    }

    // Don't allow code changes (would break redemption history)
    const updateData: Prisma.couponsUpdateInput = {
      updated_by: updatedBy,
    };

    if (data.description !== undefined) updateData.description = data.description;
    if (data.discount_type !== undefined) updateData.discount_type = data.discount_type;
    if (data.discount_value !== undefined) {
      if (data.discount_value <= 0) throw new BadRequestException('Discount value must be greater than 0');
      updateData.discount_value = data.discount_value;
    }
    if (data.max_discount_amount !== undefined) updateData.max_discount_amount = data.max_discount_amount;
    if (data.min_order_amount !== undefined) updateData.min_order_amount = data.min_order_amount;
    if (data.max_uses !== undefined) updateData.max_uses = data.max_uses;
    if (data.max_uses_per_user !== undefined) updateData.max_uses_per_user = data.max_uses_per_user;
    if (data.applicable_plan_ids !== undefined) updateData.applicable_plan_ids = data.applicable_plan_ids;
    if (data.valid_from !== undefined) updateData.valid_from = data.valid_from;
    if (data.valid_until !== undefined) updateData.valid_until = data.valid_until;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;

    const coupon = await this.prisma.coupons.update({
      where: { s_no: id },
      data: updateData,
    });

    return ResponseUtil.success(coupon, 'Coupon updated successfully');
  }

  async deleteCoupon(id: number) {
    // Soft delete — just deactivate, don't actually delete (preserve redemption history)
    const existing = await this.prisma.coupons.findUnique({ where: { s_no: id } });
    if (!existing) {
      throw new NotFoundException('Coupon not found');
    }

    const coupon = await this.prisma.coupons.update({
      where: { s_no: id },
      data: { is_active: false },
    });

    return ResponseUtil.success(coupon, 'Coupon deactivated successfully');
  }

  async getRedemptions(couponId: number, page = 1, limit = 20) {
    const coupon = await this.prisma.coupons.findUnique({ where: { s_no: couponId } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    const skip = (page - 1) * limit;

    const [redemptions, total] = await Promise.all([
      this.prisma.coupon_redemptions.findMany({
        where: { coupon_id: couponId },
        orderBy: { redeemed_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.coupon_redemptions.count({
        where: { coupon_id: couponId },
      }),
    ]);

    return ResponseUtil.success(
      { redemptions, total, page, limit, totalPages: Math.ceil(total / limit) },
      'Redemptions fetched successfully',
    );
  }
}
