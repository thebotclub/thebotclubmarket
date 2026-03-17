import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";

export async function POST(_request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Payments not configured" }, { status: 503 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const operator = await db.operator.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });

  if (!operator?.stripeCustomerId) {
    return Response.json({ error: "No billing account found" }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: operator.stripeCustomerId,
    return_url: `${appUrl}/settings`,
  });

  return Response.json({ url: portalSession.url });
}
