"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Bot, AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
            {error.digest && (
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                Error ID: {error.digest}
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={reset}>Try again</Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Go home</Link>
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
