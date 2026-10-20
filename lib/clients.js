// The shops that use the AI salesperson. Each embed says which client it belongs to
// (<script src=".../prodavac.js" data-client="id">); the server scopes data and settings by it.
// Clients are rows in the Supabase "clients" table: shops that signed up themselves on the Sella site
// (they pay through Stripe – see lib/billing.js) and shops we manage by hand on /admin/clients.html.
// Billing: "manual" = we invoice outside the app (our demos, hand-made clients); "unpaid" = signed
// up, not paid yet; "active" / "past_due" / "canceled" = the Stripe subscription's state. Only an
// active client's widget works – an unpaid shop can sign in and see its overview, nothing more.
import { db } from "./db.js";
import { feedXml as kavarnaFeed, feedXmlEn as kavarnaFeedEn } from "../catalog/kavarna.js";
import { PLANS } from "./plans.js";
import { isProduction } from "./auth.js";
import fs from "node:fs";
import { dataFile } from "./storage.js";

const PASSWORD_FILE = dataFile("passwords.json");
function localPasswords() {
  try { return JSON.parse(fs.readFileSync(PASSWORD_FILE, "utf8")); } catch { return {}; }
}
// plans chosen by shops, when there is no database (local development only)
const PLAN_FILE = dataFile("plans.json");
function localPlans() {
  try { return JSON.parse(fs.readFileSync(PLAN_FILE, "utf8")); } catch { return {}; }
}
// whole client rows (sign-ups, billing), when there is no database – local development only
const CLIENT_FILE = dataFile("clients.json");
function localRows() {
  try { return JSON.parse(fs.readFileSync(CLIENT_FILE, "utf8")); } catch { return {}; }
}
const needsDb = (what) => Object.assign(new Error(`${what} na serveru potřebuje databázi (nastavte SUPABASE_URL a SUPABASE_SECRET_KEY).`), { status: 503 });

/** Writes (part of) a client row: to the database, or locally to a file during development. */
async function writeRow(row, what = "Ukládání klientů") {
  if (!db) {
    if (isProduction()) throw needsDb(what);
    const rows = localRows();
    rows[row.id] = { ...rows[row.id], ...row };
    fs.writeFileSync(CLIENT_FILE, JSON.stringify(rows, null, 2));
  } else {
    const name = row.name ?? (await getClient(row.id, { includeInactive: true }))?.name ?? row.id;
    const { error } = await db.from("clients").upsert({ ...row, name });
    if (error) throw new Error(error.message);
  }
  clearClientCache();
}

// The two showcase sites – always available, even without a database. A database row with the
// same id overrides only the fields it fills in.
const BUILT_IN = [
  { id: "techmarket", name: "TechMarket", catalog: "techmarket", plan: "internal" },
  {
    id: "kavarna", name: "Bohème", feedXml: kavarnaFeed, feedXmlEn: kavarnaFeedEn, plan: "internal",
    descriptionEn: "a specialty coffee roastery in Brno – whole-bean coffee, subscriptions and gear for home baristas", welcomeEn: "to Bohème",
    infoEn: {
      doprava: "We ship the day after roasting. Pick-up point 69 CZK, courier to your address 99 CZK, free delivery over 990 CZK. The coffee reaches you within seven days of roasting.",
      vraceni: "Equipment can be returned within 30 days, no reason needed. Coffee is food and can't be returned, but if you don't like it, write to us – we'll always work something out.",
      platba: "Card online, Apple Pay / Google Pay, bank transfer or cash on delivery (+25 CZK).",
      predplatne: "Subscription: a different coffee every month from the current offer, matched to how you brew (filter, espresso or both). 15 % cheaper than single purchases, delivery always free, pause or cancel in one click. 250 g for 288 CZK, 500 g for 535 CZK, 1 kg for 1,012 CZK a month.",
      mleti: "We ship whole beans so the coffee stays fresh. On request we grind it for free – just say in the order note how you brew it.",
      kontakt: "Bohème roastery and café, Údolní 12, Brno. Open Mon–Sat 8–18. E-mail ahoj@boheme.example.",
    },
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
  billing: r.billing_status, stripeCustomerId: r.stripe_customer_id, stripeSubscriptionId: r.stripe_subscription_id, paidUntil: r.paid_until,
  appearance: r.appearance, persona: r.persona, installRequest: r.install_request, widgetSeen: r.widget_seen, siteLook: r.site_look,
});
const withDefaults = (c) => ({ appearance: {}, persona: {}, domains: [], agentName: null, passwordHash: null, legacyToken: null, active: true, info: {}, integration: {}, plan: "trial", monthlyMessageLimit: null, billing: "manual", ...c });

let cache = { at: 0, map: null };
export const clearClientCache = () => { cache = { at: 0, map: null }; };

