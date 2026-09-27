// Behaviour tracking + aggregation for the shop-owner dashboard, per client.
// Events go to the Supabase "events" table; without Supabase they are appended to
// events.jsonl in the local data folder (see lib/storage.js).
import fs from "node:fs";
import { getProduct, products } from "./catalog.js";
import { dataFile } from "./storage.js";
import { db } from "./db.js";
import { DEFAULT_CLIENT } from "./clients.js";

const file = dataFile("events.jsonl");
const READ_DAYS = 90;

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

/** Stores events; every event must carry clientId. Never throws – analytics must not break a request. */
export async function recordMany(events) {
  if (!events.length) return;
  const clean = events.map((e) => ({ ts: Date.now(), ...e }));
  try {
    if (db) {
      for (let i = 0; i < clean.length; i += 500) {
        const rows = clean.slice(i, i + 500).map(({ clientId, sessionId, type, ts, demo, ...data }) =>
          ({ client_id: clientId, session_id: sessionId ?? null, type, ts, demo: Boolean(demo), data }));
        const { error } = await db.from("events").insert(rows);
        if (error) throw new Error(error.message);
      }
    } else {
      fs.appendFileSync(file, clean.map((e) => JSON.stringify(e)).join("\n") + "\n");
    }
  } catch (e) { console.error("analytics write failed:", e.message); }
}

export const record = (event) => recordMany([event]);

async function readAll(clientId) {
  const since = Date.now() - READ_DAYS * 24 * 3600e3;
  if (db) {
    const out = [];
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await db.from("events").select("session_id, type, ts, demo, data")
        .eq("client_id", clientId).gte("ts", since).order("id").range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data) out.push({ ...r.data, sessionId: r.session_id, type: r.type, ts: Number(r.ts), demo: r.demo });
      if (data.length < 1000) break;
    }
    return out;
  }
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  }).filter((e) => (e.clientId ?? DEFAULT_CLIENT) === clientId && e.ts >= since);
}

export async function reset(clientId) {
  if (db) {
    const { error } = await db.from("events").delete().eq("client_id", clientId);
    if (error) throw new Error(error.message);
    return;
  }
  if (!fs.existsSync(file)) return;
  const keep = fs.readFileSync(file, "utf8").split("\n").filter(Boolean)
    .filter((line) => { try { return (JSON.parse(line).clientId ?? DEFAULT_CLIENT) !== clientId; } catch { return false; } });
  fs.writeFileSync(file, keep.length ? keep.join("\n") + "\n" : "");
}

const nameOf = (id) => getProduct(id)?.name ?? id;
const top = (counter, n = 8, label = nameOf) =>
  [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, count]) => ({ id, name: label(id), count }));
