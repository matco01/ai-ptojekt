// The database: Postgres (Railway), server-side only. DATABASE_URL is the connection string Railway
// gives its Postgres service. Without it the app falls back to local files, so it still runs for development.
// The schema (db/schema.sql) is applied by the server itself at start – nothing to run by hand.
import fs from "node:fs";
import pg from "pg";

// Values as the rest of the app expects them: whole numbers and amounts as numbers (milliseconds,
// token counts and Kč fit a double), times as ISO strings.
const iso = (v) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
export const PARSERS = { 20: Number, 1700: Number, 1184: iso, 1114: (v) => iso(`${v}Z`) }; // int8, numeric, timestamptz, timestamp
for (const [oid, parse] of Object.entries(PARSERS)) pg.types.setTypeParser(Number(oid), parse);

const url = process.env.DATABASE_URL;
// Railway's private network needs no TLS; its public address (used from a laptop, e.g. the migration) does
const ssl = url && !/\.railway\.internal[:/]|localhost|127\.0\.0\.1/.test(url) && !/sslmode=disable/.test(url) ? { rejectUnauthorized: false } : undefined;

/** The connection pool – null without DATABASE_URL. Anything with `query(text, params)` → `{ rows }` works. */
export let db = url ? new pg.Pool({ connectionString: url, ssl, max: Number(process.env.DATABASE_POOL_MAX) || 8, idleTimeoutMillis: 30e3 }) : null;
db?.on("error", (err) => console.error("database connection error:", err.message));

/** Tests: another Postgres (an in-memory PGlite). */
export function useDatabase(other) { db = other; }

/** Runs one statement; returns its rows. */
export async function query(text, params = []) {
  return (await db.query(text, params)).rows;
}

// columns holding JSON – sent as JSON text (a JS array would otherwise become a Postgres array)
const JSONB = new Set(["info", "integration", "appearance", "persona", "install_request", "widget_seen", "site_look", "two_factor", "data"]);
const value = (col, v) => (JSONB.has(col) && v != null ? JSON.stringify(v) : v);
const param = (col, i) => `$${i + 1}${JSONB.has(col) ? "::jsonb" : ""}`;

/** Inserts a row, or updates just the given columns of the row with the same key. */
export async function upsert(table, row, key = ["id"]) {
  const cols = Object.keys(row).filter((c) => row[c] !== undefined);
  const set = cols.filter((c) => !key.includes(c)).map((c) => `${c} = excluded.${c}`);
  await db.query(
    `insert into ${table} (${cols.join(", ")}) values (${cols.map(param).join(", ")})
     on conflict (${key.join(", ")}) do ${set.length ? `update set ${set.join(", ")}` : "nothing"}`,
    cols.map((c) => value(c, row[c])),
  );
}

/** Inserts rows (one statement per row set, columns taken from the first row). */
export async function insert(table, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const params = [], tuples = rows.map((r) => `(${cols.map((c) => { params.push(value(c, r[c])); return param(c, params.length - 1); }).join(", ")})`);
  await db.query(`insert into ${table} (${cols.join(", ")}) values ${tuples.join(", ")}`, params);
}

/**
 * Creates or updates the tables (db/schema.sql: safe to run again). Run once at server start; an
 * advisory lock keeps two instances starting together from doing it at the same time.
 */
export async function ensureSchema(target = db) {
  if (!target) return;
  const sql = fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  if (typeof target.exec === "function") return void (await target.exec(sql)); // PGlite (tests)
  const conn = await target.connect();
  try {
    await conn.query("select pg_advisory_lock(727001)");
    await conn.query(sql);
  } finally {
    await conn.query("select pg_advisory_unlock(727001)").catch(() => {});
    conn.release();
  }
}
