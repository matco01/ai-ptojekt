// Proactive salesperson behaviour: the greeting on arrival and well-timed tips
// ("nudges") based on what the customer is doing. Rule-based on purpose:
// instant, free, predictable – and it works without the Claude API.
// Everything it says comes from the shop's catalog (`cat`), so it can't invent deals.
import { detectHesitation } from "./hesitation.js";

const kc = (n) => n.toLocaleString("cs-CZ") + " Kč";

// ------------------------------------------------------------ greeting ----
export function greeting(s, cat) {
  const current = cat.getProduct(s.currentProductId);
  const previous = s.returning ? cat.getProduct(s.viewedProductIds.at(-1)) : null;
  const hi = `Dobrý den, vítejte ${cat.store.welcome || "u nás"}! 👋 Jsem ${s.agentName}, zdejší prodavačka.`;

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
    const name = cat.categoryName(s.category).toLowerCase();
    return {
      text: `${hi} Vybíráte ${name}? Ráda vám pomůžu najít to pravé – nebo se klidně porozhlédněte sami.`,
      ask: `Vybírám ${name} a potřebuju poradit.`,
    };
  }
  return { text: `${hi} Chcete s něčím poradit, nebo se radši porozhlédnete sami?` };
}

// -------------------------------------------------------------- nudges ----
// Each rule returns a nudge or null. Order = priority. `valuable` rules (deals the customer
// would otherwise miss) still fire, rarely, for customers who said "I'll browse on my own".
const RULES = [
  { kind: "bundle", valuable: true, run: bundleTip },
  { kind: "freeship", valuable: true, run: freeShippingTip },
  { kind: "search-miss", valuable: true, run: searchMissTip },
  { kind: "service", valuable: true, run: serviceTip },
  { kind: "deal", valuable: true, run: categoryDealTip },
  { kind: "accessory", run: accessoryTip },
  { kind: "idle", run: idleTip },
];

export function nextNudge(s, cat) {
  // A customer who is clearly stuck gets help first – even after "just looking",
  // the way a salesperson walks over to someone who has been standing at a shelf too long.
  const h = detectHesitation(s, cat);
  if (h) return { kind: h.kind, id: h.id, text: h.fallback, actions: h.actions, hesitation: { situation: h.situation, facts: h.facts } };
  for (const rule of RULES) {
    if (s.declined && !rule.valuable) continue;
    const n = rule.run(s, cat);
    if (n && !s.shown.includes(n.id)) return { kind: rule.kind, ...n };
  }
  return null;
}

function bundleTip(s, cat) {
  const inCart = new Set(s.cart.map((c) => c.id));
  for (const pr of cat.activePromotions()) {
    const b = pr.bundle;
    if (!b || inCart.has(b.with)) continue;
    const looking = s.currentProductId === b.main;
    if (!looking && !inCart.has(b.main)) continue;
    const main = cat.getProduct(b.main), withP = cat.getProduct(b.with);
    const saving = b.discountPercent ? `za polovic (${kc(Math.round(withP.price * (1 - b.discountPercent / 100)))} místo ${kc(withP.price)})` : `o ${kc(b.discountAmount)} levněji`;
    return {
      id: `bundle:${pr.id}`,
      text: `Malý tip, který se snadno přehlédne: ${inCart.has(b.main) ? "protože máte v košíku" : "když si vezmete"} ${main.name}, dostanete ${withP.name} ${saving}. Sleva se uplatní sama v košíku.`,
      product: cat.summary(withP),
      actions: [{ label: "Ukažte mi to", ask: `Řekněte mi víc o akci: ${pr.title}. Vyplatí se mi?` }],
    };
  }
  return null;
}

