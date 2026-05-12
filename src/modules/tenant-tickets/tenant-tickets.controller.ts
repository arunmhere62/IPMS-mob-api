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
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { TenantJwtAuthGuard } from '../auth/guards/tenant-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

type RequestWithTenant = {
  user: {
    tenantId: number;
    pgId: number;
    organizationId: number;
    role: UserRole;
  };
};

@ApiTags('tenant-tickets')
@Controller('tenant/tickets')
@UseGuards(TenantJwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
@ApiBearerAuth()
export class TenantTicketsController {
  constructor(private readonly tenantTicketsService: TenantTicketsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Raise a new ticket' })
  @ApiResponse({ status: 201, description: 'Ticket raised successfully' })
  create(@Req() req: RequestWithTenant, @Body() dto: CreateTicketDto) {
    const { tenantId, pgId, organizationId } = req.user;
    return this.tenantTicketsService.createTicket(tenantId, pgId, organizationId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my tickets' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Req() req: RequestWithTenant,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tenantTicketsService.getTenantTickets(
      req.user.tenantId,
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket details with comments' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  findOne(@Req() req: RequestWithTenant, @Param('id', ParseIntPipe) id: number) {
    return this.tenantTicketsService.getTenantTicketById(req.user.tenantId, id);
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a comment or image to a ticket' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  addComment(
    @Req() req: RequestWithTenant,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddCommentDto,
  ) {
    return this.tenantTicketsService.addTenantComment(req.user.tenantId, id, dto);
  }

  @Patch(':id/close')
  @ApiOperation({ summary: 'Close a ticket' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  close(@Req() req: RequestWithTenant, @Param('id', ParseIntPipe) id: number) {
    return this.tenantTicketsService.closeTenantTicket(req.user.tenantId, id);
  }
}
