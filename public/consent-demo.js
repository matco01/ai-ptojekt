// A minimal cookie bar for our demo sites. It also shows how a shop hands the visitor's choice to
// the AI salesperson: window.AIProdavac = { consent } before the widget loads, AIProdavac.setConsent() after.
// Real shops usually have a consent tool already (Cookiebot, OneTrust, Google Consent Mode) – the
// widget reads those by itself.
(() => {
  const KEY = "demo_consent";
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
  window.AIProdavac = Object.assign(window.AIProdavac || {}, { consent: saved === true });
  if (saved !== null) return;

  const bar = document.createElement("div");
  bar.setAttribute("role", "dialog");
  bar.setAttribute("aria-label", "Souhlas s analytikou");
  bar.style.cssText = "position:fixed;left:16px;bottom:16px;max-width:420px;z-index:2147483000;background:#fff;color:#1d2433;" +
    "border:1px solid rgba(15,21,34,.12);border-radius:16px;box-shadow:0 14px 40px rgba(15,21,34,.18);padding:16px 18px;" +
    "font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
  bar.innerHTML = `<strong style="display:block;font-size:15px;margin-bottom:4px">Soukromí</strong>
    <span style="color:#4a5468">Používáme analytiku, aby vám AI prodavačka lépe radila a obchod věděl, co zákazníci hledají.
    <a href="/soukromi.html" target="_blank" rel="noopener" style="color:#1d2433;text-decoration:underline;text-underline-offset:2px">Více o zpracování</a></span>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button data-v="1" style="flex:1;padding:10px 12px;border-radius:10px;border:1px solid #1d2433;background:#1d2433;color:#fff;font:inherit;font-weight:600;cursor:pointer">Souhlasím</button>
      <button data-v="0" style="flex:1;padding:10px 12px;border-radius:10px;border:1px solid rgba(15,21,34,.2);background:#fff;color:inherit;font:inherit;font-weight:600;cursor:pointer">Odmítnout</button>
    </div>`;
  bar.addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (v == null) return;
    const granted = v === "1";
    try { localStorage.setItem(KEY, JSON.stringify(granted)); } catch {}
    window.AIProdavac.consent = granted;
    window.AIProdavac.setConsent?.(granted);
    bar.remove();
  });
  addEventListener("DOMContentLoaded", () => document.body.append(bar));
})();
