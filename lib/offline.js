// Simplified rule-based replies used when no Claude API key is configured, so the
// demo can be clicked through end-to-end. The real conversational quality comes
// from Claude (lib/assistant.js); this only searches the catalog and answers FAQs.
// It answers in the page's language (context.lang: "cs" or "en"); on an English page the
// catalog is the English one, so the products and shop info come out in English too.
import { norm } from "./catalog.js";

// topics of the shop's info texts → what customers write (Czech and English)
const FAQ = [
  [/doprav|doruc|dodan|prijde|dojde|zitra|posil|deliver|shipping|ship\b|arrive/, "doprava"],
  [/vratit|vraceni|vymen|return|refund|exchange/, "vraceni"],
  [/splat|instalment|installment/, "splatky"],
  [/platb|zaplat|kartou|dobirk|payment|\bpay\b|card/, "platba"],
  [/zaruk|warrant|guarantee/, "zaruka"],
  [/reklam|complain|broken|faulty/, "reklamace"],
  [/vykup|stary telefon|stary mobil|trade.?in|old phone/, "vykup"],
  [/instal|zapoj|na zed|mount|set.?up/, "instalace"],
  [/kontakt|prodejn|oteviraci|telefon na vas|contact|opening|your store|address/, "kontakt"],
  [/predplat|subscri/, "predplatne"],
  [/namel|mlet|grind/, "mleti"],
];

function mentionedProducts(t, products) {
  return products.filter((p) => {
    const words = norm(p.name).split(" ").slice(0, 2).join(" ");
    return t.includes(words);
  });
}

function budget(t) {
  const m = t.match(/(?:do|under|below|up to|max\.?|less than)\s+(?:czk\s*)?(\d[\d\s,]*)\s*(tis|k\b|000)?/);
  if (!m) return undefined;
  let n = Number(m[1].replace(/[\s,]/g, ""));
  if (m[2] && n < 1000) n *= 1000;
  return n || undefined;
}

