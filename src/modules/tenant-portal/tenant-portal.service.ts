import { PrismaService } from '@/prisma/prisma.service';
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ResponseUtil } from '../../common/utils/response.util';

@Injectable()
export class TenantPortalService {
  constructor(private prisma: PrismaService) {}

  async getTenantProfile(tenantId: number) {
    // Get tenant with all comprehensive details (similar to tenant.service.ts findOne)
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        s_no: tenantId,
        is_deleted: false,
      },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            address: true,
            city: true,
            state: true,
            rent_cycle_type: true,
          },
        },
        city: {
          select: {
            s_no: true,
            name: true,
          },
        },
        state: {
          select: {
            s_no: true,
            name: true,
          },
        },
        tenant_rent_cycles: {
          orderBy: {
            cycle_start: 'asc',
          },
          select: {
            s_no: true,
            cycle_type: true,
            anchor_day: true,
            cycle_start: true,
            cycle_end: true,
          },
        },
        rent_payments: {
          where: {
            is_deleted: false,
            status: {
              not: 'VOIDED',
            },
          },
          orderBy: {
            payment_date: 'desc',
          },
          take: 5,
          select: {
            s_no: true,
            payment_date: true,
            amount_paid: true,
            payment_method: true,
            status: true,
            remarks: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Get current allocation (where effective_to is null means still active)
    const currentAllocation = await this.prisma.tenant_allocations.findFirst({
      where: {
        tenant_id: tenantId,
        effective_to: null,
      },
      orderBy: { effective_from: 'desc' },
    });

    // Get room details
    const room = currentAllocation?.room_id
      ? await this.prisma.rooms.findUnique({
          where: { s_no: currentAllocation.room_id },
          select: {
            s_no: true,
            room_no: true,
          },
        })
      : null;

    // Get bed details
    const bed = currentAllocation?.bed_id
      ? await this.prisma.beds.findUnique({
          where: { s_no: currentAllocation.bed_id },
          select: {
            s_no: true,
            bed_no: true,
            bed_price: true,
          },
        })
      : null;

    return ResponseUtil.success(
      {
        tenant: {
          s_no: tenant.s_no,
          name: tenant.name,
          phone: tenant.phone_no,
          email: tenant.email,
          status: tenant.status,
          check_in_date: tenant.check_in_date,
          check_out_date: tenant.check_out_date,
          city: tenant.city,
          state: tenant.state,
        },
        pg: tenant.pg_locations,
        currentRoom: room,
        currentBed: bed,
        rentCycles: tenant.tenant_rent_cycles,
        recentPayments: tenant.rent_payments,
      },
      'Tenant profile retrieved successfully',
    );
  }

  async getTenantPayments(tenantId: number, page = 1, limit = 20) {
    // Verify tenant exists
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      this.prisma.rent_payments.findMany({
        where: { tenant_id: tenantId },
        orderBy: { payment_date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.rent_payments.count({
        where: { tenant_id: tenantId },
      }),
    ]);

    return ResponseUtil.success(
      {
        payments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      'Payments retrieved successfully',
    );
  }

  async getTenantDues(tenantId: number) {
    // Verify tenant exists
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Get pending rent payments
    const pendingPayments = await this.prisma.rent_payments.findMany({
      where: {
        tenant_id: tenantId,
        status: 'PENDING',
        is_deleted: false,
      },
      orderBy: { payment_date: 'desc' },
    });

    // Calculate total dues (amount_paid vs total expected)
    const totalDue = pendingPayments.reduce((sum: number, payment) => {
      const amountPaid = Number(payment.amount_paid || 0);
      // If there's a pending payment, it means there's still dues
      return sum + amountPaid;
    }, 0);

    return ResponseUtil.success(
      {
        totalDue,
        pendingPayments: pendingPayments.map((payment) => ({
          s_no: payment.s_no,
          payment_date: payment.payment_date,
          amount_paid: payment.amount_paid,
          payment_method: payment.payment_method,
          status: payment.status,
          remarks: payment.remarks,
        })),
      },
      'Dues retrieved successfully',
    );
  }
}
