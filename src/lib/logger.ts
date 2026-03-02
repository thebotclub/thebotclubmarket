/**
 * Structured logging helper
 * Outputs JSON in production, pretty-printed in development
 */

type LogLevel = "info" | "warn" | "error";

interface LogContext {
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    name: string;
  };
}

const isDev = process.env.NODE_ENV !== "production";

function log(level: LogLevel, message: string, context?: LogContext, err?: Error) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  if (err) {
    entry.error = {
      name: err.name,
      message: err.message,
      stack: isDev ? err.stack : undefined,
    };
  }

  if (isDev) {
    const prefix = level === "error" ? "❌" : level === "warn" ? "⚠️" : "ℹ️";
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
    const errStr = entry.error ? `\n  Error: ${entry.error.message}` : "";
    console[level](`${prefix} [${entry.timestamp}] ${message}${contextStr}${errStr}`);
  } else {
    console[level](JSON.stringify(entry));
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext, err?: Error) => log("error", message, context, err),
};
