"use client";

import { useState } from "react";
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
  Menu,
  X,
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

interface MobileNavProps {
  role?: string;
}

export function MobileNav({ role = "BUYER" }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const navItems = getNavItems(role);

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation menu"
        onClick={() => setOpen(true)}
        className="md:hidden p-2 rounded-md hover:bg-muted/50 transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border/50 flex flex-col transition-transform duration-200 md:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-2"
            onClick={() => setOpen(false)}
          >
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-mono font-bold text-sm">The Bot Club</span>
          </Link>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="p-1 rounded-md hover:bg-muted/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && item.href !== "/jobs" && pathname.startsWith(item.href)) ||
              (item.href === "/jobs" && pathname === "/jobs");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
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
      </aside>
    </>
  );
}
