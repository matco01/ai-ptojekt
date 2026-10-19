// Reads a shop's products straight from its website – for shops without a product feed (many small
// shops don't have one, or don't know what it is). Tried in this order:
//   1. Shopify stores publish every product at /products.json
//   2. a product feed at a usual address or linked from the home page (Heureka / Zboží.cz / Google)
//   3. the shop's pages – found through its sitemap, or by following links from the home page – read
//      from the product data e-shops publish for Google (JSON-LD "Product", Open Graph product tags)
//   4. when no page has that data, Claude reads the products off the page text (Claude Haiku: cheap)
//   5. sites drawn by JavaScript in the browser (the server sends an empty page): Claude reads the
//      products out of the site's own scripts and the data embedded in the page
// Only the shop's own domain is read (the shop asked for it by signing up).
import Anthropic from "@anthropic-ai/sdk";
import { XMLParser } from "fast-xml-parser";
import { buildCatalog, parseFeed, plain, price as toPrice } from "./feed.js";
import { norm } from "./catalog.js";

const UA = "Mozilla/5.0 (compatible; SellaBot/1.0; AI shop assistant reading its client's products)";
const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, isArray: (n) => ["sitemap", "url"].includes(n) });

const SKIP_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|rar|css|js|json|xml|txt|mp4|webm|mp3|woff2?|ttf|eot)(\?|$)/i;
const SKIP_PATH = /\/(cart|kosik|basket|checkout|pokladna|objednavka|login|prihlaseni|prihlasit|registrace|register|account|muj-ucet|ucet|wp-admin|wp-login|wp-json|feed|search|hledat|vyhledavani|tag|author)(\/|$|\?)|[?&](add-to-cart|add_to_cart|replytocom|orderby|filter_|sort)=|^mailto:|^tel:|^javascript:/i;
const PRODUCTISH = /produkt|product|zbozi|zboží|detail|\/p\/|\/item|\/shop\/|\/eshop\/|-p\d|\d{3,}/i;

const sameSite = (u, domain) => {
  try { const h = new URL(u).hostname.replace(/^www\./, ""); return h === domain || h.endsWith("." + domain); } catch { return false; }
};
const abs = (href, base) => { try { const u = new URL(href, base); u.hash = ""; return u.href; } catch { return null; } };

/** GET with a size cap and the crawl's deadline; null when it fails. */
async function get(url, { signal, maxBytes = 3e6, timeoutMs = 12000 } = {}) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.5" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean)),
      redirect: "follow",
    });
    if (!r.ok || !r.body) { await r.body?.cancel().catch(() => {}); return null; }
    const chunks = [];
    let size = 0;
    for await (const c of r.body) {
      size += c.length;
      if (size > maxBytes) { await r.body.cancel?.().catch(() => {}); return null; }
      chunks.push(c);
    }
    return { url: r.url || url, type: r.headers.get("content-type") || "", text: Buffer.concat(chunks).toString("utf8") };
  } catch { return null; }
}

// ------------------------------------------------------------ Shopify ----
async function shopify(base, signal) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await get(`${base}/products.json?limit=250&page=${page}`, { signal, maxBytes: 15e6 });
    let data;
    try { data = r && JSON.parse(r.text); } catch { return out; }
    if (!Array.isArray(data?.products) || !data.products.length) break;
    for (const p of data.products) {
      const v = p.variants?.find((x) => x.available) ?? p.variants?.[0] ?? {};
      const current = toPrice(v.price), before = toPrice(v.compare_at_price);
      out.push({
        id: String(p.id), name: p.title, brand: p.vendor || null, categoryName: p.product_type || "",
        price: current, oldPrice: before && current && before > current ? before : null,
        stock: p.variants?.some((x) => x.available) === false ? 0 : 10,
        description: plain(p.body_html, 600), url: `${base}/products/${p.handle}`,
        image: p.images?.[0]?.src || null, ean: v.barcode || null, sku: v.sku || null, params: {},
      });
    }
    if (data.products.length < 250) break;
  }
  return out;
}

// --------------------------------------------------------- product feed ----
const FEED_PATHS = ["/heureka.xml", "/zbozi.xml", "/feed/heureka.xml", "/feeds/heureka.xml", "/export/heureka.xml", "/google.xml", "/feed/google.xml", "/products.xml"];

