// Dashboard logins. Shop owners sign in with their shop ID + password (stored as a scrypt hash);
// we sign in with ID "admin" + ADMIN_TOKEN. A successful login gets a signed, HttpOnly session
// cookie – passwords never travel in URLs.
import crypto from "node:crypto";

export const COOKIE = "aip_admin";
export const SESSION_DAYS = 14;
export const MASTER = "*"; // session.clientId for the operator (every client)

export const isProduction = () => Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");

// ------------------------------------------------------------ passwords ----
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password, stored) {
  const [kind, n, salt, hash] = String(stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, "base64url"), expected.length, { ...SCRYPT, N: Number(n) });
  return crypto.timingSafeEqual(actual, expected);
}

/** Compares secrets without leaking through timing how much of them matched. */
export function safeEqual(a, b) {
  if (!a || !b) return false;
  const h = (s) => crypto.createHash("sha256").update(String(s)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

export const generatePassword = () => crypto.randomBytes(12).toString("base64url"); // 16 characters

/**
 * The showcase shops' starting password, derived from our secret – so their logins work right
 * after a deploy, even without a database. Nothing is stored; setting a new password replaces it.
 * Readable groups without look-alike characters, e.g. "k7mq-2xpt-9fhd".
 */
export function demoPassword(clientId) {
  const key = process.env.SESSION_SECRET || process.env.ADMIN_TOKEN;
  if (!key) return null;
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.createHmac("sha256", key).update("sella-demo-login:" + clientId).digest();
  const chars = [...bytes.subarray(0, 12)].map((b) => abc[b % abc.length]).join("");
  return chars.match(/.{4}/g).join("-");
}

// ------------------------------------------------------------- sessions ----
let devSecret;
function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // derived from the master password, so a deployment only needs ADMIN_TOKEN; changing it logs everyone out
  if (process.env.ADMIN_TOKEN) return crypto.createHash("sha256").update("aip-session:" + process.env.ADMIN_TOKEN).digest("hex");
  return (devSecret ??= crypto.randomBytes(32).toString("hex")); // local development: valid until restart
}
const sign = (payload) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

export function createSession(clientId, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ c: clientId, exp: now + SESSION_DAYS * 864e5 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** { clientId } for a valid, unexpired session token, otherwise null. */
export function readSession(token, now = Date.now()) {
  const [payload, sig] = String(token ?? "").split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const { c, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof c === "string" && exp > now ? { clientId: c } : null;
  } catch { return null; }
}

export function sessionCookie(token, { secure }) {
  const parts = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(req, name = COOKIE) {
  for (const part of String(req.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
