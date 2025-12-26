import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3DeletionService } from '../common/s3-deletion.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ResponseUtil } from '../../common/utils/response.util';
import { SubscriptionRestrictionService } from '../subscription/subscription-restriction.service';

@Injectable()
export class EmployeeService {
  constructor(
    private prisma: PrismaService,
    private s3DeletionService: S3DeletionService,
    private subscriptionRestrictionService: SubscriptionRestrictionService,
  ) {}

  /**
   * Create a new employee
   */
  async create(organizationId: number, createDto: CreateEmployeeDto) {
    await this.subscriptionRestrictionService.assertCanCreateEmployeeForOrganization(organizationId);

    if (!createDto.phone) {
      throw new BadRequestException('Phone number is required');
    }

    if (!/^\d{10}$/.test(createDto.phone)) {
      throw new BadRequestException('Phone number must be 10 digits');
    }

    if (!createDto.gender) {
      throw new BadRequestException('Gender is required');
    }

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Create employee (password stored as plain text for now)
    const employee = await this.prisma.user.create({
      data: {
        name: createDto.name,
        email: createDto.email,
        password: createDto.password,
        phone: createDto.phone,
        role_id: createDto.role_id,
        pg_id: createDto.pg_id,
        organization_id: organizationId,
        gender: createDto.gender,
        address: createDto.address,
        city_id: createDto.city_id,
        state_id: createDto.state_id,
        pincode: createDto.pincode,
        country: createDto.country,
        proof_documents: createDto.proof_documents ? JSON.stringify(createDto.proof_documents) : null,
        profile_images: createDto.profile_images ? JSON.stringify(createDto.profile_images) : null,
        status: 'ACTIVE',
        is_deleted: false,
      },
      include: {
        roles: {
          select: {
            s_no: true,
            role_name: true,
          },
        },
        city: {
          select: {
            s_no: true,
            name: true,
          },
        },
        state: {
          select: {
            s_no: true,
            name: true,
          },
        },
      },
    });

    // Remove password from response
    const { password, ...employeeWithoutPassword } = employee;

    return ResponseUtil.success(employeeWithoutPassword, 'Employee created successfully');
  }

