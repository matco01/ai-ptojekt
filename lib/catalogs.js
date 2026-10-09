// Which products each client's AI sells. TechMarket uses its built-in demo data; every other
// client gets its products from its feed (feed_url), refreshed every few hours. The parsed feed is
// kept in memory, and gzipped in the private Supabase Storage bucket "catalogs", so a fresh
// serverless instance loads a few MB instead of downloading and parsing a large feed again.
import zlib from "node:zlib";
import { promisify } from "node:util";
import { techmarket, techmarketEn, createCatalog } from "./catalog.js";
import { parseFeed } from "./feed.js";
import { db } from "./db.js";
import { alert } from "./alerts.js";

const gzip = promisify(zlib.gzip), gunzip = promisify(zlib.gunzip);
const TTL = 6 * 3600e3;
export const MAX_FEED_BYTES = 60e6;
const BUCKET = "catalogs";
const cache = new Map(); // clientId → { at, catalog, status, loading }

const storeFor = (client, lang = "cs") => ({
  name: client.name,
  description: (lang === "en" && client.descriptionEn) || client.description || "e-shop",
  welcome: client.welcome || null,
  welcomeEn: client.welcomeEn || null,
  info: (lang === "en" && client.infoEn) || client.info || {},
  freeShippingFrom: client.freeShippingFrom ?? null,
  currency: "Kč",
});

/** Downloads a feed, giving up once it passes `maxBytes` – whether or not the server announced its size. */
export async function fetchFeed(url, { maxBytes = MAX_FEED_BYTES, timeoutMs = 60000 } = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "AI-prodavac-feed/1.0" } });
  if (!r.ok) throw new Error(`Feed vrátil HTTP ${r.status}`);
  const tooBig = () => new Error(`Feed je větší než ${Math.round(maxBytes / 1e6)} MB.`);
  if (Number(r.headers.get("content-length")) > maxBytes) { await r.body?.cancel(); throw tooBig(); }
  const chunks = [];
  let size = 0;
  for await (const chunk of r.body) {
    size += chunk.length;
    if (size > maxBytes) { await r.body.cancel?.().catch(() => {}); throw tooBig(); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readStored(clientId) {
  if (!db) return null;
  const { data: row, error } = await db.from("catalogs").select("updated_at, stored_at, error, product_count").eq("client_id", clientId).maybeSingle();
  if (error) { console.error("catalog read failed:", error.message); return null; }
  if (!row) return null;
  let data = null;
  if (row.stored_at) {
    const { data: blob, error: e } = await db.storage.from(BUCKET).download(`${clientId}.json.gz`);
    if (e) console.error("catalog download failed:", e.message);
    else data = JSON.parse((await gunzip(Buffer.from(await blob.arrayBuffer()))).toString());
  } else {
    // written by an older version: products inline in the row – read once, moved to Storage on the next save
    const { data: legacy } = await db.from("catalogs").select("data").eq("client_id", clientId).maybeSingle();
    data = legacy?.data ?? null;
  }
  return { data, at: Date.parse(row.stored_at ?? row.updated_at), error: row.error };
}

async function saveStored(clientId, data, error) {
  if (!db) return;
  const row = { client_id: clientId, updated_at: new Date().toISOString(), error: error ?? null };
  if (data) {
    const { error: e } = await db.storage.from(BUCKET)
      .upload(`${clientId}.json.gz`, await gzip(JSON.stringify(data)), { contentType: "application/gzip", upsert: true });
    if (e) console.error("catalog upload failed:", e.message);
    else Object.assign(row, { data: null, stored_at: row.updated_at, product_count: data.products.length });
  }
  const { error: e } = await db.from("catalogs").upsert(row);
  if (e) console.error("catalog save failed:", e.message);
}

async function load(client, refresh, lang = "cs") {
  if (client.feedXml) {
    const data = parseFeed((lang === "en" && client.feedXmlEn) || client.feedXml);
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
    await saveStored(client.id, null, err.message);
    const data = stored?.data ?? { categories: [], products: [] };
    await alert(`feed:${client.id}`, `Feed klienta ${client.name} (${client.id}) se nepodařilo stáhnout: ${err.message}${data.products.length ? " – jede se na předchozím katalogu." : " – AI nezná žádné produkty!"}`, { everyMs: 12 * 3600e3 });
    return { data, status: { source: "feed", products: data.products.length, updatedAt: stored?.at ?? null, error: err.message } };
  }
}

/** The client's catalog. Its store info always reflects the client's current settings. */
export async function getCatalog(client, { refresh = false, lang = "cs" } = {}) {
  if (client.catalog === "techmarket") return lang === "en" ? techmarketEn : techmarket;
  // a shop with its own English data (our demo café) gets an English catalog; others use theirs as is
  const en = lang === "en" && client.feedXmlEn;
  const key = en ? `${client.id}:en` : client.id;
  let entry = cache.get(key);
  const fresh = entry?.catalog && Date.now() - entry.at < TTL && entry.feedUrl === client.feedUrl;
  if (refresh || !fresh) {
    if (!entry) cache.set(key, (entry = {})); // registered first, so concurrent requests share one download
    entry.loading ??= load(client, refresh, en ? "en" : "cs").then(({ data, status }) => {
      Object.assign(entry, { at: Date.now(), feedUrl: client.feedUrl, catalog: createCatalog({ ...data, store: storeFor(client, en ? "en" : "cs") }), status });
    }).finally(() => { entry.loading = null; });
    await entry.loading;
  }
  entry.catalog.store = storeFor(client, en ? "en" : "cs");
  return entry.catalog;
}

export function catalogStatus(client) {
  if (client.catalog === "techmarket") return { source: "demo", products: techmarket.products.length, updatedAt: null, error: null };
  return cache.get(client.id)?.status ?? null;
}

/** Feed state of every client as stored in the database (internal admin page). */
export async function storedStatuses() {
  if (!db) return new Map();
  const { data, error } = await db.from("catalogs").select("client_id, product_count, error, updated_at, stored_at");
  if (error) { console.error("catalog statuses failed:", error.message); return new Map(); }
  return new Map(data.map((r) => [r.client_id, { products: r.product_count, error: r.error, updatedAt: r.stored_at ?? r.updated_at, checkedAt: r.updated_at }]));
}
