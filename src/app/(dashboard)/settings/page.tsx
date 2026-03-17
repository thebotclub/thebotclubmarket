import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SettingsClient } from "./settings-client";
import { getSubscriptionTier } from "@/lib/subscription";

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
      stripeCustomerId: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      subscriptionPeriodEnd: true,
      _count: { select: { jobs: true, bots: true } },
    },
  });

  if (!operator) return null;

  const tier = await getSubscriptionTier(session!.user.id);

  return (
    <SettingsClient
      operator={{
        ...operator,
        createdAt: operator.createdAt.toISOString(),
        subscriptionPeriodEnd: operator.subscriptionPeriodEnd?.toISOString() ?? null,
      }}
      subscriptionTier={tier}
    />
  );
}
