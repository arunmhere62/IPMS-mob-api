import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { CreateEmployeeSalaryDto } from './dto/create-employee-salary.dto';
import { UpdateEmployeeSalaryDto } from './dto/update-employee-salary.dto';

@Injectable()
export class EmployeeSalaryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new employee salary record
   */
  async create(pgId: number, createDto: CreateEmployeeSalaryDto) {
    // Check if salary already exists for this user and month
    const existing = await this.prisma.employee_salary.findFirst({
      where: {
        user_id: createDto.user_id,
        month: new Date(createDto.month),
        is_deleted: false,
      },
    });

    if (existing) {
      throw new BadRequestException('Salary record already exists for this employee and month');
    }

    const salary = await this.prisma.employee_salary.create({
      data: {
        user_id: createDto.user_id,
        pg_id: pgId,
        salary_amount: createDto.salary_amount,
        month: new Date(createDto.month),
        paid_date: createDto.paid_date ? new Date(createDto.paid_date) : null,
        payment_method: createDto.payment_method || null,
        remarks: createDto.remarks,
        is_deleted: false,
      },
      include: {
        users: {
          select: {
            s_no: true,
            name: true,
            email: true,
            phone: true,
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

    return ResponseUtil.success(salary, 'Employee salary record created successfully');
  }

  /**
   * Get all salary records for a PG location with pagination
   */
  async findAll(
    pgId: number,
    organizationId: number,
    page: number = 1,
    limit: number = 10,
    month?: number,
    year?: number,
  ) {
    if (!pgId) {
      throw new BadRequestException('PG Location ID is required');
    }

    if (!organizationId) {
      throw new BadRequestException('Organization ID is required');
    }

    const skip = (page - 1) * limit;

    const whereClause: any = {
      pg_id: pgId,
      is_deleted: false,
      pg_locations: {
        is_deleted: false,
        organization_id: organizationId,
      },
      users: {
        is_deleted: false,
      },
    };

    if (month) {
      if (month < 1 || month > 12) {
        throw new BadRequestException('Month must be between 1 and 12');
      }

      const yearToUse = year || new Date().getFullYear();
      const startDate = new Date(yearToUse, month - 1, 1);
      const endDate = new Date(yearToUse, month, 1);

      whereClause.month = {
        gte: startDate,
        lt: endDate,
      };
    }

    const [salaries, total] = await Promise.all([
      this.prisma.employee_salary.findMany({
        where: whereClause,
        orderBy: [
          { month: 'desc' },
          { paid_date: 'desc' },
        ],
        skip,
        take: limit,
        include: {
          users: {
            select: {
              s_no: true,
              name: true,
              email: true,
              phone: true,
              role_id: true,
            },
          },
          pg_locations: {
            select: {
              s_no: true,
              location_name: true,
              organization_id: true,
            },
          },
        },
      }),
      this.prisma.employee_salary.count({
        where: whereClause,
      }),
    ]);

    return ResponseUtil.paginated(salaries, total, page, limit, 'Salary records fetched successfully');
  }

  /**
   * Get salary records for a specific employee
   */
  async findByEmployee(userId: number, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [salaries, total] = await Promise.all([
      this.prisma.employee_salary.findMany({
        where: {
          user_id: userId,
          is_deleted: false,
        },
        orderBy: {
          month: 'desc',
        },
        skip,
        take: limit,
        include: {
          users: {
            select: {
              s_no: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          pg_locations: {
            select: {
              s_no: true,
              location_name: true,
            },
          },
        },
      }),
      this.prisma.employee_salary.count({
        where: {
          user_id: userId,
          is_deleted: false,
        },
      }),
    ]);

    return ResponseUtil.paginated(salaries, total, page, limit, 'Employee salary records fetched successfully');
  }

  /**
   * Get a single salary record by ID
   */
  async findOne(id: number) {
    const salary = await this.prisma.employee_salary.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        users: {
          select: {
            s_no: true,
            name: true,
            email: true,
            phone: true,
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

    if (!salary) {
      throw new NotFoundException('Salary record not found');
    }

    return ResponseUtil.success(salary, 'Salary record fetched successfully');
  }

  /**
   * Update a salary record
   */
  async update(id: number, updateDto: UpdateEmployeeSalaryDto) {
    // Check if salary exists
    const existing = await this.prisma.employee_salary.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existing) {
      throw new NotFoundException('Salary record not found');
    }

    const salary = await this.prisma.employee_salary.update({
      where: { s_no: id },
      data: {
        salary_amount: updateDto.salary_amount,
        paid_date: updateDto.paid_date ? new Date(updateDto.paid_date) : undefined,
        payment_method: updateDto.payment_method,
        remarks: updateDto.remarks,
      },
      include: {
        users: {
          select: {
            s_no: true,
            name: true,
            email: true,
            phone: true,
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

    return ResponseUtil.success(salary, 'Salary record updated successfully');
  }

  /**
   * Soft delete a salary record
   */
  async remove(id: number) {
    // Check if salary exists
    const existing = await this.prisma.employee_salary.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existing) {
      throw new NotFoundException('Salary record not found');
    }

    await this.prisma.employee_salary.update({
      where: { s_no: id },
      data: {
        is_deleted: true,
      },
    });

    return ResponseUtil.noContent('Salary record deleted successfully');
  }

  /**
   * Get salary statistics for a PG location
   */
  async getStats(pgId: number, organizationId: number, startMonth?: string, endMonth?: string) {
    if (!pgId) {
      throw new BadRequestException('PG Location ID is required');
    }

    if (!organizationId) {
      throw new BadRequestException('Organization ID is required');
    }

    const whereClause: any = {
      pg_id: pgId,
      is_deleted: false,
      pg_locations: {
        is_deleted: false,
        organization_id: organizationId,
      },
    };

    if (startMonth && endMonth) {
      whereClause.month = {
        gte: new Date(startMonth),
        lte: new Date(endMonth),
      };
    }

    const [totalSalaries, salariesByEmployee] = await Promise.all([
      this.prisma.employee_salary.aggregate({
        where: whereClause,
        _sum: {
          salary_amount: true,
        },
        _count: true,
      }),
      this.prisma.employee_salary.groupBy({
        by: ['user_id'],
        where: whereClause,
        _sum: {
          salary_amount: true,
        },
        _count: true,
      }),
    ]);

    return ResponseUtil.success({
      totalAmount: totalSalaries._sum.salary_amount || 0,
      totalCount: totalSalaries._count,
      byEmployee: salariesByEmployee,
    }, 'Salary statistics fetched successfully');
  }
}
