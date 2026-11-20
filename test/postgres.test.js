// The app against a real Postgres: an in-memory PGlite with db/schema.sql, plugged in where Railway's
// Postgres would be. Checks every kind of database call the server makes – and that values come back
// as the rest of the app expects them (numbers, ISO times, arrays, JSON objects).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import { useDatabase, ensureSchema, PARSERS, query, upsert } from "../lib/db.js";
import { validateClient, saveClient, getClient, listClients, setBilling, deleteClient, clearClientCache } from "../lib/clients.js";
import { recordUsage, getUsage, usageForMonth } from "../lib/usage.js";
import { hit } from "../lib/ratelimit.js";
import { addPlanRequest, listPlanRequests, markPlanRequestDone, deletePlanRequest } from "../lib/requests.js";
import { addDoc, listDocs, deleteDoc } from "../lib/bot.js";
import { recordMany, summarize, purgeOld } from "../lib/analytics.js";

let pg;
before(async () => {
  pg = new PGlite({ parsers: PARSERS });
  await ensureSchema(pg);
  await ensureSchema(pg); // runs at every server start: must be safe again
  useDatabase(pg);
  clearClientCache();
});
after(async () => { useDatabase(null); await pg?.close(); });

test("clients: saved with arrays and JSON, read back as the app expects", async () => {
  const { row, error } = validateClient({ id: "obchod", name: "Obchod", domains: "obchod.cz, www.obchod.sk", plan: "start", info: { doprava: "zdarma" } }, { isNew: true });
  assert.equal(error, undefined);
  await saveClient(row, { isNew: true });
  const c = await getClient("obchod", { includeInactive: true });
  assert.deepEqual(c.domains, ["obchod.cz", "obchod.sk"]);
  assert.deepEqual(c.info, { doprava: "zdarma" });
  assert.match(c.createdAt, /^\d{4}-\d\d-\d\dT.*Z$/); // an ISO string, like before
  await setBilling("obchod", { status: "active", active: true, paidUntil: "2026-12-20T10:00:00.000Z" });
  const paid = await getClient("obchod", { includeInactive: true });
  assert.equal(paid.billing, "active");
  assert.equal(paid.paidUntil, "2026-12-20T10:00:00.000Z");
  assert.ok((await listClients()).some((x) => x.id === "kavarna")); // the schema seeds the showcase shops
  await deleteClient("obchod");
  assert.equal(await getClient("obchod", { includeInactive: true }), null);
});

test("usage adds up atomically and comes back as numbers", async () => {
  const client = { id: "kavarna", name: "Bohème", plan: "internal" };
  await recordUsage(client, { messages: 1, claude: [{ input_tokens: 1000, output_tokens: 100 }], model: "claude-haiku-5-5", ttsChars: 300 });
  await recordUsage(client, { messages: 2, ttsChars: 200 });
  const month = new Date().toISOString().slice(0, 7);
  const [u] = (await usageForMonth(month)).filter((x) => x.client_id === "kavarna");
  assert.equal(u.messages, 3);
  assert.equal(u.tts_chars, 500);
  assert.equal(typeof u.cost_usd, "number");
  assert.ok(u.cost_usd > 0);
  assert.equal((await getUsage("kavarna", month)).input_tokens, 1000);
});

test("rate limits are counted in the database", async () => {
  assert.equal(await hit("pg-test", 60e3, 2), true);
  assert.equal(await hit("pg-test", 60e3, 2), true);
  assert.equal(await hit("pg-test", 60e3, 2), false);
});

test("custom plan requests: add, list, done, delete", async () => {
  const saved = await addPlanRequest({ email: "a@b.cz", shop: "", web: "b.cz", note: "Víc zpráv", lang: "cs", clientId: null });
  assert.match(saved.id, /^\d+$/);
  assert.match(saved.at, /Z$/);
  assert.equal((await listPlanRequests())[0].email, "a@b.cz");
  assert.equal(await markPlanRequestDone(saved.id), true);
  assert.ok((await listPlanRequests())[0].doneAt);
  assert.equal(await deletePlanRequest(saved.id), true);
  assert.equal((await listPlanRequests()).length, 0);
});

test("the owner's documents", async () => {
  await addDoc("kavarna", { title: "Reklamace", text: "Reklamace vyřídíme do 14 dní." });
  const [doc] = await listDocs("kavarna");
  assert.equal(doc.title, "Reklamace");
  assert.equal(doc.chars, 29);
  await deleteDoc("kavarna", doc.id);
  assert.equal((await listDocs("kavarna")).length, 0);
});

test("events: stored, summed up by the dashboard function, purged", async () => {
  const now = Date.now();
  await recordMany([
    { clientId: "kavarna", sessionId: "s1", type: "chat_message", text: "Máte bezkofeinovou?", ts: now },
    { clientId: "kavarna", sessionId: "s1", type: "purchase", value: 499, ts: now },
    { clientId: "kavarna", sessionId: "s2", type: "page_view", ts: 5 },
  ]);
  const s = await summarize("kavarna", null);
  assert.equal(s.totals.userMessages, 1);
  assert.equal(s.totals.revenue, 499);
  assert.equal(s.recentQuestions[0].text, "Máte bezkofeinovou?");
  assert.equal(await purgeOld(), 1); // the one from 1970
});

test("a gzipped catalog round-trips through bytea", async () => {
  const data = { products: [{ id: "p1", name: "Káva" }] };
  await upsert("catalogs", { client_id: "kavarna", products: zlib.gzipSync(JSON.stringify(data)), product_count: 1, error: null }, ["client_id"]);
  const [row] = await query("select products, product_count from catalogs where client_id = $1", ["kavarna"]);
  assert.deepEqual(JSON.parse(zlib.gunzipSync(row.products).toString()), data);
  assert.equal(row.product_count, 1);
});
