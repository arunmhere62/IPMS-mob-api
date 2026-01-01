import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { ResponseUtil } from '../../common/utils/response.util';
import { PgUsersService } from './pg-users.service';
import { UpdatePgUserSalaryDto } from './dto/update-pg-user-salary.dto';

@ApiTags('pg-users')
@Controller('pg-users')
@UseGuards(HeadersValidationGuard)
export class PgUsersController {
  constructor(private readonly pgUsersService: PgUsersService) {}

  @Get('assignment/:userId')
  @ApiOperation({ summary: 'Get a user assignment details for selected PG (includes monthly salary)' })
  @ApiResponse({ status: 200, description: 'Assignment fetched successfully' })
  @RequireHeaders({ pg_id: true, organization_id: true })
  getAssignment(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.pgUsersService
      .getAssignment(userId, headers.pg_id!, headers.organization_id!)
      .then((assignment) => ResponseUtil.success(assignment, 'Assignment fetched successfully'));
  }

  @Patch('assignment/:userId/salary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update monthly salary amount for a user in the selected PG' })
  @ApiResponse({ status: 200, description: 'Salary updated successfully' })
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  updateSalary(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdatePgUserSalaryDto,
  ) {
    return this.pgUsersService
      .updateMonthlySalaryAmount(userId, headers.pg_id!, headers.organization_id!, dto.monthly_salary_amount)
      .then((assignment) => ResponseUtil.success(assignment, 'Salary updated successfully'));
  }
}
