import { AsyncLocalStorage } from 'node:async_hooks';

export type PerfStore = {
  startHrTime: bigint;
  dbMs: number;
  dbQueries: number;
};

const perfAls = new AsyncLocalStorage<PerfStore>();

export function runWithPerfStore<T>(fn: () => T): T {
  return perfAls.run(
    {
      startHrTime: process.hrtime.bigint(),
      dbMs: 0,
      dbQueries: 0,
    },
    fn,
  );
}

export function getPerfStore(): PerfStore | undefined {
  return perfAls.getStore();
}

export function addDbTiming(durationMs: number): void {
  const store = perfAls.getStore();
  if (!store) return;
  store.dbMs += durationMs;
  store.dbQueries += 1;
}

export function getApiMs(nowHrTime?: bigint): number | undefined {
  const store = perfAls.getStore();
  if (!store) return undefined;
  const now = nowHrTime ?? process.hrtime.bigint();
  return Number(now - store.startHrTime) / 1_000_000;
}

export function shouldIncludePerf(): boolean {
  if (process.env.INCLUDE_PERF) return process.env.INCLUDE_PERF === 'true';
  return process.env.NODE_ENV !== 'production';
}
