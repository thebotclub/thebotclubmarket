import { NextRequest } from "next/server";

export function getPagination(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function successResponse(data: unknown, meta?: Record<string, unknown>) {
  return Response.json({ data, meta: { timestamp: new Date().toISOString(), ...meta } });
}

export function errorResponse(status: number, code: string, message: string, details?: unknown) {
  return Response.json({ error: { code, message, details } }, { status });
}
