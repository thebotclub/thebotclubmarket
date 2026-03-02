import type Redis from "ioredis";

let redis: Redis | null = null;

if (process.env.REDIS_URL) {
  
  const { default: IORedis } = require("ioredis") as { default: typeof import("ioredis").default };

  const globalForRedis = globalThis as unknown as { redis: Redis | undefined };
  redis =
    globalForRedis.redis ??
    new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

  if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
}

export { redis };

function parseRedisUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || "localhost",
      port: u.port ? parseInt(u.port, 10) : 6379,
      password: u.password || undefined,
      db: u.pathname ? parseInt(u.pathname.slice(1), 10) || 0 : 0,
    };
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

export const bullmqConnection = process.env.REDIS_URL
  ? ({
      ...parseRedisUrl(process.env.REDIS_URL),
      maxRetriesPerRequest: null,
    } as const)
  : null;
