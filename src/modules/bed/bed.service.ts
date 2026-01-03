import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateBedDto } from './dto/create-bed.dto';
import { UpdateBedDto } from './dto/update-bed.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { S3DeletionService } from '../common/s3-deletion.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { SubscriptionRestrictionService } from '../subscription/subscription-restriction.service';

@Injectable()
export class BedService {
  constructor(
    private prisma: PrismaService,
    private s3DeletionService: S3DeletionService,
    private subscriptionRestrictionService: SubscriptionRestrictionService,
  ) {}

  /**
   * Create a new bed or restore soft-deleted bed
   */
  async create(createBedDto: CreateBedDto) {
    await this.subscriptionRestrictionService.assertCanCreateBedInPg(createBedDto.pg_id);

    // Verify room exists
    const room = await this.prisma.rooms.findFirst({
      where: {
        s_no: createBedDto.room_id,
        is_deleted: false,
      },
    });

    if (!room) {
      throw new NotFoundException(`Room with ID ${createBedDto.room_id} not found`);
    }

    // Check if an active bed already exists with the same room_id and bed_no
    const existingActiveBed = await this.prisma.beds.findFirst({
      where: {
        room_id: createBedDto.room_id,
        bed_no: createBedDto.bed_no,
        is_deleted: false,
      },
    });

    if (existingActiveBed) {
      throw new BadRequestException(
        `Bed number "${createBedDto.bed_no}" already exists in this room. Please use a different bed number.`
      );
    }

    const bed = await this.prisma.beds.create({
      data: {
        room_id: createBedDto.room_id,
        bed_no: createBedDto.bed_no,
        pg_id: createBedDto.pg_id,
        images: createBedDto.images,
        bed_price: createBedDto.bed_price,
      },
      include: {
        rooms: {
          select: {
            s_no: true,
            room_no: true,
            pg_locations: {
              select: {
                s_no: true,
                location_name: true,
              },
            },
          },
        },
      },
    });

    return ResponseUtil.created(bed, 'Bed created successfully');
  }

  /**
   * Get all beds with filters
   */
  async findAll(params: {
    pg_id?: number;
    page?: number;
    limit?: number;
    room_id?: number;
    only_unoccupied?: boolean;
    search?: string;
  }) {
    const { page = 1, limit = 10, room_id, pg_id, search, only_unoccupied } = params;
    void pg_id;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      is_deleted: false,
      rooms: {
        pg_id: params.pg_id,
      },
    };

    if (room_id) {
      where.room_id = room_id;
    }
    if (params.pg_id) {
      (where.rooms as Record<string, unknown>).pg_id = params.pg_id; // ✅ filter beds by PG ID through room
    }
    if (search) {
      where.bed_no = { contains: search, mode: 'insensitive' };
    }
    
    // Filter only unoccupied beds (beds without active tenants)
    if (only_unoccupied) {
      where.tenants = {
        none: {
          status: 'ACTIVE',
          OR: [
            { is_deleted: false },
            { is_deleted: null },
          ],
        },
      };
    }

