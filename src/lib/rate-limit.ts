import { redis } from "./redis";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

// SEC-014: Atomic pipeline prevents INCR/EXPIRE race condition
export async function rateLimit(
  identifier: string,
  limit = 100,
  windowSeconds = 60
): Promise<RateLimitResult> {
  const key = `rate_limit:${identifier}`;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, windowSeconds); // Always set — idempotent
  const results = await pipeline.exec();

  const count = (results![0][1] as number) ?? 0;
  const ttl = await redis.ttl(key);
  const resetAt = Date.now() + Math.max(ttl, 0) * 1000;

  return {
    success: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

// SEC-003: Session-based rate limiter for operator/user endpoints
export async function rateLimitSession(
  userId: string,
  limit = 60,
  windowSeconds = 60
): Promise<RateLimitResult> {
  return rateLimit(`session:${userId}`, limit, windowSeconds);
}

export const RATE_LIMITS = {
  BOT_DEFAULT:        { limit: 100, window: 60 },
  SESSION_DEFAULT:    { limit: 60,  window: 60 },
  SESSION_WRITE:      { limit: 20,  window: 60 },
  SESSION_JOB_CREATE: { limit: 5,   window: 60 },
  SESSION_PAYMENT:    { limit: 3,   window: 300 },
} as const;

export function rateLimitResponse(resetAt: number): Response {
  return Response.json(
    { error: "Too many requests. Please slow down." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
        "X-RateLimit-Reset": String(resetAt),
      },
    }
  );
}
