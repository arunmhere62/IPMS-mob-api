import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { UpdateTicketStatusDto, TenantTicketStatus } from './dto/update-ticket-status.dto';
import { TicketsGateway } from './gateway/tickets.gateway';

@Injectable()
export class TenantTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TicketsGateway))
    private readonly ticketsGateway: TicketsGateway,
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
        category: dto.category as any,
        title: dto.title,
        description: dto.description,
        priority: (dto.priority as any) ?? 'MEDIUM',
        status: 'OPEN',
      },
    });

    return ResponseUtil.success(ticket, 'Ticket raised successfully');
  }

  async getTenantTickets(tenantId: number, status?: string, page = 1, limit = 20) {
    const where: any = { tenant_id: tenantId, is_deleted: false };
    if (status) where.status = status;

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
        attachments: dto.attachments ? (dto.attachments as any) : undefined,
      },
    });

    this.ticketsGateway.emitNewComment(ticketId, comment);

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

    return ResponseUtil.success(updated, 'Ticket closed successfully');
  }

  // ─── PG Owner-side ──────────────────────────────────────────────────────────

  async getPgTickets(pgId: number | undefined, status?: string, category?: string, page = 1, limit = 20) {
    const where: any = { ...(pgId ? { pg_id: pgId } : {}), is_deleted: false };
    if (status) where.status = status;
    if (category) where.category = category;

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
      data: { status: dto.status as any },
    });

    this.ticketsGateway.emitTicketStatusChanged(ticketId, dto.status);

    return ResponseUtil.success(updated, 'Ticket status updated successfully');
  }

  async addOwnerComment(ownerId: number, pgId: number | undefined, ticketId: number, dto: AddCommentDto) {
    if (!dto.message && (!dto.attachments || dto.attachments.length === 0)) {
      throw new BadRequestException('Provide a message or at least one attachment');
    }

    const ticket = await this.prisma.tenant_tickets.findFirst({
      where: { s_no: ticketId, ...(pgId ? { pg_id: pgId } : {}), is_deleted: false },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') throw new ForbiddenException('Cannot comment on a closed ticket');

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
        attachments: dto.attachments ? (dto.attachments as any) : undefined,
      },
    });

    this.ticketsGateway.emitNewComment(ticketId, comment);

    return ResponseUtil.success(comment, 'Comment added successfully');
  }
}
