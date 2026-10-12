import "./lib/env.js"; // must stay first: loads .env / .env.local
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { techmarket, techmarketEn } from "./lib/catalog.js";
import { getCatalog, catalogStatus, storedStatuses } from "./lib/catalogs.js";
import { productSvg } from "./lib/images.js";
import { feedXml as kavarnaFeed, kavarnaSvg } from "./catalog/kavarna.js";
import { recordMany, summarize, purgeOld, EVENT_TYPES, NUDGE_LABELS, RETENTION_DAYS } from "./lib/analytics.js";
import { chat, generateInsights, writeHesitationOffer, ChatError, MODEL, hasApiKey } from "./lib/assistant.js";
import { personaName } from "./lib/persona.js";
import {
  getClient, listClients, originAllowed, validateClient, saveClient, setPasswordHash, setClientPlan, isBuiltIn,
  normalizeDomain, createSignedUpClient, setOwnerSettings,
} from "./lib/clients.js";
import { startPayment, billingPortal, handleWebhook, paymentsEnabled, simulated } from "./lib/billing.js";
import { db } from "./lib/db.js";
import { ttsProvider, streamSpeech } from "./lib/tts.js";
import { greeting, nextNudge } from "./lib/proactive.js";
import { rateLimit, hit } from "./lib/ratelimit.js";
import { recordUsage, allowance, usageForMonth, monthKey } from "./lib/usage.js";
import { limitsFor, PLANS, publicPlans } from "./lib/plans.js";
import { alert } from "./lib/alerts.js";
import {
  MASTER, isProduction, hashPassword, verifyPassword, safeEqual, generatePassword, demoPassword,
  createSession, readSession, sessionCookie, readCookie,
} from "./lib/auth.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // our master password (login ID "admin")

// Vercel sets X-Forwarded-For itself (clients can't spoof it there), so req.ip is the visitor's IP.
app.set("trust proxy", process.env.VERCEL ? true : "loopback");
// Stripe's payment notifications: the signature is checked against the exact raw body (see lib/billing.js)
app.post("/api/stripe/webhook", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  try {
    await handleWebhook(req.body, req.get("Stripe-Signature"));
    res.json({ received: true });
  } catch (err) {
    if (!err.status) { console.error("stripe webhook:", err); alert("stripe-webhook", `Stripe webhook selhal: ${err.message}`); }
    res.status(err.status ?? 500).json({ error: err.status ? err.message : "webhook failed" }); // 5xx → Stripe tries again later
  }
});

// small bodies everywhere – except the chat, which can carry photos/PDFs (Vercel allows ≈ 4.5 MB per request)
const smallJson = express.json({ limit: "20kb" }), chatJson = express.json({ limit: "4500kb" });
app.use((req, res, next) => (req.path === "/api/chat" ? chatJson : smallJson)(req, res, next));
// the widget's analytics beacons arrive as text/plain (see flush() in the widget) – JSON inside
app.use("/api/events", express.text({ type: "text/plain", limit: "20kb" }), (req, res, next) => {
  if (typeof req.body === "string") { try { req.body = JSON.parse(req.body); } catch { req.body = {}; } }
  next();
});

