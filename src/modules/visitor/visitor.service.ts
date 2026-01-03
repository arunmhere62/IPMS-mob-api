import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class VisitorService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateVisitorDto, pgId: number) {
    const visitor = await this.prisma.visitors.create({
      data: {
        ...createDto,
        pg_id: pgId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      include: {
        rooms: true,
        beds: true,
        city: true,
        state: true,
      },
    });

    return ResponseUtil.success(visitor, 'Visitor created successfully');
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    pgId?: number,
    search?: string,
    roomId?: number,
    convertedToTenant?: boolean,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.visitorsWhereInput = {
      is_deleted: false,
    };

    if (pgId) {
      where.pg_id = pgId;
    }

    if (search) {
      where.OR = [
        { visitor_name: { contains: search } },
        { phone_no: { contains: search } },
        { purpose: { contains: search } },
      ];
    }

    if (roomId) {
      where.visited_room_id = roomId;
    }

    if (convertedToTenant !== undefined) {
      where.convertedTo_tenant = convertedToTenant;
    }

    const [visitors, total] = await Promise.all([
      this.prisma.visitors.findMany({
        where,
        skip,
        take: limit,
        include: {
          rooms: true,
          beds: true,
          city: true,
          state: true,
        },
        orderBy: {
          created_at: 'desc',
        },
      }),
      this.prisma.visitors.count({ where }),
    ]);

    return ResponseUtil.paginated(visitors, total, page, limit, 'Visitors fetched successfully');
  }

  async findOne(id: number) {
    const visitor = await this.prisma.visitors.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        rooms: true,
        beds: true,
        city: true,
        state: true,
      },
    });

    if (!visitor) {
      throw new NotFoundException('Visitor not found');
    }

    return ResponseUtil.success(visitor, 'Visitor fetched successfully');
  }

  async update(id: number, updateDto: UpdateVisitorDto) {
    const visitor = await this.prisma.visitors.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!visitor) {
      throw new NotFoundException('Visitor not found');
    }

    const updated = await this.prisma.visitors.update({
      where: { s_no: id },
      data: {
        ...updateDto,
        updated_at: new Date().toISOString(),
      },
      include: {
        rooms: true,
        beds: true,
        city: true,
        state: true,
      },
    });

    return ResponseUtil.success(updated, 'Visitor updated successfully');
  }

  async remove(id: number) {
    const visitor = await this.prisma.visitors.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!visitor) {
      throw new NotFoundException('Visitor not found');
    }

    await this.prisma.visitors.update({
      where: { s_no: id },
      data: {
        is_deleted: true,
        updated_at: new Date().toISOString(),
      },
    });

    return ResponseUtil.noContent('Visitor deleted successfully');
  }

  async getStats(pgId?: number) {
    const where: Prisma.visitorsWhereInput = {
      is_deleted: false,
    };

    if (pgId) {
      where.pg_id = pgId;
    }

    const [total, convertedToTenant, notConverted] = await Promise.all([
      this.prisma.visitors.count({ where }),
      this.prisma.visitors.count({
        where: { ...where, convertedTo_tenant: true },
      }),
      this.prisma.visitors.count({
        where: { ...where, convertedTo_tenant: false },
      }),
    ]);

    return ResponseUtil.success({
      total,
      convertedToTenant,
      notConverted,
    }, 'Visitor statistics fetched successfully');
  }
}
