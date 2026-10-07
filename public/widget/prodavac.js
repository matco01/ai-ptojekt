/*
 * AI Prodavač – embeddable widget
 *
 * Usage on any website (data-client is required – it says which shop the widget belongs to):
 *   <script src="https://YOUR-SERVER/widget/prodavac.js" data-client="shop-id" defer></script>
 *
 * Consent (GDPR): behaviour analytics and remembering returning visitors run only with the visitor's
 * consent to analytics. The widget reads it from the shop's consent tool (Google Consent Mode
 * "analytics_storage", Cookiebot, OneTrust), or the shop sets it: data-consent="granted" (the shop loads
 * the widget only after consent), AIProdavac.setConsent(true|false), or window.AIProdavac = { consent: true }
 * before the widget loads. Without consent the widget still greets, gives tips and chats – it just
 * doesn't store anything about the visitor. data-privacy-url = link to the shop's own privacy policy.
 *
 * The look adapts to the host site automatically (brand colour, font, roundness,
 * light/dark). Optional overrides: data-color, data-theme="light|dark", data-font, data-radius, data-name.
 *
 * Without any code from the shop, the widget reads the page itself: product structured data
 * (JSON-LD / microdata), the page address (matched against the shop's feed) and the analytics
 * dataLayer (view_item, add_to_cart, remove_from_cart, purchase, search).
 *
 * Integration hooks (set by the host shop, all optional – they replace the automatic reading):
 *   AIProdavac.getContext    = () => ({ pageType, category, currentProductId, viewedProductIds, cart:[{id,quantity}] })
 *   AIProdavac.onAddToCart   = (item) => { ... }     // item: {id,name,price,quantity}
 *   AIProdavac.onOpenProduct = (id) => { ... }
 *   AIProdavac.track(type, data)                     // behaviour events: page_view, product_view, search{query,results}, add_to_cart, purchase
 */
