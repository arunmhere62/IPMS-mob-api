import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import {
  ValidatedHeaders,
  type ValidatedHeaders as ValidatedTourHeaders,
} from '../../common/decorators/validated-headers.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeatureToursService } from './feature-tours.service';
import { UpdateFeatureTourProgressDto } from './dto/update-feature-tour-progress.dto';

type TourRequest = Request & {
  user?: { sub?: number | string; organization_id?: number | string };
};

type TourContext = { userId: number; organizationId: number };

@ApiTags('feature-tours')
@ApiBearerAuth()
@Controller('feature-tours')
@UseGuards(JwtAuthGuard, HeadersValidationGuard)
@RequireHeaders({ organization_id: true, user_id: true })
export class FeatureToursController {
  constructor(private readonly featureToursService: FeatureToursService) {}

  @Get()
  @ApiOperation({ summary: 'List active tours available to the authenticated user' })
  async listAvailable(
    @Req() request: TourRequest,
    @ValidatedHeaders() headers: ValidatedTourHeaders,
  ) {
    const context = this.getContext(request, headers);
    return this.featureToursService.listAvailable(context.userId, context.organizationId);
  }

  @Post(':tourKey/start')
  @ApiOperation({ summary: 'Start or resume a tour version' })
  async start(
    @Param('tourKey') tourKey: string,
    @Req() request: TourRequest,
    @ValidatedHeaders() headers: ValidatedTourHeaders,
  ) {
    const context = this.getContext(request, headers);
    return this.featureToursService.start(tourKey, context.userId, context.organizationId);
  }

  @Patch(':tourKey/progress')
  @ApiOperation({ summary: 'Save the current zero-based tour step' })
  async updateProgress(
    @Param('tourKey') tourKey: string,
    @Body() body: UpdateFeatureTourProgressDto,
    @Req() request: TourRequest,
    @ValidatedHeaders() headers: ValidatedTourHeaders,
  ) {
    const context = this.getContext(request, headers);
    return this.featureToursService.updateProgress(
      tourKey,
      context.userId,
      context.organizationId,
      body.current_step,
    );
  }

  @Post(':tourKey/complete')
  @ApiOperation({ summary: 'Mark a tour version completed' })
  async complete(
    @Param('tourKey') tourKey: string,
    @Req() request: TourRequest,
    @ValidatedHeaders() headers: ValidatedTourHeaders,
  ) {
    const context = this.getContext(request, headers);
    return this.featureToursService.complete(tourKey, context.userId, context.organizationId);
  }

  @Post(':tourKey/dismiss')
  @ApiOperation({ summary: 'Dismiss a tour version and save the step where it was dismissed' })
  async dismiss(
    @Param('tourKey') tourKey: string,
    @Req() request: TourRequest,
    @ValidatedHeaders() headers: ValidatedTourHeaders,
  ) {
    const context = this.getContext(request, headers);
    return this.featureToursService.dismiss(tourKey, context.userId, context.organizationId);
  }

  private getContext(request: TourRequest, headers: ValidatedTourHeaders): TourContext {
    const userId = Number(request.user?.sub);
    const organizationId = Number(request.user?.organization_id);

    if (
      !Number.isInteger(userId) ||
      userId <= 0 ||
      !Number.isInteger(organizationId) ||
      organizationId <= 0 ||
      headers.user_id !== userId ||
      headers.organization_id !== organizationId
    ) {
      throw new ForbiddenException('Authenticated user context does not match request headers');
    }

    return { userId, organizationId };
  }
}
