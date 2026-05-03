import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCurrentBillDto, UpdateCurrentBillDto } from './dto';
import { Decimal } from '@prisma/client/runtime/library';
import { ResponseUtil } from '../../../common/utils/response.util';

@Injectable()
export class CurrentBillService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new current bill
   * Supports two modes:
   * 1. Split bill for a room (split_equally=true): Creates bills for all active tenants in the room
   * 2. Individual bill for a tenant: Creates bill for a specific tenant
   */
  async create(createCurrentBillDto: CreateCurrentBillDto) {
    const { tenant_id, room_id, pg_id, bill_amount, bill_date, split_equally, remarks } =
      createCurrentBillDto;

    // Validate input
    if (!bill_amount || bill_amount <= 0) {
      throw new BadRequestException('Bill amount must be greater than 0');
    }

    // Mode 1: Split bill for a room
    if (split_equally && room_id && !tenant_id) {
      return this.createRoomBill(room_id, pg_id, bill_amount, bill_date, remarks);
    }

    // Mode 2: Individual bill for a tenant
    if (tenant_id && !split_equally) {
      return this.createIndividualBill(tenant_id, pg_id, bill_amount, bill_date, remarks);
    }

    // Invalid combination
    throw new BadRequestException(
      'Invalid parameters. Either provide room_id with split_equally=true for room bill, or tenant_id for individual bill',
    );
  }

  /**
   * Check if a bill already exists for the same month
   */
  private async billExistsForMonth(tenant_id: number, bill_date: Date): Promise<boolean> {
    const monthStart = new Date(bill_date.getFullYear(), bill_date.getMonth(), 1);
    const monthEnd = new Date(bill_date.getFullYear(), bill_date.getMonth() + 1, 0);

    const existingBill = await this.prisma.current_bills.findFirst({
      where: {
        tenant_id: tenant_id,
        bill_date: {
          gte: monthStart,
          lte: monthEnd,
        },
        is_deleted: false,
      },
    });

    return !!existingBill;
  }

  /**
   * Create bill for a room and split equally among all active tenants
   */
  private async createRoomBill(
    room_id: number,
    pg_id: number,
    total_bill_amount: number,
    bill_date?: string,
    remarks?: string,
  ) {
    // Verify room exists
    const room = await this.prisma.rooms.findFirst({
      where: {
        s_no: room_id,
        is_deleted: false,
      },
    });

    if (!room) {
      throw new NotFoundException(`Room with ID ${room_id} not found`);
    }

    // Get all active tenants in this room
    const tenants = await this.prisma.tenants.findMany({
      where: {
        room_id: room_id,
        is_deleted: false,
        status: 'ACTIVE',
      },
      select: {
        s_no: true,
        name: true,
        tenant_id: true,
      },
    });

    if (tenants.length === 0) {
      throw new BadRequestException(`No active tenants found in room ${room_id}`);
    }

    // Calculate bill per tenant
    const billPerTenant = new Decimal(total_bill_amount).dividedBy(new Decimal(tenants.length));

    // Create bills for each tenant
    const createdBills = [];
    const billDateObj = bill_date ? new Date(bill_date) : new Date();

    // Check if any tenant already has a bill for this month
    for (const tenant of tenants) {
      const billExists = await this.billExistsForMonth(tenant.s_no, billDateObj);
      if (billExists) {
        throw new BadRequestException(
          `Room already has a bill for ${billDateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}. Tenant ${tenant.name} already has a bill for this month.`,
        );
      }
    }

    for (const tenant of tenants) {
      const currentBill = await this.prisma.current_bills.create({
        data: {
          tenant_id: tenant.s_no,
          pg_id: pg_id,
          bill_amount: billPerTenant,
          bill_date: billDateObj,
        },
        include: {
          tenants: {
            select: {
              s_no: true,
              tenant_id: true,
              name: true,
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

      createdBills.push(currentBill);
    }

    return ResponseUtil.success(
      {
        bills: createdBills,
        total_bill_amount: total_bill_amount,
        bill_per_tenant: billPerTenant.toNumber(),
        tenant_count: tenants.length,
        bill_date: billDateObj,
      },
      `Current bill created and split equally among ${tenants.length} tenant(s)`,
    );
  }

  /**
   * Create bill for an individual tenant
   */
  private async createIndividualBill(
    tenant_id: number,
    pg_id: number,
    bill_amount: number,
    bill_date?: string,
    remarks?: string,
  ) {
    try {
      // Verify tenant exists
      const tenant = await this.prisma.tenants.findFirst({
        where: {
          s_no: tenant_id,
          is_deleted: false,
        },
      });

      if (!tenant) {
        throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);
      }

      // Check if bill already exists for this month
      const billDateObj = bill_date ? new Date(bill_date) : new Date();
      const billExists = await this.billExistsForMonth(tenant_id, billDateObj);
      if (billExists) {
        throw new BadRequestException(
          `${tenant.name} already has a bill for ${billDateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`,
        );
      }

      // Create individual bill
      const currentBill = await this.prisma.current_bills.create({
        data: {
          tenant_id: tenant_id,
          pg_id: pg_id,
          bill_amount: bill_amount,
          bill_date: bill_date ? new Date(bill_date) : new Date(),
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
          pg_locations: {
            select: {
              s_no: true,
              location_name: true,
            },
          },
        },
      });

      return ResponseUtil.success(currentBill, 'Current bill created successfully for tenant');
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Failed to create individual bill');
    }
  }

  /**
   * Get all current bills with filters
   */
  async findAll(
    pg_id: number,
    tenant_id?: number,
    room_id?: number,
    month?: string,
    year?: number,
    start_date?: string,
    end_date?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    try {
      const where: any = {
        pg_id: pg_id,
        is_deleted: false,
      };

      if (tenant_id) {
        where.tenant_id = tenant_id;
      }

      // Filter by month and year if provided
      if (month && year) {
        const monthIndex = new Date(`${month} 1, ${year}`).getMonth();
        const startOfMonth = new Date(year, monthIndex, 1);
        const endOfMonth = new Date(year, monthIndex + 1, 0);

        where.bill_date = {
          gte: startOfMonth,
          lte: endOfMonth,
        };
      } else if (start_date && end_date) {
        where.bill_date = {
          gte: new Date(start_date),
          lte: new Date(end_date),
        };
      }

      const skip = (page - 1) * limit;

      const [bills, total] = await Promise.all([
        this.prisma.current_bills.findMany({
          where,
          include: {
            tenants: {
              select: {
                s_no: true,
                tenant_id: true,
                name: true,
                phone_no: true,
              },
            },
            pg_locations: {
              select: {
                s_no: true,
                location_name: true,
              },
            },
          },
          skip,
          take: limit,
          orderBy: {
            bill_date: 'desc',
          },
        }),
        this.prisma.current_bills.count({ where }),
      ]);

      return ResponseUtil.paginated(
        bills,
        total,
        page,
        limit,
        'Current bills fetched successfully',
      );
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to fetch current bills');
    }
  }

  /**
   * Get a single current bill by ID
   */
  async findOne(id: number) {
    try {
      const bill = await this.prisma.current_bills.findFirst({
        where: {
          s_no: id,
          is_deleted: false,
        },
        include: {
          tenants: {
            select: {
              s_no: true,
              tenant_id: true,
              name: true,
              phone_no: true,
              email: true,
            },
          },
          pg_locations: {
            select: {
              s_no: true,
              location_name: true,
              address: true,
            },
          },
        },
      });

      if (!bill) {
        throw new NotFoundException(`Current bill with ID ${id} not found`);
      }

      return ResponseUtil.success(bill, 'Current bill fetched successfully');
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Failed to fetch current bill');
    }
  }

  /**
   * Update a current bill
   */
  async update(id: number, updateCurrentBillDto: UpdateCurrentBillDto) {
    try {
      // Check if bill exists
      const existingBill = await this.prisma.current_bills.findFirst({
        where: {
          s_no: id,
          is_deleted: false,
        },
      });

      if (!existingBill) {
        throw new NotFoundException(`Current bill with ID ${id} not found`);
      }

      const updateData: any = {};

      if (updateCurrentBillDto.bill_amount !== undefined) {
        if (updateCurrentBillDto.bill_amount <= 0) {
          throw new BadRequestException('Bill amount must be greater than 0');
        }
        updateData.bill_amount = updateCurrentBillDto.bill_amount;
      }

      if (updateCurrentBillDto.bill_date) {
        updateData.bill_date = new Date(updateCurrentBillDto.bill_date);
      }

      if (updateCurrentBillDto.remarks !== undefined) {
        updateData.remarks = updateCurrentBillDto.remarks;
      }

      updateData.updated_at = new Date();

      const bill = await this.prisma.current_bills.update({
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
          pg_locations: {
            select: {
              s_no: true,
              location_name: true,
            },
          },
        },
      });

      return ResponseUtil.success(bill, 'Current bill updated successfully');
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Failed to update current bill');
    }
  }

  /**
   * Delete a current bill (soft delete)
   */
  async remove(id: number) {
    try {
      const bill = await this.prisma.current_bills.findFirst({
        where: {
          s_no: id,
          is_deleted: false,
        },
      });

      if (!bill) {
        throw new NotFoundException(`Current bill with ID ${id} not found`);
      }

      await this.prisma.current_bills.update({
        where: { s_no: id },
        data: {
          is_deleted: true,
          updated_at: new Date(),
        },
      });

      return ResponseUtil.noContent('Current bill deleted successfully');
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Failed to delete current bill');
    }
  }

  /**
   * Get current bills for a specific month and year
   */
  async findByMonth(pg_id: number, month: number, year: number, tenant_id?: number) {
    try {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0);

      const where: any = {
        pg_id: pg_id,
        is_deleted: false,
        bill_date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      };

      if (tenant_id) {
        where.tenant_id = tenant_id;
      }

      const bills = await this.prisma.current_bills.findMany({
        where,
        include: {
          tenants: {
            select: {
              s_no: true,
              tenant_id: true,
              name: true,
              phone_no: true,
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
          created_at: 'desc',
        },
      });

      const totalAmount = bills.reduce(
        (sum, bill) => sum + parseFloat(bill.bill_amount.toString()),
        0,
      );

      return ResponseUtil.success(
        {
          bills,
          summary: {
            month,
            year,
            total_bills: bills.length,
            total_amount: totalAmount,
          },
        },
        'Bills fetched successfully for the month',
      );
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to fetch bills for the month');
    }
  }
}
