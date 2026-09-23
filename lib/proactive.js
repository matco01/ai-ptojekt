// Proactive salesperson behaviour: the greeting on arrival and well-timed tips
// ("nudges") based on what the customer is doing. Rule-based on purpose:
// instant, free, predictable – and it works without the Claude API.
// Everything it says comes from the catalog, so it can't invent deals.
import {
  store, getProduct, categoryName, summary, activePromotions, promotionsFor, relatedProducts, priceCart, products,
} from "./catalog.js";

const kc = (n) => n.toLocaleString("cs-CZ") + " Kč";

// ------------------------------------------------------------ greeting ----
export function greeting(s) {
  const current = getProduct(s.currentProductId);
  const previous = s.returning ? getProduct(s.viewedProductIds.at(-1)) : null;
  const hi = `Dobrý den, vítejte v ${store.name}u! 👋 Jsem ${store.assistantName}, zdejší prodavačka.`;

  if (previous && (!current || previous.id !== current.id)) {
    return {
      text: `Vítejte zpátky! 👋 Minule vás zaujal ${previous.name}. Chcete na to navázat, nebo se dnes porozhlédnete sami?`,
      ask: `Minule mě zaujal ${previous.name}. Pomůžete mi rozhodnout, jestli je pro mě ten pravý?`,
    };
  }
  if (current) {
    return {
      text: `${hi} Vidím, že vás zajímá ${current.name}. Chcete s ním poradit, nebo se radši porozhlédnete sami?`,
      ask: `Zajímá mě ${current.name}. Co mi o něm řeknete?`,
    };
  }
  if (s.pageType === "category" && s.category) {
    return {
      text: `${hi} Vybíráte ${categoryName(s.category).toLowerCase()}? Ráda vám pomůžu najít ten pravý – nebo se klidně porozhlédněte sami.`,
      ask: `Vybírám ${categoryName(s.category).toLowerCase()} a potřebuju poradit.`,
    };
  }
  return { text: `${hi} Chcete s něčím poradit, nebo se radši porozhlédnete sami?` };
}

// -------------------------------------------------------------- nudges ----
// Each rule returns a nudge or null. Order = priority. `onlyWhenDeclined`-safe
// rules (deals the customer would otherwise miss) still fire, rarely, for
// customers who said "I'll browse on my own" – like a salesperson at the till.
const RULES = [
  { kind: "bundle", valuable: true, run: bundleTip },
  { kind: "freeship", valuable: true, run: freeShippingTip },
  { kind: "search-miss", valuable: true, run: searchMissTip },
  { kind: "compare", run: compareTip },
  { kind: "service", valuable: true, run: serviceTip },
  { kind: "deal", valuable: true, run: categoryDealTip },
  { kind: "accessory", run: accessoryTip },
  { kind: "dwell", run: dwellTip },
  { kind: "multi-search", run: multiSearchTip },
  { kind: "idle", run: idleTip },
];

export function nextNudge(s) {
  for (const rule of RULES) {
    if (s.declined && !rule.valuable) continue;
    const n = rule.run(s);
    if (n && !s.shown.includes(n.id)) return { kind: rule.kind, ...n };
  }
  return null;
}

function bundleTip(s) {
  const inCart = new Set(s.cart.map((c) => c.id));
  for (const pr of activePromotions()) {
    const b = pr.bundle;
    if (!b || inCart.has(b.with)) continue;
    const looking = s.currentProductId === b.main;
    if (!looking && !inCart.has(b.main)) continue;
    const main = getProduct(b.main), withP = getProduct(b.with);
    const saving = b.discountPercent ? `za polovic (${kc(Math.round(withP.price * (1 - b.discountPercent / 100)))} místo ${kc(withP.price)})` : `o ${kc(b.discountAmount)} levněji`;
    return {
      id: `bundle:${pr.id}`,
      text: `Malý tip, který se snadno přehlédne: ${inCart.has(b.main) ? "protože máte v košíku" : "když si vezmete"} ${main.name}, dostanete ${withP.name} ${saving}. Sleva se uplatní sama v košíku.`,
      product: summary(withP),
      actions: [{ label: "Ukažte mi to", ask: `Řekněte mi víc o akci: ${pr.title}. Vyplatí se mi?` }],
    };
  }
  return null;
}

function freeShippingTip(s) {
  if (!s.cart.length) return null;
  const { freeShippingRemaining: rest } = priceCart(s.cart);
  if (rest <= 0 || rest > 600) return null;
  const inCart = new Set(s.cart.map((c) => c.id));
  const candidates = [
    ...s.cart.flatMap((c) => relatedProducts(c.id)),
    ...products.filter((p) => p.category === "prislusenstvi"),
  ].filter((p) => !inCart.has(p.id) && p.price >= rest);
  const pick = candidates.sort((a, b) => a.price - b.price)[0];
  return {
    id: `freeship:${Math.ceil(rest / 100)}`,
    text: `Do dopravy zdarma vám chybí už jen ${kc(rest)}.${pick ? ` Hodilo by se třeba ${pick.name} za ${kc(pick.price)} – a doprava pak nic nestojí.` : ""}`,
    product: pick ? summary(pick) : null,
    actions: [{ label: "Co by se mi hodilo?", ask: `Do dopravy zdarma mi chybí ${rest} Kč. Co by se mi k nákupu hodilo?` }],
  };
}

