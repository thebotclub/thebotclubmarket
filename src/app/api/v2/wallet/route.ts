import { NextRequest } from "next/server";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/v2-helpers";

export async function GET(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.success) {
    if (auth.rateLimitResponse) return auth.rateLimitResponse;
    return errorResponse(401, "UNAUTHORIZED", auth.error);
  }

  const operator = await db.operator.findUnique({
    where: { id: auth.operatorId },
    select: { creditBalance: true },
  });
  if (!operator) return errorResponse(404, "NOT_FOUND", "Operator not found");

  const transactions = await db.creditTransaction.findMany({
    where: { operatorId: auth.operatorId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return successResponse({ balance: operator.creditBalance, recentTransactions: transactions });
}
