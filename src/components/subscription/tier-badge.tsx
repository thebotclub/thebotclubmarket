import { type SubscriptionTier, getTierBadgeColor } from "@/lib/subscription";

interface TierBadgeProps {
  tier: SubscriptionTier;
  className?: string;
}

export function TierBadge({ tier, className = "" }: TierBadgeProps) {
  const colorClass = getTierBadgeColor(tier);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold font-mono ${colorClass} ${className}`}
    >
      {tier}
    </span>
  );
}
