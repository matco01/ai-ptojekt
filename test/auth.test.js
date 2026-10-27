import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, safeEqual, createSession, readSession, generatePassword, demoPassword, SESSION_DAYS } from "../lib/auth.js";

test("passwords are stored as salted hashes and verified", () => {
  const h = hashPassword("correct horse battery");
  assert.match(h, /^scrypt\$16384\$/);
  assert.ok(!h.includes("correct horse"));
  assert.notEqual(h, hashPassword("correct horse battery")); // salted
  assert.equal(verifyPassword("correct horse battery", h), true);
  assert.equal(verifyPassword("wrong", h), false);
  assert.equal(verifyPassword("x", "garbage"), false);
  assert.equal(verifyPassword("x", null), false);
});

test("safeEqual compares secrets of any length", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), false);
  assert.equal(safeEqual(undefined, "x"), false);
});

test("sessions are signed and expire", () => {
  const now = Date.now();
  const token = createSession("datart", now);
  assert.deepEqual(readSession(token, now), { clientId: "datart" });
  assert.equal(readSession(token, now + (SESSION_DAYS + 1) * 864e5), null);
  // changing the payload (e.g. to become the operator) breaks the signature
  const [, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ c: "*", exp: now + 1e9 })).toString("base64url") + "." + sig;
  assert.equal(readSession(forged, now), null);
  assert.equal(readSession("nonsense", now), null);
});

test("generated passwords are long and random", () => {
  const a = generatePassword(), b = generatePassword();
  assert.ok(a.length >= 16);
  assert.notEqual(a, b);
});

test("showcase shops get a stable, readable starting password derived from our secret", () => {
  const saved = { s: process.env.SESSION_SECRET, a: process.env.ADMIN_TOKEN };
  try {
    delete process.env.SESSION_SECRET; delete process.env.ADMIN_TOKEN;
    assert.equal(demoPassword("techmarket"), null); // no secret → no password at all
    process.env.ADMIN_TOKEN = "master-secret";
    const pw = demoPassword("techmarket");
    assert.match(pw, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    assert.equal(demoPassword("techmarket"), pw); // same on every server instance
    assert.notEqual(demoPassword("kavarna"), pw); // each shop its own
    process.env.ADMIN_TOKEN = "another-secret";
    assert.notEqual(demoPassword("techmarket"), pw); // changing the secret changes it
  } finally {
    if (saved.s === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = saved.s;
    if (saved.a === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = saved.a;
  }
});

test("e-mailed links are signed for one purpose and expire", async () => {
  const { createLink, readLink, passwordStamp } = await import("../lib/auth.js");
  const now = Date.now();
  const link = createLink("reset", { c: "datart", s: "abc" }, 60e3, now);
  assert.deepEqual(readLink("reset", link, now), { c: "datart", s: "abc", exp: now + 60e3 });
  assert.equal(readLink("reset", link, now + 61e3), null);  // expired
  assert.equal(readLink("verify", link, now), null);        // a reset link doesn't confirm an e-mail
  assert.equal(readLink("reset", createSession("datart", now), now), null); // nor is a session cookie a link
  const [payload, sig] = link.split(".");
  const forged = Buffer.from(JSON.stringify({ c: "*", s: "abc", exp: now + 1e9 })).toString("base64url");
  assert.equal(readLink("reset", `${forged}.${sig}`, now), null);
  assert.equal(readLink("reset", `${payload}.`, now), null);
  for (const junk of [undefined, null, "", "x", 42]) assert.equal(readLink("reset", junk, now), null);
  // the password stamp changes with the password (a reset link works once)
  assert.notEqual(passwordStamp(hashPassword("a-long-password")), passwordStamp(hashPassword("a-long-password")));
});
