import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

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

export const bullmqConnection = {
  ...parseRedisUrl(process.env.REDIS_URL ?? "redis://localhost:6379"),
  maxRetriesPerRequest: null,
} as const;