(() => {
  if (window.AIProdavac?.__loaded) return;

  const script = document.currentScript;
  if (!script?.dataset.client) {
    console.error("AI prodavač: chybí data-client ve vložení widgetu, např. <script src=\".../prodavac.js\" data-client=\"vas-obchod\">. Widget se nespustí.");
    return;
  }
  const cfg = {
    api: script.dataset.api || new URL(script.src || location.href).origin,
    client: script.dataset.client, // which shop this embed belongs to
    name: script?.dataset.name || "Klára",
    color: script?.dataset.color || "#1a8f4c",
    greetDelay: Number(script?.dataset.greetDelay ?? 0.6) * 1000,
    lang: script?.dataset.lang || "cs-CZ",
  };

  cfg.privacy = script.dataset.privacyUrl || cfg.api + "/soukromi.html";

  // ----------------------------------------------------------- consent ----
  // Analytics consent: set by the shop, or read from its consent tool. null = no answer yet (= no).
  let consentOverride = script.dataset.consent === "granted" ? true
    : typeof window.AIProdavac?.consent === "boolean" ? window.AIProdavac.consent : null;
  function detectConsent() {
    try {
      if (window.Cookiebot?.consent) return Boolean(window.Cookiebot.consent.statistics);
      if (typeof window.OnetrustActiveGroups === "string") return /(^|,)C0002(,|$)/.test(window.OnetrustActiveGroups);
      let granted = null; // Google Consent Mode: the last default/update wins
      for (const e of window.dataLayer || []) {
        if (e && e[0] === "consent" && typeof e[2]?.analytics_storage === "string") granted = e[2].analytics_storage === "granted";
      }
      return granted;
    } catch { return null; }
  }
  const consent = () => consentOverride ?? detectConsent() ?? false;

  // ------------------------------------------------------------- state ----
  // localStorage (remembered across visits) and the behaviour history are used only with consent;
  // without it they live in memory for the current page. The rest of sessionStorage only keeps the
  // widget working while the visitor moves between pages (open chat, its messages, "just looking").
  const mem = new Map();
  const TRACKING = /^(searches|seq|cartRemovals)$/;
  const box = (storage, needsConsent) => ({
    get(k) {
      if (needsConsent(k) && !consent()) return mem.get(k) ?? null;
      try { return JSON.parse(storage().getItem("aip_" + k)); } catch { return null; }
    },
    set(k, v) {
      if (needsConsent(k) && !consent()) { mem.set(k, v); return; }
      try { storage().setItem("aip_" + k, JSON.stringify(v)); } catch {}
    },
  });
  const ls = box(() => localStorage, () => true);
  const ss = box(() => sessionStorage, (k) => TRACKING.test(k));
  let sessionId = ss.get("sid");
  const isNewSession = !sessionId;
  if (!sessionId) {
    sessionId = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/[^\w-]/g, "");
    ss.set("sid", sessionId);
    ls.set("visits", (ls.get("visits") || 0) + 1);
  }
  const returning = (ls.get("visits") || 1) > 1;

  // per-session memory of how the customer reacted
  const state = Object.assign({ greeted: false, choice: null, shown: [], nudgeCount: 0, lastNudgeAt: 0, cooldown: 20e3, offlineNoted: false }, ss.get("state") || {});
  const saveState = () => ss.set("state", state);

  const api = (window.AIProdavac = window.AIProdavac || {});
  api.__loaded = true;
  api.setConsent = (granted) => {
    consentOverride = Boolean(granted);
    if (!consentOverride) {
      queue = [];
      try { for (const k of Object.keys(localStorage)) if (k.startsWith("aip_")) localStorage.removeItem(k); } catch {}
    }
  };
  let mode = null;          // "chat" | "voice" | null (panel closed)
  let busy = false;
  let lastChatActivity = 0;

  // ------------------------------------------------ behaviour tracking ----
  let pageStart = Date.now();
  const searches = ss.get("searches") || [];

  // How the customer behaves – the cues a salesperson reads from across the shop floor.
  // Per page: active time, pauses, re-reading, filter churn, lingering over "add to cart".
  // Per visit: the order of viewed products (back-and-forth = can't decide), cart removals.
  const beh = {
    activeMs: 0, lastInput: Date.now(), rereads: 0, filterChanges: 0, hoverAdd: 0, tabs: [],
    seq: ss.get("seq") || [], cartRemovals: ss.get("cartRemovals") || 0,
    scrollY: scrollY, scrollDir: 0, turnAt: scrollY,
  };
  const resetPage = () => Object.assign(beh, { activeMs: 0, rereads: 0, filterChanges: 0, hoverAdd: 0, tabs: [], lastInput: Date.now() });
  const onInput = () => { beh.lastInput = Date.now(); };
  for (const ev of ["mousemove", "keydown", "click", "touchstart", "wheel"]) addEventListener(ev, onInput, { passive: true });
  addEventListener("scroll", () => {
    onInput();
    const y = scrollY, dir = Math.sign(y - beh.scrollY);
    if (dir && dir !== beh.scrollDir) {
      // scrolled down a good way and then back up = going back to re-read something
      if (dir < 0 && y < beh.turnAt - 20 && beh.scrollY - beh.turnAt > 300) beh.rereads++;
      if (dir < 0) beh.turnAt = beh.scrollY; else beh.turnAt = y;
      beh.scrollDir = dir;
    }
    beh.scrollY = y;
  }, { passive: true });
  setInterval(() => {
    // count only time the customer is actually here and doing something (or just paused to think)
    if (document.visibilityState === "visible" && Date.now() - beh.lastInput < 30000) beh.activeMs += 1000;
  }, 1000);

  let queue = [];
  let flushTimer = null;
  api.track = (type, data = {}) => {
    if (type === "page_view") { pageStart = Date.now(); resetPage(); }
    if (type === "search") { searches.push({ q: data.query, results: data.results }); ss.set("searches", searches.slice(-5)); }
    if (type === "product_view") { beh.seq = [...beh.seq, data.productId].slice(-12); ss.set("seq", beh.seq); }
    if (type === "filter_change") beh.filterChanges++;
    if (type === "tab_view" && data.tab) beh.tabs.push(data.tab);
    if (type === "hover_add") beh.hoverAdd++;
    if (type === "cart_remove") { beh.cartRemovals++; ss.set("cartRemovals", beh.cartRemovals); }
    if (consent()) {
      queue.push({ type, ...data });
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 800);
    }
    // a real salesperson reacts to what just happened – re-check soon
    if (["search", "add_to_cart", "product_view", "category_view", "page_view", "cart_remove", "hover_add"].includes(type)) scheduleCheck(1200);
  };
  function flush() {
    if (!consent()) queue = [];
    if (!queue.length) return;
    const body = JSON.stringify({ client: cfg.client, sessionId, events: queue });
    queue = [];
    const url = cfg.api + "/api/events";
    // text/plain: a beacon to another domain (every client shop) is blocked by the browser if it is
    // sent as application/json – that would need a CORS preflight, which beacons can't pass
    let sent = false;
    try { sent = navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain;charset=UTF-8" })); } catch {}
    if (!sent) fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  }
  addEventListener("pagehide", flush);
  if (isNewSession) api.track("session_start");

  function signals(extra = {}) {
    const hosted = hostIntegrated();
    let c = {};
    try { c = (hosted ? api.getContext() : autoContext()) || {}; } catch {}
    return {
      integration: hosted ? "host" : "auto",
      consent: consent(),
      pageType: c.pageType, category: c.category, currentProductId: c.currentProductId,
      viewedProductIds: c.viewedProductIds, cart: c.cart,
      searches: searches.slice(-5), secondsOnPage: Math.round((Date.now() - pageStart) / 1000),
      returning, declined: state.choice === "declined", shown: state.shown, mode, agentName: cfg.name, brand: AV?.brand,
      behaviour: {
        activeSec: Math.round(beh.activeMs / 1000), idleSec: Math.round((Date.now() - beh.lastInput) / 1000),
        rereads: beh.rereads, filterChanges: beh.filterChanges, hoverAdd: beh.hoverAdd, tabs: beh.tabs,
        seq: beh.seq, cartRemovals: beh.cartRemovals,
      },
      ...extra,
    };
  }
  const post = (path, body) => fetch(cfg.api + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client: cfg.client, ...body }) }).then((r) => r.json());

  // ------------------------------------------- automatic shop integration ----
  // Shops that don't call our JS API (no AIProdavac.getContext) are read from what their pages
  // already publish for Google: structured product data (JSON-LD / microdata), the product URL
  // (matched against the shop's feed on the server) and the analytics dataLayer (view_item,
  // add_to_cart, purchase…). Nothing has to be added to the shop's code apart from the widget line.
  const hostIntegrated = () => typeof api.getContext === "function";
  let integ = {}; // per-client overrides from the server: { addToCart: css, cart: css, thankYou: regex }
  const autoKey = (k) => `auto_${cfg.client || "default"}_${k}`;
  const auto = { pageType: "other", productId: null, category: null };
  let autoViewed = ls.get(autoKey("viewed")) || [];
  let autoCart = ls.get(autoKey("cart")) || [];
  const saveAutoCart = () => ls.set(autoKey("cart"), autoCart);
  let pendingAdd = null; // our own click on the shop's button – the shop's analytics reports it too
  const autoContext = () => ({ pageType: auto.pageType, category: auto.category, currentProductId: auto.productId, viewedProductIds: autoViewed, cart: autoCart });

  const one = (v) => (v == null ? "" : String(Array.isArray(v) ? v[0] ?? "" : v).trim());
  const plainText = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const urlKey = (u) => { try { const x = new URL(u, location.href); return (x.pathname.replace(/\/+$/, "") + x.search).toLowerCase(); } catch { return ""; } };
  const resolveRefs = (refs, categoryName) => post("/api/resolve", { refs, categoryName }).catch(() => ({ ids: [], categories: [] }));

  function ldNodes(type) {
    const out = [];
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walk);
      if ([].concat(n["@type"] || []).some((t) => type.test(t))) out.push(n);
      walk(n["@graph"]); walk(n.mainEntity);
    };
    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) { try { walk(JSON.parse(el.textContent)); } catch {} }
    return out;
  }
  // what the page says about its product: code, EAN, name – plus always its address
  function pageProductRef() {
    const ld = ldNodes(/^(Product|ProductGroup|IndividualProduct)$/i)[0];
    const md = document.querySelector('[itemtype*="schema.org/Product" i]');
    const prop = (n) => { const e = md?.querySelector(`[itemprop="${n}"]`); return e ? one(e.getAttribute("content") || e.textContent) : ""; };
    const meta = (n) => one(document.querySelector(`meta[property="${n}"]`)?.content);
    const ref = { url: location.href };
    if (ld || md || meta("og:type") === "product") {
      ref.sku = one(ld?.sku ?? ld?.productID ?? ld?.mpn) || prop("sku") || prop("productID");
      ref.gtin = one(ld?.gtin13 ?? ld?.gtin ?? ld?.gtin14 ?? ld?.gtin12 ?? ld?.gtin8) || prop("gtin13") || prop("gtin");
      ref.name = one(ld?.name) || prop("name") || meta("og:title");
    }
    return ref;
  }
  const breadcrumbLast = () => { const items = [].concat(ldNodes(/^BreadcrumbList$/i)[0]?.itemListElement || []); const l = items.at(-1); return one(l?.name ?? l?.item?.name); };
  function searchQuery() {
    const p = new URLSearchParams(location.search);
    for (const k of ["q", "query", "search", "s", "hledat", "string", "phrase", "term"]) if (p.get(k)) return p.get(k).slice(0, 60);
    return null;
  }
  function isThankYou() {
    try { if (integ.thankYou && new RegExp(integ.thankYou, "i").test(location.href)) return true; } catch {}
    return /dekujeme|dekuji|objednavka-(odeslana|dokoncena|prijata)|order-(received|confirmation|complete)|thank-?you|checkout\/success|dokonceni-objednavky/i.test(location.pathname + location.search);
  }

  function rememberViewed(id) {
    autoViewed = [...autoViewed.filter((x) => x !== id), id].slice(-8);
    ls.set(autoKey("viewed"), autoViewed);
    api.track("product_view", { productId: id });
  }

  let purchaseSeen = false;
  async function detectPage() {
    Object.assign(auto, { productId: null, category: null });
    const ref = pageProductRef();
    const r = await resolveRefs([ref], ref.name ? "" : breadcrumbLast());
    auto.productId = r.ids?.[0] ?? null;
    auto.category = r.categories?.[0] ?? r.category ?? null;
    const path = location.pathname.toLowerCase(), q = searchQuery();
    auto.pageType = auto.productId ? "product"
      : /kosik|cart|basket|checkout|pokladna/.test(path) ? "cart"
      : q || /hledat|vyhledavani|search/.test(path) ? "search"
      : path === "/" ? "home"
      : auto.category ? "category" : "other";
    api.track("page_view");
    if (auto.productId) rememberViewed(auto.productId);
    else if (auto.pageType === "category") api.track("category_view", { category: auto.category });
    if (q) {
      const empty = /nenalezen|nic jsme nena|zadne vysledky|0 vysledku|nebyl nalezen/.test(plainText(document.body.innerText.slice(0, 20000)));
      api.track("search", { query: q, results: empty ? 0 : 1 });
    }
    // an order confirmation page without an analytics "purchase" event still counts as a purchase
    if (isThankYou() && !ss.get("bought:" + location.pathname)) {
      ss.set("bought:" + location.pathname, true);
      setTimeout(() => { if (!purchaseSeen) { api.track("purchase", { value: 0 }); autoCart = []; saveAutoCart(); } }, 3000);
    }
  }

  // ---- the shop's analytics dataLayer (GA4 and Universal Analytics e-commerce events) ----
  const dlItems = (list) => [].concat(list || []).map((i) => ({
    ref: { id: one(i.item_id ?? i.id ?? i.sku), name: one(i.item_name ?? i.name) },
    quantity: Math.max(1, Number(i.quantity) || 1), price: Number(i.price) || 0,
  }));
  async function onDataLayer(raw) {
    if (!raw || typeof raw !== "object") return;
    const e = raw[0] === "event" ? { event: raw[1], ...(raw[2] || {}) } : raw; // gtag("event", …) pushes `arguments`
    const ec = e.ecommerce || {}, name = String(e.event || "");
    let kind = null, items = [];
    if (/^(add_to_cart|addToCart)$/.test(name)) { kind = "add"; items = dlItems(ec.items ?? e.items ?? ec.add?.products); }
    else if (/^(remove_from_cart|removeFromCart)$/.test(name)) { kind = "remove"; items = dlItems(ec.items ?? e.items ?? ec.remove?.products); }
    else if (name === "purchase" || ec.purchase) { kind = "purchase"; items = dlItems(ec.items ?? e.items ?? ec.purchase?.products); }
    else if (name === "view_item" || ec.detail) { kind = "view"; items = dlItems(ec.items ?? e.items ?? ec.detail?.products); }
    else if (name === "search" || name === "view_search_results") {
      const q = one(e.search_term ?? ec.search_term);
      if (q) api.track("search", { query: q.slice(0, 60), results: 1 });
      return;
    }
    if (kind === "purchase") {
      if (purchaseSeen) return;
      purchaseSeen = true;
      const value = Number(ec.value ?? e.value ?? ec.purchase?.actionField?.revenue) || items.reduce((t, i) => t + i.price * i.quantity, 0);
      api.track("purchase", { value });
      autoCart = []; saveAutoCart();
      return;
    }
    if (!kind || !items.length) return;
    const { ids = [] } = await resolveRefs(items.map((i) => i.ref));
    items.forEach((it, n) => {
      const id = ids[n];
      if (!id) return;
      if (kind === "view") { if (!auto.productId) { auto.productId = id; auto.pageType = "product"; rememberViewed(id); } return; }
      const line = autoCart.find((c) => c.id === id);
      if (kind === "add") {
        if (pendingAdd?.id === id && Date.now() < pendingAdd.until) { pendingAdd = null; return; } // already counted
        if (line) line.quantity += it.quantity; else autoCart.push({ id, quantity: it.quantity });
        api.track("add_to_cart", { productId: id, quantity: it.quantity, source: "user" });
      } else {
        if (line) { line.quantity -= it.quantity; if (line.quantity <= 0) autoCart = autoCart.filter((c) => c !== line); }
        api.track("cart_remove", { productId: id });
      }
    });
    saveAutoCart();
  }
  let dlSeen = 0;
  function pollDataLayer() {
    const dl = window.dataLayer;
    if (!Array.isArray(dl)) return;
    if (dlSeen > dl.length) dlSeen = 0;
    while (dlSeen < dl.length) onDataLayer(dl[dlSeen++]);
  }

  async function autoInit() {
    // a shop's own integration may register its hooks only after its scripts finish loading
    if (document.readyState !== "complete") await new Promise((r) => addEventListener("load", r, { once: true }));
    await new Promise((r) => setTimeout(r, 300));
    if (hostIntegrated()) return;
    await detectPage();
    pollDataLayer();
    // polling, not wrapping push(): Tag Manager replaces push() with its own
    setInterval(() => { if (!hostIntegrated()) pollDataLayer(); }, 500);
    // single-page shops change the address without reloading
    let href = location.href;
    setInterval(() => { if (location.href !== href && !hostIntegrated()) { href = location.href; detectPage(); } }, 1000);
  }

  // ---- putting a product into the shop's own cart by pressing the shop's own button ----
  const ADD_RE = /do ko[sš][ií]ku|koupit|vlo[zž]it do|p[rř]idat do|add to (cart|bag|basket)|buy now/i;
  const labelOf = (b) => [b.getAttribute("aria-label"), b.title, b.value, b.textContent].filter(Boolean).join(" ");
  const shown = (b) => b.getClientRects().length > 0 && !b.disabled && getComputedStyle(b).visibility !== "hidden";
  const area = (b) => { const r = b.getBoundingClientRect(); return r.width * r.height; };
  function findAddButton(item) {
    if (integ.addToCart && auto.productId === item.id) {
      const b = document.querySelector(integ.addToCart);
      if (b && shown(b)) return b;
    }
    const all = [...document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]')].filter((b) => shown(b) && ADD_RE.test(labelOf(b)));
    if (!all.length) return null;
    const name = plainText(item.name);
    const named = all.find((b) => plainText(labelOf(b)).includes(name));
    if (named) return named;
    // the product's own card: the largest block around the button that holds no other add button
    const inCard = all.find((b) => {
      let box = b;
      while (box.parentElement && box.parentElement !== document.body && all.filter((x) => box.parentElement.contains(x)).length === 1) box = box.parentElement;
      return plainText(box.textContent).includes(name) || (item.url && [...box.querySelectorAll("a[href]")].some((a) => urlKey(a.href) === urlKey(item.url)));
    });
    if (inCard) return inCard;
    return auto.productId === item.id ? all.sort((a, b) => area(b) - area(a))[0] : null; // the page's main button
  }
  /** Adds to the shop's cart: through the shop's JS hook, or by pressing its button. False = not possible here. */
  function addToShopCart(item) {
    if (api.onAddToCart || hostIntegrated()) { api.onAddToCart?.(item); return true; }
    const btn = findAddButton(item);
    if (!btn) return false;
    pendingAdd = { id: item.id, until: Date.now() + 4000 };
    btn.click();
    const line = autoCart.find((c) => c.id === item.id);
    if (line) line.quantity += item.quantity || 1; else autoCart.push({ id: item.id, quantity: item.quantity || 1 });
    saveAutoCart();
    return true;
  }
  /** Opens a product: through the shop's JS hook, or by going to its page (the chat comes along). */
  function openProduct(p) {
    if (api.onOpenProduct) { if (phone.matches) closePanel(); api.onOpenProduct(p.id); return; }
    if (!p.url) return;
    if (mode && !phone.matches) ss.set("reopen", mode); // on a computer the chat reopens next to the product
    location.assign(p.url);
  }

  // -------------------------------------------------------------- DOM ----
  // Design: Klára is a living character (a morphing blob with eyes that blink and
  // follow the cursor). Colours, font, corner radius and light/dark mode are read
  // from the host website, so she fits in on any shop without configuration.
  const host = document.createElement("div");
  host.id = "ai-prodavac";
  const root = host.attachShadow({ mode: "open" });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------ adapt to the website ----
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function parseColor(str) {
    if (!str) return null;
    if (str.startsWith("#")) {
      let h = str.slice(1);
      if (h.length === 3) h = [...h].map((x) => x + x).join("");
      const n = parseInt(h.slice(0, 6), 16);
      return Number.isNaN(n) ? null : { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 };
    }
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  }
  function toHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s, l };
  }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, "0");
    return `#${f(0)}${f(8)}${f(4)}`;
  }
  const hex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const luminance = ({ r, g, b }) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  /** Reads the shop's brand colour, font, button roundness and light/dark look. data-* attributes override. */
  function detectTheme() {
    const d = script?.dataset || {};
    const bg = [document.body, document.documentElement].map((e) => parseColor(getComputedStyle(e).backgroundColor)).find((c) => c && c.a > 0.5) || { r: 255, g: 255, b: 255 };
    const font = d.font || getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    // remembered for the visit, so Klára doesn't change colour from page to page
    // (keyed by the site's look, so two different sites never share it)
    const key = "theme:" + hex(bg) + "|" + font.slice(0, 40);
    const cached = !d.color && !d.theme && ss.get(key);
    if (cached) return applyTheme(cached);
    let brand = d.color ? parseColor(d.color) : null, radius = null;
    if (!brand) {
      // the brand colour = the saturated colour used most on buttons, counted by how often it
      // appears (one huge button can't win alone) and weighted up in the header / navigation
      const score = new Map(), radii = new Map();
      for (const e of document.querySelectorAll('button, a, input[type="submit"], [role="button"], [class*="btn"]')) {
        const cs = getComputedStyle(e), c = parseColor(cs.backgroundColor);
        if (!c || c.a < 0.8) continue;
        const { s, l } = toHsl(c);
        if (s < 0.35 || l < 0.18 || l > 0.82) continue;
        const rect = e.getBoundingClientRect(), area = Math.min(rect.width * rect.height, 6000);
        if (area < 150) continue;
        const inHeader = rect.top + scrollY < 160 || e.closest("header, nav, [role=banner]");
        const k = hex(c);
        score.set(k, (score.get(k) || 0) + area * (inHeader ? 3 : 1));
        // the roundest corner – buttons joined to an input are often rounded on one side only
        if (!radii.has(k)) radii.set(k, Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0)));
      }
      const best = [...score].sort((a, b) => b[1] - a[1])[0]?.[0];
      brand = parseColor(best || "#2288e5");
      radius = best ? radii.get(best) : null;
    }
    const mode = d.theme === "dark" || d.theme === "light" ? d.theme : luminance(bg) < 0.45 ? "dark" : "light";

    // two companion colours for gradients: neighbouring hues, stepping towards the "nice" side –
    // warm colours towards red/amber, reds towards pink/violet, cool colours towards violet/magenta
    const { h, s, l } = toHsl(brand);
    const [s2, s3] = h >= 20 && h < 70 ? [-16, -36] : h >= 300 || h < 20 ? [-28, -56] : [38, 80];
    const c1 = hex(brand);
    const c2 = hsl(h + s2, Math.max(s, 0.55), clamp(l + 0.06, 0.45, 0.66));
    const c3 = hsl(h + s3, Math.max(s * 0.95, 0.5), clamp(l + 0.12, 0.52, 0.72));
    const r = radius ?? parseFloat(d.radius ?? 10);
    // on a dark site the panel takes the site's own dark tone (a touch lighter), not a fixed navy
    const b = toHsl(bg);
    const surf = mode === "dark" ? { bg: hsl(b.h, b.s, clamp(b.l + 0.05, 0.07, 0.2)), bg2: hsl(b.h, b.s, clamp(b.l + 0.09, 0.1, 0.24)) } : {};

    const t = { mode, c1, c2, c3, font, r, ...surf };
    if (!d.color && !d.theme) ss.set(key, t);
    return applyTheme(t);
  }
  function applyTheme({ mode, c1, c2, c3, font, r, bg, bg2 }) {
    host.dataset.mode = mode;
    const set = (k, v) => host.style.setProperty(k, v);
    set("--c", c1); set("--c2", c2); set("--c3", c3); set("--font", font);
    if (bg) { set("--bg", bg); set("--bg2", bg2); }
    set("--rp", clamp(r * 2.2 + 6, 14, 28) + "px");  // panel
    set("--rb", clamp(r * 1.6 + 6, 12, 22) + "px");  // bubbles, cards
    set("--rc", clamp(r * 1.4 + 4, 8, 22) + "px");   // chips, buttons
    return { c1, c2, c3 };
  }
  let theme = { c1: "#2288e5", c2: "#7c5cff", c3: "#ff7eb3" };

  const ICON = {
    mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
    keys: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>`,
    cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.8l2.5 11.6a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L21 7.5H6.1"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v10.5H9.5L5 20v-4H4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/></svg>`,
    eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`,
    spark: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z"/></svg>`,
  };

  const mix = (v, pct) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`;
  root.innerHTML = `
  <style>
    :host { all: initial;
      --c: #2288e5; --c2: #7c5cff; --c3: #ff7eb3; --font: system-ui, sans-serif; --rp: 26px; --rb: 20px; --rc: 20px;
      /* dark look (default) */
      --bg: #0d1333; --bg2: #141a42; --strong: #fff; --glass: rgba(255,255,255,.07); --edge: rgba(255,255,255,.12);
      /* text greys are mixed from the panel colour, so they carry the site's own tint */
      --ink: color-mix(in srgb, #fff 92%, var(--bg)); --soft: color-mix(in srgb, #fff 62%, var(--bg)); --bot: color-mix(in srgb, #fff 88%, var(--bg)); --ph: color-mix(in srgb, #fff 45%, var(--bg));
      --aur: .42; --dim: color-mix(in srgb, var(--bg) 60%, transparent); --shadow: 0 30px 80px rgba(8,12,40,.45); --card-shadow: 0 12px 28px rgba(0,0,0,.35);
      --err-bg: rgba(255,92,120,.12); --err-edge: rgba(255,92,120,.35); --err-ink: #ffd3dc; }
    /* light look – used on light websites */
    :host([data-mode="light"]) {
      --bg: #ffffff; --bg2: #ffffff; --ink: #1d2433; --strong: #0f1522; --soft: #5d6678; --glass: #f1f4f9; --edge: rgba(15,21,34,.1);
      --bot: #1d2433; --ph: #8b93a5; --aur: .16; --dim: rgba(15,21,34,.38); --shadow: 0 24px 64px rgba(15,21,34,.2), 0 2px 6px rgba(15,21,34,.06);
      --card-shadow: 0 6px 18px rgba(15,21,34,.12); --err-bg: #fff1f3; --err-edge: #ffc9d2; --err-ink: #9b1c32; }
    * { box-sizing: border-box; font-family: var(--font); }
    button { font: inherit; cursor: pointer; }
    svg { width: 1em; height: 1em; display: block; }
    :focus-visible { outline: 2px solid ${mix("--c", 70)}; outline-offset: 2px; }
    .wrap { position: fixed; right: 22px; bottom: 22px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 14px; pointer-events: none; }
    .wrap > * { pointer-events: auto; } /* the empty part of the corner never blocks taps on the page */

    /* ---------- the mascot: navy tile with a "t" nose, big eyes and a mouth that opens when talking ---------- */
    .av { --s: 40px; position: relative; width: var(--s); height: var(--s); flex: none; display: inline-block; }
    .av > svg { width: 100%; height: 100%; overflow: visible; display: block; }
    .av .eye { transform-box: fill-box; transform-origin: center; animation: blink 5.5s infinite; }
    .av .pupil { transform: translate(var(--lx, 0px), var(--ly, 0px)); transition: transform .18s ease-out; }
    .av .brow { transform-box: fill-box; transition: transform .25s cubic-bezier(.34,1.56,.64,1); }
    .av .open { transform-box: fill-box; transform-origin: 50% 0%; transform: scaleY(0); transition: transform .16s ease-out; }
    .av .lip { transition: opacity .12s; }
    .orbit { position: absolute; inset: -18%; display: none; animation: spin 1.3s linear infinite; pointer-events: none; }
    .orbit b { position: absolute; width: max(4px, calc(var(--s) * .1)); height: max(4px, calc(var(--s) * .1)); border-radius: 50%; background: var(--c2); box-shadow: 0 0 8px var(--c2); }
    .orbit b:nth-child(1) { top: 0; left: 45%; } .orbit b:nth-child(2) { bottom: 8%; left: 4%; opacity: .7; } .orbit b:nth-child(3) { bottom: 8%; right: 4%; opacity: .45; }
    .live { position: absolute; right: -7%; bottom: -3%; width: 17%; height: 17%; min-width: 9px; min-height: 9px; border-radius: 50%; background: #3ddc84; border: 2px solid #fff; animation: livep 2s infinite; }
    /* thinking: eyebrows up, looking up, dots circling */
    .av.think .brow, .av.listen .brow { transform: translateY(-3px); }
    .av.think .pupil { transform: translate(1.5px, -3.2px); }
    .av.think .orbit { display: block; }
    /* talking: the mouth opens and closes, tongue and all */
    .av.talk .lip { opacity: 0; }
    .av.talk .open { animation: chew .2s ease-in-out infinite alternate; }
    /* speaking out loud: the mouth opens as wide as the voice is loud (neural voice) … */
    .av.amp .lip { opacity: 0; }
    .av.amp .open { transform: scaleY(var(--mouth, 0)); transition: none; }
    /* … or on every spoken word (browser voice) */
    .av.say .lip { opacity: 0; }
    .av.say .open { animation: word .26s ease-out; }
    /* happy: a little hop – the mouth stays closed, it only opens when she speaks */
    .av.happy { animation: hop .5s ease; }
    .av.listen::before, .av.listen::after { content: ""; position: absolute; inset: 4%; border-radius: 30%; border: 2px solid var(--c); animation: ripple 1.5s ease-out infinite; }
    .av.listen::after { animation-delay: .75s; }

    /* ---------- launcher ---------- */
    .launch { position: relative; display: flex; align-items: center; gap: 12px; border: none; background: none; padding: 0; animation: dropin .6s cubic-bezier(.34,1.56,.64,1) both; }
    .launch .av { animation: bob 3.2s ease-in-out infinite; }
    .launch-label { order: -1; padding: 11px 18px; border-radius: 999px; font-size: 14.5px; font-weight: 650; color: var(--ink);
      background: linear-gradient(var(--bg2), var(--bg2)) padding-box, linear-gradient(90deg, var(--c), var(--c2), var(--c3)) border-box; border: 1.5px solid transparent;
      box-shadow: var(--card-shadow); transition: transform .2s, box-shadow .2s; }
    .launch:hover .launch-label { transform: translateX(-4px); box-shadow: 0 12px 30px ${mix("--c2", 35)}; }
    .launch:hover .av { animation-play-state: paused; transform: scale(1.08) rotate(-4deg); transition: transform .2s; }

    /* ---------- shared surface with a soft aurora in the brand colours ---------- */
    .glass { position: relative; color: var(--ink); background: var(--bg); border: 1px solid var(--edge); border-radius: var(--rp); overflow: hidden;
      box-shadow: var(--shadow); isolation: isolate; }
    .aurora { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
    .aurora span { position: absolute; width: 300px; height: 300px; border-radius: 50%; filter: blur(60px); opacity: var(--aur); }
    .aurora span:nth-child(1) { background: var(--c); left: -100px; top: -120px; animation: drift1 17s ease-in-out infinite alternate; }
    .aurora span:nth-child(2) { background: var(--c2); right: -120px; top: 30%; animation: drift2 21s ease-in-out infinite alternate; }
    .aurora span:nth-child(3) { background: var(--c3); left: 20%; bottom: -160px; opacity: calc(var(--aur) * .7); animation: drift3 25s ease-in-out infinite alternate; }
    .gbtn { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--edge); background: var(--glass); color: var(--ink); display: grid; place-items: center; font-size: 17px; transition: background .2s, transform .2s; }
    .gbtn:hover { background: ${mix("--c", 14)}; transform: rotate(8deg) scale(1.06); }

    /* ---------- arrival: the mascot hops over to you and asks ---------- */
    .arrive { position: fixed; inset: 0; z-index: 2147483001; }
    .scrim { position: absolute; inset: 0; background: var(--dim); backdrop-filter: blur(3px); animation: fade .4s ease-out both; }
    .arrive.out .scrim { animation: fade .35s ease-in reverse both; }
    .greeter { position: absolute; left: 50%; bottom: max(28px, 9vh); transform: translateX(-50%); width: min(430px, calc(100vw - 32px));
      display: flex; flex-direction: column; align-items: center; gap: 18px; }
    .hop { position: relative; transform-origin: 50% 100%; will-change: transform; }
    .ground { position: absolute; left: 50%; bottom: -8px; width: 84px; height: 12px; margin-left: -42px; border-radius: 50%;
      background: radial-gradient(closest-side, rgba(0,0,0,.28), transparent); opacity: 0; transition: opacity .3s; }
    .landed .ground { opacity: 1; }
    .bubble { position: relative; width: 100%; padding: 20px 20px 16px; border-radius: 22px; background: var(--bg2); color: var(--strong);
      border: 1px solid var(--edge); box-shadow: 0 30px 70px -20px rgba(10,14,30,.4), 0 2px 8px rgba(10,14,30,.06);
      transform-origin: 50% calc(100% + 18px); opacity: 0; transform: scale(.4) translateY(30px); pointer-events: none; }
    .bubble::after { content: ""; position: absolute; left: 50%; bottom: -8px; width: 16px; height: 16px; margin-left: -8px; background: inherit;
      border: solid var(--edge); border-width: 0 1px 1px 0; transform: rotate(45deg); border-radius: 0 0 4px 0; }
    .landed .bubble { opacity: 1; transform: none; pointer-events: auto; transition: transform .5s cubic-bezier(.3,1.6,.5,1), opacity .2s; }
    .arrive.out .bubble { opacity: 0; transform: scale(.6) translateY(30px); transition: transform .22s ease-in, opacity .18s; }
    .bubble .x { position: absolute; top: 10px; right: 10px; width: 30px; height: 30px; border: 0; border-radius: 50%; background: none; color: var(--soft);
      display: grid; place-items: center; font-size: 15px; transition: background .15s, color .15s; }
    .bubble .x:hover { background: var(--glass); color: var(--strong); }
    .g-name { font-size: 13px; font-weight: 700; color: var(--c); letter-spacing: .02em; margin: 0 0 6px; }
    .g-text { font-size: 16.5px; line-height: 1.5; margin: 0 24px 16px 0; min-height: 50px; color: var(--strong); }
    .caret::after { content: ""; display: inline-block; width: 2px; height: 1.1em; margin-left: 2px; vertical-align: -3px; background: var(--c); animation: caret .8s steps(1) infinite; }
    .g-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .g-btn { display: flex; align-items: center; justify-content: center; gap: 8px; height: 46px; border-radius: 13px; border: 0; font-size: 15px; font-weight: 600;
      background: var(--glass); color: var(--strong); transition: transform .15s, filter .15s, background .15s; }
    .g-btn svg { font-size: 18px; }
    .g-btn:hover { background: ${mix("--c", 12)}; } .g-btn:active { transform: scale(.97); }
    .g-btn.pri { background: var(--c); color: #fff; } .g-btn.pri:hover { filter: brightness(1.08); }
    .g-skip { grid-column: 1 / -1; justify-self: center; border: 0; background: none; padding: 8px 10px 2px; color: var(--soft); font-size: 14px; transition: color .15s; }
    .g-skip:hover { color: var(--strong); }
    .landed .g-acts > * { animation: rise .35s cubic-bezier(.2,.8,.2,1) both; }
    .landed .g-acts > :nth-child(2) { animation-delay: .05s; } .landed .g-acts > :nth-child(3) { animation-delay: .1s; }

    /* ---------- floating cards: tips and short replies ---------- */
    .tip { width: 400px; padding: 18px; animation: swoop .45s cubic-bezier(.34,1.45,.64,1) both; }
    .tip .x { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; font-size: 15px; }
    .who { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .who b { display: block; font-size: 16px; color: var(--strong); } .who span { font-size: 12.5px; color: var(--soft); }
    .tip p { margin: 0 0 14px; font-size: 15.5px; line-height: 1.55; color: var(--strong); min-height: 48px; }
    .tip .prod { display: flex; gap: 12px; align-items: center; background: #fff; color: #151a3a; border: 1px solid var(--edge); border-radius: var(--rb); padding: 9px; margin-bottom: 14px; animation: rise .4s .15s both; }
    .tip .prod img { width: 54px; height: 54px; }
    .tip .prod b { font-size: 13.5px; display: block; } .tip .prod span { font-size: 14px; font-weight: 800; }
    .timer { position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; background: linear-gradient(90deg, var(--c), var(--c2), var(--c3)); transform-origin: left; animation: shrink var(--t, 20s) linear forwards; }
    .tip:hover .timer { animation-play-state: paused; opacity: .35; }
    /* a short spoken-style line next to the mascot */
    .quip { position: relative; max-width: 290px; margin-right: 6px; padding: 12px 16px; border-radius: 16px; background: var(--bg2); color: var(--strong);
      border: 1px solid var(--edge); box-shadow: 0 14px 34px -10px rgba(10,14,30,.3); font-size: 15px; line-height: 1.45;
      transform-origin: calc(100% - 26px) 100%; animation: quipIn .38s cubic-bezier(.3,1.5,.5,1) both; }
    .quip::after { content: ""; position: absolute; right: 22px; bottom: -7px; width: 13px; height: 13px; background: inherit;
      border: solid var(--edge); border-width: 0 1px 1px 0; transform: rotate(45deg); border-radius: 0 0 3px 0; }
    .leaving { animation: leave .28s ease-in forwards !important; }
    @keyframes quipIn { from { opacity: 0; transform: translateY(10px) scale(.7); } }
    @keyframes leave { to { opacity: 0; transform: translateY(8px) scale(.96); } }

    /* ---------- chips ---------- */
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { padding: 8px 14px; border-radius: var(--rc); font-size: 14px; font-weight: 600; color: var(--ink);
      background: linear-gradient(var(--bg2), var(--bg2)) padding-box, linear-gradient(90deg, var(--c), var(--c2), var(--c3)) border-box; border: 1.5px solid transparent;
      transition: transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s; animation: rise .35s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--i, 0) * .05s); }
    .chip:hover { transform: translateY(-2px); box-shadow: 0 8px 20px ${mix("--c2", 30)}; }
    .chip.solid { color: #fff; border: none; padding: 9.5px 17px; background: linear-gradient(120deg, var(--c), var(--c2)); box-shadow: 0 6px 16px ${mix("--c", 30)}; }
    .chip.ghost { background: var(--glass); border: 1px solid var(--edge); color: var(--soft); font-weight: 500; }

    /* ---------- chat panel ---------- */
    .panel { width: 430px; height: min(680px, calc(100vh - 44px)); display: flex; flex-direction: column; transform-origin: bottom right; animation: unfold .4s cubic-bezier(.34,1.3,.64,1) both; }
    .head { display: flex; align-items: center; gap: 12px; padding: 16px 16px 12px; border-bottom: 1px solid var(--edge); }
    .head .title { flex: 1; min-width: 0; }
    .head .title b { display: block; font-size: 16.5px; letter-spacing: -.2px; color: var(--strong); }
    .status { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--soft); min-height: 17px; }
    .status i { width: 7px; height: 7px; border-radius: 50%; background: #3ddc84; box-shadow: 0 0 8px #3ddc84; flex: none; }
    .status:not(.busy) i { display: none; }
    .status.busy i { background: var(--c2); box-shadow: 0 0 8px var(--c2); animation: blinkdot .8s infinite; }
    .msgs { flex: 1; overflow-y: auto; padding: 14px 18px 16px; display: flex; flex-direction: column; gap: 12px; scrollbar-width: thin; scrollbar-color: ${mix("--soft", 35)} transparent; }

    /* messages – laid out for quick reading */
    .m { max-width: 90%; font-size: 15px; line-height: 1.6; word-wrap: break-word; }
    .m p { margin: 0 0 10px; } .m p:last-child { margin: 0; }
    .m b { color: var(--strong); font-weight: 700; }
    .m .kc { font-weight: 750; color: var(--strong); white-space: nowrap; }
    .m ul { list-style: none; padding: 0; margin: 8px 0 10px; display: grid; gap: 7px; }
    .m ul:last-child { margin-bottom: 0; }
    .m li { position: relative; padding: 8px 11px 8px 27px; border-radius: calc(var(--rb) * .6); background: ${mix("--c", 7)}; }
    .m li::before { content: ""; position: absolute; left: 11px; top: 16px; width: 7px; height: 7px; border-radius: 50%; background: linear-gradient(135deg, var(--c), var(--c2)); }
    .m p.ask { margin-top: 12px; padding: 9px 12px; border-left: 3px solid var(--c); border-radius: 4px calc(var(--rb) * .5) calc(var(--rb) * .5) 4px; background: ${mix("--c", 8)}; color: var(--strong); font-weight: 550; }
    .m.bot { align-self: flex-start; padding: 12px 15px; border-radius: var(--rb) var(--rb) var(--rb) 6px; background: var(--glass); border: 1px solid var(--edge); color: var(--bot);
      animation: materialize .35s cubic-bezier(.2,.8,.2,1) both; }
    .m.me { align-self: flex-end; padding: 10px 15px; border-radius: var(--rb) var(--rb) 6px var(--rb); color: #fff; background: linear-gradient(120deg, var(--c), var(--c2)); box-shadow: 0 8px 22px ${mix("--c2", 28)};
      animation: popin .35s cubic-bezier(.34,1.56,.64,1) both; transform-origin: bottom right; }
    .m.err { align-self: stretch; max-width: none; padding: 10px 13px; border-radius: calc(var(--rb) * .7); font-size: 13.5px; background: var(--err-bg); border: 1px solid var(--err-edge); color: var(--err-ink); }
    .m.streaming > :last-child::after { content: ""; display: inline-block; width: 7px; height: 15px; margin-left: 3px; vertical-align: -2px; border-radius: 2px;
      background: linear-gradient(var(--c), var(--c3)); animation: caret .7s steps(1) infinite; }
    .thinking { display: flex; align-items: center; gap: 10px; align-self: flex-start; padding: 4px 2px; animation: materialize .3s both; }
    .shimmer { font-size: 14px; font-weight: 600; background: linear-gradient(90deg, var(--soft) 20%, var(--strong) 45%, var(--c2) 55%, var(--soft) 80%); background-size: 250% 100%;
      -webkit-background-clip: text; background-clip: text; color: transparent; animation: shimmer 1.4s linear infinite; }
    .note { align-self: center; display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink); background: var(--glass); border: 1px solid var(--edge);
      padding: 6px 12px; border-radius: 999px; animation: materialize .35s both; }
    .note svg { color: var(--c2); }
    .legal { margin: -8px 14px 12px; text-align: center; font-size: 11.5px; color: var(--soft); }
    .legal a { color: inherit; text-decoration: underline; }
    .msgs > .chips { align-self: flex-start; }

    /* product cards: white so the products stand out */
    .cards { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 10px; align-self: stretch; flex: none; scrollbar-width: none; }
    .cards::-webkit-scrollbar { display: none; }
    .pc { position: relative; flex: 0 0 172px; background: #fff; color: #151a3a; border: 1px solid var(--edge); border-radius: var(--rb); overflow: hidden; display: flex; flex-direction: column;
      box-shadow: var(--card-shadow); transform-style: preserve-3d; transition: transform .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s;
      animation: cardin .45s cubic-bezier(.34,1.3,.64,1) both; animation-delay: calc(var(--i, 0) * .07s); }
    .pc::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .3s;
      background: radial-gradient(circle at var(--mx, 50%) var(--my, 30%), rgba(255,255,255,.75), transparent 45%); mix-blend-mode: soft-light; }
    .pc:hover { box-shadow: 0 16px 36px rgba(15,21,34,.28); }
    .pc:hover::after { opacity: 1; }
    .pc .img { height: 112px; display: grid; place-items: center; position: relative; cursor: pointer; background: radial-gradient(circle at 50% 60%, ${mix("--c", 10)}, #fff 70%); }
    .pc .img img { height: 100px; transition: transform .35s cubic-bezier(.34,1.56,.64,1); }
    .pc:hover .img img { transform: scale(1.08) translateZ(20px); }
    .badge { position: absolute; top: 8px; left: 8px; background: #e0282e; color: #fff; font-size: 11px; font-weight: 800; padding: 3px 7px; border-radius: 6px; }
    .pc .body { padding: 10px 11px 11px; display: flex; flex-direction: column; gap: 3px; flex: 1; }
    .pc .name { font-size: 13px; font-weight: 700; line-height: 1.3; cursor: pointer; }
    .pc .name:hover { color: var(--c); }
    .pc .hl { font-size: 11.5px; color: #6b7090; }
    .pc .price { font-size: 16px; font-weight: 850; margin-top: 2px; }
    .pc .old { font-size: 11.5px; color: #9aa0b8; text-decoration: line-through; font-weight: 500; margin-left: 5px; }
    .add { margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; font-weight: 700; padding: 9px 6px; border-radius: var(--rc); border: none; color: #fff;
      background: linear-gradient(120deg, var(--c), var(--c2)); transition: transform .2s, filter .2s; }
    .add:hover { transform: translateY(-1px); filter: brightness(1.08); }
    .add:disabled { background: #22b573; }
    .add.done { animation: popin .4s cubic-bezier(.34,1.56,.64,1); }

    /* input: capsule with a slowly rotating gradient edge */
    .input { position: relative; margin: 4px 14px 14px; border-radius: 999px; padding: 1.5px; overflow: hidden; }
    .input::before { content: ""; position: absolute; left: 50%; top: 50%; width: 700px; height: 700px; margin: -350px 0 0 -350px;
      background: conic-gradient(var(--c), var(--c2), var(--c3), var(--c)); animation: spin 5s linear infinite; opacity: .4; transition: opacity .3s; }
    .input:focus-within::before { opacity: 1; }
    .field { position: relative; display: flex; align-items: flex-end; gap: 8px; padding: 6px 6px 6px 18px; border-radius: 999px; background: var(--bg2); }
    .field textarea { flex: 1; resize: none; border: none; background: none; color: var(--strong); font-size: 15px; line-height: 20px; padding: 9px 0; height: 38px; max-height: 110px; outline: none; }
    .field textarea::placeholder { color: var(--ph); }
    .send { width: 38px; height: 38px; border-radius: 50%; border: none; color: #fff; display: grid; place-items: center; font-size: 18px; flex: none;
      background: linear-gradient(135deg, var(--c), var(--c2)); box-shadow: 0 6px 16px ${mix("--c2", 40)}; transition: transform .2s cubic-bezier(.34,1.56,.64,1); }
    .send:hover { transform: scale(1.1) rotate(-8deg); }
    .send:disabled { opacity: .45; cursor: default; transform: none; }
    .send.fly svg { animation: launch .5s cubic-bezier(.5,0,.3,1); }

    /* voice stage */
    .stage { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 16px 18px; border-top: 1px solid var(--edge); }
    .stage .av { cursor: pointer; margin: 10px 0 4px; }
    .stage .vstat { font-size: 14.5px; font-weight: 600; color: var(--strong); min-height: 20px; }
    .stage .interim { font-size: 15px; color: var(--soft); font-style: italic; min-height: 20px; text-align: center; max-width: 90%; }
    .toChat { background: none; border: none; color: var(--soft); font-size: 13px; display: flex; align-items: center; gap: 6px; }
    .toChat:hover { color: var(--strong); }

    /* flying product + sparkles when something goes into the cart */
    .fly-img { position: fixed; z-index: 2147483002; pointer-events: none; border-radius: 14px; background: #fff; box-shadow: 0 12px 30px rgba(0,0,0,.35); }
    .spark { position: fixed; z-index: 2147483002; pointer-events: none; width: 9px; height: 9px; border-radius: 50%; }

    /* ---------- keyframes ---------- */
    @keyframes morph { 0%,100% { border-radius: 42% 58% 60% 40% / 45% 45% 55% 55%; } 33% { border-radius: 58% 42% 45% 55% / 55% 40% 60% 45%; } 66% { border-radius: 48% 52% 38% 62% / 42% 58% 42% 58%; } }
    @keyframes hue { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
    @keyframes breathe { 50% { transform: scale(1.12); opacity: .75; } }
    @keyframes blink { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.1); } }
    @keyframes chew { from { transform: scaleY(.18); } to { transform: scaleY(1); } }
    @keyframes word { 0% { transform: scaleY(.2); } 40% { transform: scaleY(1); } 100% { transform: scaleY(.15); } }
    @keyframes throb { to { transform: scale(1.05); } }
    @keyframes hop { 40% { transform: translateY(-20%) scale(1.08) rotate(-6deg); } 70% { transform: translateY(0) scale(.97); } }
    @keyframes ripple { from { transform: scale(1); opacity: .9; } to { transform: scale(1.9); opacity: 0; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes livep { 0% { box-shadow: 0 0 0 0 #3ddc8488; } 70%, 100% { box-shadow: 0 0 0 7px #3ddc8400; } }
    @keyframes bob { 50% { transform: translateY(-5px); } }
    @keyframes dropin { from { opacity: 0; transform: translateY(40px) scale(.6); } }
    @keyframes drop { 0% { opacity: 0; transform: translateY(-60px) scale(.4); } 60% { opacity: 1; } }
    @keyframes fade { from { opacity: 0; } }
    @keyframes unfold { from { opacity: 0; transform: translateY(24px) scale(.88); filter: blur(8px); } }
    @keyframes swoop { from { opacity: 0; transform: translate(40px, 30px) scale(.88) rotate(3deg); filter: blur(6px); } }
    @keyframes rise { from { opacity: 0; transform: translateY(12px); } }
    @keyframes materialize { from { opacity: 0; transform: translateY(10px); filter: blur(8px); } }
    @keyframes popin { from { opacity: 0; transform: scale(.6); } }
    @keyframes cardin { from { opacity: 0; transform: translateY(26px) rotateX(-25deg) scale(.9); } }
    @keyframes shimmer { from { background-position: 100% 0; } to { background-position: -150% 0; } }
    @keyframes caret { 50% { opacity: 0; } }
    @keyframes blinkdot { 50% { opacity: .3; } }
    @keyframes sheen { 0%, 60% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
    @keyframes shrink { to { transform: scaleX(0); } }
    @keyframes launch { 45% { transform: translateY(-26px); opacity: 0; } 46% { transform: translateY(20px); opacity: 0; } 100% { transform: none; opacity: 1; } }
    @keyframes drift1 { to { transform: translate(120px, 160px) scale(1.2); } }
    @keyframes drift2 { to { transform: translate(-140px, 120px) scale(.85); } }
    @keyframes drift3 { to { transform: translate(90px, -160px) scale(1.15); } }

    @media (max-width: 640px) {
      .g-text { font-size: 16px; }
    }
    /* phones: the chat takes the whole screen like a messaging app */
    @media (max-width: 480px) {
      .wrap { right: calc(12px + env(safe-area-inset-right)); bottom: calc(12px + env(safe-area-inset-bottom)); left: 12px; }
      .panel { position: fixed; inset: 0; width: 100%; height: 100vh; height: 100dvh; border-radius: 0; border: 0; box-shadow: none; transform-origin: bottom center;
        animation: sheet .38s cubic-bezier(.2,.9,.3,1) both; }
      .head { padding: calc(10px + env(safe-area-inset-top)) 12px 10px 14px; }
      .msgs { padding: 14px 14px 12px; overscroll-behavior: contain; }
      .m { max-width: 92%; }
      .cards { margin: 0 -14px; padding: 4px 14px 10px; scroll-snap-type: x mandatory; scroll-padding: 14px; }
      .pc { flex-basis: 158px; scroll-snap-align: start; }
      .input { margin: 4px 10px calc(10px + env(safe-area-inset-bottom)); }
      .field textarea { font-size: 16px; } /* under 16px iOS zooms the page in when typing */
      .stage { padding-bottom: calc(14px + env(safe-area-inset-bottom)); }
      .tip { width: 100%; }
      .quip { max-width: min(290px, 100%); }
      .launch-label { display: none; }
      .chip, .gbtn, .send { -webkit-tap-highlight-color: transparent; }
    }
    @keyframes sheet { from { transform: translateY(40px); opacity: 0; } }
    /* touch screens: no hover-only effects that stick after a tap */
    @media (hover: none) {
      .pc:hover { box-shadow: var(--card-shadow); } .pc:hover::after { opacity: 0; } .pc:hover .img img { transform: none; }
      .send:hover, .gbtn:hover { transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
  </style>
  <div class="wrap"></div>`;
  const wrap = root.querySelector(".wrap");
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmtPrice = (n) => n.toLocaleString("cs-CZ") + " Kč";
  const img = (src) => (src?.startsWith("/") ? cfg.api + src : src);
  const aurora = `<div class="aurora" aria-hidden="true"><span></span><span></span><span></span></div>`;

  // ---------------------------------------------------------- the mascot ----
  // The agent is made from the website's own logo, automatically:
  //  • a square/round logo picture (img or svg) → that logo itself gets eyes, eyebrows and a mouth
  //  • a logo with a coloured mark (e.g. a navy square with "t") → a glossy tile in that colour with that letter
  //  • a text-only logo → a tile in the brand colour with the brand's first letter
  // Overrides: data-avatar-color, data-letter, data-avatar-image, data-brand.
  let avatarSeq = 0;
  let AV = null;

  function dominantColor(imgEl) {
    try {
      const c = document.createElement("canvas"); c.width = c.height = 24;
      const g = c.getContext("2d");
      g.drawImage(imgEl, 0, 0, 24, 24);
      const d = g.getImageData(0, 0, 24, 24).data; // throws for cross-origin images – then we use the brand colour
      const counts = new Map();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        const k = [d[i], d[i + 1], d[i + 2]].map((v) => Math.round(v / 32) * 32);
        const { s, l } = toHsl({ r: k[0], g: k[1], b: k[2] });
        if (l > 0.9 || (s < 0.12 && l > 0.7)) continue; // skip white / light-grey background
        const key = k.join(",");
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!best) return null;
      const [r, g2, b] = best.split(",").map(Number);
      return hex({ r, g: g2, b });
    } catch { return null; }
  }

  function detectPersona() {
    const d = script?.dataset || {};
    const meta = (n) => document.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.content?.trim();
    const logo = document.querySelector('[class*="logo" i], [id*="logo" i], a[rel="home"], header a[href="/"], header a[href="#/"], header a[href="./"]');
    const pic = logo?.matches("img, svg") ? logo : logo?.querySelector("img, svg");
    const titleBrand = document.title.split(/\s[–—|\-·:]\s/)[0].trim();
    const brand = (d.brand || meta("og:site_name") || meta("application-name") || (titleBrand && titleBrand.length <= 30 ? titleBrand : "")
      || pic?.getAttribute("alt")?.replace(/\s*logo\s*/i, "") || location.hostname.replace(/^www\./, "").split(".")[0] || "Obchod").trim().slice(0, 40);

    // a square-ish logo picture → the agent is that logo
    let image = d.avatarImage || null;
    if (!image && pic && !d.avatarColor && !d.letter) {
      const r = pic.getBoundingClientRect(), ratio = r.width / Math.max(1, r.height);
      if (r.width >= 16 && ratio > 0.7 && ratio < 1.45) {
        if (pic.tagName.toLowerCase() === "svg") {
          const clone = pic.cloneNode(true);
          clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
          image = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(clone.outerHTML);
        } else image = pic.currentSrc || pic.src;
      }
    }
    // otherwise: a tile in the logo's colour with its letter
    let color = d.avatarColor ? parseColor(d.avatarColor) : null, letter = d.letter || "";
    const mark = logo && [logo, ...logo.querySelectorAll("*")].find((e) => {
      const c = parseColor(getComputedStyle(e).backgroundColor);
      return c && c.a > 0.8 && toHsl(c).l < 0.85;
    });
    if (!color && mark) color = parseColor(getComputedStyle(mark).backgroundColor);
    if (!letter && mark) { const t = mark.textContent.trim(); if (t.length && t.length <= 2) letter = t[0]; }
    if (!color && pic?.tagName.toLowerCase() === "img") color = parseColor(dominantColor(pic));
    if (!color) { const b = toHsl(parseColor(theme.c1)); color = parseColor(hsl(b.h, b.s, clamp(b.l - 0.12, 0.15, 0.4))); }
    letter = (letter || brand.replace(/[^\p{L}\p{N}]/gu, "")[0] || "A");

    const { h, s, l } = toHsl(color);
    const dark = l < 0.55; // light tiles get dark eyebrows/letter, dark tiles white ones
    return {
      brand, image, letter,
      hi: hsl(h, s, clamp(l + 0.19, 0, 0.7)), mid: hsl(h, s, clamp(l + 0.05, 0, 0.8)), base: hex(color), lo: hsl(h, s, clamp(l - 0.07, 0.04, 1)),
      ink: dark || image ? hsl(h, s, clamp(Math.min(l, 0.3) - 0.08, 0.03, 0.2)) : "#1b1f3b",
      glyph: dark ? "#fff" : "#1b1f3b",
    };
  }

  const TEE = "M42.6 29.6 L52.2 24.9 L52.2 42 L57.4 42 Q58.6 42 58.6 43.2 L58.6 48.3 Q58.6 49.5 57.4 49.5 L52.2 49.5 L52.2 57.4 Q52.2 60.4 55.2 60.4 L57.6 60.4 Q58.8 60.4 58.8 61.6 L58.8 66 Q58.8 67.1 57.6 67.3 Q55 67.7 52.6 67.7 Q42.6 67.7 42.6 57.8 L42.6 49.5 L37.6 49.5 Q36.4 49.5 36.4 48.3 L36.4 43.2 Q36.4 42 37.6 42 L42.6 42 Z";
  const MOUTH = "M31 70.5 Q47 74 63.6 70.4 Q62.4 87.6 46.4 87.6 Q33.2 87.2 31 70.5 Z";
  const avatar = (size, { live = false, mood = "" } = {}, blink = (Math.random() * 4).toFixed(2)) => {
    AV ??= detectPersona();
    const n = ++avatarSeq, pic = !!AV.image;
    // on a logo picture the face sits a bit more to the centre and gets a light halo so it reads on any artwork
    const [ex1, ex2, ey, er] = pic ? [33, 67, 42, 10.8] : [20, 80, 50, 12.6];
    const halo = (d, w) => pic ? `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="${w + 2.4}" stroke-linecap="round"/>` : "";
    const eye = (side, cx, cy, px) => `
        <g class="eye ${side}" style="animation-delay:${blink}s">
          <circle cx="${cx}" cy="${cy}" r="${er}" fill="#fff" stroke="${AV.ink}" stroke-width="1.4"/>
          <g class="pupil">
            <circle cx="${px}" cy="${cy}" r="${er * 0.7}" fill="url(#avp${n})"/>
            <circle cx="${px + er * 0.31}" cy="${cy + er * 0.17}" r="${er * 0.2}" fill="#fff"/>
            <circle cx="${px - er * 0.24}" cy="${cy - er * 0.27}" r="${er * 0.1}" fill="#fff" opacity=".9"/>
          </g>
        </g>`;
    const browL = pic ? "M24 30 Q30 23 38 25.5" : "M13.3 27.6 Q20 17 28.4 20.5";
    const browR = pic ? "M62 25.5 Q70 23 76 30" : "M70 22 Q79 16 86.5 25.5";
    const body = pic
      ? `<image href="${esc(AV.image)}" x="3" y="3" width="94" height="94" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="4" y="4" width="92" height="92" rx="25" fill="url(#avg${n})"/>
          <rect x="4.6" y="4.6" width="90.8" height="90.8" rx="24.4" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.2"/>
          <path d="M11.5 27 Q12.5 11.5 28 9.6" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.6" stroke-linecap="round"/>
          ${AV.letter === "t" ? `<path d="${TEE}" fill="${AV.glyph}"/>` : `<text x="48" y="66" text-anchor="middle" style="font: 900 42px 'Arial Black', Arial, sans-serif" fill="${AV.glyph}">${esc(AV.letter)}</text>`}`;
    const lipD = "M33.5 72.5 Q47 81 61.5 72";
    return `
    <span class="av ${mood}" style="--s:${size}px" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="avg${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${AV.hi}"/><stop offset=".38" stop-color="${AV.mid}"/><stop offset=".72" stop-color="${AV.base}"/><stop offset="1" stop-color="${AV.lo}"/></linearGradient>
          <radialGradient id="avp${n}" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#2a3a8c"/><stop offset=".55" stop-color="#101850"/><stop offset="1" stop-color="#070a22"/></radialGradient>
          <clipPath id="avm${n}"><path d="${MOUTH}"/></clipPath>
        </defs>
        <ellipse cx="52" cy="102" rx="38" ry="3.6" fill="rgba(15,24,73,.16)"/>
        <g transform="rotate(-4.5 50 50)">
          ${body}
          <g class="brow">${halo(browL, 3.8)}<path d="${browL}" fill="none" stroke="${AV.ink}" stroke-width="3.8" stroke-linecap="round"/></g>
          <g class="brow">${halo(browR, 3.8)}<path d="${browR}" fill="none" stroke="${AV.ink}" stroke-width="3.8" stroke-linecap="round"/></g>
          ${eye("l", ex1, ey + (pic ? 0 : 0.4), ex1 + 3)}
          ${eye("r", ex2, ey - (pic ? 0 : 0.7), ex2 - 3)}
          <g ${pic ? 'transform="translate(3 -1)"' : ""}>
            <g class="lip">${halo(lipD, 3.2)}<path d="${lipD}" fill="none" stroke="${AV.ink}" stroke-width="3.2" stroke-linecap="round"/></g>
            <g class="open">
              ${pic ? `<path d="${MOUTH}" fill="none" stroke="#fff" stroke-width="2.4"/>` : ""}
              <path d="${MOUTH}" fill="#140922"/>
              <g clip-path="url(#avm${n})">
                <ellipse cx="48.5" cy="86" rx="12.5" ry="6.4" fill="#f56177"/>
                <ellipse cx="53.5" cy="82.3" rx="2.6" ry="1.3" fill="#fdabb6"/>
              </g>
            </g>
          </g>
        </g>
      </svg>
      <span class="orbit"><b></b><b></b><b></b></span>
      ${live ? `<span class="live"></span>` : ""}
    </span>`;
  };

  // the agent's name belongs to the shop (set by the server per client), so every visitor meets the same one.
  // The cached name only makes the start instant – it is re-checked on every page load.
  let ttsServer = false; // true when the server has a natural neural voice (ElevenLabs)
  async function loadName() {
    AV ??= detectPersona();
    fetch(cfg.api + "/api/health").then((r) => r.json()).then((h) => { ttsServer = h.tts === "elevenlabs"; }).catch(() => {});
    const key = "agent-name:" + cfg.client;
    const cached = script.dataset.name || ls.get(key);
    if (cached) cfg.name = cached;
    const fresh = post("/api/persona", { brand: AV.brand })
      .then((r) => {
        integ = r?.integration || {};
        if (r?.name && !script.dataset.name) { ls.set(key, r.name); cfg.name = r.name; }
      })
      .catch(() => {});
    if (!cached) await fresh;
    return cfg.name;
  }
  let nameReady = Promise.resolve();
  const setAv = (av, mood) => {
    if (!av) return;
    av.classList.remove("think", "talk", "listen", "happy", "say");
    if (mood && mood !== "idle") av.classList.add(mood);
  };

  // eyes follow the cursor – a tiny thing that makes her feel present
  let eyeRaf = 0, mx = innerWidth / 2, my = innerHeight / 2;
  addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; if (!eyeRaf) eyeRaf = requestAnimationFrame(updateEyes); }, { passive: true });
  function updateEyes() {
    eyeRaf = 0;
    for (const av of root.querySelectorAll(".av")) {
      const r = av.getBoundingClientRect();
      if (!r.width) continue;
      const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 280) * 3.2; // in the drawing's own units
      av.style.setProperty("--lx", ((dx / d) * k).toFixed(2) + "px");
      av.style.setProperty("--ly", ((dy / d) * k).toFixed(2) + "px");
    }
  }

  // safe markdown shaped for quick reading: **bold**, lists as cards, prices highlighted,
  // and a closing question set apart so it's clear what Klára is asking
  function md(text) {
    const blocks = esc(text.trim())
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(?<!\d)(\d+(?:[\s ]\d{3})*(?:,\d+)?[\s ]?(?:Kč|,-))/g, '<span class="kc">$1</span>')
      .split(/\n{2,}/);
    return blocks.map((b, i) => {
      const lines = b.split("\n");
      if (lines.every((l) => /^\s*[-•*] /.test(l))) return "<ul>" + lines.map((l) => `<li>${l.replace(/^\s*[-•*] /, "")}</li>`).join("") + "</ul>";
      const isAsk = i === blocks.length - 1 && blocks.length > 1 && /\?\s*(\S{0,3})$/.test(b);
      return `<p${isAsk ? ' class="ask"' : ""}>${lines.join("<br>")}</p>`;
    }).join("");
  }

  // types text out letter by letter – quickly (instant when the user prefers less motion)
  async function typeInto(node, text, speed = 8) {
    if (reduced) { node.textContent = text; return; }
    node.textContent = "";
    node.classList.add("caret");
    const chars = [...text];
    for (let i = 0; i < chars.length; i += 2) { // two characters per frame keeps it snappy
      if (!node.isConnected) return;
      node.textContent += chars[i] + (chars[i + 1] ?? "");
      await new Promise((r) => setTimeout(r, /[.!?]/.test(chars[i] + (chars[i + 1] ?? "")) ? speed * 5 : speed));
    }
    node.classList.remove("caret");
  }

  // ---------------------------------------------------------- launcher ----
  const launcher = el(`<button class="launch" aria-label="Otevřít prodavačku"></button>`); // face added at boot
  launcher.onclick = () => {
    hideFloat();
    api.track("assistant_opened");
    openPanel("chat");
  };

  // ------------------------------------------ floating cards (greeting / tips) ----
  let floatEl = null, floatTimer = null;
  function hideFloat() { clearTimeout(floatTimer); floatEl?.remove(); floatEl = null; }
  // fades out instead of vanishing
  function fadeFloat() {
    const n = floatEl;
    if (!n) return;
    n.classList.add("leaving");
    setTimeout(() => { if (floatEl === n) hideFloat(); }, 280);
  }
  function showFloat(node, autoHideMs, { pauseOnHover = true } = {}) {
    hideFloat();
    floatEl = node;
    wrap.insertBefore(node, launcher);
    if (autoHideMs) {
      node.style.setProperty("--t", autoHideMs + "ms");
      floatTimer = setTimeout(fadeFloat, autoHideMs);
      if (pauseOnHover) {
        // reading it? then don't take it away – until the mouse leaves
        node.addEventListener("mouseenter", () => clearTimeout(floatTimer));
        node.addEventListener("mouseleave", () => { clearTimeout(floatTimer); floatTimer = setTimeout(fadeFloat, 2500); });
      }
    }
  }
  const who = (mood = "") => `<div class="who">${avatar(48, { mood })}<div><b>${esc(cfg.name)}</b><span>prodavačka · AI asistentka</span></div></div>`;

  // Like a salesperson walking up to you: shows up right after you come in.
  let greetingData = null;
  // Arrival: the mascot hops over from its corner, lands in front of you and asks – like a
  // salesperson walking up. The customer picks how they want to shop.
  // Keyframes for the jump from an offset (dx, dy, scale s0) to its spot: crouch, a big hop,
  // a small hop, then a springy landing. Computed here so the arc is a real parabola.
  function hopFrames(dx, dy, s0) {
    const H1 = Math.min(240, 110 + Math.abs(dx) * 0.22), H2 = H1 * 0.32, lean = dx > 0 ? -1 : 1;
    const frames = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      let p = 0, lift = 0, sx = 1, sy = 1, r = 0;
      if (t < 0.08) { const u = t / 0.08; sy = 1 - 0.16 * u; sx = 1 + 0.1 * u; }                          // crouch
      else if (t < 0.52) { const u = (t - 0.08) / 0.44; p = 0.72 * u; lift = H1 * 4 * u * (1 - u);            // big hop
        r = lean * 10 * Math.sin(u * Math.PI); sy = 1 + 0.12 * (1 - u) * (1 - u); sx = 1 / sy; }
      else if (t < 0.78) { const u = (t - 0.52) / 0.26; p = 0.72 + 0.28 * u; lift = H2 * 4 * u * (1 - u);   // small hop
        r = lean * 4 * Math.sin(u * Math.PI); }
      else { const u = (t - 0.78) / 0.22; p = 1; sy = 1 - 0.2 * Math.exp(-4 * u) * Math.cos(u * 3 * Math.PI); sx = 1 + (1 - sy) * 0.8; } // landing
      const sc = s0 + (1 - s0) * p;
      frames.push({ transform: `translate(${(dx * (1 - p)).toFixed(1)}px, ${(dy * (1 - p) - lift).toFixed(1)}px) rotate(${r.toFixed(2)}deg) scale(${(sc * sx).toFixed(3)}, ${(sc * sy).toFixed(3)})` });
    }
    frames[frames.length - 1] = { transform: "none" };
    return frames;
  }

  async function greet() {
    if (state.greeted || mode) return;
    state.greeted = true; saveState();
    const stage = el(`
      <div class="arrive" role="dialog" aria-modal="true" aria-labelledby="aip-greet">
        <div class="scrim"></div>
        <div class="greeter">
          <div class="bubble">
            <button class="x" data-m="no" aria-label="Zavřít">${ICON.close}</button>
            <p class="g-name">${esc(cfg.name)}</p>
            <p class="g-text" id="aip-greet"></p>
            <div class="g-acts">
              <button class="g-btn pri" data-m="chat">${ICON.chat}Napsat</button>
              <button class="g-btn" data-m="voice">${ICON.mic}Promluvit si</button>
              <button class="g-skip" data-m="no">Díky, jen se dívám</button>
            </div>
          </div>
          <div class="hop">${avatar(96)}<span class="ground"></span></div>
        </div>
      </div>`);
    root.append(stage);
    const hop = stage.querySelector(".hop"), av = hop.querySelector(".av");

    // jump from where the mascot sits in the corner (or from off-screen if it isn't there)
    const from = launcher.querySelector(".av")?.getBoundingClientRect();
    const to = av.getBoundingClientRect();
    const [dx, dy, s0] = from?.width
      ? [from.left + from.width / 2 - (to.left + to.width / 2), from.bottom - to.bottom, from.width / to.width]
      : [innerWidth / 2 + 120, 0, 0.7];
    const frames = hopFrames(dx, dy, s0);
    launcher.style.visibility = "hidden";
    const jump = hop.animate(frames, { duration: reduced ? 1 : 1150, fill: "both" });

    const close = () => { stage.remove(); removeEventListener("keydown", onKey); launcher.style.visibility = ""; };
    let chosen = false;
    const choose = async (m) => {
      if (chosen) return;
      chosen = true;
      stage.classList.add("out");
      if (m === "no") {
        // hops back to its corner
        await new Promise((r) => setTimeout(r, reduced ? 0 : 120));
        await hop.animate(frames, { duration: reduced ? 1 : 750, direction: "reverse", fill: "both" }).finished.catch(() => {});
        close();
        return declineGreeting();
      }
      state.choice = m; saveState();
      api.track("offer_accepted", { mode: m });
      await hop.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-10px) scale(.7)" }], { duration: 200, fill: "both" }).finished.catch(() => {});
      close();
      openPanel(m, { fromGreeting: true });
    };
    const onKey = (e) => { if (e.key === "Escape") choose("no"); };
    addEventListener("keydown", onKey);
    stage.onclick = (e) => {
      if (e.target.classList.contains("scrim")) return choose("no"); // click outside = "just browsing"
      const m = e.target.closest("[data-m]")?.dataset.m;
      if (m) choose(m);
    };
    api.track("offer_shown");

    const text = post("/api/proactive", { sessionId, trigger: "greeting", signals: signals() }).then((r) => r.greeting).catch(() => null);
    await jump.finished.catch(() => {});
    if (chosen) return;
    stage.querySelector(".greeter").classList.add("landed");
    updateEyes();
    greetingData = (await text) ?? { text: `Dobrý den, vítejte! Jsem ${cfg.name}. Chcete s něčím poradit, nebo se radši porozhlédnete sami?` };
    setAv(av, "talk");
    await typeInto(stage.querySelector(".g-text"), greetingData.text.replace(/\s*\p{Extended_Pictographic}️?/gu, ""));
    setAv(av, "idle");
  }

  function declineGreeting() {
    state.choice = "declined"; state.lastNudgeAt = Date.now(); saveState();
    api.track("offer_declined");
    // answer like a person would, then step back
    const quip = el(`<div class="quip" role="status">Jasně, v klidu se porozhlédněte. Kdyby něco, jsem tady.</div>`);
    showFloat(quip, 3000, { pauseOnHover: false });
  }

  // Tips based on behaviour, e.g. a bundle deal the customer would miss.
  function showTip(n) {
    const stuck = n.kind.startsWith("hes-"); // customer is hesitating – an offer of help, not a deal
    state.shown.push(n.id); state.nudgeCount++; state.lastNudgeAt = Date.now(); saveState();
    api.track("nudge_shown", { kind: n.kind });

    // chat already open → Klára just says it in the conversation
    if (mode === "chat" && panel) {
      addBubble("bot", n.text);
      if (n.product) addCards([n.product]);
      addChips(n.actions.map((a) => ({ label: a.label, ask: a.ask, via: n.text, kind: n.kind })));
      return;
    }
    const ms = stuck ? 30000 : 20000;
    const card = el(`
      <div class="tip glass" role="status">
        ${aurora}
        <button class="x gbtn" aria-label="Zavřít tip">${ICON.close}</button>
        ${who()}
        <p></p>
        ${n.product ? `<div class="prod"><img src="${esc(img(n.product.image))}" alt=""><div><b>${esc(n.product.name)}</b><span>${fmtPrice(n.product.price)}</span></div></div>` : ""}
        <div class="chips">${n.actions.map((a, i) => `<button class="chip ${i ? "" : "solid"}" data-i="${i}" style="--i:${i + 2}">${esc(a.label)}</button>`).join("")}${stuck ? `<button class="chip ghost" data-no style="--i:${n.actions.length + 2}">Teď ne, díky</button>` : ""}</div>
        <span class="timer"></span>
      </div>`);
    const dismiss = () => {
      api.track("nudge_dismissed", { kind: n.kind });
      state.cooldown = Math.min(state.cooldown * 2, 120e3); saveState(); // they don't want to be disturbed → back off
      hideFloat();
    };
    card.querySelector(".x").onclick = dismiss;
    card.querySelector("[data-no]")?.addEventListener("click", dismiss);
    card.querySelectorAll(".chip[data-i]").forEach((b) => (b.onclick = () => {
      const a = n.actions[Number(b.dataset.i)];
      api.track("nudge_clicked", { kind: n.kind });
      hideFloat();
      openPanel("chat", { fromTip: true });
      send(a.ask, { via: n.text });
    }));
    showFloat(card, ms);
    const av = card.querySelector(".av");
    setAv(av, "talk");
    typeInto(card.querySelector("p"), n.text, 6).then(() => setAv(av, "idle"));
  }

  // ---- when is it OK to speak up? (never while the customer is mid-conversation) ----
  let checkTimer = null;
  function scheduleCheck(ms) { clearTimeout(checkTimer); checkTimer = setTimeout(checkNudge, ms); }
  setInterval(() => checkNudge(), 3000);

  let checking = false;
  async function checkNudge() {
    if (checking || busy || !state.greeted || document.visibilityState !== "visible") return;
    if (floatEl) return;                                             // something is already on screen
    if (!state.choice) return;                                       // greeting still unanswered
    if (mode === "voice") return;                                    // don't interrupt a spoken conversation
    if (mode === "chat" && Date.now() - lastChatActivity < 20e3) return; // they're talking to us already
    // "just looking" customers are left alone longer and get fewer tips – but a clearly
    // stuck customer can still get an offer of help (the server decides which tip fits)
    const max = state.choice === "declined" ? 3 : 5;
    if (state.nudgeCount >= max) return;
    const gap = state.choice === "declined" ? Math.max(state.cooldown, 25e3) : state.cooldown;
    if (Date.now() - state.lastNudgeAt < gap) return;
    checking = true;
    try {
      const { nudge } = await post("/api/proactive", { sessionId, trigger: "tick", signals: signals() });
      if (nudge && !floatEl && !busy) showTip(nudge);
    } catch {} finally { checking = false; }
  }

  // ------------------------------------------------------------- panel ----
  let panel, msgs, footer;
  // rendered transcript, kept across close/reopen, mode switches and page loads within the visit
  const history = ss.get("history") || [];
  const saveHistory = () => ss.set("history", history.slice(-60));

  const MOOD_TEXT = { idle: "Ráda poradím", think: "Přemýšlím…", talk: "Píšu…", speak: "Mluvím…", listen: "Poslouchám…", happy: "Skvělá volba! 🎉" };
  let happyTimer = null;
  /** Klára's mood drives her face in the header (and on the voice stage) plus the status line. */
  function setMood(mood, text) {
    if (!panel) return;
    if (mood !== "happy") clearTimeout(happyTimer);
    for (const av of panel.querySelectorAll(".head .av, .stage .av")) setAv(av, mood);
    const st = panel.querySelector(".status");
    st.classList.toggle("busy", mood !== "idle" && mood !== "happy");
    st.querySelector("span").textContent = text || (mode === "voice" && mood === "talk" ? "Mluvím…" : MOOD_TEXT[mood]);
    if (mood === "happy") happyTimer = setTimeout(() => setMood(busy ? "think" : "idle"), 1600);
  }

  function openPanel(m, { fromGreeting = false, fromTip = false } = {}) {
    let note = null;
    if (m === "voice" && !Recognition) {
      m = "chat";
      note = "Váš prohlížeč nepodporuje hlasové ovládání (zkuste Chrome nebo Edge). Můžeme si ale psát.";
    }
    mode = m;
    if (!state.choice) { state.choice = m; saveState(); }
    hideFloat();
    launcher.style.display = "none";
    if (!panel) buildPanel();
    lockPage(true);
    renderFooter();
    if (note) addNote(note);
    if (!history.length && !fromTip) { // from a tip the customer's question goes straight in
      const opening = m === "voice"
        ? "Výborně, poslouchám. Řekněte mi, co hledáte, nebo k čemu to budete potřebovat."
        : "Výborně! 🙂 Co hledáte?\n\nKlidně popište, k čemu to potřebujete – nebo vyberte:";
      addBubble("bot", opening);
      if (m === "chat") {
        const chips = [];
        if (fromGreeting && greetingData?.ask) chips.push({ label: greetingData.ask.replace(/\..*$/, ""), ask: greetingData.ask });
        chips.push({ label: "🎁 Hledám dárek", ask: "Hledám dárek. Co byste doporučila?" }, { label: "🏷️ Jaké máte akce?", ask: "Jaké teď máte výhodné akce?" }, { label: "🚚 Doprava a vrácení", ask: "Jak funguje doprava a vrácení zboží?" });
        addChips(chips);
      }
    }
    if (mode === "voice") speak(history.length === 1 ? history[0].text : "Poslouchám.", () => listen());
    else footer.querySelector("textarea")?.focus();
  }

  // on a phone the chat covers the screen – the shop behind it shouldn't scroll along
  const phone = matchMedia("(max-width: 480px)");
  let pageOverflow = null;
  function lockPage(on) {
    const h = document.documentElement;
    if (on && phone.matches && pageOverflow === null) { pageOverflow = h.style.overflow; h.style.overflow = "hidden"; }
    else if (!on && pageOverflow !== null) { h.style.overflow = pageOverflow; pageOverflow = null; }
  }

  function closePanel() {
    lockPage(false);
    stopVoice();
    mode = null;
    panel?.remove();
    panel = null;
    launcher.style.display = "";
    state.lastNudgeAt = Date.now(); saveState();
  }

  function buildPanel() {
    panel = el(`
      <div class="panel glass" role="dialog" aria-label="Prodavačka ${esc(cfg.name)}">
        ${aurora}
        <div class="head">
          ${avatar(46)}
          <div class="title"><b>${esc(cfg.name)}</b><div class="status"><i></i><span>${MOOD_TEXT.idle}</span></div></div>
          <button class="gbtn" data-a="switch" title="Přepnout hlas / psaní"></button>
          <button class="gbtn" data-a="close" title="Zavřít">${ICON.close}</button>
        </div>
        <div class="msgs" aria-live="polite"></div>
        <div class="footer"></div>
      </div>`);
    msgs = panel.querySelector(".msgs");
    footer = panel.querySelector(".footer");
    panel.querySelector('[data-a="close"]').onclick = closePanel;
    panel.querySelector('[data-a="switch"]').onclick = () => { stopVoice(); openPanel(mode === "voice" ? "chat" : "voice"); };
    for (const h of history) {
      if (h.kind === "cards") msgs.append(renderCards(h.items));
      else if (h.kind === "note") msgs.append(noteEl(h.text));
      else if (h.role) msgs.append(bubbleEl(h.role, h.text));
    }
    wrap.insertBefore(panel, launcher);
    updateEyes();
    scrollDown();
  }

  function renderFooter() {
    panel.querySelector('[data-a="switch"]').innerHTML = mode === "voice" ? ICON.keys : ICON.mic;
    if (mode === "voice") {
      footer.innerHTML = `
        <div class="stage">
          <button class="orbbtn" style="background:none;border:none;padding:0" title="Klepněte pro mluvení / přerušení">${avatar(118)}</button>
          <div class="vstat">Připravuji…</div>
          <div class="interim"></div>
          <button class="toChat">${ICON.keys} Raději budu psát</button>
        </div>`;
      // tap while she talks = interrupt and listen right away; tap while listening = cancel
      footer.querySelector(".orbbtn").onclick = () => {
        if (listening) { stopVoice(); setVoiceState("idle"); }
        else { if (speaking) stopVoice(); listen(); }
      };
      footer.querySelector(".toChat").onclick = () => { stopVoice(); openPanel("chat"); };
      updateEyes();
    } else {
      footer.innerHTML = `
        <form class="input">
          <div class="field">
            <textarea rows="1" placeholder="Napište, co hledáte…" maxlength="600" aria-label="Zpráva pro prodavačku"></textarea>
            <button class="send" type="submit" aria-label="Odeslat">${ICON.send}</button>
          </div>
        </form>
        <div class="legal">Odpovídá umělá inteligence a může se splést · <a href="${esc(cfg.privacy)}" target="_blank" rel="noopener">Ochrana soukromí</a></div>`;
      const form = footer.querySelector("form");
      const ta = form.querySelector("textarea");
      ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
      ta.oninput = () => { ta.style.height = "38px"; ta.style.height = Math.min(ta.scrollHeight, 110) + "px"; lastChatActivity = Date.now(); };
      form.onsubmit = (e) => {
        e.preventDefault();
        const text = ta.value.trim();
        if (!text || busy) return;
        ta.value = ""; ta.style.height = "38px";
        const sb = form.querySelector(".send");
        sb.classList.remove("fly"); void sb.offsetWidth; sb.classList.add("fly"); // restart the little launch animation
        send(text);
      };
    }
  }

  const scrollDown = () => { if (msgs) msgs.scrollTo({ top: msgs.scrollHeight, behavior: reduced ? "auto" : "smooth" }); };
  function bubbleEl(role, text) {
    const b = el(`<div class="m ${role === "me" ? "me" : role === "err" ? "err" : "bot"}"></div>`);
    if (role === "bot") b.innerHTML = md(text); else b.textContent = text;
    return b;
  }
  function addBubble(role, text) {
    const entry = { role, text };
    history.push(entry);
    saveHistory();
    const b = bubbleEl(role, text);
    msgs?.append(b);
    scrollDown();
    return { entry, b };
  }
  const noteEl = (text) => el(`<div class="note">${ICON.spark}<span>${esc(text)}</span></div>`);
  function addNote(text) { history.push({ kind: "note", text }); saveHistory(); msgs?.append(noteEl(text)); scrollDown(); }
  function addCards(items) { history.push({ kind: "cards", items }); saveHistory(); const c = renderCards(items); msgs?.append(c); scrollDown(); return c; }
  function addChips(chips) {
    const box = el(`<div class="chips"></div>`);
    chips.forEach((ch, i) => {
      const b = el(`<button class="chip" style="--i:${i}">${esc(ch.label)}</button>`);
      b.onclick = () => {
        if (busy) return;
        box.remove();
        if (ch.kind) api.track("nudge_clicked", { kind: ch.kind });
        send(ch.ask, { via: ch.via });
      };
      box.append(b);
    });
    msgs?.append(box);
    scrollDown();
  }

  function renderCards(items) {
    const box = el(`<div class="cards"></div>`);
    items.forEach((p, i) => {
      const card = el(`
        <div class="pc" style="--i:${i}" data-id="${esc(p.id)}">
          <div class="img"><img src="${esc(img(p.image))}" alt="">${p.discountPercent ? `<span class="badge">−${p.discountPercent} %</span>` : ""}</div>
          <div class="body">
            <div class="name">${esc(p.name)}</div>
            ${p.highlights?.[0] ? `<div class="hl">${esc(p.highlights[0])}</div>` : ""}
            <div class="price">${fmtPrice(p.price)}${p.oldPrice ? `<span class="old">${fmtPrice(p.oldPrice)}</span>` : ""}</div>
            <button class="add">${ICON.cart} Do košíku</button>
          </div>
        </div>`);
      // on a phone the chat covers the page – step aside so the product is visible (the chat stays saved)
      const openIt = () => openProduct(p);
      card.querySelector(".name").onclick = openIt;
      card.querySelector(".img").onclick = openIt;
      // on a shop we only watch, a product whose "add" button isn't on this page is opened instead
      const canAdd = hostIntegrated() || Boolean(findAddButton(p));
      if (!canAdd && p.url) card.querySelector(".add").innerHTML = `Zobrazit produkt`;
      // 3D tilt + light that follows the cursor
      if (!reduced) {
        card.addEventListener("pointermove", (e) => {
          const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
          card.style.transform = `perspective(700px) rotateY(${(x - 0.5) * 14}deg) rotateX(${(0.5 - y) * 12}deg) translateY(-4px)`;
          card.style.setProperty("--mx", x * 100 + "%"); card.style.setProperty("--my", y * 100 + "%");
        });
        card.addEventListener("pointerleave", () => { card.style.transform = ""; });
      }
      card.querySelector(".add").onclick = (e) => {
        const btn = e.currentTarget;
        if (!addToShopCart({ id: p.id, name: p.name, price: p.price, quantity: 1, url: p.url })) return openProduct(p);
        api.track("add_to_cart", { productId: p.id, quantity: 1, source: "ai_card" });
        btn.innerHTML = `${ICON.check} V košíku`;
        btn.disabled = true;
        btn.classList.add("done");
        flyToCart(card.querySelector(".img img"));
        setMood("happy");
      };
      box.append(card);
    });
    return box;
  }

  // the product image flies in an arc into the shop's cart icon, which then bounces
  function cartTarget() {
    return document.querySelector(integ.cart || script?.dataset.cartSelector || '[data-cart], a[href*="kosik"], a[href*="cart"], a[href*="basket"]');
  }
  function flyToCart(fromImg) {
    const target = cartTarget();
    const tr = (target || panel?.querySelector(".head .av") || launcher).getBoundingClientRect();
    const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    if (reduced || !fromImg) return burst(tx, ty, target);
    const fr = fromImg.getBoundingClientRect();
    const ghost = el(`<img class="fly-img" src="${esc(fromImg.src)}" alt="">`);
    Object.assign(ghost.style, { left: fr.left + "px", top: fr.top + "px", width: fr.width + "px", height: fr.height + "px" });
    root.append(ghost);
    const dx = tx - (fr.left + fr.width / 2), dy = ty - (fr.top + fr.height / 2);
    ghost.animate([
      { transform: "translate(0, 0) scale(1) rotate(0)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 170}px) scale(.75) rotate(-14deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.12) rotate(10deg)`, opacity: 0.4 },
    ], { duration: 750, easing: "cubic-bezier(.45,0,.25,1)" }).onfinish = () => { ghost.remove(); burst(tx, ty, target); };
  }
  function burst(x, y, target) {
    target?.animate([{ transform: "scale(1)" }, { transform: "scale(1.35) rotate(-8deg)" }, { transform: "scale(1)" }], { duration: 450, easing: "cubic-bezier(.34,1.56,.64,1)" });
    if (reduced) return;
    const colors = [theme.c1, theme.c2, theme.c3, "#ffd166", "#3ddc84"];
    for (let i = 0; i < 12; i++) {
      const s = el(`<span class="spark"></span>`);
      Object.assign(s.style, { left: x - 4 + "px", top: y - 4 + "px", background: colors[i % colors.length] });
      root.append(s);
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4, d = 28 + Math.random() * 30;
      s.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(0)`, opacity: 0 }],
        { duration: 650 + Math.random() * 250, easing: "cubic-bezier(.2,.8,.2,1)" }).onfinish = () => s.remove();
    }
  }

  // -------------------------------------------------------------- chat ----
  let chatAbort = null; // lets a spoken interruption stop an answer that is still arriving
  async function send(text, { via } = {}) {
    busy = true;
    const ctrl = new AbortController();
    chatAbort = ctrl;
    lastChatActivity = Date.now();
    const sendBtn = footer?.querySelector(".send");
    if (sendBtn) sendBtn.disabled = true;
    msgs?.querySelectorAll(":scope > .chips").forEach((c) => c.remove());
    addBubble("me", text);
    const typing = el(`<div class="thinking">${avatar(26, { mood: "think" })}<span class="shimmer">${esc(cfg.name)} přemýšlí…</span></div>`);
    msgs.append(typing);
    setMood("think");
    scrollDown();

    let cur = null;           // current bot bubble being streamed into
    const turnEls = [];       // for "replace"
    let spoken = "", full = "";
    const flushSpeech = (final) => {
      if (mode !== "voice") return;
      const pending = full.slice(spoken.length);
      const m = final ? pending : pending.match(/^[\s\S]*[.!?…](?=\s)/)?.[0];
      if (m && m.trim()) { spoken += m; enqueueSpeech(m); }
    };

    try {
      const res = await fetch(cfg.api + "/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // the transcript so far (without this message) travels along, so the conversation survives
        // even if the server is a fresh serverless instance that never saw it
        body: JSON.stringify({ client: cfg.client, sessionId, text, context: signals({ via, history: history.filter((h) => h.role === "me" || h.role === "bot").slice(0, -1).slice(-12).map((h) => ({ role: h.role === "me" ? "user" : "assistant", text: h.text.slice(0, 2000) })) }) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Spojení se nezdařilo.");
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (!line.startsWith("data: ")) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type !== "mode") typing.remove();
          if (ev.type === "text") {
            if (!cur) {
              if (!ev.delta.trim()) continue;
              cur = addBubble("bot", "");
              cur.b.classList.add("streaming");
              turnEls.push(cur.b);
              if (mode !== "voice") setMood("talk");
            }
            cur.entry.text += ev.delta;
            full += ev.delta;
            cur.b.innerHTML = md(cur.entry.text);
            flushSpeech(false);
          } else if (ev.type === "products") {
            cur?.b.classList.remove("streaming");
            turnEls.push(addCards(ev.items));
            cur = null;
          } else if (ev.type === "cart_remove") {
            api.onRemoveFromCart?.(ev.item);
            addNote(`Odebráno z košíku: ${ev.item.name}`);
            const t = cartTarget()?.getBoundingClientRect();
            if (t) burst(t.left + t.width / 2, t.top + t.height / 2, cartTarget());
          } else if (ev.type === "cart") {
            if (addToShopCart(ev.item)) {
              addNote(`Přidáno do košíku: ${ev.item.name}`);
              flyToCart(msgs.querySelector(`.pc[data-id="${CSS.escape(ev.item.id)}"] .img img`));
              setMood("happy");
            } else {
              addNote(`${ev.item.name} přidáte do košíku na stránce produktu – stačí kliknout na jeho kartičku.`);
            }
          } else if (ev.type === "replace") {
            turnEls.forEach((n) => n.remove());
            cur = addBubble("bot", ev.text);
            full = spoken = ""; stopSpeech();
            enqueueSpeech(ev.text);
          } else if (ev.type === "mode" && ev.offline && !state.offlineNoted) {
            state.offlineNoted = true; saveState();
            addNote("Teď odpovídám ve zjednodušeném režimu.");
          } else if (ev.type === "error") {
            addBubble("err", ev.message);
            if (mode === "voice") enqueueSpeech(ev.message);
          }
          scrollDown();
        }
      }
      flushSpeech(true);
    } catch (e) {
      if (e.name !== "AbortError") addBubble("err", e.message || "Spojení se nezdařilo.");
    } finally {
      saveHistory(); // the streamed answer grew in place
      typing.remove();
      msgs?.querySelectorAll(".streaming").forEach((b) => b.classList.remove("streaming"));
      busy = false;
      lastChatActivity = Date.now();
      if (sendBtn) sendBtn.disabled = false;
      if (chatAbort === ctrl) chatAbort = null;
      // interrupted by voice → the interruption itself takes over listening
      if (mode === "voice") { if (!ctrl.signal.aborted) afterSpeech(() => listen()); }
      else if (!panel?.querySelector(".av.happy")) setMood("idle");
    }
  }

  // ------------------------------------------------------------- voice ----
  // Voice: a natural neural voice from the server (ElevenLabs) when configured, otherwise the
  // best voice the browser has. The mouth follows the sound (loudness from the audio, or word
  // boundaries from the browser), and the customer can cut in by simply talking.
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  // phones: the open mic ducks the speaker and hears her own voice, so there she is interrupted by a tap instead
  const touchDevice = matchMedia("(hover: none) and (pointer: coarse)").matches;
  let rec = null, listening = false, speaking = false;
  let speechQueue = 0, afterSpeechCb = null;

  // browser voice fallback: natural pitch (raising it makes neural voices sound processed), a touch quicker.
  // data-voice picks a voice by name, data-pitch / data-rate tune it
  const VOICE = { pitch: Number(script?.dataset.pitch ?? 1), rate: Number(script?.dataset.rate ?? 1.05), pick: script?.dataset.voice?.toLowerCase() };
  let voiceChoice = null;
  function pickVoice() {
    const lang = cfg.lang.slice(0, 2).toLowerCase();
    const voices = (window.speechSynthesis?.getVoices() || []).filter((v) => v.lang?.toLowerCase().startsWith(lang));
    const score = (v) => (VOICE.pick && v.name.toLowerCase().includes(VOICE.pick) ? 100 : 0)
      + (/natural|neural|online|premium|enhanced/i.test(v.name) ? 30 : 0)   // neural voices sound like a person
      + (/vlasta|zuzana|jana|iveta|female|žena/i.test(v.name) ? 10 : 0)       // Klára is a she
      + (/google/i.test(v.name) ? 6 : 0) + (v.localService ? 0 : 2);
    return voices.sort((a, b) => score(b) - score(a))[0] || null;
  }
  if (window.speechSynthesis) {
    voiceChoice = pickVoice();
    speechSynthesis.addEventListener?.("voiceschanged", () => { voiceChoice = pickVoice(); });
  }

  // small synthesised sounds: "I'm listening", "got it", "ok, I'll stop"
  let actx = null;
  function chime(kind) {
    try { actx ??= new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    if (actx.state === "suspended") actx.resume();
    const notes = { listen: [659, 988], done: [880, 659], stop: [523, 392] }[kind] || [];
    const t0 = actx.currentTime + 0.01;
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = t0 + i * 0.085;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + 0.15);
    });
  }

  // the mouth follows the voice: a quick open-close on every word the engine reports
  const talkers = () => panel ? [...panel.querySelectorAll(".head .av, .stage .av")] : [];
  let sayTimer = null;
  function mouthWord() {
    for (const av of talkers()) { av.classList.remove("say"); void av.offsetWidth; av.classList.add("say"); }
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => talkers().forEach((av) => av.classList.remove("say")), 320);
  }
  const mouthTalk = (on) => talkers().forEach((av) => av.classList.toggle("talk", on));

  function setVoiceState(st) {
    const vstat = footer?.querySelector(".vstat");
    if (!vstat) return;
    const mood = { listening: "listen", thinking: "think", speaking: "speak", idle: "idle" }[st];
    setMood(mood);
    vstat.textContent = { listening: "Poslouchám vás…", thinking: "Přemýšlím…", speaking: touchDevice ? "Mluvím… (klepnutím mě přerušíte)" : "Mluvím… (klidně mi skočte do řeči)", idle: "Klepněte na mě a mluvte" }[st];
  }

  let speakingText = ""; // what she is saying right now – to tell her own voice from the customer's

  // spoken text: no emoji, no markdown symbols (so she never reads "smiling face" out loud)
  const speakable = (text) => text
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍️⃣]/gu, "")
    .replace(/\*\*/g, "").replace(/[•*#_`~>|]/g, "").replace(/\s+/g, " ").trim();

  function enqueueSpeech(text) {
    if (mode !== "voice") return;
    const clean = speakable(text);
    if (!clean || !/[\p{L}\p{N}]/u.test(clean)) return;
    speechQueue++;
    speaking = true;
    speakingText = (speakingText + " " + clean).slice(-500);
    if (ttsServer) queueNeural(clean); else speakBrowser(clean);
  }

  // one sentence finished (or failed) – when the last one ends, hand over to listening
  function speechDone() {
    speechQueue = Math.max(0, speechQueue - 1);
    if (speechQueue) return;
    speaking = false;
    speakingText = "";
    if (barged) return; // the customer cut in – the interruption handles what comes next
    stopBargeIn();
    const cb = afterSpeechCb; afterSpeechCb = null;
    if (!busy) cb?.();
  }

  // ---- natural neural voice from the server (ElevenLabs): sentences are fetched ahead and played in order ----
  // At most 2 requests run at once – the ElevenLabs free plan refuses more in parallel, and every
  // refused sentence used to be read by the browser voice, so the voice kept switching.
  const TTS_PARALLEL = 2;
  // Phones only play sound started by a tap, and each sentence arrives later, after a fetch. So one
  // audio element is unlocked on the customer's tap and then reused for every sentence.
  const player = new Audio();
  const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    player.src = SILENCE;
    player.play().catch(() => {});
    if (!ttsServer && window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    try { actx ??= new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {}
  }
  for (const t of ["click", "touchend"]) root.addEventListener(t, unlockAudio, { capture: true });
  const audioQueue = [];
  let playing = null, ttsAbort = new AbortController(), ttsInFlight = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fetchSpeech(text, signal) {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(cfg.api + "/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client: cfg.client, text }), signal });
      if (r.ok) return r.blob();
      // busy (too many requests at once) – wait a moment and try again
      if (r.status === 429 && attempt < 5) { await wait(350 * 2 ** attempt); continue; }
      throw new Error("tts " + r.status);
    }
  }
  function pumpSpeech() {
    for (const item of [playing, ...audioQueue]) {
      if (ttsInFlight >= TTS_PARALLEL) return;
      if (!item || item.blob) continue;
      ttsInFlight++;
      const signal = ttsAbort.signal;
      item.blob = fetchSpeech(item.text, signal).finally(() => { ttsInFlight--; if (!signal.aborted) pumpSpeech(); });
      item.blob.catch(() => {}); // handled when it's this sentence's turn
    }
  }
  function queueNeural(text) {
    audioQueue.push({ text, blob: null });
    pumpSpeech();
    if (!playing) playNext();
  }
  async function playNext() {
    const item = audioQueue.shift();
    playing = item || null;
    if (!item) return;
    pumpSpeech();
    let blob;
    try { blob = await item.blob; } catch (e) {
      if (playing !== item) return; // interrupted meanwhile
      // the service is really down – finish in the browser voice for good, so the two voices never alternate
      ttsServer = false;
      const rest = [item, ...audioQueue.splice(0)];
      playing = null;
      const sayNext = () => { const it = rest.shift(); if (it) speakBrowser(it.text, sayNext); };
      sayNext();
      return;
    }
    if (playing !== item) return;
    const url = URL.createObjectURL(blob);
    item.audio = player;
    player.onplay = () => { setVoiceState("speaking"); startBargeIn(); lipSync(); };
    player.onended = player.onerror = () => {
      stopLipSync();
      URL.revokeObjectURL(url);
      if (playing !== item) return;
      playing = null;
      speechDone();
      playNext();
    };
    player.src = url;
    player.play().catch(() => player.onended());
  }

  // the mouth opens as wide as the voice is loud – real lip-sync from the audio signal.
  // Not on phones: routing the voice through Web Audio goes silent there when the system suspends it.
  let lipRaf = 0, analyser = null, lipData = null;
  function lipSync() {
    if (touchDevice) { mouthTalk(true); return; }
    try {
      actx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (!analyser) {
        if (actx.state !== "running") throw new Error("audio context not running"); // routing now would mute the voice
        analyser = actx.createAnalyser();
        analyser.fftSize = 512;
        actx.createMediaElementSource(player).connect(analyser);
        analyser.connect(actx.destination);
        lipData = new Uint8Array(analyser.fftSize);
      }
    } catch { mouthTalk(true); return; }
    const data = lipData;
    let open = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) { const x = (v - 128) / 128; sum += x * x; }
      const target = clamp((Math.sqrt(sum / data.length) - 0.015) * 7, 0, 1);
      open += (target - open) * 0.45; // smooth, so it doesn't flicker
      for (const av of talkers()) { av.style.setProperty("--mouth", open.toFixed(3)); av.classList.toggle("amp", open > 0.06); }
      lipRaf = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopLipSync() {
    cancelAnimationFrame(lipRaf);
    for (const av of talkers()) { av.classList.remove("amp"); av.style.removeProperty("--mouth"); }
    mouthTalk(false);
  }

  // ---- browser voice (fallback): best natural voice available, natural pitch ----
  function speakBrowser(clean, after) {
    if (!window.speechSynthesis) { speechDone(); after?.(); return; }
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = cfg.lang;
    voiceChoice ??= pickVoice();
    if (voiceChoice) u.voice = voiceChoice;
    u.pitch = VOICE.pitch;
    u.rate = VOICE.rate;
    let gotWords = false, fallback = null;
    u.onstart = () => {
      setVoiceState("speaking");
      startBargeIn();
      // voices that don't report word boundaries get a steady talking mouth instead
      fallback = setTimeout(() => { if (!gotWords && speaking) mouthTalk(true); }, 350);
    };
    u.onboundary = (e) => {
      if (e.name && e.name !== "word") return;
      gotWords = true;
      mouthTalk(false);
      mouthWord();
    };
    u.onend = u.onerror = () => {
      clearTimeout(fallback);
      mouthTalk(false);
      speechDone();
      after?.();
    };
    speechSynthesis.speak(u);
  }

  function speak(text, then) { afterSpeechCb = then; enqueueSpeech(text); if (!speaking) { afterSpeechCb = null; then?.(); } }
  function afterSpeech(cb) { if (speaking) afterSpeechCb = cb; else cb(); }
  // silence every voice at once (browser and neural), drop sentences still waiting
  function hushVoice() {
    window.speechSynthesis?.cancel();
    ttsAbort.abort(); ttsAbort = new AbortController();
    audioQueue.length = 0;
    const p = playing; playing = null;
    p?.audio?.pause();
    stopLipSync();
  }
  function stopSpeech() {
    afterSpeechCb = null; speechQueue = 0; speaking = false; speakingText = "";
    stopBargeIn();
    hushVoice();
  }

  // ---- cutting in by voice: she keeps her ears open while she talks ----
  let bargeRec = null, barged = false;
  const normSpeech = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ");
  const STOP_WORDS = /\b(stop|stuj|pockej|pockejte|dost|moment|ticho|prestan|zadrz)\b/;
  function isOwnVoice(said) {
    // the microphone also hears the speakers: ignore what is mostly her own words
    const words = normSpeech(said).split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) return true;
    const mine = new Set(normSpeech(speakingText).split(/\s+/));
    return words.filter((w) => mine.has(w)).length / words.length >= 0.6;
  }
  function startBargeIn() {
    if (!Recognition || touchDevice || bargeRec || barged || mode !== "voice") return;
    const r = new Recognition();
    r.lang = cfg.lang;
    r.interimResults = true;
    r.continuous = true;
    let from = 0, said = ""; // results before the interruption were her own voice or noise
    r.onresult = (e) => {
      const all = [...e.results];
      const latest = all.slice(from).map((x) => x[0].transcript).join(" ").trim();
      if (!barged) {
        const n = normSpeech(latest);
        const clearlyTalking = n.split(/\s+/).filter((w) => w.length > 1).length >= 2 && !isOwnVoice(latest);
        if (!STOP_WORDS.test(n) && !clearlyTalking) return;
        from = Math.max(0, all.length - 1);
        interrupt();
      }
      said = all.slice(from).map((x) => x[0].transcript).join(" ").trim();
      const interim = footer?.querySelector(".interim");
      if (interim) interim.textContent = said;
      // a finished sentence after the interruption = the customer's new question
      if (all.at(-1)?.isFinal) try { r.stop(); } catch {}
    };
    r.onerror = () => {};
    r.onend = () => {
      bargeRec = null;
      if (barged) {
        barged = false;
        const interim = footer?.querySelector(".interim");
        if (interim) interim.textContent = "";
        const question = said.replace(/^\s*(stop|stůj|počkejte|počkej|dost|moment|ticho|přestaň|zadrž)[\s,.!]*/i, "").trim();
        if (question.split(/\s+/).length >= 2) { chime("done"); setVoiceState("thinking"); send(question); }
        else listen(); // just "stop" – she stays quiet and listens
      } else if (speaking && mode === "voice") startBargeIn(); // recognition timed out while she was still talking
    };
    try { r.start(); bargeRec = r; } catch {}
  }
  function stopBargeIn() {
    if (!bargeRec) return;
    bargeRec.onend = null;
    try { bargeRec.abort(); } catch {}
    bargeRec = null;
  }
  function interrupt() {
    barged = true;
    afterSpeechCb = null; speechQueue = 0; speaking = false; speakingText = "";
    hushVoice();
    chatAbort?.abort();          // an answer still arriving is dropped too
    mouthTalk(false);
    chime("stop");
    setVoiceState("listening");
  }

  function listen() {
    if (mode !== "voice" || busy || !Recognition) return;
    stopSpeech();
    rec = new Recognition();
    rec.lang = cfg.lang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    const interim = footer.querySelector(".interim");
    rec.onresult = (e) => {
      let t = "";
      for (const r of e.results) { if (r.isFinal) finalText += r[0].transcript; else t += r[0].transcript; }
      if (interim) interim.textContent = t || finalText;
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") addNote("Mikrofon není povolen. Povolte ho v prohlížeči, nebo přepněte na psaní.");
    };
    rec.onend = () => {
      listening = false;
      if (interim) interim.textContent = "";
      if (mode !== "voice") return;
      if (finalText.trim()) { chime("done"); setVoiceState("thinking"); send(finalText.trim()); } else setVoiceState("idle");
    };
    try { rec.start(); listening = true; chime("listen"); setVoiceState("listening"); } catch { setVoiceState("idle"); }
  }

  function stopVoice() {
    barged = false;
    stopSpeech();
    if (rec) { rec.onend = null; try { rec.abort(); } catch {} rec = null; }
    listening = false;
  }

  // -------------------------------------------------------------- boot ----
  api.open = (m = "chat") => openPanel(m);

  function boot() {
    theme = detectTheme();
    AV = detectPersona();
    nameReady = loadName();
    const pageReady = autoInit().catch(() => {});
    launcher.innerHTML = avatar(60) + `<span class="launch-label">Poradit s nákupem</span>`;
    nameReady.then(() => launcher.setAttribute("aria-label", `Otevřít prodavačku ${cfg.name}`));
    document.body.append(host);
    wrap.append(launcher);
    updateEyes();
    // a product opened from the chat: the conversation continues next to it
    const reopen = ss.get("reopen");
    if (reopen) { ss.set("reopen", null); nameReady.then(() => openPanel(reopen === "voice" ? "chat" : reopen)); return; }
    // greet once she knows her name and what page the customer is on (the greeting can mention
    // the product) – but never keep the customer waiting more than 5 s
    if (!state.greeted) setTimeout(() => Promise.race([Promise.all([nameReady, pageReady]), new Promise((r) => setTimeout(r, 5000))]).then(greet), cfg.greetDelay);
  }
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", boot) : boot();
})();
