import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { Prisma, tenant_tickets_status, tenant_tickets_category } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { CreateTicketDto, TenantTicketCategory, TenantTicketPriority } from './dto/create-ticket.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { UpdateTicketStatusDto, TenantTicketStatus } from './dto/update-ticket-status.dto';
import { TicketsGateway } from './gateway/tickets.gateway';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class TenantTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TicketsGateway))
    private readonly ticketsGateway: TicketsGateway,
    private readonly notificationService: NotificationService,
  ) {}

  // ─── Tenant-side ────────────────────────────────────────────────────────────

  async createTicket(tenantId: number, pgId: number, organizationId: number, dto: CreateTicketDto) {
    const tenant = await this.prisma.tenants.findFirst({
      where: { s_no: tenantId, is_deleted: false },
      select: { s_no: true, status: true, pg_locations: { select: { organization_id: true } } },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('Only active tenants can raise tickets');
    }

    const resolvedOrgId = organizationId ?? tenant.pg_locations?.organization_id;

    const ticket = await this.prisma.tenant_tickets.create({
      data: {
        organization_id: resolvedOrgId,
        pg_id: pgId,
        tenant_id: tenantId,
        category: dto.category as TenantTicketCategory,
        title: dto.title,
        description: dto.description,
        priority: (dto.priority ?? TenantTicketPriority.MEDIUM) as TenantTicketPriority,
        status: 'OPEN',
      },
    });

    // Notify owner (organization superadmin)
    const org = await this.prisma.organization.findUnique({
      where: { s_no: resolvedOrgId },
      select: { superadmin_id: true },
    });
    if (org?.superadmin_id) {
      void this.notificationService.sendToUser(org.superadmin_id, {
        title: '🎫 New Ticket Raised',
        body: `${dto.title} — ${dto.category}`,
        type: 'TICKET_NEW',
        data: { ticketId: String(ticket.s_no), screen: 'TicketDetail' },
      });
    }

    return ResponseUtil.success(ticket, 'Ticket raised successfully');
  }

  async getTenantTickets(tenantId: number, status?: TenantTicketStatus, page = 1, limit = 20) {
    const where: Prisma.tenant_ticketsWhereInput = { tenant_id: tenantId, is_deleted: false };
    if (status) where.status = status as tenant_tickets_status;

    const [tickets, total] = await Promise.all([
      this.prisma.tenant_tickets.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          s_no: true,
          category: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          created_at: true,
          updated_at: true,
          users: { select: { s_no: true, name: true } },
          _count: { select: { tenant_ticket_comments: { where: { is_deleted: false } } } },
        },
      }),
      this.prisma.tenant_tickets.count({ where }),
    ]);

    return ResponseUtil.success({ tickets, total, page, limit }, 'Tickets fetched successfully');
  }

  async getTenantTicketById(tenantId: number, ticketId: number) {
    const ticket = await this.prisma.tenant_tickets.findFirst({
      where: { s_no: ticketId, tenant_id: tenantId, is_deleted: false },
      include: {
        users: { select: { s_no: true, name: true } },
        tenant_ticket_comments: {
          where: { is_deleted: false },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    return ResponseUtil.success(ticket, 'Ticket fetched successfully');
  }

  async addTenantComment(tenantId: number, ticketId: number, dto: AddCommentDto) {
    if (!dto.message && (!dto.attachments || dto.attachments.length === 0)) {
      throw new BadRequestException('Provide a message or at least one attachment');
    }

    const ticket = await this.prisma.tenant_tickets.findFirst({
      where: { s_no: ticketId, tenant_id: tenantId, is_deleted: false },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') throw new ForbiddenException('Cannot comment on a closed ticket');

    const comment = await this.prisma.tenant_ticket_comments.create({
      data: {
        ticket_id: ticketId,
        sender_type: 'TENANT',
        sender_id: tenantId,
        message: dto.message,
        attachments: dto.attachments ? (dto.attachments as Prisma.InputJsonValue) : undefined,
      },
    });

    this.ticketsGateway.emitNewComment(ticketId, comment);

    // Notify the assigned staff member (or superadmin if unassigned) about tenant reply
    const orgInfo = await this.prisma.tenant_tickets.findUnique({
      where: { s_no: ticketId },
      select: { assigned_to: true, organization: { select: { superadmin_id: true } }, title: true },
    });
    const notifyUserId = orgInfo?.assigned_to ?? orgInfo?.organization?.superadmin_id;
    if (notifyUserId) {
      void this.notificationService.sendToUser(notifyUserId, {
        title: '💬 Tenant Replied',
        body: `Re: ${orgInfo.title}`,
        type: 'TICKET_COMMENT',
        data: { ticketId: String(ticketId), screen: 'TicketDetail' },
      });
    }

    return ResponseUtil.success(comment, 'Comment added successfully');
  }

  async closeTenantTicket(tenantId: number, ticketId: number) {
    const ticket = await this.prisma.tenant_tickets.findFirst({
      where: { s_no: ticketId, tenant_id: tenantId, is_deleted: false },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') throw new BadRequestException('Ticket is already closed');

    const updated = await this.prisma.tenant_tickets.update({
      where: { s_no: ticketId },
      data: { status: 'CLOSED' },
    });

    this.ticketsGateway.emitTicketStatusChanged(ticketId, 'CLOSED');

    // Notify the assigned staff member (or superadmin if unassigned) that tenant closed the ticket
    const closedTicketOrg = await this.prisma.tenant_tickets.findUnique({
      where: { s_no: ticketId },
      select: { assigned_to: true, organization: { select: { superadmin_id: true } }, title: true },
    });
    const closedNotifyUserId = closedTicketOrg?.assigned_to ?? closedTicketOrg?.organization?.superadmin_id;
    if (closedNotifyUserId) {
      void this.notificationService.sendToUser(closedNotifyUserId, {
        title: '🔒 Ticket Closed by Tenant',
        body: `"${closedTicketOrg.title}" has been closed`,
        type: 'TICKET_CLOSED',
        data: { ticketId: String(ticketId), screen: 'TicketDetail' },
      });
    }

    return ResponseUtil.success(updated, 'Ticket closed successfully');
  }

  // ─── PG Owner-side ──────────────────────────────────────────────────────────

  async getPgTickets(pgId: number | undefined, status?: TenantTicketStatus, category?: TenantTicketCategory, page = 1, limit = 20) {
    const where: Prisma.tenant_ticketsWhereInput = { ...(pgId ? { pg_id: pgId } : {}), is_deleted: false };
    if (status) where.status = status as tenant_tickets_status;
    if (category) where.category = category as tenant_tickets_category;

    const [tickets, total] = await Promise.all([
      this.prisma.tenant_tickets.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          tenants: { select: { s_no: true, name: true, phone_no: true } },
          users: { select: { s_no: true, name: true } },
          _count: { select: { tenant_ticket_comments: { where: { is_deleted: false } } } },
        },
      }),
      this.prisma.tenant_tickets.count({ where }),
    ]);

    return ResponseUtil.success({ tickets, total, page, limit }, 'Tickets fetched successfully');
  }

  async getPgTicketById(pgId: number | undefined, ticketId: number) {
    const ticket = await this.prisma.tenant_tickets.findFirst({
      where: { s_no: ticketId, ...(pgId ? { pg_id: pgId } : {}), is_deleted: false },
      include: {
        tenants: { select: { s_no: true, name: true, phone_no: true } },
        users: { select: { s_no: true, name: true } },
        tenant_ticket_comments: {
          where: { is_deleted: false },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    return ResponseUtil.success(ticket, 'Ticket fetched successfully');
  }

  async updateTicketStatus(pgId: number | undefined, ticketId: number, dto: UpdateTicketStatusDto) {
    const ticket = await this.prisma.tenant_tickets.findFirst({
      where: { s_no: ticketId, ...(pgId ? { pg_id: pgId } : {}), is_deleted: false },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    const updated = await this.prisma.tenant_tickets.update({
      where: { s_no: ticketId },
      data: { status: dto.status as TenantTicketStatus },
    });

    this.ticketsGateway.emitTicketStatusChanged(ticketId, dto.status);

    // Notify tenant about status change
    void this.notificationService.sendToTenant(ticket.tenant_id, {
      title: '📋 Ticket Status Updated',
      body: `Your ticket "${ticket.title}" is now ${dto.status.replace('_', ' ')}`,
      type: 'TICKET_STATUS',
      data: { ticketId: String(ticketId), screen: 'TenantTicketDetail' },
    });

    return ResponseUtil.success(updated, 'Ticket status updated successfully');
  }

  async addOwnerComment(ownerId: number, pgId: number | undefined, ticketId: number, dto: AddCommentDto) {
    if (!dto.message && (!dto.attachments || dto.attachments.length === 0)) {
      throw new BadRequestException('Provide a message or at least one attachment');
    }

    const ticket = await this.prisma.tenant_tickets.findFirst({
      where: { s_no: ticketId, ...(pgId ? { pg_id: pgId } : {}), is_deleted: false },
      include: { organization: { select: { superadmin_id: true } } },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') throw new ForbiddenException('Cannot comment on a closed ticket');

    const isSuperadmin = ticket.organization?.superadmin_id === ownerId;
    const isAssigned = ticket.assigned_to === ownerId;

    // Once assigned, only the assigned person or superadmin can reply
    if (ticket.assigned_to && !isAssigned && !isSuperadmin) {
      throw new ForbiddenException('Only the assigned staff member or admin can reply to this ticket');
    }

    // First reply: auto-assign and move to IN_PROGRESS
    if (ticket.status === TenantTicketStatus.OPEN) {
      await this.prisma.tenant_tickets.update({
        where: { s_no: ticketId },
        data: { status: 'IN_PROGRESS', assigned_to: ownerId },
      });
    }

    const comment = await this.prisma.tenant_ticket_comments.create({
      data: {
        ticket_id: ticketId,
        sender_type: 'OWNER',
        sender_id: ownerId,
        message: dto.message,
        attachments: dto.attachments ? (dto.attachments as Prisma.InputJsonValue) : undefined,
      },
    });

    this.ticketsGateway.emitNewComment(ticketId, comment);

    // Notify tenant about owner reply
    void this.notificationService.sendToTenant(ticket.tenant_id, {
      title: '💬 New Reply on Your Ticket',
      body: `Re: "${ticket.title}"`,
      type: 'TICKET_COMMENT',
      data: { ticketId: String(ticketId), screen: 'TenantTicketDetail' },
    });

    return ResponseUtil.success(comment, 'Comment added successfully');
  }
}
