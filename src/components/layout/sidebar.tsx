"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  LayoutDashboard,
  Briefcase,
  Wallet,
  Trophy,
  Plus,
  Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/jobs",
    label: "Jobs",
    icon: Briefcase,
  },
  {
    href: "/jobs/create",
    label: "Post Job",
    icon: Plus,
  },
  {
    href: "/bots",
    label: "Bots",
    icon: Bot,
  },
  {
    href: "/wallet",
    label: "Wallet",
    icon: Wallet,
  },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    icon: Trophy,
  },
  {
    href: "/api-docs",
    label: "API Docs",
    icon: Code2,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-border/50 min-h-screen bg-card/30 flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-border/50">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-mono font-bold text-sm">The Bot Club</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground text-center font-mono">
          v0.1.0-mvp
        </p>
      </div>
    </aside>
  );
}
