import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';

interface GetOrganizationsParams {
  page: number;
  limit: number;
}

@Injectable()
export class OrganizationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all organizations with admin details and statistics
   */
  async getAllOrganizations(params: GetOrganizationsParams) {
    const { page, limit } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      is_deleted: false,
    };

    // Get total count
    const total = await this.prisma.organization.count({ where });

    // Get organizations with related data
    const organizations = await this.prisma.organization.findMany({
      where,
      skip,
      take: limit,
      select: {
        s_no: true,
        name: true,
        description: true,
        created_at: true,
        updated_at: true,
        // Get PG locations with details
        pg_locations: {
          where: {
            is_deleted: false,
          },
          select: {
            s_no: true,
            location_name: true,
            address: true,
            status: true,
            // Get rooms for each PG location
            rooms: {
              where: {
                is_deleted: false,
              },
              select: {
                s_no: true,
                room_no: true,
                // Get beds for each room
                beds: {
                  where: {
                    is_deleted: false,
                  },
                  select: {
                    s_no: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Transform data to include counts and admin info
    const transformedOrganizations = await Promise.all(
      organizations.map(async (org) => {
        // Get admin users directly from users table
        // Query: organization_id -> users table -> filter by role_name = 'ADMIN'
        const adminUsers = await this.prisma.users.findMany({
          where: {
            organization_id: org.s_no,  // Match organization
            is_deleted: false,
            roles: {
              role_name: 'ADMIN',        // Filter by ADMIN role
            },
          },
          select: {
            s_no: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            created_at: true,
            roles: {
              select: {
                role_name: true,
              },
            },
          },
        });
        
        // Transform PG locations with room and bed counts
        const pgLocationsWithDetails = org.pg_locations.map((pg) => ({
          s_no: pg.s_no,
          location_name: pg.location_name,
          address: pg.address,
          status: pg.status,
          rooms_count: pg.rooms.length,
          beds_count: pg.rooms.reduce((total, room) => total + room.beds.length, 0),
          rooms: pg.rooms.map((room) => ({
            s_no: room.s_no,
            room_no: room.room_no,
            beds_count: room.beds.length,
          })),
        }));
        
        return {
          s_no: org.s_no,
          name: org.name,
          description: org.description,
          created_at: org.created_at,
          updated_at: org.updated_at,
          admins: adminUsers.map((user) => ({
            s_no: user.s_no,
            name: user.name,
            email: user.email,
            phone: user.phone,
            status: user.status,
            role: user.roles.role_name,
            created_at: user.created_at,
          })),
          pg_locations_count: org.pg_locations.length,
          pg_locations: pgLocationsWithDetails,
        };
      })
    );

    return ResponseUtil.paginated(transformedOrganizations, total, page, limit, 'Organizations fetched successfully');
  }

  /**
   * Get organization statistics for SuperAdmin dashboard
   */
  async getOrganizationStats() {
    // Total organizations
    const totalOrganizations = await this.prisma.organization.count({
      where: { is_deleted: false },
    });

    // Active organizations (count orgs with active PG locations)
    const activeOrganizations = await this.prisma.organization.count({
      where: {
        is_deleted: false,
        pg_locations: {
          some: {
            status: 'ACTIVE',
            is_deleted: false,
          },
        },
      },
    });

    // Total users across all organizations
    const totalUsers = await this.prisma.users.count({
      where: { is_deleted: false },
    });

    // Total PG locations
    const totalPGLocations = await this.prisma.pg_locations.count({
      where: { is_deleted: false },
    });

    // Total tenants
    const totalTenants = await this.prisma.tenants.count({
      where: { is_deleted: false },
    });

    // Total revenue (sum of all paid tenant payments)
    const revenueResult = await this.prisma.rent_payments.aggregate({
      where: {
        is_deleted: false,
        status: 'PAID',
      },
      _sum: {
        amount_paid: true,
      },
    });

    const totalRevenue = revenueResult._sum.amount_paid || 0;

    // Organizations created in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOrganizations = await this.prisma.organization.count({
      where: {
        is_deleted: false,
        created_at: {
          gte: thirtyDaysAgo,
        },
      },
    });

    return ResponseUtil.success({
      totalOrganizations,
      activeOrganizations,
      inactiveOrganizations: totalOrganizations - activeOrganizations,
      totalUsers,
      totalPGLocations,
      totalTenants,
      totalRevenue: Number(totalRevenue),
      recentOrganizations,
    }, 'Organization statistics fetched successfully');
  }

  /**
   * Get organization details by ID
   */
  async getOrganizationById(id: number) {
    const organization = await this.prisma.organization.findUnique({
      where: { s_no: id },
      select: {
        s_no: true,
        name: true,
        description: true,
        created_at: true,
        updated_at: true,
        // Get PG locations
        pg_locations: {
          where: {
            is_deleted: false,
          },
          select: {
            s_no: true,
            location_name: true,
            address: true,
            status: true,
            created_at: true,
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Get tenant count for this organization (through pg_locations)
    const tenantCount = await this.prisma.tenants.count({
      where: {
        is_deleted: false,
        pg_locations: {
          organization_id: id,
        },
      },
    });

    // Get revenue for this organization (through pg_locations)
    const revenueResult = await this.prisma.rent_payments.aggregate({
      where: {
        is_deleted: false,
        status: 'PAID',
        pg_locations: {
          organization_id: id,
        },
      },
      _sum: {
        amount_paid: true,
      },
    });

    const totalRevenue = revenueResult._sum.amount_paid || 0;

    // Get all users for this organization
    const allUsers = await this.prisma.users.findMany({
      where: {
        organization_id: id,
        is_deleted: false,
      },
      select: {
        s_no: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        created_at: true,
        roles: {
          select: {
            role_name: true,
          },
        },
      },
    });

    const transformedUsers = allUsers.map(user => ({
      s_no: user.s_no,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      role: user.roles.role_name,
      created_at: user.created_at,
    }));

    return ResponseUtil.success({
      s_no: organization.s_no,
      name: organization.name,
      description: organization.description,
      created_at: organization.created_at,
      updated_at: organization.updated_at,
      users: transformedUsers,
      pg_locations: organization.pg_locations,
      statistics: {
        totalUsers: transformedUsers.length,
        totalPGLocations: organization.pg_locations.length,
        totalTenants: tenantCount,
        totalRevenue: Number(totalRevenue),
      },
    }, 'Organization details fetched successfully');
  }
}