  /**
   * Get all employees with pagination and filters
   * Excludes the current user from the list
   */
  async findAll(
    organizationId: number,
    currentUserId: number,
    page: number = 1,
    limit: number = 10,
    pgId?: number,
    roleId?: number,
    search?: string,
  ) {
    const skip = (page - 1) * limit;

    const whereClause: any = {
      organization_id: organizationId,
      is_deleted: false,
      s_no: {
        not: currentUserId, // Exclude current user from list
      },
    };

    if (pgId) {
      whereClause.pg_id = pgId;
    }

    if (roleId) {
      whereClause.role_id = roleId;
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [employees, total] = await Promise.all([
      this.prisma.user.findMany({
        where: whereClause,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        select: {
          s_no: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          role_id: true,
          pg_id: true,
          organization_id: true,
          gender: true,
          city_id: true,
          state_id: true,
          created_at: true,
          updated_at: true,
          roles: {
            select: {
              s_no: true,
              role_name: true,
            },
          },
          city: {
            select: {
              s_no: true,
              name: true,
            },
          },
          state: {
            select: {
              s_no: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where: whereClause }),
    ]);

    return ResponseUtil.paginated(employees, total, page, limit, 'Employees fetched successfully');
  }

  /**
   * Get a single employee by ID
   */
  async findOne(id: number, organizationId: number) {
    const employee = await this.prisma.user.findFirst({
      where: {
        s_no: id,
        organization_id: organizationId,
        is_deleted: false,
      },
      select: {
        s_no: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        role_id: true,
        pg_id: true,
        organization_id: true,
        gender: true,
        address: true,
        city_id: true,
        state_id: true,
        pincode: true,
        country: true,
        proof_documents: true,
        profile_images: true,
        created_at: true,
        updated_at: true,
        roles: {
          select: {
            s_no: true,
            role_name: true,
          },
        },
        city: {
          select: {
            s_no: true,
            name: true,
          },
        },
        state: {
          select: {
            s_no: true,
            name: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return ResponseUtil.success(employee, 'Employee fetched successfully');
  }

  /**
   * Update an employee
   */
  async update(id: number, organizationId: number, currentUserId: number, updateDto: UpdateEmployeeDto) {
    // Check if employee exists
    const existing = await this.prisma.user.findFirst({
      where: {
        s_no: id,
        organization_id: organizationId,
        is_deleted: false,
      },
      include: {
        roles: {
          select: {
            s_no: true,
            role_name: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Employee not found');
    }

    // Prevent self-update
    if (currentUserId === id) {
      throw new BadRequestException('You cannot update your own account');
    }

    // Check if trying to change role of last admin
    if (updateDto.role_id && updateDto.role_id !== existing.role_id) {
      // Check if this employee is an admin
      const adminRoleId = await this.prisma.roles.findFirst({
        where: {
          role_name: 'ADMIN',
        },
        select: { s_no: true },
      });

      if (adminRoleId && existing.role_id === adminRoleId.s_no) {
        // Count total admins in organization
        const adminCount = await this.prisma.user.count({
          where: {
            organization_id: organizationId,
            role_id: adminRoleId.s_no,
            is_deleted: false,
          },
        });

        if (adminCount === 1) {
          throw new BadRequestException('Cannot change role of the last admin. Assign another admin first.');
        }
      }
    }

    // Handle S3 image deletion if profile images are being updated
    if (updateDto.profile_images !== undefined) {
      const oldImages = (Array.isArray(existing.profile_images) ? existing.profile_images : 
        (typeof existing.profile_images === 'string' ? JSON.parse(existing.profile_images) : [])) as string[];
      const newImages = (Array.isArray(updateDto.profile_images) ? updateDto.profile_images : []) as string[];
      
      await this.s3DeletionService.deleteRemovedFiles(
        oldImages,
        newImages,
        'employee',
        'profile_images',
      );
    }

    // Handle S3 document deletion if proof documents are being updated
    if (updateDto.proof_documents !== undefined) {
      const oldDocuments = (Array.isArray(existing.proof_documents) ? existing.proof_documents : 
        (typeof existing.proof_documents === 'string' ? JSON.parse(existing.proof_documents) : [])) as string[];
      const newDocuments = (Array.isArray(updateDto.proof_documents) ? updateDto.proof_documents : []) as string[];
      
      await this.s3DeletionService.deleteRemovedFiles(
        oldDocuments,
        newDocuments,
        'employee',
        'proof_documents',
      );
    }

    const employee = await this.prisma.user.update({
      where: { s_no: id },
      data: {
        name: updateDto.name,
        phone: updateDto.phone,
        role_id: updateDto.role_id,
        pg_id: updateDto.pg_id,
        gender: updateDto.gender,
        address: updateDto.address,
        city_id: updateDto.city_id,
        state_id: updateDto.state_id,
        pincode: updateDto.pincode,
        country: updateDto.country,
        proof_documents: updateDto.proof_documents ? JSON.stringify(updateDto.proof_documents) : undefined,
        profile_images: updateDto.profile_images ? JSON.stringify(updateDto.profile_images) : undefined,
      },
      select: {
        s_no: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        role_id: true,
        pg_id: true,
        organization_id: true,
        gender: true,
        address: true,
        city_id: true,
        state_id: true,
        pincode: true,
        country: true,
        proof_documents: true,
        profile_images: true,
        created_at: true,
        updated_at: true,
        roles: {
          select: {
            s_no: true,
            role_name: true,
          },
        },
        city: {
          select: {
            s_no: true,
            name: true,
          },
        },
        state: {
          select: {
            s_no: true,
            name: true,
          },
        },
      },
    });

    return ResponseUtil.success(employee, 'Employee updated successfully');
  }

  /**
   * Soft delete an employee
   */
  async remove(id: number, organizationId: number, currentUserId: number) {
    // Check if employee exists
    const existing = await this.prisma.user.findFirst({
      where: {
        s_no: id,
        organization_id: organizationId,
        is_deleted: false,
      },
      include: {
        roles: {
          select: {
            s_no: true,
            role_name: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Employee not found');
    }

    // Prevent self-deletion
    if (currentUserId === id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    // Check if trying to delete last admin
    const adminRoleId = await this.prisma.roles.findFirst({
      where: {
        role_name: 'ADMIN',
      },
      select: { s_no: true },
    });

    if (adminRoleId && existing.role_id === adminRoleId.s_no) {
      const adminCount = await this.prisma.user.count({
        where: {
          organization_id: organizationId,
          role_id: adminRoleId.s_no,
          is_deleted: false,
        },
      });

      if (adminCount === 1) {
        throw new BadRequestException('Cannot delete the last admin. Assign another admin first.');
      }
    }

    // Delete S3 profile images before soft deleting employee
    if (existing.profile_images && Array.isArray(existing.profile_images) && existing.profile_images.length > 0) {
      const profileImages = (existing.profile_images as string[]);
      await this.s3DeletionService.deleteAllFiles(
        profileImages,
        'employee',
        'profile_images',
      );
    }

    // Delete S3 proof documents before soft deleting employee
    if (existing.proof_documents && Array.isArray(existing.proof_documents) && existing.proof_documents.length > 0) {
      const proofDocuments = (existing.proof_documents as string[]);
      await this.s3DeletionService.deleteAllFiles(
        proofDocuments,
        'employee',
        'proof_documents',
      );
    }

    await this.prisma.user.update({
      where: { s_no: id },
      data: {
        is_deleted: true,
        status: 'INACTIVE',
      },
    });

    return ResponseUtil.noContent('Employee deleted successfully');
  }

  /**
   * Get employee statistics
   */
  async getStats(organizationId: number, pgId?: number) {
    const whereClause: any = {
      organization_id: organizationId,
      is_deleted: false,
    };

    if (pgId) {
      whereClause.pg_id = pgId;
    }

    const [totalEmployees, activeEmployees, employeesByRole] = await Promise.all([
      this.prisma.user.count({ where: whereClause }),
      this.prisma.user.count({ where: { ...whereClause, status: 'ACTIVE' } }),
      this.prisma.user.groupBy({
        by: ['role_id'],
        where: whereClause,
        _count: true,
      }),
    ]);

    return ResponseUtil.success({
      totalEmployees,
      activeEmployees,
      inactiveEmployees: totalEmployees - activeEmployees,
      employeesByRole,
    }, 'Employee statistics fetched successfully');
  }
}
