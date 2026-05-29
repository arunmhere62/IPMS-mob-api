import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TenantTicketsService } from './tenant-tickets.service';
import { TenantTicketStatus } from './dto/update-ticket-status.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { TenantJwtAuthGuard } from '../auth/guards/tenant-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { NotificationService, RegisterTokenDto } from '../notification/notification.service';
import { TenantHeadersDecorator, TenantHeaders } from '../../common/decorators/tenant-headers.decorator';
import { TenantHeadersValidationGuard } from '../../common/guards/tenant-headers-validation.guard';

@ApiTags('tenant-tickets')
@Controller('tenant/tickets')
@UseGuards(TenantJwtAuthGuard, TenantHeadersValidationGuard, RolesGuard)
@Roles(UserRole.TENANT)
@ApiBearerAuth()
export class TenantTicketsController {
  constructor(
    private readonly tenantTicketsService: TenantTicketsService,
    private readonly notificationService: NotificationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Raise a new ticket' })
  @ApiResponse({ status: 201, description: 'Ticket raised successfully' })
  create(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Body() dto: CreateTicketDto,
  ) {
    return this.tenantTicketsService.createTicket(
      headers.tenant_id,
      headers.pg_id,
      headers.organization_id,
      dto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List my tickets' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Query('status') status?: TenantTicketStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tenantTicketsService.getTenantTickets(
      headers.tenant_id,
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket details with comments' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  findOne(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tenantTicketsService.getTenantTicketById(headers.tenant_id, id);
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a comment or image to a ticket' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  addComment(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddCommentDto,
  ) {
    return this.tenantTicketsService.addTenantComment(headers.tenant_id, id, dto);
  }

  @Patch(':id/close')
  @ApiOperation({ summary: 'Close a ticket' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  close(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tenantTicketsService.closeTenantTicket(headers.tenant_id, id);
  }

  @Post('notifications/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register push notification token for tenant' })
  registerToken(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Body() dto: RegisterTokenDto,
  ) {
    return this.notificationService.registerTenantToken(headers.tenant_id, dto);
  }

  @Delete('notifications/token')
  @ApiOperation({ summary: 'Unregister push notification token for tenant' })
  unregisterToken(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Body() body: { fcm_token: string },
  ) {
    return this.notificationService.unregisterTenantToken(body.fcm_token);
  }
}
