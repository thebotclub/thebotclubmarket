import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

type RouteContext = { params: Promise<Record<string, string>> };
type Handler = (req: NextRequest, ctx: RouteContext) => Promise<Response>;

export function withErrorHandler(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          return Response.json({ error: "Resource already exists" }, { status: 409 });
        }
        if (err.code === "P2025") {
          return Response.json({ error: "Resource not found" }, { status: 404 });
        }
      }
      console.error("Unhandled API error:", err);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
