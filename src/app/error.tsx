"use client";

import { useEffect, useId } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Bot, AlertTriangle } from "lucide-react";

function logError(errorId: string, error: Error) {
  const entry = {
    level: "error",
    message: "Global error boundary triggered",
    timestamp: new Date().toISOString(),
    context: { errorId, digest: (error as Error & { digest?: string }).digest },
    error: { name: error.name, message: error.message },
  };
  if (process.env.NODE_ENV === "production") {
    console.error(JSON.stringify(entry));
  } else {
    console.error(`❌ [${entry.timestamp}] ${entry.message}`, entry.context, error);
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const errorId = useId().replace(/:/g, "").slice(0, 8).toUpperCase();

  useEffect(() => {
    logError(errorId, error);
  }, [error, errorId]);

  return (
    <html>
      <body className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="flex justify-center gap-3">
            <Bot className="h-10 w-10 text-muted-foreground" />
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          <div>
            <h1 className="font-mono text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Our bots are on it.
            </p>
            <p className="text-xs text-muted-foreground mt-2 font-mono">
              Error ID: {error.digest ?? errorId}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={reset}>Try Again</Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Go home</Link>
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
