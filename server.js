import "./lib/env.js"; // must stay first: loads .env / .env.local
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { techmarket } from "./lib/catalog.js";
import { getCatalog, catalogStatus } from "./lib/catalogs.js";
import { productSvg } from "./lib/images.js";
import { feedXml as kavarnaFeed, kavarnaSvg } from "./catalog/kavarna.js";
import { recordMany, summarize, seedDemo, reset, EVENT_TYPES, NUDGE_LABELS } from "./lib/analytics.js";
import { chat, generateInsights, writeHesitationOffer, ChatError, MODEL, hasApiKey } from "./lib/assistant.js";
import { personaName } from "./lib/persona.js";
import { getClient, listClients, originAllowed } from "./lib/clients.js";
import { db } from "./lib/db.js";
import { ttsProvider, streamSpeech } from "./lib/tts.js";
import { greeting, nextNudge } from "./lib/proactive.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // optional protection for the dashboard API

app.use(express.json({ limit: "20kb" }));
// the widget's analytics beacons arrive as text/plain (see flush() in the widget) – JSON inside
app.use("/api/events", express.text({ type: "text/plain", limit: "20kb" }), (req, res, next) => {
  if (typeof req.body === "string") { try { req.body = JSON.parse(req.body); } catch { req.body = {}; } }
  next();
});

