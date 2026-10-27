// E-mail confirmation and the forgotten password, with e-mail switched on: the real server sends its
// mails to a small local stand-in for Resend, so the tests read the links the owner would get.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 4010 + Math.floor(Math.random() * 9);
const base = `http://127.0.0.1:${PORT}`;
const own = { Origin: base };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sella-account-"));
const outbox = [];
let server, resend;

before(async () => {
  resend = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { outbox.push(JSON.parse(body)); res.setHeader("Content-Type", "application/json"); res.end('{"id":"test"}'); });
  });
  await new Promise((r) => resend.listen(0, "127.0.0.1", r));
  server = spawn(process.execPath, [fileURLToPath(new URL("../server.js", import.meta.url))], {
    cwd: os.tmpdir(),
    env: {
      PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: "test-master-password",
      RESEND_API_KEY: "test", RESEND_API_URL: `http://127.0.0.1:${resend.address().port}/emails`,
    },
    stdio: "pipe",
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/api/health")).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
after(() => { server?.kill(); resend?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const post = (p, body, headers = {}) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...own, ...headers }, body: JSON.stringify(body) });
const cookieOf = (r) => ({ Cookie: r.headers.get("set-cookie").split(";")[0] });
const overview = async (headers) => (await (await fetch(`${base}/api/analytics`, { headers })).json()).client;
const linkIn = (mail) => mail.text.match(/https?:\/\/\S+/)[0];
const shop = { name: "Pekárna Pod Hrází", domain: "pekarna-hraz.cz", email: "pekar@pekarna-hraz.cz", password: "dlouhe-heslo-123", plan: "start", terms: true };

test("a new sign-up confirms its e-mail before it can pay", async () => {
  const r = await post("/api/signup", { ...shop, lang: "en" });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).verify, true);
  const asOwner = cookieOf(r);
  const mail = outbox.at(-1);
  assert.deepEqual(mail.to, [shop.email]);
  assert.match(mail.subject, /confirm/i); // in the language the shop signed up in
  assert.match(linkIn(mail), new RegExp(`^${base}/api/account/verify\\?t=`));

  assert.equal((await overview(asOwner)).emailVerified, false);
  const pay = await post("/api/billing/checkout", { plan: "start" }, asOwner);
  assert.equal(pay.status, 403);
  assert.equal((await pay.json()).code, "verify");

  // "send again" e-mails the same kind of link
  const again = await post("/api/account/verify/resend", {}, asOwner);
  assert.deepEqual(await again.json(), { ok: true, to: shop.email });
  assert.equal(outbox.length, 2);

  // a made-up or altered link confirms nothing
  const bad = await fetch(`${base}/api/account/verify?t=${linkIn(mail).split("t=")[1].slice(0, -2)}xx`, { redirect: "manual" });
  assert.equal(bad.headers.get("location"), "/admin/?verified=0");
  const ok = await fetch(linkIn(mail), { redirect: "manual" });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get("location"), "/admin/?verified=1");
  assert.equal((await overview(asOwner)).emailVerified, true);
  assert.deepEqual(await (await post("/api/account/verify/resend", {}, asOwner)).json(), { ok: true, already: true });
  assert.deepEqual(await (await post("/api/billing/checkout", { plan: "start" }, asOwner)).json(), { done: true });
});

test("an unconfirmed sign-up doesn't hold its e-mail – signing up again replaces it", async () => {
  const email = "nekdo@kvetiny-vaza.cz";
  const first = await post("/api/signup", { ...shop, name: "Květiny Váza", domain: "kvetiny-vaza.cz", email });
  assert.equal(first.status, 200);
  const second = await post("/api/signup", { ...shop, name: "Květiny Váza 2", domain: "kvetiny-vaza.cz", email });
  assert.equal(second.status, 200);
  // the first account is gone, the new one works
  assert.equal((await fetch(`${base}/api/analytics`, { headers: cookieOf(first) })).status, 404);
  assert.equal((await overview(cookieOf(second))).name, "Květiny Váza 2");
  // a confirmed account keeps its e-mail
  assert.equal((await post("/api/signup", { ...shop, name: "Jiná pekárna", domain: "jina-pekarna.cz" })).status, 409);
});

test("a forgotten password is set again through a one-off e-mailed link", async () => {
  const sent = outbox.length;
  // no such account: the same answer, and no e-mail
  assert.deepEqual(await (await post("/api/password/forgot", { email: "nikdo@nikde.cz" })).json(), { ok: true, mail: true });
  assert.equal(outbox.length, sent);

  assert.deepEqual(await (await post("/api/password/forgot", { email: "PEKAR@pekarna-hraz.cz" })).json(), { ok: true, mail: true });
  assert.equal(outbox.length, sent + 1);
  const link = linkIn(outbox.at(-1));
  assert.match(link, new RegExp(`^${base}/sella/nove-heslo\\.html#t=`));
  const token = link.split("#t=")[1];

  assert.equal((await (await post("/api/password/reset", { token: token + "x", password: "nove-heslo-456" })).json()).code, "link");
  assert.equal((await (await post("/api/password/reset", { token, password: "kratke" })).json()).code, "password");
  assert.equal((await post("/api/password/reset", { token, password: "nove-heslo-456" }, { Origin: "https://evil.example" })).status, 403);
  const reset = await post("/api/password/reset", { token, password: "nove-heslo-456" });
  assert.deepEqual(await reset.json(), { ok: true });
  assert.equal((await overview(cookieOf(reset))).name, shop.name); // signed in right away

  // the link works once: the password it was made for has changed
  assert.equal((await (await post("/api/password/reset", { token, password: "jeste-jine-789" })).json()).code, "link");
  assert.equal((await post("/api/admin/login", { client: shop.email, password: shop.password })).status, 401);
  assert.equal((await post("/api/admin/login", { client: shop.email, password: "nove-heslo-456" })).status, 200);
});

test("the confirm-your-e-mail screen: where the link went, and fixing a typo", async () => {
  const r = await post("/api/signup", { ...shop, name: "Sýrárna", domain: "syrarna.cz", email: "syry@syrarna.cz" });
  const asOwner = cookieOf(r);
  assert.deepEqual(await (await fetch(`${base}/api/account`, { headers: asOwner })).json(), { email: "syry@syrarna.cz", verified: false, mail: true });
  assert.equal((await fetch(`${base}/api/account`)).status, 401);

  assert.equal((await (await post("/api/account/email", { email: "nope" }, asOwner)).json()).code, "email");
  assert.equal((await (await post("/api/account/email", { email: shop.email }, asOwner)).json()).code, "taken");
  assert.deepEqual(await (await post("/api/account/email", { email: "Syrarna@Example.cz" }, asOwner)).json(), { ok: true, to: "syrarna@example.cz" });
  assert.deepEqual(outbox.at(-1).to, ["syrarna@example.cz"]);
  // the link sent to the old address no longer confirms anything
  const old = outbox.findLast((m) => m.to[0] === "syry@syrarna.cz");
  assert.equal((await fetch(linkIn(old), { redirect: "manual" })).headers.get("location"), "/admin/?verified=0");
  await fetch(linkIn(outbox.at(-1)), { redirect: "manual" });
  assert.equal((await (await fetch(`${base}/api/account`, { headers: asOwner })).json()).verified, true);
  // once confirmed, the address is changed only with us
  assert.equal((await post("/api/account/email", { email: "jiny@example.cz" }, asOwner)).status, 400);
});
