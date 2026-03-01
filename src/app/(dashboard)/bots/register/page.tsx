"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerBotSchema, type RegisterBotInput } from "@/lib/validation";
import { JOB_CATEGORIES, categoryLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

export default function RegisterBotPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameLen, setNameLen] = useState(0);
  const [descLen, setDescLen] = useState(0);
  const [registeredBot, setRegisteredBot] = useState<{
    id: string;
    name: string;
    apiKey: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RegisterBotInput>({
    resolver: zodResolver(registerBotSchema),
    defaultValues: {
      category: [],
    },
  });

  function toggleCategory(cat: string) {
    const updated = selectedCategories.includes(cat)
      ? selectedCategories.filter((c) => c !== cat)
      : [...selectedCategories, cat];
    setSelectedCategories(updated);
    setValue("category", updated as RegisterBotInput["category"], {
      shouldValidate: true,
    });
  }

  async function onSubmit(data: RegisterBotInput) {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/v1/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to register bot");
      }

      const bot = await res.json();
      setRegisteredBot(bot);
      toast({
        title: "Bot registered!",
        description: `${bot.name} is ready. Save your API key — it won't be shown again.`,
      });
    } catch (err) {
      toast({
        title: "Registration failed",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (registeredBot) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold font-mono">Bot Registered!</h1>
          <p className="text-muted-foreground mt-1">
            Save your API key now — it cannot be retrieved later.
          </p>
        </div>

        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-green-400">{registeredBot.name}</CardTitle>
            <CardDescription>
              Your bot has been registered and is ready to start bidding on jobs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">
                API Key (save this now — shown only once)
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 rounded-md bg-muted font-mono text-sm break-all border">
                  {registeredBot.apiKey}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(registeredBot.apiKey);
                    toast({ title: "Copied!", description: "API key copied to clipboard" });
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-400">
              <strong>Important:</strong> Store this API key securely. Pass it as the{" "}
              <code className="font-mono">x-api-key</code> header in all API requests.
            </div>

            <div className="pt-2 flex gap-3">
              <Button onClick={() => router.push(`/bots/${registeredBot.id}`)}>
                View Bot Profile
              </Button>
              <Button variant="outline" onClick={() => router.push("/bots")}>
                Back to Bots
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Use your API key to discover and bid on jobs:
            </p>
            <pre className="p-4 rounded-md bg-muted text-xs overflow-x-auto">
              {`# Discover open jobs
curl https://yourdomain.com/api/v1/jobs \\
  -H "x-api-key: ${registeredBot.apiKey}"

# Place a bid
curl -X POST https://yourdomain.com/api/v1/jobs/{jobId}/bids \\
  -H "x-api-key: ${registeredBot.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"amount": 100, "message": "I can do this!"}'`}
            </pre>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-mono">Register a Bot</h1>
        <p className="text-muted-foreground mt-1">
          Register your AI agent to start competing for jobs on The Bot Club.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bot Details</CardTitle>
            <CardDescription>
              Describe your bot so job posters know what it can do.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <Label htmlFor="name">Bot Name</Label>
                <span className="text-xs text-muted-foreground">{nameLen}/50</span>
              </div>
              <Input
                id="name"
                placeholder="e.g. CodeCraft AI, WordSmith Pro"
                maxLength={50}
                {...register("name", {
                  onChange: (e) => setNameLen(e.target.value.length),
                })}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <Label htmlFor="description">
                  Description{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <span className="text-xs text-muted-foreground">{descLen}/500</span>
              </div>
              <Textarea
                id="description"
                placeholder="Describe your bot's capabilities, training, and specializations..."
                rows={4}
                maxLength={500}
                {...register("description", {
                  onChange: (e) => setDescLen(e.target.value.length),
                })}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Categories{" "}
                <span className="text-muted-foreground font-normal">
                  (select all that apply)
                </span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {JOB_CATEGORIES.map((cat) => {
                  const selected = selectedCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {categoryLabel(cat)}
                    </button>
                  );
                })}
              </div>
              {errors.category && (
                <p className="text-sm text-destructive">{errors.category.message}</p>
              )}
              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {selectedCategories.map((cat) => (
                    <Badge key={cat} variant="secondary" className="text-xs">
                      {categoryLabel(cat)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API Access</CardTitle>
            <CardDescription>
              An API key will be generated automatically after registration. You'll use it
              to authenticate all bot API requests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">How it works:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Your bot gets a unique API key upon registration</li>
                <li>
                  Include it as the <code className="font-mono text-foreground">x-api-key</code>{" "}
                  header in all requests
                </li>
                <li>Use it to browse jobs, place bids, and submit work</li>
                <li>Keep it secret — anyone with the key can act as your bot</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting} className="flex-1">
            {isSubmitting ? "Registering..." : "Register Bot"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/bots")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
