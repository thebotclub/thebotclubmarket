import { auth, signOut } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/utils";
import { db } from "@/lib/db";
import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { NotificationBell } from "@/components/layout/notification-bell";
import { getSubscriptionTier } from "@/lib/subscription";
import { TierBadge } from "@/components/subscription/tier-badge";

async function getUserData(userId: string) {
  const operator = await db.operator.findUnique({
    where: { id: userId },
    select: { creditBalance: true },
  });
  const credits = operator?.creditBalance.toNumber() ?? 0;
  const tier = await getSubscriptionTier(userId);
  return { credits, tier };
}

export async function Navbar() {
  const session = await auth();
  if (!session?.user) return null;

  const { credits, tier } = await getUserData(session.user.id);
  const initials = session.user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "U";

  return (
    <div className="flex-1 flex items-center justify-between">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <TierBadge tier={tier} />
        <span>
          <span className="text-foreground font-medium font-mono">
            {formatCurrency(credits)}
          </span>{" "}
          credits
        </span>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell />

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none">
          <span className="text-sm text-muted-foreground hidden sm:block">
            {session.user.name}
          </span>
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={session.user.image ?? undefined}
              alt={session.user.name ?? "User"}
            />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="text-sm text-muted-foreground" disabled>
            <User className="h-4 w-4 mr-2" />
            {session.user.email}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/webhooks" className="text-sm">
              Webhooks
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="flex items-center gap-2 w-full text-sm cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </div>
  );
}
