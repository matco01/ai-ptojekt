// Proactive salesperson behaviour: the greeting on arrival and well-timed tips
// ("nudges") based on what the customer is doing. Rule-based on purpose:
// instant, free, predictable – and it works without the Claude API.
// Everything it says comes from the shop's catalog (`cat`), so it can't invent deals.
// It speaks the page's language (s.lang: "cs" or "en").
import { detectHesitation } from "./hesitation.js";

export const money = (n, lang) => (lang === "en" ? n.toLocaleString("en-GB") + " CZK" : n.toLocaleString("cs-CZ") + " Kč");

// ------------------------------------------------------------ greeting ----
export function greeting(s, cat) {
  const en = s.lang === "en";
  const current = cat.getProduct(s.currentProductId);
  const previous = s.returning ? cat.getProduct(s.viewedProductIds.at(-1)) : null;
  const hi = en
    ? `Hi, welcome${cat.store.welcomeEn ? ` ${cat.store.welcomeEn}` : ""}! 👋 I'm ${s.agentName}, ${cat.products.length ? "the shop assistant" : "the assistant"} here.`
    : `Dobrý den, vítejte ${cat.store.welcome || "u nás"}! 👋 Jsem ${s.agentName}, zdejší ${cat.products.length ? "prodavačka" : "asistentka"}.`;

  if (previous && (!current || previous.id !== current.id)) {
    return en
      ? { text: `Welcome back! 👋 Last time you looked at the ${previous.name}. Want to pick up where you left off, or browse on your own today?`, ask: `Last time I looked at the ${previous.name}. Can you help me decide if it's right for me?` }
      : { text: `Vítejte zpátky! 👋 Minule vás zaujal ${previous.name}. Chcete na to navázat, nebo se dnes porozhlédnete sami?`, ask: `Minule mě zaujal ${previous.name}. Pomůžete mi rozhodnout, jestli je pro mě ten pravý?` };
  }
  if (current) {
    return en
      ? { text: `${hi} I see you're looking at the ${current.name}. Want some help with it, or would you rather browse?`, ask: `I'm interested in the ${current.name}. What can you tell me about it?` }
      : { text: `${hi} Vidím, že vás zajímá ${current.name}. Chcete s ním poradit, nebo se radši porozhlédnete sami?`, ask: `Zajímá mě ${current.name}. Co mi o něm řeknete?` };
  }
  if (s.pageType === "category" && s.category) {
    const name = cat.categoryName(s.category).toLowerCase();
    return en
      ? { text: `${hi} Choosing ${name}? I'm happy to help you find the right one – or feel free to browse.`, ask: `I'm choosing ${name} and need some advice.` }
      : { text: `${hi} Vybíráte ${name}? Ráda vám pomůžu najít to pravé – nebo se klidně porozhlédněte sami.`, ask: `Vybírám ${name} a potřebuju poradit.` };
  }
  return { text: en ? `${hi} Can I help you find something, or would you rather browse?` : `${hi} Chcete s něčím poradit, nebo se radši porozhlédnete sami?` };
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
  const en = s.lang === "en", kc = (n) => money(n, s.lang);
  const inCart = new Set(s.cart.map((c) => c.id));
  for (const pr of cat.activePromotions()) {
    const b = pr.bundle;
    if (!b || inCart.has(b.with)) continue;
    const looking = s.currentProductId === b.main;
    if (!looking && !inCart.has(b.main)) continue;
    const main = cat.getProduct(b.main), withP = cat.getProduct(b.with);
    const half = kc(Math.round(withP.price * (1 - (b.discountPercent ?? 0) / 100)));
    const saving = en
      ? (b.discountPercent ? `for ${half} instead of ${kc(withP.price)}` : `${kc(b.discountAmount)} cheaper`)
      : (b.discountPercent ? `za polovic (${half} místo ${kc(withP.price)})` : `o ${kc(b.discountAmount)} levněji`);
    return {
      id: `bundle:${pr.id}`,
      text: en
        ? `A small tip that's easy to miss: ${inCart.has(b.main) ? "since you have" : "if you take"} the ${main.name}, you get the ${withP.name} ${saving}. The discount applies in the cart by itself.`
        : `Malý tip, který se snadno přehlédne: ${inCart.has(b.main) ? "protože máte v košíku" : "když si vezmete"} ${main.name}, dostanete ${withP.name} ${saving}. Sleva se uplatní sama v košíku.`,
      product: cat.summary(withP),
      actions: [en ? { label: "Show me", ask: `Tell me more about this deal: ${pr.title}. Is it worth it for me?` } : { label: "Ukažte mi to", ask: `Řekněte mi víc o akci: ${pr.title}. Vyplatí se mi?` }],
    };
  }
  return null;
}

function freeShippingTip(s, cat) {
  const en = s.lang === "en", kc = (n) => money(n, s.lang);
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
    text: en
      ? `You're only ${kc(rest)} away from free delivery.${pick ? ` The ${pick.name} for ${kc(pick.price)} would fit – and delivery is then free.` : ""}`
      : `Do dopravy zdarma vám chybí už jen ${kc(rest)}.${pick ? ` Hodilo by se třeba ${pick.name} za ${kc(pick.price)} – a doprava pak nic nestojí.` : ""}`,
    product: pick ? cat.summary(pick) : null,
    actions: [en ? { label: "What would suit me?", ask: `I'm ${kc(rest)} away from free delivery. What would go well with my order?` } : { label: "Co by se mi hodilo?", ask: `Do dopravy zdarma mi chybí ${rest} Kč. Co by se mi k nákupu hodilo?` }],
  };
}

