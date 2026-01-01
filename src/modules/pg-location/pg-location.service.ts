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

      // Assign creator as owner of the PG using pg_users junction table
      await this.prisma.pg_users.create({
        data: {
          pg_id: newPgLocation.s_no,
          user_id: userId,
          is_active: true,
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
}
