import { db } from "@/lib/db";

export type SubscriptionTier = "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";

export interface TierConfig {
  name: string;
  monthlyCredits: number;
  maxBots: number;
  features: string[];
  stripePriceId: string | null;
}

export const TIER_CONFIG: Record<SubscriptionTier, TierConfig> = {
  FREE: {
    name: "Free",
    monthlyCredits: 0,
    maxBots: 1,
    features: ["marketplace_access", "api_access"],
    stripePriceId: null,
  },
  PRO: {
    name: "Pro",
    monthlyCredits: 500,
    maxBots: 5,
    features: [
      "marketplace_access",
      "api_access",
      "analytics",
      "priority_bots",
      "webhook_events",
      "advanced_filters",
    ],
    stripePriceId: process.env.STRIPE_PRICE_PRO ?? null,
  },
  BUSINESS: {
    name: "Business",
    monthlyCredits: 2000,
    maxBots: -1, // unlimited
    features: [
      "marketplace_access",
      "api_access",
      "analytics",
      "priority_bots",
      "webhook_events",
      "advanced_filters",
      "team_accounts",
      "sla",
      "api_priority",
      "advanced_analytics",
      "dedicated_support",
    ],
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS ?? null,
  },
  ENTERPRISE: {
    name: "Enterprise",
    monthlyCredits: -1, // custom
    maxBots: -1,
    features: [
      "marketplace_access",
      "api_access",
      "analytics",
      "priority_bots",
      "webhook_events",
      "advanced_filters",
      "team_accounts",
      "sla",
      "api_priority",
      "advanced_analytics",
      "dedicated_support",
      "white_label",
      "custom_integrations",
      "custom_contracts",
    ],
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE ?? null,
  },
};

export async function getSubscriptionTier(userId: string): Promise<SubscriptionTier> {
  const operator = await db.operator.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true, subscriptionStatus: true },
  });

  if (!operator) return "FREE";

  const tier = operator.subscriptionTier as SubscriptionTier | null;
  const status = operator.subscriptionStatus;

  // Only active/trialing subscriptions grant tier benefits
  if (tier && tier !== "FREE" && (status === "active" || status === "trialing")) {
    return tier;
  }

  return "FREE";
}

export function hasFeature(tier: SubscriptionTier, feature: string): boolean {
  return TIER_CONFIG[tier].features.includes(feature);
}

export function getTierBadgeColor(tier: SubscriptionTier): string {
  switch (tier) {
    case "PRO":
      return "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30";
    case "BUSINESS":
      return "bg-violet-500/20 text-violet-400 border border-violet-500/30";
    case "ENTERPRISE":
      return "bg-amber-500/20 text-amber-400 border border-amber-500/30";
    default:
      return "bg-zinc-800 text-zinc-400 border border-zinc-700";
  }
}
