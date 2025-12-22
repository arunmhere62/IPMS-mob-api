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
import { EmployeeSalaryService } from './employee-salary.service';
import { CreateEmployeeSalaryDto } from './dto/create-employee-salary.dto';
import { UpdateEmployeeSalaryDto } from './dto/update-employee-salary.dto';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';

@ApiTags('employee-salary')
@Controller('employee-salary')
export class EmployeeSalaryController {
  constructor(private readonly employeeSalaryService: EmployeeSalaryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new employee salary record' })
  @ApiResponse({ status: 201, description: 'Salary record created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  create(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Body() createDto: CreateEmployeeSalaryDto,
  ) {
    return this.employeeSalaryService.create(headers.pg_id!, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all salary records for a PG location' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Salary records retrieved successfully' })
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ pg_id: true, organization_id: true })
  findAll(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.employeeSalaryService.findAll(headers.pg_id!, headers.organization_id!, pageNum, limitNum);
  }

  @Get('employee/:userId')
  @ApiOperation({ summary: 'Get salary records for a specific employee' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Employee salary records retrieved successfully' })
  findByEmployee(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.employeeSalaryService.findByEmployee(userId, pageNum, limitNum);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get salary statistics for a PG location' })
  @ApiQuery({ name: 'startMonth', required: false, type: String })
  @ApiQuery({ name: 'endMonth', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ pg_id: true, organization_id: true })
  getStats(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('startMonth') startMonth?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    return this.employeeSalaryService.getStats(headers.pg_id!, headers.organization_id!, startMonth, endMonth);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single salary record by ID' })
  @ApiResponse({ status: 200, description: 'Salary record retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Salary record not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.employeeSalaryService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a salary record' })
  @ApiResponse({ status: 200, description: 'Salary record updated successfully' })
  @ApiResponse({ status: 404, description: 'Salary record not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateEmployeeSalaryDto,
  ) {
    return this.employeeSalaryService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a salary record (soft delete)' })
  @ApiResponse({ status: 200, description: 'Salary record deleted successfully' })
  @ApiResponse({ status: 404, description: 'Salary record not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.employeeSalaryService.remove(id);
  }
}
