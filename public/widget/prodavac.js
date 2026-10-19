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
    name: script?.dataset.name || "", // made from the shop's name at start-up (personaName), then the server's
    color: script?.dataset.color || "#1a8f4c",
    greetDelay: Number(script?.dataset.greetDelay ?? 0.6) * 1000,
    lang: script?.dataset.lang || "cs-CZ",
  };

  // ---------------------------------------------------------- language ----
  // Czech or English: data-lang on the embed, else the page's own <html lang>. The assistant talks,
  // writes and listens in it (the AI answers in it too).
  const UI_LANG = /^en/i.test(script?.dataset.lang || window.AIProdavac?.lang || document.documentElement.lang || "") ? "en" : "cs";
  if (UI_LANG === "en" && !script?.dataset.lang) cfg.lang = "en-GB";
  const TEXT = {
    cs: {
      open: "Otevřít prodavačku", openNamed: (n) => `Otevřít prodavačku ${n}`, role: "prodavačka · AI asistentka", close: "Zavřít", closeTip: "Zavřít tip",
      skip: "Díky, jen se dívám", notNow: "Teď ne, díky", launch: "Poradit s nákupem", write: "Napsat", talk: "Promluvit si",
      greet: (n) => `Dobrý den, vítejte! Jsem ${n}. Chcete s něčím poradit, nebo se radši porozhlédnete sami?`,
      quip: "Jasně, v klidu se porozhlédněte. Kdyby něco, jsem tady.",
      idle: "Ráda poradím", think: "Přemýšlím…", typing: "Píšu…", speak: "Mluvím…", listen: "Poslouchám…", happy: "Skvělá volba! 🎉",
      noVoice: "Váš prohlížeč nepodporuje hlasové ovládání (zkuste Chrome nebo Edge). Můžeme si ale psát.",
      openVoice: "Výborně, poslouchám. Řekněte mi, co hledáte, nebo k čemu to budete potřebovat.",
      openChat: "Výborně! 🙂 Co hledáte?\n\nKlidně popište, k čemu to potřebujete – nebo vyberte:",
      openChatAny: "Výborně! 🙂 S čím vám můžu pomoct?\n\nZeptejte se na cokoli – nebo vyberte:",
      chipGift: "🎁 Hledám dárek", askGift: "Hledám dárek. Co byste doporučila?", chipDeals: "🏷️ Jaké máte akce?", askDeals: "Jaké teď máte výhodné akce?",
      chipShip: "🚚 Doprava a vrácení", askShip: "Jak funguje doprava a vrácení zboží?", listening: "Poslouchám.",
      panel: (n) => `Prodavačka ${n}`, switchMode: "Přepnout hlas / psaní",
      maxFiles: (n) => `Najednou můžete poslat nejvýš ${n} přílohy.`, fileType: "Umím otevřít fotky a PDF – tenhle soubor bohužel ne.", pdfBig: "PDF je moc velké (max. 2,5 MB).",
      fileFail: (n) => `Soubor ${n} se nepodařilo načíst.`, rmFile: "Odebrat přílohu", loadingFile: "Načítám přílohu", drop: "Pusťte soubor sem",
      tapTalk: "Klepněte pro mluvení / přerušení", preparing: "Připravuji…", toChat: "Raději budu psát",
      attach: "Přiložit fotku nebo soubor", attachTitle: "Přiložit fotku nebo PDF", placeholder: "Napište, co hledáte…", msgLabel: "Zpráva pro prodavačku",
      legal: "Odpovídá umělá inteligence a může se splést", privacy: "Ochrana soukromí", addCart: "Do košíku", inCart: "V košíku",
      thinking: (n) => `${n} přemýšlí…`, connFail: "Spojení se nezdařilo.", removed: (n) => `Odebráno z košíku: ${n}`, added: (n) => `Přidáno do košíku: ${n}`,
      addOnPage: (n) => `${n} přidáte do košíku na stránce produktu – stačí kliknout na jeho kartičku.`, removeOnPage: (n) => `${n} se mi z košíku odebrat nepodařilo – odeberte ho prosím přímo v košíku.`, simple: "Teď odpovídám ve zjednodušeném režimu.",
      vListening: "Poslouchám vás…", vThinking: "Přemýšlím…", vSpeakTouch: "Mluvím… (klepnutím mě přerušíte)", vSpeak: "Mluvím… (klidně mi skočte do řeči)", vIdle: "Klepněte na mě a mluvte",
      micDenied: "Mikrofon není povolen. Povolte ho v prohlížeči, nebo přepněte na psaní.",
      offNote: "Prodavačka je teď nedostupná. Děkujeme za pochopení.", attached: "přiloženo",
      prevCards: "Předchozí produkty", nextCards: "Další produkty",
    },
    en: {
      open: "Open the shop assistant", openNamed: (n) => `Open ${n}, the shop assistant`, role: "shop assistant · AI", close: "Close", closeTip: "Close tip",
      skip: "Thanks, just looking", notNow: "Not now, thanks", launch: "Help me choose", write: "Chat", talk: "Talk",
      greet: (n) => `Hi, welcome! I'm ${n}. Can I help you find something, or would you rather browse?`,
      quip: "Sure, take your time. I'm here if you need me.",
      idle: "Happy to help", think: "Thinking…", typing: "Typing…", speak: "Speaking…", listen: "Listening…", happy: "Great choice! 🎉",
      noVoice: "Your browser doesn't support voice (try Chrome or Edge). We can chat instead.",
      openVoice: "Great, I'm listening. Tell me what you're looking for, or what you need it for.",
      openChat: "Great! 🙂 What are you looking for?\n\nTell me what you need it for – or pick one:",
      openChatAny: "Great! 🙂 How can I help?\n\nAsk me anything – or pick one:",
      chipGift: "🎁 Looking for a gift", askGift: "I'm looking for a gift. What would you recommend?", chipDeals: "🏷️ Any deals?", askDeals: "What good deals do you have right now?",
      chipShip: "🚚 Delivery & returns", askShip: "How do delivery and returns work?", listening: "I'm listening.",
      panel: (n) => `Shop assistant ${n}`, switchMode: "Switch voice / typing",
      maxFiles: (n) => `You can send at most ${n} attachments at once.`, fileType: "I can open photos and PDFs – not this file, sorry.", pdfBig: "The PDF is too big (max. 2.5 MB).",
      fileFail: (n) => `Couldn't load ${n}.`, rmFile: "Remove attachment", loadingFile: "Loading attachment", drop: "Drop the file here",
      tapTalk: "Tap to talk / interrupt", preparing: "Getting ready…", toChat: "I'd rather type",
      attach: "Attach a photo or file", attachTitle: "Attach a photo or PDF", placeholder: "Type what you're looking for…", msgLabel: "Message to the assistant",
      legal: "Answers come from AI and may be wrong", privacy: "Privacy", addCart: "Add to cart", inCart: "In cart",
      thinking: (n) => `${n} is thinking…`, connFail: "Couldn't connect.", removed: (n) => `Removed from cart: ${n}`, added: (n) => `Added to cart: ${n}`,
      addOnPage: (n) => `You can add ${n} to the cart on its product page – just click its card.`, removeOnPage: (n) => `I couldn't take ${n} out of the cart – please remove it in the cart itself.`, simple: "I'm answering in a simple mode right now.",
      vListening: "Listening…", vThinking: "Thinking…", vSpeakTouch: "Speaking… (tap to interrupt)", vSpeak: "Speaking… (feel free to interrupt)", vIdle: "Tap me and talk",
      micDenied: "The microphone isn't allowed. Allow it in your browser, or switch to typing.",
      offNote: "The shop assistant isn't available right now. Thanks for understanding.", attached: "attached",
      prevCards: "Previous products", nextCards: "More products",
    },
  }[UI_LANG];
  const L = (k, ...a) => (typeof TEXT[k] === "function" ? TEXT[k](...a) : TEXT[k]);

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
  // Keys carry the shop's id: two shops on one domain (our two demos, a group's shops under one
  // address) must never see each other's conversation, session or history.
  const mem = new Map();
  const TRACKING = /^(searches|seq|cartRemovals)$/;
  const PREFIX = `aip_${cfg.client}_`;
  const box = (storage, needsConsent) => ({
    get(k) {
      if (needsConsent(k) && !consent()) return mem.get(k) ?? null;
      try { return JSON.parse(storage().getItem(PREFIX + k)); } catch { return null; }
    },
    set(k, v) {
      if (needsConsent(k) && !consent()) { mem.set(k, v); return; }
      try { storage().setItem(PREFIX + k, JSON.stringify(v)); } catch {}
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
      try { for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k); } catch {}
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
  // What the page the customer is on says right now, for the chat: the site's current texts even when
  // they are drawn in the browser (React…) and the server can't read them. Never a cart, checkout,
  // account or a page with a form being filled in – those can hold the customer's own data.
  const PRIVATE_PAGE = /\/(cart|kosik|basket|checkout|pokladna|objednavka|order|login|prihlaseni|registrace|register|account|muj-ucet|ucet|profile|profil)(\/|$)/i;
  function pageNow() {
    try {
      if (PRIVATE_PAGE.test(location.pathname) || document.querySelector('input[type="password"]')) return {};
      const main = document.querySelector("main, [role=main]") || document.body;
      const text = (main.innerText || "").replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n")
        .replace(/^[a-z]+(_[a-z]+)+$/gm, "").replace(/\n{2,}/g, "\n") // icon-font names (calendar_month, expand_more)
        .trim().slice(0, 4000);
      return text.length > 40 ? { pageText: text, pageTitle: document.title.slice(0, 160), pageUrl: location.origin + location.pathname } : {};
    } catch { return {}; }
  }
  const post = (path, body) => fetch(cfg.api + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client: cfg.client, lang: UI_LANG, ...body }) }).then((r) => r.json());

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
  // ---- the shop's own cart, read off its page (mini-cart, cart drawer or cart page) ----
  // Shops without analytics events don't tell us what is in the cart, so its lines are read from the
  // page, and a product is taken out by pressing the shop's own remove (bin, ×) or "−" button.
  const CONTROLS = 'button, a, [role="button"], input[type="button"], input[type="submit"]';
  const REMOVE_RE = /odebrat|odstranit|smazat|vymazat|vyjmout|remove|delete|trash|^\s*[×✕✖✗xX]\s*$/i;
  const DEC_RE = /^\s*[−–-]\s*$|decrease|snizit|ubrat|minus|less/i;
  const PRICE_RE = /\d[\d\s.,]*\s*(kč|czk|€|eur|\$|usd|,-)/i;
  const hintsOf = (b) => [b.id, typeof b.className === "string" ? b.className : "", ...[...b.attributes].filter((a) => a.name.startsWith("data-")).map((a) => a.name)].join(" ");
  const isRemove = (b) => REMOVE_RE.test(labelOf(b).trim()) || /remove|delete|trash|odebrat|smazat/i.test(hintsOf(b));
  const isDecrease = (b) => DEC_RE.test(plainText(labelOf(b))) || /decrease|minus|\bdec\b|data-dec/i.test(hintsOf(b));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Cart lines on the page: the smallest block around a remove button that holds a product link and a price. */
  function readCartLines() {
    const lines = [];
    for (const c of [...document.querySelectorAll(CONTROLS)].filter(isRemove)) {
      let box = c.parentElement;
      for (let depth = 0; box && box !== document.body && depth < 8; depth++, box = box.parentElement) {
        if ([...box.querySelectorAll(CONTROLS)].filter(isRemove).length > 1) break; // reached the whole cart
        const link = [...box.querySelectorAll("a[href]")].find((a) => a !== c && plainText(a.textContent).length > 2);
        if (link && PRICE_RE.test(box.textContent)) {
          const qtyInput = box.querySelector('input[type="number"], input[inputmode="numeric"], input[name*="qty" i], input[name*="quantity" i], input[name*="mnozstvi" i], input[name*="amount" i]');
          lines.push({ box, remove: c, qtyInput, name: link.textContent.trim().replace(/\s+/g, " ").slice(0, 200), url: link.href, quantity: Math.max(1, parseInt(qtyInput?.value, 10) || 1) });
          break;
        }
      }
    }
    return lines;
  }
  const sameItem = (line, item) => {
    const a = plainText(line.name), b = plainText(item.name);
    return (item.url && line.url === item.url) || (a.length > 2 && (a === b || a.includes(b) || b.includes(a)));
  };

  /** What the cart on the page holds – it beats our own record, which misses what the customer added by hand. */
  async function syncCartFromPage() {
    if (hostIntegrated()) return;
    const lines = readCartLines();
    if (!lines.length) return;
    const { ids = [] } = await resolveRefs(lines.map((l) => ({ name: l.name, url: l.url })));
    const cart = [];
    lines.forEach((l, n) => { if (ids[n] && !cart.some((c) => c.id === ids[n])) cart.push({ id: ids[n], quantity: l.quantity }); });
    if (cart.length) { autoCart = cart; saveAutoCart(); }
  }

  /** Takes a product out of the shop's cart: its JS hook, or the "−" / remove button in its cart line. */
  async function removeFromShopCart(item) {
    if (api.onRemoveFromCart || hostIntegrated()) { api.onRemoveFromCart?.(item); return true; }
    const find = () => readCartLines().find((l) => sameItem(l, item));
    const line = find();
    if (!line) return false;
    const all = item.quantity >= line.quantity;
    if (!all && [...line.box.querySelectorAll(CONTROLS)].some(isDecrease)) {
      // one press per piece; the shop usually redraws the line after each one, so it is looked up again
      for (let i = 0; i < item.quantity; i++) {
        const dec = [...(find()?.box.querySelectorAll(CONTROLS) ?? [])].find(isDecrease);
        if (!dec) break;
        dec.click();
        await sleep(300);
      }
    } else if (!all && line.qtyInput) {
      line.qtyInput.value = String(line.quantity - item.quantity);
      for (const type of ["input", "change"]) line.qtyInput.dispatchEvent(new Event(type, { bubbles: true }));
    } else line.remove.click();
    const mine = autoCart.find((c) => c.id === item.id);
    if (mine) { mine.quantity -= item.quantity; if (mine.quantity <= 0) autoCart = autoCart.filter((c) => c !== mine); saveAutoCart(); }
    api.track("cart_remove", { productId: item.id });
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
  // The shop's plan has no messages left this month → the assistant switches itself off on the page
  // (it comes back next month, or as soon as the shop picks a bigger plan).
  let off = false;
  function switchOff(delay = 0) {
    if (off) return;
    off = true;
    setTimeout(() => host.remove(), delay);
  }
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

  // The look the owner set in the Sella dashboard ("Vaše prodavačka") – it comes with the start-up check
  // and wins over the embed's data-* attributes and over what is read off the page.
  // data-preview = the owner's live preview on the settings page: it shows the unsaved look from the
  // data-* attributes, skips the on/off check and – with no consent – records no statistics.
  const preview = script?.dataset.preview === "1";
  let look = {};
  let lookSavedAt = null; // when the server last saved this website's look (reportLook)
  let starters = null; // the opening buttons written for this website (null = the shop's usual ones below)
  let siteOnly = false; // true while reading the website's own look for the settings preview (reportLook)
  const opts = () => {
    if (preview || siteOnly) return { ...(script?.dataset || {}) };
    const o = { ...(script?.dataset || {}) };
    if (look.color) o.color = look.color;
    if (look.theme) o.theme = look.theme;
    if (look.letter) { o.letter = look.letter; delete o.avatarImage; if (look.avatarColor) o.avatarColor = look.avatarColor; }
    if (look.image) { o.avatarImage = cfg.api + look.image; delete o.letter; delete o.avatarColor; }
    if (look.avatar) o.avatar = look.avatar; // "logo": the mascot made from the website's logo instead of the blob
    for (const k of ["shape", "face", "faceY", "faceScale"]) if (look[k] != null) o[k] = String(look[k]);
    return o;
  };

  // The website's logo: an element called "logo", or the link home in the page's top bar
  // (in <header>, <nav> or a plain <div> – sites build their top bar every way).
  function findLogo() {
    const named = document.querySelector('[class*="logo" i], [id*="logo" i], a[rel="home"]');
    if (named) return named;
    return [...document.querySelectorAll("a[href]")].find((a) => {
      try {
        const u = new URL(a.getAttribute("href"), location.href);
        if (u.origin !== location.origin || !/^\/(index\.html?)?$/.test(u.pathname) || u.hash.length > 2) return false;
      } catch { return false; }
      const r = a.getBoundingClientRect();
      return r.width > 0 && r.top + scrollY < 200;
    }) || null;
  }
  const saturated = (c, minS = 0.3) => { if (!c || c.a < 0.6) return false; const { s, l } = toHsl(c); return s >= minS && l >= 0.08 && l <= 0.8; };
  // the colour the logo is drawn in (an svg's fill / stroke, or the logo text)
  function logoColor() {
    const logo = findLogo();
    if (!logo) return null;
    for (const e of [logo, ...logo.querySelectorAll("*")]) {
      const cs = getComputedStyle(e);
      for (const v of [e.getAttribute("fill"), e.getAttribute("stroke"), cs.fill, cs.stroke, cs.color]) {
        const c = parseColor(v);
        if (saturated(c)) return c;
      }
    }
    return null;
  }
  // the coloured text the site uses most for headings and links
  function textAccent() {
    const count = new Map();
    for (const e of [...document.querySelectorAll("h1, h2, h3, a, strong, [class*='primary' i]")].slice(0, 400)) {
      const c = parseColor(getComputedStyle(e).color);
      if (saturated(c, 0.35)) count.set(hex(c), (count.get(hex(c)) || 0) + 1);
    }
    const best = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
    return best ? parseColor(best) : null;
  }

  /**
   * Reads the shop's look so the assistant blends in like a chameleon: brand colour, the style of
   * its buttons (font, capitals, letter spacing, corners), the page's own background and text
   * colour, light or dark. data-* attributes and the dashboard's settings override.
   */
  function detectTheme() {
    const d = opts();
    const bg = [document.body, document.documentElement].map((e) => parseColor(getComputedStyle(e).backgroundColor)).find((c) => c && c.a > 0.5) || { r: 255, g: 255, b: 255 };
    const font = d.font || getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    // remembered for the visit, so the assistant doesn't change colour from page to page
    // (keyed by the site's look, so two different sites never share it)
    const key = "theme3:" + hex(bg) + "|" + font.slice(0, 40);
    const cached = !siteOnly && !d.color && !d.theme && ss.get(key);
    if (cached) return applyTheme(cached);
    let brand = d.color ? parseColor(d.color) : null, radius = null, btn = null;
    {
      // the brand colour = the saturated colour used most on buttons, counted by how often it
      // appears (one huge button can't win alone) and weighted up in the header / navigation.
      // Dark brand colours count too (a deep green, navy, burgundy); a site whose buttons are
      // all black or dark grey gets that.
      const score = new Map(), plain = new Map(), radii = new Map(), sample = new Map();
      for (const e of document.querySelectorAll('button, a, input[type="submit"], [role="button"], [class*="btn"]')) {
        const cs = getComputedStyle(e), c = parseColor(cs.backgroundColor);
        if (!c || c.a < 0.8) continue;
        const rect = e.getBoundingClientRect(), area = Math.min(rect.width * rect.height, 6000);
        if (area < 150) continue;
        const { s, l } = toHsl(c);
        const into = s >= 0.3 && l >= 0.08 && l <= 0.82 ? score : l < 0.3 ? plain : null;
        if (!into) continue;
        const inHeader = rect.top + scrollY < 160 || e.closest("header, nav, [role=banner]");
        const k = hex(c);
        into.set(k, (into.get(k) || 0) + area * (inHeader ? 3 : 1));
        if (!sample.has(k)) {
          sample.set(k, e);
          // the roundest corner – buttons joined to an input are often rounded on one side only
          radii.set(k, Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0)));
        }
      }
      const top = (m) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0];
      const best = top(score) || top(plain);
      if (best) { btn = sample.get(best); radius = radii.get(best); brand ??= parseColor(best); }
    }
    // no coloured buttons: the logo's colour, then the colour of headings and links
    brand ??= logoColor() || textAccent() || parseColor("#2288e5");
    const mode = d.theme === "dark" || d.theme === "light" ? d.theme : luminance(bg) < 0.45 ? "dark" : "light";

    // two companion colours for gradients. A deep or quiet brand colour keeps to its own family
    // (a dark green gets greens, not violet); a bright one steps to neighbouring hues on the
    // "nice" side – warm towards red/amber, reds towards pink/violet, cool towards violet/magenta.
    const { h, s, l } = toHsl(brand);
    const c1 = hex(brand);
    let c2, c3;
    if (l < 0.3 || s < 0.45) {
      c2 = hsl(h + 10, s * 0.9, clamp(l + 0.1, l, 0.5));
      c3 = hsl(h + 24, s * 0.75, clamp(l + 0.22, l, 0.62));
    } else {
      const [s2, s3] = h >= 20 && h < 70 ? [-16, -36] : h >= 300 || h < 20 ? [-28, -56] : [38, 80];
      c2 = hsl(h + s2, Math.max(s, 0.55), clamp(l + 0.06, 0.45, 0.66));
      c3 = hsl(h + s3, Math.max(s * 0.95, 0.5), clamp(l + 0.12, 0.52, 0.72));
    }
    const r = radius ?? parseFloat(d.radius ?? 10);

    // the panel takes the page's own tone: a dark site's dark (a touch lighter), a cream or tinted
    // light site's tint; pure white sites stay white. Text takes the page's text colour.
    const b = toHsl(bg);
    const text = parseColor(getComputedStyle(document.body).color);
    const surf = mode === "dark"
      ? { bg: hsl(b.h, b.s, clamp(b.l + 0.05, 0.07, 0.2)), bg2: hsl(b.h, b.s, clamp(b.l + 0.09, 0.1, 0.24)) }
      : b.l < 0.985 && b.l > 0.8
        ? { bg: hsl(b.h, b.s, Math.min(b.l + 0.01, 0.99)), bg2: hsl(b.h, b.s, Math.min(b.l + 0.025, 0.995)), glass: hsl(b.h, b.s * 0.9, b.l - 0.035),
            ink: text && luminance(text) < 0.35 ? hex(text) : null }
        : {};

    // the site's button style, worn by the assistant's buttons and chips
    const style = {};
    if (btn) {
      const cs = getComputedStyle(btn), size = parseFloat(cs.fontSize) || 14, ls = parseFloat(cs.letterSpacing) || 0;
      Object.assign(style, {
        bfont: cs.fontFamily, btt: cs.textTransform === "uppercase" ? "uppercase" : "none",
        bls: ls > 0 ? Math.min(ls / size, 0.12).toFixed(3) + "em" : "normal",
      });
    }

    const t = { mode, c1, c2, c3, font, r, ...surf, ...style };
    if (siteOnly) return { ...t, bg: hex(bg), text: text ? hex(text) : null };
    if (!d.color && !d.theme) ss.set(key, t);
    return applyTheme(t);
  }
  function applyTheme({ mode, c1, c2, c3, font, r, bg, bg2, glass, ink, bfont, btt, bls }) {
    host.dataset.mode = mode;
    const set = (k, v) => host.style.setProperty(k, v);
    set("--c", c1); set("--c2", c2); set("--c3", c3); set("--font", font);
    if (bg) { set("--bg", bg); set("--bg2", bg2); }
    if (glass) set("--glass", glass);
    if (ink) { set("--ink", ink); set("--strong", ink); set("--bot", ink); set("--soft", `color-mix(in srgb, ${ink} 68%, ${bg || "#fff"})`); }
    set("--bfont", bfont || font); set("--btt", btt || "none"); set("--bls", bls || "normal");
    // a sharp-cornered site gets a sharp assistant; a rounded one a rounded one
    set("--rp", clamp(r * 2.2 + 6, 8, 28) + "px");   // panel
    set("--rb", clamp(r * 1.6 + 6, 6, 22) + "px");   // bubbles, cards
    set("--rc", clamp(r * 1.4 + 4, 4, 22) + "px");   // chips, buttons
    set("--rpill", r <= 4 ? clamp(r * 1.4 + 4, 4, 22) + "px" : "999px"); // the launcher label and the message field
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
    clip: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.5 12.3 19.7a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6"/></svg>`,
    file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`,
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
    /* no mouth (just eyes, no face, or the shop's own character): the whole mascot bounces as it talks */
    .av .mover { transform-box: fill-box; transform-origin: 50% 100%; }
    .av.nomouth.talk .mover, .av.nomouth.say .mover { animation: natter .24s ease-in-out infinite alternate; }
    .av.nomouth.amp .mover { transform: translateY(calc(var(--mouth, 0) * -5px)) scale(calc(1 + var(--mouth, 0) * .07), calc(1 + var(--mouth, 0) * .1)); }
    @keyframes natter { from { transform: translateY(0) scale(1, 1); } to { transform: translateY(-3px) scale(1.03, 1.06); } }
    /* happy: a little hop – the mouth stays closed, it only opens when she speaks */
    .av.happy { animation: hop .5s ease; }
    .av.listen::before, .av.listen::after { content: ""; position: absolute; inset: 4%; border-radius: 30%; border: 2px solid var(--c); animation: ripple 1.5s ease-out infinite; }
    .av.listen::after { animation-delay: .75s; }
    /* the blob: blobatar's own motion (breathing, bobbing, blinking, glances); the eyes travel ~3 units after the cursor */
    .av.blob .mo-eyes { --mo-track-travel: 3px; }
    .av.blob.listen::before, .av.blob.listen::after { border-radius: 50%; }

    /* ---------- launcher ---------- */
    .launch { position: relative; display: flex; align-items: center; gap: 12px; border: none; background: none; padding: 0; animation: dropin .6s cubic-bezier(.34,1.56,.64,1) both; }
    .launch .av { animation: bob 3.2s ease-in-out infinite; }
    .launch-label { order: -1; padding: 11px 18px; border-radius: var(--rpill, 999px); font-family: var(--bfont, var(--font)); text-transform: var(--btt, none); letter-spacing: var(--bls, normal); font-size: 14.5px; font-weight: 650; color: var(--ink);
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
    .gbtn { width: 36px; height: 36px; border-radius: var(--rpill, 50%); border: 1px solid var(--edge); background: var(--glass); color: var(--ink); display: grid; place-items: center; font-size: 17px; transition: background .2s, transform .2s; }
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
    .g-btn { display: flex; align-items: center; justify-content: center; gap: 8px; height: 46px; border-radius: var(--rc); font-family: var(--bfont, var(--font)); text-transform: var(--btt, none); letter-spacing: var(--bls, normal); border: 0; font-size: 15px; font-weight: 600;
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
    .chip { padding: 8px 14px; border-radius: var(--rc); font-family: var(--bfont, var(--font)); text-transform: var(--btt, none); letter-spacing: var(--bls, normal); font-size: 14px; font-weight: 600; color: var(--ink);
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
    .cards-wrap { position: relative; align-self: stretch; flex: none; min-width: 0; }
    .cards { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 10px; scrollbar-width: none; scroll-snap-type: x proximity; }
    .cards::-webkit-scrollbar { display: none; }
    .cards.drag { scroll-snap-type: none; cursor: grabbing; user-select: none; }
    .cards.drag .pc { pointer-events: none; }
    /* the row hides its scrollbar, so a mouse needs arrows (touch screens just swipe) */
    .cards-nav { position: absolute; top: calc(50% - 22px); z-index: 2; width: 34px; height: 34px; border-radius: 50%; border: none; padding: 0; cursor: pointer;
      display: grid; place-items: center; background: #fff; color: #151a3a; box-shadow: 0 6px 18px rgba(15,21,34,.28), 0 0 0 1px var(--edge); transition: transform .2s; }
    .cards-nav:hover { transform: scale(1.08); }
    .cards-nav.prev { left: -6px; } .cards-nav.next { right: -6px; }
    .cards-nav[hidden] { display: none; }
    @media (hover: none) { .cards-nav { display: none; } }
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
    .add { font-family: var(--bfont, var(--font)); text-transform: var(--btt, none); letter-spacing: var(--bls, normal); margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; font-weight: 700; padding: 9px 6px; border-radius: var(--rc); border: none; color: #fff;
      background: linear-gradient(120deg, var(--c), var(--c2)); transition: transform .2s, filter .2s; }
    .add:hover { transform: translateY(-1px); filter: brightness(1.08); }
    .add:disabled { background: #22b573; }
    .add.done { animation: popin .4s cubic-bezier(.34,1.56,.64,1); }

    /* input: capsule with a slowly rotating gradient edge */
    .input { position: relative; margin: 4px 14px 14px; border-radius: var(--rpill, 999px); padding: 1.5px; overflow: hidden; }
    .input::before { content: ""; position: absolute; left: 50%; top: 50%; width: 700px; height: 700px; margin: -350px 0 0 -350px;
      background: conic-gradient(var(--c), var(--c2), var(--c3), var(--c)); animation: spin 5s linear infinite; opacity: .4; transition: opacity .3s; }
    .input:focus-within::before { opacity: 1; }
    .field { position: relative; display: flex; align-items: flex-end; gap: 6px; padding: 6px; border-radius: calc(var(--rpill, 999px) - 1px); background: var(--bg2); }
    .field textarea { flex: 1; resize: none; border: none; background: none; color: var(--strong); font-size: 15px; line-height: 20px; padding: 9px 0; height: 38px; max-height: 110px; outline: none; }
    .field textarea::placeholder { color: var(--ph); }
    .send { width: 38px; height: 38px; border-radius: var(--rpill, 50%); border: none; color: #fff; display: grid; place-items: center; font-size: 18px; flex: none;
      background: linear-gradient(135deg, var(--c), var(--c2)); box-shadow: 0 6px 16px ${mix("--c2", 40)}; transition: transform .2s cubic-bezier(.34,1.56,.64,1); }
    .send:hover { transform: scale(1.1) rotate(-8deg); }
    .send:disabled { opacity: .45; cursor: default; transform: none; }
    .send.fly svg { animation: launch .5s cubic-bezier(.5,0,.3,1); }

    /* attachments */
    .attach { width: 38px; height: 38px; flex: none; border: 0; border-radius: 50%; background: none; color: var(--soft); display: grid; place-items: center; font-size: 19px; transition: background .15s, color .15s; }
    .attach:hover { background: var(--glass); color: var(--strong); }
    .tray { display: flex; gap: 8px; padding: 6px 18px 2px; overflow-x: auto; scrollbar-width: none; }
    .tray[hidden] { display: none; }
    .att { position: relative; flex: none; height: 56px; border-radius: 12px; border: 1px solid var(--edge); background: var(--glass); animation: popin .3s cubic-bezier(.34,1.56,.64,1) both; }
    .att.image { width: 56px; } .att img { width: 100%; height: 100%; object-fit: cover; border-radius: 11px; display: block; }
    .att.pdf { display: flex; align-items: center; gap: 7px; max-width: 190px; padding: 0 28px 0 12px; font-size: 13px; color: var(--strong); }
    .att.pdf svg { flex: none; font-size: 18px; color: var(--c); } .att.pdf span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .att.loading { width: 56px; background: linear-gradient(90deg, var(--glass) 30%, ${mix("--c", 18)} 50%, var(--glass) 70%); background-size: 200% 100%; animation: shimmer 1.1s linear infinite; }
    .att .rm { position: absolute; top: -6px; right: -6px; width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--bg2); background: var(--strong); color: var(--bg2); display: grid; place-items: center; font-size: 11px; padding: 0; }
    .m .files { display: flex; flex-wrap: wrap; gap: 6px; margin: -2px -6px 8px; }
    .m.only-files .files { margin-bottom: -2px; }
    .m .files img { width: 132px; height: 132px; object-fit: cover; border-radius: 12px; display: block; }
    .m .fchip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,.2); font-size: 13.5px; font-weight: 600; }
    .panel.dropping::after { content: "${L("drop")}"; position: absolute; inset: 8px; border-radius: inherit; border: 2px dashed var(--c); background: ${mix("--c", 10)};
      display: grid; place-items: center; font-weight: 700; color: var(--c); pointer-events: none; z-index: 5; }

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
      .panel { position: fixed; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom)); width: auto; height: min(560px, 70vh); height: min(560px, 70dvh);
        border-radius: 22px; transform-origin: bottom center; animation: sheet .38s cubic-bezier(.2,.9,.3,1) both; }
      .head { padding: 12px 10px 10px 14px; }
      .msgs { padding: 14px 14px 12px; overscroll-behavior: contain; }
      .m { max-width: 92%; }
      .cards { margin: 0 -14px; padding: 4px 14px 10px; scroll-snap-type: x mandatory; scroll-padding: 14px; }
      .pc { flex-basis: 158px; scroll-snap-align: start; }
      .input { margin: 4px 10px 10px; }
      .field textarea { font-size: 16px; } /* under 16px iOS zooms the page in when typing */
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
  const fmtPrice = (n) => (UI_LANG === "en" ? n.toLocaleString("en-GB") + " CZK" : n.toLocaleString("cs-CZ") + " Kč");
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

  // ---------------------------------------------------- the blob mascot ----
  // Sella's own mascot (blobatar, MIT – public/vendor/blobatar): its shape, eyes and way of moving come
  // from her name, so every shop's assistant is one of a kind and always the same; its colour is the
  // website's. It breathes, bobs, blinks, glances about, follows the cursor and makes faces as she thinks
  // or is pleased. Loaded next to the widget; if it can't be, she is the tile with a letter as before.
  let Blob = null;
  const BLOB_EXPR = { think: "thinking", happy: "happy", listen: "surprised" };
  const wantsBlob = () => { const d = opts(); return d.avatar !== "logo" && !d.avatarImage && !d.letter; };
  function loadBlob() {
    if (window.SellaBlob) return Promise.resolve(setupBlob(window.SellaBlob));
    return new Promise((done) => {
      const s = document.createElement("script");
      s.src = cfg.api + "/vendor/blobatar/blobatar.js";
      s.onload = () => done(setupBlob(window.SellaBlob));
      s.onerror = () => done(null);
      document.head.append(s);
      setTimeout(() => done(null), 4000); // never keep the page waiting for her
    });
  }
  function setupBlob(lib) {
    if (!lib || Blob) return Blob;
    const css = lib.motionCss + lib.gazeCss;
    // @property doesn't work inside the widget's shadow root: registered for the page instead (all named --mo-*),
    // so her expressions morph smoothly instead of jumping
    for (const [, name, body] of css.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g)) {
      const get = (k) => body.match(new RegExp(`${k}\\s*:\\s*"?([^;"]*)"?`))?.[1]?.trim();
      try { CSS.registerProperty({ name, syntax: get("syntax") || "*", inherits: get("inherits") === "true", initialValue: get("initial-value") }); } catch {}
    }
    const style = document.createElement("style");
    style.textContent = css.replace(/@property\s+--[\w-]+\s*\{[^}]*\}/g, "");
    root.append(style);
    return (Blob = lib);
  }
  const blobSeed = () => cfg.name || AV?.brand || "Sella";
  function blobParts(mood) {
    return Blob.parts(blobSeed(), { palette: { head: AV.head, eye: AV.eye }, animate: "always", expression: Blob.expressions[BLOB_EXPR[mood]] });
  }
  function blobAvatar(size, live, mood) {
    const p = blobParts(mood);
    return `
    <span class="av blob nomouth ${mood}" style="--s:${size}px" data-seed="${esc(blobSeed())}" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <ellipse cx="51" cy="98" rx="30" ry="3.2" fill="rgba(15,24,73,.14)"/>
        <g class="mover"><g class="${p.cls}" style="${esc(Blob.serializeVars(p.vars ?? {}))}">${p.inner}</g></g>
      </svg>
      <span class="orbit"><b></b><b></b><b></b></span>
      ${live ? `<span class="live"></span>` : ""}
    </span>`;
  }
  /** The blob in a mood: its expression morphs (and a changed name gives it its own shape). */
  function poseBlob(av, mood) {
    const g = av.querySelector(".mo-root");
    if (!g || !Blob) return;
    const seed = blobSeed(), p = blobParts(mood);
    if (av.dataset.seed !== seed) { av.dataset.seed = seed; g.innerHTML = p.inner; }
    g.setAttribute("class", p.cls);
    g.setAttribute("style", Blob.serializeVars(p.vars ?? {}));
  }
  // the eyes follow the cursor (blobatar's gaze); a mascot that left the page stops watching
  const gazes = new Map();
  function watchBlobs() {
    for (const [svg, g] of gazes) if (!svg.isConnected) { g.stop(); gazes.delete(svg); }
    for (const svg of root.querySelectorAll(".av.blob > svg")) if (!gazes.has(svg)) gazes.set(svg, Blob.gaze(svg, { target: "pointer" }));
  }

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
    const d = opts();
    const meta = (n) => document.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.content?.trim();
    const logo = findLogo();
    const pic = logo?.matches("img, svg") ? logo : logo?.querySelector("img, svg");
    const titleBrand = document.title.split(/\s[–—|\-·:]\s/)[0].trim();
    const brand = (d.brand || meta("og:site_name") || meta("application-name") || (titleBrand && titleBrand.length <= 30 ? titleBrand : "")
      || pic?.getAttribute("alt")?.replace(/\s*logo\s*/i, "") || location.hostname.replace(/^www\./, "").split(".")[0] || "Obchod").trim().slice(0, 40);

    // the blob, in the website's colour, with eyes that read on it
    if (Blob && !siteOnly && wantsBlob()) {
      const c = parseColor(theme.c1) || { r: 34, g: 136, b: 229 }, { h, s } = toHsl(c);
      return {
        brand, blob: true, letter: brand[0] || "A", shape: "free", face: "none", faceY: 0, faceScale: 1,
        base: hex(c), head: hex(c), eye: luminance(c) < 0.5 ? hsl(h, s * 0.3, 0.96) : hsl(h, s * 0.5, 0.12),
      };
    }

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
    if (!color) color = logoColor();
    if (!color) { const b = toHsl(parseColor(theme.c1)); color = parseColor(hsl(b.h, b.s, clamp(b.l - 0.12, 0.15, 0.4))); }
    // "The Green Dock" → G, not T
    letter = (letter || brand.replace(/^(the|a|an)\s+/i, "").replace(/[^\p{L}\p{N}]/gu, "")[0] || "A");

    const { h, s, l } = toHsl(color);
    const dark = l < 0.55; // light tiles get dark eyebrows/letter, dark tiles white ones
    const SHAPES = ["square", "circle", "triangle", "blob", "free"];
    return {
      brand, image, letter,
      // outline: a picture stays uncut unless a shape is chosen; a tile is a rounded square by default
      shape: SHAPES.includes(d.shape) && !(d.shape === "free" && !image) ? d.shape : image ? "free" : "square",
      face: ["full", "eyes", "none"].includes(d.face) ? d.face : "none", // a face only when the owner picks one
      faceY: clamp(Number(d.faceY) || 0, -30, 30), faceScale: clamp((Number(d.faceScale) || 100) / 100, 0.5, 1.5),
      hi: hsl(h, s, clamp(l + 0.19, 0, 0.7)), mid: hsl(h, s, clamp(l + 0.05, 0, 0.8)), base: hex(color), lo: hsl(h, s, clamp(l - 0.07, 0.04, 1)),
      ink: dark || image ? hsl(h, s, clamp(Math.min(l, 0.3) - 0.08, 0.03, 0.2)) : "#1b1f3b",
      glyph: dark ? "#fff" : "#1b1f3b",
    };
  }

  const TEE = "M42.6 29.6 L52.2 24.9 L52.2 42 L57.4 42 Q58.6 42 58.6 43.2 L58.6 48.3 Q58.6 49.5 57.4 49.5 L52.2 49.5 L52.2 57.4 Q52.2 60.4 55.2 60.4 L57.6 60.4 Q58.8 60.4 58.8 61.6 L58.8 66 Q58.8 67.1 57.6 67.3 Q55 67.7 52.6 67.7 Q42.6 67.7 42.6 57.8 L42.6 49.5 L37.6 49.5 Q36.4 49.5 36.4 48.3 L36.4 43.2 Q36.4 42 37.6 42 L42.6 42 Z";
  const MOUTH = "M31 70.5 Q47 74 63.6 70.4 Q62.4 87.6 46.4 87.6 Q33.2 87.2 31 70.5 Z";
  // the mascot's outlines (in a 100×100 drawing); the face is laid out per outline
  const SHAPE = {
    square: { d: "M29 4 H71 Q96 4 96 29 V71 Q96 96 71 96 H29 Q4 96 4 71 V29 Q4 4 29 4 Z", shine: "M11.5 27 Q12.5 11.5 28 9.6" },
    circle: { d: "M50 4 A46 46 0 1 1 49.99 4 Z", shine: "M17 30 Q24 15 39 10" },
    triangle: { d: "M50 6 C54 6 57 8 59 12 L94 80 C97 86 93 93 86 93 L14 93 C7 93 3 86 6 80 L41 12 C43 8 46 6 50 6 Z", shine: "M40 22 L47 11",
      face: { scale: 0.66, dy: 13 }, letter: { y: 47, size: 24 } },
    blob: { d: "M53 5 C77 5 96 21 95 48 C94 75 78 95 50 95 C23 95 5 79 5 53 C5 25 26 5 53 5 Z", shine: "M15 30 Q22 14 38 9" },
  };
  const avatar = (size, { live = false, mood = "" } = {}, blink = (Math.random() * 4).toFixed(2)) => {
    AV ??= detectPersona();
    if (AV.blob && Blob) return blobAvatar(size, live, mood);
    const n = ++avatarSeq, pic = !!AV.image, sh = SHAPE[AV.shape] || null; // null = a picture, uncut
    // on a picture the face sits a bit more to the centre and gets a light halo so it reads on any artwork
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
    const lt = sh?.letter || { y: 66, size: 42 };
    const glyph = AV.letter === "t" && AV.shape === "square"
      ? `<path d="${TEE}" fill="${AV.glyph}"/>`
      : `<text x="48" y="${lt.y}" text-anchor="middle" style="font: 900 ${lt.size}px 'Arial Black', Arial, sans-serif" fill="${AV.glyph}">${esc(AV.letter)}</text>`;
    const body = pic
      ? (sh ? `<g clip-path="url(#avc${n})"><path d="${sh.d}" fill="#fff"/><image href="${esc(AV.image)}" x="4" y="4" width="92" height="92" preserveAspectRatio="xMidYMid slice"/></g>
              <path d="${sh.d}" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1.2"/>`
            : `<image href="${esc(AV.image)}" x="3" y="3" width="94" height="94" preserveAspectRatio="xMidYMid meet"/>`)
      : `<path d="${sh.d}" fill="url(#avg${n})"/>
          <path d="${sh.d}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.2"/>
          <path d="${sh.shine}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.6" stroke-linecap="round"/>
          ${glyph}`;
    // the face: the outline's own placement × the owner's size and height
    const k = (sh?.face?.scale ?? 1) * AV.faceScale, dy = (sh?.face?.dy ?? 0) + AV.faceY;
    const faceAt = k === 1 && !dy ? "" : `transform="translate(${50 * (1 - k)} ${50 * (1 - k) + dy}) scale(${k})"`;
    const lipD = "M33.5 72.5 Q47 81 61.5 72";
    const mouth = `
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
          </g>`;
    const face = AV.face === "none" ? "" : `
          <g ${faceAt}>
            <g class="brow">${halo(browL, 3.8)}<path d="${browL}" fill="none" stroke="${AV.ink}" stroke-width="3.8" stroke-linecap="round"/></g>
            <g class="brow">${halo(browR, 3.8)}<path d="${browR}" fill="none" stroke="${AV.ink}" stroke-width="3.8" stroke-linecap="round"/></g>
            ${eye("l", ex1, ey + (pic ? 0 : 0.4), ex1 + 3)}
            ${eye("r", ex2, ey - (pic ? 0 : 0.7), ex2 - 3)}
            ${AV.face === "full" ? mouth : ""}
          </g>`;
    // without a mouth the whole mascot moves when it talks (see .av.nomouth)
    return `
    <span class="av ${mood}${AV.face === "full" ? "" : " nomouth"}" style="--s:${size}px" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="avg${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${AV.hi}"/><stop offset=".38" stop-color="${AV.mid}"/><stop offset=".72" stop-color="${AV.base}"/><stop offset="1" stop-color="${AV.lo}"/></linearGradient>
          <radialGradient id="avp${n}" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#2a3a8c"/><stop offset=".55" stop-color="#101850"/><stop offset="1" stop-color="#070a22"/></radialGradient>
          <clipPath id="avm${n}"><path d="${MOUTH}"/></clipPath>
          ${sh ? `<clipPath id="avc${n}"><path d="${sh.d}"/></clipPath>` : ""}
        </defs>
        <ellipse cx="52" cy="102" rx="38" ry="3.6" fill="rgba(15,24,73,.16)"/>
        <g class="mover"><g transform="rotate(-4.5 50 50)">
          ${body}
          ${face}
        </g></g>
      </svg>
      <span class="orbit"><b></b><b></b><b></b></span>
      ${live ? `<span class="live"></span>` : ""}
    </span>`;
  };

  // the agent's name belongs to the shop (set by the server per client), so every visitor meets the same one.
  // The cached name only makes the start instant – it is re-checked on every page load.
  // keep in step with lib/persona.js
  function personaName(shopName) {
    const b = String(shopName).replace(/^(the|a|an)\s+/i, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "");
    if (!b) return "Bip";
    return b[0].toUpperCase() + (b.slice(1).match(/[aeiouy]/i)?.[0] || "i").toLowerCase() + "ko";
  }
  let ttsServer = false; // true when the server has a natural neural voice (ElevenLabs)
  async function loadName() {
    AV ??= detectPersona();
    fetch(cfg.api + "/api/health").then((r) => r.json()).then((h) => { ttsServer = h.tts === "elevenlabs"; }).catch(() => {});
    const key = "agent-name:" + cfg.client;
    const cached = look.name || script.dataset.name || ls.get(key);
    // until the server answers: the same kind of name it makes from the shop's name (lib/persona.js)
    cfg.name = cached || personaName(AV.brand);
    const fresh = post("/api/persona", { brand: AV.brand })
      .then((r) => {
        integ = r?.integration || {};
        if (r?.name && !script.dataset.name && !look.name) { ls.set(key, r.name); cfg.name = r.name; }
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
    if (av.classList.contains("blob")) poseBlob(av, mood);
  };

  // eyes follow the cursor – a tiny thing that makes her feel present
  let eyeRaf = 0, mx = innerWidth / 2, my = innerHeight / 2;
  addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; if (!eyeRaf) eyeRaf = requestAnimationFrame(updateEyes); }, { passive: true });
  function updateEyes() {
    eyeRaf = 0;
    if (Blob) watchBlobs();
    for (const av of root.querySelectorAll(".av:not(.blob)")) {
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
      .replace(/(?<!\d)(\d+(?:[\s ]\d{3})*(?:,\d+)?[\s ]?(?:Kč|CZK|,-))/g, '<span class="kc">$1</span>')
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
  const launcher = el(`<button class="launch" aria-label="${L("open")}"></button>`); // face added at boot
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
  const who = (mood = "") => `<div class="who">${avatar(48, { mood })}<div><b>${esc(cfg.name)}</b><span>${L("role")}</span></div></div>`;

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
            <button class="x" data-m="no" aria-label="${L("close")}">${ICON.close}</button>
            <p class="g-name">${esc(cfg.name)}</p>
            <p class="g-text" id="aip-greet"></p>
            <div class="g-acts">
              <button class="g-btn pri" data-m="chat">${ICON.chat}${L("write")}</button>
              <button class="g-btn" data-m="voice">${ICON.mic}${L("talk")}</button>
              <button class="g-skip" data-m="no">${L("skip")}</button>
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

    const text = post("/api/proactive", { sessionId, trigger: "greeting", signals: signals() }).then((r) => { if (r.off) switchOff(); return r.greeting; }).catch(() => null);
    await jump.finished.catch(() => {});
    if (chosen) return;
    stage.querySelector(".greeter").classList.add("landed");
    updateEyes();
    greetingData = (await text) ?? { text: L("greet", cfg.name) };
    setAv(av, "talk");
    await typeInto(stage.querySelector(".g-text"), greetingData.text.replace(/\s*\p{Extended_Pictographic}️?/gu, ""));
    setAv(av, "idle");
  }

  function declineGreeting() {
    state.choice = "declined"; state.lastNudgeAt = Date.now(); saveState();
    api.track("offer_declined");
    // answer like a person would, then step back
    const quip = el(`<div class="quip" role="status">${L("quip")}</div>`);
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
        <button class="x gbtn" aria-label="${L("closeTip")}">${ICON.close}</button>
        ${who()}
        <p></p>
        ${n.product ? `<div class="prod"><img src="${esc(img(n.product.image))}" alt=""><div><b>${esc(n.product.name)}</b><span>${fmtPrice(n.product.price)}</span></div></div>` : ""}
        <div class="chips">${n.actions.map((a, i) => `<button class="chip ${i ? "" : "solid"}" data-i="${i}" style="--i:${i + 2}">${esc(a.label)}</button>`).join("")}${stuck ? `<button class="chip ghost" data-no style="--i:${n.actions.length + 2}">${L("notNow")}</button>` : ""}</div>
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
    if (off) return;
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
      const r = await post("/api/proactive", { sessionId, trigger: "tick", signals: signals() });
      if (r.off) return switchOff();
      if (r.nudge && !floatEl && !busy) showTip(r.nudge);
    } catch {} finally { checking = false; }
  }

  // ------------------------------------------------------------- panel ----
  let panel, msgs, footer;
  // rendered transcript, kept across close/reopen, mode switches and page loads within the visit
  const history = ss.get("history") || [];
  const saveHistory = () => ss.set("history", history.slice(-60));

  const MOOD_TEXT = { idle: L("idle"), think: L("think"), talk: L("typing"), speak: L("speak"), listen: L("listen"), happy: L("happy") };
  let happyTimer = null;
  /** Klára's mood drives her face in the header (and on the voice stage) plus the status line. */
  function setMood(mood, text) {
    if (!panel) return;
    if (mood !== "happy") clearTimeout(happyTimer);
    for (const av of panel.querySelectorAll(".head .av, .stage .av")) setAv(av, mood);
    const st = panel.querySelector(".status");
    st.classList.toggle("busy", mood !== "idle" && mood !== "happy");
    st.querySelector("span").textContent = text || (mode === "voice" && mood === "talk" ? L("speak") : MOOD_TEXT[mood]);
    if (mood === "happy") happyTimer = setTimeout(() => setMood(busy ? "think" : "idle"), 1600);
  }

  function openPanel(m, { fromGreeting = false, fromTip = false } = {}) {
    let note = null;
    if (m === "voice" && !Recognition) {
      m = "chat";
      note = L("noVoice");
    }
    mode = m;
    if (!state.choice) { state.choice = m; saveState(); }
    hideFloat();
    launcher.style.display = "none";
    if (!panel) buildPanel();
    renderFooter();
    if (note) addNote(note);
    if (!history.length && !fromTip) { // from a tip the customer's question goes straight in
      const opening = m === "voice"
        ? L("openVoice")
        : L(starters ? "openChatAny" : "openChat");
      addBubble("bot", opening);
      if (m === "chat") {
        const chips = [];
        if (fromGreeting && greetingData?.ask) chips.push({ label: greetingData.ask.replace(/\..*$/, ""), ask: greetingData.ask });
        if (starters) chips.push(...starters.slice(0, 3));
        else chips.push({ label: L("chipGift"), ask: L("askGift") }, { label: L("chipDeals"), ask: L("askDeals") }, { label: L("chipShip"), ask: L("askShip") });
        addChips(chips);
      }
    }
    if (mode === "voice") speak(history.length === 1 ? history[0].text : L("listening"), () => listen());
    else footer.querySelector("textarea")?.focus();
  }

  // on a phone the chat is a sheet over most of the screen
  const phone = matchMedia("(max-width: 480px)");

  function closePanel() {
    stopVoice();
    mode = null;
    panel?.remove();
    panel = null;
    launcher.style.display = "";
    state.lastNudgeAt = Date.now(); saveState();
  }

  function buildPanel() {
    panel = el(`
      <div class="panel glass" role="dialog" aria-label="${esc(L("panel", cfg.name))}">
        ${aurora}
        <div class="head">
          ${avatar(46)}
          <div class="title"><b>${esc(cfg.name)}</b><div class="status"><i></i><span>${MOOD_TEXT.idle}</span></div></div>
          <button class="gbtn" data-a="switch" title="${L("switchMode")}"></button>
          <button class="gbtn" data-a="close" title="${L("close")}">${ICON.close}</button>
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
      else if (h.role) msgs.append(bubbleEl(h.role, h.text, h.files));
    }
    // drop a photo or PDF anywhere on the chat window
    panel.addEventListener("dragover", (e) => { if (mode === "chat" && e.dataTransfer?.types.includes("Files")) { e.preventDefault(); panel.classList.add("dropping"); } });
    panel.addEventListener("dragleave", (e) => { if (!panel.contains(e.relatedTarget)) panel.classList.remove("dropping"); });
    panel.addEventListener("drop", (e) => {
      panel.classList.remove("dropping");
      if (mode !== "chat" || !e.dataTransfer?.files.length) return;
      e.preventDefault();
      addFiles(e.dataTransfer.files);
    });
    wrap.insertBefore(panel, launcher);
    updateEyes();
    scrollDown();
  }

  // ---- attachments: photos (shrunk in the browser before sending) and PDFs ----
  const MAX_FILES = 3, MAX_PDF = 2.5e6, MAX_SIDE = 1568; // 1568 px = the most the AI looks at anyway
  let pendingFiles = [], preparing = 0;
  const blobToB64 = (blob) => new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = fail;
    r.readAsDataURL(blob);
  });
  async function shrinkImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
      const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); // transparent PNGs get a white background
      g.drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
    } finally { URL.revokeObjectURL(url); }
  }
  async function addFiles(list) {
    for (const file of [...list]) {
      if (pendingFiles.length + preparing >= MAX_FILES) { addNote(L("maxFiles", MAX_FILES)); break; }
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (!isPdf && !file.type.startsWith("image/")) { addNote(L("fileType")); continue; }
      if (isPdf && file.size > MAX_PDF) { addNote(L("pdfBig")); continue; }
      preparing++; renderTray();
      try {
        if (isPdf) pendingFiles.push({ kind: "pdf", media_type: "application/pdf", name: file.name, data: await blobToB64(file) });
        else {
          const blob = await shrinkImage(file);
          pendingFiles.push({ kind: "image", media_type: "image/jpeg", name: file.name || "foto.jpg", data: await blobToB64(blob), thumb: URL.createObjectURL(blob) });
        }
      } catch { addNote(L("fileFail", file.name)); }
      finally { preparing--; renderTray(); }
    }
    footer?.querySelector("textarea")?.focus();
  }
  function renderTray() {
    const tray = footer?.querySelector(".tray");
    if (!tray) return;
    tray.hidden = !pendingFiles.length && !preparing;
    tray.innerHTML = pendingFiles.map((f, i) => `
      <div class="att ${f.kind}">${f.kind === "image" ? `<img src="${f.thumb}" alt="">` : `${ICON.file}<span>${esc(f.name)}</span>`}
        <button type="button" class="rm" data-i="${i}" aria-label="${L("rmFile")}">${ICON.close}</button></div>`).join("")
      + (preparing ? `<div class="att loading" aria-label="${L("loadingFile")}"></div>` : "");
    tray.querySelectorAll(".rm").forEach((b) => b.onclick = () => {
      const [f] = pendingFiles.splice(+b.dataset.i, 1);
      if (f?.thumb) URL.revokeObjectURL(f.thumb);
      renderTray();
    });
    const sb = footer.querySelector(".send");
    if (sb && !busy) sb.disabled = preparing > 0;
  }
  // files the customer sent, shown in their message bubble
  const filesHtml = (files = []) => files.length ? `<div class="files">${files.map((f) => f.kind === "image" && f.thumb
    ? `<img src="${f.thumb}" alt="${esc(f.name)}" onerror="this.remove()">` : `<span class="fchip">${ICON.file}${esc(f.name)}</span>`).join("")}</div>` : "";

  function renderFooter() {
    panel.querySelector('[data-a="switch"]').innerHTML = mode === "voice" ? ICON.keys : ICON.mic;
    if (mode === "voice") {
      footer.innerHTML = `
        <div class="stage">
          <button class="orbbtn" style="background:none;border:none;padding:0" title="${L("tapTalk")}">${avatar(118)}</button>
          <div class="vstat">${L("preparing")}</div>
          <div class="interim"></div>
          <button class="toChat">${ICON.keys} ${L("toChat")}</button>
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
        <div class="tray" hidden></div>
        <form class="input">
          <div class="field">
            <button class="attach" type="button" aria-label="${L("attach")}" title="${L("attachTitle")}">${ICON.clip}</button>
            <input type="file" accept="image/*,application/pdf" multiple hidden>
            <textarea rows="1" placeholder="${L("placeholder")}" maxlength="600" aria-label="${L("msgLabel")}"></textarea>
            <button class="send" type="submit" aria-label="Odeslat">${ICON.send}</button>
          </div>
        </form>
        <div class="legal">${L("legal")} · <a href="${esc(cfg.privacy)}" target="_blank" rel="noopener">${L("privacy")}</a></div>`;
      const form = footer.querySelector("form");
      const ta = form.querySelector("textarea");
      const picker = form.querySelector("input[type=file]");
      form.querySelector(".attach").onclick = () => picker.click();
      picker.onchange = () => { addFiles(picker.files); picker.value = ""; };
      // a screenshot pasted straight into the message box works too
      ta.onpaste = (e) => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); addFiles(files); } };
      ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
      ta.oninput = () => { ta.style.height = "38px"; ta.style.height = Math.min(ta.scrollHeight, 110) + "px"; lastChatActivity = Date.now(); };
      form.onsubmit = (e) => {
        e.preventDefault();
        const text = ta.value.trim();
        if ((!text && !pendingFiles.length) || busy || preparing) return;
        ta.value = ""; ta.style.height = "38px";
        const sb = form.querySelector(".send");
        sb.classList.remove("fly"); void sb.offsetWidth; sb.classList.add("fly"); // restart the little launch animation
        const files = pendingFiles.splice(0);
        renderTray();
        send(text, { files });
      };
      renderTray();
    }
  }

  const scrollDown = () => { if (msgs) msgs.scrollTo({ top: msgs.scrollHeight, behavior: reduced ? "auto" : "smooth" }); };
  function bubbleEl(role, text, files) {
    const b = el(`<div class="m ${role === "me" ? "me" : role === "err" ? "err" : "bot"}"></div>`);
    if (role === "bot") b.innerHTML = md(text); else b.textContent = text;
    if (files?.length) { b.insertAdjacentHTML("afterbegin", filesHtml(files)); b.classList.toggle("only-files", !text); }
    return b;
  }
  function addBubble(role, text, files) {
    const entry = { role, text, ...(files?.length ? { files: files.map(({ kind, name, thumb }) => ({ kind, name, thumb })) } : {}) };
    history.push(entry);
    saveHistory();
    const b = bubbleEl(role, text, entry.files);
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
            <button class="add">${ICON.cart} ${L("addCart")}</button>
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
        btn.innerHTML = `${ICON.check} ${L("inCart")}`;
        btn.disabled = true;
        btn.classList.add("done");
        flyToCart(card.querySelector(".img img"));
        setMood("happy");
      };
      box.append(card);
    });
    return scrollable(box);
  }

  // The card row scrolls sideways: arrows (shown only when there is more to see) and dragging with
  // the mouse – a mouse wheel scrolls only up and down, so without them the last cards were unreachable.
  function scrollable(box) {
    const wrap = el(`<div class="cards-wrap"></div>`);
    const arrow = (dir) => el(`<button class="cards-nav ${dir}" type="button" aria-label="${L(dir === "prev" ? "prevCards" : "nextCards")}" hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}"/></svg></button>`);
    const prev = arrow("prev"), next = arrow("next");
    wrap.append(prev, box, next);
    const sync = () => {
      prev.hidden = box.scrollLeft < 4;
      next.hidden = box.scrollLeft + box.clientWidth >= box.scrollWidth - 4;
    };
    const step = (sign) => box.scrollBy({ left: sign * Math.max(box.clientWidth * 0.8, 160), behavior: reduced ? "auto" : "smooth" });
    prev.onclick = () => step(-1);
    next.onclick = () => step(1);
    box.addEventListener("scroll", sync, { passive: true });
    if (typeof ResizeObserver === "function") new ResizeObserver(sync).observe(box);
    requestAnimationFrame(sync);

    let drag = null;
    box.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, left: box.scrollLeft, moved: false };
    });
    addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      drag.moved = true;
      box.classList.add("drag");
      box.scrollLeft = drag.left - dx;
    });
    addEventListener("pointerup", () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      box.classList.remove("drag");
      // a drag isn't a click on the card it ended over
      if (moved) box.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); }, { capture: true, once: true });
    });
    return wrap;
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
  async function send(text, { via, files = [] } = {}) {
    busy = true;
    let closeAfter = false; // the customer asked her to switch off – close once she has said goodbye
    const ctrl = new AbortController();
    chatAbort = ctrl;
    lastChatActivity = Date.now();
    const sendBtn = footer?.querySelector(".send");
    if (sendBtn) sendBtn.disabled = true;
    msgs?.querySelectorAll(":scope > .chips").forEach((c) => c.remove());
    addBubble("me", text, files);
    const typing = el(`<div class="thinking">${avatar(26, { mood: "think" })}<span class="shimmer">${esc(L("thinking", cfg.name))}</span></div>`);
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
      // what is in the shop's cart right now (on shops we only watch, read off the page; at most 1.5 s)
      if (!hostIntegrated()) await Promise.race([syncCartFromPage().catch(() => {}), sleep(1500)]);
      const res = await fetch(cfg.api + "/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // the transcript so far (without this message) travels along, so the conversation survives
        // even if the server is a fresh serverless instance that never saw it
        body: JSON.stringify({ client: cfg.client, lang: UI_LANG, sessionId, text, context: signals({ via, ...pageNow(), history: history.filter((h) => h.role === "me" || h.role === "bot").slice(0, -1).slice(-12).map((h) => ({ role: h.role === "me" ? "user" : "assistant", text: (h.text + (h.files?.length ? ` [${L("attached")}: ${h.files.map((x) => x.name).join(", ")}]` : "")).trim().slice(0, 2000) })) }),
          ...(files.length ? { attachments: files.map(({ kind, media_type, data }) => ({ kind, media_type, data })) } : {}) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || L("connFail"));
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
          } else if (ev.type === "off") {
            // the plan's messages ran out mid-conversation: say so, then step away
            addNote(L("offNote"));
            switchOff(2600);
          } else if (ev.type === "close") {
            closeAfter = true;
          } else if (ev.type === "cart_remove") {
            removeFromShopCart(ev.item).then((ok) => {
              addNote(L(ok ? "removed" : "removeOnPage", ev.item.name));
              const t = ok && cartTarget()?.getBoundingClientRect();
              if (t) burst(t.left + t.width / 2, t.top + t.height / 2, cartTarget());
            });
          } else if (ev.type === "cart") {
            if (addToShopCart(ev.item)) {
              addNote(L("added", ev.item.name));
              flyToCart(msgs.querySelector(`.pc[data-id="${CSS.escape(ev.item.id)}"] .img img`));
              setMood("happy");
            } else {
              addNote(L("addOnPage", ev.item.name));
            }
          } else if (ev.type === "replace") {
            turnEls.forEach((n) => n.remove());
            cur = addBubble("bot", ev.text);
            full = spoken = ""; stopSpeech();
            enqueueSpeech(ev.text);
          } else if (ev.type === "mode" && ev.offline && !state.offlineNoted) {
            state.offlineNoted = true; saveState();
            addNote(L("simple"));
          } else if (ev.type === "error") {
            addBubble("err", ev.message);
            if (mode === "voice") enqueueSpeech(ev.message);
          }
          scrollDown();
        }
      }
      flushSpeech(true);
    } catch (e) {
      if (e.name !== "AbortError") addBubble("err", e.message || L("connFail"));
    } finally {
      saveHistory(); // the streamed answer grew in place
      typing.remove();
      msgs?.querySelectorAll(".streaming").forEach((b) => b.classList.remove("streaming"));
      busy = false;
      lastChatActivity = Date.now();
      if (sendBtn) sendBtn.disabled = false;
      if (chatAbort === ctrl) chatAbort = null;
      if (closeAfter && !ctrl.signal.aborted) {
        // say goodbye first (out loud in voice mode), then step back into the corner
        if (mode === "voice") afterSpeech(() => setTimeout(closePanel, 300));
        else setTimeout(() => { if (panel && !busy) closePanel(); }, 1800);
      }
      // interrupted by voice → the interruption itself takes over listening
      else if (mode === "voice") { if (!ctrl.signal.aborted) afterSpeech(() => listen()); }
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
    vstat.textContent = { listening: L("vListening"), thinking: L("vThinking"), speaking: touchDevice ? L("vSpeakTouch") : L("vSpeak"), idle: L("vIdle") }[st];
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
  const STOP_WORDS = /\b(stop|stuj|pockej|pockejte|dost|moment|ticho|prestan|zadrz|wait|hold on|enough|quiet)\b/;
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
        const question = said.replace(/^\s*(stop|stůj|počkejte|počkej|dost|moment|ticho|přestaň|zadrž|wait|hold on|enough|quiet)[\s,.!]*/i, "").trim();
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
      if (e.error === "not-allowed" || e.error === "service-not-allowed") addNote(L("micDenied"));
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

  // A site drawn in the browser (React, Vue…) can still be an empty <div id="root"> at this point –
  // its colours and logo aren't there to read yet. Wait until links or buttons appear (at most 4 s).
  function contentReady() {
    const drawn = () => document.querySelectorAll("a[href], button").length >= 3;
    if (drawn()) return Promise.resolve();
    return new Promise((done) => {
      const mo = new MutationObserver(() => { if (drawn()) finish(); });
      const finish = () => { mo.disconnect(); clearTimeout(timer); requestAnimationFrame(() => done()); };
      const timer = setTimeout(finish, 4000);
      mo.observe(document.body, { childList: true, subtree: true });
    });
  }

  // The settings page's preview shows the assistant on a page built from this website's own look
  // (colours, font, buttons, logo, her name), so the owner sees her as customers do. Read without
  // the dashboard's settings – the preview adds the unsaved ones – and sent at most once a day.
  function reportLook() {
    // the server says when it last saved the look: sent when it has none or it is a day old, once per visit
    const key = "site-look:" + cfg.client;
    if (preview || ss.get(key) || Date.now() - (Date.parse(lookSavedAt) || 0) < 24 * 3600e3) return;
    let t, p;
    siteOnly = true;
    try { t = detectTheme(); p = detectPersona(); } catch { return; } finally { siteOnly = false; }
    const fonts = [...document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]')].map((l) => l.href);
    const look = {
      mode: t.mode, bg: t.bg, text: t.text, brand: t.c1, font: t.font, bfont: t.bfont, btt: t.btt, bls: t.bls, radius: t.r, fonts,
      logo: { image: p.image, letter: p.letter, color: p.base }, siteName: p.brand, name: cfg.name,
    };
    ss.set(key, true);
    post("/api/site-look", { look }).catch(() => {});
  }

  async function boot() {
    // is the shop's assistant on? Off when its plan's messages for the month are used up, and when the
    // server refuses the shop (not registered, not paid, or this website isn't one of its domains).
    // A passing server error or a network hiccup doesn't switch it off.
    const on = preview || await fetch(`${cfg.api}/api/status?client=${encodeURIComponent(cfg.client || "")}&lang=${UI_LANG}`).then(async (r) => {
      if (r.ok) { const st = await r.json(); look = st.look || {}; lookSavedAt = st.lookSavedAt ?? null; if (look.name) cfg.name = look.name; if (Array.isArray(st.starters) && st.starters.length) starters = st.starters; return st.on !== false; }
      if (r.status >= 500 || r.status === 429) return true;
      console.warn("[Sella]", (await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      return false;
    }).catch(() => true);
    if (!on) { off = true; return; }
    const blobReady = wantsBlob() ? loadBlob() : null;
    await contentReady();
    theme = detectTheme();
    await blobReady;
    AV = detectPersona();
    nameReady = loadName();
    // the blob's shape comes from her name: once the server has confirmed it, she takes her own shape
    nameReady.then(() => root.querySelectorAll(".av.blob").forEach((av) => poseBlob(av, Object.keys(BLOB_EXPR).find((m) => av.classList.contains(m)) || "")));
    const pageReady = autoInit().catch(() => {});
    launcher.innerHTML = avatar(60) + `<span class="launch-label">${L("launch")}</span>`;
    nameReady.then(() => { launcher.setAttribute("aria-label", L("openNamed", cfg.name)); reportLook(); });
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