async function findFeed(base, homeHtml, signal) {
  const linked = [...homeHtml.matchAll(/href=["']([^"']+\.xml[^"']*)["']/gi)].map((m) => abs(m[1], base))
    .filter((u) => u && /heureka|zbozi|google|merchant|feed|export|product/i.test(u));
  for (const url of [...new Set([...linked, ...FEED_PATHS.map((p) => base + p)])].slice(0, 10)) {
    const r = await get(url, { signal, maxBytes: 60e6, timeoutMs: 15000 });
    if (!r || !/<(SHOP|rss|feed)\b/i.test(r.text.slice(0, 3000))) continue;
    try {
      const data = parseFeed(r.text);
      if (data.products.length) return { data, feedUrl: url };
    } catch {}
  }
  return null;
}

// ------------------------------------------------- product data on pages ----
const first = (v) => (Array.isArray(v) ? v[0] : v);
const imageOf = (img, base) => {
  const i = first(img);
  return abs(typeof i === "string" ? i : i?.url || i?.contentUrl || "", base) || null;
};
const lastSegment = (s) => String(s ?? "").split(/\s*[|>/»›]\s*/).filter(Boolean).at(-1) || "";

/** Products described as JSON-LD (schema.org Product) on a page. */
export function ldProducts(html, pageUrl) {
  const found = [];
  let crumbs = [];
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) { for (const n of node) walk(n, depth + 1); return; }
    const types = [].concat(node["@type"] ?? []).map(String);
    if (types.some((t) => /^(Product|ProductGroup|IndividualProduct|ProductModel)$/.test(t))) found.push(node);
    if (types.includes("BreadcrumbList")) {
      crumbs = [].concat(node.itemListElement ?? []).map((e) => e?.name ?? e?.item?.name).filter(Boolean);
    }
    for (const k of ["@graph", "mainEntity", "itemListElement", "item", "about"]) if (node[k] && !types.includes("BreadcrumbList")) walk(node[k], depth + 1);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim().replace(/^<!--|-->$/g, "").replace(/^\s*\/\/<!\[CDATA\[|\/\/\]\]>\s*$/g, ""))); } catch {}
  }
  return found.map((p) => {
    const offers = [].concat(p.offers ?? first(p.hasVariant)?.offers ?? []).flatMap((o) => (o?.offers ? [].concat(o.offers) : [o]));
    const o = offers.find((x) => x && (x.price ?? x.lowPrice) != null) ?? offers[0] ?? {};
    const specs = [].concat(o.priceSpecification ?? []);
    const current = toPrice(o.price ?? o.lowPrice ?? specs.find((s) => !/List|Strikethrough/i.test(s?.priceType ?? ""))?.price);
    const before = toPrice(specs.find((s) => /List|Strikethrough/i.test(s?.priceType ?? ""))?.price);
    const url = abs(p.url || o.url || pageUrl, pageUrl) || pageUrl;
    const params = {};
    for (const a of [].concat(p.additionalProperty ?? [])) if (a?.name && a?.value != null) params[String(a.name)] = String(a.value);
    const brand = first(p.brand);
    return {
      id: String(p.sku || p.productID || p.gtin13 || p.gtin || url),
      name: plain(p.name, 200), brand: (typeof brand === "string" ? brand : brand?.name) || null,
      categoryName: lastSegment(p.category) || (crumbs.length > 1 ? crumbs.at(-2) : ""),
      price: current, oldPrice: before && current && before > current ? before : null,
      stock: /OutOfStock|SoldOut|Discontinued/i.test(String(o.availability ?? "")) ? 0 : 10,
      description: plain(p.description, 600), url, image: imageOf(p.image, pageUrl),
      ean: p.gtin13 || p.gtin || p.gtin14 || p.gtin8 || null, sku: p.sku || null, params,
    };
  });
}

const meta = (html, key) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1]
  ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"))?.[1];

/** A product described only by Open Graph tags (og:type product + product:price:amount). */
function ogProduct(html, pageUrl) {
  const amount = meta(html, "product:price:amount") ?? meta(html, "og:price:amount");
  if (!amount || !/product/i.test(meta(html, "og:type") ?? "product")) return null;
  const name = plain(meta(html, "og:title"), 200);
  return name ? {
    id: pageUrl, name, price: toPrice(amount), oldPrice: null, brand: meta(html, "product:brand") || null, categoryName: "",
    stock: /out.?of.?stock/i.test(meta(html, "product:availability") ?? "") ? 0 : 10,
    description: plain(meta(html, "og:description"), 600), url: pageUrl, image: abs(meta(html, "og:image") ?? "", pageUrl), params: {},
  } : null;
}

