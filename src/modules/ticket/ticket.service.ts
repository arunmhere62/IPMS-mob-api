import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddCommentDto } from './dto/add-comment.dto';

@Injectable()
export class TicketService {
  constructor(private prisma: PrismaService) {}

  private generateTicketNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TKT-${timestamp}${random}`;
  }

  async create(createDto: CreateTicketDto, userId: number, organizationId?: number) {
    const ticketNumber = this.generateTicketNumber();
    
    const ticket = await this.prisma.issue_tickets.create({
      data: {
        ticket_number: ticketNumber,
        title: createDto.title,
        description: createDto.description,
        category: createDto.category,
        priority: createDto.priority,
        status: 'OPEN',
        reported_by: userId,
        organization_id: organizationId,
        pg_id: createDto.pg_id,
        attachments: createDto.attachments ? JSON.stringify(createDto.attachments) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      include: {
        users_issue_tickets_reported_byTousers: {
          select: {
            s_no: true,
            name: true,
            email: true,
            roles: {
              select: {
                role_name: true,
              },
            },
          },
        },
      },
    });

    return ResponseUtil.success(ticket, 'Ticket created successfully');
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    userId?: number,
    organizationId?: number,
    status?: string,
    category?: string,
    priority?: string,
    myTickets?: boolean,
    search?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {
      is_deleted: false,
    };

    if (myTickets && userId) {
      where.reported_by = userId;
    }

    if (organizationId) {
      where.organization_id = organizationId;
    }

    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    if (priority) {
      where.priority = priority;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { ticket_number: { contains: search } },
      ];
    }

    const [tickets, total] = await Promise.all([
      this.prisma.issue_tickets.findMany({
        where,
        skip,
        take: limit,
        include: {
          users_issue_tickets_reported_byTousers: {
            select: {
              s_no: true,
              name: true,
              email: true,
              roles: {
                select: {
                  role_name: true,
                },
              },
            },
          },
          users_issue_tickets_assigned_toTousers: {
            select: {
              s_no: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [
          { status: 'asc' }, // Open tickets first
          { priority: 'desc' }, // Critical first
          { created_at: 'desc' },
        ],
      }),
      this.prisma.issue_tickets.count({ where }),
    ]);

    return ResponseUtil.paginated(
      tickets.map(ticket => ({
        ...ticket,
        attachments: ticket.attachments ? JSON.parse(ticket.attachments as string) : [],
      })),
      total,
      page,
      limit,
      'Tickets fetched successfully'
    );
  }

  async findOne(id: number, userId?: number) {
    const ticket = await this.prisma.issue_tickets.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        users_issue_tickets_reported_byTousers: {
          select: {
            s_no: true,
            name: true,
            email: true,
            roles: {
              select: {
                role_name: true,
              },
            },
          },
        },
        users_issue_tickets_assigned_toTousers: {
          select: {
            s_no: true,
            name: true,
            email: true,
          },
        },
        issue_ticket_comments: {
          where: { is_deleted: false },
          include: {
            users: {
              select: {
                s_no: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ResponseUtil.success({
      ...ticket,
      attachments: ticket.attachments ? JSON.parse(ticket.attachments as string) : [],
      issue_ticket_comments: ticket.issue_ticket_comments.map(comment => ({
        ...comment,
        attachments: comment.attachments ? JSON.parse(comment.attachments as string) : [],
      })),
    }, 'Ticket fetched successfully');
  }

  async update(id: number, updateDto: UpdateTicketDto, userId: number, isSuperAdmin: boolean) {
    console.log('=== UPDATE TICKET DEBUG ===');
    console.log('Ticket ID:', id);
    console.log('User ID:', userId);
    console.log('Is Super Admin (from controller):', isSuperAdmin);
    console.log('Update Data:', updateDto);

    // Fetch user to verify role if isSuperAdmin is false
    let actualIsSuperAdmin = isSuperAdmin;
    if (!isSuperAdmin && userId) {
      const user = await this.prisma.users.findUnique({
        where: { s_no: userId },
        include: { roles: true },
      });
      
      if (user && user.roles) {
        actualIsSuperAdmin = user.roles.role_name === 'SUPER_ADMIN';
        console.log('Fetched user role from DB:', user.roles.role_name);
        console.log('Actual isSuperAdmin:', actualIsSuperAdmin);
      }
    }

    const ticket = await this.prisma.issue_tickets.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    console.log('Ticket found - Reported by:', ticket.reported_by);
    console.log('Permission check - Owner:', ticket.reported_by === userId, 'Super Admin:', actualIsSuperAdmin);

    // Only ticket owner or super admin can update
    if (ticket.reported_by !== userId && !actualIsSuperAdmin) {
      console.log('PERMISSION DENIED - Not owner and not super admin');
      throw new ForbiddenException('You do not have permission to update this ticket');
    }

    console.log('Permission granted - proceeding with update');

    const updateData: any = {
      ...updateDto,
      updated_at: new Date().toISOString(),
    };

    if (updateDto.attachments) {
      updateData.attachments = JSON.stringify(updateDto.attachments);
    }

    if (updateDto.status === 'RESOLVED' || updateDto.status === 'CLOSED') {
      updateData.resolved_at = new Date().toISOString();
    }

    const updated = await this.prisma.issue_tickets.update({
      where: { s_no: id },
      data: updateData,
      include: {
        users_issue_tickets_reported_byTousers: {
          select: {
            s_no: true,
            name: true,
            email: true,
          },
        },
        users_issue_tickets_assigned_toTousers: {
          select: {
            s_no: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return ResponseUtil.success({
      ...updated,
      attachments: updated.attachments ? JSON.parse(updated.attachments as string) : [],
    }, 'Ticket updated successfully');
  }

  async remove(id: number, userId: number, isSuperAdmin: boolean) {
    // Fetch user to verify role if isSuperAdmin is false
    let actualIsSuperAdmin = isSuperAdmin;
    if (!isSuperAdmin && userId) {
      const user = await this.prisma.users.findUnique({
        where: { s_no: userId },
        include: { roles: true },
      });
      
      if (user && user.roles) {
        actualIsSuperAdmin = user.roles.role_name === 'SUPER_ADMIN';
      }
    }

    const ticket = await this.prisma.issue_tickets.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Only ticket owner or super admin can delete
    if (ticket.reported_by !== userId && !actualIsSuperAdmin) {
      throw new ForbiddenException('You do not have permission to delete this ticket');
    }

    await this.prisma.issue_tickets.update({
      where: { s_no: id },
      data: {
        is_deleted: true,
        updated_at: new Date().toISOString(),
      },
    });

    return ResponseUtil.noContent('Ticket deleted successfully');
  }

  async addComment(ticketId: number, commentDto: AddCommentDto, userId: number) {
    const ticket = await this.prisma.issue_tickets.findFirst({
      where: {
        s_no: ticketId,
        is_deleted: false,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const comment = await this.prisma.issue_ticket_comments.create({
      data: {
        ticket_id: ticketId,
        user_id: userId,
        comment: commentDto.comment,
        attachments: commentDto.attachments ? JSON.stringify(commentDto.attachments) : null,
        created_at: new Date().toISOString(),
      },
      include: {
        users: {
          select: {
            s_no: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Update ticket's updated_at
    await this.prisma.issue_tickets.update({
      where: { s_no: ticketId },
      data: { updated_at: new Date().toISOString() },
    });

    return ResponseUtil.success({
      ...comment,
      attachments: comment.attachments ? JSON.parse(comment.attachments as string) : [],
    }, 'Comment added successfully');
  }

  async getStats(organizationId?: number) {
    const where: any = {
      is_deleted: false,
    };

    if (organizationId) {
      where.organization_id = organizationId;
    }

    const [total, open, inProgress, resolved, closed, byCategory, byPriority] = await Promise.all([
      this.prisma.issue_tickets.count({ where }),
      this.prisma.issue_tickets.count({ where: { ...where, status: 'OPEN' } }),
      this.prisma.issue_tickets.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      this.prisma.issue_tickets.count({ where: { ...where, status: 'RESOLVED' } }),
      this.prisma.issue_tickets.count({ where: { ...where, status: 'CLOSED' } }),
      this.prisma.issue_tickets.groupBy({
        by: ['category'],
        where,
        _count: true,
      }),
      this.prisma.issue_tickets.groupBy({
        by: ['priority'],
        where,
        _count: true,
      }),
    ]);

    return ResponseUtil.success({
      total,
      byStatus: {
        open,
        inProgress,
        resolved,
        closed,
      },
      byCategory: byCategory.reduce((acc, item) => {
        acc[item.category] = item._count;
        return acc;
      }, {}),
      byPriority: byPriority.reduce((acc, item) => {
        acc[item.priority] = item._count;
        return acc;
      }, {}),
    }, 'Ticket statistics fetched successfully');
  }
}
