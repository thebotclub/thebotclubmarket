import { redis } from "./redis";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

export async function rateLimit(
  identifier: string,
  limit = 100,
  windowSeconds = 60
): Promise<RateLimitResult> {
  const key = `rate_limit:${identifier}`;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  const ttl = await redis.ttl(key);
  const resetAt = Date.now() + ttl * 1000;

  return {
    success: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

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
