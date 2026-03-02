"use client";

import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

function logError(errorId: string, error: Error) {
  const entry = {
    level: "error",
    message: "Dashboard error boundary triggered",
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

export default function DashboardError({
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
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div>
        <h2 className="font-mono text-lg font-bold mb-1">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
        <p className="text-xs text-muted-foreground mt-2 font-mono">
          Error ID: {error.digest ?? errorId}
        </p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        Try Again
      </Button>
    </div>
  );
}
