import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  feature_tours_target_audience as FeatureTourAudience,
  user_feature_tour_progress_status as FeatureTourProgressStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FeatureToursService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailable(userId: number, organizationId: number) {
    const user = await this.prisma.users.findFirst({
      where: { s_no: userId, organization_id: organizationId },
      select: {
        is_deleted: true,
        status: true,
        created_at: true,
        roles: { select: { role_name: true } },
      },
    });

    if (!user || user.is_deleted || (user.status && user.status !== 'ACTIVE')) {
      throw new ForbiddenException('Active user was not found in this organization');
    }

    const tours = await this.prisma.feature_tours.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { s_no: 'asc' }],
      select: {
        s_no: true,
        tour_key: true,
        display_name: true,
        description: true,
        current_version: true,
        target_audience: true,
        trigger_screen: true,
        total_steps: true,
        sort_order: true,
      },
    });

    if (tours.length === 0) return [];

    const roleName = user.roles.role_name.trim().toUpperCase();
    const audiences: FeatureTourAudience[] = [FeatureTourAudience.ALL];

    if (['PG_OWNER', 'OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(roleName)) {
      audiences.push(FeatureTourAudience.OWNER);
    }
    if (['EMPLOYEE', 'CARETAKER'].includes(roleName)) {
      audiences.push(FeatureTourAudience.CARETAKER);
    }
    if (roleName === 'TENANT') {
      audiences.push(FeatureTourAudience.TENANT);
    }

    const newUserTours = tours.filter(
      (tour) => tour.target_audience === FeatureTourAudience.NEW_USER,
    );
    if (newUserTours.length > 0 && user.created_at) {
      const newUserThreshold = new Date();
      newUserThreshold.setDate(newUserThreshold.getDate() - 30);
      if (user.created_at >= newUserThreshold) {
        audiences.push(FeatureTourAudience.NEW_USER);
      }
    }

    const eligibleTours = tours.filter((tour) => audiences.includes(tour.target_audience));
    if (eligibleTours.length === 0) return [];

    const progressRows = await this.prisma.user_feature_tour_progress.findMany({
      where: {
        user_id: userId,
        organization_id: organizationId,
        tour_id: { in: eligibleTours.map((tour) => tour.s_no) },
      },
      orderBy: { updated_at: 'desc' },
      select: {
        s_no: true,
        tour_id: true,
        tour_version: true,
        status: true,
        current_step: true,
        started_at: true,
        completed_at: true,
        dismissed_at: true,
        dismissed_step: true,
        updated_at: true,
      },
    });

    return eligibleTours.map((tour) => {
      const progress = progressRows.find(
        (row) => row.tour_id === tour.s_no && row.tour_version === tour.current_version,
      );

      return {
        ...tour,
        progress: progress ?? {
          s_no: null,
          tour_id: tour.s_no,
          tour_version: tour.current_version,
          status: FeatureTourProgressStatus.NOT_STARTED,
          current_step: 0,
          started_at: null,
          completed_at: null,
          dismissed_at: null,
          dismissed_step: null,
          updated_at: null,
        },
      };
    });
  }

  async start(tourKey: string, userId: number, organizationId: number) {
    const tour = await this.findActiveTour(tourKey);
    const where = this.progressWhere(userId, tour.s_no, tour.current_version);
    const existing = await this.prisma.user_feature_tour_progress.findUnique({ where });

    if (
      existing?.status === FeatureTourProgressStatus.IN_PROGRESS ||
      existing?.status === FeatureTourProgressStatus.COMPLETED
    ) {
      return existing;
    }

    const now = new Date();
    if (existing) {
      return this.prisma.user_feature_tour_progress.update({
        where: { s_no: existing.s_no },
        data: {
          organization_id: organizationId,
          status: FeatureTourProgressStatus.IN_PROGRESS,
          current_step: 0,
          started_at: now,
          completed_at: null,
          dismissed_at: null,
          dismissed_step: null,
          updated_at: now,
        },
      });
    }

    return this.prisma.user_feature_tour_progress.upsert({
      where,
      create: {
        user_id: userId,
        organization_id: organizationId,
        tour_id: tour.s_no,
        tour_version: tour.current_version,
        status: FeatureTourProgressStatus.IN_PROGRESS,
        current_step: 0,
        started_at: now,
      },
      update: { updated_at: now },
    });
  }

  async updateProgress(
    tourKey: string,
    userId: number,
    organizationId: number,
    currentStep: number,
  ) {
    const tour = await this.findActiveTour(tourKey);
    if (currentStep < 0 || currentStep >= tour.total_steps) {
      throw new BadRequestException('The requested step is outside this tour version');
    }

    const where = this.progressWhere(userId, tour.s_no, tour.current_version);
    const existing = await this.prisma.user_feature_tour_progress.findUnique({ where });
    if (
      existing?.status === FeatureTourProgressStatus.COMPLETED ||
      existing?.status === FeatureTourProgressStatus.DISMISSED
    ) {
      throw new ConflictException('Start the tour again before updating its progress');
    }

    const now = new Date();
    return this.prisma.user_feature_tour_progress.upsert({
      where,
      create: {
        user_id: userId,
        organization_id: organizationId,
        tour_id: tour.s_no,
        tour_version: tour.current_version,
        status: FeatureTourProgressStatus.IN_PROGRESS,
        current_step: currentStep,
        started_at: now,
      },
      update: {
        organization_id: organizationId,
        status: FeatureTourProgressStatus.IN_PROGRESS,
        current_step: currentStep,
        started_at: existing?.started_at ?? now,
        updated_at: now,
      },
    });
  }

  async complete(tourKey: string, userId: number, organizationId: number) {
    const tour = await this.findActiveTour(tourKey);
    const where = this.progressWhere(userId, tour.s_no, tour.current_version);
    const existing = await this.prisma.user_feature_tour_progress.findUnique({ where });
    if (existing?.status === FeatureTourProgressStatus.COMPLETED) return existing;
    if (existing?.status === FeatureTourProgressStatus.DISMISSED) {
      throw new ConflictException('Start the tour again before completing it');
    }

    const now = new Date();
    return this.prisma.user_feature_tour_progress.upsert({
      where,
      create: {
        user_id: userId,
        organization_id: organizationId,
        tour_id: tour.s_no,
        tour_version: tour.current_version,
        status: FeatureTourProgressStatus.COMPLETED,
        current_step: tour.total_steps,
        started_at: now,
        completed_at: now,
      },
      update: {
        organization_id: organizationId,
        status: FeatureTourProgressStatus.COMPLETED,
        current_step: tour.total_steps,
        started_at: existing?.started_at ?? now,
        completed_at: now,
        dismissed_at: null,
        dismissed_step: null,
        updated_at: now,
      },
    });
  }

  async dismiss(tourKey: string, userId: number, organizationId: number) {
    const tour = await this.findActiveTour(tourKey);
    const where = this.progressWhere(userId, tour.s_no, tour.current_version);
    const existing = await this.prisma.user_feature_tour_progress.findUnique({ where });
    if (
      existing?.status === FeatureTourProgressStatus.COMPLETED ||
      existing?.status === FeatureTourProgressStatus.DISMISSED
    ) {
      return existing;
    }

    const now = new Date();
    return this.prisma.user_feature_tour_progress.upsert({
      where,
      create: {
        user_id: userId,
        organization_id: organizationId,
        tour_id: tour.s_no,
        tour_version: tour.current_version,
        status: FeatureTourProgressStatus.DISMISSED,
        current_step: 0,
        dismissed_at: now,
        dismissed_step: 0,
      },
      update: {
        organization_id: organizationId,
        status: FeatureTourProgressStatus.DISMISSED,
        dismissed_at: now,
        dismissed_step: existing?.current_step ?? 0,
        updated_at: now,
      },
    });
  }

  private async findActiveTour(tourKey: string) {
    const tour = await this.prisma.feature_tours.findUnique({ where: { tour_key: tourKey } });
    if (!tour || !tour.is_active) throw new NotFoundException('Feature tour not found');
    return tour;
  }

  private progressWhere(userId: number, tourId: number, tourVersion: number) {
    return {
      user_id_tour_id_tour_version: {
        user_id: userId,
        tour_id: tourId,
        tour_version: tourVersion,
      },
    };
  }
}
