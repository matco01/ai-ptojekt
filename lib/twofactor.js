// Optional two-step sign-in for shop owners: a 6-digit code from an authenticator app (TOTP, RFC 6238),
// or a one-time recovery code when the phone is gone. Stored on the client row as
// { secret, recovery, lastStep, enabledAt }: the secret encrypted with a key derived from our session
// secret (changing SESSION_SECRET / ADMIN_TOKEN therefore switches every owner's codes off – we can
// reset 2FA for them on the Clients page), recovery codes only as keyed hashes.
import crypto from "node:crypto";
import { derivedKey } from "./auth.js";

const STEP_MS = 30e3, DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(buf) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    value &= (1 << bits) - 1;
  }
  return bits ? out + B32[(value << (5 - bits)) & 31] : out;
}
function fromBase32(s) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of String(s).toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

export const newSecret = () => base32(crypto.randomBytes(20));

/** The code of one 30-second step. */
export function codeAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac("sha1", fromBase32(secret)).update(counter).digest();
  const at = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(at) & 0x7fffffff) % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The step a code belongs to (a step either way, for clocks that are a little off), or null. A step already used doesn't count again. */
export function matchStep(secret, code, { now = Date.now(), lastStep = -1 } = {}) {
  const clean = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = Math.floor(now / STEP_MS);
  let found = null;
  for (const step of [current - 1, current, current + 1]) {
    const same = crypto.timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(clean));
    if (same && step > lastStep) found = step;
  }
  return found;
}

/** What an authenticator app reads from the QR code. */
export const otpauthUrl = (secret, account) =>
  `otpauth://totp/${encodeURIComponent(`Sella:${account}`)}?secret=${secret}&issuer=Sella&algorithm=SHA1&digits=${DIGITS}&period=30`;

// ---------------------------------------------------- the secret at rest ----
export function sealSecret(secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", derivedKey("2fa-secret"), iv);
  const data = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}
export function openSecret(sealed) {
  try {
    const [iv, tag, data] = String(sealed).split(".").map((s) => Buffer.from(s, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", derivedKey("2fa-secret"), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch { return null; }
}

// ------------------------------------------------------- recovery codes ----
const hashRecovery = (code) => crypto.createHmac("sha256", derivedKey("2fa-recovery")).update(String(code).toLowerCase().replace(/[^a-z0-9]/g, "")).digest("base64url");

/** Fresh recovery codes, readable ("k7mq2-xpt9f"), and their hashes to store. */
export function newRecoveryCodes(count = 8) {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const codes = Array.from({ length: count }, () => {
    const s = Array.from({ length: 10 }, () => abc[crypto.randomInt(abc.length)]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
  return { codes, hashes: codes.map(hashRecovery) };
}

/** A new stored state for an account that just confirmed its first code. */
export const enabledState = (secret, step, hashes, now = Date.now()) =>
  ({ secret: sealSecret(secret), recovery: hashes, lastStep: step, enabledAt: new Date(now).toISOString() });

/**
 * Checks a code from the sign-in form against the stored state: an app code or a recovery code.
 * Returns the state to save (the step is burnt, the recovery code gone), or null when it's wrong.
 */
export function checkSecondFactor(state, code, { now = Date.now() } = {}) {
  const secret = state?.secret && openSecret(state.secret);
  if (!secret) return null;
  const step = matchStep(secret, code, { now, lastStep: state.lastStep ?? -1 });
  if (step != null) return { ...state, lastStep: step };
  const hash = hashRecovery(code);
  const left = (state.recovery ?? []).filter((h) => h !== hash);
  return left.length < (state.recovery ?? []).length ? { ...state, recovery: left, usedRecovery: true } : null;
}