function links(html, pageUrl, domain) {
  const out = new Set();
  for (const m of html.matchAll(/<a\b[^>]*?href=["']([^"'#][^"']*)["']/gi)) {
    if (SKIP_PATH.test(m[1])) continue;
    const u = abs(m[1].replace(/&amp;/g, "&"), pageUrl);
    if (u && /^https?:/.test(u) && sameSite(u, domain) && !SKIP_EXT.test(u) && !SKIP_PATH.test(new URL(u).pathname + new URL(u).search)) out.add(u);
  }
  return [...out];
}

const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—", hellip: "…" };
const decode = (s) => s.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m);

/** The readable text of a page for Claude, with links and pictures marked so it can return them. */
export function pageText(html, pageUrl, max = 14000) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1];
  const text = decode(html
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const src = attr(tag, "data-src") || attr(tag, "src");
      return src && !src.startsWith("data:") ? ` [obrázek ${attr(tag, "alt") ?? ""}: ${abs(src, pageUrl)}] ` : " ";
    })
    .replace(/<a\b[^>]*?href=["']([^"'#][^"']*)["'][^>]*>/gi, (m, href) => (SKIP_PATH.test(href) ? " " : ` [odkaz ${abs(href.replace(/&amp;/g, "&"), pageUrl)}] `))
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();
  return `${title}\n${text}`.slice(0, max);
}

// ---------------------------------------------- what the website says ----
// Besides products the assistant learns everything else the website tells its visitors: what the
// business is, its services, prices, opening hours, delivery, FAQ, contact. Kept as plain text per
// page, without the menu and footer that repeat on every page.
const MAX_SITE_PAGES = 60, MAX_PAGE_CHARS = 5000, MAX_SITE_CHARS = 200_000;

/** A page's readable text without the link and picture marks pageText adds for product reading. */
export const readableText = (html, pageUrl) =>
  pageText(html, pageUrl, MAX_PAGE_CHARS * 2).replace(/ ?\[(odkaz|obrázek)[^\]]*\] ?/g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();

/** Pages → [{ url, title, text }]: lines found on most pages (menu, footer) kept only on the first. */
export function sitePagesFrom(pages) {
  const usable = pages.filter((p) => p.text.length > 120);
  const seen = new Map();
  for (const p of usable) for (const line of new Set(p.text.split("\n"))) seen.set(line, (seen.get(line) || 0) + 1);
  const common = (line) => usable.length >= 4 && seen.get(line) > usable.length * 0.5;
  const out = [], bodies = new Set();
  let total = 0;
  for (const [i, p] of usable.entries()) {
    const [title, ...lines] = p.text.split("\n");
    const body = (i === 0 ? lines : lines.filter((l) => !common(l))).join("\n").slice(0, MAX_PAGE_CHARS).trim();
    // the same page under two addresses (?plan=…, ?utm=…) only once
    if (body.length < 80 || total > MAX_SITE_CHARS || bodies.has(body)) continue;
    bodies.add(body);
    total += body.length;
    out.push({ url: p.url, title: title.trim() || p.url, text: body });
  }
  return out.slice(0, MAX_SITE_PAGES);
}

const SITE_SYSTEM = `Dostaneš JavaScript a data z webu, který se skládá až v prohlížeči (server pošle prázdnou stránku). Vypiš všechno, co web svým návštěvníkům říká o firmě a její nabídce – texty, které se na stránkách zobrazují.
- Piš čistý text po sekcích s krátkým nadpisem (např. „O nás“, „Nabídka a ceny“, „Ubytování“, „Doprava“, „Otevírací doba“, „Kontakt“, „Časté dotazy“).
- Jen to, co v datech opravdu je; nic nevymýšlej a nedoplňuj. Ignoruj kód, názvy proměnných, technické hlášky a texty správy webu.
- Ceny, časy, adresy, telefony a odkazy opiš přesně. Když je web ve více jazycích, vypiš češtinu (jinak jazyk webu).
- Nejvýš asi 12 000 znaků.`;

