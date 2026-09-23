// Simplified rule-based replies used when no Claude API key is configured, so the
// demo can be clicked through end-to-end. The real conversational quality comes
// from Claude (lib/assistant.js); this only searches the catalog and answers FAQs.
import {
  store, products, getProduct, norm, searchProducts, summary, activePromotions, promotionsFor, categoryName, detectCategory,
} from "./catalog.js";

const kc = (n) => n.toLocaleString("cs-CZ") + " Kč";

const FAQ = [
  [/doprav|doruc|dodan|prijde|dojde|zitra|posil/, "doprava"],
  [/vratit|vraceni|vymen/, "vraceni"],
  [/splat/, "splatky"],
  [/platb|zaplat|kartou|dobirk/, "platba"],
  [/zaruk/, "zaruka"],
  [/reklam/, "reklamace"],
  [/vykup|stary telefon|stary mobil/, "vykup"],
  [/instal|zapoj|na zed/, "instalace"],
  [/kontakt|prodejn|oteviraci|telefon na vas/, "kontakt"],
];

function mentionedProducts(t) {
  return products.filter((p) => {
    const words = norm(p.name).split(" ").slice(0, 2).join(" ");
    return t.includes(words);
  });
}

function budget(t) {
  const m = t.match(/do\s+(\d[\d\s]*)\s*(tis|k\b|000)?/);
  if (!m) return undefined;
  let n = Number(m[1].replace(/\s/g, ""));
  if (m[2] && n < 1000) n *= 1000;
  return n || undefined;
}

function productLine(p) {
  return `- **${p.name}** – ${kc(p.price)}${p.oldPrice ? ` (místo ${kc(p.oldPrice)})` : ""}: ${p.highlights.slice(0, 2).join(", ")}`;
}

export function offlineChat({ text, context, send }) {
  const t = norm(text);
  const say = (s) => send({ type: "text", delta: s });
  const show = (items) => items.length && send({ type: "products", items: items.slice(0, 3).map((p) => summary(p.id ? getProduct(p.id) : p)) });

  if (/^(ahoj|dobry den|zdravim|cau|hello|hi)\b/.test(t) && t.length < 25) {
    return say(`Dobrý den! S čím vám můžu pomoct? Stačí napsat, co hledáte – třeba „telefon s dobrým foťákem do 12 tisíc“ nebo „sluchátka do letadla“.`);
  }

  const faq = FAQ.find(([re]) => re.test(t));
  if (faq) return say(store.info[faq[1]]);

  if (/porovn|rozdil|lepsi|versus|\bvs\b/.test(t)) {
    let items = mentionedProducts(t);
    if (items.length < 2) items = (context.viewedProductIds ?? []).concat(context.currentProductId ?? []).map(getProduct).filter(Boolean);
    items = [...new Map(items.map((p) => [p.id, p])).values()].slice(-3);
    if (items.length >= 2) {
      say(`Tady je rychlé srovnání:\n\n${items.map(productLine).join("\n")}\n\nKdyž mi řeknete, na co to budete hlavně používat, řeknu vám, který z nich bych vzala já.`);
      return show(items);
    }
  }

  if (/akce|slev|vyhod|zlevn|levnej/.test(t)) {
    const promos = activePromotions().filter((p) => p.type !== "service").slice(0, 4);
    say(`Aktuálně stojí za pozornost:\n\n${promos.map((p) => `- **${p.title}**`).join("\n")}\n\nZajímá vás některá z nich víc?`);
    return show(products.filter((p) => p.oldPrice).sort((a, b) => b.oldPrice - b.price - (a.oldPrice - a.price)));
  }

  const mentioned = mentionedProducts(t);
  if (mentioned.length === 1) {
    const p = mentioned[0];
    const promo = promotionsFor(p.id)[0];
    say(`**${p.name}** stojí ${kc(p.price)}${p.oldPrice ? ` (místo ${kc(p.oldPrice)})` : ""}. ${p.description}${promo ? `\n\nA ještě tip: ${promo.title}.` : ""}`);
    return show([p]);
  }

  // the budget ("do 12 tisíc") is a filter, not a search word
  const query = t.replace(/do\s+\d[\d\s]*\s*(tis\w*|k\b|kc|korun)?/g, " ");
  const results = searchProducts({ query, max_price: budget(t), limit: 3 });
  const cat = detectCategory(t);
  if (results.length && cat && /iphon|airpod|macbook|ipad|ps5|xbox|nintendo/.test(t) && !results.some((r) => norm(r.name).includes(t.split(" ")[0]))) {
    // asked for a brand we don't sell → say so honestly, then offer the closest alternatives
    const top = results.map((r) => getProduct(r.id));
    say(`Tuhle značku bohužel nevedeme, ale v kategorii ${categoryName(cat)} mám podobné alternativy:\n\n${top.map(productLine).join("\n")}\n\nNa co to budete hlavně používat? Poradím, která je nejblíž tomu, co hledáte.`);
    return show(top);
  }
  if (results.length) {
    const top = results.map((r) => getProduct(r.id));
    const promo = promotionsFor(top[0].id).find((p) => p.type !== "service" || p.categories);
    say(`Na to bych vám ukázala tyhle:\n\n${top.map(productLine).join("\n")}${promo ? `\n\nA ať vám to neuteče: ${promo.title}.` : ""}`);
    return show(top);
  }

  const here = context.currentProductId ? categoryName(getProduct(context.currentProductId)?.category) : null;
  say(`Tohle přesně v nabídce asi nemáme${here ? `, ale v kategorii ${here} vám ráda poradím` : ""}. Zkuste mi říct, k čemu to potřebujete a kolik chcete zhruba utratit.`);
}
