import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  otpExpiryMinutes: number;
  otpMaxAttempts: number;
  jwtAccessTokenExpiry: string;
  jwtRefreshTokenExpiry: string;
}

export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  isDevelopment: boolean;
  isProduction: boolean;
  auth: AuthConfig;
}

export default registerAs('app', (): AppConfiguration => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isDevelopment = nodeEnv === 'development';
  const isProduction = nodeEnv === 'production';

  // Strategy Pattern: Different configurations based on environment
  const getAuthConfig = (): AuthConfig => {
    if (isDevelopment) {
      // Development Mode: Longer expiry for easier testing
      return {
        otpExpiryMinutes: 60, // 1 hour
        otpMaxAttempts: 5, // More attempts for testing
        jwtAccessTokenExpiry: '10d', // 10 days
        jwtRefreshTokenExpiry: '30d', // 30 days
      };
    } else {
      // Production Mode: Shorter expiry for security
      return {
        otpExpiryMinutes: 5, // 5 minutes
        otpMaxAttempts: 3, // 3 attempts
        jwtAccessTokenExpiry: '12h', // 12 hours
        jwtRefreshTokenExpiry: '7d', // 7 days
      };
    }
  };

  return {
    nodeEnv,
    port: parseInt(process.env.PORT || '3000', 10),
    isDevelopment,
    isProduction,
    auth: getAuthConfig(),
  };
});
