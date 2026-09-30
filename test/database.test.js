// Runs supabase/schema.sql in an in-memory Postgres (PGlite) and checks the SQL functions:
// the dashboard totals must match the JavaScript version exactly.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { aggregate, finish, redact } from "../lib/analytics.js";

let pg;
before(async () => {
  pg = new PGlite();
  // what Supabase has and plain Postgres doesn't
  await pg.exec(`create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
    create role anon; create role authenticated;`);
  const schema = fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  await pg.exec(schema);
  await pg.exec(schema); // must be safe to run again
});
after(() => pg?.close());

// deterministic pseudo-random traffic
function traffic(n = 400) {
  let seed = 7; // mulberry32
  const rnd = (k) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) % k);
  };
  const pick = (a) => a[rnd(a.length)];
  const types = ["session_start", "product_view", "product_view", "search", "offer_shown", "offer_accepted", "offer_declined",
    "assistant_opened", "nudge_shown", "nudge_clicked", "nudge_dismissed", "chat_message", "ai_recommended", "add_to_cart", "purchase", "page_view"];
  const products = ["p1", "p2", "p3", "p4", "p5", "p6"];
  const events = [];
  for (let i = 0; i < n; i++) {
    const type = pick(types);
    const e = { type, sessionId: rnd(20) === 0 ? undefined : `s${rnd(40)}`, ts: 1_700_000_000_000 + i * 1000 };
    if (type === "product_view") e.productId = pick(products);
    if (type === "search") { e.query = pick(["Káva ", "mlýnek", "kava", "dárek"]); e.results = rnd(3); }
    if (type === "offer_accepted") e.mode = pick(["chat", "voice"]);
    if (type.startsWith("nudge_")) e.kind = pick(["bundle", "freeship", "idle"]);
    if (type === "chat_message") { e.text = `otázka ${i}`; e.mode = pick(["chat", "voice"]); }
    if (type === "ai_recommended") e.productIds = [pick(products), pick(products)];
    if (type === "add_to_cart") { e.productId = pick(products); e.quantity = 1 + rnd(3); if (rnd(3)) e.source = pick(["ai", "user"]); }
    if (type === "purchase") e.value = 100 * (1 + rnd(20));
    events.push(e);
  }
  return events;
}

test("dashboard_summary (SQL) matches the JavaScript aggregation", async () => {
  const events = traffic();
  await pg.query("insert into clients (id, name) values ('shop', 'Shop'), ('other', 'Other')");
  for (const { type, sessionId, ts, ...data } of events) {
    await pg.query("insert into events (client_id, session_id, type, ts, data) values ('shop', $1, $2, $3, $4)", [sessionId ?? null, type, ts, JSON.stringify(data)]);
  }
  // another client's events and old events must not count
  await pg.query("insert into events (client_id, session_id, type, ts, data) values ('other', 's1', 'purchase', $1, '{\"value\": 999}')", [1_700_000_100_000]);
  await pg.query("insert into events (client_id, session_id, type, ts, data) values ('shop', 's1', 'purchase', 5, '{\"value\": 999}')");

  const { rows } = await pg.query("select dashboard_summary('shop', 1000) as s");
  const cat = { getProduct: (id) => ({ name: `Produkt ${id}` }) };
  const fromSql = finish(rows[0].s, cat);
  const fromJs = finish(aggregate(events), cat);
  assert.ok(fromJs.totals.orders > 0 && fromJs.totals.aiSessions > 0 && fromJs.viewedNotBought.length >= 0);
  assert.deepEqual(fromSql, fromJs);
});

test("add_usage adds up atomically per client and month", async () => {
  await pg.query("select add_usage('shop', '2026-09', 1, 2, 100, 10, 0, 0, 0, 0.5)");
  const { rows } = await pg.query("select * from add_usage('shop', '2026-09', p_messages => 1, p_tts => 300)");
  assert.equal(rows[0].messages, 2);
  assert.equal(rows[0].ai_calls, 2);
  assert.equal(Number(rows[0].tts_chars), 300);
  assert.equal(Number(rows[0].cost_usd), 0.5);
});

test("hit_rate_limit counts within a window", async () => {
  const hit = async () => (await pg.query("select hit_rate_limit('k', 60000, 2) as ok")).rows[0].ok;
  assert.equal(await hit(), true);
  assert.equal(await hit(), true);
  assert.equal(await hit(), false);
  await pg.query("update rate_limits set window_start = window_start - 60001 where key = 'k'"); // window over
  assert.equal(await hit(), true);
});

test("schema removes the old simulated demo data", async () => {
  await pg.query("insert into events (client_id, type, ts, demo) values ('shop', 'page_view', 1, true)");
  await pg.exec("delete from events where demo;");
  const { rows } = await pg.query("select count(*)::int as n from events where demo");
  assert.equal(rows[0].n, 0);
});

test("contact details are masked in stored chat questions", () => {
  assert.equal(redact("pište na jan.novak@seznam.cz nebo +420 777 123 456"), "pište na [e-mail] nebo [číslo]");
  assert.equal(redact("karta 4111 1111 1111 1111"), "karta [číslo]");
  assert.equal(redact("televize 55 palců do 20 000 Kč"), "televize 55 palců do 20 000 Kč");
});
