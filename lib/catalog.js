// Product catalog: the single source of truth the AI is allowed to use.
// In a real integration this module would read from the shop's feed/API
// (Shoptet, WooCommerce, Heureka XML feed, ...) instead of a JSON file.
import data from "../catalog/store.js";

export const store = data.store;
export const categories = data.categories;
export const products = data.products;
export const related = data.related;
const byId = new Map(products.map((p) => [p.id, p]));

export function getProduct(id) {
  return byId.get(id) ?? null;
}
export const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? id;

// Lowercase + strip diacritics so "nepromokave" matches "nepromokavé".
export function norm(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const STOPWORDS = new Set(["pro", "jak", "jaky", "jake", "jaka", "neco", "nejaky", "ktery", "chci", "hledam", "potrebuju", "mam", "ale", "nebo", "the", "dva", "dve", "tri", "mate", "nejake", "prosim", "dobry", "den"]);

function haystack(p) {
  return norm([p.name, p.brand, categoryName(p.category), p.description, p.highlights.join(" "), p.tags.join(" "), Object.entries(p.params).flat().join(" ")].join(" "));
}
const index = new Map(products.map((p) => [p.id, haystack(p)]));

export function discountPercent(p) {
  return p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
}

/** Compact view used in search results and product cards. */
export function summary(p) {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    price: p.price,
    oldPrice: p.oldPrice ?? null,
    discountPercent: discountPercent(p),
    inStock: p.stock > 0,
    rating: p.rating,
    reviews: p.reviews,
    image: `/api/img/${p.id}.svg`,
    highlights: p.highlights,
  };
}

// Everyday words customers use → catalog category ("telefon" → Mobily, "ps5" → Hry a konzole)
const CATEGORY_HINTS = [
  [/telefon|mobil|smartphon|iphon|android/, "mobily"],
  [/notebook|laptop|macbook|pocitac/, "notebooky"],
  [/televiz|\btv\b|televiz|soundbar|oled|qled/, "tv"],
  [/sluchat|repro|airpod|pecky|bluetooth/, "audio"],
  [/hodink|naramek|fitness|smartwatch/, "hodinky"],
  [/tablet|ipad/, "tablety"],
  [/konzol|playstation|playstar|ps5|xbox|nintendo|switch|hrani/, "herni"],
  [/vysavac|kavovar|kava|uklid/, "domacnost"],
  [/nabijec|powerbank|kabel|obal|mys\b|brasn|\bhub\b/, "prislusenstvi"],
];
const SYNONYMS = [[/fotak\w*/g, "fotoaparat"], [/baterk\w*|vydrz\w*/g, "vydrz baterie"], [/levn\w*/g, "levny"]];

export function detectCategory(text) {
  const t = norm(text);
  return CATEGORY_HINTS.find(([re]) => re.test(t))?.[1] ?? null;
}

const SHORT_STOPWORDS = new Set(["do", "na", "se", "to", "mi", "je", "si", "od", "po", "za", "ze", "ke", "ve", "co", "by", "ty", "ta", "ten", "moc", "kc"]);

export function keywords(query) {
  let t = norm(query);
  for (const [re, rep] of SYNONYMS) t = t.replace(re, rep);
  return t
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !SHORT_STOPWORDS.has(w))
    // crude Czech stemming: drop the ending ("sluchátka"→"sluchat", "notebooku"→"noteboo")
    .map((w) => (w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2))));
}

export function searchProducts({ query = "", category, min_price, max_price, only_discounted, limit = 6 } = {}) {
  const words = keywords(query);
  const hint = detectCategory(query);
  let results = products
    .filter((p) => !category || p.category === category)
    .filter((p) => min_price == null || p.price >= min_price)
    .filter((p) => max_price == null || p.price <= max_price)
    .filter((p) => !only_discounted || p.oldPrice)
    .map((p) => {
      const text = index.get(p.id);
      const name = norm(p.name + " " + categoryName(p.category));
      let textScore = 0, numScore = 0;
      for (const w of words) {
        const pts = name.includes(w) ? 3 : text.includes(w) ? 1 : 0;
        if (/^\d+$/.test(w)) numScore += pts; else textScore += pts;
      }
      const catScore = hint === p.category ? 2 : 0;
      // a bare number ("12", "16") never qualifies a product on its own
      const qualifies = textScore > 0 || catScore > 0;
      return { p, score: qualifies ? textScore + catScore + numScore : 0 };
    });
  if (words.length) results = results.filter((r) => r.score > 0);
  results.sort((a, b) => b.score - a.score || b.p.sold - a.p.sold);
  return results.slice(0, limit).map((r) => summary(r.p));
}

export function activePromotions(today = new Date()) {
  const iso = today.toISOString().slice(0, 10);
  return data.promotions.filter((pr) => !pr.validUntil || pr.validUntil >= iso);
}

/** Promotions relevant to one product: explicit, category-wide, or price-threshold ones. */
export function promotionsFor(id) {
  const p = getProduct(id);
  if (!p) return [];
  return activePromotions().filter((pr) =>
    pr.productIds.includes(id) ||
    (pr.categories?.includes(p.category) && (!pr.minPrice || p.price >= pr.minPrice)) ||
    (pr.type === "service" && !pr.productIds.length && !pr.categories && pr.minPrice && p.price >= pr.minPrice));
}

export function relatedProducts(id) {
  return (data.related[id] ?? []).map(getProduct).filter(Boolean);
}

export function productDetails(id) {
  const p = getProduct(id);
  if (!p) return null;
  return {
    ...summary(p),
    description: p.description,
    params: p.params,
    stock: p.stock,
    promotions: promotionsFor(id).map(({ title, description, validUntil }) => ({ title, description, validUntil })),
    frequentlyBoughtTogether: relatedProducts(id).map(summary),
  };
}

/** Prices a cart including automatic bundle discounts. cart: [{id, quantity, size}] */
export function priceCart(cart = []) {
  const lines = cart.map((c) => ({ ...c, p: getProduct(c.id) })).filter((l) => l.p);
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.quantity, 0);
  const has = (id) => lines.some((l) => l.id === id);
  const discounts = [];
  for (const pr of activePromotions()) {
    const b = pr.bundle;
    if (!b || !has(b.main) || !has(b.with)) continue;
    const withP = getProduct(b.with);
    const amount = b.discountPercent ? Math.round((withP.price * b.discountPercent) / 100) : b.discountAmount;
    discounts.push({ promoId: pr.id, title: pr.title, amount });
  }
  const discount = discounts.reduce((s, d) => s + d.amount, 0);
  const total = subtotal - discount;
  return {
    subtotal, discounts, total,
    freeShippingFrom: store.freeShippingFrom,
    freeShippingRemaining: Math.max(0, store.freeShippingFrom - total),
  };
}
