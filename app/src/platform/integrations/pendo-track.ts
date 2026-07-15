/**
 * Server-side Pendo Track Event helper.
 *
 * Sends track events to the Pendo data API. Failures are logged but
 * never break application flow — tracking is fire-and-forget.
 */

const PENDO_TRACK_URL = "https://data.pendo.io/data/track";
const PENDO_INTEGRATION_KEY = "6b087a0d-5ddc-4e15-9bf5-53cd7441d0e6";

export function pendoTrack(
  event: string,
  opts: {
    visitorId?: string;
    accountId?: string;
    properties?: Record<string, unknown>;
  } = {},
) {
  const body = JSON.stringify({
    type: "track",
    event,
    visitorId: opts.visitorId ?? "system",
    accountId: opts.accountId ?? "system",
    timestamp: Date.now(),
    properties: opts.properties ?? {},
  });

  fetch(PENDO_TRACK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pendo-integration-key": PENDO_INTEGRATION_KEY,
    },
    body,
  }).catch(() => {
    // Tracking must never break application flow
  });
}
