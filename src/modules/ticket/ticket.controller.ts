import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { CommonHeadersDecorator, CommonHeaders } from '../../common/decorators/common-headers.decorator';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('tickets')
@Controller('tickets')
@UseGuards(HeadersValidationGuard)
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new ticket' })
  @ApiResponse({ status: 201, description: 'Ticket created successfully' })
  create(
    @Body() createDto: CreateTicketDto,
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Request() req: any,
  ) {
    const userId = headers.user_id || req.user?.s_no;
    return this.ticketService.create(createDto, userId, headers.organization_id);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all tickets with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'priority', required: false, type: String })
  @ApiQuery({ name: 'my_tickets', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Tickets retrieved successfully' })
  findAll(
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('my_tickets') myTickets?: string,
    @Query('search') search?: string,
    @CommonHeadersDecorator() headers?: CommonHeaders,
    @Request() req?: any,
  ) {
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    const userId = headers?.user_id || req?.user?.s_no;
    const isMyTickets = myTickets === 'true';
    
    return this.ticketService.findAll(
      page,
      limit,
      userId,
      headers?.organization_id,
      status,
      category,
      priority,
      isMyTickets,
      search,
    );
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get ticket statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  getStats(@CommonHeadersDecorator() headers?: CommonHeaders) {
    return this.ticketService.getStats(headers?.organization_id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a ticket by ID' })
  @ApiResponse({ status: 200, description: 'Ticket retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  findOne(
    @Param('id') id: string,
    @CommonHeadersDecorator() headers?: CommonHeaders,
    @Request() req?: any,
  ) {
    const userId = headers?.user_id || req?.user?.s_no;
    return this.ticketService.findOne(+id, userId);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a ticket' })
  @ApiResponse({ status: 200, description: 'Ticket updated successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateTicketDto,
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Request() req: any,
  ) {
    console.log('=== TICKET UPDATE CONTROLLER ===');
    console.log('Headers:', headers);
    console.log('req.user:', req.user);
    console.log('req.user?.role_name:', req.user?.role_name);
    
    const userId = headers.user_id || req.user?.s_no;
    const isSuperAdmin = req.user?.role_name === 'SUPER_ADMIN';
    
    console.log('Extracted userId:', userId);
    console.log('Extracted isSuperAdmin:', isSuperAdmin);
    
    return this.ticketService.update(+id, updateDto, userId, isSuperAdmin);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a ticket (soft delete)' })
  @ApiResponse({ status: 200, description: 'Ticket deleted successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  remove(
    @Param('id') id: string,
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Request() req: any,
  ) {
    const userId = headers.user_id || req.user?.s_no;
    const isSuperAdmin = req.user?.role_name === 'SUPER_ADMIN';
    return this.ticketService.remove(+id, userId, isSuperAdmin);
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a comment to a ticket' })
  @ApiResponse({ status: 201, description: 'Comment added successfully' })
  addComment(
    @Param('id') id: string,
    @Body() commentDto: AddCommentDto,
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Request() req: any,
  ) {
    const userId = headers.user_id || req.user?.s_no;
    return this.ticketService.addComment(+id, commentDto, userId);
  }
}
