import "./lib/env.js"; // must stay first: loads .env / .env.local
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { store, categories, products, related, activePromotions, getProduct, priceCart } from "./lib/catalog.js";
import { productSvg } from "./lib/images.js";
import { record, summarize, seedDemo, reset, EVENT_TYPES, NUDGE_LABELS } from "./lib/analytics.js";
import { chat, generateInsights, writeHesitationOffer, inventAgentName, ChatError, MODEL, hasApiKey } from "./lib/assistant.js";
import { personaName } from "./lib/persona.js";
import { ttsProvider, streamSpeech } from "./lib/tts.js";
import { greeting, nextNudge } from "./lib/proactive.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // optional protection for the dashboard API

app.use(express.json({ limit: "20kb" }));

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

const validSession = (id) => typeof id === "string" && /^[\w-]{8,80}$/.test(id);
const PAGE_TYPES = new Set(["home", "category", "product", "cart", "search", "other"]);
const str = (v, max) => String(v ?? "").slice(0, max);

/** Behaviour signals sent by the widget – never trust them, only keep known shapes. */
function cleanSignals(raw = {}) {
  const ids = (arr, n) => (Array.isArray(arr) ? arr : []).filter((id) => getProduct(id)).slice(-n);
  return {
    mode: raw.mode === "voice" ? "voice" : "chat",
    pageType: PAGE_TYPES.has(raw.pageType) ? raw.pageType : "other",
    category: categories.some((c) => c.id === raw.category) ? raw.category : null,
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
    brand: raw.brand ? str(raw.brand, 40) : null,
    // the conversation so far as the widget saw it (text only) – lets any server instance continue it
    history: (Array.isArray(raw.history) ? raw.history : []).slice(-12)
      .filter((h) => (h?.role === "user" || h?.role === "assistant") && typeof h.text === "string" && h.text.trim())
      .map((h) => ({ role: h.role, text: h.text.slice(0, 2000) })),
    agentName: /^\p{L}{2,12}$/u.test(raw.agentName ?? "") ? raw.agentName : null, // the name the widget gave the agent on this site
    behaviour: cleanBehaviour(raw.behaviour),
  };
}

/** How the customer behaves on the current page (collected by the widget). */
function cleanBehaviour(b = {}) {
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
app.get("/api/health", (req, res) => res.json({ ok: true, model: MODEL, hasApiKey: hasApiKey(), tts: ttsProvider() }));

// The agent's name on a given website – invented once per brand and remembered.
app.post("/api/persona", rateLimit(20, 60e3), async (req, res) => {
  const brand = str(req.body?.brand, 60).trim();
  if (!brand) return res.status(400).json({ error: "brand is required" });
  const about = str(req.body?.about, 160).trim(); // what the site is about (its description) – helps the name fit
  res.json({ name: await personaName(brand, inventAgentName, about), tts: ttsProvider() });
});

// Natural voice (ElevenLabs). 404 when not configured → the widget uses the browser voice.
app.post("/api/tts", rateLimit(120, 60e3), async (req, res) => {
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

app.get("/api/catalog", (req, res) => {
  res.json({ store: { name: store.name, tagline: store.tagline, assistantName: store.assistantName, freeShippingFrom: store.freeShippingFrom }, categories, products, related, promotions: activePromotions() });
});

app.get("/api/img/:id.svg", (req, res) => {
  const svg = productSvg(req.params.id);
  if (!svg) return res.sendStatus(404);
  res.set({ "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" }).send(svg);
});

app.post("/api/cart/price", (req, res) => res.json(priceCart(cleanSignals({ cart: req.body?.cart }).cart)));

// Greeting on arrival + behaviour-based tips. Rule-based: instant and free.
app.post("/api/proactive", rateLimit(60, 60e3), async (req, res) => {
  const { sessionId, trigger, signals } = req.body ?? {};
  if (!validSession(sessionId)) return res.status(400).json({ error: "Neplatná session." });
  const s = cleanSignals(signals);
  if (trigger === "greeting") return res.json({ greeting: greeting(s) });
  const nudge = nextNudge(s);
  if (nudge?.hesitation) {
    // a stuck customer gets an offer written for their exact situation
    nudge.text = await writeHesitationOffer({ ...nudge.hesitation, declined: s.declined, fallback: nudge.text });
    delete nudge.hesitation;
  }
  res.json({ nudge });
});

app.post("/api/chat", rateLimit(30, 5 * 60e3), async (req, res) => {
  const { sessionId, text, context } = req.body ?? {};
  if (!validSession(sessionId)) return res.status(400).json({ error: "Neplatná session." });

  res.set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const send = (obj) => { if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(obj)}\n\n`); };
  // customer interrupted (closed the stream) → stop generating the rest of the answer
  const abort = new AbortController();
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });

  try {
    await chat({ sessionId, text, context: cleanSignals(context), send, signal: abort.signal });
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

app.post("/api/events", rateLimit(120, 60e3), (req, res) => {
  const { sessionId, events } = req.body ?? {};
  if (!validSession(sessionId) || !Array.isArray(events)) return res.status(400).json({ error: "bad request" });
  for (const e of events.slice(0, 50)) {
    // chat messages and AI recommendations are recorded server-side only
    if (!EVENT_TYPES.has(e?.type) || ["chat_message", "ai_recommended"].includes(e.type)) continue;
    if (e.type === "add_to_cart" && e.source === "ai") continue;
    const clean = { type: e.type, sessionId, ts: Date.now() };
    if (e.productId && getProduct(e.productId)) clean.productId = e.productId;
    if (e.category) clean.category = str(e.category, 30);
    if (e.mode) clean.mode = e.mode === "voice" ? "voice" : "chat";
    if (e.type === "tab_view") clean.tab = str(e.tab, 20);
    if (e.type === "search") { clean.query = str(e.query, 60); clean.results = Math.max(0, Number(e.results) || 0); }
    if (e.type.startsWith("nudge_")) { if (!(e.kind in NUDGE_LABELS)) continue; clean.kind = e.kind; }
    // "ai_card" = customer clicked "add to cart" on a card the AI recommended
    if (e.type === "add_to_cart") { clean.source = e.source === "ai_card" ? "ai" : "user"; clean.quantity = Math.min(Number(e.quantity) || 1, 99); }
    if (e.type === "purchase") clean.value = Math.max(0, Math.min(Number(e.value) || 0, 1e6));
    record(clean);
  }
  res.json({ ok: true });
});

// --- owner dashboard API ----------------------------------------------------
const admin = (req, res, next) =>
  !ADMIN_TOKEN || req.get("X-Admin-Token") === ADMIN_TOKEN ? next() : res.status(401).json({ error: "unauthorized" });

app.get("/api/analytics", admin, (req, res) => res.json(summarize()));
app.post("/api/analytics/seed", admin, (req, res) => { seedDemo(); res.json({ ok: true }); });
app.post("/api/analytics/reset", admin, (req, res) => { reset(); res.json({ ok: true }); });
app.post("/api/analytics/insights", admin, rateLimit(10, 10 * 60e3), async (req, res) => {
  if (!hasApiKey()) return res.status(503).json({ error: "Doporučení generuje Claude – nastavte ANTHROPIC_API_KEY v souboru .env." });
  try {
    res.json({ markdown: await generateInsights(summarize()) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Analýzu se nepodařilo vygenerovat." });
  }
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
});
