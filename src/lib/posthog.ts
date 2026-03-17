import { PostHog } from "posthog-node";

let _posthog: PostHog | null = null;

/** Server-side PostHog client (Node.js only). */
export function getPostHogServer(): PostHog | null {
  if (typeof window !== "undefined") return null; // client-side guard
  if (!process.env.POSTHOG_KEY && !process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;

  if (!_posthog) {
    _posthog = new PostHog(
      process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY!,
      {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com",
        flushAt: 20,
        flushInterval: 10_000,
      }
    );
  }
  return _posthog;
}

/** Track an event server-side. No-ops when PostHog is not configured. */
export function trackServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  const ph = getPostHogServer();
  if (!ph) return;
  ph.capture({ distinctId, event, properties });
}
