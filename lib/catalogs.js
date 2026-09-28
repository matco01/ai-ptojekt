// Which products each client's AI sells. TechMarket uses its built-in demo data; every other
// client gets its products from its feed (feed_url), refreshed every few hours. The parsed feed is
// kept in memory and in the Supabase "catalogs" table, so a fresh serverless instance doesn't have
// to download a large feed again.
import { techmarket, createCatalog } from "./catalog.js";
import { parseFeed } from "./feed.js";
import { db } from "./db.js";

const TTL = 6 * 3600e3;
const MAX_FEED_BYTES = 60e6;
const cache = new Map(); // clientId → { at, catalog, status, loading }

const storeFor = (client) => ({
  name: client.name,
  description: client.description || "e-shop",
  welcome: client.welcome || null,
  info: client.info ?? {},
  freeShippingFrom: client.freeShippingFrom ?? null,
  currency: "Kč",
});

async function fetchFeed(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "AI-prodavac-feed/1.0" } });
  if (!r.ok) throw new Error(`Feed vrátil HTTP ${r.status}`);
  if (Number(r.headers.get("content-length")) > MAX_FEED_BYTES) throw new Error("Feed je větší než 60 MB.");
  return r.text();
}

async function readStored(clientId) {
  if (!db) return null;
  const { data, error } = await db.from("catalogs").select("data, updated_at, error").eq("client_id", clientId).maybeSingle();
  if (error) { console.error("catalog read failed:", error.message); return null; }
  return data ? { data: data.data, at: Date.parse(data.updated_at), error: data.error } : null;
}

async function saveStored(clientId, data, error) {
  if (!db) return;
  const row = { client_id: clientId, updated_at: new Date().toISOString(), error: error ?? null };
  if (data) Object.assign(row, { data, product_count: data.products.length });
  const { error: e } = await db.from("catalogs").upsert(row);
  if (e) console.error("catalog save failed:", e.message);
}

async function load(client, refresh) {
  if (client.feedXml) {
    const data = parseFeed(client.feedXml);
    return { data, status: { source: "feed", products: data.products.length, updatedAt: Date.now(), error: null } };
  }
  if (!client.feedUrl) return { data: { categories: [], products: [] }, status: { source: "none", products: 0, updatedAt: null, error: null } };

  const stored = await readStored(client.id);
  if (!refresh && stored?.data && Date.now() - stored.at < TTL) {
    return { data: stored.data, status: { source: "feed", products: stored.data.products.length, updatedAt: stored.at, error: stored.error } };
  }
  try {
    const data = parseFeed(await fetchFeed(client.feedUrl));
    if (!data.products.length) throw new Error("Ve feedu nejsou žádné produkty s názvem a cenou.");
    await saveStored(client.id, data, null);
    return { data, status: { source: "feed", products: data.products.length, updatedAt: Date.now(), error: null } };
  } catch (err) {
    // keep selling from the last good catalog rather than going empty
    console.error(`feed ${client.id}:`, err.message);
    await saveStored(client.id, null, err.message);
    const data = stored?.data ?? { categories: [], products: [] };
    return { data, status: { source: "feed", products: data.products.length, updatedAt: stored?.at ?? null, error: err.message } };
  }
}

/** The client's catalog. Its store info always reflects the client's current settings. */
export async function getCatalog(client, { refresh = false } = {}) {
  if (client.catalog === "techmarket") return techmarket;
  let entry = cache.get(client.id);
  const fresh = entry?.catalog && Date.now() - entry.at < TTL && entry.feedUrl === client.feedUrl;
  if (refresh || !fresh) {
    if (!entry) cache.set(client.id, (entry = {})); // registered first, so concurrent requests share one download
    entry.loading ??= load(client, refresh).then(({ data, status }) => {
      Object.assign(entry, { at: Date.now(), feedUrl: client.feedUrl, catalog: createCatalog({ ...data, store: storeFor(client) }), status });
    }).finally(() => { entry.loading = null; });
    await entry.loading;
  }
  entry.catalog.store = storeFor(client);
  return entry.catalog;
}

export function catalogStatus(client) {
  if (client.catalog === "techmarket") return { source: "demo", products: techmarket.products.length, updatedAt: null, error: null };
  return cache.get(client.id)?.status ?? null;
}
