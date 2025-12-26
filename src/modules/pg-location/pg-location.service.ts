import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreatePgLocationDto } from './dto/create-pg-location.dto';
import { UpdatePgLocationDto } from './dto/update-pg-location.dto';
import { ResponseUtil } from '../../common/utils/response.util';
import { S3DeletionService } from '../common/s3-deletion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionRestrictionService } from '../subscription/subscription-restriction.service';

@Injectable()
export class PgLocationService {
  constructor(
    private prisma: PrismaService,
    private s3DeletionService: S3DeletionService,
    private subscriptionRestrictionService: SubscriptionRestrictionService,
  ) {}

  /**
   * Get all PG locations for a user's organization
   */
  async findAll(userId: number, organizationId: number) {
    const pgLocations = await this.prisma.pg_locations.findMany({
      where: {
        organization_id: organizationId,
        is_deleted: false,
      },
      select: {
        s_no: true,
        user_id: true,
        location_name: true,
        address: true,
        pincode: true,
        status: true,
        images: true,
        city_id: true,
        state_id: true,
        organization_id: true,
        created_at: true,
        updated_at: true,
        rent_cycle_type: true,
        rent_cycle_start: true,
        rent_cycle_end: true,
        pg_type: true,
        city: {
          select: {
            s_no: true,
            name: true,
            state_code: true,
          },
        },
        state: {
          select: {
            s_no: true,
            name: true,
            iso_code: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return ResponseUtil.success(pgLocations, 'PG locations fetched successfully');
  }

  /**
   * Get a single PG location by ID
   */
  async findOne(id: number, userId: number, organizationId: number) {
    const pgLocation = await this.prisma.pg_locations.findFirst({
      where: {
        s_no: id,
        organization_id: organizationId,
        is_deleted: false,
      },
      select: {
        s_no: true,
        user_id: true,
        location_name: true,
        address: true,
        pincode: true,
        status: true,
        images: true,
        city_id: true,
        state_id: true,
        organization_id: true,
        created_at: true,
        updated_at: true,
        rent_cycle_type: true,
        rent_cycle_start: true,
        rent_cycle_end: true,
        pg_type: true,
        city: {
          select: {
            s_no: true,
            name: true,
            state_code: true,
          },
        },
        state: {
          select: {
            s_no: true,
            name: true,
            iso_code: true,
          },
        },
        organization: {
          select: {
            s_no: true,
            name: true,
          },
        },
      },
    });

    if (!pgLocation) {
      throw new NotFoundException('PG location not found');
    }

    return ResponseUtil.success(pgLocation, 'PG location fetched successfully');
  }

  /**
   * Create a new PG location
   */
  async create(
    createPgLocationDto: CreatePgLocationDto,
    userId: number,
    organizationId: number,
  ) {
    const { 
      locationName, 
      address, 
      pincode, 
      stateId, 
      cityId, 
      images,
      rentCycleType,
      rentCycleStart,
      rentCycleEnd,
      pgType,
    } = createPgLocationDto;

    await this.subscriptionRestrictionService.assertCanCreatePgLocationForOrganization(organizationId);

    try {
      const newPgLocation = await this.prisma.pg_locations.create({
        data: {
          user_id: userId,
          location_name: locationName,
          address,
          pincode,
          status: 'ACTIVE',
          organization_id: organizationId,
          city_id: cityId,
          state_id: stateId,
          images: images || [],
          is_deleted: false,
          rent_cycle_type: rentCycleType || 'CALENDAR',
          rent_cycle_start: rentCycleStart || null,
          rent_cycle_end: rentCycleEnd || null,
          pg_type: pgType || 'COLIVING',
        },
        include: {
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
        },
      });

      return ResponseUtil.success(newPgLocation, 'PG location created successfully');
    } catch (error) {
      console.error('Create PG location error:', error);

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException('Failed to create PG location');
    }
  }

  /**
   * Update a PG location
   */
  async update(
    id: number,
    updatePgLocationDto: UpdatePgLocationDto,
    userId: number,
    organizationId: number,
  ) {
    // Check if PG location exists and belongs to the organization
    const existingPg = await this.prisma.pg_locations.findFirst({
      where: {
        s_no: id,
        organization_id: organizationId,
        is_deleted: false,
      },
    });

    if (!existingPg) {
      throw new NotFoundException('PG location not found');
    }

    // Check if rent cycle type is being changed and if any rent payments exist
    if (
      updatePgLocationDto.rentCycleType &&
      updatePgLocationDto.rentCycleType !== existingPg.rent_cycle_type
    ) {
      const rentPaymentCount = await this.prisma.tenant_payments.count({
        where: {
          pg_id: id,
          is_deleted : false
        },
      });

      if (rentPaymentCount > 0) {
        throw new BadRequestException(
          `Cannot change rent cycle type. ${rentPaymentCount} rent payment(s) already exist for this PG location. Changing the rent cycle type will affect all existing and future payments.`
        );
      }
    }

    // Handle S3 image deletion if images are being updated
    if (updatePgLocationDto.images !== undefined) {
      const oldImages = (Array.isArray(existingPg.images) ? existingPg.images : []) as string[];
      const newImages = (Array.isArray(updatePgLocationDto.images) ? updatePgLocationDto.images : []) as string[];
      
      try {
        await this.s3DeletionService.deleteRemovedFiles(
          oldImages,
          newImages,
          'pg-location',
          'images',
        );
      } catch (s3Error) {
        console.error('S3 deletion error:', s3Error);
        // Continue with update even if S3 deletion fails
      }
    }

    try {
      const updatedPgLocation = await this.prisma.pg_locations.update({
        where: {
          s_no: id,
        },
        data: {
          location_name: updatePgLocationDto.locationName,
          address: updatePgLocationDto.address,
          pincode: updatePgLocationDto.pincode,
          city_id: updatePgLocationDto.cityId,
          state_id: updatePgLocationDto.stateId,
          images: updatePgLocationDto.images,
          status: updatePgLocationDto.status,
          rent_cycle_type: updatePgLocationDto.rentCycleType,
          rent_cycle_start: updatePgLocationDto.rentCycleStart,
          rent_cycle_end: updatePgLocationDto.rentCycleEnd,
          pg_type: updatePgLocationDto.pgType,
          updated_at: new Date(),
        },
        include: {
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
        },
      });

      return ResponseUtil.success(updatedPgLocation, 'PG location updated successfully');
    } catch (error) {
      console.error('Update PG location error:', error);
      throw new BadRequestException('Failed to update PG location');
    }
  }

  /**
   * Soft delete a PG location
   */
  async remove(id: number, userId: number, organizationId: number) {
    // Check if PG location exists and belongs to the organization
    const existingPg = await this.prisma.pg_locations.findFirst({
      where: {
        s_no: id,
        organization_id: organizationId,
        is_deleted: false,
      },
    });

    if (!existingPg) {
      throw new NotFoundException('PG location not found');
    }

    // Check if this is the organization's last PG location
    const pgCountInOrganization = await this.prisma.pg_locations.count({
      where: {
        organization_id: organizationId,
        is_deleted: false,
      },
    });

    if (pgCountInOrganization === 1) {
      throw new BadRequestException(
        'Cannot delete the last PG location of the organization. An organization must have at least one PG location.',
      );
    }

    // Check if PG location has any rooms
    const roomCount = await this.prisma.rooms.count({
      where: {
        pg_id: id,
        is_deleted: false,
      },
    });

    if (roomCount > 0) {
      throw new BadRequestException(
        `Cannot delete PG location. It has ${roomCount} room(s) associated with it. Please delete all rooms first.`,
      );
    }

    try {
      await this.prisma.pg_locations.update({
        where: {
          s_no: id,
        },
        data: {
          is_deleted: true,
          updated_at: new Date(),
        },
      });

      return ResponseUtil.success(null, 'PG location deleted successfully');
    } catch (error) {
      console.error('Delete PG location error:', error);
      throw new BadRequestException('Failed to delete PG location');
    }
  }

  /**
   * Get PG location statistics
   */
  async getStats(userId: number, organizationId: number) {
    try {
      const [total, active, inactive] = await Promise.all([
        this.prisma.pg_locations.count({
          where: {
            organization_id: organizationId,
            is_deleted: false,
          },
        }),
        this.prisma.pg_locations.count({
          where: {
            organization_id: organizationId,
            status: 'ACTIVE',
            is_deleted: false,
          },
        }),
        this.prisma.pg_locations.count({
          where: {
            organization_id: organizationId,
            status: 'INACTIVE',
            is_deleted: false,
          },
        }),
      ]);

      return ResponseUtil.success({
        total,
        active,
        inactive,
      }, 'PG location stats fetched successfully');
    } catch (error) {
      throw new BadRequestException('Failed to fetch PG location stats');
    }
  }

  /**
   * Get comprehensive summary for a specific PG location
   */
  async getSummary(pgId: number, userId: number, organizationId: number) {
    try {
      // Verify PG location exists and belongs to organization
      const pgLocation = await this.prisma.pg_locations.findFirst({
        where: {
          s_no: pgId,
          organization_id: organizationId,
          is_deleted: false,
        },
        select: {
          s_no: true,
          location_name: true,
          address: true,
          status: true,
        },
      });

      if (!pgLocation) {
        throw new NotFoundException('PG location not found');
      }

      // Get all statistics in parallel
      const [
        allRooms,
        allBeds,
        tenantStats,
        employeeStats,
      ] = await Promise.all([
        // Get all rooms with tenant info
        this.prisma.rooms.findMany({
          where: {
            pg_id: pgId,
            is_deleted: false,
          },
          include: {
            tenants: {
              where: {
                status: 'ACTIVE',
                is_deleted: false,
              },
            },
          },
        }),
        // Get all beds with tenant info
        this.prisma.beds.findMany({
          where: {
            rooms: {
              pg_id: pgId,
              is_deleted: false,
            },
            is_deleted: false,
          },
          include: {
            tenants: {
              where: {
                status: 'ACTIVE',
                is_deleted: false,
              },
            },
          },
        }),
        // Tenant statistics
        this.prisma.tenants.groupBy({
          by: ['status'],
          where: {
            pg_id: pgId,
            is_deleted: false,
          },
          _count: true,
        }),
        // Employee count
        this.prisma.employee_salary.count({
          where: {
            pg_id: pgId,
            is_deleted: false,
          },
        }),
      ]);

      // Process room statistics
      const totalRooms = allRooms.length;
      const occupiedRooms = allRooms.filter(room => room.tenants.length > 0).length;
      const vacantRooms = totalRooms - occupiedRooms;
      const maintenanceRooms = 0; // No maintenance status in schema

      // Process bed statistics
      const totalBeds = allBeds.length;
      const occupiedBeds = allBeds.filter(bed => bed.tenants.length > 0).length;
      const vacantBeds = totalBeds - occupiedBeds;
      const maintenanceBeds = 0; // No maintenance status in schema

      // Process tenant statistics
      const totalTenants = tenantStats.reduce((acc, curr) => acc + curr._count, 0);
      const activeTenants = tenantStats.find(t => t.status === 'ACTIVE')?._count || 0;
      const inactiveTenants = tenantStats.find(t => t.status === 'INACTIVE')?._count || 0;

      // Calculate occupancy rate
      const roomOccupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(1) : '0.0';
      const bedOccupancyRate = totalBeds > 0 ? ((occupiedBeds / totalBeds) * 100).toFixed(1) : '0.0';

      return ResponseUtil.success({
        pgLocation: {
          id: pgLocation.s_no,
          name: pgLocation.location_name,
          address: pgLocation.address,
          status: pgLocation.status,
        },
        rooms: {
          total: totalRooms,
          occupied: occupiedRooms,
          vacant: vacantRooms,
          maintenance: maintenanceRooms,
          occupancyRate: parseFloat(roomOccupancyRate),
        },
        beds: {
          total: totalBeds,
          occupied: occupiedBeds,
          vacant: vacantBeds,
          maintenance: maintenanceBeds,
          occupancyRate: parseFloat(bedOccupancyRate),
        },
        tenants: {
          total: totalTenants,
          active: activeTenants,
          inactive: inactiveTenants,
        },
        employees: {
          total: employeeStats,
        },
      }, 'PG location summary fetched successfully');
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Get PG summary error:', error);
      throw new BadRequestException('Failed to fetch PG location summary');
    }
  }

  /**
   * Get detailed information for a specific PG location
   */
  async getDetails(pgId: number, userId: number, organizationId: number) {
    try {
      // Verify PG location exists and belongs to organization
      const pgLocation = await this.prisma.pg_locations.findFirst({
        where: {
          s_no: pgId,
          organization_id: organizationId,
          is_deleted: false,
        },
        include: {
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
          rooms: {
            where: {
              is_deleted: false,
            },
            include: {
              beds: {
                where: {
                  is_deleted: false,
                },
                include: {
                  tenants: {
                    where: {
                      is_deleted: false,
                      status: 'ACTIVE',
                    },
                    select: {
                      s_no: true,
                      name: true,
                      phone_no: true,
                      check_in_date: true,
                      check_out_date: true,
                    },
                  },
                  tenant_payments: {
                    where: {
                      is_deleted: false,
                      status: 'PAID',
                    },
                    select: {
                      s_no: true,
                      amount_paid: true,
                      payment_date: true,
                      start_date: true,
                      end_date: true,
                      actual_rent_amount: true,
                    },
                    orderBy: {
                      created_at: 'desc',
                    },
                    take: 1,
                  },
                },
              },
            },
          },
          tenants: {
            where: {
              is_deleted: false,
            },
            select: {
              s_no: true,
              name: true,
              phone_no: true,
              status: true,
              check_in_date: true,
              check_out_date: true,
              created_at: true,
            },
          },
        },
      });

      if (!pgLocation) {
        throw new NotFoundException('PG location not found');
      }

      // Calculate room and bed statistics
      const rooms = pgLocation.rooms || [];
      const tenants = pgLocation.tenants || [];
      const totalRooms = rooms.length;
      
      let totalBeds = 0;
      let occupiedBeds = 0;
      let availableBeds = 0;
      let totalRevenue = 0;
      
      // Calculate tenant statistics
      const activeTenants = tenants.filter(tenant => tenant.status === 'ACTIVE').length;
      const inactiveTenants = tenants.filter(tenant => tenant.status === 'INACTIVE').length;
      
      const roomDetails = rooms.map(room => {
        const beds = room.beds || [];
        const roomTotalBeds = beds.length;
        const roomOccupiedBeds = beds.filter(bed => bed.tenants && bed.tenants.length > 0).length;
        const roomAvailableBeds = roomTotalBeds - roomOccupiedBeds;
        
        totalBeds += roomTotalBeds;
        occupiedBeds += roomOccupiedBeds;
        availableBeds += roomAvailableBeds;
        
        // Calculate room revenue from latest payments
        const roomRevenue = beds.reduce((sum, bed) => {
          const latestPayment = bed.tenant_payments && bed.tenant_payments[0];
          return sum + Number(latestPayment?.actual_rent_amount || 0);
        }, 0);
        totalRevenue += roomRevenue;
        
        return {
          s_no: room.s_no,
          room_no: room.room_no,
          total_beds: roomTotalBeds,
          occupied_beds: roomOccupiedBeds,
          available_beds: roomAvailableBeds,
          occupancy_rate: roomTotalBeds > 0 ? (roomOccupiedBeds / roomTotalBeds) * 100 : 0,
          beds: beds.map(bed => ({
            s_no: bed.s_no,
            bed_no: bed.bed_no,
            price: bed.bed_price,
            is_occupied: bed.tenants && bed.tenants.length > 0,
            tenant: bed.tenants && bed.tenants.length > 0 ? {
              name: bed.tenants[0].name,
              phone_no: bed.tenants[0].phone_no,
              check_in_date: bed.tenants[0].check_in_date,
              check_out_date: bed.tenants[0].check_out_date,
            } : null,
            latest_payment: bed.tenant_payments && bed.tenant_payments.length > 0 ? {
              amount_paid: bed.tenant_payments[0].amount_paid,
              payment_date: bed.tenant_payments[0].payment_date,
              start_date: bed.tenant_payments[0].start_date,
              end_date: bed.tenant_payments[0].end_date,
              actual_rent_amount: bed.tenant_payments[0].actual_rent_amount,
            } : null,
          })),
        };
      });

      // Prepare response data
      const responseData = {
        ...pgLocation,
        room_statistics: {
          total_rooms: totalRooms,
          total_beds: totalBeds,
          occupied_beds: occupiedBeds,
          available_beds: availableBeds,
          occupancy_rate: totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0,
          total_monthly_revenue: totalRevenue,
        },
        tenant_statistics: {
          total_tenants: tenants.length,
          active_tenants: activeTenants,
          inactive_tenants: inactiveTenants,
          occupancy_rate: totalBeds > 0 ? (activeTenants / totalBeds) * 100 : 0,
        },
        room_details: roomDetails,
        tenant_details: tenants.map(tenant => ({
          s_no: tenant.s_no,
          name: tenant.name,
          phone_no: tenant.phone_no,
          status: tenant.status,
          check_in_date: tenant.check_in_date,
          check_out_date: tenant.check_out_date,
          created_at: tenant.created_at,
        })),
      };

      return ResponseUtil.success(responseData, 'PG location details fetched successfully');
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Get PG details error:', error);
      throw new BadRequestException('Failed to fetch PG location details');
    }
  }

  /**
   * Get financial analytics for a specific PG location with monthly breakdown
   */
  async getFinancialAnalytics(pgId: number, userId: number, organizationId: number, months: number = 6) {
    try {
      // Verify PG location exists and belongs to organization
      const pgLocation = await this.prisma.pg_locations.findFirst({
        where: {
          s_no: pgId,
          organization_id: organizationId,
          is_deleted: false,
        },
      });

      if (!pgLocation) {
        throw new NotFoundException('PG location not found');
      }

      // Get monthly data for the last N months
      const monthlyData = [];
      const currentDate = new Date();

      for (let i = months - 1; i >= 0; i--) {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() - i + 1, 0, 23, 59, 59);

        // Get rent payments (revenue)
        const rentPayments = await this.prisma.tenant_payments.aggregate({
          where: {
            pg_id: pgId,
            is_deleted: false,
            status: 'PAID',
            payment_date: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
          _sum: {
            amount_paid: true,
          },
        });

        // Get advance payments (revenue)
        const advancePayments = await this.prisma.advance_payments.aggregate({
          where: {
            pg_id: pgId,
            is_deleted: false,
            payment_date: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
          _sum: {
            amount_paid: true,
          },
        });

        // Get expenses (loss)
        const expenses = await this.prisma.expenses.aggregate({
          where: {
            pg_id: pgId,
            is_deleted: false,
            paid_date: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
          _sum: {
            amount: true,
          },
        });

        // Get salary payments (loss)
        const salaries = await this.prisma.employee_salary.aggregate({
          where: {
            pg_id: pgId,
            is_deleted: false,
            paid_date: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
          _sum: {
            salary_amount: true,
          },
        });

        const totalRevenue = 
          Number(rentPayments._sum.amount_paid || 0) + 
          Number(advancePayments._sum.amount_paid || 0);

        const totalExpenses = 
          Number(expenses._sum.amount || 0) + 
          Number(salaries._sum.salary_amount || 0);

        const profit = totalRevenue - totalExpenses;

        monthlyData.push({
          month: monthStart.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
          year: monthStart.getFullYear(),
          monthNumber: monthStart.getMonth() + 1,
          revenue: {
            rentPayments: Number(rentPayments._sum.amount_paid || 0),
            advancePayments: Number(advancePayments._sum.amount_paid || 0),
            total: totalRevenue,
          },
          expenses: {
            generalExpenses: Number(expenses._sum.amount || 0),
            salaries: Number(salaries._sum.salary_amount || 0),
            total: totalExpenses,
          },
          profit: profit,
          profitPercentage: totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(2) : '0.00',
        });
      }

      // Calculate totals
      const totals = monthlyData.reduce(
        (acc, month) => ({
          revenue: acc.revenue + month.revenue.total,
          expenses: acc.expenses + month.expenses.total,
          profit: acc.profit + month.profit,
        }),
        { revenue: 0, expenses: 0, profit: 0 }
      );

      return ResponseUtil.success({
        pgLocation: {
          id: pgLocation.s_no,
          name: pgLocation.location_name,
        },
        monthlyData,
        totals: {
          ...totals,
          profitPercentage: totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(2) : '0.00',
        },
      }, 'Financial analytics fetched successfully');
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Get financial analytics error:', error);
      throw new BadRequestException('Failed to fetch financial analytics');
    }
  }

  /**
   * Get tenants with pending or partial rent payments for a specific PG location
   * Checks all monthly payments since check-in date, including any missing months in between
   */
  async getTenantRentPaymentStatus(pgId: number, userId: number, organizationId: number) {
    try {
      // Verify PG location exists and belongs to organization
      const pgLocation = await this.prisma.pg_locations.findFirst({
        where: {
          s_no: pgId,
          organization_id: organizationId,
          is_deleted: false,
        },
      });

      if (!pgLocation) {
        throw new NotFoundException('PG location not found');
      }

      // Get active tenants with their payment history
      const tenants = await this.prisma.tenants.findMany({
        where: {
          pg_id: pgId,
          status: 'ACTIVE',
          is_deleted: false,
        },
        select: {
          s_no: true,
          tenant_id: true,
          name: true,
          phone_no: true,
          email: true,
          check_in_date: true,
          room_id: true,
          bed_id: true,
          rooms: {
            select: {
              room_no: true,
            },
          },
          beds: {
            select: {
              bed_no: true,
              bed_price: true,
            },
          },
          tenant_payments: {
            where: {
              is_deleted: false,
            },
            orderBy: {
              payment_date: 'desc',
            },
            select: {
              s_no: true,
              amount_paid: true,
              actual_rent_amount: true,
              payment_date: true,
              status: true,
              start_date: true,
              end_date: true,
            },
          },
        },
      });

      const currentDate = new Date();
      const tenantsWithPaymentIssues = [];

      // Process each tenant's payment history
      for (const tenant of tenants) {
        const checkInDate = new Date(tenant.check_in_date);
        const rentPrice = Number(tenant.beds?.bed_price || 0);
        
        if (rentPrice === 0) continue; // Skip if rent price is not set
        
        // Calculate expected payment months since check-in
        const expectedPayments = this.getExpectedPaymentMonths(checkInDate, currentDate);
        
        // Map actual payments by month-year
        const actualPayments = new Map();
        tenant.tenant_payments.forEach(payment => {
          const paymentDate = new Date(payment.payment_date);
          // Create a standardized key for month-year comparison
          const monthYearKey = `${paymentDate.getMonth()}-${paymentDate.getFullYear()}`;
          
          // If there are multiple payments for the same month, keep the one with issues
          // (PARTIAL or PENDING takes precedence over PAID)
          if (!actualPayments.has(monthYearKey) || 
              (payment.status !== 'PAID' && actualPayments.get(monthYearKey).status === 'PAID')) {
            actualPayments.set(monthYearKey, payment);
          }
        });
        
        // Find missing or partial payments
        const missingPayments = [];
        const partialPayments = [];
        
        expectedPayments.forEach(expectedDate => {
          // Skip future months - we shouldn't expect payments for months that haven't occurred yet
          if (expectedDate > currentDate) return;
          
          const monthYearKey = `${expectedDate.getMonth()}-${expectedDate.getFullYear()}`;
          const payment = actualPayments.get(monthYearKey);
          
          if (!payment) {
            // Missing payment for this month
            missingPayments.push({
              expected_date: expectedDate,
              month: expectedDate.toLocaleString('default', { month: 'long' }),
              year: expectedDate.getFullYear(),
              amount: rentPrice,
              // Add a status field to make it clear this is a missing payment
              status: 'MISSING'
            });
          } else if (payment.status === 'PARTIAL' || payment.status === 'PENDING') {
            // Partial or pending payment for this month
            const actualRent = Number(payment.actual_rent_amount);
            const amountPaid = payment.status === 'PENDING' ? 0 : Number(payment.amount_paid);
            const dueAmount = actualRent - amountPaid;
            
            partialPayments.push({
              payment_id: payment.s_no,
              payment_date: payment.payment_date,
              month: new Date(payment.payment_date).toLocaleString('default', { month: 'long' }),
              year: new Date(payment.payment_date).getFullYear(),
              actual_rent: actualRent,
              amount_paid: amountPaid,
              due_amount: dueAmount,
              status: payment.status,
              // Add a flag to easily identify if this is a pending payment with no amount paid yet
              is_fully_pending: payment.status === 'PENDING',
            });
          }
        });
        
        // Check if there are any pending payments from the latest month
        const latestPayment = tenant.tenant_payments[0];
        const hasPendingCurrentPayment = latestPayment && latestPayment.status === 'PENDING';
        const hasPartialCurrentPayment = latestPayment && latestPayment.status === 'PARTIAL';
        
        // Only add tenant to the list if they have missing payments, partial payments, or pending current payment
        // Explicitly exclude tenants with all PAID payments and no missing payments
        if (missingPayments.length > 0 || partialPayments.length > 0 || hasPendingCurrentPayment || hasPartialCurrentPayment) {
          let totalDueAmount = 0;
          
          // Calculate total due from missing payments
          missingPayments.forEach(payment => {
            totalDueAmount += payment.amount;
          });
          
          // Add due amounts from partial payments
          partialPayments.forEach(payment => {
            totalDueAmount += payment.due_amount;
          });
          
          // Add due amount from pending current payment if exists
          if (hasPendingCurrentPayment) {
            totalDueAmount += Number(latestPayment.actual_rent_amount);
          }
          
          // Determine the overall payment status based on all issues
          let overallStatus = 'PAID';
          if (missingPayments.length > 0) {
            overallStatus = 'MISSING_PAYMENTS';
          } else if (partialPayments.length > 0) {
            overallStatus = 'PARTIAL_PAYMENTS';
          } else if (hasPendingCurrentPayment) {
            overallStatus = 'PENDING';
          }

          tenantsWithPaymentIssues.push({
            id: tenant.s_no,
            tenant_id: tenant.tenant_id,
            name: tenant.name,
            phone: tenant.phone_no,
            email: tenant.email,
            room_no: tenant.rooms?.room_no || 'N/A',
            bed_no: tenant.beds?.bed_no || 'N/A',
            check_in_date: tenant.check_in_date,
            missing_payments: missingPayments,
            partial_payments: partialPayments,
            current_payment_status: latestPayment ? latestPayment.status : 'NO_PAYMENT',
            overall_status: overallStatus,
            total_due_amount: totalDueAmount,
            missing_months_count: missingPayments.length,
            partial_months_count: partialPayments.length,
            latest_payment: latestPayment ? {
              payment_date: latestPayment.payment_date,
              status: latestPayment.status,
              actual_rent: Number(latestPayment.actual_rent_amount),
              amount_paid: Number(latestPayment.amount_paid),
              due_amount: Number(latestPayment.actual_rent_amount) - Number(latestPayment.amount_paid),
              rent_period: {
                start_date: latestPayment.start_date,
                end_date: latestPayment.end_date,
              },
            } : null,
          });
        }
      }

      return ResponseUtil.success(tenantsWithPaymentIssues, 'Tenant rent payment status fetched successfully');
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Get tenant rent payment status error:', error);
      throw new BadRequestException('Failed to fetch tenant rent payment status');
    }
  }
  
  /**
   * Helper method to get expected payment months between two dates
   * Returns an array of Date objects for the first day of each month between startDate and endDate
   */
  private getExpectedPaymentMonths(startDate: Date, endDate: Date): Date[] {
    const months = [];
    const currentDate = new Date(startDate);
    const lastDate = new Date(endDate);
    
    // Set dates to first day of their respective months to standardize
    currentDate.setDate(1);
    currentDate.setHours(0, 0, 0, 0);
    
    // Set endDate to first day of its month for proper comparison
    const endDateFirstDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);
    endDateFirstDay.setHours(0, 0, 0, 0);
    
    // Loop through each month from start date to end date (inclusive)
    while (currentDate <= endDateFirstDay) {
      months.push(new Date(currentDate));
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    return months;
  }
}
