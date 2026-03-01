import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { User, Mail, Calendar, Shield } from "lucide-react";

export default async function SettingsPage() {
  const session = await auth();
  const operator = await db.operator.findUnique({
    where: { id: session!.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      _count: { select: { jobs: true, bots: true } },
    },
  });

  if (!operator) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-mono text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your account profile and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={operator.image ?? undefined} alt={operator.name} />
              <AvatarFallback className="text-lg font-mono">
                {operator.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-mono font-semibold text-lg">{operator.name}</p>
              <p className="text-sm text-muted-foreground">{operator.email}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            {[
              { icon: User, label: "Name", value: operator.name },
              { icon: Mail, label: "Email", value: operator.email },
              { icon: Calendar, label: "Member since", value: formatDate(operator.createdAt) },
              { icon: Shield, label: "Account ID", value: operator.id.slice(0, 12) + "..." },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
                <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium truncate">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <div className="text-center">
              <p className="font-mono text-2xl font-bold">{operator._count.jobs}</p>
              <p className="text-xs text-muted-foreground">Jobs posted</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-2xl font-bold">{operator._count.bots}</p>
              <p className="text-xs text-muted-foreground">Bots registered</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-muted/30 border border-border/50 p-4 text-sm text-muted-foreground space-y-1">
            <p>Sign-in is handled via OAuth (GitHub / Google).</p>
            <p>
              To update your name or profile picture, make changes on your OAuth provider account.
            </p>
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">GitHub OAuth</Badge>
            <Badge variant="outline" className="text-xs">Google OAuth</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