// The widget is meant to be embedded on other domains → allow cross-origin API calls.
app.use("/api", (req, res, next) => {
  res.set("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// --- tiny in-memory rate limiter (per IP) -----------------------------------
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now();
    const arr = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (arr.length >= max) return res.status(429).json({ error: "Příliš mnoho požadavků, zkuste to prosím za chvíli." });
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}

// Which shop a widget request belongs to (the embed's data-client); rejected on foreign domains.
async function withClient(req, res, next) {
  const client = await getClient(req.body?.client ?? req.query.client);
  if (!client) return res.status(404).json({ error: "Neznámý klient." });
  if (!originAllowed(client, req.get("Origin"), req.get("Host"))) return res.status(403).json({ error: "Tento web nemá povolený přístup." });
  req.client = client;
  req.cat = await getCatalog(client);
  next();
}

const validSession = (id) => typeof id === "string" && /^[\w-]{8,80}$/.test(id);
const PAGE_TYPES = new Set(["home", "category", "product", "cart", "search", "other"]);
const str = (v, max) => String(v ?? "").slice(0, max);

/** Behaviour signals sent by the widget – never trust them, only keep known shapes. */
function cleanSignals(raw = {}, cat) {
  const getProduct = cat.getProduct;
  const ids = (arr, n) => (Array.isArray(arr) ? arr : []).filter((id) => getProduct(id)).slice(-n);
  return {
    mode: raw.mode === "voice" ? "voice" : "chat",
    // "host" = the shop feeds us context through our JS API; "auto" = the widget reads the page itself
    integration: raw.integration === "auto" ? "auto" : "host",
    pageType: PAGE_TYPES.has(raw.pageType) ? raw.pageType : "other",
    category: cat.categories.some((c) => c.id === raw.category) ? raw.category : null,
    currentProductId: getProduct(raw.currentProductId) ? raw.currentProductId : null,
    viewedProductIds: ids(raw.viewedProductIds, 8),
    cart: (Array.isArray(raw.cart) ? raw.cart : []).filter((c) => getProduct(c?.id)).slice(0, 20)
      .map((c) => ({ id: c.id, quantity: Math.min(Math.max(1, Number(c.quantity) || 1), 99) })),
    searches: (Array.isArray(raw.searches) ? raw.searches : []).slice(-5)
      .map((s) => ({ q: str(s?.q, 60), results: Math.max(0, Number(s?.results) || 0) })).filter((s) => s.q),
    secondsOnPage: Math.min(Math.max(0, Number(raw.secondsOnPage) || 0), 3600),
    returning: Boolean(raw.returning),
    declined: Boolean(raw.declined),
    shown: (Array.isArray(raw.shown) ? raw.shown : []).map((x) => str(x, 80)).slice(0, 30),
    via: raw.via ? str(raw.via, 300) : null,
    // the conversation so far as the widget saw it (text only) – lets any server instance continue it
    history: (Array.isArray(raw.history) ? raw.history : []).slice(-12)
      .filter((h) => (h?.role === "user" || h?.role === "assistant") && typeof h.text === "string" && h.text.trim())
      .map((h) => ({ role: h.role, text: h.text.slice(0, 2000) })),
    behaviour: cleanBehaviour(raw.behaviour, getProduct),
  };
}

/** How the customer behaves on the current page (collected by the widget). */
function cleanBehaviour(b = {}, getProduct) {
  const n = (v, max) => Math.min(Math.max(0, Number(v) || 0), max);
  return {
    activeSec: n(b?.activeSec, 3600),      // time actively spent on this page
    idleSec: n(b?.idleSec, 3600),          // time since the last mouse / scroll / key input
    rereads: n(b?.rereads, 100),           // scrolled back up to read something again
    filterChanges: n(b?.filterChanges, 100),
    hoverAdd: n(b?.hoverAdd, 100),         // lingered over "add to cart" without clicking
    cartRemovals: n(b?.cartRemovals, 100),
    tabs: (Array.isArray(b?.tabs) ? b.tabs : []).map((t) => str(t, 20)).slice(0, 10),
    seq: (Array.isArray(b?.seq) ? b.seq : []).filter((id) => getProduct(id)).slice(-12), // product views in order, with repeats
  };
}

// --- public API -------------------------------------------------------------
app.get("/api/health", (req, res) => res.json({ ok: true, model: MODEL, hasApiKey: hasApiKey(), tts: ttsProvider(), storage: db ? "supabase" : "files" }));

const agentName = (client) => client.agentName || personaName(client.name);

// The agent's name for a shop – the client's configured name, or derived from the shop's name.
// Tied to the client, not to what a browser reads off the page, so every visitor gets the same one.
// Also hands the widget the client's integration overrides (e.g. which button is "add to cart").
app.post("/api/persona", rateLimit(20, 60e3), withClient, (req, res) => {
  res.json({ name: agentName(req.client), tts: ttsProvider(), integration: req.client.integration });
});

// Maps what a shop's page shows (product code, EAN, URL, name, category) to catalog products –
// how the widget knows where the customer is on shops that don't call our JS API.
app.post("/api/resolve", rateLimit(120, 60e3), withClient, (req, res) => {
  const refs = (Array.isArray(req.body?.refs) ? req.body.refs : []).slice(0, 20);
  const ids = refs.map((r) => req.cat.findProduct({
    id: str(r?.id, 120), sku: str(r?.sku, 120), gtin: str(r?.gtin, 40), url: str(r?.url, 600), name: str(r?.name, 200),
  })?.id ?? null);
  const categoryName = str(req.body?.categoryName, 120);
  res.json({
    ids,
    categories: ids.map((id) => req.cat.getProduct(id)?.category ?? null),
    category: categoryName ? req.cat.categoryByName(categoryName) : null,
  });
});

// Natural voice (ElevenLabs). 404 when not configured → the widget uses the browser voice.
app.post("/api/tts", rateLimit(120, 60e3), withClient, async (req, res) => {
  if (ttsProvider() !== "elevenlabs") return res.status(404).json({ error: "TTS not configured" });
  const text = str(req.body?.text, 600).trim();
  if (!text) return res.status(400).json({ error: "text is required" });
  const abort = new AbortController();
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });
  try {
    await streamSpeech(text, res, abort.signal);
  } catch (err) {
    if (abort.signal.aborted) return;
    console.error("TTS:", err.message);
    // pass "too busy" through, so the widget waits and retries instead of switching voices
    if (!res.headersSent) res.status(err.status === 429 ? 429 : 502).json({ error: "TTS failed" }); else res.end();
  }
});

// TechMarket demo shop's own data (public/shop.js renders the shop from it)
app.get("/api/catalog", (req, res) => {
  const { store, categories, products, related } = techmarket;
  res.json({ store: { name: store.name, tagline: store.tagline, freeShippingFrom: store.freeShippingFrom }, categories, products, related, promotions: techmarket.activePromotions() });
});

