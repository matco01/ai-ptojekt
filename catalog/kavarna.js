// The Bohème coffee roastery demo shop, as a real shop would give it to us: a Heureka XML
// product feed (served at /demo/kavarna-feed.xml) and product images (coffee bags drawn in SVG).
// JS module so serverless bundlers always ship it.

const ROAST = ["", "velmi světlé", "světlé", "střední", "tmavší", "tmavé"];
const coffees = [
  { id: "et", tone: "blush", origin: "Etiopie", region: "Yirgacheffe", name: "Etiopie Yirgacheffe", notes: ["jasmín", "bergamot", "broskev"], roast: 1, type: "filtr", price: 349,
    description: "Květinová a svěží káva z etiopského Yirgacheffe. V šálku jasmín, bergamot a zralá broskev. Nejlépe vynikne na filtru, V60 nebo Chemexu." },
  { id: "co", tone: "sage", origin: "Kolumbie", region: "Huila", name: "Kolumbie Huila", notes: ["karamel", "červené jablko", "kakao"], roast: 2, type: "filtr", price: 319,
    description: "Vyvážená a sladká káva, která chutná skoro každému. Karamel, červené jablko a kakao. Skvělá na filtr i do French pressu." },
  { id: "ke", tone: "sky", origin: "Keňa", region: "Nyeri", name: "Keňa Nyeri AA", notes: ["černý rybíz", "grapefruit", "třtina"], roast: 1, type: "filtr", price: 389,
    description: "Limitovaná šťavnatá Keňa s výraznou kyselinkou: černý rybíz, grapefruit a třtinový cukr. Pro ty, kdo mají rádi ovocnou kávu." },
  { id: "br", tone: "sand", origin: "Brazílie", region: "Santos", name: "Brazílie Santos", notes: ["oříšek", "mléčná čokoláda"], roast: 3, type: "espresso", price: 289,
    description: "Náš bestseller na espresso. Jemná, nízká kyselost, chuť oříšku a mléčné čokolády. Skvělá s mlékem – cappuccino, flat white." },
  { id: "gu", tone: "dark", origin: "Guatemala", region: "Antigua", name: "Guatemala Antigua", notes: ["hořká čokoláda", "kouř", "švestka"], roast: 4, type: "espresso", price: 329,
    description: "Plné a výrazné espresso s hořkou čokoládou, lehkým kouřem a švestkou. Pro milovníky klasické, silnější kávy." },
  { id: "bl", tone: "sand", origin: "Směs", region: "Bohème Blend", name: "Bohème Espresso Blend", notes: ["kakao", "lískový oříšek", "med"], roast: 3, type: "espresso", price: 299,
    description: "Naše domácí směs Brazílie a Kolumbie ladená na espresso. Kakao, lískový oříšek a med – spolehlivá do kávovaru i do moka konvičky." },
  { id: "rw", tone: "blush", origin: "Rwanda", region: "Nyamasheke", name: "Rwanda Nyamasheke", notes: ["brusinka", "čaj", "hibiscus"], roast: 1, type: "filtr", price: 359,
    description: "Jemná a čajová káva z Rwandy s tóny brusinky a ibišku. Lehké tělo, dlouhá sladká dochuť. Pro filtr." },
  { id: "dc", tone: "sage", origin: "Kolumbie", region: "Decaf · Sugarcane", name: "Kolumbie Decaf", notes: ["panela", "mandle", "pomeranč"], roast: 2, type: "decaf", price: 339,
    description: "Káva bez kofeinu, která tak nechutná. Kofein odstraněn šetrnou metodou z cukrové třtiny. Panela, mandle a pomeranč." },
];
const gear = [
  { id: "kiri", name: "Ruční mlýnek Kiri", price: 2490, category: "Vybavení | Mlýnky",
    description: "Ruční mlýnek s ocelovými kameny a 40 stupni hrubosti mletí – od espressa po French press. Na cesty i domů.",
    params: { "Kameny": "ocelové", "Stupně hrubosti": "40", "Kapacita": "25 g" } },
  { id: "goose", name: "Konvice Gooseneck", price: 1890, category: "Vybavení | Konvice",
    description: "Konvice s tenkým hrdlem pro přesné nalévání při přípravě filtrované kávy. Teploměr ve víku.",
    params: { "Objem": "0,9 l", "Teploměr": "ve víku", "Materiál": "nerez" } },
  { id: "barista", name: "Barista One", price: 12490, category: "Vybavení | Kávovary",
    description: "Plnoautomatický kávovar s vestavěným mlýnkem. Cappuccino i latte na jeden dotyk, snadné čištění.",
    params: { "Typ": "plnoautomat", "Mlýnek": "vestavěný keramický", "Napěňování": "automatické", "Tlak": "15 bar" } },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const item = (p) => `  <SHOPITEM>
    <ITEM_ID>${p.id}</ITEM_ID>
    <PRODUCTNAME>${esc(p.name)}</PRODUCTNAME>
    <DESCRIPTION>${esc(p.description)}</DESCRIPTION>
    <URL>${p.url}</URL>
    <IMGURL>/demo/kavarna/img/${p.id}.svg</IMGURL>
    <PRICE_VAT>${p.price}</PRICE_VAT>
    <MANUFACTURER>${esc(p.brand)}</MANUFACTURER>
    <CATEGORYTEXT>${esc(p.category)}</CATEGORYTEXT>
${Object.entries(p.params).map(([k, v]) => `    <PARAM><PARAM_NAME>${esc(k)}</PARAM_NAME><VAL>${esc(v)}</VAL></PARAM>`).join("\n")}
    <DELIVERY_DATE>0</DELIVERY_DATE>
  </SHOPITEM>`;

export const feedXml = `<?xml version="1.0" encoding="utf-8"?>
<SHOP>
${[
  ...coffees.map((c) => item({
    ...c, brand: "Bohème", url: `/kavarna?kava=${c.id}`,
    category: `Káva | ${c.type === "espresso" ? "Káva na espresso" : c.type === "decaf" ? "Káva bez kofeinu" : "Káva na filtr"}`,
    params: { "Chuťové tóny": c.notes.join(", "), "Pražení": ROAST[c.roast], "Příprava": c.type === "espresso" ? "espresso" : "filtr", "Země původu": c.origin, "Region": c.region, "Balení": "250 g, zrnková" },
  })),
  ...gear.map((g) => item({ ...g, brand: "Bohème", url: `/kavarna?vybaveni=${g.id}` })),
].join("\n")}
</SHOP>
`;

// ---- product images: the same illustrated bags as on the page ----
const TONES = {
  sage: { bag: "#a9b8a0", dark: "#8fa086", pic: "#e6ece1" },
  blush: { bag: "#e3b7a6", dark: "#cf9f8c", pic: "#f6e4dc" },
  sand: { bag: "#d8c3a5", dark: "#c3ab89", pic: "#f3ebdf" },
  sky: { bag: "#a9bfcb", dark: "#8ea7b5", pic: "#e3ebef" },
  dark: { bag: "#3a2a20", dark: "#2a1e17", pic: "#e9e0d6" },
};
const GEAR_ART = {
  kiri: `<rect x="38" y="50" width="44" height="80" rx="10" fill="#f3ece2"/><path d="M38 72h44M38 108h44"/><path d="M60 50V34"/><path d="M60 34h34"/><circle cx="98" cy="34" r="7" fill="#b06f3e" stroke="none"/><rect x="48" y="130" width="24" height="8" rx="3" fill="#231a14"/>`,
  goose: `<path d="M34 62h52l-4 64a8 8 0 0 1-8 8H46a8 8 0 0 1-8-8Z" fill="#f3ece2"/><path d="M34 76 Q12 70 8 44"/><path d="M86 72 Q104 74 102 96 Q100 114 84 112"/><rect x="48" y="50" width="24" height="12" rx="4" fill="#b06f3e" stroke="none"/>`,
  barista: `<rect x="20" y="22" width="80" height="112" rx="12" fill="#f3ece2"/><rect x="32" y="34" width="56" height="26" rx="5" fill="#231a14" stroke="none"/><circle cx="46" cy="47" r="4" fill="#b06f3e" stroke="none"/><path d="M52 76h16v8H52z"/><path d="M50 100h20l-2 18H52Z" fill="#fff"/><path d="M28 134h64"/>`,
};

export function kavarnaSvg(id) {
  if (GEAR_ART[id]) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -20 200 190"><rect x="-40" y="-20" width="200" height="190" fill="#faf6f0"/><g fill="none" stroke="#231a14" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${GEAR_ART[id]}</g></svg>`;
  }
  const c = coffees.find((x) => x.id === id);
  if (!c) return null;
  const t = TONES[c.tone];
  const ink = c.tone === "dark" ? "#f4e6d8" : "#231a14";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260">
    <rect width="200" height="260" fill="${t.pic}"/>
    <path d="M40 44 L160 44 L168 238 Q168 250 156 250 L44 250 Q32 250 32 238 Z" fill="${t.bag}"/>
    <rect x="36" y="18" width="128" height="32" rx="5" fill="${t.dark}"/>
    <circle cx="100" cy="74" r="7" fill="none" stroke="${ink}" stroke-opacity=".3" stroke-width="1.5"/>
    <rect x="56" y="100" width="88" height="118" rx="6" fill="#fffdf9"/>
    <text x="100" y="124" text-anchor="middle" font-family="sans-serif" font-size="8" letter-spacing="3" font-weight="700" fill="#b06f3e">BOHÈME</text>
    <path d="M76 132 H124" stroke="#e9e1d6"/>
    <text x="100" y="160" text-anchor="middle" font-family="Georgia, serif" font-size="19" fill="#231a14">${esc(c.origin)}</text>
    <text x="100" y="177" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="11" fill="#85766a">${esc(c.region)}</text>
    <text x="100" y="210" text-anchor="middle" font-family="sans-serif" font-size="6.5" letter-spacing="1.5" fill="#85766a">250 G · ZRNKOVÁ</text>
  </svg>`;
}