/** For a site drawn in the browser: Claude writes down what its pages say, read from its scripts. */
async function siteFromScripts(anthropic, { model, meter, signal }, home, domain) {
  const code = await scriptData(home.text, home.url, domain, signal);
  if (!code) return [];
  const msg = await anthropic.messages.create({
    model, max_tokens: 8000, system: SITE_SYSTEM,
    messages: [{ role: "user", content: `Web: ${home.url}\n<data_webu>\n${code}\n</data_webu>` }],
  }, { signal });
  meter?.(msg.usage);
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  return text.length > 80 ? [{ url: home.url, title: "Obsah webu", text: text.slice(0, MAX_SITE_CHARS) }] : [];
}

// ---------------------------------------------- the opening buttons ----
// The buttons under the assistant's first message ("Looking for a gift", "Delivery & returns"…) and
// its offer of help on the home page fit an e-shop, not a guesthouse, a restaurant or a service.
// Claude writes them for each website from what it says, in Czech and English.
const CHIPS = { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "ask"], properties: { label: { type: "string" }, ask: { type: "string" } } } };
const STARTERS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["cs", "en", "idle_cs", "idle_en"],
  properties: { cs: CHIPS, en: CHIPS, idle_cs: { type: "string" }, idle_en: { type: "string" } },
};
const STARTERS_SYSTEM = `Dostaneš, co web říká o firmě a její nabídce. Na webu je AI asistentka, která odpovídá návštěvníkům. Napiš pro ni úvodní tlačítka – otázky, se kterými na tento web lidé nejčastěji přicházejí.
- cs: přesně 3 tlačítka česky, en: tatáž 3 tlačítka anglicky.
- Emoji jen z běžných, které ukáže každý počítač i telefon (např. 📅 💰 📞 📍 ☕ 🍽️ 🛏️ 🏠 🚚 🎁 ❓ ⭐ 🕒 🛒 💬); žádná novější.
- label: co je na tlačítku – jedno vhodné emoji na začátku a nejvýš 4 slova (např. „📅 Volné termíny“, „🍽️ Denní menu“). ask: celá otázka, kterou tím návštěvník asistentce položí, v 1. osobě (např. „Jaké máte volné termíny?“).
- Otázky musí sedět na tento typ podniku (ubytování: termíny, cena za noc, vybavení; restaurace: menu, rezervace stolu; služby: ceník, objednání; e-shop: výběr, doprava…). Neptej se na nic, co tento podnik nenabízí – např. na dopravu zboží u ubytování.
- Ptej se jen na témata, o kterých web něco říká, aby je asistentka uměla zodpovědět.
- idle_cs / idle_en: jedna krátká věta, kterou asistentka nabídne pomoc návštěvníkovi, který se chvíli rozhlíží po úvodní stránce (např. „Plánujete pobyt? Řekněte mi termín a počet osob – zjistím, co je volné.“). Česky vykání, nejvýš jedno emoji.`;

/**
 * Claude writes the opening buttons for a website.
 * Returns { cs: [{ label, ask }], en: [...], idle: { cs, en } }, or null when it can't.
 */
export async function writeStarters(anthropic, { model, meter, signal }, { name, site = [], products = [] }) {
  const about = site.map((p) => `## ${p.title}\n${p.text}`).join("\n\n").slice(0, 24000);
  const offer = products.slice(0, 40).map((p) => `- ${p.name}${p.categoryName ? ` (${p.categoryName})` : ""}`).join("\n");
  if (!about && !offer) return null;
  const r = await anthropic.messages.create({
    model, max_tokens: 3000,
    output_config: { effort: "low", format: { type: "json_schema", schema: STARTERS_SCHEMA } },
    system: STARTERS_SYSTEM,
    messages: [{ role: "user", content: `Firma: ${name}\n${offer ? `<nabidka>\n${offer}\n</nabidka>\n` : ""}<web>\n${about}\n</web>` }],
  }, { signal, timeout: 60000, maxRetries: 1 });
  meter?.(r.usage);
  if (r.stop_reason !== "end_turn") return null;
  let out;
  try { out = JSON.parse(r.content.find((b) => b.type === "text")?.text ?? "{}"); } catch { return null; }
  const chips = (list) => (Array.isArray(list) ? list : [])
    .map((c) => ({ label: plain(c.label, 40), ask: plain(c.ask, 200) }))
    .filter((c) => c.label && c.ask).slice(0, 3);
  const cs = chips(out.cs), en = chips(out.en);
  if (!cs.length || !en.length) return null;
  return { cs, en, idle: { cs: plain(out.idle_cs, 220) || null, en: plain(out.idle_en, 220) || null } };
}

