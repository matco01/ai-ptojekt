// AI usage per client and month: counts customer messages, Claude tokens (→ cost) and voice characters,
// and tells whether a client is still within its plan. Stored in the "usage" table
// (in memory without a database – enough for local development).
import { db, query } from "./db.js";
import { limitsFor } from "./plans.js";
import { alert } from "./alerts.js";

// USD per million tokens (https://platform.claude.com/docs/en/about-claude/pricing)
const PRICES = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  // prompts up to 100k tokens; longer ones cost 5× more, which the salesperson never sends
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};
const priceOf = (model) => PRICES[model] ?? PRICES["claude-sonnet-5-5"]; // unknown model → count it as the dearer one

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

const EMPTY = { messages: 0, ai_calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, tts_chars: 0, cost_usd: 0 };
const mem = new Map(); // `${clientId}:${month}` → row
const cache = new Map(); // short-lived read cache, so a busy chat doesn't query usage on every message

const num = (row) => Object.fromEntries(Object.entries({ ...EMPTY, ...row }).map(([k, v]) => [k, k === "client_id" || k === "month" ? v : Number(v) || 0]));

export async function getUsage(clientId, month = monthKey()) {
  const key = `${clientId}:${month}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10e3) return hit.row;
  let row;
  if (db) {
    row = num((await query("select * from usage where client_id = $1 and month = $2", [clientId, month]))[0] ?? {});
  } else row = num(mem.get(key) ?? {});
  cache.set(key, { at: Date.now(), row });
  return row;
}

/** Cost in USD of one Claude response's `usage`. */
export function costOf(model, u = {}) {
  const p = priceOf(model);
  return ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output
    + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6;
}

/**
 * Adds usage for a client. `claude` = the `usage` objects of Claude responses (one per AI call).
 * Never throws – metering must not break a customer's conversation.
 */
export async function recordUsage(client, { messages = 0, claude = [], model = null, ttsChars = 0 } = {}) {
  const calls = (Array.isArray(claude) ? claude : [claude]).filter(Boolean);
  const sum = (k) => calls.reduce((a, u) => a + (u[k] ?? 0), 0);
  const add = {
    messages, ai_calls: calls.length,
    input_tokens: sum("input_tokens"), output_tokens: sum("output_tokens"),
    cache_read_tokens: sum("cache_read_input_tokens"), cache_write_tokens: sum("cache_creation_input_tokens"),
    tts_chars: ttsChars, cost_usd: calls.reduce((a, u) => a + costOf(model, u), 0),
  };
  if (!Object.values(add).some(Boolean)) return;
  const month = monthKey();
  const key = `${client.id}:${month}`;
  try {
    let row;
    if (db) {
      [row] = await query("select * from add_usage($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [
        client.id, month, add.messages, add.ai_calls, add.input_tokens, add.output_tokens,
        add.cache_read_tokens, add.cache_write_tokens, add.tts_chars, add.cost_usd,
      ]);
      row = num(row);
    } else {
      const prev = num(mem.get(key) ?? {});
      row = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, prev[k] + add[k]]));
      mem.set(key, row);
    }
    cache.set(key, { at: Date.now(), row });
    if (messages) await warnNearLimit(client, row, month);
  } catch (err) {
    console.error("usage write failed:", err.message);
  }
}

async function warnNearLimit(client, row, month) {
  const { messages: limit } = limitsFor(client);
  if (!limit) return;
  const used = row.messages / limit;
  const month31 = 31 * 24 * 3600e3;
  if (used >= 1) await alert(`limit100:${client.id}:${month}`, `${client.name} (${client.id}) vyčerpal měsíční limit ${limit} zpráv – prodavačka se na jeho webu vypnula do příštího měsíce (nebo do vyššího tarifu).`, { everyMs: month31 });
  else if (used >= 0.8) await alert(`limit80:${client.id}:${month}`, `${client.name} (${client.id}) má za sebou ${Math.round(used * 100)} % měsíčního limitu (${row.messages}/${limit} zpráv).`, { everyMs: month31 });
}

/** What the client may still use this month. On a database error the client is let through. */
export async function allowance(client) {
  const limits = limitsFor(client);
  try {
    const u = await getUsage(client.id);
    return { chat: u.messages < limits.messages, tts: u.tts_chars < limits.ttsChars, usage: u, limits };
  } catch (err) {
    console.error("usage read failed:", err.message);
    return { chat: true, tts: true, usage: num({}), limits };
  }
}

/** Every client's usage for a month (internal admin page, invoicing export). */
export async function usageForMonth(month = monthKey()) {
  if (db) {
    return (await query("select * from usage where month = $1", [month])).map(num);
  }
  return [...mem.entries()].filter(([k]) => k.endsWith(`:${month}`)).map(([k, row]) => num({ ...row, client_id: k.split(":")[0], month }));
}
