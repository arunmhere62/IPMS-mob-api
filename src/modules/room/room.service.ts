import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { S3DeletionService } from '../common/s3-deletion.service';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { ResponseUtil } from '../../common/utils/response.util';
import { SubscriptionRestrictionService } from '../subscription/subscription-restriction.service';

@Injectable()
export class RoomService {
  constructor(
    private prisma: PrismaService,
    private s3DeletionService: S3DeletionService,
    private subscriptionRestrictionService: SubscriptionRestrictionService,
  ) {}

  /**
   * Create a new room or restore soft-deleted room
   */
  async create(createRoomDto: CreateRoomDto) {
    await this.subscriptionRestrictionService.assertCanCreateRoomInPg(createRoomDto.pg_id);

    const existingActiveRoom = await this.prisma.rooms.findFirst({
      where: {
        pg_id: createRoomDto.pg_id,
        room_no: createRoomDto.room_no,
        is_deleted: false,
      },
    });

    if (existingActiveRoom) {
      throw new BadRequestException(
        `Room number "${createRoomDto.room_no}" already exists in this PG. Please use a different room number.`,
      );
    }

    const room = await this.prisma.rooms.create({
      data: {
        pg_id: createRoomDto.pg_id,
        room_no: createRoomDto.room_no,
        images: createRoomDto.images,
      },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
          },
        },
        beds: {
          where: {
            is_deleted: false,
          },
          select: {
            s_no: true,
            bed_no: true,
            bed_price: true,
          },
        },
      },
    });

    return ResponseUtil.success(room, 'Room created successfully');
  }

  /**
   * Get all rooms with filters
   */
  async findAll(params: {
    page?: number;
    limit?: number;
    pg_id?: number;
    search?: string;
  }) {
    const { page = 1, limit = 10, pg_id, search } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      is_deleted: false,
    };

    if (pg_id) {
      where.pg_id = pg_id;
    }

    if (search) {
      where.OR = [
        { room_no: { contains: search, mode: 'insensitive' } },
        { room_type: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rooms, total] = await Promise.all([
      this.prisma.rooms.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          room_no: 'asc',
        },
        include: {
          pg_locations: {
            select: {
              s_no: true,
              location_name: true,
            },
          },
          beds: {
            where: {
              is_deleted: false,
            },
            select: {
              s_no: true,
              bed_no: true,
              bed_price: true,
              tenants: {
                where: {
                  status: 'ACTIVE',
                  OR: [{ is_deleted: false }, { is_deleted: null }],
                },
                select: {
                  s_no: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.rooms.count({ where }),
    ]);

    // Add bed count for each room
    const roomsWithBedCount = rooms.map((room) => {
      const total_beds = room.beds.length;
      const occupied_beds = room.beds.filter((b) => (b as any)?.tenants?.length > 0).length;
      const available_beds = Math.max(total_beds - occupied_beds, 0);

      return {
        ...room,
        beds: room.beds.map((b) => {
          // Strip tenants from list response to keep payload small
          const { tenants, ...rest } = b as any;
          return rest;
        }),
        total_beds,
        occupied_beds,
        available_beds,
      };
    });

    return ResponseUtil.paginated(roomsWithBedCount, total, page, limit, 'Rooms fetched successfully');
  }

  /**
   * Get room by ID
   */
  async findOne(id: number) {
    const room = await this.prisma.rooms.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            address: true,
          },
        },
        beds: {
          where: {
            is_deleted: false,
          },
          select: {
            s_no: true,
            bed_no: true,
            bed_price: true,
          },
          orderBy: {
            bed_no: 'asc',
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException(`Room with ID ${id} not found`);
    }

    return ResponseUtil.success({
      ...room,
      total_beds: room.beds.length,
    }, 'Room fetched successfully');
  }

  /**
   * Update room
   */
  async update(id: number, updateRoomDto: UpdateRoomDto) {
    // Check if room exists
    const existingRoom = await this.prisma.rooms.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existingRoom) {
      throw new NotFoundException(`Room with ID ${id} not found`);
    }

    // 🔒 Identity lock: once any bed exists for this room, room_no cannot be changed
    if (updateRoomDto.room_no && updateRoomDto.room_no !== existingRoom.room_no) {
      const bedCount = await this.prisma.beds.count({
        where: {
          room_id: id,
          is_deleted: false,
        },
      });

      if (bedCount > 0) {
        throw new BadRequestException('Room number cannot be changed once beds are created for this room');
      }
    }

    // Handle S3 image deletion if images are being updated
    if (updateRoomDto.images !== undefined) {
      const oldImages = (Array.isArray(existingRoom.images) ? existingRoom.images : []) as string[];
      const newImages = (Array.isArray(updateRoomDto.images) ? updateRoomDto.images : []) as string[];
      
      await this.s3DeletionService.deleteRemovedFiles(
        oldImages,
        newImages,
        'room',
        'images',
      );
    }

    const room = await this.prisma.rooms.update({
      where: { s_no: id },
      data: {
        room_no: updateRoomDto.room_no,
        images: updateRoomDto.images,
      },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
          },
        },
        beds: {
          where: {
            is_deleted: false,
          },
          select: {
            s_no: true,
            bed_no: true,
            bed_price: true,
          },
        },
      },
    });

    return ResponseUtil.success(room, 'Room updated successfully');
  }

  /**
   * Delete room (soft delete)
   */
  async remove(id: number, headers: ValidatedHeaders) {
    // Check if room exists
    const existingRoom = await this.prisma.rooms.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existingRoom) {
      throw new NotFoundException(`Room with ID ${id} not found`);
    }

    // Check if room has any beds
    const bedCount = await this.prisma.beds.count({
      where: {
        pg_id: headers.pg_id,
        room_id: id,
        is_deleted: false,
      },
    });

    if (bedCount > 0) {
      throw new BadRequestException(
        `Cannot delete room. It has ${bedCount} bed(s) associated with it. Please delete all beds first.`,
      );
    }

    // Delete S3 images before soft deleting room
    if (existingRoom.images && Array.isArray(existingRoom.images) && existingRoom.images.length > 0) {
      const roomImages = (existingRoom.images as string[]);
      await this.s3DeletionService.deleteAllFiles(
        roomImages,
        'room',
        'images',
      );
    }

    // Soft delete room
    await this.prisma.$transaction([
      this.prisma.rooms.update({
        where: { s_no: id },
        data: { is_deleted: true },
      }),
      this.prisma.beds.updateMany({
        where: { room_id: id },
        data: { is_deleted: true },
      }),
    ]);

    return ResponseUtil.noContent('Room deleted successfully');
  }
}
