// Recognises a customer who is stuck – the moment a good salesperson walks over
// even to someone who said "I'm just looking". Works on behaviour signals the
// widget collects (active time, re-reading, filter churn, back-and-forth between
// products, hovering over "add to cart", cart hesitation).
//
// Each detector returns the situation with plain facts from the catalog, a
// ready-made fallback text and the question to send if the customer accepts.
// lib/assistant.js can turn the facts into a more natural, AI-written offer.
const kc = (n) => n.toLocaleString("cs-CZ") + " Kč";
const brief = (p) => ({ name: p.name, price: kc(p.price), highlights: p.highlights.slice(0, 3) });

// Order = priority: the most specific, most "stuck" situation wins.
const DETECTORS = [cartHesitation, compareHesitation, productHesitation, filterChurn, searchChurn];

export function detectHesitation(s, cat) {
  for (const detect of DETECTORS) {
    const h = detect(s, cat);
    if (h && !s.shown.includes(h.id)) return h;
  }
  return null;
}

/** Back-and-forth between products of one category: A → B → A, or 3+ models in a row. */
function compareHesitation(s, cat) {
  const getProduct = cat.getProduct;
  const seq = s.behaviour.seq.slice(-8);
  // ping-pong: a product seen again after looking at another one from the same category
  for (let i = seq.length - 1; i >= 2; i--) {
    const a = getProduct(seq[i]);
    const j = seq.lastIndexOf(seq[i], i - 1);
    if (!a || j < 0) continue;
    const between = seq.slice(j + 1, i).map(getProduct).find((p) => p && p.id !== a.id && p.category === a.category);
    if (between) return compare([between, a]);
  }
  // or several models of one category viewed in a row
  const recent = [...new Set(seq.slice(-5))].map(getProduct).filter(Boolean);
  const cur = getProduct(s.currentProductId);
  if (cur) {
    const same = recent.filter((p) => p.category === cur.category);
    if (same.length >= 3) return compare(same.slice(-3));
  }
  return null;

  function compare(items) {
    const names = items.map((p) => p.name);
    const and = s.lang === "en" ? "and" : "a";
    const list = names.length === 2 ? `${names[0]} ${and} ${names[1]}` : `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}`;
    return {
      kind: "hes-compare",
      id: `hes-compare:${items.map((p) => p.id).sort().join("+")}`,
      situation: `Zákazník se vrací mezi produkty ${list} a zjevně se nemůže rozhodnout.`,
      facts: { products: items.map(brief) },
      ...(s.lang === "en"
        ? { fallback: `Looks like you're deciding between the ${list}. Shall I tell you in a few sentences how they differ and which suits what?`, actions: [{ label: "Yes, compare them", ask: `I'm torn between the ${list}. How do they differ and which would you recommend?` }] }
        : { fallback: `Vypadá to, že se rozhodujete mezi ${list}. Mám vám v pár větách říct, v čem se liší a který se hodí na co?`, actions: [{ label: "Ano, porovnejte je", ask: `Váhám mezi ${list}. V čem se liší a který byste mi doporučila?` }] }),
    };
  }
}

/** Long, attentive time on one product: reading, re-reading specs, hovering over "add to cart". */
function productHesitation(s, cat) {
  const p = cat.getProduct(s.currentProductId);
  if (s.pageType !== "product" || !p || s.cart.some((c) => c.id === p.id)) return null;
  const b = s.behaviour;
  const studying = b.rereads >= 2 || b.tabs.includes("params");
  const deciding = b.hoverAdd >= 1;
  const thinking = b.idleSec >= 12 && b.activeSec >= 8; // stopped moving – reading or thinking
  const long = b.activeSec >= 25;
  if (!(long || thinking || (b.activeSec >= 10 && (studying || deciding)))) return null;

  if (deciding) {
    return {
      kind: "hes-product",
      id: `hes-product:${p.id}`,
      situation: `Zákazník dlouho zvažuje ${p.name}, několikrát najel na tlačítko Do košíku, ale nekoupil – má nejspíš poslední pochybnost.`,
      facts: { product: brief(p) },
      ...(s.lang === "en"
        ? { fallback: `Not sure about the ${p.name}? Happy to answer any last questions – like whether it fits exactly what you need.`, actions: [{ label: "I have a question", ask: `I'm not sure whether to get the ${p.name}. Is it really right for me?` }] }
        : { fallback: `Váháte, jestli ${p.name} vzít? Ráda zodpovím poslední otázky – třeba jestli se hodí přesně na to, co potřebujete.`, actions: [{ label: "Mám jednu otázku", ask: `Váhám, jestli si vzít ${p.name}. Hodí se opravdu pro mě?` }] }),
    };
  }
  if (studying) {
    return {
      kind: "hes-product",
      id: `hes-product:${p.id}`,
      situation: `Zákazník opakovaně čte parametry produktu ${p.name} – technické údaje mu nejspíš nejsou jasné.`,
      facts: { product: brief(p), paramNames: Object.keys(p.params).slice(0, 6) },
      ...(s.lang === "en"
        ? { fallback: `The specs of the ${p.name} can be a bit of a jungle. Shall I explain in plain words what they mean for everyday use?`, actions: [{ label: "Yes, explain it", ask: `Can you explain the specs of the ${p.name} in plain words? What matters for everyday use?` }] }
        : { fallback: `Parametry u ${p.name} umí být trochu džungle. Mám vám lidsky vysvětlit, co znamenají pro běžné používání?`, actions: [{ label: "Ano, vysvětlete mi to", ask: `Můžete mi lidsky vysvětlit parametry ${p.name}? Co z nich je pro běžné používání důležité?` }] }),
    };
  }
  return {
    kind: "hes-product",
    id: `hes-product:${p.id}`,
    situation: `Zákazník už delší dobu přemýšlí nad produktem ${p.name} a neví si rady.`,
    facts: { product: brief(p) },
    ...(s.lang === "en"
      ? { fallback: `Thinking about the ${p.name}? I'm happy to say whether it's the right choice for you – or find something that fits better.`, actions: [{ label: "Yes, advise me", ask: `I'm thinking about the ${p.name}. Is it a good choice for me?` }] }
      : { fallback: `Rozmýšlíte se nad ${p.name}? Ráda poradím, jestli je to pro vás ta pravá volba – nebo najdu něco, co sedne líp.`, actions: [{ label: "Ano, poraďte mi", ask: `Rozmýšlím se nad ${p.name}. Je to pro mě dobrá volba?` }] }),
  };
}

