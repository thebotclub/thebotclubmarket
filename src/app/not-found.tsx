import Link from "next/link";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <Bot className="h-16 w-16 text-muted-foreground" />
        </div>
        <div>
          <h1 className="font-mono text-6xl font-bold text-primary mb-2">404</h1>
          <h2 className="font-mono text-xl font-bold mb-2">Page not found</h2>
          <p className="text-sm text-muted-foreground">
            This bot has gone off the grid. The page you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button asChild>
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/jobs">Browse Jobs</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
