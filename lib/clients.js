// The shops that use the AI salesperson. Each embed says which client it belongs to
// (<script src=".../prodavac.js" data-client="id">); the server scopes data and settings by it.
// New clients are added as rows in the Supabase "clients" table (see supabase/schema.sql).
import { db } from "./db.js";
import { feedXml as kavarnaFeed } from "../catalog/kavarna.js";

export const DEFAULT_CLIENT = "techmarket";

// The two showcase sites – always available, even without a database. A database row with the
// same id overrides only the fields it fills in.
const BUILT_IN = [
  { id: "techmarket", name: "TechMarket", catalog: "techmarket" },
  {
    id: "kavarna", name: "Bohème", feedXml: kavarnaFeed,
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

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ""));
const fromRow = (r) => clean({
  id: r.id, name: r.name, domains: r.domains, agentName: r.agent_name, adminToken: r.admin_token, active: r.active,
  description: r.description, feedUrl: r.feed_url, info: r.info, freeShippingFrom: r.free_shipping_from, integration: r.integration,
});
const withDefaults = (c) => ({ domains: [], agentName: null, adminToken: null, active: true, info: {}, integration: {}, ...c });

let cache = { at: 0, map: null };

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

export async function getClient(id) {
  const c = (await all()).get(String(id || DEFAULT_CLIENT));
  return c?.active ? c : null;
}

export async function listClients() {
  return [...(await all()).values()].map(({ id, name, active }) => ({ id, name, active }));
}

/** A client's widget may only be used on its own domains (and always on our own showcase host). */
export function originAllowed(client, origin, ownHost) {
  if (!origin) return true; // same-origin requests and sendBeacon without Origin
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  if (host === ownHost?.split(":")[0] || host === "localhost" || host === "127.0.0.1") return true;
  return client.domains.some((d) => host === d || host.endsWith("." + d));
}