const inc = (m, k, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export async function summarize(clientId) {
  const events = await readAll(clientId);
  const sessions = new Set();
  const aiSessions = new Set();
  const buyers = new Set();
  const views = new Map(), aiRecs = new Map(), cartAi = new Map(), cartManual = new Map();
  const searches = new Map(), searchMisses = new Map();
  const nudges = new Map(); // kind → {shown, clicked, dismissed}
  const offer = { shown: 0, chat: 0, voice: 0, declined: 0, reopened: 0 };
  const questions = [];
  let revenue = 0, revenueAi = 0, orders = 0, ordersAi = 0, userMessages = 0;

  for (const e of events) {
    if (e.sessionId) sessions.add(e.sessionId);
    switch (e.type) {
      case "product_view": inc(views, e.productId); break;
      case "search": {
        const q = String(e.query ?? "").toLowerCase().trim();
        if (!q) break;
        inc(searches, q);
        if (e.results === 0) inc(searchMisses, q);
        break;
      }
      case "offer_shown": offer.shown++; break;
      case "offer_accepted": offer[e.mode === "voice" ? "voice" : "chat"]++; aiSessions.add(e.sessionId); break;
      case "offer_declined": offer.declined++; break;
      case "assistant_opened": offer.reopened++; aiSessions.add(e.sessionId); break;
      case "nudge_shown": case "nudge_clicked": case "nudge_dismissed": {
        const n = nudges.get(e.kind) ?? { shown: 0, clicked: 0, dismissed: 0 };
        n[e.type.slice(6)]++;
        nudges.set(e.kind, n);
        if (e.type === "nudge_clicked") aiSessions.add(e.sessionId);
        break;
      }
      case "chat_message":
        userMessages++; aiSessions.add(e.sessionId);
        if (e.text) questions.push({ ts: e.ts, text: e.text, mode: e.mode });
        break;
      case "ai_recommended": for (const id of e.productIds ?? []) inc(aiRecs, id); break;
      case "add_to_cart": inc(e.source === "ai" ? cartAi : cartManual, e.productId, e.quantity ?? 1); break;
      case "purchase": buyers.add(e.sessionId); break;
    }
  }
  // second pass: purchases split by whether the session talked to the AI
  for (const e of events) {
    if (e.type !== "purchase") continue;
    orders++; revenue += e.value ?? 0;
    if (aiSessions.has(e.sessionId)) { ordersAi++; revenueAi += e.value ?? 0; }
  }

  const nonAiSessions = sessions.size - aiSessions.size;
  const buyersAi = [...buyers].filter((s) => aiSessions.has(s)).length;
  const buyersNonAi = buyers.size - buyersAi;

  // products people look at a lot but rarely add to cart → presentation problem?
  const viewedNotBought = [...views.entries()]
    .map(([id, v]) => ({ id, name: nameOf(id), views: v, carts: (cartAi.get(id) ?? 0) + (cartManual.get(id) ?? 0) }))
    .filter((r) => r.views >= 3 && r.carts / r.views < 0.15)
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  return {
    hasDemoData: events.some((e) => e.demo),
    totals: {
      events: events.length,
      sessions: sessions.size,
      aiSessions: aiSessions.size,
      userMessages,
      orders, revenue, ordersAi, revenueAi,
      avgOrderAi: ordersAi ? Math.round(revenueAi / ordersAi) : 0,
      avgOrderNonAi: orders - ordersAi ? Math.round((revenue - revenueAi) / (orders - ordersAi)) : 0,
      conversionAi: pct(buyersAi, aiSessions.size),
      conversionNonAi: pct(buyersNonAi, nonAiSessions),
    },
    offer: { ...offer, acceptRate: pct(offer.chat + offer.voice, offer.shown) },
    nudges: [...nudges.entries()]
      .map(([kind, n]) => ({ kind, name: NUDGE_LABELS[kind] ?? kind, ...n, clickRate: pct(n.clicked, n.shown) }))
      .sort((a, b) => b.shown - a.shown),
    topViewed: top(views),
    topSearches: top(searches, 8, (q) => q),
    searchMisses: top(searchMisses, 6, (q) => q),
    topRecommended: top(aiRecs),
    addToCartAi: top(cartAi),
    addToCartManual: top(cartManual),
    viewedNotBought,
    recentQuestions: questions.slice(-40).reverse(),
  };
}

// ---- demo data so the dashboard can be shown before real traffic exists ----
export async function seedDemo(clientId, sessionCount = 180) {
  const batch = [];
  const record = (e) => batch.push({ ...e, clientId });
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rnd(arr.length)];
  const sampleQuestions = [
    "Jaký telefon s dobrým foťákem do 12 tisíc?",
    "Jaký je rozdíl mezi Nova X15 a X15 Pro?",
    "Potřebuju notebook na školu, hlavně aby vydržel baterie.",
    "Hodí se ta OLED televize na PS5?",
    "Jaká sluchátka do letadla?",
    "Kdy mi to přijde, když objednám dnes?",
    "Dá se telefon koupit na splátky?",
    "Hledám dárek pro tátu do 2000 Kč.",
    "Má ten telefon v balení nabíječku?",
    "Jak funguje výkup starého telefonu?",
    "Který robotický vysavač je dobrý na psí chlupy?",
    "Stačí 16 GB RAM na střih videa?",
  ];
  const sampleSearches = [
    ["iphone", 0], ["sluchátka", 4], ["notebook", 5], ["televize 55", 2], ["nabíječka", 2], ["ps5", 0],
    ["powerbanka", 1], ["tablet pro děti", 1], ["vysavač", 2], ["macbook", 0], ["hodinky", 3], ["airpods", 0],
  ];
  const nudgeKinds = ["bundle", "freeship", "hes-compare", "hes-product", "hes-filters", "hes-cart", "service", "deal", "accessory", "search-miss", "idle"];
  const clickChance = { bundle: 0.34, freeship: 0.28, "hes-compare": 0.52, "hes-product": 0.41, "hes-filters": 0.47, "hes-cart": 0.33, service: 0.18, deal: 0.22, accessory: 0.15, "search-miss": 0.5, idle: 0.1 };
  const now = Date.now();
  // weight views towards a few "popular" products so the charts look realistic
  const popular = ["m1", "m1", "m1", "m4", "m4", "n1", "n3", "n3", "t1", "a1", "a2", "g1", "h1", "h1"];
  for (let i = 0; i < sessionCount; i++) {
    const sessionId = `demo-${now}-${i}`;
    let ts = now - rnd(14 * 24 * 3600e3);
    const ev = (type, extra = {}) => record({ type, sessionId, ts: (ts += 5000 + rnd(60000)), demo: true, ...extra });
    ev("session_start");
    ev("offer_shown");
    const r = Math.random();
    let usedAi = r < 0.3;
    if (usedAi) ev("offer_accepted", { mode: Math.random() < 0.3 ? "voice" : "chat" });
    else ev("offer_declined");

    if (Math.random() < 0.35) { const [q, n] = pick(sampleSearches); ev("search", { query: q, results: n }); }
    const viewed = [];
    for (let v = 0; v < 1 + rnd(5); v++) {
      const id = Math.random() < 0.6 ? pick(popular) : pick(products).id;
      viewed.push(id);
      ev("product_view", { productId: id });
    }
    for (let k = 0; k < rnd(3); k++) {
      const kind = pick(nudgeKinds);
      ev("nudge_shown", { kind });
      if (Math.random() < clickChance[kind]) { ev("nudge_clicked", { kind }); usedAi = true; }
      else if (Math.random() < 0.4) ev("nudge_dismissed", { kind });
    }
    if (usedAi) {
      for (let q = 0; q < 1 + rnd(3); q++) ev("chat_message", { text: pick(sampleQuestions), mode: "chat" });
      const recs = [pick(popular), pick(products).id];
      ev("ai_recommended", { productIds: recs });
      if (Math.random() < 0.45) ev("add_to_cart", { productId: recs[0], quantity: 1, source: "ai" });
      if (Math.random() < 0.35) ev("add_to_cart", { productId: pick(["x2", "x3", "a2", "x1"]), quantity: 1, source: "ai" });
    }
    if (Math.random() < 0.25) ev("add_to_cart", { productId: viewed[0], quantity: 1, source: "user" });
    if (Math.random() < (usedAi ? 0.3 : 0.1)) {
      const value = getProduct(viewed[0]).price + (usedAi && Math.random() < 0.5 ? 790 : 0);
      ev("purchase", { value });
    }
  }
  await recordMany(batch);
}
