/*
 * AI Prodavač – embeddable widget
 *
 * Usage on any website:
 *   <script src="https://YOUR-SERVER/widget/prodavac.js"
 *           data-name="Klára" data-color="#1a8f4c" data-greet-delay="1.2" defer></script>
 *
 * Integration hooks (set by the host shop, all optional):
 *   AIProdavac.getContext    = () => ({ pageType, category, currentProductId, viewedProductIds, cart:[{id,quantity}] })
 *   AIProdavac.onAddToCart   = (item) => { ... }     // item: {id,name,price,quantity}
 *   AIProdavac.onOpenProduct = (id) => { ... }
 *   AIProdavac.track(type, data)                     // behaviour events: page_view, product_view, search{query,results}, add_to_cart, purchase
 */
(() => {
  if (window.AIProdavac?.__loaded) return;

  const script = document.currentScript;
  const cfg = {
    api: script?.dataset.api || new URL(script?.src || location.href).origin,
    name: script?.dataset.name || "Klára",
    color: script?.dataset.color || "#1a8f4c",
    greetDelay: Number(script?.dataset.greetDelay ?? 1.2) * 1000,
    lang: script?.dataset.lang || "cs-CZ",
  };

  // ------------------------------------------------------------- state ----
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem("aip_" + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("aip_" + k, JSON.stringify(v)); } catch {} },
  };
  const ss = {
    get(k) { try { return JSON.parse(sessionStorage.getItem("aip_" + k)); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem("aip_" + k, JSON.stringify(v)); } catch {} },
  };
  let sessionId = ss.get("sid");
  const isNewSession = !sessionId;
  if (!sessionId) {
    sessionId = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/[^\w-]/g, "");
    ss.set("sid", sessionId);
    ls.set("visits", (ls.get("visits") || 0) + 1);
  }
  const returning = (ls.get("visits") || 1) > 1;

  // per-session memory of how the customer reacted
  const state = Object.assign({ greeted: false, choice: null, shown: [], nudgeCount: 0, lastNudgeAt: 0, cooldown: 35e3, offlineNoted: false }, ss.get("state") || {});
  const saveState = () => ss.set("state", state);

  const api = (window.AIProdavac = window.AIProdavac || {});
  api.__loaded = true;
  let mode = null;          // "chat" | "voice" | null (panel closed)
  let busy = false;
  let lastChatActivity = 0;

  // ------------------------------------------------ behaviour tracking ----
  let pageStart = Date.now();
  const searches = ss.get("searches") || [];
  let queue = [];
  let flushTimer = null;
  api.track = (type, data = {}) => {
    if (type === "page_view") pageStart = Date.now();
    if (type === "search") { searches.push({ q: data.query, results: data.results }); ss.set("searches", searches.slice(-5)); }
    queue.push({ type, ...data });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 800);
    // a real salesperson reacts to what just happened – re-check soon
    if (["search", "add_to_cart", "product_view", "category_view", "page_view"].includes(type)) scheduleCheck(2500);
  };
  function flush() {
    if (!queue.length) return;
    const body = JSON.stringify({ sessionId, events: queue });
    queue = [];
    const url = cfg.api + "/api/events";
    if (!navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  }
  addEventListener("pagehide", flush);
  if (isNewSession) api.track("session_start");

  function signals(extra = {}) {
    let c = {};
    try { c = api.getContext?.() || {}; } catch {}
    return {
      pageType: c.pageType, category: c.category, currentProductId: c.currentProductId,
      viewedProductIds: c.viewedProductIds, cart: c.cart,
      searches: searches.slice(-5), secondsOnPage: Math.round((Date.now() - pageStart) / 1000),
      returning, declined: state.choice === "declined", shown: state.shown, mode, ...extra,
    };
  }
  const post = (path, body) => fetch(cfg.api + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

  // -------------------------------------------------------------- DOM ----
  const host = document.createElement("div");
  host.id = "ai-prodavac";
  const root = host.attachShadow({ mode: "open" });
  const C = cfg.color;
  root.innerHTML = `
  <style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
    button { font: inherit; cursor: pointer; }
    .launcher { position: relative; height: 56px; border-radius: 28px; border: none; background: ${C}; color: #fff; padding: 0 20px 0 6px;
      display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; box-shadow: 0 6px 20px rgba(0,0,0,.25); transition: transform .15s; }
    .launcher:hover { transform: translateY(-2px); }
    .launcher .avatar { width: 44px; height: 44px; background: #fff; color: ${C}; }
    .dot { position: absolute; left: 38px; top: 8px; width: 11px; height: 11px; border-radius: 50%; background: #3ddc84; border: 2px solid ${C}; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: ${C}; color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 17px; flex: none; }
    .card { width: 350px; background: #fff; color: #1d2320; border-radius: 18px; padding: 16px; box-shadow: 0 12px 40px rgba(0,0,0,.22); animation: pop .35s ease-out; position: relative; }
    .card .who { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .card .who b { display: block; font-size: 15px; } .card .who span { font-size: 12px; color: #6a716d; }
    .card p { margin: 0 0 14px; font-size: 15px; line-height: 1.5; }
    .x { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; border-radius: 50%; border: none; background: #f0f2f0; color: #555; font-size: 13px; }
    .choices { display: grid; gap: 8px; }
    .choices .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .choice { border: 1.5px solid ${C}; background: #fff; color: ${C}; border-radius: 12px; padding: 11px 12px; font-size: 14.5px; font-weight: 700; }
    .choice.primary { background: ${C}; color: #fff; }
    .choice.ghost { border-color: #e1e4e1; color: #4b524e; font-weight: 500; }
    .choice:hover { filter: brightness(.95); }
    .tip { width: 320px; padding: 14px; }
    .tip p { font-size: 14px; margin-bottom: 10px; }
    .tip .prod { display: flex; gap: 10px; align-items: center; background: #f6f7f6; border-radius: 12px; padding: 8px; margin-bottom: 10px; }
    .tip .prod img { width: 48px; height: 48px; border-radius: 8px; background: #fff; }
    .tip .prod b { font-size: 13px; display: block; } .tip .prod span { font-size: 13px; font-weight: 700; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { border: 1.5px solid ${C}; background: #fff; color: ${C}; border-radius: 16px; padding: 6px 12px; font-size: 13px; font-weight: 600; }
    .chip:hover { background: ${C}; color: #fff; }
    .typing span { display: inline-block; width: 7px; height: 7px; margin: 0 2px; border-radius: 50%; background: #9aa19d; animation: blink 1.2s infinite; }
    .typing span:nth-child(2) { animation-delay: .2s } .typing span:nth-child(3) { animation-delay: .4s }
    .panel { width: 390px; height: min(640px, calc(100vh - 100px)); background: #fff; color: #1d2320; border-radius: 18px; overflow: hidden;
      box-shadow: 0 14px 44px rgba(0,0,0,.25); display: flex; flex-direction: column; animation: pop .3s ease-out; }
    .head { background: ${C}; color: #fff; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
    .head .avatar { background: #fff; color: ${C}; }
    .head .title { flex: 1; line-height: 1.25; }
    .head .title b { display: block; font-size: 15px; }
    .head .title span { font-size: 12px; opacity: .9; }
    .icon { background: rgba(255,255,255,.16); border: none; color: #fff; width: 34px; height: 34px; border-radius: 10px; font-size: 16px; }
    .icon:hover { background: rgba(255,255,255,.3); }
    .msgs { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: #f5f6f5; }
    .bubble { max-width: 86%; padding: 10px 13px; border-radius: 16px; font-size: 14.5px; line-height: 1.5; word-wrap: break-word; }
    .bubble p { margin: 0 0 6px; } .bubble p:last-child { margin: 0; }
    .bubble ul { margin: 4px 0; padding-left: 18px; }
    .bot { background: #fff; align-self: flex-start; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
    .me { background: ${C}; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
    .err { background: #fdecea; color: #8a1c12; align-self: stretch; font-size: 13px; }
    .msgs > .chips { align-self: flex-start; }
    .cards { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; align-self: stretch; flex: none; }
    .pcard { flex: 0 0 160px; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); display: flex; flex-direction: column; }
    .pcard .img { height: 104px; display: grid; place-items: center; position: relative; background: #fff; }
    .pcard .img img { height: 96px; }
    .badge { position: absolute; top: 6px; left: 6px; background: #e0282e; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 6px; }
    .pcard .body { padding: 8px; display: flex; flex-direction: column; gap: 3px; flex: 1; border-top: 1px solid #eee; }
    .pcard .name { font-size: 12.5px; font-weight: 600; line-height: 1.25; color: #0b5cad; cursor: pointer; }
    .pcard .hl { font-size: 11.5px; color: #6a716d; }
    .pcard .price { font-size: 15px; font-weight: 800; }
    .pcard .old { font-size: 11.5px; color: #8a918d; text-decoration: line-through; font-weight: 400; margin-left: 4px; }
    .pcard .add { margin-top: auto; font-size: 12.5px; padding: 7px 4px; border-radius: 8px; border: none; background: ${C}; color: #fff; font-weight: 700; }
    .pcard .add:disabled { background: #8fbfa3; }
    .note { align-self: center; font-size: 12px; color: #6a716d; background: #e9ece9; padding: 4px 10px; border-radius: 10px; text-align: center; }
    .input { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #e3e6e3; background: #fff; }
    .input textarea { flex: 1; resize: none; border: 1px solid #d4d9d5; border-radius: 12px; padding: 10px 12px; font-size: 14.5px; height: 44px; max-height: 110px; outline: none; }
    .input textarea:focus { border-color: ${C}; }
    .send { width: 44px; height: 44px; border-radius: 12px; border: none; background: ${C}; color: #fff; font-size: 18px; }
    .send:disabled { opacity: .5; cursor: default; }
    .voice { padding: 16px 14px 18px; border-top: 1px solid #e3e6e3; background: #fff; display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .orb { width: 78px; height: 78px; border-radius: 50%; border: none; background: ${C}; color: #fff; font-size: 30px; }
    .orb.listening { animation: pulse 1.4s infinite; }
    .orb.thinking { opacity: .7; animation: breathe 1.2s infinite; }
    .orb.speaking { animation: speak .5s infinite alternate; }
    .status { font-size: 13px; color: #4b524e; min-height: 18px; text-align: center; }
    .interim { font-size: 13px; color: #8a918d; font-style: italic; min-height: 16px; text-align: center; }
    .toChat { background: none; border: none; color: ${C}; font-size: 13px; text-decoration: underline; }
    @keyframes pop { from { opacity: 0; transform: translateY(12px) scale(.97); } to { opacity: 1; transform: none; } }
    @keyframes blink { 0%, 80%, 100% { opacity: .25 } 40% { opacity: 1 } }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 ${C}88 } 100% { box-shadow: 0 0 0 22px ${C}00 } }
    @keyframes breathe { 50% { transform: scale(.92) } }
    @keyframes speak { to { transform: scale(1.08) } }
    .overlay { position: fixed; inset: 0; z-index: 2147483001; background: rgba(12, 22, 38, .5); backdrop-filter: blur(3px);
      display: grid; place-items: center; padding: 16px; animation: fade .25s ease-out; }
    .modal { position: relative; width: min(460px, 100%); background: #fff; color: #1d2320; border-radius: 22px; padding: 30px 26px 18px;
      box-shadow: 0 24px 70px rgba(0,0,0,.35); text-align: center; animation: pop .35s ease-out; }
    .m-avatar { position: relative; width: 76px; height: 76px; margin: 0 auto 10px; border-radius: 50%; background: ${C}; color: #fff;
      display: grid; place-items: center; font-size: 34px; font-weight: 800; box-shadow: 0 0 0 6px ${C}22; }
    .m-dot { position: absolute; right: 2px; bottom: 4px; width: 16px; height: 16px; border-radius: 50%; background: #3ddc84; border: 3px solid #fff; }
    .m-name { font-weight: 800; font-size: 17px; } .m-name span { font-weight: 400; color: #6a716d; }
    .m-text { font-size: 16px; line-height: 1.5; margin: 12px 4px 20px; min-height: 48px; }
    .m-choices { display: grid; gap: 10px; text-align: left; }
    .m-choice { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-radius: 14px; border: 1.5px solid ${C}; background: #fff; color: #1d2320; transition: transform .1s, box-shadow .15s; }
    .m-choice:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,.1); }
    .m-choice .ic { font-size: 24px; width: 32px; text-align: center; flex: none; }
    .m-choice b { display: block; font-size: 15.5px; } .m-choice small { color: #6a716d; font-size: 13px; }
    .m-choice.primary { background: ${C}; border-color: ${C}; color: #fff; } .m-choice.primary small { color: #ffffffcc; }
    .m-choice.ghost { border-color: #e1e4e1; }
    .m-foot { font-size: 11.5px; color: #8a918d; margin-top: 14px; }
    .modal .x { top: 14px; right: 14px; }
    @keyframes fade { from { opacity: 0 } }
    @media (max-width: 480px) {
      .wrap { right: 10px; bottom: 10px; left: 10px; }
      .panel { width: 100%; height: calc(100vh - 80px); }
      .card, .tip { width: 100%; }
    }
  </style>
  <div class="wrap"></div>`;
  const wrap = root.querySelector(".wrap");
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmtPrice = (n) => n.toLocaleString("cs-CZ") + " Kč";
  const img = (src) => (src?.startsWith("/") ? cfg.api + src : src);
  const initial = cfg.name[0]?.toUpperCase() || "A";

  // minimal, safe markdown: **bold**, "- " lists, paragraphs
  function md(text) {
    const blocks = esc(text.trim()).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split(/\n{2,}/);
    return blocks.map((b) => {
      const lines = b.split("\n");
      if (lines.every((l) => /^\s*[-•*] /.test(l))) return "<ul>" + lines.map((l) => `<li>${l.replace(/^\s*[-•*] /, "")}</li>`).join("") + "</ul>";
      return `<p>${lines.join("<br>")}</p>`;
    }).join("");
  }

  // ---------------------------------------------------------- launcher ----
  const launcher = el(`<button class="launcher" aria-label="Otevřít prodavačku"><span class="avatar">${initial}</span><span class="dot"></span>Poradit s nákupem</button>`);
  launcher.onclick = () => {
    hideFloat();
    api.track("assistant_opened");
    openPanel("chat");
  };

  // ------------------------------------------ floating cards (greeting / tips) ----
  let floatEl = null, floatTimer = null;
  function hideFloat() { clearTimeout(floatTimer); floatEl?.remove(); floatEl = null; }
  function showFloat(node, autoHideMs) {
    hideFloat();
    floatEl = node;
    wrap.insertBefore(node, launcher);
    if (autoHideMs) floatTimer = setTimeout(hideFloat, autoHideMs);
  }
  const who = () => `<div class="who"><div class="avatar">${initial}</div><div><b>${esc(cfg.name)}</b><span>prodavačka · AI asistentka</span></div></div>`;

  // Like a salesperson walking up to you: shows up right after you come in.
  let greetingData = null;
  // Arrival pop-up: centred over the page, the customer picks how they want to shop.
  async function greet() {
    if (state.greeted || mode) return;
    state.greeted = true; saveState();
    const overlay = el(`
      <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="aip-greet">
        <div class="modal">
          <button class="x" data-m="no" aria-label="Zavřít">✕</button>
          <div class="m-avatar">${initial}<span class="m-dot"></span></div>
          <div class="m-name">${esc(cfg.name)} <span>· prodavačka</span></div>
          <p class="m-text typing" id="aip-greet"><span></span><span></span><span></span></p>
          <div class="m-choices">
            <button class="m-choice primary" data-m="voice"><span class="ic">🎙️</span><span><b>Promluvit si s prodavačkou</b><small>Poradím vám hlasem, jako v obchodě</small></span></button>
            <button class="m-choice" data-m="chat"><span class="ic">💬</span><span><b>Napsat zprávu</b><small>Zeptejte se v chatu, odpovím hned</small></span></button>
            <button class="m-choice ghost" data-m="no"><span class="ic">👀</span><span><b>Děkuji, porozhlédnu se sám/sama</b><small>Kdybyste mě potřebovali, budu vpravo dole</small></span></button>
          </div>
          <div class="m-foot">Odpovídá AI asistentka · kdykoli ji můžete zavřít</div>
        </div>
      </div>`);
    root.append(overlay);
    overlay.querySelector('[data-m="chat"]').focus({ preventScroll: true });

    const close = () => { overlay.remove(); removeEventListener("keydown", onKey); };
    const choose = (m) => {
      close();
      if (m === "no") return declineGreeting();
      state.choice = m; saveState();
      api.track("offer_accepted", { mode: m });
      openPanel(m, { fromGreeting: true });
    };
    const onKey = (e) => { if (e.key === "Escape") choose("no"); };
    addEventListener("keydown", onKey);
    overlay.onclick = (e) => {
      if (e.target === overlay) return choose("no"); // click outside = "just browsing"
      const m = e.target.closest("[data-m]")?.dataset.m;
      if (m) choose(m);
    };
    api.track("offer_shown");

    try { greetingData = (await post("/api/proactive", { sessionId, trigger: "greeting", signals: signals() })).greeting; } catch {}
    greetingData ??= { text: `Dobrý den, vítejte! 👋 Jsem ${cfg.name}. Chcete s něčím poradit, nebo se radši porozhlédnete sami?` };
    await new Promise((r) => setTimeout(r, 500)); // a beat of "typing" feels human
    const p = overlay.querySelector(".m-text");
    p.classList.remove("typing");
    p.textContent = greetingData.text;
  }

  function declineGreeting() {
    state.choice = "declined"; state.lastNudgeAt = Date.now(); saveState();
    api.track("offer_declined");
    // answer like a person would, then step back
    const card = el(`<div class="card">${who()}<p>Jasně, v klidu se porozhlédněte. 🙂 Kdyby něco, jsem tady vpravo dole.</p></div>`);
    showFloat(card, 3500);
  }

  // Tips based on behaviour, e.g. a bundle deal the customer would miss.
  function showTip(n) {
    state.shown.push(n.id); state.nudgeCount++; state.lastNudgeAt = Date.now(); saveState();
    api.track("nudge_shown", { kind: n.kind });

    // chat already open → Klára just says it in the conversation
    if (mode === "chat" && panel) {
      addBubble("bot", n.text);
      if (n.product) addCards([n.product]);
      addChips(n.actions.map((a) => ({ label: a.label, ask: a.ask, via: n.text, kind: n.kind })));
      return;
    }
    const card = el(`
      <div class="card tip" role="status">
        <button class="x" aria-label="Zavřít tip">✕</button>
        ${who()}
        <p>${esc(n.text)}</p>
        ${n.product ? `<div class="prod"><img src="${esc(img(n.product.image))}" alt=""><div><b>${esc(n.product.name)}</b><span>${fmtPrice(n.product.price)}</span></div></div>` : ""}
        <div class="chips">${n.actions.map((a, i) => `<button class="chip" data-i="${i}">${esc(a.label)}</button>`).join("")}</div>
      </div>`);
    card.querySelector(".x").onclick = () => {
      api.track("nudge_dismissed", { kind: n.kind });
      state.cooldown = Math.min(state.cooldown * 2, 180e3); saveState(); // they don't want to be disturbed → back off
      hideFloat();
    };
    card.querySelectorAll(".chip").forEach((b) => (b.onclick = () => {
      const a = n.actions[Number(b.dataset.i)];
      api.track("nudge_clicked", { kind: n.kind });
      hideFloat();
      openPanel("chat");
      send(a.ask, { via: n.text });
    }));
    showFloat(card, 20000);
  }

  // ---- when is it OK to speak up? (never while the customer is mid-conversation) ----
  let checkTimer = null;
  function scheduleCheck(ms) { clearTimeout(checkTimer); checkTimer = setTimeout(checkNudge, ms); }
  setInterval(() => checkNudge(), 5000);

  let checking = false;
  async function checkNudge() {
    if (checking || busy || !state.greeted || document.visibilityState !== "visible") return;
    if (floatEl) return;                                             // something is already on screen
    if (!state.choice) return;                                       // greeting still unanswered
    if (mode === "voice") return;                                    // don't interrupt a spoken conversation
    if (mode === "chat" && Date.now() - lastChatActivity < 25e3) return; // they're talking to us already
    const max = state.choice === "declined" ? 2 : 5;
    if (state.nudgeCount >= max) return;
    const gap = state.choice === "declined" ? Math.max(state.cooldown, 60e3) : state.cooldown;
    if (Date.now() - state.lastNudgeAt < gap) return;
    checking = true;
    try {
      const { nudge } = await post("/api/proactive", { sessionId, trigger: "tick", signals: signals() });
      if (nudge && !floatEl && !busy) showTip(nudge);
    } catch {} finally { checking = false; }
  }

  // ------------------------------------------------------------- panel ----
  let panel, msgs, footer;
  const history = []; // rendered transcript kept across close/reopen and mode switches

  function openPanel(m, { fromGreeting = false } = {}) {
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
    renderFooter();
    if (note) addNote(note);
    if (!history.length) {
      const opening = m === "voice"
        ? "Výborně, poslouchám. Řekněte mi, co hledáte, nebo k čemu to budete potřebovat."
        : "Výborně! 🙂 Co hledáte? Klidně popište, k čemu to potřebujete – nebo vyberte:";
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
      <div class="panel" role="dialog" aria-label="Prodavačka ${esc(cfg.name)}">
        <div class="head">
          <div class="avatar">${initial}</div>
          <div class="title"><b>${esc(cfg.name)}</b><span>prodavačka · odpovídá umělá inteligence</span></div>
          <button class="icon" data-a="switch" title="Přepnout hlas / psaní"></button>
          <button class="icon" data-a="close" title="Zavřít">✕</button>
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
    scrollDown();
  }

  function renderFooter() {
    panel.querySelector('[data-a="switch"]').textContent = mode === "voice" ? "⌨️" : "🎙️";
    if (mode === "voice") {
      footer.innerHTML = `
        <div class="voice">
          <button class="orb" title="Klepněte pro mluvení / přerušení">🎙️</button>
          <div class="status">Připravuji…</div>
          <div class="interim"></div>
          <button class="toChat">Raději budu psát</button>
        </div>`;
      footer.querySelector(".orb").onclick = () => {
        if (speaking || listening) { stopVoice(); setVoiceState("idle"); } else listen();
      };
      footer.querySelector(".toChat").onclick = () => { stopVoice(); openPanel("chat"); };
    } else {
      footer.innerHTML = `
        <form class="input">
          <textarea rows="1" placeholder="Napište, co hledáte…" maxlength="600"></textarea>
          <button class="send" type="submit" aria-label="Odeslat">➤</button>
        </form>`;
      const form = footer.querySelector("form");
      const ta = form.querySelector("textarea");
      ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
      ta.oninput = () => { ta.style.height = "44px"; ta.style.height = Math.min(ta.scrollHeight, 110) + "px"; lastChatActivity = Date.now(); };
      form.onsubmit = (e) => {
        e.preventDefault();
        const text = ta.value.trim();
        if (!text || busy) return;
        ta.value = ""; ta.style.height = "44px";
        send(text);
      };
    }
  }

  const scrollDown = () => { if (msgs) msgs.scrollTop = msgs.scrollHeight; };
  function bubbleEl(role, text) {
    const b = el(`<div class="bubble ${role === "me" ? "me" : role === "err" ? "err" : "bot"}"></div>`);
    if (role === "bot") b.innerHTML = md(text); else b.textContent = text;
    return b;
  }
  function addBubble(role, text) {
    const entry = { role, text };
    history.push(entry);
    const b = bubbleEl(role, text);
    msgs?.append(b);
    scrollDown();
    return { entry, b };
  }
  const noteEl = (text) => el(`<div class="note">${esc(text)}</div>`);
  function addNote(text) { history.push({ kind: "note", text }); msgs?.append(noteEl(text)); scrollDown(); }
  function addCards(items) { history.push({ kind: "cards", items }); const c = renderCards(items); msgs?.append(c); scrollDown(); return c; }
  function addChips(chips) {
    const box = el(`<div class="chips"></div>`);
    for (const ch of chips) {
      const b = el(`<button class="chip">${esc(ch.label)}</button>`);
      b.onclick = () => {
        if (busy) return;
        box.remove();
        if (ch.kind) api.track("nudge_clicked", { kind: ch.kind });
        send(ch.ask, { via: ch.via });
      };
      box.append(b);
    }
    msgs?.append(box);
    scrollDown();
  }

  function renderCards(items) {
    const box = el(`<div class="cards"></div>`);
    for (const p of items) {
      const card = el(`
        <div class="pcard">
          <div class="img"><img src="${esc(img(p.image))}" alt="">${p.discountPercent ? `<span class="badge">−${p.discountPercent} %</span>` : ""}</div>
          <div class="body">
            <div class="name">${esc(p.name)}</div>
            ${p.highlights?.[0] ? `<div class="hl">${esc(p.highlights[0])}</div>` : ""}
            <div class="price">${fmtPrice(p.price)}${p.oldPrice ? `<span class="old">${fmtPrice(p.oldPrice)}</span>` : ""}</div>
            <button class="add">Do košíku</button>
          </div>
        </div>`);
      card.querySelector(".name").onclick = () => api.onOpenProduct?.(p.id);
      card.querySelector(".img").onclick = () => api.onOpenProduct?.(p.id);
      card.querySelector(".add").onclick = (e) => {
        api.onAddToCart?.({ id: p.id, name: p.name, price: p.price, quantity: 1 });
        api.track("add_to_cart", { productId: p.id, quantity: 1, source: "ai_card" });
        e.target.textContent = "✓ V košíku";
        e.target.disabled = true;
      };
      box.append(card);
    }
    return box;
  }

  // -------------------------------------------------------------- chat ----
  async function send(text, { via } = {}) {
    busy = true;
    lastChatActivity = Date.now();
    const sendBtn = footer?.querySelector(".send");
    if (sendBtn) sendBtn.disabled = true;
    msgs?.querySelectorAll(":scope > .chips").forEach((c) => c.remove());
    addBubble("me", text);
    const typing = el(`<div class="bubble bot typing"><span></span><span></span><span></span></div>`);
    msgs.append(typing);
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
        body: JSON.stringify({ sessionId, text, context: signals({ via }) }),
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
              turnEls.push(cur.b);
            }
            cur.entry.text += ev.delta;
            full += ev.delta;
            cur.b.innerHTML = md(cur.entry.text);
            flushSpeech(false);
          } else if (ev.type === "products") {
            turnEls.push(addCards(ev.items));
            cur = null;
          } else if (ev.type === "cart") {
            api.onAddToCart?.(ev.item);
            addNote(`🛒 Přidáno do košíku: ${ev.item.name}`);
          } else if (ev.type === "replace") {
            turnEls.forEach((n) => n.remove());
            cur = addBubble("bot", ev.text);
            full = spoken = ""; stopSpeech();
            enqueueSpeech(ev.text);
          } else if (ev.type === "mode" && ev.offline && !state.offlineNoted) {
            state.offlineNoted = true; saveState();
            addNote("Ukázkový režim bez AI – odpovědi jsou zatím zjednodušené.");
          } else if (ev.type === "error") {
            addBubble("err", ev.message);
            if (mode === "voice") enqueueSpeech(ev.message);
          }
          scrollDown();
        }
      }
      flushSpeech(true);
    } catch (e) {
      addBubble("err", e.message || "Spojení se nezdařilo.");
    } finally {
      typing.remove();
      busy = false;
      lastChatActivity = Date.now();
      if (sendBtn) sendBtn.disabled = false;
      if (mode === "voice") afterSpeech(() => listen());
    }
  }

  // ------------------------------------------------------------- voice ----
  // Browser-native speech (Web Speech API). Prototype-grade: in production
  // this can be swapped for a streaming STT/TTS provider for better voices.
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, speaking = false;
  let speechQueue = 0, afterSpeechCb = null;

  function setVoiceState(st) {
    const orb = footer?.querySelector(".orb");
    const status = footer?.querySelector(".status");
    if (!orb) return;
    orb.className = "orb " + st;
    orb.textContent = st === "speaking" ? "🔊" : st === "thinking" ? "…" : "🎙️";
    status.textContent = { listening: "Poslouchám…", thinking: "Přemýšlím…", speaking: "Mluvím… (klepnutím přerušíte)", idle: "Klepněte a mluvte" }[st];
  }

  function czechVoice() {
    const voices = speechSynthesis.getVoices();
    const lang = cfg.lang.slice(0, 2);
    return voices.find((v) => v.lang?.toLowerCase().startsWith(lang) && /natural|online/i.test(v.name))
      || voices.find((v) => v.lang?.toLowerCase().startsWith(lang));
  }
  window.speechSynthesis?.getVoices(); // warm up voice list

  function enqueueSpeech(text) {
    if (!window.speechSynthesis || mode !== "voice") return;
    const clean = text.replace(/\*\*/g, "").replace(/[•*#_`]/g, "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = cfg.lang;
    const v = czechVoice(); if (v) u.voice = v;
    u.rate = 1.05;
    speechQueue++;
    speaking = true;
    setVoiceState("speaking");
    u.onend = u.onerror = () => {
      speechQueue = Math.max(0, speechQueue - 1);
      if (!speechQueue) {
        speaking = false;
        const cb = afterSpeechCb; afterSpeechCb = null;
        if (!busy) cb?.();
      }
    };
    speechSynthesis.speak(u);
  }
  function speak(text, then) { afterSpeechCb = then; enqueueSpeech(text); if (!window.speechSynthesis) then?.(); }
  function afterSpeech(cb) { if (speaking) afterSpeechCb = cb; else cb(); }
  function stopSpeech() { afterSpeechCb = null; speechQueue = 0; speaking = false; window.speechSynthesis?.cancel(); }

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
      if (finalText.trim()) { setVoiceState("thinking"); send(finalText.trim()); } else setVoiceState("idle");
    };
    try { rec.start(); listening = true; setVoiceState("listening"); } catch { setVoiceState("idle"); }
  }

  function stopVoice() {
    stopSpeech();
    if (rec) { rec.onend = null; try { rec.abort(); } catch {} rec = null; }
    listening = false;
  }

  // -------------------------------------------------------------- boot ----
  api.open = (m = "chat") => openPanel(m);

  function boot() {
    document.body.append(host);
    wrap.append(launcher);
    if (!state.greeted) setTimeout(greet, cfg.greetDelay);
  }
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", boot) : boot();
})();
