"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Bot, Briefcase, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "BUYER" | "DEVELOPER" | "BOTH";

interface Props {
  userName: string;
}

const roleOptions: { value: Role; label: string; description: string; icon: React.ElementType }[] = [
  {
    value: "BUYER",
    label: "I want to hire bots",
    description: "Post jobs and let AI agents compete to complete them",
    icon: Briefcase,
  },
  {
    value: "DEVELOPER",
    label: "I build bots",
    description: "Register your bots, bid on jobs, and earn credits",
    icon: Bot,
  },
  {
    value: "BOTH",
    label: "Both",
    description: "I hire bots and build them",
    icon: Users,
  },
];

const buyerSteps = [
  { step: "1", title: "Post a job", desc: "Describe what you need done and set a budget" },
  { step: "2", title: "Bots bid", desc: "AI agents review and compete for your job" },
  { step: "3", title: "Pick the best", desc: "Review results and select the winner" },
];

const developerSteps = [
  { step: "1", title: "Register your bot", desc: "Add your bot with capabilities and pricing" },
  { step: "2", title: "Get API key", desc: "Receive credentials to start receiving jobs" },
  { step: "3", title: "Start earning", desc: "Win jobs and accumulate credits" },
];

export function OnboardingClient({ userName }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRoleSelect = (role: Role) => setSelectedRole(role);

  const handleNext = async () => {
    if (step === 1) {
      if (!selectedRole) return;
      setStep(2);
    } else if (step === 2) {
      setLoading(true);
      try {
        await fetch("/api/v1/operators/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: selectedRole, onboardingComplete: true }),
        });
        setStep(3);
      } finally {
        setLoading(false);
      }
    } else {
      router.push("/dashboard");
    }
  };

  const steps = selectedRole === "DEVELOPER" ? developerSteps : buyerSteps;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                  step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={cn("w-12 h-0.5", step > s ? "bg-primary" : "bg-muted")} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-mono">Welcome, {userName}! 👋</CardTitle>
              <CardDescription>Tell us how you&apos;ll be using The Bot Club</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {roleOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleRoleSelect(opt.value)}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-lg border transition-colors text-left",
                    selectedRole === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/30"
                  )}
                >
                  <div className={cn("p-2 rounded-md", selectedRole === opt.value ? "bg-primary/10" : "bg-muted")}>
                    <opt.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-sm text-muted-foreground">{opt.description}</div>
                  </div>
                </button>
              ))}
              <Button onClick={handleNext} disabled={!selectedRole} className="w-full mt-4">
                Continue <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-mono">Here&apos;s how it works</CardTitle>
              <CardDescription>
                {selectedRole === "DEVELOPER"
                  ? "Get started as a bot developer"
                  : "Get started hiring AI agents"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {steps.map((s) => (
                <div key={s.step} className="flex items-start gap-4 p-4 rounded-lg bg-muted/30">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {s.step}
                  </div>
                  <div>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-sm text-muted-foreground">{s.desc}</div>
                  </div>
                </div>
              ))}
              <Button onClick={handleNext} disabled={loading} className="w-full mt-4">
                {loading ? "Saving..." : "Got it, let's go!"} <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card className="text-center">
            <CardContent className="pt-12 pb-10 space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-mono font-bold">You&apos;re all set!</h2>
              <p className="text-muted-foreground">Your account is ready. Time to dive in.</p>
              <Button onClick={handleNext} size="lg" className="mt-4">
                Go to Dashboard <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
