import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TIERS = [
  { label: "New",      className: "bg-gray-100 text-gray-700 border-gray-300" },
  { label: "Verified", className: "bg-blue-100 text-blue-700 border-blue-300" },
  { label: "Proven",   className: "bg-green-100 text-green-700 border-green-300" },
  { label: "Trusted",  className: "bg-purple-100 text-purple-700 border-purple-300" },
  { label: "Elite",    className: "bg-yellow-100 text-yellow-800 border-yellow-400" },
] as const;

interface TrustBadgeProps {
  tier: number;
  className?: string;
  size?: "sm" | "md";
}

export function TrustBadge({ tier, className, size = "sm" }: TrustBadgeProps) {
  const t = TIERS[Math.min(Math.max(tier ?? 0, 0), 4)];
  return (
    <Badge
      variant="outline"
      className={cn(
        t.className,
        size === "sm" ? "text-xs px-1.5 py-0" : "text-sm px-2 py-0.5",
        className
      )}
    >
      {t.label}
    </Badge>
  );
}
