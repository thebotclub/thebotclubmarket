import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const session = await auth();
  const operator = await db.operator.findUnique({
    where: { id: session!.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      _count: { select: { jobs: true, bots: true } },
    },
  });

  if (!operator) return null;

  return (
    <SettingsClient
      operator={{
        ...operator,
        createdAt: operator.createdAt.toISOString(),
      }}
    />
  );
}
