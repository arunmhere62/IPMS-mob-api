import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ResponseUtil } from '../../../common/utils/response.util';
import { CreateRefundPaymentDto, UpdateRefundPaymentDto } from './dto';

@Injectable()
export class RefundPaymentService {
  constructor(private prisma: PrismaService) {}

  async create(createRefundPaymentDto: CreateRefundPaymentDto) {
    // Validate tenant exists
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        s_no: createRefundPaymentDto.tenant_id,
        is_deleted: false,
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${createRefundPaymentDto.tenant_id} not found`);
    }

    // Check if tenant already has a refund payment
    const existingRefund = await this.prisma.refund_payments.findFirst({
      where: {
        tenant_id: createRefundPaymentDto.tenant_id,
        is_deleted: false,
      },
    });

    if (existingRefund) {
      throw new BadRequestException(`Tenant ${tenant.name} already has a refund payment. Only one refund payment is allowed per tenant.`);
    }

    // Validate room exists
    const room = await this.prisma.rooms.findFirst({
      where: {
        s_no: createRefundPaymentDto.room_id,
        is_deleted: false,
      },
    });

    if (!room) {
      throw new NotFoundException(`Room with ID ${createRefundPaymentDto.room_id} not found`);
    }

    // Validate bed exists
    const bed = await this.prisma.beds.findFirst({
      where: {
        s_no: createRefundPaymentDto.bed_id,
        is_deleted: false,
      },
    });

    if (!bed) {
      throw new NotFoundException(`Bed with ID ${createRefundPaymentDto.bed_id} not found`);
    }

    // Create refund payment
    const refundPayment = await this.prisma.refund_payments.create({
      data: {
        tenant_id: createRefundPaymentDto.tenant_id,
        pg_id: createRefundPaymentDto.pg_id,
        room_id: createRefundPaymentDto.room_id,
        bed_id: createRefundPaymentDto.bed_id,
        amount_paid: createRefundPaymentDto.amount_paid,
        actual_rent_amount: createRefundPaymentDto.actual_rent_amount || createRefundPaymentDto.amount_paid,
        payment_date: createRefundPaymentDto.payment_date
          ? new Date(createRefundPaymentDto.payment_date)
          : new Date(),
        payment_method: createRefundPaymentDto.payment_method as any,
        status: createRefundPaymentDto.status as any,
        remarks: createRefundPaymentDto.remarks,
      },
      include: {
        tenants: {
          select: {
            s_no: true,
            tenant_id: true,
            name: true,
            phone_no: true,
          },
        },
        rooms: {
          select: {
            s_no: true,
            room_no: true,
          },
        },
        beds: {
          select: {
            s_no: true,
            bed_no: true,
          },
        },
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
          },
        },
      },
    });

    return ResponseUtil.success(refundPayment, 'Refund payment created successfully');
  }

  async findAll(
    pg_id: number,
    tenant_id?: number,
    status?: string,
    month?: string,
    year?: number,
    start_date?: string,
    end_date?: string,
    room_id?: number,
    bed_id?: number,
    page: number = 1,
    limit: number = 10,
  ) {
    const where: any = {
      pg_id,
      is_deleted: false,
    };

    if (tenant_id) {
      where.tenant_id = tenant_id;
    }

    if (status) {
      where.status = status;
    }

    if (room_id) {
      where.room_id = room_id;
    }

    if (bed_id) {
      where.bed_id = bed_id;
    }

    // Date filtering
    if (start_date && end_date) {
      const startDateTime = new Date(start_date);
      startDateTime.setHours(0, 0, 0, 0);
      
      const endDateTime = new Date(end_date);
      endDateTime.setHours(23, 59, 59, 999);

      where.payment_date = {
        gte: startDateTime,
        lte: endDateTime,
      };
    } else if (month && year) {
      const monthIndex = new Date(Date.parse(month + ' 1, 2000')).getMonth();
      const startOfMonth = new Date(year, monthIndex, 1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const endOfMonth = new Date(year, monthIndex + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      where.payment_date = {
        gte: startOfMonth,
        lte: endOfMonth,
      };
    }

    const skip = (page - 1) * limit;

    const [refundPayments, total] = await Promise.all([
      this.prisma.refund_payments.findMany({
        where,
        include: {
          tenants: {
            select: {
              s_no: true,
              tenant_id: true,
              name: true,
              phone_no: true,
              is_deleted: true,
              status: true,
              check_out_date: true,
            },
          },
          rooms: {
            select: {
              s_no: true,
              room_no: true,
            },
          },
          beds: {
            select: {
              s_no: true,
              bed_no: true,
            },
          },
          pg_locations: {
            select: {
              s_no: true,
              location_name: true,
            },
          },
        },
        orderBy: {
          payment_date: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.refund_payments.count({ where }),
    ]);

    // Add tenant unavailability reason
    const enrichedData = refundPayments.map(payment => {
      let tenant_unavailable_reason = null;
      
      if (!payment.tenants) {
        tenant_unavailable_reason = 'NOT_FOUND';
      } else if (payment.tenants.is_deleted) {
        tenant_unavailable_reason = 'DELETED';
      } else if (payment.tenants.check_out_date) {
        tenant_unavailable_reason = 'CHECKED_OUT';
      } else if (payment.tenants.status === 'INACTIVE') {
        tenant_unavailable_reason = 'INACTIVE';
      }

      return {
        ...payment,
        tenant_unavailable_reason,
      };
    });

    return ResponseUtil.paginated(enrichedData, total, page, limit, 'Refund payments fetched successfully');
  }

  async findOne(id: number, pg_id: number) {
    const refundPayment = await this.prisma.refund_payments.findFirst({
      where: {
        s_no: id,
        pg_id,
        is_deleted: false,
      },
      include: {
        tenants: {
          select: {
            s_no: true,
            tenant_id: true,
            name: true,
            phone_no: true,
          },
        },
        rooms: {
          select: {
            s_no: true,
            room_no: true,
          },
        },
        beds: {
          select: {
            s_no: true,
            bed_no: true,
          },
        },
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
          },
        },
      },
    });

    if (!refundPayment) {
      throw new NotFoundException(`Refund payment with ID ${id} not found`);
    }

    return ResponseUtil.success(refundPayment, 'Refund payment fetched successfully');
  }

  async update(id: number, updateRefundPaymentDto: UpdateRefundPaymentDto, pg_id: number) {
    const refundPayment = await this.prisma.refund_payments.findFirst({
      where: {
        s_no: id,
        pg_id,
        is_deleted: false,
      },
    });

    if (!refundPayment) {
      throw new NotFoundException(`Refund payment with ID ${id} not found`);
    }

    const updateData: any = {};

    if (updateRefundPaymentDto.amount_paid !== undefined) {
      updateData.amount_paid = updateRefundPaymentDto.amount_paid;
    }

    if (updateRefundPaymentDto.actual_rent_amount !== undefined) {
      updateData.actual_rent_amount = updateRefundPaymentDto.actual_rent_amount;
    }

    if (updateRefundPaymentDto.payment_date) {
      updateData.payment_date = new Date(updateRefundPaymentDto.payment_date);
    }

    if (updateRefundPaymentDto.payment_method) {
      updateData.payment_method = updateRefundPaymentDto.payment_method;
    }

    if (updateRefundPaymentDto.status) {
      updateData.status = updateRefundPaymentDto.status;
    }

    if (updateRefundPaymentDto.remarks !== undefined) {
      updateData.remarks = updateRefundPaymentDto.remarks;
    }

    updateData.updated_at = new Date();

    const updatedRefund = await this.prisma.refund_payments.update({
      where: { s_no: id },
      data: updateData,
      include: {
        tenants: {
          select: {
            s_no: true,
            tenant_id: true,
            name: true,
            phone_no: true,
          },
        },
        rooms: {
          select: {
            s_no: true,
            room_no: true,
          },
        },
        beds: {
          select: {
            s_no: true,
            bed_no: true,
          },
        },
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
          },
        },
      },
    });

    return ResponseUtil.success(updatedRefund, 'Refund payment updated successfully');
  }

  async remove(id: number, pg_id: number) {
    const refundPayment = await this.prisma.refund_payments.findFirst({
      where: {
        s_no: id,
        pg_id,
        is_deleted: false,
      },
    });

    if (!refundPayment) {
      throw new NotFoundException(`Refund payment with ID ${id} not found`);
    }

    await this.prisma.refund_payments.update({
      where: { s_no: id },
      data: {
        is_deleted: true,
        updated_at: new Date(),
      },
    });

    return ResponseUtil.noContent('Refund payment deleted successfully');
  }
}
