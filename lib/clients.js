// The shops that use the AI salesperson. Each embed says which client it belongs to
// (<script src=".../prodavac.js" data-client="id">); the server scopes data and settings by it.
// New clients are added as rows in the Supabase "clients" table (see supabase/schema.sql).
import { db } from "./db.js";

export const DEFAULT_CLIENT = "techmarket";

// the two showcase sites – always available, even without a database
const BUILT_IN = [
  { id: "techmarket", name: "TechMarket", domains: [], agentName: null, adminToken: null, active: true },
  { id: "kavarna", name: "Bohème", domains: [], agentName: null, adminToken: null, active: true },
];

const fromRow = (r) => ({
  id: r.id, name: r.name, domains: r.domains ?? [], agentName: r.agent_name || null,
  adminToken: r.admin_token || null, active: r.active !== false,
});

let cache = { at: 0, map: null };

async function all() {
  if (cache.map && Date.now() - cache.at < 60e3) return cache.map;
  const map = new Map(BUILT_IN.map((c) => [c.id, c]));
  if (db) {
    const { data, error } = await db.from("clients").select("*");
    if (error) console.error("clients load failed:", error.message);
    for (const r of data ?? []) map.set(r.id, fromRow(r));
  }
  cache = { at: Date.now(), map };
  return map;
}

export async function getClient(id) {
  const c = (await all()).get(String(id || DEFAULT_CLIENT));
  return c?.active ? c : null;
}

export async function listClients() {
  return [...(await all()).values()].map(({ id, name, active }) => ({ id, name, active }));
}

/** A client's widget may only be used on its own domains (and always on our own showcase host). */
export function originAllowed(client, origin, ownHost) {
  if (!origin) return true; // same-origin requests and sendBeacon without Origin
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  if (host === ownHost?.split(":")[0] || host === "localhost" || host === "127.0.0.1") return true;
  return client.domains.some((d) => host === d || host.endsWith("." + d));
}