function searchMissTip(s) {
  const last = s.searches.at(-1);
  if (!last || last.results > 0) return null;
  return {
    id: `search-miss:${last.q.toLowerCase()}`,
    text: `Na „${last.q}“ vyhledávání nic nenašlo. Zkuste mi říct vlastními slovy, k čemu to potřebujete – často to najdu i pod jiným názvem.`,
    actions: [{ label: "Pomozte mi najít", ask: `Hledám ${last.q}, ale vyhledávání nic nenašlo. Co mi doporučíte?` }],
  };
}

function compareTip(s) {
  const recent = [...new Set(s.viewedProductIds.slice(-6))].map(getProduct).filter(Boolean);
  const byCat = {};
  for (const p of recent) (byCat[p.category] ??= []).push(p);
  const group = Object.values(byCat).find((g) => g.length >= 3);
  if (!group) return null;
  const names = group.slice(-3).map((p) => p.name);
  return {
    id: `compare:${group[0].category}`,
    text: `Vidím, že vybíráte mezi několika ${categoryName(group[0].category).toLowerCase() === "mobily" ? "telefony" : "modely"} – ${names.join(", ")}. Mám vám je rychle porovnat a říct, který se hodí na co?`,
    actions: [{ label: "Ano, porovnejte je", ask: `Porovnejte mi prosím ${names.join(", ")}. Jaký je mezi nimi rozdíl a který byste doporučila?` }],
  };
}

function serviceTip(s) {
  if (s.pageType !== "product" || s.secondsOnPage < 12) return null;
  const pr = promotionsFor(s.currentProductId).find((x) => x.type === "service" && x.id !== "promo-doprava");
  if (!pr) return null;
  return {
    id: `service:${pr.id}`,
    text: `Dobré vědět: ${pr.title}. ${pr.description}`,
    actions: [{ label: "Jak to funguje?", ask: `Jak přesně funguje „${pr.title}“?` }],
  };
}

function categoryDealTip(s) {
  if (s.pageType !== "category" || !s.category || s.secondsOnPage < 10) return null;
  const seen = new Set(s.viewedProductIds);
  const deal = products
    .filter((p) => p.category === s.category && p.oldPrice && !seen.has(p.id))
    .sort((a, b) => b.oldPrice - b.price - (a.oldPrice - a.price))[0];
  if (!deal) return null;
  const promo = promotionsFor(deal.id).find((p) => p.type === "discount");
  const soon = promo?.validUntil && (new Date(promo.validUntil) - Date.now()) / 864e5 < 5;
  return {
    id: `deal:${deal.id}`,
    text: `Jen ať vám to neuteče: ${deal.name} je teď za ${kc(deal.price)} místo ${kc(deal.oldPrice)}${soon ? " – akce ale brzy končí" : ""}.`,
    product: summary(deal),
    actions: [{ label: "Pro koho se hodí?", ask: `Pro koho se hodí ${deal.name}? Je to dobrá koupě?` }],
  };
}

function accessoryTip(s) {
  if (s.pageType !== "cart" || !s.cart.length) return null;
  const inCart = new Set(s.cart.map((c) => c.id));
  for (const c of s.cart) {
    const main = getProduct(c.id);
    const extra = relatedProducts(c.id).find((p) => !inCart.has(p.id));
    if (!main || !extra) continue;
    const why = extra.type === "charger" && main.category === "mobily" ? " – nové telefony se dodávají bez nabíječky" : "";
    return {
      id: `accessory:${extra.id}`,
      text: `Zákazníci si k ${main.name} často berou i ${extra.name} (${kc(extra.price)})${why}. Nechcete ho přidat?`,
      product: summary(extra),
      actions: [{ label: "Proč se hodí?", ask: `Proč se k ${main.name} hodí ${extra.name}? Opravdu to potřebuju?` }],
    };
  }
  return null;
}

function dwellTip(s) {
  if (s.pageType !== "product" || s.secondsOnPage < 30) return null;
  const p = getProduct(s.currentProductId);
  if (!p || s.cart.some((c) => c.id === p.id)) return null;
  const topics = Object.keys(p.params).slice(0, 2).join(" nebo ");
  return {
    id: `dwell:${p.id}`,
    text: `Máte k ${p.name} nějaký dotaz? Třeba ohledně ${topics}, nebo jestli se hodí přesně na to, co potřebujete – ráda poradím.`,
    actions: [{ label: "Mám dotaz", ask: `Mám dotaz k ${p.name}. Hodí se pro mě?` }],
  };
}

function multiSearchTip(s) {
  if (s.searches.length < 2) return null;
  return {
    id: "multi-search",
    text: "Hledáte něco konkrétního? Popište mi, k čemu to potřebujete a kolik chcete zhruba utratit, a zkrátím vám hledání.",
    actions: [{ label: "Pomozte mi vybrat", ask: `Zkouším hledat ${s.searches.slice(-2).map((x) => `„${x.q}“`).join(" a ")}. Pomůžete mi vybrat?` }],
  };
}

function idleTip(s) {
  if (s.pageType !== "home" || s.secondsOnPage < 25) return null;
  return {
    id: "idle-home",
    text: "Hledáte dárek, nebo něco konkrétního? Stačí říct pro koho a v jaké ceně – ráda vyberu pár tipů.",
    actions: [{ label: "Hledám dárek", ask: "Hledám dárek. Co byste doporučila?" }, { label: "Něco konkrétního", ask: "Potřebuju poradit s výběrem." }],
  };
}
