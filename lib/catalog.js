// Product catalogs: the single source of truth the AI is allowed to use. Each client shop has
// its own (see lib/catalogs.js): TechMarket's built-in demo data, or products from a shop's feed.
import data from "../catalog/store.js";

// Lowercase + strip diacritics so "nepromokave" matches "nepromokavé".
export function norm(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const STOPWORDS = new Set(["pro", "jak", "jaky", "jake", "jaka", "neco", "nejaky", "ktery", "chci", "hledam", "potrebuju", "mam", "ale", "nebo", "the", "dva", "dve", "tri", "mate", "nejake", "prosim", "dobry", "den"]);
const SHORT_STOPWORDS = new Set(["do", "na", "se", "to", "mi", "je", "si", "od", "po", "za", "ze", "ke", "ve", "co", "by", "ty", "ta", "ten", "moc", "kc"]);
const SYNONYMS = [[/fotak\w*/g, "fotoaparat"], [/baterk\w*|vydrz\w*/g, "vydrz baterie"], [/levn\w*/g, "levny"]];

export function keywords(query) {
  let t = norm(query);
  for (const [re, rep] of SYNONYMS) t = t.replace(re, rep);
  return t
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !SHORT_STOPWORDS.has(w))
    // crude Czech stemming: drop the ending ("sluchátka"→"sluchat", "notebooku"→"noteboo")
    .map((w) => (w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2))));
}

/** A product page address without host, tracking parameters or trailing slash – so feed URLs match page URLs. */
export function urlKey(u) {
  try {
    const x = new URL(u, "http://x");
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|gclid|fbclid|srsltid|_ga)/i.test(k)) x.searchParams.delete(k);
    x.searchParams.sort();
    return (decodeURIComponent(x.pathname).replace(/\/+$/, "") + (x.search || "")).toLowerCase() || "/";
  } catch { return null; }
}

// Everyday words customers use → TechMarket category ("telefon" → Mobily, "ps5" → Hry a konzole)
const TECHMARKET_HINTS = [
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

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds a catalog from { store, categories, products, related?, promotions?, demo? }.
 * `cat.store` may be replaced later (client settings change without rebuilding the product index).
 */
export function createCatalog(src, { categoryHints } = {}) {
  const categories = src.categories ?? [];
  const products = (src.products ?? []).map((p) => ({ highlights: [], params: {}, tags: [], stock: 1, sold: 0, rating: null, reviews: 0, ...p }));
  const related = src.related ?? {};
  const promotions = src.promotions ?? [];
  const byId = new Map(products.map((p) => [p.id, p]));

  // product lookup by whatever a shop's page exposes: code, EAN, product URL or name
  const byCode = new Map(), byUrl = new Map(), byName = new Map();
  const put = (map, key, p) => { if (!key) return; map.set(key, map.has(key) && map.get(key) !== p ? null : p); }; // null = ambiguous
  for (const p of products) {
    for (const code of [p.id, p.sku, p.ean]) put(byCode, code && norm(code), p);
    put(byUrl, p.url && urlKey(p.url), p);
    put(byName, norm(p.name), p);
  }

  const getProduct = (id) => byId.get(id) ?? null;
  const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? id;
  const categoryByName = (name) => categories.find((c) => norm(c.name) === norm(name))?.id ?? null;
  const hints = categoryHints ?? categories.map((c) => {
    const words = keywords(c.name).filter((w) => w.length >= 4);
    return words.length ? [new RegExp(words.map(escapeRe).join("|")), c.id] : null;
  }).filter(Boolean);

  const haystack = (p) => norm([p.name, p.brand, categoryName(p.category), p.description, p.highlights.join(" "), p.tags.join(" "), Object.entries(p.params).flat().join(" ")].join(" "));
  const index = new Map(products.map((p) => [p.id, haystack(p)]));

  const cat = {
    store: src.store,
    categories, products, related, demo: src.demo ?? null,
    getProduct, categoryName, categoryByName,

    /** Finds the catalog product a shop page or analytics event refers to. */
    findProduct({ id, sku, gtin, url, name } = {}) {
      for (const code of [id, sku, gtin]) { const p = code && byCode.get(norm(code)); if (p) return p; }
      const u = url && byUrl.get(urlKey(url)); if (u) return u;
      return (name && byName.get(norm(name))) || null;
    },

    discountPercent: (p) => (p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0),

    /** Compact view used in search results and product cards. */
    summary(p) {
      return {
        id: p.id, name: p.name, brand: p.brand ?? null, category: p.category,
        price: p.price, oldPrice: p.oldPrice ?? null, discountPercent: cat.discountPercent(p),
        inStock: p.stock > 0, rating: p.rating, reviews: p.reviews,
        image: p.image || `/api/img/${p.id}.svg`, url: p.url ?? null,
        highlights: p.highlights,
      };
    },

    detectCategory(text) {
      const t = norm(text);
      return hints.find(([re]) => re.test(t))?.[1] ?? null;
    },

    searchProducts({ query = "", category, min_price, max_price, only_discounted, limit = 6 } = {}) {
      const words = keywords(query);
      const hint = cat.detectCategory(query);
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
      return results.slice(0, limit).map((r) => cat.summary(r.p));
    },

    activePromotions(today = new Date()) {
      const iso = today.toISOString().slice(0, 10);
      return promotions.filter((pr) => !pr.validUntil || pr.validUntil >= iso);
    },

    /** Promotions relevant to one product: explicit, category-wide, or price-threshold ones. */
    promotionsFor(id) {
      const p = getProduct(id);
      if (!p) return [];
      return cat.activePromotions().filter((pr) =>
        pr.productIds.includes(id) ||
        (pr.categories?.includes(p.category) && (!pr.minPrice || p.price >= pr.minPrice)) ||
        (pr.type === "service" && !pr.productIds.length && !pr.categories && pr.minPrice && p.price >= pr.minPrice));
    },

    relatedProducts: (id) => (related[id] ?? []).map(getProduct).filter(Boolean),

    productDetails(id) {
      const p = getProduct(id);
      if (!p) return null;
      return {
        ...cat.summary(p),
        description: p.description,
        params: p.params,
        stock: p.stock,
        promotions: cat.promotionsFor(id).map(({ title, description, validUntil }) => ({ title, description, validUntil })),
        frequentlyBoughtTogether: cat.relatedProducts(id).map(cat.summary),
      };
    },

    /** Prices a cart including automatic bundle discounts. cart: [{id, quantity}] */
    priceCart(cart = []) {
      const lines = cart.map((c) => ({ ...c, p: getProduct(c.id) })).filter((l) => l.p);
      const subtotal = lines.reduce((s, l) => s + l.p.price * l.quantity, 0);
      const has = (id) => lines.some((l) => l.id === id);
      const discounts = [];
      for (const pr of cat.activePromotions()) {
        const b = pr.bundle;
        if (!b || !has(b.main) || !has(b.with)) continue;
        const withP = getProduct(b.with);
        const amount = b.discountPercent ? Math.round((withP.price * b.discountPercent) / 100) : b.discountAmount;
        discounts.push({ promoId: pr.id, title: pr.title, amount });
      }
      const discount = discounts.reduce((s, d) => s + d.amount, 0);
      const total = subtotal - discount;
      const from = cat.store.freeShippingFrom ?? null;
      return { subtotal, discounts, total, freeShippingFrom: from, freeShippingRemaining: from ? Math.max(0, from - total) : 0 };
    },
  };
  return cat;
}

/** The TechMarket demo shop (built-in data, its own JS integration in public/shop.js). */
export const techmarket = createCatalog(data, { categoryHints: TECHMARKET_HINTS });