/** Changing filters and sorting over and over without opening a product. */
function filterChurn(s, catalog) {
  if (s.pageType !== "category" || s.behaviour.filterChanges < 3) return null;
  const cat = s.category ? catalog.categoryName(s.category) : s.lang === "en" ? "this category" : "této kategorii";
  return {
    kind: "hes-filters",
    id: `hes-filters:${s.category ?? "all"}`,
    situation: `Zákazník v kategorii ${cat} opakovaně mění filtry a řazení a nemůže najít to pravé.`,
    facts: { category: cat },
    ...(s.lang === "en"
      ? { fallback: `Can't find the right one in ${cat}? Tell me what you need it for and your budget, and I'll pick the 2–3 best.`, actions: [{ label: "Yes, pick for me", ask: `I'm choosing in ${cat} and can't decide. Can you help me choose?` }] }
      : { fallback: `Nedaří se v kategorii ${cat} najít to pravé? Řekněte mi, k čemu to potřebujete a kolik chcete utratit, a vyberu vám 2–3 nejlepší.`, actions: [{ label: "Ano, vyberte mi", ask: `Vybírám v kategorii ${cat} a nemůžu se rozhodnout. Pomůžete mi vybrat?` }] }),
  };
}

/** Several searches in a row – the customer can't find the right words. */
function searchChurn(s) {
  const q = s.searches.slice(-3);
  if (q.length < 3 && !(q.length >= 2 && q.every((x) => x.results === 0))) return null;
  const tried = q.map((x) => `„${x.q}“`).join(", ");
  return {
    kind: "hes-search",
    id: `hes-search:${q.map((x) => x.q).join("|").toLowerCase()}`,
    situation: `Zákazník zkouší různá hledání (${tried}) a zjevně nemůže najít, co potřebuje.`,
    facts: { searches: q },
    ...(s.lang === "en"
      ? { fallback: `You've tried a few searches – ${tried}. Describe in your own words what you need and I'll find it.`, actions: [{ label: "Help me find it", ask: `I'm searching for ${tried} but can't find what I need. Can you help?` }] }
      : { fallback: `Zkoušíte to hledat různě – ${tried}. Popište mi vlastními slovy, co potřebujete, a najdu vám to.`, actions: [{ label: "Pomozte mi najít", ask: `Hledám ${tried}, ale nemůžu najít, co potřebuju. Pomůžete mi?` }] }),
  };
}

/** In the cart for a while without ordering, or removing things from it. */
function cartHesitation(s, cat) {
  if (s.pageType !== "cart" || !s.cart.length) return null;
  const b = s.behaviour;
  if (!(b.activeSec >= 18 || b.cartRemovals >= 1)) return null;
  const pc = cat.priceCart(s.cart);
  const info = cat.store.info ?? {};
  return {
    kind: "hes-cart",
    id: "hes-cart",
    situation: `Zákazník je v košíku${pc.total ? ` (celkem ${kc(pc.total)})` : ""} a váhá s dokončením objednávky${b.cartRemovals ? ", už něco odebral" : ""}.`,
    facts: {
      cartTotal: pc.total ? kc(pc.total) : null,
      freeShipping: pc.freeShippingFrom ? (pc.freeShippingRemaining ? `chybí ${kc(pc.freeShippingRemaining)}` : "splněno") : null,
      returns: info.vraceni ?? null,
      installments: info.splatky ?? null,
    },
    ...(s.lang === "en"
      ? { fallback: "Not sure about ordering? Happy to answer anything about delivery, payment or returns.", actions: [{ label: "Question about my order", ask: "I'm hesitating with my order. How do delivery, payment and returns work?" }] }
      : { fallback: "Váháte s objednávkou? Ráda zodpovím cokoli k dopravě, platbě nebo vrácení zboží.", actions: [{ label: "Mám dotaz k objednávce", ask: "Váhám s objednávkou. Jak funguje doprava, platba a případné vrácení?" }] }),
  };
}
