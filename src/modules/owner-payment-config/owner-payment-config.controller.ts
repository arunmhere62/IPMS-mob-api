import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OwnerPaymentConfigService } from './owner-payment-config.service';
import { CreatePaymentConfigDto, UpdatePaymentConfigDto } from './dto';
import { ResponseUtil } from '../../common/utils/response.util';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { RbacResource } from '../../common/decorators/require-permission.decorator';
import { ValidatedHeaders } from '@/common/decorators/validated-headers.decorator';

@ApiTags('owner-payment-config')
@ApiBearerAuth()
@Controller('payment-config')
@UseGuards(HeadersValidationGuard)
@RbacResource('payment')
export class OwnerPaymentConfigController {
  constructor(private readonly configService: OwnerPaymentConfigService) {}

  @Post()
  @RequireHeaders({ organization_id: true, user_id: true })
  @ApiOperation({ summary: 'Create payment config (UPI/QR) for owner' })
  @ApiResponse({ status: 201, description: 'Payment config created' })
  async create(
    @Body() dto: CreatePaymentConfigDto,
    @ValidatedHeaders() headers: { organization_id: number; user_id: number },
  ) {
    return this.configService.create(dto, headers.organization_id, headers.user_id);
  }

  @Get()
  @RequireHeaders({ organization_id: true })
  @ApiOperation({ summary: 'List all payment configs for the organization' })
  async findAll(@ValidatedHeaders() headers: { organization_id: number }) {
    return this.configService.findAll(headers.organization_id);
  }

  @Get(':id')
  @RequireHeaders({ organization_id: true })
  @ApiOperation({ summary: 'Get a single payment config by ID' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @ValidatedHeaders() headers: { organization_id: number },
  ) {
    return this.configService.findOne(id, headers.organization_id);
  }

  @Patch(':id')
  @RequireHeaders({ organization_id: true })
  @ApiOperation({ summary: 'Update a payment config' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentConfigDto,
    @ValidatedHeaders() headers: { organization_id: number },
  ) {
    return this.configService.update(id, dto, headers.organization_id);
  }

  @Delete(':id')
  @RequireHeaders({ organization_id: true })
  @ApiOperation({ summary: 'Deactivate a payment config' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @ValidatedHeaders() headers: { organization_id: number },
  ) {
    return this.configService.remove(id, headers.organization_id);
  }

  @Get('pg/:pgId')
  @RequireHeaders({ organization_id: true })
  @ApiOperation({ summary: 'Resolve effective payment config for a specific PG' })
  async resolveForPg(
    @Param('pgId', ParseIntPipe) pgId: number,
    @ValidatedHeaders() headers: { organization_id: number },
  ) {
    const config = await this.configService.resolveForPg(pgId, headers.organization_id);
    const message = config ? 'Success' : 'No payment config found for this PG';
    return ResponseUtil.success(config, message);
  }
}
