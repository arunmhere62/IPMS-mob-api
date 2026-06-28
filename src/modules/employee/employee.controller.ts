import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { RbacService } from '../rbac/rbac.service';
import { ForbiddenException } from '@nestjs/common';

@ApiTags('employees')
@Controller('employees')
@UseGuards(HeadersValidationGuard, JwtAuthGuard)
export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly rbacService: RbacService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new employee' })
  @ApiResponse({ status: 201, description: 'Employee created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @RequireHeaders({ organization_id: true, user_id: true, pg_id: true })
  async create(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Body() createDto: CreateEmployeeDto,
  ) {
    // Check if user has permission to create employees
    const effectivePerms = await this.rbacService.getEffectivePermissionsForUser(headers.user_id!);
    const result = effectivePerms.data as { permissions_map: Record<string, boolean> };
    
    if (!result.permissions_map['employee_create']) {
      throw new ForbiddenException('You do not have permission to create employees');
    }
    
    return this.employeeService.create(headers.organization_id!, headers.pg_id!, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all employees for an organization' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'pg_id', required: false, type: Number })
  @ApiQuery({ name: 'role_id', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Employees retrieved successfully' })
  @RequireHeaders({ organization_id: true, user_id: true, pg_id: true })
  findAll(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pg_id') pg_id?: string,
    @Query('role_id') role_id?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const pgIdNum = pg_id ? parseInt(pg_id, 10) : headers.pg_id;
    const roleIdNum = role_id ? parseInt(role_id, 10) : undefined;

    return this.employeeService.findAll(
      headers.organization_id!,
      headers.user_id!,
      pageNum,
      limitNum,
      pgIdNum!,
      roleIdNum,
      search,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get employee statistics' })
  @ApiQuery({ name: 'pg_id', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @RequireHeaders({ organization_id: true })
  getStats(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('pg_id') pg_id?: string,
  ) {
    const pgIdNum = pg_id ? parseInt(pg_id, 10) : undefined;
    return this.employeeService.getStats(headers.organization_id!, pgIdNum);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single employee by ID' })
  @ApiResponse({ status: 200, description: 'Employee retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @RequireHeaders({ organization_id: true })
  findOne(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeService.findOne(id, headers.organization_id!);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an employee' })
  @ApiResponse({ status: 200, description: 'Employee updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @RequireHeaders({ organization_id: true, user_id: true })
  async update(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateEmployeeDto,
  ) {
    // Check if user has permission to edit employees
    const effectivePerms = await this.rbacService.getEffectivePermissionsForUser(headers.user_id!);
    const result = effectivePerms.data as { permissions_map: Record<string, boolean> };
    
    if (!result.permissions_map['employee_edit']) {
      throw new ForbiddenException('You do not have permission to edit employees');
    }
    
    return this.employeeService.update(id, headers.organization_id!, headers.user_id!, updateDto);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle employee account status (ACTIVE <-> INACTIVE)' })
  @ApiResponse({ status: 200, description: 'Employee status updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @RequireHeaders({ organization_id: true, user_id: true })
  async toggleStatus(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const effectivePerms = await this.rbacService.getEffectivePermissionsForUser(headers.user_id!);
    const result = effectivePerms.data as { permissions_map: Record<string, boolean> };

    if (!result.permissions_map['employee_edit']) {
      throw new ForbiddenException('You do not have permission to change employee status');
    }

    return this.employeeService.toggleStatus(id, headers.organization_id!, headers.user_id!);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an employee (soft delete)' })
  @ApiResponse({ status: 200, description: 'Employee deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @RequireHeaders({ organization_id: true, user_id: true })
  async remove(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id', ParseIntPipe) id: number,
  ) {
    // Check if user has permission to delete employees
    const effectivePerms = await this.rbacService.getEffectivePermissionsForUser(headers.user_id!);
    const result = effectivePerms.data as { permissions_map: Record<string, boolean> };
    
    if (!result.permissions_map['employee_delete']) {
      throw new ForbiddenException('You do not have permission to delete employees');
    }
    
    return this.employeeService.remove(id, headers.organization_id!, headers.user_id!);
  }
}
