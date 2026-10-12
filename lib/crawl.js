// Reads a shop's products straight from its website – for shops without a product feed (many small
// shops don't have one, or don't know what it is). Tried in this order:
//   1. Shopify stores publish every product at /products.json
//   2. a product feed at a usual address or linked from the home page (Heureka / Zboží.cz / Google)
//   3. the shop's pages – found through its sitemap, or by following links from the home page – read
//      from the product data e-shops publish for Google (JSON-LD "Product", Open Graph product tags)
//   4. when no page has that data, Claude reads the products off the page text (Claude Haiku: cheap)
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

async function aiProducts(anthropic, { model, meter, signal }, page) {
  const r = await anthropic.messages.create({
    model, max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: EXTRACT_SYSTEM,
    messages: [{ role: "user", content: `Adresa stránky: ${page.url}\n\n${page.text}` }],
  }, { signal, timeout: 90000, maxRetries: 1 });
  meter?.(r.usage);
  if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") return [];
  let items = [];
  try { items = JSON.parse(r.content.find((b) => b.type === "text")?.text ?? "{}").products ?? []; } catch { return []; }
  return items.map((p) => {
    const url = abs(p.url, page.url);
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

// -------------------------------------------------------------- crawl ----
/** Up to `n` tasks at a time; stops starting new ones once `stop()` says so. */
async function pool(items, n, task, stop) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length && !stop()) await task(items[i++]);
  }));
}

/**
 * Reads a shop's products from its website. Returns { categories, products, method, pages, feedUrl? }.
 * `ai` = { model, meter } lets Claude read pages without product data (needs ANTHROPIC_API_KEY).
 */
export async function crawlShop(domain, { maxPages = 150, seconds = Number(process.env.CRAWL_SECONDS) || 100, ai = null, startUrls = [`https://${domain}/`, `https://www.${domain}/`] } = {}) {
  const deadline = Date.now() + seconds * 1000;
  const signal = AbortSignal.timeout(seconds * 1000);
  const late = () => Date.now() > deadline - 3000;

  let home = null;
  for (const u of startUrls) if (!home) home = await get(u, { signal });
  if (!home || !sameSite(home.url, domain)) throw new Error(`Web ${domain} se nepodařilo otevřít.`);
  const base = new URL(home.url).origin;

  const fromShopify = await shopify(base, signal);
  if (fromShopify.length) return { ...buildCatalog(fromShopify), method: "shopify", pages: 1 };

  const feed = await findFeed(base, home.text, signal);
  if (feed) return { ...feed.data, method: "feed", feedUrl: feed.feedUrl, pages: 1 };

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
  const ranked = [...sitemapUrls].sort((a, b) => Number(PRODUCTISH.test(b)) - Number(PRODUCTISH.test(a)));
  const follow = !ranked.length; // no sitemap → discover pages by following links
  const toVisit = [home.url, ...ranked.filter((u) => u !== home.url)].slice(0, maxPages);
  const seen = new Set(toVisit);

  const items = [];
  const snapshots = []; // pages without product data, for Claude
  let pages = 0;
  const visit = async (url) => {
    const r = url === home.url ? home : await get(url, { signal });
    if (!r || !/html/i.test(r.type || "text/html")) return;
    pages++;
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

  let method = "structured";
  if (!items.length && ai && snapshots.length && process.env.ANTHROPIC_API_KEY) {
    method = "ai";
    const anthropic = new Anthropic();
    const pick = snapshots.sort((a, b) => Number(b.productish) - Number(a.productish)).filter((p) => p.text.length > 200).slice(0, 25);
    await pool(pick, 4, async (page) => {
      try { items.push(...(await aiProducts(anthropic, { ...ai, signal }, page))); } catch (err) { if (!signal.aborted) console.error("AI product reading:", err.message); }
    }, late);
  }

  // the same product found on several pages (a listing and its detail page): keep the fullest record
  const best = new Map();
  for (const p of items) {
    const prev = best.get(p.id);
    if (!prev || (p.description?.length ?? 0) + (p.image ? 50 : 0) > (prev.description?.length ?? 0) + (prev.image ? 50 : 0)) best.set(p.id, p);
  }
  return { ...buildCatalog([...best.values()]), method, pages };
}
