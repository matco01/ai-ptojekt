// The shops that use the AI salesperson. Each embed says which client it belongs to
// (<script src=".../prodavac.js" data-client="id">); the server scopes data and settings by it.
// Clients are rows in the Supabase "clients" table, managed on the internal page /admin/clients.html.
import { db } from "./db.js";
import { feedXml as kavarnaFeed } from "../catalog/kavarna.js";
import { PLANS } from "./plans.js";
import { isProduction } from "./auth.js";

// The two showcase sites – always available, even without a database. A database row with the
// same id overrides only the fields it fills in.
const BUILT_IN = [
  { id: "techmarket", name: "TechMarket", catalog: "techmarket", plan: "internal" },
  {
    id: "kavarna", name: "Bohème", feedXml: kavarnaFeed, plan: "internal",
    description: "pražírna výběrové kávy z Brna – zrnková káva, předplatné a vybavení pro domácí baristy",
    freeShippingFrom: 990,
    info: {
      doprava: "Odesíláme den po pražení. Zásilkovna 69 Kč, kurýr na adresu 99 Kč, doprava zdarma nad 990 Kč. Káva je u vás nejvýš do sedmi dnů od pražení.",
      vraceni: "Vybavení můžete vrátit do 30 dnů bez udání důvodu. Kávu jako potravinu vracet nelze, ale když vám nebude chutnat, napište nám – vždycky se domluvíme.",
      platba: "Kartou online, Apple Pay / Google Pay, bankovním převodem nebo na dobírku (+25 Kč).",
      predplatne: "Předplatné: každý měsíc jiná káva z aktuální nabídky podle toho, jak ji připravujete (filtr, espresso nebo obojí). O 15 % levnější než jednotlivé nákupy, doprava vždy zdarma, pozastavíte nebo zrušíte jedním klikem. 250 g za 288 Kč, 500 g za 535 Kč, 1 kg za 1 012 Kč měsíčně.",
      mleti: "Kávu dodáváme zrnkovou, aby vydržela čerstvá. Na přání ji zdarma nameleme – stačí do poznámky k objednávce napsat, na co ji připravujete.",
      kontakt: "Pražírna a kavárna Bohème, Údolní 12, Brno. Otevřeno po–so 8–18. E-mail ahoj@boheme.example.",
    },
  },
];
export const isBuiltIn = (id) => BUILT_IN.some((c) => c.id === id);

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ""));
const fromRow = (r) => clean({
  id: r.id, name: r.name, domains: r.domains, agentName: r.agent_name, active: r.active,
  passwordHash: r.password_hash, legacyToken: r.admin_token,
  description: r.description, feedUrl: r.feed_url, info: r.info, freeShippingFrom: r.free_shipping_from, integration: r.integration,
  plan: r.plan, monthlyMessageLimit: r.monthly_message_limit, ownerEmail: r.owner_email, notes: r.notes, createdAt: r.created_at,
});
const withDefaults = (c) => ({ domains: [], agentName: null, passwordHash: null, legacyToken: null, active: true, info: {}, integration: {}, plan: "trial", monthlyMessageLimit: null, ...c });

let cache = { at: 0, map: null };
export const clearClientCache = () => { cache = { at: 0, map: null }; };

async function all() {
  if (cache.map && Date.now() - cache.at < 60e3) return cache.map;
  const map = new Map(BUILT_IN.map((c) => [c.id, withDefaults(c)]));
  if (db) {
    const { data, error } = await db.from("clients").select("*");
    if (error) console.error("clients load failed:", error.message);
    for (const r of data ?? []) map.set(r.id, withDefaults({ ...map.get(r.id), ...fromRow(r) }));
  }
  cache = { at: Date.now(), map };
  return map;
}

/** The active client with this id. There is no default – an embed without data-client is rejected. */
export async function getClient(id, { includeInactive = false } = {}) {
  if (typeof id !== "string" || !id) return null;
  const c = (await all()).get(id);
  return c && (c.active || includeInactive) ? c : null;
}

export async function listClients() {
  return [...(await all()).values()];
}

/**
 * A client's widget may only be used on its own domains and on our own host (the showcase pages).
 * `localhost` is allowed only outside production. The Origin header can be forged outside a browser,
 * so this protects shops from other websites, not the API from scripts – the rate limits and monthly
 * plan limits cap what a script could spend.
 */
