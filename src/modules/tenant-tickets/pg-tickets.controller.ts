import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TenantTicketsService } from './tenant-tickets.service';
import { AddCommentDto } from './dto/add-comment.dto';
import { UpdateTicketStatusDto, TenantTicketStatus } from './dto/update-ticket-status.dto';
import { TenantTicketCategory } from './dto/create-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { CommonHeadersDecorator, CommonHeaders } from '../../common/decorators/common-headers.decorator';

type RequestWithUser = {
  user: { sub: number; s_no?: number };
};

@ApiTags('pg-tenant-tickets')
@Controller('pg/tickets')
@UseGuards(HeadersValidationGuard, JwtAuthGuard)
@ApiBearerAuth()
export class PgTicketsController {
  constructor(private readonly tenantTicketsService: TenantTicketsService) {}

  @Get()
  @ApiOperation({ summary: 'List all tenant tickets for the PG' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tenantTicketsService.getPgTickets(
      headers.pg_id!,
      status as TenantTicketStatus | undefined,
      category as TenantTicketCategory | undefined,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single ticket with full comment thread' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  findOne(
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tenantTicketsService.getPgTicketById(headers.pg_id!, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update ticket status' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  updateStatus(
    @Req() req: RequestWithUser,
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    const userId = req.user?.s_no ?? req.user?.sub;
    return this.tenantTicketsService.updateTicketStatus(userId, headers.pg_id!, id, dto);
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reply to a ticket (owner side)' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  addComment(
    @Req() req: RequestWithUser,
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddCommentDto,
  ) {
    const ownerId = req.user.sub ?? req.user.s_no ?? headers.user_id!;
    return this.tenantTicketsService.addOwnerComment(ownerId, headers.pg_id!, id, dto);
  }
}
