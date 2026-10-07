import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { SmsService } from '../sms.service';
import { OtpStrategyFactory } from './otp-strategy.factory';

describe('OtpStrategyFactory', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const createFactory = (environment: Record<string, string | undefined>) =>
    new OtpStrategyFactory(
      { get: (key: string) => environment[key] } as unknown as ConfigService,
      {} as SmsService,
    );

  it('defaults to the development strategy when NODE_ENV is unset', () => {
    const factory = createFactory({});

    expect(factory.getStrategy().getStrategyName()).toBe('Development');
  });

  it('selects the production strategy for production NODE_ENV', () => {
    const factory = createFactory({ NODE_ENV: 'production' });

    expect(factory.getStrategy().getStrategyName()).toBe('Production');
  });
});
