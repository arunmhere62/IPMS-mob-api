import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PendingRentCalculatorService } from '../common/pending-rent-calculator.service';
import { RentCycleCalculatorService } from '../common/rent-cycle-calculator.service';
import { S3DeletionService } from '../common/s3-deletion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { ResponseUtil } from '../../common/utils/response.util';
import { TenantStatusService } from './tenant-status/tenant-status.service';
import { SubscriptionRestrictionService } from '../subscription/subscription-restriction.service';

@Injectable()
export class TenantService {
  constructor(
    private prisma: PrismaService,
    private tenantStatusService: TenantStatusService,
    private pendingRentCalculatorService: PendingRentCalculatorService,
    private rentCycleCalculatorService: RentCycleCalculatorService,
    private s3DeletionService: S3DeletionService,
    private subscriptionRestrictionService: SubscriptionRestrictionService,
  ) {}

  /**
   * Create a new tenant
   */
  async create(createTenantDto: CreateTenantDto) {
    // Generate unique tenant_id
    const tenantId = await this.generateTenantId();

    // Verify PG location exists
    const pgLocation = await this.prisma.pg_locations.findUnique({
      where: { s_no: createTenantDto.pg_id },
    });

    if (!pgLocation) {
      throw new NotFoundException(`PG Location with ID ${createTenantDto.pg_id} not found`);
    }

    await this.subscriptionRestrictionService.assertCanCreateTenantForOrganization(pgLocation.organization_id);

    // Verify room exists if provided
    if (createTenantDto.room_id) {
      const room = await this.prisma.rooms.findUnique({
        where: { s_no: createTenantDto.room_id },
      });

      if (!room) {
        throw new NotFoundException(`Room with ID ${createTenantDto.room_id} not found`);
      }
    }

    // Verify bed exists if provided
    if (createTenantDto.bed_id) {
      const bed = await this.prisma.beds.findUnique({
        where: { s_no: createTenantDto.bed_id },
      });

      if (!bed) {
        throw new NotFoundException(`Bed with ID ${createTenantDto.bed_id} not found`);
      }

      // Check if bed is already occupied by another active tenant
      const occupiedBed = await this.prisma.tenants.findFirst({
        where: {
          bed_id: createTenantDto.bed_id,
          status: 'ACTIVE',
          is_deleted: false,
        },
      });

      if (occupiedBed) {
        throw new BadRequestException(`Bed with ID ${createTenantDto.bed_id} is already occupied`);
      }
    }

    // Create tenant
    const tenant = await this.prisma.tenants.create({
      data: {
        tenant_id: tenantId,
        name: createTenantDto.name,
        phone_no: createTenantDto.phone_no,
        whatsapp_number: createTenantDto.whatsapp_number,
        email: createTenantDto.email,
        pg_id: createTenantDto.pg_id,
        room_id: createTenantDto.room_id,
        bed_id: createTenantDto.bed_id,
        check_in_date: new Date(createTenantDto.check_in_date),
        check_out_date: createTenantDto.check_out_date ? new Date(createTenantDto.check_out_date) : null,
        status: (createTenantDto.status as any) || 'ACTIVE',
        occupation: createTenantDto.occupation,
        tenant_address: createTenantDto.tenant_address,
        city_id: createTenantDto.city_id,
        state_id: createTenantDto.state_id,
        images: createTenantDto.images,
        proof_documents: createTenantDto.proof_documents,
      },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
          },
        },
        rooms: {
          select: {
            s_no: true,
            room_no: true,
          },
        },
        beds: {
          select: {
            s_no: true,
            bed_no: true,
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

    return ResponseUtil.success(tenant, 'Tenant created successfully');
  }

  /**
   * Get all tenants with filters and rent cycle information
   */
  async findAll(params: {
    page?: number;
    limit?: number;
    pg_id?: number;
    room_id?: number;
    status?: string;
    search?: string;
    pending_rent?: boolean;
    pending_advance?: boolean;
    partial_rent?: boolean;
  }) {
    const { page = 1, limit = 10, pg_id, room_id, status, search, pending_rent, pending_advance, partial_rent } = params;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      is_deleted: false,
    };

    if (pg_id) {
      where.pg_id = pg_id;
    }

    if (room_id) {
      where.room_id = room_id;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { tenant_id: { contains: search, mode: 'insensitive' } },
        { phone_no: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await this.prisma.tenants.count({ where });

    // Get tenants with all related data including rent cycle type
    const tenants = await this.prisma.tenants.findMany({
      where,
      skip,
      take: limit,
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            address: true,
            rent_cycle_type: true,
          },
        },
        rooms: {
          select: {
            s_no: true,
            room_no: true,
          },
        },
        beds: {
          select: {
            s_no: true,
            bed_no: true,
            bed_price: true,
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
        tenant_payments: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            end_date: 'desc',
          },
          select: {
            s_no: true,
            payment_date: true,
            amount_paid: true,
            actual_rent_amount: true,
            start_date: true,
            end_date: true,
            payment_method: true,
            status: true,
            remarks: true,
          },
        },
        advance_payments: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            payment_date: 'desc',
          },
          select: {
            s_no: true,
            payment_date: true,
            amount_paid: true,
            actual_rent_amount: true,
            payment_method: true,
            status: true,
            remarks: true,
          },
        },
        refund_payments: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            payment_date: 'desc',
          },
          select: {
            s_no: true,
            amount_paid: true,
            payment_method: true,
            payment_date: true,
            status: true,
            remarks: true,
            actual_rent_amount: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Enrich tenants with status calculations and rent cycle information
    const enrichedTenants = tenants.map(tenant => {
      const statusEnriched = this.tenantStatusService.enrichTenantsWithStatus([tenant])[0];
      
      // Calculate current rent cycle dates
      let currentRentCycle = null;
      if (tenant.pg_locations && tenant.tenant_payments.length > 0) {
        const lastPayment = tenant.tenant_payments[0];
        const cycleType = tenant.pg_locations.rent_cycle_type as 'CALENDAR' | 'MIDMONTH';
        const nextCycleDates = this.rentCycleCalculatorService.getNextRentCycleDates(
          lastPayment.end_date.toISOString().split('T')[0],
          cycleType,
        );
        const daysInPeriod = this.rentCycleCalculatorService.calculateDaysInPeriod(
          nextCycleDates.startDate,
          nextCycleDates.endDate,
        );
        currentRentCycle = {
          start_date: nextCycleDates.startDate,
          end_date: nextCycleDates.endDate,
          days: daysInPeriod,
          cycle_type: cycleType,
        };
      } else if (tenant.pg_locations) {
        // No previous payments, calculate from check-in date
        const cycleType = tenant.pg_locations.rent_cycle_type as 'CALENDAR' | 'MIDMONTH';
        const checkInDate = tenant.check_in_date.toISOString().split('T')[0];
        let cycleDates;
        
        if (cycleType === 'CALENDAR') {
          cycleDates = this.rentCycleCalculatorService.getCalendarMonthDates(checkInDate);
        } else {
          cycleDates = this.rentCycleCalculatorService.getMidmonthDates(checkInDate);
        }
        
        const daysInPeriod = this.rentCycleCalculatorService.calculateDaysInPeriod(
          cycleDates.start,
          cycleDates.end,
        );
        currentRentCycle = {
          start_date: cycleDates.start,
          end_date: cycleDates.end,
          days: daysInPeriod,
          cycle_type: cycleType,
        };
      }

      // Get most recent payment for status determination
      const lastPayment = tenant.tenant_payments.length > 0 ? tenant.tenant_payments[0] : null;
      let paymentStatus = 'NO_PAYMENT';
      
      if (lastPayment) {
        if (lastPayment.status === 'PAID') {
          paymentStatus = 'PAID';
        } else if (lastPayment.status === 'PARTIAL') {
          paymentStatus = 'PARTIAL';
        } else if (lastPayment.status === 'PENDING') {
          paymentStatus = 'PENDING';
        } else if (lastPayment.status === 'FAILED') {
          paymentStatus = 'FAILED';
        }
      }

      // Extract partial payments from all tenant payments
      const partialPayments = tenant.tenant_payments.filter(
        (payment: any) => payment.status === 'PARTIAL'
      );

      // Calculate total partial amount due
      const totalPartialDue = partialPayments.reduce((sum: number, payment: any) => {
        const actualAmount = parseFloat(payment.actual_rent_amount) || 0;
        const paidAmount = parseFloat(payment.amount_paid) || 0;
        return sum + (actualAmount - paidAmount);
      }, 0);

      // Check for unpaid months between check-in date and now
      const unpaidMonths = this.getUnpaidMonthsWithCycleDates(
        tenant.check_in_date,
        tenant.check_out_date,
        tenant.tenant_payments,
        tenant.pg_locations?.rent_cycle_type as 'CALENDAR' | 'MIDMONTH'
      );
      
      // Override is_rent_paid to false if there are unpaid months
      const isRentPaid = unpaidMonths.length === 0 ? statusEnriched.is_rent_paid : false;
      
      return {
        ...statusEnriched,
        is_rent_paid: isRentPaid,
        rent_cycle: currentRentCycle,
        payment_status: paymentStatus,
        partial_payments: partialPayments,
        total_partial_due: totalPartialDue,
        unpaid_months: unpaidMonths,
        tenant_payments: tenant.tenant_payments,
        advance_payments: tenant.advance_payments,
        refund_payments: tenant.refund_payments,
      };
    });

    // Filter by pending rent if requested
    let filteredTenants = enrichedTenants;
    
    if (pending_rent) {
      filteredTenants = this.tenantStatusService.getTenantsWithPendingRent(filteredTenants);
    }

    // Filter by pending advance if requested
    if (pending_advance) {
      filteredTenants = this.tenantStatusService.getTenantsWithoutAdvance(filteredTenants);
    }

    // Filter by partial rent if requested
    if (partial_rent) {
      filteredTenants = this.tenantStatusService.getTenantsWithPartialRent(filteredTenants);
    }

    // Recalculate pagination based on filtered results
    const filteredTotal = filteredTenants.length;
    const paginatedFilteredTenants = pending_rent || pending_advance || partial_rent
      ? filteredTenants 
      : filteredTenants;

    return ResponseUtil.paginated(
      paginatedFilteredTenants,
      pending_rent || pending_advance || partial_rent ? filteredTotal : total,
      page,
      limit,
      'Tenants fetched successfully'
    );
  }

  /**
   * Get tenants with pending rent
   */
  async getTenantsWithPendingRent(params: {
    page?: number;
    limit?: number;
    pg_id?: number;
  }) {
    const { page = 1, limit = 10, pg_id } = params;
    const skip = (page - 1) * limit;

    // Get all tenants first
    const tenants = await this.prisma.tenants.findMany({
      where: {
        pg_id,
        status: 'ACTIVE',
      },
      include: {
        pg_locations: true,
        rooms: true,
        beds: true,
        city: true,
        state: true,
        tenant_payments: {
          orderBy: { payment_date: 'desc' },
        },
        advance_payments: {
          orderBy: { payment_date: 'desc' },
        },
        refund_payments: {
          orderBy: { payment_date: 'desc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Filter tenants with pending rent using TenantStatusService
    const filteredTenants = this.tenantStatusService.getTenantsWithPendingRent(tenants);
    
    // Apply pagination to filtered results
    const paginatedTenants = filteredTenants.slice(skip, skip + limit);
    const total = filteredTenants.length;

    return ResponseUtil.paginated(paginatedTenants, total, page, limit, 'Tenants with pending rent fetched successfully');
  }

  /**
   * Get tenants with partial rent
   */
  async getTenantsWithPartialRent(params: {
    page?: number;
    limit?: number;
    pg_id?: number;
  }) {
    const { page = 1, limit = 10, pg_id } = params;
    const skip = (page - 1) * limit;

    // Get all tenants first
    const tenants = await this.prisma.tenants.findMany({
      where: {
        pg_id,
        status: 'ACTIVE',
      },
      include: {
        pg_locations: true,
        rooms: true,
        beds: true,
        city: true,
        state: true,
        tenant_payments: {
          orderBy: { payment_date: 'desc' },
        },
        advance_payments: {
          orderBy: { payment_date: 'desc' },
        },
        refund_payments: {
          orderBy: { payment_date: 'desc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Filter tenants with partial rent using TenantStatusService
    const filteredTenants = this.tenantStatusService.getTenantsWithPartialRent(tenants);
    
    // Apply pagination to filtered results
    const paginatedTenants = filteredTenants.slice(skip, skip + limit);
    const total = filteredTenants.length;

    return ResponseUtil.paginated(paginatedTenants, total, page, limit, 'Tenants with partial rent fetched successfully');
  }

  /**
   * Get tenants without advance payment
   */
  async getTenantsWithoutAdvance(params: {
    page?: number;
    limit?: number;
    pg_id?: number;
  }) {
    const { page = 1, limit = 10, pg_id } = params;
    const skip = (page - 1) * limit;

    // Get all tenants first
    const tenants = await this.prisma.tenants.findMany({
      where: {
        pg_id,
        status: 'ACTIVE',
      },
      include: {
        pg_locations: true,
        rooms: true,
        beds: true,
        city: true,
        state: true,
        tenant_payments: {
          orderBy: { payment_date: 'desc' },
        },
        advance_payments: {
          orderBy: { payment_date: 'desc' },
        },
        refund_payments: {
          orderBy: { payment_date: 'desc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Filter tenants without advance using TenantStatusService
    const filteredTenants = this.tenantStatusService.getTenantsWithoutAdvance(tenants);
    
    // Apply pagination to filtered results
    const paginatedTenants = filteredTenants.slice(skip, skip + limit);
    const total = filteredTenants.length;

    return ResponseUtil.paginated(paginatedTenants, total, page, limit, 'Tenants without advance payment fetched successfully');
  }

  /**
   * Get tenant by ID with complete details
   */
  async findOne(id: number) {
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            address: true,
            city: true,
            state: true,
          },
        },
        rooms: {
          select: {
            s_no: true,
            room_no: true,
          },
        },
        beds: {
          select: {
            s_no: true,
            bed_no: true,
            bed_price: true,
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
        tenant_payments: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            payment_date: 'desc',
          },
          select: {
            s_no: true,
            payment_date: true,
            amount_paid: true,
            actual_rent_amount: true,
            start_date: true,
            end_date: true,
            payment_method: true,
            remarks: true,
            status: true,
          },
        },
        advance_payments: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            payment_date: 'desc',
          },
          select: {
            s_no: true,
            payment_date: true,
            amount_paid: true,
            actual_rent_amount: true,
            payment_method: true,
            status: true,
            remarks: true,
          },
        },
        refund_payments: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            payment_date: 'desc',
          },
          select: {
            s_no: true,
            amount_paid: true,
            payment_method: true,
            payment_date: true,
            status: true,
            remarks: true,
            actual_rent_amount: true,
          },
        },
        current_bills: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            bill_date: 'desc',
          },
          select: {
            s_no: true,
            bill_amount: true,
            bill_date: true,
            created_at: true,
            updated_at: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    // Enrich tenant with status calculations using TenantStatusService
    const enrichedTenant = this.tenantStatusService.enrichTenantsWithStatus([tenant])[0];

    return ResponseUtil.success(enrichedTenant, 'Tenant fetched successfully');
  }

  /**
   * Update tenant
   */
  async update(id: number, updateTenantDto: UpdateTenantDto) {
    // Check if tenant exists
    const existingTenant = await this.prisma.tenants.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existingTenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    if (updateTenantDto.check_in_date) {
      const d = new Date(updateTenantDto.check_in_date);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid check-in date');
      }
    }

    if (updateTenantDto.check_out_date) {
      const d = new Date(updateTenantDto.check_out_date);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid check-out date');
      }
    }

    const effectiveCheckInDate = updateTenantDto.check_in_date
      ? new Date(updateTenantDto.check_in_date)
      : existingTenant.check_in_date
        ? new Date(existingTenant.check_in_date)
        : null;

    const effectiveCheckOutDate = updateTenantDto.check_out_date
      ? new Date(updateTenantDto.check_out_date)
      : existingTenant.check_out_date
        ? new Date(existingTenant.check_out_date)
        : null;

    // If tenant has checkout date (existing or updating), do not allow check-in date to be after it
    // Allowed: same day (check_in_date <= check_out_date)
    if (effectiveCheckInDate && effectiveCheckOutDate && effectiveCheckInDate > effectiveCheckOutDate) {
      throw new BadRequestException(
        `Check-in date must be the same as or before check-out date. Check-in date: ${effectiveCheckInDate
          .toISOString()
          .split('T')[0]}, Check-out date: ${effectiveCheckOutDate.toISOString().split('T')[0]}`
      );
    }

    // If changing bed, verify new bed
    if (updateTenantDto.bed_id && updateTenantDto.bed_id !== existingTenant.bed_id) {

      // Check if new bed is available
      const newBed = await this.prisma.beds.findUnique({
        where: { s_no: updateTenantDto.bed_id },
      });

      if (!newBed) {
        throw new NotFoundException(`Bed with ID ${updateTenantDto.bed_id} not found`);
      }

      // Check if new bed is already occupied
      const occupiedBed = await this.prisma.tenants.findFirst({
        where: {
          bed_id: updateTenantDto.bed_id,
          status: 'ACTIVE',
          is_deleted: false,
          s_no: { not: id },
        },
      });

      if (occupiedBed) {
        throw new BadRequestException(`Bed with ID ${updateTenantDto.bed_id} is already occupied`);
      }
    }

    // Handle S3 image deletion if images are being updated
    if (updateTenantDto.images !== undefined) {
      const oldImages = (Array.isArray(existingTenant.images) ? existingTenant.images : []) as string[];
      const newImages = (Array.isArray(updateTenantDto.images) ? updateTenantDto.images : []) as string[];
      
      await this.s3DeletionService.deleteRemovedFiles(
        oldImages,
        newImages,
        'tenant',
        'images',
      );
    }

    // Handle S3 proof document deletion if proof_documents are being updated
    if (updateTenantDto.proof_documents !== undefined) {
      const oldDocuments = (Array.isArray(existingTenant.proof_documents) ? existingTenant.proof_documents : []) as string[];
      const newDocuments = (Array.isArray(updateTenantDto.proof_documents) ? updateTenantDto.proof_documents : []) as string[];
      
      await this.s3DeletionService.deleteRemovedFiles(
        oldDocuments,
        newDocuments,
        'tenant',
        'proof documents',
      );
    }

    // Update tenant
    const tenant = await this.prisma.tenants.update({
      where: { s_no: id },
      data: {
        name: updateTenantDto.name,
        phone_no: updateTenantDto.phone_no,
        whatsapp_number: updateTenantDto.whatsapp_number,
        email: updateTenantDto.email,
        pg_id: updateTenantDto.pg_id,
        room_id: updateTenantDto.room_id,
        bed_id: updateTenantDto.bed_id,
        check_in_date: updateTenantDto.check_in_date ? new Date(updateTenantDto.check_in_date) : undefined,
        check_out_date: updateTenantDto.check_out_date ? new Date(updateTenantDto.check_out_date) : undefined,
        status: updateTenantDto.status as any,
        occupation: updateTenantDto.occupation,
        tenant_address: updateTenantDto.tenant_address,
        city_id: updateTenantDto.city_id,
        state_id: updateTenantDto.state_id,
        images: updateTenantDto.images,
        proof_documents: updateTenantDto.proof_documents,
        updated_at: new Date(),
      },
      include: {
        pg_locations: true,
        rooms: true,
        beds: true,
        city: true,
        state: true,
      },
    });

    return ResponseUtil.success(tenant, 'Tenant updated successfully');

  }

  /**
   * Delete tenant (soft delete)
   */
  async remove(id: number) {
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    // Check if checkout date is in the future or today (not completed)
    if (tenant.check_out_date) {
      const now = new Date();
      const checkoutDate = new Date(tenant.check_out_date);
      
      // Set checkout date to end of day (23:59:59)
      checkoutDate.setHours(23, 59, 59, 999);
      
      if (checkoutDate > now) {
        throw new BadRequestException('Cannot delete tenant. The bed will become available only after the checkout day is completely finished.');
      }
    }

    // Soft delete tenant
    await this.prisma.tenants.update({
      where: { s_no: id },
      data: {
        is_deleted: true,
        status : 'INACTIVE'
      },
    });

    return ResponseUtil.noContent('Tenant deleted successfully');
  }

  /**
   * Generate unique tenant ID
   */
  private async generateTenantId(): Promise<string> {
    const prefix = 'TNT';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
  }

  /**
   * Get detailed pending rent information for a tenant
   */
  async getTenantPendingRentDetails(tenantId: number) {
    // Get tenant with all payment data
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenantId },
      include: {
        rooms: true,
        beds: true,
        tenant_payments: {
          orderBy: { payment_date: 'desc' }
        },
        advance_payments: {
          orderBy: { payment_date: 'desc' }
        },
        refund_payments: {
          orderBy: { payment_date: 'desc' }
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Transform tenant_payments to match TenantPayment interface
    const transformedTenantPayments = (tenant.tenant_payments || []).map(payment => ({
      ...payment,
      payment_date: payment.payment_date.toISOString(),
      amount_paid: payment.amount_paid.toString(),
      actual_rent_amount: payment.actual_rent_amount.toString(),
      start_date: payment.start_date.toISOString(),
      end_date: payment.end_date.toISOString()
    }));

    // Transform advance_payments to match AdvancePayment interface
    const transformedAdvancePayments = (tenant.advance_payments || []).map(payment => ({
      ...payment,
      payment_date: payment.payment_date.toISOString(),
      amount_paid: payment.amount_paid.toString(),
      actual_rent_amount: payment.actual_rent_amount.toString()
    }));

    // Calculate detailed pending rent information
    const pendingRentDetails = this.pendingRentCalculatorService.calculatePendingRentDetails(
      tenant.check_in_date.toISOString(),
      Number(tenant.beds?.bed_price || 0),
      transformedTenantPayments,
      transformedAdvancePayments
    );

    return ResponseUtil.success({
      tenant: {
        id: tenant.s_no,
        name: tenant.name,
        tenant_id: tenant.tenant_id,
        room: tenant.rooms?.room_no,
        bed: tenant.beds?.bed_no,
        check_in_date: tenant.check_in_date,
        current_rent: tenant.beds?.bed_price,
      },
      pending_rent_details: pendingRentDetails,
    }, 'Pending rent details fetched successfully');
  }

  /**
   * Get pending rent summary for all tenants with detailed breakdown
   */
  async getAllTenantsPendingRentSummary(params: any) {
    // Get all tenants with payment data
    const tenants = await this.prisma.tenants.findMany({
      where: {
        pg_id: params.pg_id,
        is_deleted: false,
      },
      include: {
        rooms: true,
        beds: true,
        tenant_payments: {
          orderBy: { payment_date: 'desc' }
        },
        advance_payments: {
          orderBy: { payment_date: 'desc' }
        },
        refund_payments: {
          orderBy: { payment_date: 'desc' }
        },
      },
      take: params.limit || 50,
      skip: ((params.page || 1) - 1) * (params.limit || 50),
    });

    // Calculate pending rent details for all tenants
    const tenantsWithPendingRent = this.pendingRentCalculatorService.getBulkPendingRentSummary(tenants);

    // Sort by total pending amount (highest first)
    const sortedTenants = tenantsWithPendingRent.sort(
      (a, b) => b.total_pending_amount - a.total_pending_amount
    );

    // Calculate summary statistics
    const summary = {
      total_tenants: sortedTenants.length,
      tenants_with_pending: sortedTenants.filter(t => t.total_pending_amount > 0).length,
      tenants_overdue: sortedTenants.filter(t => t.is_overdue).length,
      total_pending_amount: sortedTenants.reduce((sum, t) => sum + t.total_pending_amount, 0),
      tenants_need_follow_up: sortedTenants.filter(t => 
        t.recommended_action === 'FOLLOW_UP' || t.recommended_action === 'URGENT_FOLLOW_UP'
      ).length,
      tenants_need_notice: sortedTenants.filter(t => 
        t.recommended_action === 'NOTICE' || t.recommended_action === 'EVICTION_WARNING'
      ).length,
    };

    return ResponseUtil.success({
      tenants: sortedTenants,
      summary,
      pagination: {
        page: params.page || 1,
        limit: params.limit || 50,
        total: sortedTenants.length,
      },
    }, 'Pending rent summary fetched successfully');
  }

  /**
   * Get tenants with overdue payments
   */
  async getOverdueTenants(params: any) {
    // Get all tenants
    const tenants = await this.prisma.tenants.findMany({
      where: {
        pg_id: params.pg_id,
        is_deleted: false,
      },
      include: {
        rooms: true,
        beds: true,
        tenant_payments: {
          orderBy: { payment_date: 'desc' }
        },
        advance_payments: {
          orderBy: { payment_date: 'desc' }
        },
      },
    });

    // Filter tenants with overdue payments
    const overdueTenants = this.pendingRentCalculatorService.filterTenantsByPendingRent(
      tenants,
      {
        minPendingAmount: params.min_amount ? parseInt(params.min_amount) : 0,
        includeOverdue: true,
      }
    );

    return ResponseUtil.success({
      tenants: overdueTenants,
      count: overdueTenants.length,
    }, 'Overdue tenants fetched successfully');
  }

  /**
   * Calculate rent cycle dates for a tenant based on PG's rent cycle type
   * Supports both CALENDAR and MIDMONTH cycles
   */
  async calculateTenantRentCycleDates(tenantId: number, referenceDate?: string) {
    // Get tenant with PG location details
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenantId },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            rent_cycle_type: true,
          },
        },
        tenant_payments: {
          orderBy: { end_date: 'desc' },
          take: 1,
          select: {
            end_date: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    if (!tenant.pg_locations) {
      throw new BadRequestException('Tenant PG location not found');
    }

    const pgRentCycleType = tenant.pg_locations.rent_cycle_type as 'CALENDAR' | 'MIDMONTH';
    const dateToUse = referenceDate || tenant.check_in_date.toISOString().split('T')[0];

    let rentCycleDates: { start: string; end: string };

    if (pgRentCycleType === 'CALENDAR') {
      // For CALENDAR: 1st to last day of month
      rentCycleDates = this.rentCycleCalculatorService.getCalendarMonthDates(dateToUse);
    } else {
      // For MIDMONTH: same day to same day next month - 1
      rentCycleDates = this.rentCycleCalculatorService.getMidmonthDates(dateToUse);
    }

    // Validate the calculated dates
    const validation = this.rentCycleCalculatorService.validateRentPeriod(
      rentCycleDates.start,
      rentCycleDates.end,
      pgRentCycleType,
    );

    const daysInPeriod = this.rentCycleCalculatorService.calculateDaysInPeriod(
      rentCycleDates.start,
      rentCycleDates.end,
    );

    return ResponseUtil.success({
      tenant_id: tenant.s_no,
      tenant_name: tenant.name,
      pg_name: tenant.pg_locations.location_name,
      rent_cycle_type: pgRentCycleType,
      cycle_description: this.rentCycleCalculatorService.getCycleTypeDescription(pgRentCycleType),
      current_cycle: {
        start_date: rentCycleDates.start,
        end_date: rentCycleDates.end,
        days: daysInPeriod,
        is_valid: validation.isValid,
        validation_error: validation.error,
      },
      has_previous_payments: tenant.tenant_payments.length > 0,
      last_payment_end_date: tenant.tenant_payments[0]?.end_date?.toISOString().split('T')[0] || null,
    }, 'Rent cycle dates calculated successfully');
  }

  /**
   * Get next rent cycle dates for a tenant
   * Calculates the next rent period based on the last payment end date
   */
  async getNextRentCycleDates(tenantId: number) {
    // Get tenant with PG location and last payment details
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenantId },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            rent_cycle_type: true,
          },
        },
        tenant_payments: {
          orderBy: { end_date: 'desc' },
          take: 1,
          select: {
            end_date: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    if (!tenant.pg_locations) {
      throw new BadRequestException('Tenant PG location not found');
    }

    if (tenant.tenant_payments.length === 0) {
      throw new BadRequestException('No previous payments found. Use calculateTenantRentCycleDates instead.');
    }

    const pgRentCycleType = tenant.pg_locations.rent_cycle_type as 'CALENDAR' | 'MIDMONTH';
    const lastPaymentEndDate = tenant.tenant_payments[0].end_date.toISOString().split('T')[0];

    // Calculate next cycle dates
    const nextCycleDates = this.rentCycleCalculatorService.getNextRentCycleDates(
      lastPaymentEndDate,
      pgRentCycleType,
    );

    // Validate the calculated dates
    const validation = this.rentCycleCalculatorService.validateRentPeriod(
      nextCycleDates.startDate,
      nextCycleDates.endDate,
      pgRentCycleType,
    );

    const daysInPeriod = this.rentCycleCalculatorService.calculateDaysInPeriod(
      nextCycleDates.startDate,
      nextCycleDates.endDate,
    );

    return ResponseUtil.success({
      tenant_id: tenant.s_no,
      tenant_name: tenant.name,
      pg_name: tenant.pg_locations.location_name,
      rent_cycle_type: pgRentCycleType,
      cycle_description: this.rentCycleCalculatorService.getCycleTypeDescription(pgRentCycleType),
      last_payment_end_date: lastPaymentEndDate,
      next_cycle: {
        start_date: nextCycleDates.startDate,
        end_date: nextCycleDates.endDate,
        days: daysInPeriod,
        is_valid: validation.isValid,
        validation_error: validation.error,
      },
    }, 'Next rent cycle dates calculated successfully');
  }

  /**
   * Validate rent period dates for a tenant
   * Ensures dates match the PG's rent cycle pattern
   */
  async validateTenantRentPeriod(
    tenantId: number,
    startDate: string,
    endDate: string,
  ) {
    // Get tenant with PG location details
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenantId },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            rent_cycle_type: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    if (!tenant.pg_locations) {
      throw new BadRequestException('Tenant PG location not found');
    }

    const pgRentCycleType = tenant.pg_locations.rent_cycle_type as 'CALENDAR' | 'MIDMONTH';

    // Validate the dates
    const validation = this.rentCycleCalculatorService.validateRentPeriod(
      startDate,
      endDate,
      pgRentCycleType,
    );

    const daysInPeriod = this.rentCycleCalculatorService.calculateDaysInPeriod(
      startDate,
      endDate,
    );

    return ResponseUtil.success({
      tenant_id: tenant.s_no,
      tenant_name: tenant.name,
      pg_name: tenant.pg_locations.location_name,
      rent_cycle_type: pgRentCycleType,
      cycle_description: this.rentCycleCalculatorService.getCycleTypeDescription(pgRentCycleType),
      validation_result: {
        start_date: startDate,
        end_date: endDate,
        days: daysInPeriod,
        is_valid: validation.isValid,
        error: validation.error,
      },
    }, 'Rent period validation completed');
  }

  /**
   * Get pending rent statistics for dashboard
   */
  async getPendingRentStats(params: any) {
    // Get all tenants
    const tenants = await this.prisma.tenants.findMany({
      where: {
        pg_id: params.pg_id,
        is_deleted: false,
      },
      include: {
        rooms: true,
        beds: true,
        tenant_payments: {
          orderBy: { payment_date: 'desc' }
        },
        advance_payments: {
          orderBy: { payment_date: 'desc' }
        },
      },
    });

    const tenantsWithPendingRent = this.pendingRentCalculatorService.getBulkPendingRentSummary(tenants);

    // Calculate comprehensive statistics
    const stats = {
      total_tenants: tenantsWithPendingRent.length,
      tenants_with_pending: tenantsWithPendingRent.filter(t => t.total_pending_amount > 0).length,
      tenants_overdue: tenantsWithPendingRent.filter(t => t.is_overdue).length,
      tenants_partial: tenantsWithPendingRent.filter(t => t.pending_rent_details.hasPartialPayments).length,
      
      total_pending_amount: tenantsWithPendingRent.reduce((sum, t) => sum + t.total_pending_amount, 0),
      total_overdue_amount: tenantsWithPendingRent.reduce((sum, t) => 
        sum + (t.is_overdue ? t.total_pending_amount : 0), 0
      ),
      
      average_pending_per_tenant: tenantsWithPendingRent.length > 0 
        ? tenantsWithPendingRent.reduce((sum, t) => sum + t.total_pending_amount, 0) / tenantsWithPendingRent.length
        : 0,
      
      // Action recommendations
      tenants_need_follow_up: tenantsWithPendingRent.filter(t => 
        t.recommended_action === 'FOLLOW_UP' || t.recommended_action === 'URGENT_FOLLOW_UP'
      ).length,
      tenants_need_notice: tenantsWithPendingRent.filter(t => 
        t.recommended_action === 'NOTICE' || t.recommended_action === 'EVICTION_WARNING'
      ).length,
      
      // Monthly breakdown
      pending_by_months: this.calculatePendingByMonths(tenantsWithPendingRent),
    };

    return ResponseUtil.success(stats, 'Pending rent statistics fetched successfully');
  }

  private calculatePendingByMonths(tenants: any[]) {
    const monthlyStats = {};
    
    tenants.forEach(tenant => {
      tenant.pending_rent_details.pendingMonths.forEach(month => {
        if (!monthlyStats[month.month]) {
          monthlyStats[month.month] = {
            month: month.month,
            monthName: month.monthName,
            tenants_count: 0,
            total_pending: 0,
            overdue_count: 0,
          };
        }
        
        monthlyStats[month.month].tenants_count += 1;
        monthlyStats[month.month].total_pending += month.pendingAmount;
        if (month.isOverdue) {
          monthlyStats[month.month].overdue_count += 1;
        }
      });
    });
    
    return Object.values(monthlyStats).sort((a: any, b: any) => a.month.localeCompare(b.month));
  }

  /**
   * Get unpaid months using cycle start/end dates
   * 
   * Logic:
   * 1. Start from check-in date
   * 2. For each cycle until now:
   *    - Calculate cycle period based on cycle type
   *    - Check if PAID or PARTIAL payment exists for that cycle
   *    - If NO payment → Add to unpaid months
   *    - Move to next cycle
   * 3. Return ALL unpaid cycle periods
   * 
   * MIDMONTH Example: Check-in 10 Dec 2025
   * Cycle 1: 10 Dec 2025 - 09 Jan 2026 (day 10 to day 10-1 of next month)
   * Cycle 2: 10 Jan 2026 - 09 Feb 2026
   * Cycle 3: 10 Feb 2026 - 09 Mar 2026
   */
  private getUnpaidMonthsWithCycleDates(
    checkInDate: Date,
    checkOutDate: Date | null,
    tenantPayments: any[],
    cycleType: 'CALENDAR' | 'MIDMONTH'
  ): any[] {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Reset to start of day for comparison
    
    const endDate = checkOutDate && new Date(checkOutDate) < now ? new Date(checkOutDate) : now;
    endDate.setHours(0, 0, 0, 0); // Reset to start of day
    
    const unpaidMonths: any[] = [];
    let currentCycleStart = new Date(checkInDate);
    currentCycleStart.setHours(0, 0, 0, 0); // Reset to start of day
    
    // Sort payments by start_date to process in order
    const sortedPayments = [...tenantPayments].sort((a, b) => 
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );
    
    // Generate cycles from check-in date onwards
    // Include all unpaid cycles up to the latest payment end date or today, whichever is later
    let maxIterations = 100; // Safety limit to prevent infinite loops
    let iterations = 0;
    
    // Find the latest payment end date to determine how far to check
    let latestPaymentEnd = endDate;
    if (sortedPayments.length > 0) {
      const lastPayment = sortedPayments[sortedPayments.length - 1];
      const lastPaymentEnd = new Date(lastPayment.end_date);
      lastPaymentEnd.setHours(0, 0, 0, 0);
      if (lastPaymentEnd > latestPaymentEnd) {
        latestPaymentEnd = lastPaymentEnd;
      }
    }
    
    while (iterations < maxIterations) {
      iterations++;
      let cyclePeriod: any;
      
      if (cycleType === 'CALENDAR') {
        // CALENDAR: 1st to last day of month
        cyclePeriod = this.getCalendarCyclePeriod(currentCycleStart);
      } else {
        // MIDMONTH: day X to day (X-1) of next month
        cyclePeriod = this.getMidmonthCyclePeriod(currentCycleStart);
      }
      
      // Stop if cycle start date is after the latest payment end date
      if (cyclePeriod.start > latestPaymentEnd) {
        break;
      }
      
      // Check if this cycle period has a PAID or PARTIAL payment
      const hasPayment = sortedPayments.some((payment: any) => {
        const paymentStart = new Date(payment.start_date);
        const paymentEnd = new Date(payment.end_date);
        
        // Check if payment covers this cycle period AND is PAID or PARTIAL
        return (
          paymentStart <= cyclePeriod.end &&
          paymentEnd >= cyclePeriod.start &&
          (payment.status === 'PAID' || payment.status === 'PARTIAL')
        );
      });
      
      // If no payment found for this cycle, add to unpaid months
      if (!hasPayment) {
        unpaidMonths.push({
          cycle_start: cyclePeriod.startStr,
          cycle_end: cyclePeriod.endStr,
          month: cyclePeriod.monthKey,
          month_name: cyclePeriod.monthName,
          year: cyclePeriod.year,
          month_number: cyclePeriod.monthNumber,
          cycle_type: cycleType,
        });
      }
      
      // Move to next cycle
      currentCycleStart = new Date(cyclePeriod.end);
      currentCycleStart.setDate(currentCycleStart.getDate() + 1);
      currentCycleStart.setHours(0, 0, 0, 0); // Reset to start of day
    }
    
    return unpaidMonths;
  }

  /**
   * Get CALENDAR cycle period (1st to last day of month)
   * Returns both Date objects and formatted strings
   */
  private getCalendarCyclePeriod(startDate: Date): any {
    const year = startDate.getFullYear();
    const month = startDate.getMonth();
    
    const cycleStart = new Date(year, month, 1);
    const cycleEnd = new Date(year, month + 1, 0);
    
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthName = cycleStart.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    return {
      start: cycleStart,
      end: cycleEnd,
      startStr: cycleStart.toISOString().split('T')[0],
      endStr: cycleEnd.toISOString().split('T')[0],
      monthKey,
      monthName,
      year,
      monthNumber: month + 1,
    };
  }

  /**
   * Get MIDMONTH cycle period (day X to day (X-1) of next month)
   * Follows the guide exactly: https://CALENDAR_VS_MIDMONTH_GUIDE.md
   * 
   * Logic:
   * 1. Start date: input date (day X of month)
   * 2. End date: same day of next month - 1 day
   * 
   * Example: Check-in 10 Dec 2025
   * Cycle 1: 10 Dec 2025 - 09 Jan 2026
   * Cycle 2: 10 Jan 2026 - 09 Feb 2026
   */
  private getMidmonthCyclePeriod(startDate: Date): any {
    const year = startDate.getFullYear();
    const month = startDate.getMonth();
    const day = startDate.getDate();
    
    // Start date is the input date
    const cycleStart = new Date(year, month, day);
    
    // End date: same day next month - 1
    // Create a temporary date for same day next month, then subtract 1 day
    const tempDate = new Date(year, month + 1, day);
    tempDate.setDate(tempDate.getDate() - 1);
    const cycleEnd = tempDate;
    
    // Month key and name based on cycle start
    const monthKey = `${cycleStart.getFullYear()}-${String(cycleStart.getMonth() + 1).padStart(2, '0')}`;
    const monthName = cycleStart.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    return {
      start: cycleStart,
      end: cycleEnd,
      startStr: cycleStart.toISOString().split('T')[0],
      endStr: cycleEnd.toISOString().split('T')[0],
      monthKey,
      monthName,
      year: cycleStart.getFullYear(),
      monthNumber: cycleStart.getMonth() + 1,
    };
  }

}