    const [beds, total] = await Promise.all([
      this.prisma.beds.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          bed_no: 'asc',
        },
        include: {
          rooms: {
            select: {
              s_no: true,
              room_no: true,
              pg_id: true,
              pg_locations: {
                select: {
                  s_no: true,
                  location_name: true,
                },
              },
            },
          },
          tenants: {
            where: {
              status: 'ACTIVE',
              OR: [
                { is_deleted: false },
                { is_deleted: null },
              ],
            },
            select: {
              s_no: true,
              name: true,
              phone_no: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.beds.count({ where }),
    ]);

    // Add is_occupied flag based on active tenants
    const bedsWithStatus = beds.map(bed => ({
      ...bed,
      is_occupied: bed.tenants && bed.tenants.length > 0,
    }));

    return ResponseUtil.paginated(bedsWithStatus, total, page, limit, 'Beds retrieved successfully');
  }

  /**
   * Get beds by room ID
   */
  async findByRoomId(roomId: number) {
    const beds = await this.prisma.beds.findMany({
      where: {
        room_id: roomId,
        is_deleted: false,
      },
      orderBy: {
        bed_no: 'asc',
      },
      include: {
        rooms: {
          select: {
            s_no: true,
            room_no: true,
          },
        },
        tenants: {
          where: {
            status: 'ACTIVE',
            OR: [
              { is_deleted: false },
              { is_deleted: null },
            ],
          },
          select: {
            s_no: true,
            name: true,
            phone_no: true,
            status: true,
          },
        },
      },
    });

    // Add is_occupied flag based on active tenants
    const bedsWithStatus = beds.map(bed => ({
      ...bed,
      is_occupied: bed.tenants && bed.tenants.length > 0,
    }));

    return ResponseUtil.success(bedsWithStatus, 'Beds retrieved successfully');
  }

  /**
   * Get bed by ID
   */
  async findOne(id: number) {
    const bed = await this.prisma.beds.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        rooms: {
          select: {
            s_no: true,
            room_no: true,
            pg_locations: {
              select: {
                s_no: true,
                location_name: true,
                address: true,
              },
            },
          },
        },
      },
    });

    if (!bed) {
      throw new NotFoundException(`Bed with ID ${id} not found`);
    }

    return ResponseUtil.success(bed, 'Bed retrieved successfully');
  }

  /**
   * Update bed
   */
  async update(id: number, updateBedDto: UpdateBedDto) {
    // Check if bed exists
    const existingBed = await this.prisma.beds.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existingBed) {
      throw new NotFoundException(`Bed with ID ${id} not found`);
    }

    // 🔒 Identity lock: once any tenant has ever been assigned to this bed, bed_no cannot be changed
    if (updateBedDto.bed_no && updateBedDto.bed_no !== existingBed.bed_no) {
      const tenantCount = await this.prisma.tenants.count({
        where: {
          bed_id: id,
          OR: [{ is_deleted: false }, { is_deleted: null }],
        },
      });

      if (tenantCount > 0) {
        throw new BadRequestException('Bed number cannot be changed once it has been assigned to a tenant');
      }
    }

    // If room_id is being updated, verify new room exists
    if (updateBedDto.room_id) {
      const room = await this.prisma.rooms.findFirst({
        where: {
          s_no: updateBedDto.room_id,
          is_deleted: false,
        },
      });

      if (!room) {
        throw new NotFoundException(`Room with ID ${updateBedDto.room_id} not found`);
      }
    }

    // Handle S3 image deletion if images are being updated
    if (updateBedDto.images !== undefined) {
      const oldImages = (Array.isArray(existingBed.images) ? existingBed.images : []) as string[];
      const newImages = (Array.isArray(updateBedDto.images) ? updateBedDto.images : []) as string[];
      
      try {
        await this.s3DeletionService.deleteRemovedFiles(
          oldImages,
          newImages,
          'bed',
          'images',
        );
      } catch (error) {
        console.warn('Failed to delete S3 images:', error);
        // Don't throw - continue with update even if S3 deletion fails
      }
    }

    const bed = await this.prisma.beds.update({
      where: { s_no: id },
      data: {
        room_id: updateBedDto.room_id,
        bed_no: updateBedDto.bed_no,
        pg_id: updateBedDto.pg_id,
        images: updateBedDto.images,
        bed_price: updateBedDto.bed_price,
      },
      include: {
        rooms: {
          select: {
            s_no: true,
            room_no: true,
            pg_locations: {
              select: {
                s_no: true,
                location_name: true,
              },
            },
          },
        },
      },
    });

    return ResponseUtil.success(bed, 'Bed updated successfully');
  }

  /**
   * Delete bed (soft delete)
   */
  async remove(id: number) {
    // Check if bed exists
    const existingBed = await this.prisma.beds.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existingBed) {
      throw new NotFoundException(`Bed with ID ${id} not found`);
    }

    // Prevent deletion if any active tenant is assigned to this bed
    const activeTenant = await this.prisma.tenants.findFirst({
      where: {
        bed_id: id,
        status: 'ACTIVE',
        OR: [
          { is_deleted: false },
          { is_deleted: null },
        ],
      },
      select: { s_no: true },
    });

    if (activeTenant) {
      throw new BadRequestException('Cannot delete bed while a tenant is assigned to it');
    }

    await this.prisma.beds.update({
      where: { s_no: id },
      data: {
        bed_no: existingBed.bed_no ? `${existingBed.bed_no}__DELETED__${id}` : `__DELETED__${id}`,
        is_deleted: true,
        updated_at: new Date(),
      },
    });

    return ResponseUtil.noContent('Bed deleted successfully');
  }
}
