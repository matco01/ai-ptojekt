import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, safeEqual, createSession, readSession, generatePassword, SESSION_DAYS } from "../lib/auth.js";

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
