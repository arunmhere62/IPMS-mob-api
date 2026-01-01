import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('rooms')
@Controller('rooms')
@UseGuards(HeadersValidationGuard, JwtAuthGuard)
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  /**
   * Create a new room
   * POST /api/v1/rooms
   * Headers: pg_id (required), organization_id (required), user_id (required)
   */
  @Post()
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  async create(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Body() createRoomDto: CreateRoomDto,
  ) {
    return this.roomService.create(createRoomDto);
  }

  /**
   * Get all rooms with filters
   * GET /api/v1/rooms
   * Headers: pg_id (required), organization_id (optional), user_id (optional)
   * Query: page, limit, search
   */
  @Get()
  @RequireHeaders({ pg_id: true })
  async findAll(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 100;

    return this.roomService.findAll({
      page: pageNumber,
      limit: limitNumber,
      pg_id: headers.pg_id!,
      search,
    });
  }

  /**
   * Get room by ID
   * GET /api/v1/rooms/:id
   * Headers: pg_id (optional), organization_id (optional), user_id (optional)
   */
  @Get(':id')
  @RequireHeaders()
  async findOne(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id') id: string,
  ) {
    return this.roomService.findOne(+id);
  }

  /**
   * Update room
   * PATCH /api/v1/rooms/:id
   * Headers: pg_id (required), organization_id (required), user_id (required)
   */
  @Patch(':id')
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  async update(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id') id: string,
    @Body() updateRoomDto: UpdateRoomDto,
  ) {
    return this.roomService.update(+id, updateRoomDto);
  }

  /**
   * Delete room (soft delete)
   * DELETE /api/v1/rooms/:id
   * Headers: pg_id (required), organization_id (required), user_id (required)
   */
  @Delete(':id')
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  async remove(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id') id: string,
  ) {
    return this.roomService.remove(+id, headers);
  }
}