export function offlineChat({ text, context, send, catalog: cat, hasAttachments = false }) {
  const { store, products, getProduct, summary, searchProducts, activePromotions, promotionsFor, categoryName, detectCategory } = cat;
  const en = context.lang === "en";
  const L = (cs, eng) => (en ? eng : cs);
  const kc = (n) => (en ? n.toLocaleString("en-GB") + " CZK" : n.toLocaleString("cs-CZ") + " Kč");
  const productLine = (p) => `- **${p.name}** – ${kc(p.price)}${p.oldPrice ? ` (${L("místo", "instead of")} ${kc(p.oldPrice)})` : ""}: ${p.highlights.slice(0, 2).join(", ")}`;
  const t = norm(text);
  const say = (s) => send({ type: "text", delta: s });
  const show = (items) => items.length && send({ type: "products", items: items.slice(0, 3).map((p) => summary(p.id ? getProduct(p.id) : p)) });

  // "switch off / leave me alone" → say goodbye and close the window
  if (/\b(vypni|vypnout|zavri|zavrit|zmiz|odejdi|jdi pryc|dej mi pokoj|nech me|sbohem|nashle|konec|switch off|turn off|close|go away|leave me|bye|goodbye)\b/.test(t)) {
    say(L("Jasně, nebudu rušit. Kdybyste mě potřeboval(a), jsem v rohu stránky.", "Sure, I won't disturb you. If you need me, I'm in the corner of the page."));
    return send({ type: "close" });
  }
  if (hasAttachments) {
    return say(L("Fotky a soubory umím prohlédnout, až poběžím s AI – v ukázkovém režimu zatím ne. Napište mi prosím, co na nich je, a poradím.",
      "I can look at photos and files once I run with AI – not in this demo mode yet. Please tell me what's on them and I'll help."));
  }

  if (/^(ahoj|dobry den|zdravim|cau|hello|hi|hey|good (morning|afternoon|evening))\b/.test(t) && t.length < 25) {
    return say(L("Dobrý den! S čím vám můžu pomoct? Stačí napsat, co hledáte nebo k čemu to potřebujete.",
      "Hello! How can I help? Just tell me what you're looking for or what you need it for."));
  }

  // "take X out of the cart" – only where the shop lets us change its cart
  if (context.integration !== "auto" && /(odeb|odstran|vynd|smaz|vyhod|zrus|nechci|remove|delete|take out|don.?t want)/.test(t) && (/kosik|cart|basket/.test(t) || mentionedProducts(t, products).length)) {
    const cart = context.cart ?? [];
    const inCart = cart.map((c) => getProduct(c.id)).filter(Boolean);
    const target = mentionedProducts(t, products).find((p) => cart.some((c) => c.id === p.id)) || (inCart.length === 1 ? inCart[0] : null);
    if (!inCart.length) return say(L("Košík je teď prázdný, není co odebírat.", "Your cart is empty right now – there's nothing to remove."));
    if (!target) return say(L(`Kterou věc mám z košíku odebrat? Máte tam: ${inCart.map((p) => p.name).join(", ")}.`, `Which item should I remove from your cart? You have: ${inCart.map((p) => p.name).join(", ")}.`));
    const line = cart.find((c) => c.id === target.id);
    send({ type: "cart_remove", item: { id: target.id, name: target.name, quantity: line.quantity } });
    return say(L(`Hotovo, **${target.name}** jsem z košíku odebrala.`, `Done – I've removed the **${target.name}** from your cart.`));
  }

  const faq = FAQ.find(([re, topic]) => re.test(t) && store.info?.[topic]);
  if (faq) return say(store.info[faq[1]]);

  if (/porovn|rozdil|lepsi|versus|\bvs\b|compare|difference|better/.test(t)) {
    let items = mentionedProducts(t, products);
    if (items.length < 2) items = (context.viewedProductIds ?? []).concat(context.currentProductId ?? []).map(getProduct).filter(Boolean);
    items = [...new Map(items.map((p) => [p.id, p])).values()].slice(-3);
    if (items.length >= 2) {
      say(L(`Tady je rychlé srovnání:\n\n${items.map(productLine).join("\n")}\n\nKdyž mi řeknete, na co to budete hlavně používat, řeknu vám, který z nich bych vzala já.`,
        `Here's a quick comparison:\n\n${items.map(productLine).join("\n")}\n\nTell me what you'll mainly use it for and I'll say which one I'd pick.`));
      return show(items);
    }
  }

  if (/akce|slev|vyhod|zlevn|levnej|deal|sale|discount|offer|cheap/.test(t)) {
    const promos = activePromotions().filter((p) => p.type !== "service").slice(0, 4);
    const discounted = products.filter((p) => p.oldPrice).sort((a, b) => b.oldPrice - b.price - (a.oldPrice - a.price));
    if (promos.length) say(L(`Aktuálně stojí za pozornost:\n\n${promos.map((p) => `- **${p.title}**`).join("\n")}\n\nZajímá vás některá z nich víc?`,
      `Worth a look right now:\n\n${promos.map((p) => `- **${p.title}**`).join("\n")}\n\nWould you like to know more about any of them?`));
    else if (discounted.length) say(L(`Teď je ve slevě:\n\n${discounted.slice(0, 3).map(productLine).join("\n")}`, `On sale right now:\n\n${discounted.slice(0, 3).map(productLine).join("\n")}`));
    else return say(L("Teď bohužel žádnou akci ani slevu nemáme. Ráda vám ale pomůžu vybrat to, co se vám opravdu vyplatí.",
      "There are no deals or discounts right now, sorry. But I'm happy to help you pick what's really worth it."));
    return show(discounted);
  }

  const mentioned = mentionedProducts(t, products);
  if (mentioned.length === 1) {
    const p = mentioned[0];
    const promo = promotionsFor(p.id)[0];
    say(L(`**${p.name}** stojí ${kc(p.price)}${p.oldPrice ? ` (místo ${kc(p.oldPrice)})` : ""}. ${p.description}${promo ? `\n\nA ještě tip: ${promo.title}.` : ""}`,
      `The **${p.name}** costs ${kc(p.price)}${p.oldPrice ? ` (instead of ${kc(p.oldPrice)})` : ""}. ${p.description}${promo ? `\n\nAnd a tip: ${promo.title}.` : ""}`));
    return show([p]);
  }

  // the budget ("do 12 tisíc", "under 3000") is a filter, not a search word
  const query = t.replace(/(?:do|under|below|up to|max\.?|less than)\s+(?:czk\s*)?\d[\d\s,]*\s*(tis\w*|k\b|kc|korun|czk)?/g, " ");
  const results = searchProducts({ query, max_price: budget(t), limit: 3 });
  const category = detectCategory(t);
  if (results.length && category && /iphon|airpod|macbook|ipad|ps5|xbox|nintendo/.test(t) && !results.some((r) => norm(r.name).includes(t.split(" ")[0]))) {
    // asked for a brand we don't sell → say so honestly, then offer the closest alternatives
    const top = results.map((r) => getProduct(r.id));
    say(L(`Tuhle značku bohužel nevedeme, ale v kategorii ${categoryName(category)} mám podobné alternativy:\n\n${top.map(productLine).join("\n")}\n\nNa co to budete hlavně používat? Poradím, která je nejblíž tomu, co hledáte.`,
      `We don't carry that brand, sorry, but in ${categoryName(category)} I have similar alternatives:\n\n${top.map(productLine).join("\n")}\n\nWhat will you mainly use it for? I'll tell you which comes closest.`));
    return show(top);
  }
  if (results.length) {
    const top = results.map((r) => getProduct(r.id));
    const promo = promotionsFor(top[0].id).find((p) => p.type !== "service" || p.categories);
    say(L(`Na to bych vám ukázala tyhle:\n\n${top.map(productLine).join("\n")}${promo ? `\n\nA ať vám to neuteče: ${promo.title}.` : ""}`,
      `For that I'd show you these:\n\n${top.map(productLine).join("\n")}${promo ? `\n\nAnd don't miss this: ${promo.title}.` : ""}`));
    return show(top);
  }

  const current = getProduct(context.currentProductId);
  const here = current ? categoryName(current.category) : null;
  say(L(`Tohle přesně v nabídce asi nemáme${here ? `, ale v kategorii ${here} vám ráda poradím` : ""}. Zkuste mi říct, k čemu to potřebujete a kolik chcete zhruba utratit.`,
    `We probably don't have exactly that${here ? `, but I'm happy to help in ${here}` : ""}. Tell me what you need it for and roughly how much you'd like to spend.`));
}
