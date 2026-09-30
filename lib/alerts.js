// Alerts for us (the operator): server errors, broken feeds, clients reaching their limits.
// Posted to ALERT_WEBHOOK_URL – a Slack or Discord incoming webhook (both formats are sent).
// The same alert is sent at most once per `everyMs`, across all server instances.
import { once } from "./ratelimit.js";

export async function alert(key, text, { everyMs = 3600e3 } = {}) {
  console.error(`[alert] ${text}`);
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    if (!(await once(`alert:${key}`, everyMs))) return;
    const message = `AI prodavač: ${text}`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, content: message.slice(0, 1900) }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error("alert failed:", err.message);
  }
}
