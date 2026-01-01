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
import { BedService } from './bed.service';
import { CreateBedDto } from './dto/create-bed.dto';
import { UpdateBedDto } from './dto/update-bed.dto';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('beds')
@Controller('beds')
@UseGuards(HeadersValidationGuard, JwtAuthGuard)
export class BedController {
  constructor(private readonly bedService: BedService) {}

  /**
   * Create a new bed
   * POST /api/v1/beds
   * Headers: pg_id, organization_id, user_id
   */
  @Post()
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  async create(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Body() createBedDto: CreateBedDto,
  ) {
    return this.bedService.create(createBedDto);
  }

  /**
   * Get all beds with filters
   * GET /api/v1/beds
   * Headers: pg_id, organization_id, user_id
   * Query: page, limit, room_id, only_unoccupied, search
   */
  @Get()
  @RequireHeaders({ pg_id: true })
  async findAll(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('room_id') room_id?: string,
    @Query('only_unoccupied') only_unoccupied?: string,
    @Query('search') search?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 100;
    const roomId = room_id ? parseInt(room_id, 10) : undefined;
    const onlyUnoccupied = only_unoccupied === 'true';

    return this.bedService.findAll({
      pg_id: headers.pg_id!,
      page: pageNumber,
      limit: limitNumber,
      room_id: roomId,
      only_unoccupied: onlyUnoccupied,
      search,
    });
  }

  /**
   * Get beds by room ID
   * GET /api/v1/beds/room/:roomId
   * Headers: pg_id, organization_id, user_id
   */
  @Get('room/:roomId')
  @RequireHeaders({ pg_id: true })
  async findByRoomId(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('roomId') roomId: string,
  ) {
    return this.bedService.findByRoomId(+roomId);
  }

  /**
   * Get bed by ID
   * GET /api/v1/beds/:id
   * Headers: pg_id, organization_id, user_id
   */
  @Get(':id')
  @RequireHeaders()
  async findOne(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id') id: string,
  ) {
    return this.bedService.findOne(+id);
  }

  /**
   * Update bed
   * PATCH /api/v1/beds/:id
   * Headers: pg_id, organization_id, user_id
   */
  @Patch(':id')
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  async update(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id') id: string,
    @Body() updateBedDto: UpdateBedDto,
  ) {
    return this.bedService.update(+id, updateBedDto);
  }

  /**
   * Delete bed (soft delete)
   * DELETE /api/v1/beds/:id
   * Headers: pg_id, organization_id, user_id
   */
  @Delete(':id')
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  async remove(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id') id: string,
  ) {
    return this.bedService.remove(+id);
  }
}
