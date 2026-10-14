// Who runs Sella – the ONE place to change the operator's details. Every legal page and footer
// fills its <span data-op="…"> elements from here. When the terms change, raise `termsVersion`
// here AND TERMS_VERSION in lib/legal.js (the server stores which version each shop accepted).
window.SELLA_OPERATOR = {
  name: "Ondřej Novotný",
  ico: "24374458",
  address: "Na Křemínku 928, 282 01 Český Brod",
  email: "", // ← kontaktní e-mail (zatím nevyplněno)
  register: { cs: "fyzická osoba podnikající, zapsaná v živnostenském rejstříku", en: "a sole trader registered in the Czech Trade Register" },
  vatPayer: false,
  termsVersion: "2026-10-14",
  effective: { cs: "14. 10. 2026", en: "14 October 2026" },
};

(() => {
  const op = window.SELLA_OPERATOR;
  const lang = () => (document.documentElement.lang === "en" ? "en" : "cs");
  const fill = () => {
    const l = lang();
    const missing = l === "en" ? "[e-mail to be added]" : "[e-mail doplníme]";
    const values = {
      name: op.name, ico: op.ico, address: op.address, register: op.register[l], version: op.termsVersion, effective: op.effective[l],
      email: op.email || missing,
      vat: op.vatPayer ? (l === "en" ? "VAT payer" : "plátce DPH") : (l === "en" ? "not a VAT payer" : "neplátce DPH"),
      line: `${op.name}, ${l === "en" ? "Company ID" : "IČO"} ${op.ico}, ${op.address}`,
    };
    document.querySelectorAll("[data-op]").forEach((el) => {
      const key = el.dataset.op;
      if (key === "mailto") {
        if (op.email) { el.href = `mailto:${op.email}`; el.textContent = op.email; } else { el.removeAttribute("href"); el.textContent = missing; }
      } else if (key in values) el.textContent = values[key];
    });
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", fill); else fill();
  // the language switch re-renders texts – fill again after it
  new MutationObserver(fill).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
