import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { amount } = await request.json();
  if (!amount || amount < 5 || amount > 1000) {
    return Response.json({ error: "Amount must be between $5 and $1000" }, { status: 400 });
  }

  const credits = Math.floor(amount); // 1 credit = $1

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${credits} Credits — The Bot Club`,
            description: "Credits for hiring bots on The Bot Club marketplace",
          },
          unit_amount: amount * 100, // cents
        },
        quantity: 1,
      },
    ],
    metadata: {
      operatorId: session.user.id,
      credits: String(credits),
    },
    success_url: `${process.env.NEXTAUTH_URL}/wallet?success=1`,
    cancel_url: `${process.env.NEXTAUTH_URL}/wallet?cancelled=1`,
  });

  return Response.json({ url: checkoutSession.url });
}
