// Requests for a custom plan ("Na míru – napište nám" on the site and in the owner's overview).
// Each one is kept in the database (table plan_requests) – or locally in a file during development –
// and shown to us on the All clients page until we mark it done. The server also e-mails it to support.
import fs from "node:fs";
import { db } from "./db.js";
import { isProduction } from "./auth.js";
import { dataFile } from "./storage.js";

const FILE = dataFile("plan-requests.json");
const localAll = () => { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; } };
const needsDb = () => Object.assign(new Error("Poptávky na serveru potřebují databázi (nastavte SUPABASE_URL a SUPABASE_SECRET_KEY)."), { status: 503 });

const fromRow = (r) => ({ id: String(r.id), email: r.email, shop: r.shop ?? "", web: r.web ?? "", note: r.note ?? "", lang: r.lang ?? "cs", clientId: r.client_id ?? null, at: r.created_at, doneAt: r.done_at ?? null });

/** Stores a new request; returns it. */
export async function addPlanRequest({ email, shop, web, note, lang, clientId }) {
  const row = { email, shop: shop || null, web: web || null, note: note || null, lang, client_id: clientId || null };
  if (db) {
    const { data, error } = await db.from("plan_requests").insert(row).select().single();
    if (error) throw new Error(error.message);
    return fromRow(data);
  }
  if (isProduction()) throw needsDb();
  const all = localAll();
  const saved = { ...row, id: Date.now(), created_at: new Date().toISOString(), done_at: null };
  fs.writeFileSync(FILE, JSON.stringify([...all, saved], null, 2));
  return fromRow(saved);
}

/** The newest requests first (open and done). */
export async function listPlanRequests(limit = 100) {
  if (db) {
    const { data, error } = await db.from("plan_requests").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return data.map(fromRow);
  }
  return localAll().map(fromRow).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** Removes a request for good (spam, a test, a duplicate). */
export async function deletePlanRequest(id) {
  if (db) {
    const { data, error } = await db.from("plan_requests").delete().eq("id", id).select();
    if (error) throw new Error(error.message);
    return data.length > 0;
  }
  const all = localAll();
  const rest = all.filter((x) => String(x.id) !== String(id));
  if (rest.length === all.length) return false;
  fs.writeFileSync(FILE, JSON.stringify(rest, null, 2));
  return true;
}

/** We got in touch: the request leaves the open list (or, done = false, goes back to it). */
export async function markPlanRequestDone(id, done = true) {
  const doneAt = done ? new Date().toISOString() : null;
  if (db) {
    const { data, error } = await db.from("plan_requests").update({ done_at: doneAt }).eq("id", id).select();
    if (error) throw new Error(error.message);
    return data.length > 0;
  }
  const all = localAll();
  const r = all.find((x) => String(x.id) === String(id));
  if (!r) return false;
  r.done_at = doneAt;
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
  return true;
}
