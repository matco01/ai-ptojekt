// Self sign-up and payments: a new shop can sign in and see its overview, but its widget and embed
// code work only after it pays. Runs the real server in development mode (simulated payments,
// local files in a temp folder) – no Stripe, Claude or database involved.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { billingFromSubscription } from "../lib/billing.js";

test("Stripe subscription states map to billing and the widget switch", () => {
  assert.deepEqual(billingFromSubscription("active"), { status: "active", active: true });
  assert.deepEqual(billingFromSubscription("trialing"), { status: "active", active: true });
  assert.deepEqual(billingFromSubscription("past_due"), { status: "past_due", active: true }); // grace while Stripe retries
  assert.deepEqual(billingFromSubscription("incomplete"), { status: "unpaid", active: false });
  for (const s of ["canceled", "unpaid", "incomplete_expired", "paused"]) assert.equal(billingFromSubscription(s).active, false);
});

const PORT = 3990 + Math.floor(Math.random() * 9);
const base = `http://127.0.0.1:${PORT}`;
const own = { Origin: base };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sella-signup-"));
let server;

before(async () => {
  server = spawn(process.execPath, [fileURLToPath(new URL("../server.js", import.meta.url))], {
    cwd: os.tmpdir(),
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: "test-master-password" },
    stdio: "pipe",
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/api/health")).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
after(() => { server?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const post = (p, body, headers = {}) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...own, ...headers }, body: JSON.stringify(body) });
const shop = { name: "Kavárna U Lípy", domain: "https://www.ulipy.cz/eshop", email: "Majitel@ULipy.cz", password: "dlouhe-heslo-123", plan: "start", terms: true };

test("sign-up checks its input", async () => {
  const bad = async (patch) => (await (await post("/api/signup", { ...shop, ...patch })).json()).code;
  assert.equal(await bad({ name: "" }), "name");
  assert.equal(await bad({ domain: "not a domain" }), "domain");
  assert.equal(await bad({ email: "nope" }), "email");
  assert.equal(await bad({ password: "short" }), "password");
  assert.equal(await bad({ plan: "trial" }), "plan");     // free plans can't be picked – everyone pays
  assert.equal(await bad({ plan: "internal" }), "plan");
  assert.equal(await bad({ terms: false }), "terms");
  assert.equal((await post("/api/signup", shop, { Origin: "https://evil.example" })).status, 403);
});

test("a signed-up shop sees its overview, but its widget works only after paying", async () => {
  const r = await post("/api/signup", shop);
  assert.equal(r.status, 200);
  const { id } = await r.json();
  assert.equal(id, "kavarna-u-lipy");
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const asOwner = { Cookie: cookie };

  // the same e-mail or shop can't sign up twice
  assert.equal((await post("/api/signup", { ...shop, name: "Jiná" })).status, 409);
  assert.equal((await post("/api/signup", { ...shop, email: "jiny@ulipy.cz" })).status, 409);

  // overview: waiting for payment
  let d = await (await fetch(`${base}/api/analytics`, { headers: asOwner })).json();
  assert.equal(d.client.id, id);
  assert.deepEqual(d.client.domains, ["ulipy.cz"]);
  assert.equal(d.billing.needsPayment, true);
  assert.equal(d.billing.payments, "simulated");

  // the widget refuses the unpaid shop, even on its own domain
  const widget = { Origin: "https://ulipy.cz" };
  assert.equal((await fetch(`${base}/api/status?client=${id}`, { headers: widget })).status, 402);
  assert.equal((await post("/api/chat", { client: id, sessionId: "test-session-1", text: "ahoj" }, widget)).status, 402);
  // …and the owner can't pick a plan without paying
  assert.equal((await post("/api/analytics/plan", { plan: "pro" }, asOwner)).status, 402);

  // signing in with the e-mail works too
  const login = await post("/api/admin/login", { client: "majitel@ulipy.cz", password: shop.password });
  assert.equal(login.status, 200);

  // pay (simulated) → active, the widget runs on the shop's domain only
  const paid = await post("/api/billing/checkout", { plan: "standard" }, asOwner);
  assert.deepEqual(await paid.json(), { done: true });
  d = await (await fetch(`${base}/api/analytics`, { headers: asOwner })).json();
  assert.equal(d.billing.needsPayment, false);
  assert.equal(d.billing.status, "active");
  assert.equal(d.usage.planId, "standard");
  const status = await fetch(`${base}/api/status?client=${id}`, { headers: widget });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).on, true);
  assert.equal((await fetch(`${base}/api/status?client=${id}`, { headers: { Origin: "https://evil.example" } })).status, 403);

  // the owner moves the shop to a new domain
  assert.equal((await post("/api/analytics/settings", { domains: "ulipy.cz, kava-ulipy.cz", feedUrl: "" }, asOwner)).status, 200);
  assert.equal((await fetch(`${base}/api/status?client=${id}`, { headers: { Origin: "https://kava-ulipy.cz" } })).status, 200);
  assert.equal((await post("/api/analytics/settings", { domains: "", feedUrl: "" }, asOwner)).status, 400);
});

test("owners can't change the showcase shops; webhooks need Stripe set up", async () => {
  const login = await post("/api/admin/login", { client: "kavarna", password: "wrong-password" });
  assert.equal(login.status, 401);
  assert.equal((await post("/api/billing/checkout", { plan: "start" })).status, 401);
  assert.equal((await fetch(base + "/api/stripe/webhook", { method: "POST", body: "{}" })).status, 503);
});
