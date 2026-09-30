// Starts the real server (as in production, without Claude and database) and checks the access rules.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";

const PORT = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${PORT}`;
const own = { Origin: base };
let server;

before(async () => {
  server = spawn(process.execPath, [fileURLToPath(new URL("../server.js", import.meta.url))], {
    cwd: os.tmpdir(), // no .env.local from the project → no real API keys or database in tests
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, PORT: String(PORT), VERCEL: "1", ADMIN_TOKEN: "test-master-password" },
    stdio: "pipe",
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/api/health")).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
after(() => server?.kill());

const post = (path, body, headers = {}) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

test("health check", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test("widget requests need a known client and an allowed site", async () => {
  assert.equal((await post("/api/persona", {}, own)).status, 404); // no data-client
  assert.equal((await post("/api/persona", { client: "nope" }, own)).status, 404);
  assert.equal((await post("/api/persona", { client: "kavarna" }, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await post("/api/persona", { client: "kavarna" }, { Origin: "http://localhost:3000" })).status, 403); // production
  assert.equal((await post("/api/persona", { client: "kavarna" })).status, 403); // no Origin at all
  const ok = await post("/api/persona", { client: "kavarna" }, own);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), base);
});

test("chat without an API key answers in the simple mode", async () => {
  const r = await post("/api/chat", { client: "kavarna", sessionId: "test-session-1", text: "Jakou kávu na espresso?", context: {} }, own);
  const body = await r.text();
  assert.match(body, /"offline":true/);
  assert.match(body, /"type":"done"/);
});

test("dashboard needs a login; the mock-data endpoints are gone", async () => {
  assert.equal((await fetch(base + "/api/analytics?client=kavarna")).status, 401);
  assert.equal((await fetch(base + "/api/analytics?client=kavarna", { headers: { "X-Admin-Token": "test-master-password" } })).status, 401); // old header no longer works
  assert.equal((await post("/api/analytics/seed?client=kavarna", {}, own)).status, 404);
  assert.equal((await post("/api/analytics/reset?client=kavarna", {}, own)).status, 404);
  assert.equal((await fetch(base + "/api/admin/clients")).status, 403);
});

test("login flow: wrong password, foreign site, operator login", async () => {
  assert.equal((await post("/api/admin/login", { client: "admin", password: "wrong" }, own)).status, 401);
  assert.equal((await post("/api/admin/login", { client: "kavarna", password: "anything" }, own)).status, 401);
  assert.equal((await post("/api/admin/login", { client: "admin", password: "test-master-password" }, { Origin: "https://evil.example" })).status, 403);

  const r = await post("/api/admin/login", { client: "admin", password: "test-master-password" }, own);
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie");
  assert.match(cookie, /aip_admin=.+; Path=\/; HttpOnly; SameSite=Strict/);
  const session = { Cookie: cookie.split(";")[0] };

  const me = await (await fetch(base + "/api/admin/me", { headers: session })).json();
  assert.equal(me.master, true);
  const stats = await fetch(base + "/api/analytics?client=kavarna", { headers: session });
  assert.equal(stats.status, 200);
  const d = await stats.json();
  assert.equal(d.client.id, "kavarna");
  assert.equal(d.usage.plan, "Interní");
  assert.equal("hasDemoData" in d, false);
  const clients = await (await fetch(base + "/api/admin/clients", { headers: session })).json();
  assert.ok(clients.clients.some((c) => c.id === "techmarket"));
  const csv = await fetch(base + "/api/admin/usage.csv", { headers: session });
  assert.match(await csv.text(), /client_id;name;plan/);
});

test("the daily job needs the cron secret", async () => {
  assert.equal((await fetch(base + "/api/cron/daily")).status, 401);
});