// ------------------------------------------------ Claude reads the page ----
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["products"],
  properties: {
    products: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["name", "price", "old_price", "url", "image", "category", "description", "in_stock"],
        properties: {
          name: { type: "string" }, price: { type: "number" }, old_price: { type: "number" },
          url: { type: "string" }, image: { type: "string" }, category: { type: "string" },
          description: { type: "string" }, in_stock: { type: "boolean" },
        },
      },
    },
  },
};
const EXTRACT_SYSTEM = `Dostaneš text jedné stránky e-shopu. Vypiš produkty, které obchod na této stránce nabízí ke koupi.
- Jen produkty, které na stránce opravdu jsou, s cenou. Nic nevymýšlej a nedoplňuj.
- price: aktuální cena jako číslo (např. 1290). old_price: původní přeškrtnutá cena, jinak 0.
- url: odkaz na detail produktu z textu [odkaz …]; když žádný není, adresa této stránky.
- image: adresa obrázku produktu z [obrázek …]; jinak prázdný text.
- category: kategorie produktu podle stránky (např. z navigace nebo nadpisu); jinak prázdný text.
- description: 1–2 věty o produktu převzaté ze stránky; jinak prázdný text.
- in_stock: false jen když stránka výslovně píše, že produkt není skladem.
- Když stránka žádné produkty nenabízí (kontakt, blog, obchodní podmínky, košík), vrať prázdný seznam. Nejvýš 60 produktů.`;

const SCRIPT_SYSTEM = `Dostaneš JavaScript a data (JSON) z webu e-shopu, který stránky skládá až v prohlížeči. Najdi v nich produkty, které obchod prodává, a vypiš je.
- Jen produkty, které v datech opravdu jsou, s cenou. Nic nevymýšlej. Ignoruj ukázkové texty v kódu, které nejsou produkty.
- price: aktuální cena jako číslo. old_price: původní (přeškrtnutá) cena, jinak 0.
- url: když z kódu poznáš, jak vypadá adresa stránky produktu (např. "#/p/" + id nebo "/produkt/" + slug), sestav ji z adresy webu; jinak adresa webu.
- image: adresa obrázku produktu, je-li v datech; jinak prázdný text.
- category: název kategorie produktu (ne její id), je-li v datech; jinak prázdný text.
- description: krátký popis produktu z dat; jinak prázdný text.
- in_stock: false jen když data říkají, že produkt není skladem (např. stock 0).
- Nejvýš 150 produktů.`;

async function aiProducts(anthropic, { model, meter, signal }, page, system = EXTRACT_SYSTEM) {
  const r = await anthropic.messages.create({
    model, max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system,
    messages: [{ role: "user", content: `Adresa ${system === SCRIPT_SYSTEM ? "webu" : "stránky"}: ${page.url}\n\n${page.text}` }],
  }, { signal, timeout: 120000, maxRetries: 1 });
  meter?.(r.usage);
  if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") return [];
  let items = [];
  try { items = JSON.parse(r.content.find((b) => b.type === "text")?.text ?? "{}").products ?? []; } catch { return []; }
  return items.map((p) => {
    let url = null;
    try { url = new URL(p.url, page.url).href; } catch {} // keeps "#/p/…" routes of browser-drawn shops
    const own = url && sameSite(url, page.domain) && url !== page.url ? url : null;
    const current = toPrice(p.price), before = toPrice(p.old_price);
    return {
      id: own ?? `${page.url}#${norm(p.name).replace(/[^a-z0-9]+/g, "-")}`,
      name: plain(p.name, 200), brand: null, categoryName: plain(p.category, 80),
      price: current, oldPrice: before && current && before > current ? before : null,
      stock: p.in_stock === false ? 0 : 10, description: plain(p.description, 600),
      url: own ?? page.url, image: /^https?:\/\//.test(p.image) ? p.image : null, params: {},
    };
  });
}

// --------------------------------------------- browser-drawn shops ----
const LIBRARY = /jquery|bootstrap|gtag|gtm|analytics|googletag|polyfill|recaptcha|hotjar|facebook|fbevents|cookie|consent|prodavac|sentry|stripe|paypal|intercom|tawk|smartsupp/i;
const PRICEY = /price|cena|ceny|kč|czk|€|eur\b/gi;

