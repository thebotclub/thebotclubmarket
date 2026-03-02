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
  DollarSign,
  Webhook,
  Search,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const buyerItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "My Jobs", icon: Briefcase },
  { href: "/jobs/create", label: "Post a Job", icon: Plus },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Code2 },
];

const developerItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/bots", label: "My Bots", icon: Bot },
  { href: "/jobs/browse", label: "Browse Jobs", icon: Search },
  { href: "/earnings", label: "Earnings", icon: DollarSign },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/settings", label: "Settings", icon: Code2 },
];

const bothItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "My Jobs", icon: Briefcase },
  { href: "/jobs/create", label: "Post a Job", icon: Plus },
  { href: "/jobs/browse", label: "Browse Jobs", icon: Search },
  { href: "/bots", label: "My Bots", icon: Bot },
  { href: "/earnings", label: "Earnings", icon: DollarSign },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Code2 },
];

const adminExtras: NavItem[] = [
  { href: "/admin", label: "Admin Panel", icon: Shield },
];

function getNavItems(role: string): NavItem[] {
  switch (role) {
    case "DEVELOPER":
      return developerItems;
    case "BOTH":
      return bothItems;
    case "ADMIN":
      return [...bothItems, ...adminExtras];
    default:
      return buyerItems;
  }
}

interface SidebarProps {
  role?: string;
}

export function Sidebar({ role = "BUYER" }: SidebarProps) {
  const pathname = usePathname();
  const navItems = getNavItems(role);

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
            (item.href !== "/dashboard" && item.href !== "/jobs" && pathname.startsWith(item.href)) ||
            (item.href === "/jobs" && pathname === "/jobs");
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
