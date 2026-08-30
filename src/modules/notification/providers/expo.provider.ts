/**
 * Expo push notification client.
 * Providers are split so each channel can be extended independently.
 */
import { Expo } from 'expo-server-sdk';

let expoInstance: Expo | null = null;

export function getExpoClient(): Expo {
  if (!expoInstance) {
    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    expoInstance = new Expo(accessToken ? { accessToken } : undefined);
  }
  return expoInstance;
}

export function isExpoReceipt(value: unknown): value is { status?: string; message?: string; details?: Record<string, unknown> } {
  return typeof value === 'object' && value !== null;
}
