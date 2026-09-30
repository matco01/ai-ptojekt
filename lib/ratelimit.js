// Request limits. With Supabase the counters are shared by every server instance (on Vercel each
// instance would otherwise count on its own); without it, or if the database call fails, they are
// counted in memory.
import { db } from "./db.js";

const mem = new Map(); // key → { start, count }
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of mem) if (v.expires < now) mem.delete(k);
}, 60e3).unref();

function memHit(key, windowMs, max) {
  const now = Date.now();
  let v = mem.get(key);
  if (!v || v.start <= now - windowMs) mem.set(key, (v = { start: now, count: 0, expires: now + windowMs }));
  return ++v.count <= max;
}

/** Counts one hit for `key` in a fixed window of `windowMs`; true = still within `max`. */
export async function hit(key, windowMs, max, { shared = true } = {}) {
  if (shared && db) {
    const { data, error } = await db.rpc("hit_rate_limit", { p_key: key, p_window_ms: windowMs, p_max: max });
    if (!error) return data === true;
    console.error("rate limit check failed:", error.message);
  }
  return memHit(key, windowMs, max);
}

/** True the first time it is called for `key` within `windowMs` – "do this at most once per …". */
export const once = (key, windowMs) => hit(`once:${key}`, windowMs, 1);

/**
 * Express middleware. `shared` = count across all instances (costs one database call per request,
 * so it is used for the endpoints that cost money: AI, voice, logins).
 */
export function rateLimit(name, max, windowMs, { shared = false, key = (req) => req.ip } = {}) {
  return async (req, res, next) => {
    try {
      if (await hit(`${name}:${key(req)}`, windowMs, max, { shared })) return next();
    } catch (err) {
      console.error("rate limit:", err.message);
      return next(); // a broken limiter must not take the shop down
    }
    res.status(429).json({ error: "Příliš mnoho požadavků, zkuste to prosím za chvíli." });
  };
}
