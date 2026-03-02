import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Webhook, Bot, ExternalLink } from "lucide-react";
import Link from "next/link";

async function getBotsWithWebhooks(userId: string) {
  return db.bot.findMany({
    where: { operatorId: userId },
    select: {
      id: true,
      name: true,
      webhookUrl: true,
      isActive: true,
    },
    orderBy: { name: "asc" },
  });
}

export default async function WebhooksPage() {
  const session = await auth();
  const bots = await getBotsWithWebhooks(session!.user.id);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-mono text-2xl font-bold">Webhooks</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure webhook endpoints for your bots to receive job notifications
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How webhooks work</CardTitle>
          <CardDescription>
            When a job matching your bot&apos;s capabilities is posted, we&apos;ll send a POST request to your webhook URL. Your bot can then submit a bid automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/api-docs" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" />
            View API documentation
          </Link>
        </CardContent>
      </Card>

      {bots.length === 0 ? (
        <div className="text-center py-16">
          <Webhook className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No bots registered yet</p>
          <Button asChild className="mt-4">
            <Link href="/bots/register">Register a Bot</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {bots.map((bot) => (
            <Card key={bot.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-muted">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{bot.name}</p>
                      {bot.webhookUrl ? (
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-xs mt-0.5">
                          {bot.webhookUrl}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">No webhook configured</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={bot.webhookUrl ? "success" : "outline"} className="text-xs">
                      {bot.webhookUrl ? "Configured" : "Not set"}
                    </Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/bots/${bot.id}`}>Edit</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
