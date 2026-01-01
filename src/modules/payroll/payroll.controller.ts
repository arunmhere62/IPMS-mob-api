import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { PayrollService } from './payroll.service';
import { GeneratePayrollRunDto } from './dto/generate-payroll-run.dto';
import { CreatePayrollItemPaymentDto } from './dto/create-payroll-item-payment.dto';

@ApiTags('payroll')
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate payroll for a month (creates run + items)' })
  @ApiResponse({ status: 201, description: 'Payroll generated successfully' })
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  generate(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Body() dto: GeneratePayrollRunDto,
  ) {
    return this.payrollService.generateRun(headers.pg_id!, headers.organization_id!, headers.user_id!, dto);
  }

  @Get('runs')
  @ApiOperation({ summary: 'List payroll runs for a PG' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Payroll runs fetched successfully' })
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ pg_id: true, organization_id: true })
  listRuns(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.payrollService.listRuns(headers.pg_id!, headers.organization_id!, pageNum, limitNum);
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Get payroll run details (items + payments)' })
  @ApiResponse({ status: 200, description: 'Payroll run fetched successfully' })
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ pg_id: true, organization_id: true })
  getRun(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.payrollService.getRunDetails(headers.pg_id!, headers.organization_id!, runId);
  }

  @Post('items/:itemId/payments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a partial/full payment for a payroll item (per employee)' })
  @ApiResponse({ status: 201, description: 'Payment recorded successfully' })
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  addPayment(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: CreatePayrollItemPaymentDto,
  ) {
    return this.payrollService.addItemPayment(headers.pg_id!, headers.organization_id!, headers.user_id!, itemId, dto);
  }
}
