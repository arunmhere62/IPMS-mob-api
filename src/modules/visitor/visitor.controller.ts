import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { VisitorService } from './visitor.service';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';
import { CommonHeadersDecorator, CommonHeaders } from '../../common/decorators/common-headers.decorator';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('visitors')
@Controller('visitors')
@UseGuards(HeadersValidationGuard, JwtAuthGuard)
export class VisitorController {
  constructor(private readonly visitorService: VisitorService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new visitor' })
  @ApiResponse({ status: 201, description: 'Visitor created successfully' })
  create(
    @Body() createDto: CreateVisitorDto,
    @CommonHeadersDecorator() headers: CommonHeaders,
  ) {
    return this.visitorService.create(createDto, headers.pg_id);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all visitors with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'room_id', required: false, type: Number })
  @ApiQuery({ name: 'converted_to_tenant', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Visitors retrieved successfully' })
  findAll(
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
    @Query('search') search?: string,
    @Query('room_id') roomIdParam?: string,
    @Query('converted_to_tenant') convertedToTenant?: string,
    @CommonHeadersDecorator() headers?: CommonHeaders,
  ) {
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    const roomId = roomIdParam ? parseInt(roomIdParam, 10) : undefined;
    const converted = convertedToTenant === 'true' ? true : convertedToTenant === 'false' ? false : undefined;
    return this.visitorService.findAll(page, limit, headers?.pg_id, search, roomId, converted);
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get visitor statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  getStats(@CommonHeadersDecorator() headers?: CommonHeaders) {
    return this.visitorService.getStats(headers?.pg_id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a visitor by ID' })
  @ApiResponse({ status: 200, description: 'Visitor retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Visitor not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.visitorService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a visitor' })
  @ApiResponse({ status: 200, description: 'Visitor updated successfully' })
  @ApiResponse({ status: 404, description: 'Visitor not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateVisitorDto,
  ) {
    return this.visitorService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a visitor (soft delete)' })
  @ApiResponse({ status: 200, description: 'Visitor deleted successfully' })
  @ApiResponse({ status: 404, description: 'Visitor not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.visitorService.remove(id);
  }
}
