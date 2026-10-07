import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import {
  feature_tours_target_audience as FeatureTourAudience,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureToursService } from './feature-tours.service';

describe('FeatureToursService', () => {
  const user = {
    is_deleted: false,
    status: 'ACTIVE',
    created_at: new Date(),
    roles: { role_name: 'PG_OWNER' },
  };
  const welcomeTour: {
    s_no: number;
    tour_key: string;
    display_name: string;
    description: string | null;
    current_version: number;
    target_audience: FeatureTourAudience;
    trigger_screen: string | null;
    total_steps: number;
    sort_order: number;
    is_active: boolean;
  } = {
    s_no: 1,
    tour_key: 'welcome_tour',
    display_name: 'Welcome Tour',
    description: 'Introductory walkthrough',
    current_version: 1,
    target_audience: FeatureTourAudience.NEW_USER,
    trigger_screen: null,
    total_steps: 5,
    sort_order: 1,
    is_active: true,
  };
  const prisma = {
    users: { findFirst: jest.fn<() => Promise<unknown>>() },
    feature_tours: {
      findMany: jest.fn<() => Promise<unknown[]>>(),
      findUnique: jest.fn<() => Promise<unknown>>(),
    },
    user_feature_tour_progress: {
      findMany: jest.fn<() => Promise<unknown[]>>(),
      findUnique: jest.fn<() => Promise<unknown>>(),
      update: jest.fn<() => Promise<unknown>>(),
      upsert: jest.fn<() => Promise<unknown>>(),
    },
  };
  let service: FeatureToursService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeatureToursService(prisma as unknown as PrismaService);
    prisma.users.findFirst.mockResolvedValue(user);
    prisma.feature_tours.findMany.mockResolvedValue([welcomeTour]);
    prisma.user_feature_tour_progress.findMany.mockResolvedValue([]);
    prisma.feature_tours.findUnique.mockResolvedValue(welcomeTour);
  });

  it('returns a new-user tour with an empty versioned progress record', async () => {
    const result = await service.listAvailable(60, 19);

    expect(result).toHaveLength(1);
    expect(result[0].tour_key).toBe('welcome_tour');
    expect(result[0].progress).toMatchObject({
      status: 'NOT_STARTED',
      current_step: 0,
      tour_version: 1,
    });
  });

  it('does not return a NEW_USER tour for a user created more than 30 days ago', async () => {
    prisma.users.findFirst.mockResolvedValue({
      ...user,
      created_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });

    const result = await service.listAvailable(60, 19);

    expect(result).toEqual([]);
    expect(prisma.user_feature_tour_progress.findMany).not.toHaveBeenCalled();
  });

  it('rejects progress outside the active tour version step range', async () => {
    await expect(service.updateProgress('welcome_tour', 60, 19, 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user_feature_tour_progress.upsert).not.toHaveBeenCalled();
  });
});
