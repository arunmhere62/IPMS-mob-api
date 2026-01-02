import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ResponseUtil } from '../../../common/utils/response.util';
import { CheckoutTenantDto } from './dto/checkout-tenant.dto';
import { UpdateCheckoutDateDto } from '../dto/update-checkout-date.dto';

@Injectable()
export class CheckoutService {
  constructor(private prisma: PrismaService) {}

  /**
   * Check out tenant
   */
  async checkout(id: number, checkoutDto: CheckoutTenantDto) {
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        rent_payments: {
          where: {
            is_deleted: false,
          },
          select: {
            s_no: true,
            status: true,
            amount_paid: true,
            payment_date: true,
          },
        },
        advance_payments: {
          where: {
            is_deleted: false,
          },
          select: {
            s_no: true,
            status: true,
            amount_paid: true,
            payment_date: true,
          },
        },
        refund_payments: {
          where: {
            is_deleted: false,
          },
          select: {
            s_no: true,
            status: true,
            amount_paid: true,
            payment_date: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    // Check for PARTIAL status payments first (strict validation)
    const partialRentPayments = tenant.rent_payments.filter(
      (payment) => payment.status === 'PARTIAL'
    );
    const partialAdvancePayments = tenant.advance_payments.filter(
      (payment) => payment.status === 'PARTIAL'
    );
    const partialRefundPayments = tenant.refund_payments.filter(
      (payment) => payment.status === 'PARTIAL'
    );

    const totalPartialPayments = 
      partialRentPayments.length + 
      partialAdvancePayments.length + 
      partialRefundPayments.length;

    // Reject checkout if there are any PARTIAL payments
    if (totalPartialPayments > 0) {
      const partialDetails = [];
      
      if (partialRentPayments.length > 0) {
        partialDetails.push(`${partialRentPayments.length} rent payment(s) with PARTIAL status`);
      }
      if (partialAdvancePayments.length > 0) {
        partialDetails.push(`${partialAdvancePayments.length} advance payment(s) with PARTIAL status`);
      }
      if (partialRefundPayments.length > 0) {
        partialDetails.push(`${partialRefundPayments.length} refund payment(s) with PARTIAL status`);
      }

      throw new BadRequestException(
        `Cannot checkout tenant. Tenant has ${totalPartialPayments} payment(s) in PARTIAL status: ${partialDetails.join(', ')}. Please complete or mark all PARTIAL payments as PAID before checkout.`
      );
    }

    // Check if all remaining payments are paid (excluding PARTIAL which we already checked)
    const unpaidRentPayments = tenant.rent_payments.filter(
      (payment) => payment.status !== 'PAID' && payment.status !== 'PARTIAL'
    );
    const unpaidAdvancePayments = tenant.advance_payments.filter(
      (payment) => payment.status !== 'PAID' && payment.status !== 'PARTIAL'
    );
    const unpaidRefundPayments = tenant.refund_payments.filter(
      (payment) => payment.status !== 'PAID' && payment.status !== 'PARTIAL'
    );

    const totalUnpaidPayments = 
      unpaidRentPayments.length + 
      unpaidAdvancePayments.length + 
      unpaidRefundPayments.length;

    if (totalUnpaidPayments > 0) {
      const unpaidDetails = [];
      
      if (unpaidRentPayments.length > 0) {
        unpaidDetails.push(`${unpaidRentPayments.length} rent payment(s)`);
      }
      if (unpaidAdvancePayments.length > 0) {
        unpaidDetails.push(`${unpaidAdvancePayments.length} advance payment(s)`);
      }
      if (unpaidRefundPayments.length > 0) {
        unpaidDetails.push(`${unpaidRefundPayments.length} refund payment(s)`);
      }

      throw new BadRequestException(
        `Cannot checkout tenant. There are ${totalUnpaidPayments} unpaid payment(s): ${unpaidDetails.join(', ')}. Please mark all payments as PAID before checkout.`
      );
    }

    // Checkout date is required - must be provided from frontend
    if (!checkoutDto.check_out_date) {
      throw new BadRequestException('Checkout date is required. Please provide a valid checkout date.');
    }

    const checkoutDate = new Date(checkoutDto.check_out_date);
    const checkInDate = new Date(tenant.check_in_date);

    // Validate that checkout date is not before check-in date (same-day checkout allowed)
    if (checkoutDate < checkInDate) {
      throw new BadRequestException(
        `Checkout date must be the same as or after check-in date. Check-in date: ${checkInDate.toISOString().split('T')[0]}, Checkout date: ${checkoutDate.toISOString().split('T')[0]}`
      );
    }

    // Update tenant status
    const updatedTenant = await this.prisma.tenants.update({
      where: { s_no: id },
      data: {
        status: 'INACTIVE',
        check_out_date: checkoutDate,
      },
      include: {
        pg_locations: true,
        rooms: true,
        beds: true,
      },
    });

    return ResponseUtil.success(updatedTenant, 'Tenant checked out successfully');
  }

  /**
   * Update or clear checkout date
   */
  async updateCheckoutDate(id: number, updateCheckoutDateDto: UpdateCheckoutDateDto) {
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        rent_payments: {
          where: { is_deleted: false },
          select: { status: true },
        },
        advance_payments: {
          where: { is_deleted: false },
          select: { status: true },
        },
        refund_payments: {
          where: { is_deleted: false },
          select: { status: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    let updateData: any = {};

    if (updateCheckoutDateDto.clear_checkout) {
      // Clear checkout date and reactivate tenant (no validation needed for clearing)
      updateData = {
        check_out_date: null,
        status: 'ACTIVE',
      };
    } else if (updateCheckoutDateDto.check_out_date) {
      // Validate before updating checkout date (only if setting a new checkout date)
      // Check for PARTIAL payments
      const partialPayments = [
        ...tenant.rent_payments.filter(p => p.status === 'PARTIAL'),
        ...tenant.advance_payments.filter(p => p.status === 'PARTIAL'),
        ...tenant.refund_payments.filter(p => p.status === 'PARTIAL'),
      ];

      if (partialPayments.length > 0) {
        throw new BadRequestException(
          `Cannot update checkout date. Tenant has ${partialPayments.length} payment(s) in PARTIAL status. Please complete or mark all PARTIAL payments as PAID before checkout.`
        );
      }

      // Check for other unpaid payments
      const unpaidPayments = [
        ...tenant.rent_payments.filter(p => p.status !== 'PAID' && p.status !== 'PARTIAL'),
        ...tenant.advance_payments.filter(p => p.status !== 'PAID' && p.status !== 'PARTIAL'),
        ...tenant.refund_payments.filter(p => p.status !== 'PAID' && p.status !== 'PARTIAL'),
      ];

      if (unpaidPayments.length > 0) {
        throw new BadRequestException(
          `Cannot update checkout date. There are ${unpaidPayments.length} unpaid payment(s). Please mark all payments as PAID before checkout.`
        );
      }

      const checkoutDate = new Date(updateCheckoutDateDto.check_out_date);
      const checkInDate = new Date(tenant.check_in_date);

      // Validate that checkout date is not before check-in date (same-day checkout allowed)
      if (checkoutDate < checkInDate) {
        throw new BadRequestException(
          `Checkout date must be the same as or after check-in date. Check-in date: ${checkInDate.toISOString().split('T')[0]}, Checkout date: ${checkoutDate.toISOString().split('T')[0]}`
        );
      }

      updateData = {
        check_out_date: checkoutDate,
      };
    } else {
      throw new BadRequestException('Either provide check_out_date or set clear_checkout to true');
    }

    const updatedTenant = await this.prisma.tenants.update({
      where: { s_no: id },
      data: updateData,
      include: {
        pg_locations: true,
        rooms: true,
        beds: true,
      },
    });

    const message = updateCheckoutDateDto.clear_checkout
      ? 'Checkout cleared and tenant reactivated successfully'
      : 'Checkout date updated successfully';

    return ResponseUtil.success(updatedTenant, message);
  }
}
