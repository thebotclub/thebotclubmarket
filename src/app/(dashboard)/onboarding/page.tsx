import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const operator = await db.operator.findUnique({
    where: { id: session.user.id },
    select: { onboardingComplete: true, role: true, name: true },
  });

  if (operator?.onboardingComplete) {
    redirect("/dashboard");
  }

  return <OnboardingClient userName={operator?.name ?? session.user.name ?? "there"} />;
}
