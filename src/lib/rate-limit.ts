// Sliding-window in-memory rate limiter (per-process). Clock injectable for tests.

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  now?: () => number;
}

export interface RateLimiter {
  isAllowed(key: string): boolean;
  hit(key: string): void;
  reset(key: string): void;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();

  function pruned(key: string): number[] {
    const cutoff = now() - opts.windowMs;
    const kept = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length > 0) {
      hits.set(key, kept);
    } else {
      hits.delete(key);
    }
    return kept;
  }

  return {
    isAllowed(key: string): boolean {
      return pruned(key).length < opts.max;
    },
    hit(key: string): void {
      hits.set(key, [...pruned(key), now()]);
    },
    reset(key: string): void {
      hits.delete(key);
    },
  };
}