function freeShippingTip(s, cat) {
  if (!s.cart.length || !cat.store.freeShippingFrom) return null;
  const { freeShippingRemaining: rest } = cat.priceCart(s.cart);
  if (rest <= 0 || rest > 600) return null;
  const inCart = new Set(s.cart.map((c) => c.id));
  // something that goes with the cart first, otherwise the cheapest thing that closes the gap
  const fits = (p) => !inCart.has(p.id) && p.stock > 0 && p.price >= rest;
  const byPrice = (a, b) => a.price - b.price;
  const pick = s.cart.flatMap((c) => cat.relatedProducts(c.id)).filter(fits).sort(byPrice)[0]
    ?? cat.products.filter((p) => fits(p) && p.price <= rest + 1000).sort(byPrice)[0];
  return {
    id: `freeship:${Math.ceil(rest / 100)}`,
    text: `Do dopravy zdarma vám chybí už jen ${kc(rest)}.${pick ? ` Hodilo by se třeba ${pick.name} za ${kc(pick.price)} – a doprava pak nic nestojí.` : ""}`,
    product: pick ? cat.summary(pick) : null,
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

function serviceTip(s, cat) {
  if (s.pageType !== "product" || s.secondsOnPage < 6) return null;
  const pr = cat.promotionsFor(s.currentProductId).find((x) => x.type === "service" && x.id !== "promo-doprava");
  if (!pr) return null;
  return {
    id: `service:${pr.id}`,
    text: `Dobré vědět: ${pr.title}. ${pr.description}`,
    actions: [{ label: "Jak to funguje?", ask: `Jak přesně funguje „${pr.title}“?` }],
  };
}

function categoryDealTip(s, cat) {
  if (s.pageType !== "category" || !s.category || s.secondsOnPage < 5) return null;
  const seen = new Set(s.viewedProductIds);
  const deal = cat.products
    .filter((p) => p.category === s.category && p.oldPrice && !seen.has(p.id))
    .sort((a, b) => b.oldPrice - b.price - (a.oldPrice - a.price))[0];
  if (!deal) return null;
  const promo = cat.promotionsFor(deal.id).find((p) => p.type === "discount");
  const soon = promo?.validUntil && (new Date(promo.validUntil) - Date.now()) / 864e5 < 5;
  return {
    id: `deal:${deal.id}`,
    text: `Jen ať vám to neuteče: ${deal.name} je teď za ${kc(deal.price)} místo ${kc(deal.oldPrice)}${soon ? " – akce ale brzy končí" : ""}.`,
    product: cat.summary(deal),
    actions: [{ label: "Pro koho se hodí?", ask: `Pro koho se hodí ${deal.name}? Je to dobrá koupě?` }],
  };
}

function accessoryTip(s, cat) {
  if (s.pageType !== "cart" || !s.cart.length) return null;
  const inCart = new Set(s.cart.map((c) => c.id));
  for (const c of s.cart) {
    const main = cat.getProduct(c.id);
    const extra = cat.relatedProducts(c.id).find((p) => !inCart.has(p.id));
    if (!main || !extra) continue;
    const why = extra.type === "charger" && main.category === "mobily" ? " – nové telefony se dodávají bez nabíječky" : "";
    return {
      id: `accessory:${extra.id}`,
      text: `Zákazníci si k ${main.name} často berou i ${extra.name} (${kc(extra.price)})${why}. Nechcete ho přidat?`,
      product: cat.summary(extra),
      actions: [{ label: "Proč se hodí?", ask: `Proč se k ${main.name} hodí ${extra.name}? Opravdu to potřebuju?` }],
    };
  }
  return null;
}

function idleTip(s) {
  if (s.pageType !== "home" || s.secondsOnPage < 15) return null;
  return {
    id: "idle-home",
    text: "Hledáte dárek, nebo něco konkrétního? Stačí říct pro koho a v jaké ceně – ráda vyberu pár tipů.",
    actions: [{ label: "Hledám dárek", ask: "Hledám dárek. Co byste doporučila?" }, { label: "Něco konkrétního", ask: "Potřebuju poradit s výběrem." }],
  };
}