export function originAllowed(client, origin, ownHost) {
  if (!origin) return false;
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  if (host === ownHost?.split(":")[0]) return true;
  if ((host === "localhost" || host === "127.0.0.1") && !isProduction()) return true;
  return client.domains.some((d) => host === d || host.endsWith("." + d));
}

// ------------------------------------------------------ editing clients ----
export const CLIENT_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** "https://www.Shop.cz/eshop" → "shop.cz" (subdomains are allowed automatically). */
export function normalizeDomain(d) {
  let s = String(d ?? "").trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z]+:\/\//.test(s)) s = "https://" + s;
  try {
    const host = new URL(s).hostname.replace(/^www\./, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
  } catch { return null; }
}

const isTextMap = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");

/** Validates settings from the admin page; returns { row } for the database or { error }. */
export function validateClient(input, { isNew }) {
  const s = (v, max) => (v == null ? "" : String(v).trim().slice(0, max));
  const id = s(input.id, 40).toLowerCase();
  if (!CLIENT_ID.test(id)) return { error: "ID: 2–40 znaků, jen malá písmena bez diakritiky, číslice a pomlčka." };
  const name = s(input.name, 120);
  if (!name) return { error: "Vyplňte název obchodu." };
  const rawDomains = Array.isArray(input.domains) ? input.domains : String(input.domains ?? "").split(/[\s,]+/);
  const domains = [];
  for (const d of rawDomains.filter((x) => String(x).trim())) {
    const n = normalizeDomain(d);
    if (!n) return { error: `Neplatná doména: ${d}` };
    if (!domains.includes(n)) domains.push(n);
  }
  if (!domains.length && !isBuiltIn(id)) return { error: "Zadejte aspoň jednu doménu obchodu." };
  const feedUrl = s(input.feedUrl, 1000);
  if (feedUrl && !/^https?:\/\/[^\s]+$/i.test(feedUrl)) return { error: "Adresa feedu musí začínat https://" };
  if (input.info != null && !isTextMap(input.info)) return { error: "Informace o obchodě: JSON objekt téma → text." };
  if (input.integration != null && !isTextMap(input.integration)) return { error: "Integrace: JSON objekt, např. {\"addToCart\": \"#buy\"}." };
  const plan = s(input.plan, 20) || "trial";
  if (!PLANS[plan]) return { error: `Neznámý tarif: ${plan}` };
  const intOrNull = (v) => (v === "" || v == null ? null : Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : NaN);
  const limit = intOrNull(input.monthlyMessageLimit), ship = intOrNull(input.freeShippingFrom);
  if (Number.isNaN(limit)) return { error: "Limit zpráv musí být celé číslo." };
  if (Number.isNaN(ship)) return { error: "Doprava zdarma od: celé číslo v Kč." };
  const email = s(input.ownerEmail, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Neplatný e-mail majitele." };
  const row = {
    id, name, domains,
    agent_name: s(input.agentName, 40) || null,
    description: s(input.description, 300) || null,
    feed_url: feedUrl || null,
    info: input.info ?? null,
    integration: input.integration ?? null,
    free_shipping_from: ship,
    plan,
    monthly_message_limit: limit,
    owner_email: email || null,
    notes: s(input.notes, 2000) || null,
    active: input.active !== false,
  };
  return { row, isNew };
}

export async function saveClient(row, { isNew }) {
  if (!db) throw Object.assign(new Error("Klienty lze spravovat jen s databází (nastavte SUPABASE_URL a SUPABASE_SECRET_KEY)."), { status: 503 });
  if (isNew) {
    const { data } = await db.from("clients").select("id").eq("id", row.id).maybeSingle();
    if (data || isBuiltIn(row.id)) throw Object.assign(new Error(`Klient s ID „${row.id}“ už existuje.`), { status: 409 });
  }
  const { error } = await db.from("clients").upsert(row);
  if (error) throw new Error(error.message);
  clearClientCache();
}

/** Stores a new password hash (and drops the legacy plain-text password). */
export async function setPasswordHash(clientId, hash) {
  if (!db) throw Object.assign(new Error("Hesla lze nastavit jen s databází."), { status: 503 });
  // built-in showcase clients may not have a row yet
  const { error } = await db.from("clients").upsert({ id: clientId, name: (await getClient(clientId, { includeInactive: true }))?.name ?? clientId, password_hash: hash, admin_token: null });
  if (error) throw new Error(error.message);
  clearClientCache();
}