async function all() {
  if (cache.map && Date.now() - cache.at < 60e3) return cache.map;
  const map = new Map(BUILT_IN.map((c) => [c.id, withDefaults(c)]));
  if (db) {
    const { data, error } = await db.from("clients").select("*");
    if (error) console.error("clients load failed:", error.message);
    for (const r of data ?? []) map.set(r.id, withDefaults({ ...map.get(r.id), ...fromRow(r) }));
  } else {
    // local development without a database: clients, passwords and plans live in files
    for (const r of Object.values(localRows())) map.set(r.id, withDefaults({ ...map.get(r.id), ...fromRow(r) }));
    for (const [id, hash] of Object.entries(localPasswords())) if (map.has(id)) map.get(id).passwordHash = hash;
    for (const [id, plan] of Object.entries(localPlans())) if (map.has(id)) Object.assign(map.get(id), { plan, monthlyMessageLimit: null });
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
  if (!db && isProduction()) throw needsDb("Správa klientů");
  if (isNew && (await getClient(row.id, { includeInactive: true }))) throw Object.assign(new Error(`Klient s ID „${row.id}“ už existuje.`), { status: 409 });
  await writeRow(row);
}

// ------------------------------------------------------------ sign-up ----
// ids a signed-up shop never gets: our own website's assistant ("sella", see lib/sella.js) and the demo shops
const RESERVED = new Set(["sella", "admin", "techmarket", "kavarna"]);
/** "Kavárna U Lípy s.r.o." → "kavarna-u-lipy-s-r-o" – a free client id. */
export async function freeClientId(name) {
  const base = String(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "obchod";
  const id = base.length < 2 ? `${base}-shop` : base;
  for (let i = 0; i < 50; i++) {
    const candidate = i ? `${id}-${i + 1}` : id;
    if (!RESERVED.has(candidate) && !(await getClient(candidate, { includeInactive: true }))) return candidate;
  }
  return `${id}-${Date.now().toString(36)}`;
}

/** A shop that signed up on the Sella site: its widget stays off until it pays. */
export async function createSignedUpClient({ name, domain, email, passwordHash, plan, feedUrl, terms }) {
  if (!db && isProduction()) throw needsDb("Registrace");
  const id = await freeClientId(name);
  await writeRow({
    id, name, domains: [domain], owner_email: email, password_hash: passwordHash, plan, feed_url: feedUrl || null,
    active: false, billing_status: "unpaid", monthly_message_limit: null,
    // proof of agreeing to the terms: version, time, IP address
    terms_version: terms.version, terms_accepted_at: terms.at, terms_accepted_ip: terms.ip,
  }, "Registrace");
  return id;
}

/** Billing state from Stripe (customer, subscription, paid until, active). */
export async function setBilling(clientId, fields) {
  const row = { id: clientId };
  if ("status" in fields) row.billing_status = fields.status;
  if ("active" in fields) row.active = fields.active;
  if ("customerId" in fields) row.stripe_customer_id = fields.customerId;
  if ("subscriptionId" in fields) row.stripe_subscription_id = fields.subscriptionId;
  if ("paidUntil" in fields) row.paid_until = fields.paidUntil;
  if ("plan" in fields) Object.assign(row, { plan: fields.plan, monthly_message_limit: null });
  await writeRow(row, "Platby");
}

/** The owner customises the assistant: its name, look, manner and what it knows about the shop (lib/bot.js validates). */
export async function setBotSettings(clientId, { agentName, appearance, persona, info }) {
  await writeRow({ id: clientId, agent_name: agentName || null, appearance, persona, info }, "Nastavení prodavačky");
}

/** Shop owners edit a few settings themselves: their domains and product feed. */
export async function setOwnerSettings(clientId, { domains, feedUrl }) {
  await writeRow({ id: clientId, domains, feed_url: feedUrl || null }, "Nastavení obchodu");
}

/** The owner asks us to add the embed code to their website for them (or we mark it done). */
export async function setInstallRequest(clientId, request) {
  await writeRow({ id: clientId, install_request: request }, "Žádost o vložení kódu");
}

/** The widget started on the shop's website (host, last and first time) – the code is in place. */
export async function setWidgetSeen(clientId, seen) {
  await writeRow({ id: clientId, widget_seen: seen }, "Ověření vložení kódu");
}

/** How the widget looks on the shop's website – reported by the widget there, shown in the settings preview. */
export async function setSiteLook(clientId, look) {
  await writeRow({ id: clientId, site_look: look }, "Vzhled na webu");
}

/** The client a Stripe customer belongs to (webhooks carry only Stripe ids). */
export async function clientByStripeCustomer(customerId) {
  return (await listClients()).find((c) => c.stripeCustomerId === customerId) ?? null;
}

/** Stores a new password hash (and drops the legacy plain-text password). */
export async function setPasswordHash(clientId, hash) {
  if (!db) {
    // on a serverless host a file would be forgotten (and differ between instances) – only locally
    if (isProduction()) throw needsDb("Nová hesla");
    if (localRows()[clientId]) return writeRow({ id: clientId, password_hash: hash });
    const all = { ...localPasswords(), [clientId]: hash };
    fs.writeFileSync(PASSWORD_FILE, JSON.stringify(all, null, 2));
    clearClientCache();
    return;
  }
  // built-in showcase clients may not have a row yet
  await writeRow({ id: clientId, password_hash: hash, admin_token: null });
}

/**
 * The shop picked a plan (in its overview). It applies right away – a shop whose assistant was off
 * because the month's messages ran out gets it back as soon as the new plan has room. A custom
 * message limit we set by hand is dropped, the plan's limit applies.
 */
export async function setClientPlan(clientId, plan) {
  if (!db && !isProduction() && !localRows()[clientId]) {
    fs.writeFileSync(PLAN_FILE, JSON.stringify({ ...localPlans(), [clientId]: plan }, null, 2));
    clearClientCache();
    return;
  }
  await writeRow({ id: clientId, plan, monthly_message_limit: null }, "Změna tarifu");
}
