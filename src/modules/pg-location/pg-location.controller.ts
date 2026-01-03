import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PgLocationService } from './pg-location.service';
import { CreatePgLocationDto } from './dto/create-pg-location.dto';
import { UpdatePgLocationDto } from './dto/update-pg-location.dto';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';

@ApiTags('pg-locations')
@Controller('pg-locations')
@UseGuards(HeadersValidationGuard)
// @ApiBearerAuth() // Uncomment when JWT auth is implemented
export class PgLocationController {
  constructor(private readonly pgLocationService: PgLocationService) {}

  @Get()
  @ApiOperation({ summary: 'Get all PG locations for the organization' })
  @ApiResponse({
    status: 200,
    description: 'PG locations fetched successfully',
    schema: {
      example: {
        success: true,
        message: 'PG locations fetched successfully',
        data: [
          {
            s_no: 1,
            location_name: 'Green Valley PG',
            address: '123 Main Street',
            pincode: '560001',
            status: 'ACTIVE',
            city: { s_no: 1, name: 'Bangalore' },
            state: { s_no: 1, name: 'Karnataka' },
          },
        ],
      },
    },
  })
  @RequireHeaders({ user_id: true, organization_id: true })
  async findAll(@ValidatedHeaders() headers: ValidatedHeaders) {
    return this.pgLocationService.findAll(headers.user_id!, headers.organization_id!);
  }

  @Get(':id/details')
  @ApiOperation({ summary: 'Get detailed information for a specific PG location' })
  @ApiParam({ name: 'id', description: 'PG Location ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'PG location details fetched successfully',
    schema: {
      example: {
        success: true,
        message: 'PG location details fetched successfully',
        data: {
          s_no: 1,
          location_name: 'Green Valley PG',
          address: '123 Main Street',
          pincode: '560001',
          status: 'ACTIVE',
          rent_cycle_type: 'CALENDAR',
          rent_cycle_start: null,
          rent_cycle_end: null,
          pg_type: 'COLIVING',
          city: { s_no: 1, name: 'Bangalore' },
          state: { s_no: 1, name: 'Karnataka' },
          images: ['image1.jpg', 'image2.jpg'],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'PG location not found' })
  @RequireHeaders({ user_id: true, organization_id: true })
  async getDetails(
    @Param('id', ParseIntPipe) id: number,
    @ValidatedHeaders() headers: ValidatedHeaders,
  ) {
    return this.pgLocationService.getDetails(id, headers.user_id!, headers.organization_id!);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single PG location by ID' })
  @ApiParam({ name: 'id', description: 'PG Location ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'PG location fetched successfully',
  })
  @ApiResponse({ status: 404, description: 'PG location not found' })
  @RequireHeaders({ user_id: true, organization_id: true })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @ValidatedHeaders() headers: ValidatedHeaders,
  ) {
    return this.pgLocationService.findOne(id, headers.user_id!, headers.organization_id!);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new PG location' })
  @ApiResponse({
    status: 201,
    description: 'PG location created successfully',
    schema: {
      example: {
        success: true,
        message: 'PG location created successfully',
        data: {
          s_no: 1,
          location_name: 'Green Valley PG',
          address: '123 Main Street',
          pincode: '560001',
          status: 'ACTIVE',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @RequireHeaders({ user_id: true, organization_id: true })
  async create(
    @Body() createPgLocationDto: CreatePgLocationDto,
    @ValidatedHeaders() headers: ValidatedHeaders,
  ) {
    return this.pgLocationService.create(createPgLocationDto, headers.user_id!, headers.organization_id!);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a PG location' })
  @ApiParam({ name: 'id', description: 'PG Location ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'PG location updated successfully',
  })
  @ApiResponse({ status: 404, description: 'PG location not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @RequireHeaders({ user_id: true, organization_id: true })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePgLocationDto: UpdatePgLocationDto,
    @ValidatedHeaders() headers: ValidatedHeaders,
  ) {
    return this.pgLocationService.update(id, updatePgLocationDto, headers.user_id!, headers.organization_id!);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a PG location (soft delete)' })
  @ApiParam({ name: 'id', description: 'PG Location ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'PG location deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'PG location deleted successfully',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'PG location not found' })
  @RequireHeaders({ user_id: true, organization_id: true })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @ValidatedHeaders() headers: ValidatedHeaders,
  ) {
    return this.pgLocationService.remove(id, headers.user_id!, headers.organization_id!);
  }
}
