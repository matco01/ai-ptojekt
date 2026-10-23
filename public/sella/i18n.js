// Sella's two languages (Czech, English) for the website, the login and the dashboards.
// The first visit asks which one to use; the choice is remembered in this browser and every Sella
// page follows it. Pages register their texts with SellaI18n.use({ cs: {...}, en: {...} }) and mark
// elements with data-i18n="key" (text), data-i18n-html="key" (markup) or
// data-i18n-attr="placeholder=key;aria-label=key". A value may be a function for texts with numbers.
(() => {
  const KEY = "sella-lang", LANGS = ["cs", "en"];
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const saved = LANGS.includes(read()) ? read() : null;
  const guess = /^(cs|sk)\b/i.test(navigator.language || "") ? "cs" : "en";
  // A page with its own address per language (the home page: / and /en/) always shows that language,
  // so search engines index each one; the switch then goes to the other address. Marked on <html>:
  // data-url-lang="cs" data-alt-cs="/" data-alt-en="/en/" (+ data-lang-default on the main one).
  const root = document.documentElement;
  const pinned = LANGS.includes(root.dataset.urlLang) ? root.dataset.urlLang : null;
  const altUrl = (lang) => root.dataset["alt" + lang[0].toUpperCase() + lang.slice(1)];
  // someone who chose English before and opens the main address goes to the English one (people only:
  // crawlers keep no choice, so they always see each address in its own language)
  if (pinned && saved && saved !== pinned && root.hasAttribute("data-lang-default") && altUrl(saved)) location.replace(altUrl(saved) + location.search + location.hash);
  // going on from a language's own address (to sign up, sign in…) keeps that language on the next page
  if (pinned) addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (a && a.origin === location.origin && !a.getAttribute("href").startsWith("#")) { try { localStorage.setItem(KEY, pinned); } catch {} }
  }, true);
  const dict = { cs: {}, en: {} };
  const listeners = [];

  const I = {
    lang: pinned || saved || guess,
    chosen: Boolean(saved || pinned),
    locale: () => (I.lang === "cs" ? "cs-CZ" : "en-GB"),
    use(d) { for (const l of LANGS) Object.assign(dict[l], d[l] || {}); I.apply(); return I.t; },
    t(key, ...args) {
      const v = dict[I.lang][key] ?? dict.cs[key] ?? key;
      return typeof v === "function" ? v(...args) : v;
    },
    apply(root = document) {
      document.documentElement.lang = I.lang;
      root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = I.t(el.dataset.i18n); });
      root.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = I.t(el.dataset.i18nHtml); });
      root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
        for (const pair of el.dataset.i18nAttr.split(";")) {
          const [attr, key] = pair.split("=").map((s) => s.trim());
          if (attr && key) el.setAttribute(attr, I.t(key));
        }
      });
      document.querySelectorAll(".sella-lang button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === I.lang));
    },
    set(lang) {
      if (!LANGS.includes(lang)) return;
      try { localStorage.setItem(KEY, lang); } catch {}
      if (pinned && lang !== pinned && altUrl(lang)) { location.href = altUrl(lang) + location.hash; return; }
      const changed = lang !== I.lang;
      I.lang = lang; I.chosen = true;
      I.apply();
      if (changed) listeners.forEach((fn) => fn(lang));
    },
    onChange(fn) { listeners.push(fn); },
    /** Plan names come from the server in Czech (lib/plans.js). */
    plan: (name) => (I.lang === "en" ? { "Zkušební": "Trial", "Interní": "Internal" }[name] ?? name : name),
    /** A small CS | EN switch rendered into `el`. */
    switcher(el) {
      el.classList.add("sella-lang");
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", "Jazyk / Language");
      el.innerHTML = `<button type="button" data-lang="cs" aria-pressed="${I.lang === "cs"}">CS</button><button type="button" data-lang="en" aria-pressed="${I.lang === "en"}">EN</button>`;
      el.onclick = (e) => { const b = e.target.closest("[data-lang]"); if (b) I.set(b.dataset.lang); };
    },
  };
  window.SellaI18n = I;
  document.documentElement.lang = I.lang;

  // ---- looks for the switch and the first-visit chooser (works on the site and in the dashboards)
  const css = `
    .sella-lang { display: inline-flex; padding: 3px; border-radius: 999px; background: rgba(255,255,255,.45); box-shadow: inset 0 0 0 1px rgba(255,255,255,.7); }
    .sella-lang button { border: 0; background: none; font: 600 12.5px/1 "Geist", -apple-system, Arial, sans-serif; letter-spacing: .06em; color: #6f7781; padding: 7px 10px; border-radius: 999px; cursor: pointer; }
    .sella-lang button[aria-pressed="true"] { background: #2f3133; color: #f3f5f7; }
    .sella-pick { position: fixed; inset: 0; z-index: 2147483600; display: grid; place-items: center; padding: 24px;
      background: rgba(208,217,225,.55); backdrop-filter: blur(26px) saturate(140%); -webkit-backdrop-filter: blur(26px) saturate(140%);
      animation: sella-fade .5s ease both; font-family: "Geist", -apple-system, Arial, sans-serif; color: #2f3133; }
    .sella-pick.out { animation: sella-fade .45s ease reverse both; }
    .sella-pick .box { text-align: center; width: min(560px, 100%); }
    .sella-pick .hi { font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: #6f7781; margin: 0; animation: sella-up .8s .1s both; }
    .sella-pick .mark { font: 400 clamp(84px, 16vw, 132px)/1 "Old Standard TT", Didot, Georgia, serif; color: #434445; letter-spacing: -.02em; margin: 6px 0 30px; animation: sella-up .9s .15s both; }
    .sella-pick .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .sella-pick button { text-align: left; border: 0; cursor: pointer; padding: 22px 24px; border-radius: 24px; background: rgba(255,255,255,.55); color: inherit;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.8), 0 24px 60px -34px rgba(30,50,80,.5); transition: transform .25s cubic-bezier(.2,.8,.2,1), background .2s; animation: sella-up .8s both; }
    .sella-pick button:nth-child(1) { animation-delay: .3s; } .sella-pick button:nth-child(2) { animation-delay: .38s; }
    .sella-pick button:hover, .sella-pick button:focus-visible { transform: translateY(-3px); background: rgba(255,255,255,.8); outline: none; }
    .sella-pick button b { display: block; font: 400 30px/1.1 "Old Standard TT", Didot, Georgia, serif; }
    .sella-pick button span { display: block; margin-top: 6px; font-size: 14px; color: #6f7781; }
    .sella-pick button.suggest { box-shadow: inset 0 0 0 1.5px #4e7fb4, 0 24px 60px -34px rgba(30,50,80,.5); }
    @keyframes sella-fade { from { opacity: 0; } }
    @keyframes sella-up { from { opacity: 0; transform: translateY(14px); } }
    @media (max-width: 480px) { .sella-pick .opts { grid-template-columns: 1fr; } }
    @media (prefers-reduced-motion: reduce) { .sella-pick, .sella-pick * { animation: none !important; } }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  function chooser() {
    const box = document.createElement("div");
    box.className = "sella-pick";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Vyberte jazyk / Choose your language");
    box.innerHTML = `<div class="box">
        <p class="hi">Vítejte · Welcome</p>
        <div class="mark" aria-hidden="true">Sella</div>
        <div class="opts">
          <button data-lang="cs" class="${guess === "cs" ? "suggest" : ""}"><b>Čeština</b><span>Pokračovat česky</span></button>
          <button data-lang="en" class="${guess === "en" ? "suggest" : ""}"><b>English</b><span>Continue in English</span></button>
        </div></div>`;
    document.body.append(box);
    box.querySelector(".suggest").focus({ preventScroll: true });
    box.onclick = (e) => {
      const b = e.target.closest("[data-lang]");
      if (!b) return;
      I.set(b.dataset.lang);
      box.classList.add("out");
      setTimeout(() => box.remove(), 450);
    };
  }
  // pages people reach from elsewhere (the legal pages, linked from shops) skip the full-screen chooser:
  // <html data-no-chooser> – the language is guessed and the small switch is there to change it
  const start = () => { I.apply(); if (!I.chosen && !document.documentElement.hasAttribute("data-no-chooser")) chooser(); };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", start) : start();
})();
