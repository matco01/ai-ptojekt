// Behaviour tracking + aggregation for the shop-owner dashboard, per client.
// Events go to the Supabase "events" table and are added up there (dashboard_summary);
// without Supabase they are appended to events.jsonl in the local data folder (see lib/storage.js)
// and added up here.
import fs from "node:fs";
import { dataFile } from "./storage.js";
import { db } from "./db.js";

const file = dataFile("events.jsonl");
/** How long events (incl. customers' questions) are kept. The dashboard shows the same period. */
export const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 90;

export const EVENT_TYPES = new Set([
  "session_start", "page_view", "category_view", "product_view", "search",
  "offer_shown", "offer_accepted", "offer_declined", "assistant_opened",
  "nudge_shown", "nudge_clicked", "nudge_dismissed",
  "filter_change", "tab_view", "hover_add", "cart_remove",
  "chat_message", "ai_recommended", "add_to_cart", "purchase",
]);

export const NUDGE_LABELS = {
  bundle: "Set se slevou",
  freeship: "Doprava zdarma",
  "search-miss": "Neúspěšné hledání",
  "hes-compare": "Váhání mezi produkty",
  "hes-product": "Dlouhé rozmýšlení u produktu",
  "hes-filters": "Bloudění ve filtrech",
  "hes-search": "Opakované hledání",
  "hes-cart": "Váhání v košíku",
  service: "Služba (výkup, záruka…)",
  deal: "Sleva v kategorii",
  accessory: "Příslušenství v košíku",
  idle: "Nečinnost na úvodu",
};

/**
 * Customers sometimes type contact or payment details into the chat. The dashboard only needs
 * the question, so e-mails, phone numbers and card/account numbers are masked before storing.
 */
export function redact(text) {
  return String(text ?? "")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[e-mail]")
    .replace(/(?:\+|00)?\d[\d \-/]{7,}\d/g, (m) => (m.replace(/\D/g, "").length >= 9 ? "[číslo]" : m));
}

/** Stores events; every event must carry clientId. Never throws – analytics must not break a request. */
export async function recordMany(events) {
  if (!events.length) return;
  const clean = events.map((e) => ({ ts: Date.now(), ...e, ...(e.text != null ? { text: redact(e.text) } : {}) }));
  try {
    if (db) {
      for (let i = 0; i < clean.length; i += 500) {
        const rows = clean.slice(i, i + 500).map(({ clientId, sessionId, type, ts, ...data }) =>
          ({ client_id: clientId, session_id: sessionId ?? null, type, ts, data }));
        const { error } = await db.from("events").insert(rows);
        if (error) throw new Error(error.message);
      }
    } else {
      fs.appendFileSync(file, clean.map((e) => JSON.stringify(e)).join("\n") + "\n");
    }
  } catch (e) { console.error("analytics write failed:", e.message); }
}

export const record = (event) => recordMany([event]);

const since = () => Date.now() - RETENTION_DAYS * 864e5;

function readLocal(clientId) {
  if (!fs.existsSync(file)) return [];
  const from = since();
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  }).filter((e) => e.clientId === clientId && e.ts >= from);
}

/** Deletes events older than the retention period (runs daily from /api/cron/daily). */
export async function purgeOld() {
  const cutoff = since();
  if (db) {
    const { error, count } = await db.from("events").delete({ count: "exact" }).lt("ts", cutoff);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }
  if (!fs.existsSync(file)) return 0;
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const keep = lines.filter((line) => { try { return JSON.parse(line).ts >= cutoff; } catch { return false; } });
  fs.writeFileSync(file, keep.length ? keep.join("\n") + "\n" : "");
  return lines.length - keep.length;
}

