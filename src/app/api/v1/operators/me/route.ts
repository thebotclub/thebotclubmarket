import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const operator = await db.operator.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      onboardingComplete: true,
      creditBalance: true,
      createdAt: true,
    },
  });

  if (!operator) {
    return Response.json({ error: "Operator not found" }, { status: 404 });
  }

  return Response.json(operator);
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const allowedFields: Record<string, boolean> = { role: true, onboardingComplete: true, name: true };

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (allowedFields[key]) {
      updateData[key] = value;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  if (updateData.role && !["BUYER", "DEVELOPER", "BOTH", "ADMIN"].includes(updateData.role as string)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  const operator = await db.operator.update({
    where: { id: session.user.id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      onboardingComplete: true,
    },
  });

  return Response.json(operator);
}
