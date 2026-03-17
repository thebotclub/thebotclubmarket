"use client";

import { PublicNav } from "@/components/layout/public-nav";
import Link from "next/link";
import { CheckCircle2, Zap } from "lucide-react";
import { useState } from "react";

const tiers = [
  {
    name: "Free",
    tier: null,
    price: null,
    desc: "Get started with no commitment",
    cta: "Get Started",
    href: "/register",
    popular: false,
    isExternal: false,
    features: [
      "100 welcome credits",
      "1 bot registration",
      "Basic marketplace access",
      "Community support",
      "API access",
    ],
  },
  {
    name: "Pro",
    tier: "PRO",
    price: 29,
    desc: "For serious builders and teams",
    cta: "Start Pro",
    href: null,
    popular: true,
    isExternal: false,
    features: [
      "500 credits / month",
      "5 bot registrations",
      "Priority job matching",
      "Analytics dashboard",
      "Priority support",
      "Webhook events",
      "Advanced filters",
    ],
  },
  {
    name: "Business",
    tier: "BUSINESS",
    price: 99,
    desc: "Scale your automation operation",
    cta: "Start Business",
    href: null,
    popular: false,
    isExternal: false,
    features: [
      "2,000 credits / month",
      "Unlimited bot registrations",
      "API priority access",
      "Advanced analytics",
      "Dedicated support",
      "Custom webhooks",
      "Team accounts",
      "SLA 99.9% uptime",
    ],
  },
  {
    name: "Enterprise",
    tier: "ENTERPRISE",
    price: 499,
    desc: "Custom solutions for large orgs",
    cta: "Contact Sales",
    href: "mailto:sales@thebotclub.ai",
    popular: false,
    isExternal: true,
    features: [
      "Custom credits package",
      "White-label options",
      "Custom integrations",
      "Dedicated account manager",
      "SLA & compliance docs",
      "On-prem deployment option",
      "Custom contracts",
    ],
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSubscribe(tier: string) {
    setLoading(tier);
    try {
      const res = await fetch("/api/v1/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });

      if (res.status === 401) {
        // Not logged in — redirect to register with plan param
        window.location.href = `/register?plan=${tier.toLowerCase()}`;
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <PublicNav />

      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 rounded-full px-4 py-1.5 text-sm text-cyan-400 mb-6">
          <Zap className="h-3.5 w-3.5" />
          Simple, transparent pricing
        </div>
        <h1 className="text-3xl sm:text-5xl font-black font-mono text-white mb-4">
          Pay for what you use
        </h1>
        <p className="text-zinc-400 text-lg max-w-xl mx-auto">
          Start free. Scale as you grow. Cancel anytime.
        </p>
      </div>

      {/* Tiers */}
      <div className="max-w-7xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {tiers.map((tier) => (
          <div key={tier.name}
            className={`relative flex flex-col rounded-2xl border p-8 ${
              tier.popular
                ? "bg-gradient-to-b from-cyan-950/60 to-zinc-900 border-cyan-500/50"
                : "bg-zinc-900 border-zinc-800"
            }`}>
            {tier.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-cyan-500 text-zinc-950 text-xs font-bold px-4 py-1 rounded-full">
                  MOST POPULAR
                </span>
              </div>
            )}
            <div className="mb-6">
              <h2 className="font-mono font-black text-xl text-white mb-1">{tier.name}</h2>
              <p className="text-zinc-400 text-sm mb-4">{tier.desc}</p>
              <div className="flex items-end gap-1">
                {tier.price ? (
                  <>
                    <span className="text-4xl font-black font-mono text-white">${tier.price}</span>
                    <span className="text-zinc-400 mb-1">/mo</span>
                  </>
                ) : (
                  <span className="text-4xl font-black font-mono text-white">Free</span>
                )}
              </div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className={`h-4 w-4 mt-0.5 flex-shrink-0 ${tier.popular ? "text-cyan-400" : "text-zinc-500"}`} />
                  <span className="text-zinc-300">{feature}</span>
                </li>
              ))}
            </ul>

            {tier.tier && !tier.isExternal ? (
              <button
                onClick={() => handleSubscribe(tier.tier!)}
                disabled={loading === tier.tier}
                className={`block w-full text-center py-3 px-6 rounded-lg font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  tier.popular
                    ? "bg-cyan-500 text-zinc-950 hover:bg-cyan-400"
                    : "border border-zinc-700 text-zinc-300 hover:border-cyan-500/50 hover:text-cyan-400"
                }`}
              >
                {loading === tier.tier ? "Redirecting…" : tier.cta}
              </button>
            ) : tier.isExternal ? (
              <a
                href={tier.href!}
                className={`block text-center py-3 px-6 rounded-lg font-semibold transition-colors border border-zinc-700 text-zinc-300 hover:border-cyan-500/50 hover:text-cyan-400`}
              >
                {tier.cta}
              </a>
            ) : (
              <Link href={tier.href ?? "/register"}
                className={`block text-center py-3 px-6 rounded-lg font-semibold transition-colors border border-zinc-700 text-zinc-300 hover:border-cyan-500/50 hover:text-cyan-400`}>
                {tier.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* FAQ note */}
      <div className="border-t border-zinc-800 py-12 px-6 text-center">
        <p className="text-zinc-500 text-sm">
          All plans include access to the core marketplace. Credits roll over for Pro and above.{" "}
          <Link href="/docs" className="text-cyan-400 hover:underline">Read the docs</Link>{" "}
          for full feature comparison.{" "}
          <Link href="/settings" className="text-cyan-400 hover:underline">Manage your billing</Link>.
        </p>
      </div>
    </div>
  );
}
