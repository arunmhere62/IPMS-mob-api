import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PgUsersService {
  constructor(private prisma: PrismaService) {}

  private async assertPgInOrganization(pgId: number, organizationId: number) {
    const pg = await this.prisma.pg_locations.findFirst({
      where: {
        s_no: pgId,
        is_deleted: false,
        organization_id: organizationId,
      },
      select: { s_no: true },
    });

    if (!pg) {
      throw new NotFoundException('PG location not found');
    }
  }

  /**
   * Assign a user to a PG location
   */
  async assignUserToPG(userId: number, pgId: number) {
    // Check if user exists
    const user = await this.prisma.users.findUnique({
      where: { s_no: userId, is_deleted: false },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Check if PG exists
    const pg = await this.prisma.pg_locations.findUnique({
      where: { s_no: pgId, is_deleted: false },
    });
    if (!pg) {
      throw new NotFoundException(`PG location with ID ${pgId} not found`);
    }

    // Check if user belongs to same organization as PG
    if (user.organization_id !== pg.organization_id) {
      throw new ConflictException('User and PG must belong to the same organization');
    }

    // Check if assignment already exists
    const existingAssignment = await this.prisma.pg_users.findUnique({
      where: {
        pg_id_user_id: {
          pg_id: pgId,
          user_id: userId,
        },
      },
    });

    if (existingAssignment) {
      // If exists but inactive, reactivate it
      if (!existingAssignment.is_active) {
        return this.prisma.pg_users.update({
          where: { s_no: existingAssignment.s_no },
          data: { is_active: true },
        });
      }
      throw new ConflictException('User is already assigned to this PG location');
    }

    // Create new assignment
    return this.prisma.pg_users.create({
      data: {
        pg_id: pgId,
        user_id: userId,
        is_active: true,
      },
      include: {
        users: {
          select: {
            s_no: true,
            name: true,
            email: true,
            phone: true,
            role_id: true,
            roles: {
              select: {
                role_name: true,
              },
            },
          },
        },
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            address: true,
          },
        },
      },
    });
  }

  /**
   * Remove a user from a PG location (soft delete)
   */
  async removeUserFromPG(userId: number, pgId: number) {
    const assignment = await this.prisma.pg_users.findUnique({
      where: {
        pg_id_user_id: {
          pg_id: pgId,
          user_id: userId,
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('User assignment to PG not found');
    }

    return this.prisma.pg_users.update({
      where: { s_no: assignment.s_no },
      data: { is_active: false },
    });
  }

  /**
   * Get all PG locations assigned to a user
   */
  async getUserPGs(userId: number, isActive: boolean = true) {
    const whereClause: any = { user_id: userId };
    if (isActive !== undefined) {
      whereClause.is_active = isActive;
    }

    return this.prisma.pg_users.findMany({
      where: whereClause,
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            address: true,
            pincode: true,
            status: true,
            pg_type: true,
            rent_cycle_type: true,
            rent_cycle_start: true,
            rent_cycle_end: true,
            city_id: true,
            state_id: true,
            organization_id: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  /**
   * Get all users assigned to a PG location
   */
  async getPGUsers(pgId: number, isActive: boolean = true) {
    const whereClause: any = { pg_id: pgId };
    if (isActive !== undefined) {
      whereClause.is_active = isActive;
    }

    return this.prisma.pg_users.findMany({
      where: whereClause,
      include: {
        users: {
          select: {
            s_no: true,
            name: true,
            email: true,
            phone: true,
            role_id: true,
            status: true,
            gender: true,
            address: true,
            roles: {
              select: {
                s_no: true,
                role_name: true,
              },
            },
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  /**
   * Check if a user is assigned to a specific PG
   */
  async isUserAssignedToPG(userId: number, pgId: number): Promise<boolean> {
    const assignment = await this.prisma.pg_users.findFirst({
      where: {
        pg_id: pgId,
        user_id: userId,
        is_active: true,
      },
      select: { s_no: true },
    });

    return !!assignment;
  }

  /**
   * Get assignment details
   */
  async getAssignment(userId: number, pgId: number, organizationId: number) {
    await this.assertPgInOrganization(pgId, organizationId);

    const assignment = await this.prisma.pg_users.findUnique({
      where: {
        pg_id_user_id: {
          pg_id: pgId,
          user_id: userId,
        },
      },
      include: {
        users: {
          select: {
            s_no: true,
            name: true,
            email: true,
            phone: true,
            role_id: true,
            roles: {
              select: {
                role_name: true,
              },
            },
          },
        },
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            address: true,
            status: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  /**
   * Update monthly salary amount for a user in a PG
   */
  async updateMonthlySalaryAmount(userId: number, pgId: number, organizationId: number, monthlySalaryAmount: number) {
    await this.assertPgInOrganization(pgId, organizationId);

    const assignment = await this.prisma.pg_users.findUnique({
      where: {
        pg_id_user_id: {
          pg_id: pgId,
          user_id: userId,
        },
      },
      select: { s_no: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return this.prisma.pg_users.update({
      where: { s_no: assignment.s_no },
      data: {
        monthly_salary_amount: monthlySalaryAmount,
      },
      include: {
        users: {
          select: {
            s_no: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
          },
        },
      },
    });
  }

  /**
   * Bulk assign users to a PG
   */
  async bulkAssignUsersToPG(userIds: number[], pgId: number) {
    // Check if PG exists
    const pg = await this.prisma.pg_locations.findUnique({
      where: { s_no: pgId, is_deleted: false },
    });
    if (!pg) {
      throw new NotFoundException(`PG location with ID ${pgId} not found`);
    }

    const results = [];
    for (const userId of userIds) {
      try {
        const assignment = await this.assignUserToPG(userId, pgId);
        results.push({ userId, success: true, assignment });
      } catch (error) {
        results.push({ userId, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Bulk remove users from a PG
   */
  async bulkRemoveUsersFromPG(userIds: number[], pgId: number) {
    const results = [];
    for (const userId of userIds) {
      try {
        await this.removeUserFromPG(userId, pgId);
        results.push({ userId, success: true });
      } catch (error) {
        results.push({ userId, success: false, error: error.message });
      }
    }

    return results;
  }
}
