import { db } from "@/lib/db";
import pkg from "../../../../package.json";

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "connected";

  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "disconnected";
  }

  const latencyMs = Date.now() - startTime;
  const isHealthy = dbStatus === "connected";

  return Response.json(
    {
      status: isHealthy ? "ok" : "degraded",
      version: pkg.version,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      db: dbStatus,
      latencyMs,
    },
    { status: isHealthy ? 200 : 503 }
  );
}