const inc = (m, k, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const top = (counter, n) => [...counter.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n).map(([id, count]) => ({ id, count }));

/**
 * Adds up events in JavaScript – the local-files equivalent of the dashboard_summary SQL function.
 * Both return the same raw shape (tests/analytics.test.js checks that they agree).
 */
export function aggregate(events) {
  const sessions = new Set(), aiSessions = new Set(), buyers = new Set();
  const views = new Map(), aiRecs = new Map(), cartAi = new Map(), cartManual = new Map();
  const searches = new Map(), searchMisses = new Map();
  const nudges = new Map();
  const offer = { shown: 0, chat: 0, voice: 0, declined: 0, reopened: 0 };
  const questions = [];
  let userMessages = 0;

  for (const e of events) {
    if (e.sessionId) sessions.add(e.sessionId);
    switch (e.type) {
      case "product_view": if (e.productId) inc(views, e.productId); break;
      case "search": {
        const q = String(e.query ?? "").toLowerCase().trim();
        if (!q) break;
        inc(searches, q);
        if (!e.results) inc(searchMisses, q);
        break;
      }
      case "offer_shown": offer.shown++; break;
      case "offer_accepted": offer[e.mode === "voice" ? "voice" : "chat"]++; if (e.sessionId) aiSessions.add(e.sessionId); break;
      case "offer_declined": offer.declined++; break;
      case "assistant_opened": offer.reopened++; if (e.sessionId) aiSessions.add(e.sessionId); break;
      case "nudge_shown": case "nudge_clicked": case "nudge_dismissed": {
        const n = nudges.get(e.kind) ?? { kind: e.kind, shown: 0, clicked: 0, dismissed: 0 };
        n[e.type.slice(6)]++;
        nudges.set(e.kind, n);
        if (e.type === "nudge_clicked" && e.sessionId) aiSessions.add(e.sessionId);
        break;
      }
      case "chat_message":
        userMessages++; if (e.sessionId) aiSessions.add(e.sessionId);
        if (e.text) questions.push({ ts: e.ts, text: e.text, mode: e.mode ?? null });
        break;
      case "ai_recommended": for (const id of e.productIds ?? []) inc(aiRecs, id); break;
      case "add_to_cart": if (e.productId) inc(e.source === "ai" ? cartAi : cartManual, e.productId, e.quantity ?? 1); break;
      case "purchase": if (e.sessionId) buyers.add(e.sessionId); break;
    }
  }
  let revenue = 0, revenueAi = 0, orders = 0, ordersAi = 0;
  for (const e of events) {
    if (e.type !== "purchase") continue;
    orders++; revenue += e.value ?? 0;
    if (aiSessions.has(e.sessionId)) { ordersAi++; revenueAi += e.value ?? 0; }
  }
  const buyersAi = [...buyers].filter((s) => aiSessions.has(s)).length;
  const carts = (id) => (cartAi.get(id) ?? 0) + (cartManual.get(id) ?? 0);

  return {
    totals: { events: events.length, sessions: sessions.size, aiSessions: aiSessions.size, userMessages, orders, revenue, ordersAi, revenueAi, buyersAi, buyersNonAi: buyers.size - buyersAi },
    offer,
    nudges: [...nudges.values()].sort((a, b) => b.shown - a.shown || a.kind.localeCompare(b.kind)),
    topViewed: top(views, 8),
    topSearches: top(searches, 8),
    searchMisses: top(searchMisses, 6),
    topRecommended: top(aiRecs, 8),
    addToCartAi: top(cartAi, 8),
    addToCartManual: top(cartManual, 8),
    viewedNotBought: [...views.entries()].map(([id, v]) => ({ id, views: v, carts: carts(id) }))
      .filter((r) => r.views >= 3 && r.carts / r.views < 0.15)
      .sort((a, b) => b.views - a.views || a.id.localeCompare(b.id)).slice(0, 5),
    recentQuestions: questions.sort((a, b) => b.ts - a.ts).slice(0, 40),
  };
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/** Raw sums → what the dashboard shows (rates, averages, product names). */
export function finish(raw, cat) {
  const nameOf = (id) => cat.getProduct(id)?.name ?? id;
  const named = (rows) => rows.map((r) => ({ id: r.id, name: nameOf(r.id), count: Number(r.count) }));
  const asIs = (rows) => rows.map((r) => ({ id: r.id, name: r.id, count: Number(r.count) }));
  const t = Object.fromEntries(Object.entries(raw.totals).map(([k, v]) => [k, Number(v)]));
  const o = Object.fromEntries(Object.entries(raw.offer).map(([k, v]) => [k, Number(v)]));
  const ordersNonAi = t.orders - t.ordersAi;
  return {
    totals: {
      events: t.events, sessions: t.sessions, aiSessions: t.aiSessions, userMessages: t.userMessages,
      orders: t.orders, revenue: t.revenue, ordersAi: t.ordersAi, revenueAi: t.revenueAi,
      avgOrderAi: t.ordersAi ? Math.round(t.revenueAi / t.ordersAi) : 0,
      avgOrderNonAi: ordersNonAi ? Math.round((t.revenue - t.revenueAi) / ordersNonAi) : 0,
      conversionAi: pct(t.buyersAi, t.aiSessions),
      conversionNonAi: pct(t.buyersNonAi, t.sessions - t.aiSessions),
    },
    offer: { ...o, acceptRate: pct(o.chat + o.voice, o.shown) },
    nudges: raw.nudges.map((n) => ({ kind: n.kind, name: NUDGE_LABELS[n.kind] ?? n.kind, shown: +n.shown, clicked: +n.clicked, dismissed: +n.dismissed, clickRate: pct(+n.clicked, +n.shown) })),
    topViewed: named(raw.topViewed),
    topSearches: asIs(raw.topSearches),
    searchMisses: asIs(raw.searchMisses),
    topRecommended: named(raw.topRecommended),
    addToCartAi: named(raw.addToCartAi),
    addToCartManual: named(raw.addToCartManual),
    viewedNotBought: raw.viewedNotBought.map((r) => ({ id: r.id, name: nameOf(r.id), views: +r.views, carts: +r.carts })),
    recentQuestions: raw.recentQuestions.map((q) => ({ ts: Number(q.ts), text: q.text, mode: q.mode })),
    periodDays: RETENTION_DAYS,
  };
}

export async function summarize(clientId, cat) {
  if (db) {
    const { data, error } = await db.rpc("dashboard_summary", { p_client: clientId, p_since: since() });
    if (error) throw new Error(error.message);
    return finish(data, cat);
  }
  return finish(aggregate(readLocal(clientId)), cat);
}
