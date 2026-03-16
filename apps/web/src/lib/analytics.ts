import posthog from "posthog-js";

declare global {
  interface Window {
    gtag?: (...args: [string, string, Record<string, unknown>?]) => void;
  }
}

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;

  if (posthog.__loaded) {
    posthog.capture(event, properties);
  }

  if (window.gtag) {
    window.gtag("event", event, properties);
  }
}