app.get("/api/img/:id.svg", (req, res) => {
  const svg = productSvg(req.params.id);
  if (!svg) return res.sendStatus(404);
  res.set({ "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" }).send(svg);
});

app.post("/api/cart/price", withClient, (req, res) => res.json(req.cat.priceCart(cleanSignals({ cart: req.body?.cart }, req.cat).cart)));

// Greeting on arrival + behaviour-based tips. Rule-based: instant and free.
app.post("/api/proactive", rateLimit(60, 60e3), withClient, async (req, res) => {
  const { sessionId, trigger, signals } = req.body ?? {};
  if (!validSession(sessionId)) return res.status(400).json({ error: "Neplatná session." });
  const s = { ...cleanSignals(signals, req.cat), agentName: agentName(req.client) };
  if (trigger === "greeting") return res.json({ greeting: greeting(s, req.cat) });
  const nudge = nextNudge(s, req.cat);
  if (nudge?.hesitation) {
    // a stuck customer gets an offer written for their exact situation
    nudge.text = await writeHesitationOffer({ ...nudge.hesitation, declined: s.declined, fallback: nudge.text, shopName: req.client.name });
    delete nudge.hesitation;
  }
  res.json({ nudge });
});

app.post("/api/chat", rateLimit(30, 5 * 60e3), withClient, async (req, res) => {
  const { sessionId, text, context } = req.body ?? {};
  if (!validSession(sessionId)) return res.status(400).json({ error: "Neplatná session." });

  res.set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const send = (obj) => { if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(obj)}\n\n`); };
  // customer interrupted (closed the stream) → stop generating the rest of the answer
  const abort = new AbortController();
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });

  try {
    await chat({ sessionId, text, context: { ...cleanSignals(context, req.cat), clientId: req.client.id, agentName: agentName(req.client) }, send, signal: abort.signal, catalog: req.cat });
    send({ type: "done" });
  } catch (err) {
    if (abort.signal.aborted) return; // nobody is listening any more
    let message = "Omlouvám se, něco se pokazilo. Zkuste to prosím znovu.";
    if (err instanceof ChatError) message = err.message;
    else if (err instanceof Anthropic.AuthenticationError) message = "AI není správně nakonfigurovaná (neplatný ANTHROPIC_API_KEY).";
    else if (err instanceof Anthropic.RateLimitError) message = "AI je momentálně přetížená, zkuste to prosím za chvíli.";
    else if (err instanceof Anthropic.APIError) console.error(`Claude API error ${err.status}:`, err.message);
    else console.error(err);
    send({ type: "error", message });
  }
  res.end();
});

app.post("/api/events", rateLimit(120, 60e3), withClient, async (req, res) => {
  const { sessionId, events } = req.body ?? {};
  if (!validSession(sessionId) || !Array.isArray(events)) return res.status(400).json({ error: "bad request" });
  const batch = [];
  for (const e of events.slice(0, 50)) {
    // chat messages and AI recommendations are recorded server-side only
    if (!EVENT_TYPES.has(e?.type) || ["chat_message", "ai_recommended"].includes(e.type)) continue;
    if (e.type === "add_to_cart" && e.source === "ai") continue;
    const clean = { type: e.type, clientId: req.client.id, sessionId, ts: Date.now() };
    if (e.productId && req.cat.getProduct(e.productId)) clean.productId = e.productId;
    if (e.category) clean.category = str(e.category, 30);
    if (e.mode) clean.mode = e.mode === "voice" ? "voice" : "chat";
    if (e.type === "tab_view") clean.tab = str(e.tab, 20);
    if (e.type === "search") { clean.query = str(e.query, 60); clean.results = Math.max(0, Number(e.results) || 0); }
    if (e.type.startsWith("nudge_")) { if (!(e.kind in NUDGE_LABELS)) continue; clean.kind = e.kind; }
    // "ai_card" = customer clicked "add to cart" on a card the AI recommended
    if (e.type === "add_to_cart") { clean.source = e.source === "ai_card" ? "ai" : "user"; clean.quantity = Math.min(Number(e.quantity) || 1, 99); }
    if (e.type === "purchase") clean.value = Math.max(0, Math.min(Number(e.value) || 0, 1e6));
    batch.push(clean);
  }
  await recordMany(batch); // awaited: serverless hosts may freeze the function right after the response
  res.json({ ok: true });
});

// --- owner dashboard API ----------------------------------------------------
// ADMIN_TOKEN (env) = your master password for every client; a client's own admin_token opens only its dashboard.
// With neither set, the dashboard is open (local development).
async function admin(req, res, next) {
  const client = await getClient(req.query.client);
  if (!client) return res.status(404).json({ error: "Neznámý klient." });
  const token = req.get("X-Admin-Token") || "";
  const master = Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
  const open = !ADMIN_TOKEN && !client.adminToken;
  if (!master && !open && !(client.adminToken && token === client.adminToken)) return res.status(401).json({ error: "unauthorized" });
  req.client = client;
  req.isMaster = master || open;
  req.cat = await getCatalog(client);
  next();
}

const fail = (res, err) => { console.error(err); res.status(500).json({ error: "Operace se nepodařila." }); };

app.get("/api/analytics", admin, async (req, res) => {
  try {
    const stats = await summarize(req.client.id, req.cat);
    res.json({
      ...stats,
      client: { id: req.client.id, name: req.client.name },
      catalog: catalogStatus(req.client),
      clients: req.isMaster ? await listClients() : null,
    });
  } catch (err) { fail(res, err); }
});
// downloads the client's feed again right now (normally every 6 hours)
app.post("/api/analytics/catalog", admin, rateLimit(6, 10 * 60e3), async (req, res) => {
  try { await getCatalog(req.client, { refresh: true }); res.json(catalogStatus(req.client)); } catch (err) { fail(res, err); }
});
app.post("/api/analytics/seed", admin, async (req, res) => {
  try { await seedDemo(req.client.id, req.cat); res.json({ ok: true }); } catch (err) { fail(res, err); }
});
app.post("/api/analytics/reset", admin, async (req, res) => {
  try { await reset(req.client.id); res.json({ ok: true }); } catch (err) { fail(res, err); }
});
app.post("/api/analytics/insights", admin, rateLimit(10, 10 * 60e3), async (req, res) => {
  if (!hasApiKey()) return res.status(503).json({ error: "Doporučení generuje Claude – nastavte ANTHROPIC_API_KEY v souboru .env." });
  try {
    res.json({ markdown: await generateInsights(await summarize(req.client.id, req.cat), req.cat) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Analýzu se nepodařilo vygenerovat." });
  }
});

// short link to the second demo site, so it's not just the raw file path
app.get("/kavarna", (req, res) => res.sendFile(path.join(here, "public", "demo", "kavarna.html")));
// the café's product feed (what a real client hands over) and its product pictures
app.get("/demo/kavarna-feed.xml", (req, res) => res.type("application/xml").send(kavarnaFeed));
app.get("/demo/kavarna/img/:id.svg", (req, res) => {
  const svg = kavarnaSvg(req.params.id);
  if (!svg) return res.sendStatus(404);
  res.set({ "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" }).send(svg);
});

// --- static files: everything in public/ at the same path ------------------
// (mirrors Vercel, which serves public/** from its CDN and ignores express.static):
//   /  → the demo shop · /admin/ → dashboard · /widget/prodavac.js · /demo/kavarna.html
app.use(express.static(path.join(here, "public")));

app.listen(PORT, () => {
  console.log(`AI prodavač běží:`);
  console.log(`  Demo e-shop:  http://localhost:${PORT}/`);
  console.log(`  Dashboard:    http://localhost:${PORT}/admin/`);
  console.log(hasApiKey() ? `  Model:        ${MODEL}` : `  Režim:        bez AI (ANTHROPIC_API_KEY není nastaven) – chat odpovídá zjednodušeně`);
  console.log(`  Data:         ${db ? "Supabase" : "lokální soubory (SUPABASE_URL / SUPABASE_SECRET_KEY nejsou nastaveny)"}`);
});