// The widget runs on the shops' domains → its API answers cross-origin calls. Each endpoint then
// checks that the calling site belongs to the client (withClient). No cookies are involved.
const WIDGET_API = /^\/api\/(persona|resolve|tts|cart\/price|proactive|chat|events|health|catalog|img)\b/;
app.use((req, res, next) => {
  if (!WIDGET_API.test(req.path)) return next();
  const origin = req.get("Origin");
  if (origin) res.set({ "Access-Control-Allow-Origin": origin, Vary: "Origin" });
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/**
 * Which shop a widget request belongs to (the embed's data-client). The calling page must be on the
 * client's domains. `lenient` = also accept requests without an Origin header (analytics beacons).
 */
const withClient = ({ lenient = false } = {}) => async (req, res, next) => {
  const id = req.body?.client ?? req.query.client;
  const client = await getClient(id);
  if (!client) {
    // registered but not paid (or switched off) → the assistant doesn't run
    if (await getClient(id, { includeInactive: true })) return res.status(402).json({ error: "Sella pro tento obchod není aktivní – zaplaťte tarif ve svém přehledu Sella." });
    return res.status(404).json({ error: "Neznámý klient – zkontrolujte data-client ve vložení widgetu." });
  }
  const origin = req.get("Origin");
  const ok = origin
    ? originAllowed(client, origin, req.get("Host"))
    : lenient || req.get("Sec-Fetch-Site") === "same-origin";
  if (!ok) return res.status(403).json({ error: "Tento web nemá povolený přístup." });
  req.client = client;
  req.lang = (req.body?.lang ?? req.query.lang) === "en" ? "en" : "cs"; // the page's language (Czech by default)
  req.cat = await getCatalog(client, { lang: req.lang });
  next();
};

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
    // the customer agreed to analytics – only then are their questions and actions stored
    consent: raw.consent === true,
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
// Also the uptime monitor's URL: 503 when the database is unreachable.
app.get("/api/health", async (req, res) => {
  let database = "none";
  if (db) {
    const { error } = await db.from("clients").select("id", { head: true, count: "exact" }).limit(1);
    database = error ? "down" : "ok";
  }
  res.status(database === "down" ? 503 : 200).json({ ok: database !== "down", tts: ttsProvider(), database });
});

const agentName = (client) => client.agentName || personaName(client.name);

// The agent's name for a shop – the client's configured name, or derived from the shop's name.
// Tied to the client, not to what a browser reads off the page, so every visitor gets the same one.
// Also hands the widget the client's integration overrides (e.g. which button is "add to cart").
app.post("/api/persona", rateLimit("persona", 20, 60e3), withClient(), async (req, res) => {
  const { tts } = await allowance(req.client);
  res.json({ name: agentName(req.client), tts: tts ? ttsProvider() : "browser", integration: req.client.integration });
});

// Maps what a shop's page shows (product code, EAN, URL, name, category) to catalog products –
// how the widget knows where the customer is on shops that don't call our JS API.
app.post("/api/resolve", rateLimit("resolve", 120, 60e3), withClient(), (req, res) => {
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

// Natural voice (ElevenLabs). 404 when not configured or the shop's voice allowance is used up →
// the widget uses the browser voice.
app.post("/api/tts", rateLimit("tts", 120, 60e3, { shared: true }), withClient(), async (req, res) => {
  if (ttsProvider() !== "elevenlabs") return res.status(404).json({ error: "TTS not configured" });
  const text = str(req.body?.text, 600).trim();
  if (!text) return res.status(400).json({ error: "text is required" });
  if (!(await allowance(req.client)).tts) return res.status(404).json({ error: "TTS limit reached" });
  const abort = new AbortController();
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });
  try {
    await streamSpeech(text, res, abort.signal);
    await recordUsage(req.client, { ttsChars: text.length });
  } catch (err) {
    if (abort.signal.aborted) return;
    console.error("TTS:", err.message);
    // pass "too busy" through, so the widget waits and retries instead of switching voices
    if (!res.headersSent) res.status(err.status === 429 ? 429 : 502).json({ error: "TTS failed" }); else res.end();
  }
});

// TechMarket demo shop's own data (public/shop.js renders the shop from it)
app.get("/api/catalog", (req, res) => {
  const cat = req.query.lang === "en" ? techmarketEn : techmarket; // the demo shop in Czech or English
  const { store, categories, products, related } = cat;
  res.json({ store: { name: store.name, tagline: store.tagline, freeShippingFrom: store.freeShippingFrom }, categories, products, related, promotions: cat.activePromotions() });
});

app.get("/api/img/:id.svg", (req, res) => {
  const svg = productSvg(req.params.id);
  if (!svg) return res.sendStatus(404);
  res.set({ "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" }).send(svg);
});

app.post("/api/cart/price", rateLimit("cart", 60, 60e3), withClient(), (req, res) => res.json(req.cat.priceCart(cleanSignals({ cart: req.body?.cart }, req.cat).cart)));

// Greeting on arrival + behaviour-based tips. Rule-based: instant and free (except the AI-written
// offer of help for a hesitating customer, which counts towards the shop's usage).
// is the shop's assistant switched on? (off once the plan's messages for the month are used up)
app.get("/api/status", rateLimit("status", 120, 60e3), withClient(), async (req, res) => {
  const a = await allowance(req.client);
  res.json({ on: a.chat && req.client.active !== false });
});

// the plans shops can choose (Sella price list)
app.get("/api/plans", (req, res) => res.json({ plans: publicPlans() }));

app.post("/api/proactive", rateLimit("proactive", 60, 60e3, { shared: true }), withClient(), async (req, res) => {
  const { sessionId, trigger, signals } = req.body ?? {};
  if (!validSession(sessionId)) return res.status(400).json({ error: "Neplatná session." });
  const s = { ...cleanSignals(signals, req.cat), agentName: agentName(req.client), lang: req.lang };
  // the month's messages are used up → the assistant is off until the shop picks a bigger plan
  if (!(await allowance(req.client)).chat) return res.json({ off: true });
  if (trigger === "greeting") return res.json({ greeting: greeting(s, req.cat) });
  const nudge = nextNudge(s, req.cat);
  if (nudge?.hesitation) {
    // a stuck customer gets an offer written for their exact situation
    const used = [];
    nudge.text = await writeHesitationOffer({
      ...nudge.hesitation, declined: s.declined, fallback: nudge.text, shopName: req.client.name, lang: req.lang,
      useAi: (await allowance(req.client)).chat, meter: (u) => used.push(u),
    });
    // an AI-written offer costs like an answer, so it counts towards the plan as one message
    await recordUsage(req.client, { messages: used.length ? 1 : 0, claude: used, model: MODEL });
    delete nudge.hesitation;
  }
  res.json({ nudge });
});

app.post("/api/chat", rateLimit("chat", 30, 5 * 60e3, { shared: true }), withClient(), async (req, res) => {
  const { sessionId, text, attachments, context } = req.body ?? {};
  if (!validSession(sessionId)) return res.status(400).json({ error: "Neplatná session." });

  res.set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const send = (obj) => { if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(obj)}\n\n`); };
  // customer interrupted (closed the stream) → stop generating the rest of the answer
  const abort = new AbortController();
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });

  // over the plan's monthly limit → the assistant switches itself off on the page
  const useAi = (await allowance(req.client)).chat;
  if (!useAi) { send({ type: "off" }); send({ type: "done" }); return res.end(); }
  const used = [];
  try {
    await chat({
      sessionId, text, attachments, send, signal: abort.signal, catalog: req.cat, useAi, meter: (u) => used.push(u),
      context: { ...cleanSignals(context, req.cat), clientId: req.client.id, agentName: agentName(req.client), lang: req.lang },
    });
    send({ type: "done" });
  } catch (err) {
    if (!abort.signal.aborted) {
      let message = "Omlouvám se, něco se pokazilo. Zkuste to prosím znovu.";
      if (err instanceof ChatError) message = err.message;
      else if (err instanceof Anthropic.AuthenticationError) { message = "AI teď není dostupná, zkuste to prosím později."; alert("anthropic-auth", "Claude API odmítá klíč (ANTHROPIC_API_KEY) – chat nefunguje!"); }
      else if (err instanceof Anthropic.RateLimitError) { message = "AI je momentálně přetížená, zkuste to prosím za chvíli."; alert("anthropic-429", "Claude API vrací 429 (rate limit) – zvažte vyšší tier."); }
      else if (err instanceof Anthropic.APIError) { console.error(`Claude API error ${err.status}:`, err.message); if (err.status >= 500) alert("anthropic-5xx", `Claude API chyba ${err.status}: ${err.message}`); }
      else { console.error(err); alert("chat-error", `Chyba v chatu: ${err.message}`); }
      send({ type: "error", message });
    }
  } finally {
    await recordUsage(req.client, { messages: used.length ? 1 : 0, claude: used, model: MODEL });
  }
  res.end();
});

app.post("/api/events", rateLimit("events", 120, 60e3), withClient({ lenient: true }), async (req, res) => {
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

// --- dashboard logins -------------------------------------------------------
// Shop owners: shop ID (or their e-mail) + their password. Us: ID "admin" + ADMIN_TOKEN (sees every client).
// A shop that signed up but hasn't paid yet may sign in – paying happens in its overview. A shop we
// switched off by hand ("manual" billing, inactive) may not.
const canSignIn = (c) => Boolean(c && (c.active || c.billing !== "manual"));
async function ownerClient(login) {
  if (!login.includes("@")) return getClient(login, { includeInactive: true });
  return (await listClients()).find((c) => c.ownerEmail?.toLowerCase() === login) ?? null;
}
// Locally, without ADMIN_TOKEN, requests from this computer are let in without a login.
const isLocalRequest = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) && !req.get("X-Forwarded-For");

function currentSession(req) {
  const s = readSession(readCookie(req));
  if (s) return s;
  if (!isProduction() && !ADMIN_TOKEN && isLocalRequest(req)) return { clientId: MASTER, dev: true };
  return null;
}

// Admin changes may only come from our own dashboard page (on top of the SameSite cookie).
function sameOrigin(req, res, next) {
  if (req.method === "GET") return next();
  const origin = req.get("Origin");
  const ok = origin ? (() => { try { return new URL(origin).host === req.get("Host"); } catch { return false; } })() : req.get("Sec-Fetch-Site") === "same-origin";
  if (!ok) return res.status(403).json({ error: "Požadavek z cizího webu." });
  next();
}

app.post("/api/admin/login", sameOrigin, rateLimit("login", 10, 15 * 60e3, { shared: true }), async (req, res) => {
  const id = str(req.body?.client, 200).trim().toLowerCase();
  const password = str(req.body?.password, 200);
  const fail = () => res.status(401).json({ error: "Nesprávné ID obchodu nebo heslo." });
  if (!id || !password) return fail();
  // brute force on one account from many IPs
  if (!(await hit(`login-account:${id}`, 15 * 60e3, 30))) return res.status(429).json({ error: "Příliš mnoho pokusů, zkuste to za 15 minut." });

  let sessionFor = null;
  if (id === "admin") {
    if (ADMIN_TOKEN && safeEqual(password, ADMIN_TOKEN)) sessionFor = MASTER;
  } else {
    const found = await ownerClient(id);
    const client = canSignIn(found) ? found : null;
    if (client?.passwordHash) {
      if (verifyPassword(password, client.passwordHash)) sessionFor = client.id;
    } else if (client?.legacyToken && safeEqual(password, client.legacyToken)) {
      sessionFor = client.id;
      // move the old plain-text password to a hash
      setPasswordHash(client.id, hashPassword(password)).catch((err) => console.error("password upgrade failed:", err.message));
    } else if (client && isBuiltIn(client.id) && safeEqual(password, demoPassword(client.id))) {
      sessionFor = client.id; // a showcase shop's starting password (until a new one is set)
    } else {
      verifyPassword(password, "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"); // same timing as a real check
    }
  }
  if (!sessionFor) return fail();
  res.set("Set-Cookie", sessionCookie(createSession(sessionFor), { secure: req.secure }));
  res.json({ ok: true });
});

app.post("/api/admin/logout", sameOrigin, (req, res) => {
  res.set("Set-Cookie", sessionCookie("", { secure: req.secure }));
  res.json({ ok: true });
});

/** Dashboard access: the signed-in owner sees their own shop, we see any (?client=). */
async function admin(req, res, next) {
  const s = currentSession(req);
  if (!s) return res.status(401).json({ error: "Přihlaste se prosím." });
  const master = s.clientId === MASTER;
  const client = await getClient(master ? req.query.client || "techmarket" : s.clientId, { includeInactive: true });
  if (!client || (!master && !canSignIn(client))) return res.status(404).json({ error: "Neznámý klient." });
  req.client = client;
  req.isMaster = master;
  req.cat = await getCatalog(client);
  next();
}
const masterOnly = (req, res, next) => (currentSession(req)?.clientId === MASTER ? next() : res.status(403).json({ error: "Jen pro provozovatele." }));

const fail = (res, err) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.status ? err.message : "Operace se nepodařila." });
};

app.get("/api/admin/me", (req, res) => {
  const s = currentSession(req);
  if (!s) return res.status(401).json({ error: "Přihlaste se prosím." });
  res.json({ master: s.clientId === MASTER, clientId: s.clientId === MASTER ? null : s.clientId, dev: Boolean(s.dev) });
});

// What the shop owner sees about their plan: price, what's included and how much is used. Our own
// cost (Claude API) is shown only to us – owners see their price, never our margin.
const usageView = (client, a, { master = false } = {}) => ({
  month: monthKey(), plan: a.limits.planName, planId: a.limits.plan, messages: a.usage.messages, messageLimit: a.limits.messages,
  ttsChars: a.usage.tts_chars, ttsLimit: a.limits.ttsChars,
  priceCzk: a.limits.priceCzk, // null = by agreement
  pricePerMessageCzk: a.limits.priceCzk != null && a.limits.messages ? Math.round((a.limits.priceCzk / a.limits.messages) * 100) / 100 : null,
  aiActive: a.chat,
  ...(master ? { costUsd: Math.round(a.usage.cost_usd * 100) / 100, aiCalls: a.usage.ai_calls } : {}),
});

// Billing as the owner sees it. "needsPayment" = signed up, the assistant waits for the first payment.
const billingView = (c) => ({
  status: c.billing, paidUntil: c.paidUntil ?? null,
  needsPayment: c.billing !== "manual" && !c.active,
  canManage: Boolean(c.stripeCustomerId) && paymentsEnabled(), // Stripe portal: card, invoices, cancelling
  payments: paymentsEnabled() ? "stripe" : simulated() ? "simulated" : "off",
});

app.use("/api/analytics", sameOrigin);
app.use("/api/billing", sameOrigin);
app.get("/api/analytics", admin, async (req, res) => {
  try {
    const stats = await summarize(req.client.id, req.cat);
    const c = req.client;
    res.json({
      ...stats,
      client: { id: c.id, name: c.name, active: c.active, domains: c.domains, feedUrl: c.feedUrl ?? "", ownerEmail: c.ownerEmail ?? "", builtIn: isBuiltIn(c.id) },
      billing: billingView(c),
      catalog: catalogStatus(req.client),
      usage: usageView(req.client, await allowance(req.client), { master: req.isMaster }),
      plans: publicPlans(),
      clients: req.isMaster ? (await listClients()).map(({ id, name, active, billing }) => ({ id, name, active, billing })) : null,
    });
  } catch (err) { fail(res, err); }
});
// The shop picks a plan in its overview. A paying shop (Stripe) changes it through billing – the
// price difference is charged right away; a shop we invoice by hand ("manual") switches directly.
app.post("/api/analytics/plan", admin, rateLimit("plan", 10, 10 * 60e3, { shared: true }), async (req, res) => {
  const plan = str(req.body?.plan, 20);
  const allowed = req.isMaster ? Boolean(PLANS[plan]) : publicPlans().some((p) => p.id === plan);
  if (!allowed) return res.status(400).json({ error: "Neznámý tarif." });
  try {
    if (req.client.billing !== "manual" && !req.isMaster) {
      if (!req.client.active) return res.status(402).json({ error: "Nejdřív prosím zaplaťte tarif." });
      await startPayment(req.client, plan, { lang: req.body?.lang });
    } else await setClientPlan(req.client.id, plan);
    const client = await getClient(req.client.id, { includeInactive: true });
    res.json({ ok: true, usage: usageView(client, await allowance(client), { master: req.isMaster }) });
  } catch (err) { fail(res, err); }
});

// The owner's own settings: where the assistant may run and where its products come from.
app.post("/api/analytics/settings", admin, rateLimit("settings", 20, 10 * 60e3, { shared: true }), async (req, res) => {
  if (isBuiltIn(req.client.id) && !req.isMaster) return res.status(403).json({ error: "Ukázkový obchod nelze měnit." });
  const domains = [];
  for (const d of String(req.body?.domains ?? "").split(/[\s,]+/).filter(Boolean).slice(0, 10)) {
    const n = normalizeDomain(d);
    if (!n) return res.status(400).json({ error: `Neplatná doména: ${str(d, 80)}`, code: "domain" });
    if (!domains.includes(n)) domains.push(n);
  }
  if (!domains.length) return res.status(400).json({ error: "Zadejte aspoň jednu doménu obchodu.", code: "domain" });
  const feedUrl = str(req.body?.feedUrl, 1000).trim();
  if (feedUrl && !/^https?:\/\/\S+$/i.test(feedUrl)) return res.status(400).json({ error: "Adresa feedu musí začínat https://", code: "feed" });
  try {
    await setOwnerSettings(req.client.id, { domains, feedUrl });
    res.json({ ok: true, domains, feedUrl });
  } catch (err) { fail(res, err); }
});

// --- payments (lib/billing.js) ----------------------------------------------
const pageUrl = (req, p) => `${req.protocol}://${req.get("Host")}${p}`;
// pay for a plan: Stripe's payment page (or done at once – a plan change, or simulated locally)
app.post("/api/billing/checkout", admin, rateLimit("checkout", 10, 10 * 60e3, { shared: true }), async (req, res) => {
  if (req.client.billing === "manual") return res.status(400).json({ error: "Tento obchod platí na fakturu – tarif změníte přímo." });
  const lang = req.body?.lang === "en" ? "en" : "cs";
  const back = `/admin/${req.isMaster ? `?client=${req.client.id}` : ""}`;
  try {
    res.json(await startPayment(req.client, str(req.body?.plan, 20), {
      lang, successUrl: pageUrl(req, `${back}${back.includes("?") ? "&" : "?"}paid=1`), cancelUrl: pageUrl(req, back),
    }));
  } catch (err) { fail(res, err); }
});
// card, invoices and cancelling – Stripe's customer portal
app.post("/api/billing/portal", admin, async (req, res) => {
  try {
    res.json(await billingPortal(req.client, { lang: req.body?.lang, returnUrl: pageUrl(req, `/admin/${req.isMaster ? `?client=${req.client.id}` : ""}`) }));
  } catch (err) { fail(res, err); }
});

// --- self sign-up on the Sella site ("Chci Sellu") --------------------------
// Creates the shop's account with its widget switched off and signs the owner in; the overview
// then asks them to pay – only a paid shop's embed code works.
app.post("/api/signup", sameOrigin, rateLimit("signup-form", 40, 10 * 60e3, { shared: true }), async (req, res) => {
  const b = req.body ?? {};
  if (b.website) return res.json({ ok: true }); // honeypot field – only bots fill it in
  const name = str(b.name, 80).trim();
  const email = str(b.email, 200).trim().toLowerCase();
  const password = str(b.password, 200);
  const domain = normalizeDomain(str(b.domain, 200));
  const feedUrl = str(b.feedUrl, 1000).trim();
  const plan = str(b.plan, 20);
  const bad = (code, error) => res.status(400).json({ code, error });
  if (name.length < 2) return bad("name", "Vyplňte název obchodu.");
  if (!domain) return bad("domain", "Zadejte adresu e-shopu, např. mujobchod.cz.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("email", "Zadejte platný e-mail.");
  if (password.length < 10) return bad("password", "Heslo musí mít aspoň 10 znaků.");
  if (feedUrl && !/^https?:\/\/\S+$/i.test(feedUrl)) return bad("feed", "Adresa feedu musí začínat https://");
  if (!PLANS[plan]?.public || !PLANS[plan].priceCzk) return bad("plan", "Vyberte tarif.");
  if (b.terms !== true) return bad("terms", "Potvrďte prosím podmínky.");
  try {
    const clients = await listClients();
    if (clients.some((c) => c.ownerEmail?.toLowerCase() === email)) return res.status(409).json({ code: "email", error: "S tímto e-mailem už účet existuje – přihlaste se." });
    if (clients.some((c) => c.domains.includes(domain))) return res.status(409).json({ code: "domain", error: "Tento e-shop už Sellu má. Ozvěte se nám, pokud jde o omyl." });
    // at most a few new accounts per network and hour (checked only once the form is valid)
    if (!(await hit(`signup:${req.ip}`, 60 * 60e3, 5))) return res.status(429).json({ error: "Příliš mnoho registrací, zkuste to prosím později." });
    const id = await createSignedUpClient({ name, domain, email, passwordHash: hashPassword(password), plan, feedUrl });
    alert(`signup:${id}`, `Nová registrace: ${name} (${domain}, ${email}), tarif ${PLANS[plan].name}.`);
    res.set("Set-Cookie", sessionCookie(createSession(id), { secure: req.secure }));
    res.json({ ok: true, id });
  } catch (err) { fail(res, err); }
});

// downloads the client's feed again right now (normally every 6 hours)
app.post("/api/analytics/catalog", admin, rateLimit("catalog", 6, 10 * 60e3, { shared: true }), async (req, res) => {
  try { await getCatalog(req.client, { refresh: true }); res.json(catalogStatus(req.client)); } catch (err) { fail(res, err); }
});
app.post("/api/analytics/insights", admin, rateLimit("insights", 10, 10 * 60e3, { shared: true }), async (req, res) => {
  if (!hasApiKey()) return res.status(503).json({ error: "Doporučení generuje Claude – nastavte ANTHROPIC_API_KEY v souboru .env." });
  if (!(await allowance(req.client)).chat) return res.status(429).json({ error: "Limit zpráv od AI v tarifu je pro tento měsíc vyčerpaný." });
  const used = [];
  try {
    const lang = req.body?.lang === "en" ? "en" : "cs"; // the dashboard's language
    res.json({ markdown: await generateInsights(await summarize(req.client.id, req.cat), req.cat, (u) => used.push(u), lang) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Analýzu se nepodařilo vygenerovat." });
  } finally {
    await recordUsage(req.client, { messages: used.length ? 1 : 0, claude: used, model: MODEL });
  }
});

// --- internal admin: clients, logins, usage (operator only) -----------------
app.use("/api/admin/clients", sameOrigin, masterOnly);
app.use("/api/admin/usage.csv", masterOnly);

app.get("/api/admin/clients", async (req, res) => {
  try {
    const [clients, usage, feeds] = await Promise.all([listClients(), usageForMonth(), storedStatuses()]);
    const usageOf = new Map(usage.map((u) => [u.client_id, u]));
    res.json({
      month: monthKey(),
      plans: Object.fromEntries(Object.entries(PLANS).map(([id, p]) => [id, { name: p.name, messages: p.messages }])),
      database: Boolean(db),
      clients: clients.map((c) => {
        const u = usageOf.get(c.id) ?? { messages: 0, ai_calls: 0, tts_chars: 0, cost_usd: 0 };
        return {
          id: c.id, name: c.name, active: c.active, builtIn: isBuiltIn(c.id), domains: c.domains,
          agentName: c.agentName, description: c.description ?? "", feedUrl: c.feedUrl ?? "",
          info: c.info ?? {}, integration: c.integration ?? {}, freeShippingFrom: c.freeShippingFrom ?? null,
          plan: c.plan, monthlyMessageLimit: c.monthlyMessageLimit, ownerEmail: c.ownerEmail ?? "", notes: c.notes ?? "",
          billing: c.billing, paidUntil: c.paidUntil ?? null, createdAt: c.createdAt ?? null,
          hasPassword: Boolean(c.passwordHash || c.legacyToken || (isBuiltIn(c.id) && demoPassword(c.id))),
          // a showcase shop's starting password can be shown to us (it is derived, not stored)
          demoPassword: isBuiltIn(c.id) && !c.passwordHash && !c.legacyToken ? demoPassword(c.id) : null,
          limits: limitsFor(c),
          usage: { messages: u.messages, aiCalls: u.ai_calls, ttsChars: u.tts_chars, costUsd: Math.round(u.cost_usd * 100) / 100 },
          feed: c.catalog === "techmarket" ? { products: techmarket.products.length, demo: true } : feeds.get(c.id) ?? null,
        };
      }),
    });
  } catch (err) { fail(res, err); }
});

// create (isNew) or update a client
app.post("/api/admin/clients", async (req, res) => {
  const isNew = req.body?.isNew === true;
  const { row, error } = validateClient(req.body ?? {}, { isNew });
  if (error) return res.status(400).json({ error });
  try {
    await saveClient(row, { isNew });
    res.json({ ok: true, id: row.id });
  } catch (err) { fail(res, err); }
});

// sets the owner's password: a given one, or a generated one – shown only in this response
app.post("/api/admin/clients/:id/password", async (req, res) => {
  const client = await getClient(req.params.id, { includeInactive: true });
  if (!client) return res.status(404).json({ error: "Neznámý klient." });
  const password = req.body?.password ? str(req.body.password, 200) : generatePassword();
  if (password.length < 10) return res.status(400).json({ error: "Heslo musí mít aspoň 10 znaků." });
  try {
    await setPasswordHash(client.id, hashPassword(password));
    res.json({ ok: true, password });
  } catch (err) { fail(res, err); }
});

// usage of every client for a month, for invoicing (?month=YYYY-MM)
app.get("/api/admin/usage.csv", async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : monthKey();
  try {
    const [clients, usage] = await Promise.all([listClients(), usageForMonth(month)]);
    const usageOf = new Map(usage.map((u) => [u.client_id, u]));
    const cell = (v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
    const lines = [["client_id", "name", "billing", "plan", "month", "messages", "message_limit", "ai_calls", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "tts_chars", "cost_usd", "plan_price_czk"]];
    for (const c of clients) {
      const u = usageOf.get(c.id) ?? {};
      const l = limitsFor(c);
      lines.push([c.id, c.name, c.billing, l.plan, month, u.messages ?? 0, l.messages, u.ai_calls ?? 0, u.input_tokens ?? 0, u.output_tokens ?? 0, u.cache_read_tokens ?? 0, u.cache_write_tokens ?? 0, u.tts_chars ?? 0, (u.cost_usd ?? 0).toFixed(4), l.priceCzk ?? ""]);
    }
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="vyuziti-${month}.csv"` });
    res.send("﻿" + lines.map((l) => l.map(cell).join(";")).join("\r\n"));
  } catch (err) { fail(res, err); }
});

// --- daily maintenance (Vercel Cron, see vercel.json) ----------------------
// Deletes old data, clears old rate-limit counters and re-downloads every client's feed (a broken
// feed raises an alert). Vercel calls it with "Authorization: Bearer <CRON_SECRET>".
app.get("/api/cron/daily", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.get("Authorization"), `Bearer ${secret}`)) return res.status(401).json({ error: "unauthorized" });
  const report = { purgedEvents: 0, feeds: [] };
  try {
    report.purgedEvents = await purgeOld();
    if (db) await db.from("rate_limits").delete().lt("window_start", Date.now() - 32 * 864e5);
    for (const client of await listClients()) {
      if (!client.active || !client.feedUrl) continue;
      await getCatalog(client, { refresh: true }); // alerts by itself when the download fails
      const s = catalogStatus(client);
      report.feeds.push({ id: client.id, products: s?.products ?? 0, error: s?.error ?? null });
    }
    res.json(report);
  } catch (err) {
    alert("cron", `Denní údržba selhala: ${err.message}`);
    fail(res, err);
  }
});

// short link to the second demo site, so it's not just the raw file path
// the Sella site is the home page; the demo shops live at /techmarket/ and /kavarna
app.get(["/sella", "/sella/"], (req, res) => res.redirect(301, "/"));
app.get("/techmarket", (req, res, next) => (req.originalUrl.split("?")[0].endsWith("/") ? next() : res.redirect(301, "/techmarket/")));
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
//   /  → the demo shop · /admin/ → dashboard · /admin/clients.html → clients · /widget/prodavac.js
app.use(express.static(path.join(here, "public")));

// unexpected errors: logged, reported to us, and a generic answer for the caller
app.use((err, req, res, next) => {
  alert(`http:${req.path}`, `Chyba serveru na ${req.method} ${req.path}: ${err.message}`);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Operace se nepodařila." });
});
process.on("unhandledRejection", (err) => alert("unhandled", `Neošetřená chyba: ${err?.message ?? err}`));

app.listen(PORT, () => {
  console.log(`AI prodavač běží:`);
  console.log(`  Sella:        http://localhost:${PORT}/`);
  console.log(`  TechMarket:   http://localhost:${PORT}/techmarket/`);
  console.log(`  Kavárna:      http://localhost:${PORT}/kavarna`);
  console.log(`  Dashboard:    http://localhost:${PORT}/admin/`);
  console.log(`  Klienti:      http://localhost:${PORT}/admin/clients.html`);
  console.log(hasApiKey() ? `  Model:        ${MODEL}` : `  Režim:        bez AI (ANTHROPIC_API_KEY není nastaven) – chat odpovídá zjednodušeně`);
  console.log(`  Data:         ${db ? "Supabase" : "lokální soubory (SUPABASE_URL / SUPABASE_SECRET_KEY nejsou nastaveny)"}, uchovávají se ${RETENTION_DAYS} dní`);
  if (isProduction() && !ADMIN_TOKEN) console.warn("  POZOR: ADMIN_TOKEN není nastaven – přihlášení provozovatele nefunguje.");
});
