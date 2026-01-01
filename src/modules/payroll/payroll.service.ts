import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { GeneratePayrollRunDto } from './dto/generate-payroll-run.dto';
import { CreatePayrollItemPaymentDto } from './dto/create-payroll-item-payment.dto';

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  private normalizeMonth(month: string): Date {
    const d = new Date(month);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid month');
    }
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  async generateRun(pgId: number, organizationId: number, generatedBy: number, dto: GeneratePayrollRunDto) {
    if (!pgId) throw new BadRequestException('PG Location ID is required');
    if (!organizationId) throw new BadRequestException('Organization ID is required');
    if (!generatedBy) throw new BadRequestException('User ID is required');

    const monthDate = this.normalizeMonth(dto.month);

    const pg = await this.prisma.pg_locations.findFirst({
      where: { s_no: pgId, is_deleted: false, organization_id: organizationId },
      select: { s_no: true },
    });
    if (!pg) {
      throw new NotFoundException('PG location not found');
    }

    const existing = await this.prisma.payroll_runs.findFirst({
      where: { pg_id: pgId, month: monthDate },
      select: { s_no: true },
    });
    if (existing) {
      throw new BadRequestException('Payroll already generated for this PG and month');
    }

    const assignments = await this.prisma.pg_users.findMany({
      where: {
        pg_id: pgId,
        is_active: true,
        users: {
          is_deleted: false,
          roles: {
            role_name: {
              not: 'SUPER_ADMIN',
            },
          },
        },
      },
      select: {
        user_id: true,
        monthly_salary_amount: true,
      },
      orderBy: { created_at: 'asc' },
    });

    if (!assignments.length) {
      throw new BadRequestException('No active employees found for this PG');
    }

    const missingSalaryUserIds = assignments
      .filter((a) => a.monthly_salary_amount === null || a.monthly_salary_amount === undefined)
      .map((a) => a.user_id);

    if (missingSalaryUserIds.length) {
      throw new BadRequestException(
        `Salary not set for ${missingSalaryUserIds.length} employee(s). Please set monthly salary before generating.`,
      );
    }

    const run = await this.prisma.$transaction(async (tx) => {
      const createdRun = await tx.payroll_runs.create({
        data: {
          organization_id: organizationId,
          pg_id: pgId,
          month: monthDate,
          status: 'GENERATED',
          generated_by: generatedBy,
        },
      });

      await tx.payroll_run_items.createMany({
        data: assignments.map((a) => ({
          run_id: createdRun.s_no,
          pg_id: pgId,
          user_id: a.user_id,
          net_amount: a.monthly_salary_amount!,
          status: 'GENERATED',
        })),
      });

      return createdRun;
    });

    const itemsCount = await this.prisma.payroll_run_items.count({ where: { run_id: run.s_no } });

    return ResponseUtil.created({ run_id: run.s_no, month: run.month, items_count: itemsCount }, 'Payroll generated');
  }

  async listRuns(pgId: number, organizationId: number, page: number = 1, limit: number = 10) {
    if (!pgId) throw new BadRequestException('PG Location ID is required');
    if (!organizationId) throw new BadRequestException('Organization ID is required');

    const skip = (page - 1) * limit;

    const whereClause: any = {
      pg_id: pgId,
      pg_locations: { is_deleted: false, organization_id: organizationId },
    };

    const [runs, total] = await Promise.all([
      this.prisma.payroll_runs.findMany({
        where: whereClause,
        orderBy: { month: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payroll_runs.count({ where: whereClause }),
    ]);

    return ResponseUtil.paginated(runs, total, page, limit, 'Payroll runs fetched successfully');
  }

  async getRunDetails(pgId: number, organizationId: number, runId: number) {
    if (!pgId) throw new BadRequestException('PG Location ID is required');
    if (!organizationId) throw new BadRequestException('Organization ID is required');

    const run = await this.prisma.payroll_runs.findFirst({
      where: {
        s_no: runId,
        pg_id: pgId,
        pg_locations: { is_deleted: false, organization_id: organizationId },
      },
      include: {
        payroll_run_items: {
          include: {
            users: {
              select: { s_no: true, name: true, phone: true, email: true },
            },
            payroll_item_payments: {
              orderBy: { paid_date: 'desc' },
            },
          },
          orderBy: { s_no: 'asc' },
        },
      },
    });

    if (!run) throw new NotFoundException('Payroll run not found');

    const itemsWithTotals = run.payroll_run_items.map((i) => {
      const totalPaid = i.payroll_item_payments.reduce((sum, p) => sum + Number(p.paid_amount), 0);
      const due = Number(i.net_amount);
      return {
        ...i,
        total_paid: totalPaid,
        balance_amount: Number((due - totalPaid).toFixed(2)),
      };
    });

    return ResponseUtil.success({ ...run, payroll_run_items: itemsWithTotals }, 'Payroll run fetched successfully');
  }

  async addItemPayment(pgId: number, organizationId: number, userId: number, itemId: number, dto: CreatePayrollItemPaymentDto) {
    if (!pgId) throw new BadRequestException('PG Location ID is required');
    if (!organizationId) throw new BadRequestException('Organization ID is required');
    if (!userId) throw new BadRequestException('User ID is required');

    const item = await this.prisma.payroll_run_items.findFirst({
      where: {
        s_no: itemId,
        pg_id: pgId,
        payroll_runs: {
          pg_locations: { is_deleted: false, organization_id: organizationId },
        },
      },
      include: {
        payroll_runs: true,
        payroll_item_payments: true,
      },
    });

    if (!item) throw new NotFoundException('Payroll item not found');

    if (item.payroll_runs.status !== 'GENERATED') {
      throw new BadRequestException('Cannot add payment to a non-generated payroll run');
    }

    const alreadyPaid = item.payroll_item_payments.reduce((sum, p) => sum + Number(p.paid_amount), 0);
    const due = Number(item.net_amount);
    const nextPaid = alreadyPaid + Number(dto.paid_amount);

    if (nextPaid - due > 0.0001) {
      throw new BadRequestException('Paid amount exceeds due amount');
    }

    const paidDate = new Date(dto.paid_date);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.payroll_item_payments.create({
        data: {
          item_id: itemId,
          paid_amount: dto.paid_amount,
          paid_date: paidDate,
          payment_method: dto.payment_method || null,
          remarks: dto.remarks,
          created_by: userId,
        },
      });

      const totalPaid = nextPaid;
      const newStatus = totalPaid >= due - 0.0001 ? 'PAID' : 'PARTIALLY_PAID';

      const updatedItem = await tx.payroll_run_items.update({
        where: { s_no: itemId },
        data: { status: newStatus },
      });

      const unpaidCount = await tx.payroll_run_items.count({
        where: {
          run_id: item.run_id,
          status: { in: ['GENERATED', 'PARTIALLY_PAID'] },
        },
      });

      if (unpaidCount === 0) {
        await tx.payroll_runs.update({
          where: { s_no: item.run_id },
          data: { status: 'LOCKED' },
        });
      }

      return updatedItem;
    });

    return ResponseUtil.success(updated, 'Payment recorded successfully');
  }
}
