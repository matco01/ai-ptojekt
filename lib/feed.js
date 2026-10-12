// Reads a shop's product feed into catalog data. Supports the two feeds almost every Czech
// e-shop already has: Heureka / Zboží.cz XML (<SHOP><SHOPITEM>) and Google Merchant (RSS <item> or Atom <entry>).
import { XMLParser } from "fast-xml-parser";
import { norm } from "./catalog.js";

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true, // g:price → price
  parseTagValue: false, // keep "0012" and prices as text; we parse numbers ourselves
  trimValues: true,
  isArray: (name) => ["SHOPITEM", "item", "entry", "PARAM"].includes(name),
});

const text = (v) => (v == null ? "" : typeof v === "object" ? String(v["#text"] ?? "") : String(v)).trim();
export const plain = (html, max) => text(html).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export function price(v) {
  const t = text(v).replace(/[^\d,.-]/g, "");
  const n = Number(t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ostatni";
const lastSegment = (path) => text(path).split(/\s*[|>]\s*/).filter(Boolean).at(-1) || "";

function fromHeureka(i) {
  const params = {};
  for (const p of i.PARAM ?? []) { const k = text(p.PARAM_NAME), v = text(p.VAL); if (k && v) params[k] = v; }
  const delivery = text(i.DELIVERY_DATE);
  if (delivery) params["Dostupnost"] = delivery === "0" ? "skladem" : /^\d+$/.test(delivery) ? `do ${delivery} dnů` : delivery;
  const current = price(i.PRICE_VAT);
  const before = price(i.PRICE_BEFORE_DISCOUNT) ?? price(i.STANDARD_PRICE);
  return {
    id: text(i.ITEM_ID) || text(i.EAN) || text(i.URL),
    name: text(i.PRODUCTNAME) || text(i.PRODUCT),
    brand: text(i.MANUFACTURER) || null,
    categoryName: lastSegment(i.CATEGORYTEXT),
    price: current,
    oldPrice: before && current && before > current ? before : null,
    stock: delivery === "0" || !delivery ? 10 : 1,
    description: plain(i.DESCRIPTION, 600),
    url: text(i.URL) || null,
    image: text(i.IMGURL) || null,
    ean: text(i.EAN) || null,
    params,
  };
}

function fromGoogle(i) {
  const current = price(i.sale_price) ?? price(i.price);
  const regular = price(i.price);
  const availability = text(i.availability).replace(/_/g, " ");
  const params = {};
  if (availability) params["Dostupnost"] = availability === "in stock" ? "skladem" : availability;
  for (const k of ["color", "size", "material"]) if (text(i[k])) params[k] = text(i[k]);
  return {
    id: text(i.id) || text(i.gtin) || text(i.link),
    name: text(i.title),
    brand: text(i.brand) || null,
    categoryName: lastSegment(i.product_type) || lastSegment(i.google_product_category),
    price: current,
    oldPrice: regular && current && regular > current ? regular : null,
    stock: /out.of.stock/.test(availability) ? 0 : 10,
    description: plain(i.description, 600),
    url: text(i.link) || null,
    image: text(i.image_link) || null,
    ean: text(i.gtin) || null,
    params,
  };
}

/** Parses feed XML into { categories, products }. Items without a name or price are skipped. */
export function parseFeed(xml, { maxProducts = 20000 } = {}) {
  const doc = parser.parse(xml);
  const heureka = doc.SHOP?.SHOPITEM;
  const google = doc.rss?.channel?.item ?? doc.feed?.entry;
  if (!heureka && !google) throw new Error("Neznámý formát feedu (čekám Heureka/Zboží.cz nebo Google Merchant XML).");

  return buildCatalog((heureka ?? google).map(heureka ? fromHeureka : fromGoogle), { maxProducts });
}

/**
 * Products → { categories, products } in the catalog's shape. Each item: { id, name, price, oldPrice,
 * brand, categoryName, stock, description, url, image, ean, params }. Items without an id, name or
 * price are skipped, and so are repeated ids. Used for feeds and for products read off a shop's website.
 */
export function buildCatalog(items, { maxProducts = 20000 } = {}) {
  const categories = new Map();
  const products = [];
  const seen = new Set();
  for (const item of items) {
    const p = { params: {}, ...item };
    if (!p.id || !p.name || !p.price || seen.has(p.id)) continue;
    seen.add(p.id);
    const catName = p.categoryName || "Ostatní";
    const catId = slug(catName);
    categories.set(catId, { id: catId, name: catName });
    const { categoryName, ...rest } = p;
    products.push({
      ...rest,
      category: catId,
      highlights: Object.entries(p.params).filter(([k]) => k !== "Dostupnost").slice(0, 3).map(([k, v]) => `${k}: ${v}`),
      tags: [p.brand, catName].filter(Boolean),
    });
    if (products.length >= maxProducts) break;
  }
  return { categories: [...categories.values()], products };
}