/**
 * The data a browser-drawn shop carries: its inline scripts and JSON (e.g. Next.js __NEXT_DATA__) and its
 * own script files – the ones most likely to hold products first. One text for Claude, or null.
 */
export async function scriptData(html, pageUrl, domain, signal, max = 80000) {
  const parts = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, body] = m;
    const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (/ld\+json/i.test(attrs)) continue;
    if (src) {
      const url = abs(src, pageUrl);
      if (url && sameSite(url, domain) && !LIBRARY.test(url)) parts.push({ url, text: null });
    } else if (body.trim().length > 40 && !LIBRARY.test(body.slice(0, 300))) parts.push({ url: "(vložený skript)", text: body.trim() });
  }
  await Promise.all(parts.slice(0, 12).map(async (p) => {
    if (p.text != null) return;
    const r = await get(p.url, { signal, maxBytes: 1.5e6 });
    p.text = r?.text ?? "";
  }));
  const ranked = parts.filter((p) => p.text).sort((a, b) => (b.text.match(PRICEY)?.length ?? 0) - (a.text.match(PRICEY)?.length ?? 0));
  let out = "";
  for (const p of ranked) {
    if (out.length >= max) break;
    out += `\n// ===== ${p.url} =====\n${p.text.slice(0, max - out.length)}\n`;
  }
  return out.trim() ? out : null;
}

// -------------------------------------------------------------- crawl ----
/** Up to `n` tasks at a time; stops starting new ones once `stop()` says so. */
async function pool(items, n, task, stop) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length && !stop()) await task(items[i++]);
  }));
}

/**
 * Reads a shop's products and what its pages say from its website.
 * Returns { categories, products, method, pages, site: [{ url, title, text }], feedUrl? }.
 * `ai` = { model, meter } lets Claude read pages without product data (needs ANTHROPIC_API_KEY).
 */
/**
 * A page that runs the assistant of another shop – a demo shop on Sella's own website, say. It isn't this
 * shop's offer, so its products and text aren't read and its links aren't followed.
 */
export function otherShopPage(html, clientId) {
  if (!clientId) return false;
  return [...html.matchAll(/<script\b[^>]*prodavac\.js[^>]*>/gi)]
    .some(([tag]) => { const id = tag.match(/\bdata-client=["']([^"']+)["']/i)?.[1]; return id && id !== clientId; });
}

