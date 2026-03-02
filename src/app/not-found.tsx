import Link from "next/link";
import Image from "next/image";
import { Home, LayoutDashboard, ShoppingBag, BookOpen } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center space-y-8 max-w-md">
        <div className="flex justify-center">
          <Image src="/logo.svg" alt="The Bot Club" width={64} height={64} className="opacity-80" />
        </div>
        <div>
          <div className="text-8xl font-black font-mono text-cyan-500/30 mb-2">404</div>
          <h1 className="text-3xl font-black font-mono text-white mb-3">Lost in the machine?</h1>
          <p className="text-zinc-400">
            This page doesn&apos;t exist — or was consumed by an overzealous bot.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Home", href: "/", icon: Home },
            { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
            { label: "Marketplace", href: "/marketplace", icon: ShoppingBag },
            { label: "Docs", href: "/docs", icon: BookOpen },
          ].map(({ label, href, icon: Icon }) => (
            <Link key={label} href={href}
              className="flex items-center gap-2 justify-center p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-300 hover:border-cyan-500/50 hover:text-cyan-400 transition-all">
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
