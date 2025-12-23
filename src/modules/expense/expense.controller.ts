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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ExpenseService } from './expense.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CommonHeadersDecorator, CommonHeaders } from '../../common/decorators/common-headers.decorator';

@ApiTags('expenses')
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new expense' })
  @ApiResponse({ status: 201, description: 'Expense created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  create(
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Body() createExpenseDto: CreateExpenseDto,
  ) {
    return this.expenseService.create(headers.pg_id, createExpenseDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all expenses for a PG location' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Expenses retrieved successfully' })
  findAll(
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const monthNum = month ? parseInt(month, 10) : undefined;
    const yearNum = year ? parseInt(year, 10) : undefined;

    return this.expenseService.findAll(headers.pg_id, pageNum, limitNum, monthNum, yearNum);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get expense statistics for a PG location' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  getStats(
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.expenseService.getStats(headers.pg_id, startDate, endDate);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single expense by ID' })
  @ApiResponse({ status: 200, description: 'Expense retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.expenseService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an expense' })
  @ApiResponse({ status: 200, description: 'Expense updated successfully' })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateExpenseDto: UpdateExpenseDto,
  ) {
    return this.expenseService.update(id, updateExpenseDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an expense (soft delete)' })
  @ApiResponse({ status: 200, description: 'Expense deleted successfully' })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.expenseService.remove(id);
  }
}