export async function crawlShop(domain, { maxPages = 150, seconds = Number(process.env.CRAWL_SECONDS) || 100, ai = null, clientId = null, startUrls = [`https://${domain}/`, `https://www.${domain}/`] } = {}) {
  const deadline = Date.now() + seconds * 1000;
  const signal = AbortSignal.timeout(seconds * 1000);
  const late = () => Date.now() > deadline - 3000;

  let home = null;
  for (const u of startUrls) if (!home) home = await get(u, { signal });
  if (!home || !sameSite(home.url, domain)) throw new Error(`Web ${domain} se nepodařilo otevřít.`);
  const base = new URL(home.url).origin;

  // products from Shopify or a feed – then the pages are read only for what they say
  const fromShopify = await shopify(base, signal);
  const feed = fromShopify.length ? null : await findFeed(base, home.text, signal);
  const known = fromShopify.length ? { ...buildCatalog(fromShopify), method: "shopify" } : feed ? { ...feed.data, method: "feed", feedUrl: feed.feedUrl } : null;
  if (known) maxPages = Math.min(maxPages, MAX_SITE_PAGES);

  // the shop's pages: from its sitemap(s), or by following links from the home page
  const sitemapUrls = new Set();
  const robots = await get(`${base}/robots.txt`, { signal, maxBytes: 5e5 });
  const maps = [...(robots?.text ?? "").matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const queue = maps.length ? maps : [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`, `${base}/wp-sitemap.xml`];
  for (let n = 0; queue.length && n < 25 && sitemapUrls.size < 5000 && !late(); n++) {
    const r = await get(queue.shift(), { signal, maxBytes: 30e6 });
    if (!r) continue;
    let doc;
    try { doc = xml.parse(r.text); } catch { continue; }
    const children = (doc.sitemapindex?.sitemap ?? []).map((s) => String(s.loc ?? "").trim()).filter(Boolean);
    queue.push(...children.sort((a, b) => Number(/produ|product|zbozi/i.test(b)) - Number(/produ|product|zbozi/i.test(a))));
    for (const u of doc.urlset?.url ?? []) {
      const loc = String(u.loc ?? "").trim();
      if (loc && sameSite(loc, domain) && !SKIP_EXT.test(loc) && !SKIP_PATH.test(loc)) sitemapUrls.add(loc);
    }
  }
  // product pages first when looking for products; the other pages (about, services, FAQ) first otherwise
  const ranked = [...sitemapUrls].sort((a, b) => (Number(PRODUCTISH.test(b)) - Number(PRODUCTISH.test(a))) * (known ? -1 : 1));
  const follow = !ranked.length; // no sitemap → discover pages by following links
  const toVisit = [home.url, ...ranked.filter((u) => u !== home.url)].slice(0, maxPages);
  const seen = new Set(toVisit);

  const items = [];
  const snapshots = []; // pages without product data, for Claude
  const texts = [];     // what every page says (home page first)
  let pages = 0;
  const visit = async (url) => {
    const r = url === home.url ? home : await get(url, { signal });
    if (!r || !/html/i.test(r.type || "text/html") || otherShopPage(r.text, clientId)) return;
    pages++;
    const said = readableText(r.text, r.url);
    if (r.url === home.url) texts.unshift({ url: r.url, text: said }); else texts.push({ url: r.url, text: said });
    if (known) { if (follow) for (const u of links(r.text, r.url, domain)) if (seen.size < maxPages && !seen.has(u)) { seen.add(u); toVisit.push(u); } return; }
    const found = ldProducts(r.text, r.url);
    const og = found.length ? null : ogProduct(r.text, r.url);
    if (found.length || og) items.push(...found, ...(og ? [og] : []));
    else snapshots.push({ url: r.url, domain, text: pageText(r.text, r.url), productish: PRODUCTISH.test(r.url) || r.url === home.url });
    if (follow) {
      for (const u of links(r.text, r.url, domain)) {
        if (seen.size >= maxPages) break;
        if (!seen.has(u)) { seen.add(u); toVisit.push(u); }
      }
    }
  };
  // when following links the list grows while it is being worked through, so loop until it settles
  for (let done = 0; done < toVisit.length && !late();) {
    const batch = toVisit.slice(done);
    done = toVisit.length;
    await pool(batch, 6, visit, late);
  }

  let site = sitePagesFrom(texts);
  // a site drawn in the browser has (almost) no text in its pages: Claude reads it from the scripts
  if (site.reduce((n, p) => n + p.text.length, 0) < 400 && ai && process.env.ANTHROPIC_API_KEY && !late()) {
    try { site = await siteFromScripts(new Anthropic(), { ...ai, signal }, home, domain); }
    catch (err) { if (!signal.aborted) console.error("AI site reading:", err.message); }
  }
  if (known) return { ...known, pages, site };

  let method = "structured";
  if (!items.length && ai && snapshots.length && process.env.ANTHROPIC_API_KEY) {
    method = "ai";
    const anthropic = new Anthropic();
    const pick = snapshots.sort((a, b) => Number(b.productish) - Number(a.productish)).filter((p) => p.text.length > 200).slice(0, 25);
    await pool(pick, 4, async (page) => {
      try { items.push(...(await aiProducts(anthropic, { ...ai, signal }, page))); } catch (err) { if (!signal.aborted) console.error("AI product reading:", err.message); }
    }, late);
  }

  // nothing on the pages themselves – a shop drawn in the browser: read its scripts and embedded data
  if (!items.length && ai && process.env.ANTHROPIC_API_KEY && !late()) {
    const code = await scriptData(home.text, home.url, domain, signal);
    if (code) {
      method = "ai-scripts";
      try { items.push(...(await aiProducts(new Anthropic(), { ...ai, signal }, { url: home.url, domain, text: code }, SCRIPT_SYSTEM))); }
      catch (err) { if (!signal.aborted) console.error("AI script reading:", err.message); }
    }
  }

  // the same product found on several pages (a listing and its detail page): keep the fullest record
  const best = new Map();
  for (const p of items) {
    const prev = best.get(p.id);
    if (!prev || (p.description?.length ?? 0) + (p.image ? 50 : 0) > (prev.description?.length ?? 0) + (prev.image ? 50 : 0)) best.set(p.id, p);
  }
  return { ...buildCatalog([...best.values()]), method, pages, site };
}
