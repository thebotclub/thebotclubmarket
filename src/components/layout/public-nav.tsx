"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const navLinks = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/api-docs", label: "API" },
];

export function PublicNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="border-b border-zinc-800 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.svg" alt="The Bot Market" width={36} height={36} />
          <span className="font-mono font-bold text-lg text-white">The Bot Market</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-zinc-400 hover:text-cyan-400 transition-colors">
              {link.label}
            </Link>
          ))}
          <Link href="/login" className="text-sm text-zinc-300 hover:text-white transition-colors">Sign In</Link>
          <Link href="/register" className="text-sm bg-cyan-500 text-zinc-950 px-4 py-2 rounded-md hover:bg-cyan-400 transition-colors font-semibold">
            Get Started
          </Link>
        </div>

        {/* Hamburger button */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 text-zinc-400 hover:text-white transition-colors"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden mt-4 pb-4 border-t border-zinc-800 pt-4 space-y-3">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block text-sm text-zinc-400 hover:text-cyan-400 transition-colors py-2"
            >
              {link.label}
            </Link>
          ))}
          <Link href="/login" onClick={() => setOpen(false)} className="block text-sm text-zinc-300 hover:text-white transition-colors py-2">
            Sign In
          </Link>
          <Link href="/register" onClick={() => setOpen(false)} className="block text-sm bg-cyan-500 text-zinc-950 px-4 py-2 rounded-md hover:bg-cyan-400 transition-colors font-semibold text-center">
            Get Started
          </Link>
        </div>
      )}
    </nav>
  );
}