function searchMissTip(s) {
  const en = s.lang === "en";
  const last = s.searches.at(-1);
  if (!last || last.results > 0) return null;
  return {
    id: `search-miss:${last.q.toLowerCase()}`,
    text: en
      ? `The search for "${last.q}" found nothing. Tell me in your own words what you need it for – I can often find it under a different name.`
      : `Na „${last.q}“ vyhledávání nic nenašlo. Zkuste mi říct vlastními slovy, k čemu to potřebujete – často to najdu i pod jiným názvem.`,
    actions: [en ? { label: "Help me find it", ask: `I'm looking for ${last.q}, but the search found nothing. What do you recommend?` } : { label: "Pomozte mi najít", ask: `Hledám ${last.q}, ale vyhledávání nic nenašlo. Co mi doporučíte?` }],
  };
}

function serviceTip(s, cat) {
  const en = s.lang === "en";
  if (s.pageType !== "product" || s.secondsOnPage < 6) return null;
  const pr = cat.promotionsFor(s.currentProductId).find((x) => x.type === "service" && x.id !== "promo-doprava");
  if (!pr) return null;
  return {
    id: `service:${pr.id}`,
    text: en ? `Good to know: ${pr.title}. ${pr.description}` : `Dobré vědět: ${pr.title}. ${pr.description}`,
    actions: [en ? { label: "How does it work?", ask: `How exactly does "${pr.title}" work?` } : { label: "Jak to funguje?", ask: `Jak přesně funguje „${pr.title}“?` }],
  };
}

function categoryDealTip(s, cat) {
  const en = s.lang === "en", kc = (n) => money(n, s.lang);
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
    text: en
      ? `Don't miss this: the ${deal.name} is now ${kc(deal.price)} instead of ${kc(deal.oldPrice)}${soon ? " – but the deal ends soon" : ""}.`
      : `Jen ať vám to neuteče: ${deal.name} je teď za ${kc(deal.price)} místo ${kc(deal.oldPrice)}${soon ? " – akce ale brzy končí" : ""}.`,
    product: cat.summary(deal),
    actions: [en ? { label: "Who is it for?", ask: `Who is the ${deal.name} good for? Is it a good buy?` } : { label: "Pro koho se hodí?", ask: `Pro koho se hodí ${deal.name}? Je to dobrá koupě?` }],
  };
}

function accessoryTip(s, cat) {
  const en = s.lang === "en", kc = (n) => money(n, s.lang);
  if (s.pageType !== "cart" || !s.cart.length) return null;
  const inCart = new Set(s.cart.map((c) => c.id));
  for (const c of s.cart) {
    const main = cat.getProduct(c.id);
    const extra = cat.relatedProducts(c.id).find((p) => !inCart.has(p.id));
    if (!main || !extra) continue;
    const charger = extra.type === "charger" && main.category === "mobily";
    const why = charger ? (en ? " – new phones come without a charger" : " – nové telefony se dodávají bez nabíječky") : "";
    return {
      id: `accessory:${extra.id}`,
      text: en
        ? `Customers often take the ${extra.name} (${kc(extra.price)}) with the ${main.name}${why}. Would you like to add it?`
        : `Zákazníci si k ${main.name} často berou i ${extra.name} (${kc(extra.price)})${why}. Nechcete ho přidat?`,
      product: cat.summary(extra),
      actions: [en ? { label: "Why does it fit?", ask: `Why does the ${extra.name} go with the ${main.name}? Do I really need it?` } : { label: "Proč se hodí?", ask: `Proč se k ${main.name} hodí ${extra.name}? Opravdu to potřebuju?` }],
    };
  }
  return null;
}

function idleTip(s, cat) {
  const en = s.lang === "en";
  if (s.pageType !== "home" || s.secondsOnPage < 15) return null;
  // written for the shop's website (a gift fits a shop, not a guesthouse)
  const own = cat.store.starters;
  if (own?.idle) return { id: "idle-home", text: own.idle, actions: own.chips.slice(0, 2) };
  if (!cat.products.length) {
    return {
      id: "idle-home",
      text: en ? "Can I help you with anything? Just ask – I know everything on this website." : "Můžu vám s něčím pomoct? Klidně se zeptejte – znám všechno, co je na tomto webu.",
      actions: [en ? { label: "What do you offer?", ask: "What do you offer?" } : { label: "Co nabízíte?", ask: "Co všechno nabízíte?" }],
    };
  }
  return {
    id: "idle-home",
    text: en
      ? "Looking for a gift, or something specific? Just tell me who it's for and your budget – I'll pick a few ideas."
      : "Hledáte dárek, nebo něco konkrétního? Stačí říct pro koho a v jaké ceně – ráda vyberu pár tipů.",
    actions: en
      ? [{ label: "Looking for a gift", ask: "I'm looking for a gift. What would you recommend?" }, { label: "Something specific", ask: "I need help choosing." }]
      : [{ label: "Hledám dárek", ask: "Hledám dárek. Co byste doporučila?" }, { label: "Něco konkrétního", ask: "Potřebuju poradit s výběrem." }],
  };
}
