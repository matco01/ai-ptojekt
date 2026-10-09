// Language of our demo shops (TechMarket, Bohème): Czech or English. It follows the choice made on
// the Sella site (the same browser storage), otherwise the browser's language. It sets <html lang>
// before the AI widget loads – the widget reads it, so the assistant talks in the same language.
// Load it first, without defer. Switching languages reloads the page, so the shop, its catalogue
// and the assistant all start fresh in the new language.
(() => {
  const KEY = "sella-lang";
  let lang = null;
  try { lang = localStorage.getItem(KEY); } catch {}
  if (lang !== "cs" && lang !== "en") lang = /^(cs|sk)\b/i.test(navigator.language || "") ? "cs" : "en";
  document.documentElement.lang = lang;

  const dict = { cs: {}, en: {} };
  const D = (window.DemoLang = {
    lang,
    locale: lang === "en" ? "en-GB" : "cs-CZ",
    /** Registers a page's texts: { cs: {...}, en: {...} }; values may be functions. */
    use(d) { for (const l of ["cs", "en"]) Object.assign(dict[l], d[l] || {}); return D.t; },
    t(key, ...a) {
      const v = dict[lang][key] ?? dict.cs[key] ?? key;
      return typeof v === "function" ? v(...a) : v;
    },
    /** data-t="key" (text), data-t-html="key" (markup), data-t-attr="placeholder=key;title=key" */
    apply(root = document) {
      root.querySelectorAll("[data-t]").forEach((el) => { el.textContent = D.t(el.dataset.t); });
      root.querySelectorAll("[data-t-html]").forEach((el) => { el.innerHTML = D.t(el.dataset.tHtml); });
      root.querySelectorAll("[data-t-attr]").forEach((el) => {
        for (const pair of el.dataset.tAttr.split(";")) {
          const [attr, key] = pair.split("=").map((s) => s.trim());
          if (attr && key) el.setAttribute(attr, D.t(key));
        }
      });
    },
    set(l) {
      if (l === lang || (l !== "cs" && l !== "en")) return;
      try { localStorage.setItem(KEY, l); } catch {}
      location.reload();
    },
  });

  const css = `.demo-lang { display: inline-flex; padding: 3px; border-radius: 999px; background: rgba(127,127,127,.12); box-shadow: inset 0 0 0 1px rgba(127,127,127,.18); vertical-align: middle; }
    .demo-lang button { border: 0; background: none; font: 700 12px/1 system-ui, -apple-system, Arial, sans-serif; letter-spacing: .05em; color: inherit; opacity: .6; padding: 7px 10px; border-radius: 999px; cursor: pointer; }
    .demo-lang button[aria-pressed="true"] { opacity: 1; background: currentColor; }
    .demo-lang button[aria-pressed="true"] span { color: var(--demo-lang-on, #fff); }`;
  addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    // a CS | EN switch wherever the page asks for one
    document.querySelectorAll("[data-lang-switch]").forEach((el) => {
      el.classList.add("demo-lang");
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", "Jazyk / Language");
      el.innerHTML = ["cs", "en"].map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === lang}"><span>${l.toUpperCase()}</span></button>`).join("");
      el.onclick = (e) => { const b = e.target.closest("[data-l]"); if (b) D.set(b.dataset.l); };
    });
    D.apply();
  });
})();
