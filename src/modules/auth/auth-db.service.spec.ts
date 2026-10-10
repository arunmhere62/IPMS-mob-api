import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { EmailService } from '../email/email.service';
import { S3DeletionService } from '../common/s3-deletion.service';
import { AuthDbService } from './auth-db.service';
import { JwtTokenService } from './jwt.service';
import { OtpStrategyFactory } from './strategies/otp-strategy.factory';

describe('AuthDbService signup OTP', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const createService = (allowTestOtp: string, strategyName: string) => {
    const strategy = {
      getStrategyName: jest.fn<() => string>().mockReturnValue(strategyName),
      sendOtp: jest.fn<(phone: string, otp: string) => Promise<boolean>>().mockResolvedValue(true),
      verifyOtp: jest.fn<(phone: string, otp: string, storedOtp: string) => boolean>(),
    };
    const otpStrategyFactory = { getStrategy: () => strategy };
    const createOtp = jest.fn<(args: { data: { otp: string } }) => Promise<unknown>>().mockResolvedValue({});
    const prisma = {
      users: { findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null) },
      otp_verifications: {
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
        create: createOtp,
        update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      },
    };
    const configService = {
      get: (key: string, fallback?: unknown) =>
        key === 'ALLOW_TEST_OTP' ? allowTestOtp : fallback,
    };
    const service = new AuthDbService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as JwtTokenService,
      configService as unknown as ConfigService,
      otpStrategyFactory as unknown as OtpStrategyFactory,
      {} as S3DeletionService,
      {} as EmailService,
      {} as ActivityLogsService,
    );

    return { service, createOtp, strategy, prisma };
  };

  it('uses the fixed demo OTP for an allowlisted signup phone when enabled', async () => {
    const { service, createOtp, strategy } = createService('true', 'Production');

    await service.sendSignupOtp({ phone: '8248449609' });

    expect(createOtp).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ otp: '5555' }) }),
    );
    expect(strategy.sendOtp).toHaveBeenCalledWith('+918248449609', '5555');
  });

  it('accepts an enabled allowlisted demo OTP during production signup verification', async () => {
    const { service, prisma, strategy } = createService('true', 'Production');
    prisma.otp_verifications.findFirst.mockResolvedValue({
      s_no: 1,
      otp: '1000',
      attempts: 0,
      expires_at: new Date(Date.now() + 60_000),
    });

    const result = await service.verifySignupOtp({ phone: '8248449609', otp: '5555' });

    expect(result).toMatchObject({ success: true, data: { verified: true } });
    expect(strategy.verifyOtp).not.toHaveBeenCalled();
  });

  it('does not accept the demo OTP for an unallowlisted production signup phone', async () => {
    const { service, prisma, strategy } = createService('true', 'Production');
    prisma.otp_verifications.findFirst.mockResolvedValue({
      s_no: 1,
      otp: '1000',
      attempts: 0,
      expires_at: new Date(Date.now() + 60_000),
    });

    await expect(
      service.verifySignupOtp({ phone: '5550001234', otp: '5555' }),
    ).rejects.toThrow('Invalid OTP');
    expect(strategy.verifyOtp).toHaveBeenCalledWith('+915550001234', '5555', '1000');
  });

  it('uses the fixed OTP for signup in local development', async () => {
    const { service, createOtp, strategy } = createService('', 'Development');

    await service.sendSignupOtp({ phone: '5550001234' });

    expect(createOtp).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ otp: '5555' }) }),
    );
    expect(strategy.sendOtp).toHaveBeenCalledWith('+915550001234', '5555');
  });

  it('does not enable the demo OTP for non-allowlisted production signup phones', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const { service, createOtp, strategy } = createService('true', 'Production');

    await service.sendSignupOtp({ phone: '5550001234' });

    expect(createOtp).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ otp: '1000' }) }),
    );
    expect(strategy.sendOtp).toHaveBeenCalledWith('+915550001234', '1000');
  });
});
