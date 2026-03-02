"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Calendar, Shield, Bell, Key, AlertTriangle, Check } from "lucide-react";

interface Props {
  operator: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    createdAt: string;
    _count: { jobs: number; bots: number };
  };
}

const NOTIFICATION_TYPES = [
  { key: "job_created", label: "Job created" },
  { key: "bid_received", label: "Bid received" },
  { key: "job_awarded", label: "Job awarded" },
  { key: "job_completed", label: "Job completed" },
  { key: "payment_received", label: "Payment received" },
  { key: "webhook_failed", label: "Webhook failures" },
];

export function SettingsClient({ operator }: Props) {
  const [name, setName] = useState(operator.name);
  const [avatarUrl, setAvatarUrl] = useState(operator.image ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifications, setNotifications] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICATION_TYPES.map((n) => [n.key, true]))
  );

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/v1/operators/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, image: avatarUrl || null }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-mono text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <section className="bg-card border border-border rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <User className="h-4 w-4 text-muted-foreground" />
          Profile
        </div>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarUrl || undefined} alt={name} />
            <AvatarFallback className="text-lg font-mono">
              {name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">Preview updates live as you type</p>
            <Badge variant="outline" className="text-xs">
              {operator._count.jobs} jobs · {operator._count.bots} bots
            </Badge>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Display Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-muted/30 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Email</label>
            <input
              value={operator.email}
              disabled
              className="w-full bg-muted/10 border border-border rounded-md px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Avatar URL</label>
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-muted/30 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-500">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </section>

      {/* Account info */}
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Account Info
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { icon: Mail, label: "Email", value: operator.email },
            { icon: Calendar, label: "Member since", value: new Date(operator.createdAt).toLocaleDateString() },
            { icon: Shield, label: "Account ID", value: operator.id.slice(0, 12) + "…" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 p-3 rounded-md bg-muted/20 border border-border/50">
              <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-sm font-medium truncate font-mono">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Notifications */}
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Bell className="h-4 w-4 text-muted-foreground" />
          Email Notifications
        </div>
        <div className="space-y-2">
          {NOTIFICATION_TYPES.map((n) => (
            <label key={n.key} className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-border/50 cursor-pointer hover:bg-muted/30 transition-colors">
              <span className="text-sm">{n.label}</span>
              <div
                onClick={() => setNotifications((prev) => ({ ...prev, [n.key]: !prev[n.key] }))}
                className={`relative w-9 h-5 rounded-full transition-colors ${notifications[n.key] ? "bg-primary" : "bg-muted"}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${notifications[n.key] ? "translate-x-4" : ""}`} />
              </div>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Notification preferences are saved locally for now.</p>
      </section>

      {/* API Keys placeholder */}
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Key className="h-4 w-4 text-muted-foreground" />
          API Keys
        </div>
        <p className="text-sm text-muted-foreground">
          Use API keys to authenticate your bots and integrations. Generate keys from the{" "}
          <a href="/dashboard/bots" className="text-primary hover:underline">Bots</a> page when registering a bot.
        </p>
        <div className="rounded-md bg-muted/20 border border-border/50 p-4 font-mono text-xs text-muted-foreground">
          tbc_sk_••••••••••••••••••••••••••••••••
        </div>
        <a href="/api-docs" className="inline-block text-xs text-primary hover:underline">
          API documentation →
        </a>
      </section>

      {/* Danger Zone */}
      <section className="bg-card border border-destructive/30 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 font-semibold text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Danger Zone
        </div>
        <p className="text-sm text-muted-foreground">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <button
          disabled
          className="border border-destructive/50 text-destructive text-sm px-4 py-2 rounded-md opacity-50 cursor-not-allowed"
        >
          Delete Account (contact support)
        </button>
      </section>
    </div>
  );
}
