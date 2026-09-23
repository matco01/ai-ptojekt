// Behaviour tracking + aggregation for the shop-owner dashboard.
// Events are appended to data/events.jsonl (one JSON object per line) –
// good enough for a prototype; swap for a real DB in production.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProduct, products } from "./catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");
const file = path.join(dataDir, "events.jsonl");
fs.mkdirSync(dataDir, { recursive: true });

export const EVENT_TYPES = new Set([
  "session_start", "page_view", "category_view", "product_view", "search",
  "offer_shown", "offer_accepted", "offer_declined", "assistant_opened",
  "nudge_shown", "nudge_clicked", "nudge_dismissed",
  "chat_message", "ai_recommended", "add_to_cart", "purchase",
]);

export const NUDGE_LABELS = {
  bundle: "Set se slevou",
  freeship: "Doprava zdarma",
  "search-miss": "Neúspěšné hledání",
  compare: "Nabídka porovnání",
  service: "Služba (výkup, záruka…)",
  deal: "Sleva v kategorii",
  accessory: "Příslušenství v košíku",
  dwell: "Dlouho na produktu",
  "multi-search": "Opakované hledání",
  idle: "Nečinnost na úvodu",
};

export function record(event) {
  const clean = { ts: event.ts ?? Date.now(), ...event };
  fs.appendFileSync(file, JSON.stringify(clean) + "\n");
}

function readAll() {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export function reset() {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

const nameOf = (id) => getProduct(id)?.name ?? id;
const top = (counter, n = 8, label = nameOf) =>
  [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, count]) => ({ id, name: label(id), count }));
const inc = (m, k, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function summarize() {
  const events = readAll();
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
export function seedDemo(sessionCount = 180) {
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
  const nudgeKinds = ["bundle", "freeship", "compare", "service", "deal", "accessory", "dwell", "search-miss", "idle"];
  const clickChance = { bundle: 0.34, freeship: 0.28, compare: 0.45, service: 0.18, deal: 0.22, accessory: 0.15, dwell: 0.3, "search-miss": 0.5, idle: 0.1 };
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
}
