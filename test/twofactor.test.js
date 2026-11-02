// Optional two-step sign-in: the code maths, and the whole flow against the real server (development
// mode, local files in a temp folder).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeAt, matchStep, otpauthUrl } from "../lib/twofactor.js";

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // "12345678901234567890" in base32

test("codes match the RFC 6238 test vectors", () => {
  assert.equal(codeAt(RFC_SECRET, 1), "287082");           // T = 59 s
  assert.equal(codeAt(RFC_SECRET, 37037036), "081804");    // T = 1111111109 s
  assert.equal(codeAt(RFC_SECRET, 66666666), "279037");    // T = 1999999999 s
});

test("a code counts within one step either way, and never twice", () => {
  const now = 1_700_000_000_000, step = Math.floor(now / 30e3);
  assert.equal(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step), { now }), step);
  assert.equal(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step - 1), { now }), step - 1);
  assert.equal(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step + 1), { now }), step + 1);
  assert.equal(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step + 2), { now }), null);
  assert.equal(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step), { now, lastStep: step }), null);
  assert.equal(matchStep(RFC_SECRET, "abc", { now }), null);
  assert.match(otpauthUrl(RFC_SECRET, "a@b.cz"), /^otpauth:\/\/totp\/Sella%3Aa%40b\.cz\?secret=GEZ.*issuer=Sella/);
});

const PORT = 4030 + Math.floor(Math.random() * 9);
const base = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sella-2fa-"));
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

const post = (p, body, headers = {}) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, ...headers }, body: JSON.stringify(body) });
const cookieOf = (r) => r.headers.get("set-cookie")?.split(";")[0];
const PASSWORD = "dlouhe-heslo-123";
const stepNow = () => Math.floor(Date.now() / 30e3);

test("two-step sign-in is optional, and once on, the password alone doesn't sign in", async () => {
  const signup = await post("/api/signup", { name: "Dvoufázový Obchod", domain: "dvoufaz.cz", email: "majitel@dvoufaz.cz", password: PASSWORD, plan: "start", terms: true });
  assert.equal(signup.status, 200);
  const owner = { Cookie: cookieOf(signup) };

  // off by default: the password signs in, as before
  let login = await post("/api/admin/login", { client: "majitel@dvoufaz.cz", password: PASSWORD });
  assert.ok(cookieOf(login));
  assert.equal((await (await fetch(`${base}/api/analytics`, { headers: owner })).json()).client.twoFactor.on, false);

  // switching on needs the password, and nothing changes until the first code is confirmed
  const setup = await (await post("/api/account/2fa/start", { password: PASSWORD }, owner)).json();
  assert.match(setup.qr, /<svg/);
  assert.ok(cookieOf(await post("/api/admin/login", { client: "majitel@dvoufaz.cz", password: PASSWORD })));
  assert.equal((await post("/api/account/2fa/confirm", { ticket: setup.ticket, code: "000000" === codeAt(setup.secret, stepNow()) ? "111111" : "000000" }, owner)).status, 400);
  const confirmed = await post("/api/account/2fa/confirm", { ticket: setup.ticket, code: codeAt(setup.secret, stepNow()) }, owner);
  assert.equal(confirmed.status, 200);
  const { recoveryCodes } = await confirmed.json();
  assert.equal(recoveryCodes.length, 8);
  const stored = fs.readFileSync(path.join(dataDir, "clients.json"), "utf8");
  assert.ok(!stored.includes(setup.secret) && !stored.includes(recoveryCodes[0]), "secret and recovery codes aren't stored readable");

  // now the password alone gives a ticket, not a session
  login = await post("/api/admin/login", { client: "majitel@dvoufaz.cz", password: PASSWORD });
  const { twoFactor, ticket } = await login.json();
  assert.equal(twoFactor, true);
  assert.equal(cookieOf(login), undefined);
  assert.equal((await fetch(`${base}/api/analytics`, { headers: { Cookie: `aip_admin=${ticket}` } })).status, 401); // a ticket is no session

  // a wrong code fails; the right one signs in; the same code can't be used again
  const wrong = String((Number(codeAt(setup.secret, stepNow() + 1)) + 1) % 1e6).padStart(6, "0");
  assert.equal((await post("/api/admin/login/2fa", { ticket, code: wrong })).status, 401);
  const code = codeAt(setup.secret, stepNow() + 1);
  const ok = await post("/api/admin/login/2fa", { ticket, code });
  assert.equal(ok.status, 200);
  assert.ok(cookieOf(ok));
  assert.equal((await post("/api/admin/login/2fa", { ticket, code })).status, 401);

  // a recovery code works once
  assert.equal((await post("/api/admin/login/2fa", { ticket, code: recoveryCodes[0].toUpperCase() })).status, 200);
  assert.equal((await post("/api/admin/login/2fa", { ticket, code: recoveryCodes[0] })).status, 401);
  assert.equal((await (await fetch(`${base}/api/analytics`, { headers: owner })).json()).client.twoFactor.recoveryLeft, 7);

  // switching off needs the password and a code; we can also reset it for an owner who lost everything
  assert.equal((await post("/api/account/2fa/disable", { password: PASSWORD, code: "nope" }, owner)).status, 401);
  assert.equal((await post("/api/account/2fa/disable", { password: PASSWORD, code: recoveryCodes[1] }, owner)).status, 200);
  assert.ok(cookieOf(await post("/api/admin/login", { client: "majitel@dvoufaz.cz", password: PASSWORD })));
});

test("the operator can't set it up for a shop, only reset it; the demo shops don't have it", async () => {
  const master = { Cookie: cookieOf(await post("/api/admin/login", { client: "admin", password: "test-master-password" })) };
  assert.equal((await post("/api/account/2fa/start?client=kavarna", { password: "x" }, master)).status, 403);
  const owner = { Cookie: cookieOf(await post("/api/signup", { name: "Druhý Obchod", domain: "druhy.cz", email: "a@druhy.cz", password: PASSWORD, plan: "start", terms: true })) };
  assert.equal((await post("/api/account/2fa/start", { password: "spatne-heslo-123" }, owner)).status, 401);
  const clientId = (await (await fetch(`${base}/api/analytics`, { headers: owner })).json()).client.id;
  const setup = await (await post("/api/account/2fa/start", { password: PASSWORD }, owner)).json();
  await post("/api/account/2fa/confirm", { ticket: setup.ticket, code: codeAt(setup.secret, stepNow()) }, owner);
  assert.equal((await post(`/api/admin/clients/${clientId}/two-factor/reset`, {}, owner)).status, 403);
  assert.equal((await post(`/api/admin/clients/${clientId}/two-factor/reset`, {}, master)).status, 200);
  assert.ok(cookieOf(await post("/api/admin/login", { client: "a@druhy.cz", password: PASSWORD })));
});
