// Writes the whole shop into public/ as plain files (Vercel serves them as they are).
// Run it again after changing data.mjs, src/ or embed.html – embed.html is where the "owner" pastes
// Sella's code, as a real shop owner would paste it into their site's footer:   node build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATS, PRODUCTS, INFO, BLOG } from "./data.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "public");
const embed = fs.readFileSync(path.join(here, "embed.html"), "utf8").split("\n").filter((l) => !l.trim().startsWith("<!--")).join("\n").trim();

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kc = (n) => n.toLocaleString("cs-CZ") + " Kč";
const num = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#2f6b4f"/><path d="M9 50 26 18l10 18 6-9 13 23z" fill="#fff"/><path d="m26 18 5 9-5 3-5-3z" fill="#bfe0cd"/></svg>`;

const CAT_LEAD = {
  stany: "Od ultralehkých jednotek na přechody po rodinné stany ke kempování u auta. U každého stanu uvádíme váhu i vodní sloupec.",
  spacaky: "Péřové i syntetické spacáky a karimatky. Vybírejte podle komfortní teploty, ne podle limitu.",
  batohy: "Denní batůžky, velké trekové batohy i dámské střihy. V Brně a Liberci vám batoh rádi seřídíme na záda.",
  obuv: "Pohorky s membránou, lehká letní obuv, zimní boty i ponožky. Při výměně velikosti hradíme poštovné my.",
  bundy: "Nepromokavé bundy, softshelly, peří a funkční vrstvy pro každé počasí.",
  lezeni: "Vybavení na ferraty a lezení s platnou certifikací. Bezpečnostní vybavení nikdy nekupujte z bazaru.",
  vareni: "Vařiče, nádobí, filtry na vodu a jídlo na cesty. Plynové kartuše prodáváme jen při osobním odběru.",
  doplnky: "Čelovky, navigace, trekové hole, mapy a vše ostatní, na co se před odjezdem snadno zapomene.",
};
const WHY = {
  stany: "Stan stavíme v prodejně, takže si ho před koupí můžete prohlédnout. Po každé výpravě ho nechte doma řádně vyschnout, prodloužíte mu tím život.",
  spacaky: "Spacák skladujte volně, ne v kompresním vaku. Do mrazů volte rezervu aspoň pět stupňů oproti očekávané teplotě.",
  batohy: "Správně seřízený batoh nese váhu na bocích, ne na ramenou. Těžké věci balte ke středu zad.",
  obuv: "Nové boty nejdřív rozchoďte na kratších trasách. Membránovou obuv čistěte vlažnou vodou a nesušte ji na topení.",
  bundy: "Technické oblečení perte v tekutém prostředku bez aviváže. Vrstvy kombinujte podle aktivity a počasí.",
  lezeni: "Bezpečnostní vybavení kontrolujte před každým použitím a dodržujte životnost uvedenou výrobcem.",
  vareni: "Vařič nikdy nepoužívejte v uzavřeném stanu. Spotřebu plynu počítejte i s rezervou na ohřev vody.",
  doplnky: "Před odjezdem všechno nabijte a zkontrolujte. Papírová mapa se hodí i tehdy, když máte navigaci.",
};
const ACCESSORY = { stany: ["Podložka pod stan Tatra 2", "Opravná sada na stany", "Karimatka Samonafukovací Air 5"], spacaky: ["Karimatka Pěnová Klasik", "Vložka do spacáku Hedvábí", "Stan Tatra 2 Lite"], batohy: ["Pláštěnka na batoh L", "Trekové hole Carbon", "Lahev Termo 1 l"], obuv: ["Ponožky Merino Trek", "Nesmeky Grip", "Trekové hole Carbon"], bundy: ["Merino triko Base 200", "Fleecová mikina Kotel", "Ponožky Merino Trek"], lezeni: ["Lezecká helma Štít", "Rukavice na ferraty", "Karabina HMS Zámek"], vareni: ["Kartuše 230 g", "Ešus Titan 750", "Filtr na vodu Čistá"], doplnky: ["Lékárnička Výprava", "Powerbanka Solar 20000", "Mapa Krkonoše 1:50 000"] };
const NAMES = ["Petr K.", "Jana M.", "Tomáš V.", "Lucie H.", "Martin S.", "Eva D.", "Ondra B.", "Klára N.", "Pavel R.", "Tereza Š."];
const REVIEW = {
  stany: ["Postavený za pár minut a přes noc v dešti zůstal suchý.", "Na týdenní přechod skvělá volba, váha odpovídá.", "Ocení hlavně větší předsíň, batoh se vejde dovnitř."],
  spacaky: ["V udávané komfortní teplotě mi bylo opravdu dobře.", "Sbalí se malý, do batohu ideální.", "Dobrý poměr ceny a výkonu, kupoval bych znovu."],
  batohy: ["Záda se krásně seřídí, ani s plnou zátěží netlačí.", "Spousta kapes, ale nepůsobí přeplácaně.", "V prodejně mi ho nastavili na míru, super servis."],
  obuv: ["Sedí dobře, doporučuji vyzkoušet o číslo větší.", "Po dvou dnech rozchozené, puchýře žádné.", "Podešev drží i na mokrém kameni."],
  bundy: ["V dešti i větru spolehlivá, dobře dýchá.", "Střih sedí, rukávy jsou dost dlouhé.", "Sbalí se malá a nezabere v batohu moc místa."],
  lezeni: ["Kvalitní zpracování, s ním se cítím bezpečně.", "Lehké a pohodlné i na celodenní ferratu.", "Rychlé dodání a dobrá rada od prodavače."],
  vareni: ["Funguje spolehlivě i ve větru.", "Lehké a dobře se s tím vaří na výpravě.", "Na vícedenní přechody přesně to, co jsem hledal."],
  doplnky: ["Praktická věc, kterou beru na každou výpravu.", "Výdrž odpovídá popisu, jsem spokojený.", "Za tu cenu velmi dobré."],
};

// ---- what the product pages show, worked out from the product's own facts
function enrich(p) {
  const h = num(p.slug);
  const weight = p.desc.match(/(\d+(?:,\d+)?)\s?(kg|g)\b(?!\/)/)?.[0] ?? null;
  const sizeText = p.desc.match(/velikosti\s+([0-9A-Z]+[–-][0-9A-Z]+)/)?.[1];
  let sizes = [];
  if (sizeText) {
    const [a, b] = sizeText.split(/[–-]/);
    if (/^\d+$/.test(a)) for (let n = Number(a); n <= Number(b); n++) sizes.push(String(n));
    else { const all = ["XS", "S", "M", "L", "XL", "XXL"]; sizes = all.slice(all.indexOf(a), all.indexOf(b) + 1); }
  }
  const count = p.stock === 999 ? 0 : 3 + (h % 46);
  const rating = 3.9 + ((h >>> 4) % 11) / 10;
  const reviews = REVIEW[p.cat].slice(0, Math.min(3, count)).map((text, i) => ({ who: NAMES[(h + i * 3) % NAMES.length], text, stars: Math.max(4, Math.round(rating) - (i === 2 ? 1 : 0)), when: `${1 + ((h >>> (i + 2)) % 27)}. ${1 + ((h >>> (i + 5)) % 9)}. 2026` }));
  return {
    ...p, sizes, weight, rating: Math.round(rating * 10) / 10, count, reviews,
    rank: count * rating, discount: p.old ? Math.round((1 - p.price / p.old) * 100) : 0,
    brno: p.stock ? (h % 5 ? "skladem" : "na objednání") : "není skladem", liberec: p.stock ? (h % 3 ? "skladem" : "na objednání") : "není skladem",
    pickup: /Kartuše/.test(p.name),
    warranty: p.cat === "stany" && p.brand === "Alpina" ? "5 let (prodloužená)" : "24 měsíců",
  };
}
const ITEMS = PRODUCTS.map(enrich);
const bySlugName = new Map(ITEMS.map((p) => [p.name, p]));
const BRANDS = ["Alpina", "Norden", "Severka"];
const pic = (p, n = 1) => `/img/${p.slug}-${n}.svg`;

// ---- pictures: drawn here, so nothing is borrowed from a real shop
const KIND = [[/Ponožky/, "sock"], [/Nesmeky/, "spikes"], [/hole/i, "poles"], [/Čelovka/, "lamp"], [/GPS/, "gps"], [/Mapa/, "map"], [/Lékárnička/, "aid"], [/Powerbanka/, "power"], [/ručník/i, "towel"], [/poukaz/i, "gift"],
  [/Karimatka/, "mat"], [/Lano/, "rope"], [/Karabina/, "biner"], [/úvazek/i, "harness"], [/Rukavice/, "glove"], [/Kartuše/, "can"], [/Ešus/, "cup"], [/Lahev/, "bottle"], [/Filtr/, "filter"], [/jídlo/i, "pouch"], [/Sandály/, "sandal"],
  [/Pláštěnka|Podložka|Opravná/, "pack"], [/kalhoty/i, "pants"], [/triko/i, "shirt"], [/Ferratový/, "biner"], [/magnézium/i, "pouch"], [/Plážový/, "shade"]];
const kindOf = (name) => KIND.find(([re]) => re.test(name))?.[1];
function art(cat, seed, view, name = "") {
  const h = num(seed) % 360, c = `hsl(${h} 42% 42%)`, c2 = `hsl(${(h + 28) % 360} 46% 30%)`, l = `hsl(${h} 45% 58%)`;
  const bg = ["#e6ece4", "#dfe8ec", "#efe9dd"][num(seed) % 3];
  const shapes = {
    stany: `<path d="M120 440 400 130l280 310z" fill="${c}"/><path d="M400 130 300 440h200z" fill="${c2}"/><path d="M400 250 350 440h100z" fill="#20342b"/><path d="M60 440h680" stroke="#7d8a78" stroke-width="10" stroke-linecap="round"/>`,
    spacaky: `<rect x="210" y="170" width="380" height="270" rx="120" fill="${c}"/><ellipse cx="240" cy="305" rx="72" ry="135" fill="${c2}"/><ellipse cx="240" cy="305" rx="38" ry="85" fill="${l}"/><path d="M320 180v250M420 174v262M520 182v246" stroke="${c2}" stroke-width="8" opacity=".55"/>`,
    batohy: `<rect x="255" y="120" width="290" height="360" rx="70" fill="${c}"/><rect x="295" y="280" width="210" height="150" rx="26" fill="${c2}"/><path d="M340 120q60-70 120 0" fill="none" stroke="${c2}" stroke-width="20"/><rect x="295" y="165" width="210" height="72" rx="20" fill="${l}"/><path d="M295 345h210" stroke="${l}" stroke-width="6"/>`,
    obuv: `<path d="M230 170h135l18 150 170 66q58 24 58 76v12H210q-22-160 20-304z" fill="${c}"/><path d="M203 474h418v22q0 24-30 24H230q-27 0-27-24z" fill="#2a2f2b"/><path d="M366 210l-66 12M372 250l-74 12M378 290l-82 12" stroke="${l}" stroke-width="10" stroke-linecap="round"/><path d="M230 170h135v32H226z" fill="${c2}"/>`,
    bundy: `<path d="M300 120h200l120 90-56 90-44-30v230H280V270l-44 30-56-90z" fill="${c}"/><path d="M340 120q60 56 120 0l-60 90z" fill="${c2}"/><path d="M400 200v350" stroke="${c2}" stroke-width="10"/><rect x="306" y="400" width="60" height="9" rx="4" fill="${l}"/><rect x="434" y="400" width="60" height="9" rx="4" fill="${l}"/>`,
    lezeni: `<path d="M210 370a190 190 0 0 1 380 0z" fill="${c}"/><rect x="190" y="360" width="420" height="34" rx="17" fill="${c2}"/><path d="M340 200v-20M400 190v-22M460 200v-20" stroke="${l}" stroke-width="16" stroke-linecap="round"/><path d="M260 400q140 110 280 0" fill="none" stroke="#2a2f2b" stroke-width="12"/>`,
    vareni: `<rect x="260" y="200" width="280" height="170" rx="20" fill="${c}"/><rect x="240" y="180" width="320" height="30" rx="14" fill="${c2}"/><path d="M560 240h72" stroke="${c2}" stroke-width="18" stroke-linecap="round"/><path d="M340 370l-40 110M460 370l40 110" stroke="#2a2f2b" stroke-width="14"/><path d="M370 120q18-34 0-60M430 120q18-34 0-60" fill="none" stroke="${l}" stroke-width="10" stroke-linecap="round"/>`,
    doplnky: `<circle cx="400" cy="300" r="165" fill="${c}"/><circle cx="400" cy="300" r="125" fill="#f6f6f0"/><path d="M400 200l46 100-46 100-46-100z" fill="${c2}"/><path d="M400 200l46 100h-92z" fill="#e4572e"/><rect x="376" y="100" width="48" height="42" rx="10" fill="${c2}"/>`,
  };
  const extra = {
    sock: `<path d="M320 110h130v220l130 110q44 38 6 72-30 24-76 8L340 440q-20-10-20-34z" fill="${c}"/><rect x="320" y="110" width="130" height="46" fill="${c2}"/><path d="M320 180h130M320 214h130" stroke="${l}" stroke-width="10"/>`,
    spikes: `<path d="M220 280q180-110 360 0l-20 120H240z" fill="none" stroke="${c}" stroke-width="24"/><path d="M250 400l-14 60M340 400l-14 60M430 400l14 60M520 400l14 60" stroke="#2a2f2b" stroke-width="14" stroke-linecap="round"/><path d="M240 400h320" stroke="#666d68" stroke-width="16" stroke-dasharray="20 12"/>`,
    poles: `<path d="M300 110l60 390M500 110l-60 390" stroke="${c}" stroke-width="16" stroke-linecap="round"/><rect x="270" y="90" width="56" height="90" rx="20" fill="${c2}" transform="rotate(-9 298 135)"/><rect x="474" y="90" width="56" height="90" rx="20" fill="${c2}" transform="rotate(9 502 135)"/><path d="M335 450h50M415 450h50" stroke="#2a2f2b" stroke-width="10"/>`,
    lamp: `<path d="M170 300q230-170 460 0" fill="none" stroke="${c2}" stroke-width="34"/><rect x="315" y="240" width="170" height="120" rx="28" fill="${c}"/><circle cx="400" cy="300" r="42" fill="#fff4c9"/><path d="M400 390v60M340 380l-34 48M460 380l34 48" stroke="#e5a11b" stroke-width="10" stroke-linecap="round"/>`,
    gps: `<rect x="290" y="100" width="220" height="400" rx="36" fill="${c2}"/><rect x="316" y="140" width="168" height="220" rx="10" fill="#dfeadf"/><path d="M330 330l50-90 40 50 30-40 26 80z" fill="${c}"/><circle cx="400" cy="430" r="30" fill="${l}"/>`,
    map: `<path d="M170 150l150 40 160-40 150 40v280l-150-40-160 40-150-40z" fill="#f4f1e5"/><path d="M320 190v280M480 150v280" stroke="#c9c4ad" stroke-width="5"/><path d="M200 340q70-120 140-40t120-30 130 60" fill="none" stroke="${c}" stroke-width="9" stroke-dasharray="16 10"/>`,
    aid: `<rect x="220" y="170" width="360" height="280" rx="34" fill="#c0403a"/><rect x="340" y="120" width="120" height="60" rx="16" fill="none" stroke="#8c2c28" stroke-width="20"/><path d="M400 240v140M330 310h140" stroke="#fff" stroke-width="40"/>`,
    power: `<rect x="270" y="130" width="260" height="340" rx="30" fill="${c2}"/><rect x="295" y="160" width="210" height="150" fill="#22354a"/><path d="M365 160v150M435 160v150M295 235h210" stroke="#6d8aa6" stroke-width="4"/><circle cx="400" cy="395" r="28" fill="${l}"/>`,
    towel: `<rect x="230" y="130" width="340" height="340" rx="20" fill="${c}"/><path d="M230 410h340" stroke="${l}" stroke-width="18"/><path d="M230 180h340" stroke="${c2}" stroke-width="14"/>`,
    gift: `<rect x="190" y="180" width="420" height="240" rx="22" fill="#1f4d3a"/><rect x="190" y="180" width="70" height="240" fill="#e4572e"/><text x="430" y="320" text-anchor="middle" font-family="Arial" font-weight="700" font-size="52" fill="#fff">1 000 Kč</text>`,
    mat: `<rect x="170" y="210" width="460" height="190" rx="95" fill="${c}"/><ellipse cx="200" cy="305" rx="56" ry="95" fill="${c2}"/><path d="M200 305a26 50 0 1 0 1 0" fill="none" stroke="${l}" stroke-width="8"/><path d="M300 215v180M400 212v186M500 214v182" stroke="${c2}" opacity=".4" stroke-width="6"/>`,
    rope: `<g fill="none" stroke="${c}" stroke-width="26"><ellipse cx="400" cy="300" rx="180" ry="150"/><ellipse cx="400" cy="300" rx="130" ry="105" stroke="${l}"/><ellipse cx="400" cy="300" rx="85" ry="64"/></g><path d="M400 150q20-60 80-50" fill="none" stroke="${c2}" stroke-width="24"/>`,
    biner: `<path d="M320 120h150q70 0 60 80l-40 220q-12 60-70 60h-70q-60 0-60-60V190q0-70 30-70z" fill="none" stroke="${c}" stroke-width="36"/><rect x="256" y="230" width="52" height="150" rx="12" fill="${c2}"/>`,
    harness: `<ellipse cx="400" cy="230" rx="190" ry="70" fill="none" stroke="${c}" stroke-width="44"/><ellipse cx="310" cy="400" rx="80" ry="58" fill="none" stroke="${c2}" stroke-width="30"/><ellipse cx="490" cy="400" rx="80" ry="58" fill="none" stroke="${c2}" stroke-width="30"/><path d="M400 300v60" stroke="${l}" stroke-width="26"/>`,
    glove: `<path d="M290 480V240q0-30 26-30t26 30v-70q0-30 28-30t28 30v60q0-30 28-30t28 30v30q0-26 26-26t26 26v190q0 50-50 50H330q-40 0-40-20z" fill="${c}"/><rect x="286" y="420" width="226" height="60" rx="10" fill="${c2}"/><path d="M290 340l-70-70q-24-20-40 0t6 44l104 110z" fill="${c}"/>`,
    can: `<rect x="280" y="210" width="240" height="250" rx="44" fill="#d9472f"/><path d="M340 210q0-60 60-60t60 60z" fill="#8d9490"/><rect x="376" y="110" width="48" height="44" rx="8" fill="#5e6560"/><rect x="280" y="290" width="240" height="60" fill="#fff" opacity=".85"/>`,
    cup: `<path d="M270 200h260l-20 250q-2 30-40 30H330q-38 0-40-30z" fill="#a9b0ac"/><ellipse cx="400" cy="200" rx="130" ry="30" fill="#6f7874"/><path d="M528 250q90-10 70 90t-82 70" fill="none" stroke="#7d8682" stroke-width="20"/>`,
    bottle: `<rect x="310" y="210" width="180" height="290" rx="44" fill="${c}"/><rect x="345" y="110" width="110" height="100" rx="18" fill="${c2}"/><rect x="310" y="310" width="180" height="46" fill="${l}"/>`,
    filter: `<rect x="330" y="130" width="140" height="290" rx="50" fill="${c}"/><rect x="330" y="240" width="140" height="44" fill="${c2}"/><path d="M400 130V80" stroke="${c2}" stroke-width="30"/><path d="M400 440q-30 40 0 70 30-30 0-70" fill="#5aa7d8"/>`,
    pouch: `<path d="M260 150h280l20 330q0 20-20 20H260q-20 0-20-20z" fill="${c}"/><rect x="260" y="150" width="280" height="44" fill="${c2}"/><circle cx="400" cy="340" r="84" fill="#f4f1e5"/><path d="M360 340q40-46 80 0t-80 0" fill="${c2}"/>`,
    sandal: `<path d="M180 420q0-30 40-30h340q60 0 60 50v20H180z" fill="#2a2f2b"/><path d="M270 390q20-130 90-130h40l60 130" fill="none" stroke="${c}" stroke-width="34"/><path d="M300 330h170" stroke="${c2}" stroke-width="26"/>`,
    pack: `<rect x="230" y="190" width="340" height="250" rx="26" fill="${c}"/><path d="M230 260h340" stroke="${c2}" stroke-width="16"/><rect x="340" y="230" width="120" height="60" rx="12" fill="${l}"/>`,
    pants: `<path d="M290 110h220l50 400h-110l-50-280-50 280H240z" fill="${c}"/><rect x="290" y="110" width="220" height="40" fill="${c2}"/><path d="M262 400h98M440 400h98" stroke="${l}" stroke-width="8"/>`,
    shirt: `<path d="M300 130q100 60 200 0l130 80-50 90-50-26v250H270V274l-50 26-50-90z" fill="${c}"/><path d="M340 130q60 44 120 0" fill="none" stroke="${c2}" stroke-width="14"/>`,
    shade: `<path d="M150 400q250-290 500 0z" fill="${c}"/><path d="M400 240v240" stroke="${c2}" stroke-width="14"/><circle cx="620" cy="150" r="46" fill="#f2c14e"/><path d="M90 450h620" stroke="#d9c79c" stroke-width="20"/>`,
  };
  const zoom = view === 2 ? `transform="translate(-260 -190) scale(1.65)"` : view === 3 ? `transform="translate(800 0) scale(-1 1)"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="${bg}"/>${view === 1 ? `<path d="M0 520 180 330l130 120 150-180 340 250z" fill="#000" opacity=".05"/>` : ""}<g ${zoom}>${extra[kindOf(name)] ?? shapes[cat]}</g></svg>`;
}
const SCENE = `<svg class="scene" viewBox="0 0 1600 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d4a3a"/><stop offset=".7" stop-color="#487f64"/><stop offset="1" stop-color="#e3a96d"/></linearGradient></defs><rect width="1600" height="700" fill="url(#sk)"/><circle cx="1230" cy="250" r="72" fill="#f4d9a4" opacity=".85"/><path d="M0 500 260 240l170 170 210-260 300 330 220-190 440 310v100H0z" fill="#285a46"/><path d="m640 150 74 90-52-14-46 36-30-36z" fill="#e8efe9" opacity=".85"/><path d="M0 590 300 390l230 170 260-150 300 170 260-120 250 110v130H0z" fill="#1a3f30"/><path d="M0 700V620l400-60 400 60 400-50 400 60v70z" fill="#10291f"/></svg>`;
const blogArt = (i) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice"><rect width="1200" height="520" fill="hsl(${150 + i * 26} 36% ${38 + (i % 3) * 6}%)"/><path d="M0 390 240 180l150 130 210-200 280 260 170-130 150 150v130H0z" fill="#000" opacity=".22"/><path d="M0 470 300 310l240 130 260-120 400 150v50H0z" fill="#000" opacity=".3"/></svg>`;

// ---- the page frame
const SERVICE = [["doprava-a-platba", "Doprava a platba"], ["vraceni-zbozi", "Vrácení zboží"], ["reklamace", "Reklamace a záruka"], ["velikostni-tabulky", "Velikostní tabulky"], ["faq", "Časté dotazy"]];
const ABOUT = [["o-nas", "O nás"], ["prodejny", "Naše prodejny"], ["kontakt", "Kontakt"], ["kariera", "Kariéra"]];
const OFFER = [["pujcovna", "Půjčovna vybavení"], ["vernostni-program", "Klub Horal"], ["darkove-poukazy", "Dárkové poukazy"]];
const LEGAL = [["obchodni-podminky", "Obchodní podmínky"], ["ochrana-osobnich-udaju", "Ochrana osobních údajů"], ["cookies", "Cookies"]];
const links = (rows) => rows.map(([k, v]) => `<a href="/info/${k}">${v}</a>`).join("");

function layout(title, body, { head = "", desc = "Vybavení na hory a do přírody: stany, spacáky, batohy, obuv a oblečení. Rodinný obchod z Brna, doprava zdarma nad 2 500 Kč." } = {}) {
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} | Horský Svět</title>
<meta name="description" content="${esc(desc)}"><meta name="robots" content="noindex"><meta name="theme-color" content="#1f4d3a"><meta property="og:site_name" content="Horský Svět"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<link rel="icon" href="/logo.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@600;700;800&family=Inter:wght@400;500;600&display=swap"><link rel="stylesheet" href="/assets/shop.css">${head}
<script>window.dataLayer=window.dataLayer||[];</script></head><body>
<div class="topbar"><div class="wrap"><span>Doprava zdarma nad 2 500 Kč · Objednávky do 14:00 odesíláme ještě týž den</span><span class="links"><a href="/info/prodejny">Prodejny</a><a href="/info/kontakt">Kontakt</a><a href="/blog">Blog</a></span></div></div>
<div class="mast"><div class="wrap"><a class="logo" href="/" aria-label="Horský Svět – úvod">${LOGO}Horský Svět</a>
<form class="search" action="/hledat" role="search"><input name="q" list="sg" placeholder="Hledat stan, spacák, boty…" aria-label="Hledat v obchodě" autocomplete="off"><button>Hledat</button></form>
<div class="mast-links"><a class="club-link" href="/info/vernostni-program">Klub Horal</a><button class="burger" type="button" aria-label="Menu">Menu</button><a class="cartbtn" href="/kosik" aria-label="Košík">Košík <b class="cc">0</b></a></div></div></div>
<nav class="catnav" aria-label="Kategorie"><div class="wrap">${Object.entries(CATS).map(([k, v]) => `<a href="/kategorie/${k}">${v}</a>`).join("")}<a class="sale" href="/vyprodej">Výprodej</a></div></nav>
${body}
<footer class="footer"><div class="wrap"><div class="cols"><div><a class="logo" href="/">${LOGO}Horský Svět</a><p>Vybavení do hor od lidí, kteří po nich sami chodí. Od roku 2009 z Brna.</p><p>Telefon +420 000 000 000<br>po–pá 9–17<br>info@horsky-svet.test</p></div>
<div><h4>Nákup a služby</h4>${links(SERVICE)}</div><div><h4>Pro vás</h4>${links(OFFER)}<a href="/vyprodej">Výprodej</a><a href="/blog">Blog a rady</a></div><div><h4>O nás</h4>${links(ABOUT)}${links(LEGAL)}</div></div>
<div class="pay" style="margin:-8px 0 20px"><span>Visa</span><span>Mastercard</span><span>Apple Pay</span><span>Google Pay</span><span>Zásilkovna</span><span>PPL</span><span>Essox</span></div>
<div class="legal">© 2026 Horský Svět s.r.o. · Ukázkový e-shop pro test AI prodavačky Sella: firma, zboží i hodnocení jsou smyšlené, nic se tu neprodává a objednávky nikam nejdou.</div></div></footer>
<script src="/assets/shop.js" defer></script>
${embed}
</body></html>`;
}
const crumbs = (...rows) => `<div class="wrap crumbs"><a href="/">Domů</a>${rows.map(([t, h]) => `<i>›</i>${h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`}`).join("")}</div>`;
const stars = (p) => (p.count ? `<span class="stars" title="${p.rating} z 5">${"★".repeat(Math.round(p.rating))}${"☆".repeat(5 - Math.round(p.rating))}<small>${String(p.rating).replace(".", ",")} (${p.count})</small></span>` : "");
const card = (p) => `<article class="card" data-brand="${esc(p.brand)}" data-price="${p.price}" data-stock="${p.stock ? 1 : 0}" data-sale="${p.old ? 1 : 0}" data-rank="${Math.round(p.rank)}">${p.discount ? `<span class="badge">−${p.discount} %</span>` : !p.stock ? `<span class="badge out">Vyprodáno</span>` : ""}<a href="/produkt/${p.slug}"><img src="${pic(p)}" alt="${esc(p.name)}" width="400" height="300" loading="lazy"></a><div class="in"><span class="brand">${esc(p.brand)}</span><h3><a href="/produkt/${p.slug}" style="color:inherit;text-decoration:none">${esc(p.name)}</a></h3>${stars(p)}<div class="bottom"><div class="price${p.old ? " sale" : ""}">${kc(p.price)}${p.old ? `<span class="old">${kc(p.old)}</span>` : ""}</div><div class="stock${p.stock ? "" : " no"}">${p.stock ? "Skladem" : "Momentálně vyprodáno"}</div></div></div></article>`;

// ---- pages
function listingPage(title, lead, items, { crumb, keyName } = {}) {
  const brands = [...new Set(items.map((p) => p.brand))];
  const max = Math.max(...items.map((p) => p.price));
  return layout(title, `${crumbs(crumb ?? [title])}<main class="wrap page"><h1>${esc(title)}</h1><p class="catlead">${esc(lead)}</p>
    <div class="catgrid"><form id="filters" class="filters" onsubmit="return false"><h4>Značka</h4>${brands.map((b) => `<label><input type="checkbox" name="brand" value="${esc(b)}"> ${esc(b)}</label>`).join("")}
      <h4>Cena do <span id="maxout"></span></h4><input type="range" id="maxprice" min="0" max="${max}" step="50" value="${max}" aria-label="Maximální cena">
      <h4>Dostupnost</h4><label><input type="checkbox" id="instock"> Jen skladem</label><label><input type="checkbox" id="onsale"> Jen ve slevě</label></form>
    <div><div class="toolbar"><span id="count"></span><button type="button" class="btn ghost small showfilters">Filtry</button><label>Řadit: <select id="sort" class="f"><option value="top">Nejprodávanější</option><option value="cheap">Nejlevnější</option><option value="dear">Nejdražší</option></select></label></div>
    <div class="grid" id="products">${items.map(card).join("")}</div></div></div></main>`, { desc: lead });
}

function productPage(p) {
  const cat = CATS[p.cat];
  const params = [["Značka", p.brand], ["Kód produktu", p.id], ["Kategorie", cat], ...(p.weight ? [["Hmotnost", p.weight]] : []), ...(p.sizes.length ? [["Velikosti", `${p.sizes[0]}–${p.sizes.at(-1)}`]] : []), ["Záruka", p.warranty]];
  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, sku: p.id, mpn: p.id, brand: { "@type": "Brand", name: p.brand }, description: p.desc, image: pic(p), category: cat,
    additionalProperty: params.slice(3).map(([name, value]) => ({ "@type": "PropertyValue", name, value })),
    ...(p.count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.count } } : {}),
    offers: { "@type": "Offer", url: `/produkt/${p.slug}`, price: p.price, priceCurrency: "CZK", availability: `https://schema.org/${p.stock ? "InStock" : "OutOfStock"}`, ...(p.old ? { priceSpecification: [{ "@type": "UnitPriceSpecification", priceType: "https://schema.org/ListPrice", price: p.old, priceCurrency: "CZK" }] } : {}) },
  };
  const bc = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: cat, item: `/kategorie/${p.cat}` }, { "@type": "ListItem", position: 2, name: p.name }] };
  const extras = (ACCESSORY[p.cat] ?? []).map((n) => bySlugName.get(n)).filter((x) => x && x.id !== p.id);
  const similar = ITEMS.filter((x) => x.cat === p.cat && x.id !== p.id && !extras.includes(x)).sort((a, b) => Math.abs(a.price - p.price) - Math.abs(b.price - p.price)).slice(0, 4);
  return layout(p.name, `${crumbs([cat, `/kategorie/${p.cat}`], [p.name])}<main class="wrap page"><div class="detail">
    <div class="gallery"><div class="main"><img src="${pic(p)}" alt="${esc(p.name)}" width="800" height="600"></div><div class="thumbs">${[1, 2, 3].map((n) => `<button type="button" class="${n === 1 ? "on" : ""}" data-src="${pic(p, n)}" aria-label="Obrázek ${n}"><img src="${pic(p, n)}" alt="" width="86" height="64" loading="lazy"></button>`).join("")}</div></div>
    <div class="buy"><div class="brandline">Značka ${BRANDS.includes(p.brand) ? `<a href="/znacka/${slug(p.brand)}">${esc(p.brand)}</a>` : esc(p.brand)} · Kód ${p.id}</div><h1>${esc(p.name)}</h1>${stars(p)}<p style="margin-top:10px">${esc(p.desc)}</p>
      <div class="buybox"><div class="price${p.old ? " sale" : ""}">${kc(p.price)}${p.old ? `<span class="old">${kc(p.old)}</span>` : ""}</div><div class="vat">včetně DPH${p.discount ? ` · ušetříte ${kc(p.old - p.price)} (${p.discount} %)` : ""}</div>
      <p class="stock${p.stock ? "" : " no"}" style="margin:8px 0 12px">${p.stock ? `Skladem na e-shopu${p.stock < 900 ? ` (${p.stock} ks)` : ""}` : "Momentálně vyprodáno"}</p>
      ${p.sizes.length ? `<span class="plabel">Velikost</span><div class="sizes">${p.sizes.map((s, i) => `<button type="button" class="${i === 0 ? "on" : ""}">${s}</button>`).join("")}</div>` : ""}
      <div class="buyrow"><span class="qty"><button type="button" data-d="-1" aria-label="Méně">−</button><input id="qty" value="1" inputmode="numeric" aria-label="Počet"><button type="button" data-d="1" aria-label="Více">+</button></span>
      <button class="btn add-to-cart" type="button" data-id="${p.id}" data-name="${esc(p.name)}" data-price="${p.price}" data-slug="${p.slug}" data-pickup="${p.pickup ? 1 : 0}"${p.stock ? "" : " disabled"}>${p.stock ? "Do košíku" : "Vyprodáno"}</button></div></div>
      <ul class="assure">${p.pickup ? "<li>Pouze osobní odběr v prodejně, poštou nelze zasílat</li>" : "<li>Doprava zdarma nad 2 500 Kč</li><li>Odesíláme do 14:00 ještě týž den</li>"}<li>Vrácení do 30 dnů bez udání důvodu</li><li>Záruka ${p.warranty}</li></ul></div></div>
    <div class="tabs"><div class="tabbar" role="tablist"><button class="on" data-tab="t1" type="button">Popis</button><button data-tab="t2" type="button">Parametry</button><button data-tab="t3" type="button">Hodnocení (${p.count})</button><button data-tab="t4" type="button">Dostupnost v prodejnách</button></div>
      <div class="tab" id="t1"><p>${esc(p.desc)}</p><h3>Na co myslet</h3><p>${esc(WHY[p.cat])}</p></div>
      <div class="tab" id="t2" hidden><table class="t">${params.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join("")}</table></div>
      <div class="tab" id="t3" hidden>${p.reviews.length ? p.reviews.map((r) => `<div class="review"><b>${esc(r.who)}</b><span class="stars">${"★".repeat(r.stars)}</span> <small>${r.when}</small><p>${esc(r.text)}</p></div>`).join("") : "<p>Zatím bez hodnocení.</p>"}</div>
      <div class="tab" id="t4" hidden><table class="t"><tr><th>Brno, Údolní 58</th><td>${p.brno}</td></tr><tr><th>Liberec, Pražská 12</th><td>${p.liberec}</td></tr></table></div></div>
    ${extras.length ? `<section style="margin-top:36px"><h2>Hodí se k tomu</h2><div class="grid">${extras.map(card).join("")}</div></section>` : ""}
    ${similar.length ? `<section style="margin-top:36px"><h2>Podobné produkty</h2><div class="grid">${similar.map(card).join("")}</div></section>` : ""}
  </main><script>window.dataLayer.push({event:"view_item",ecommerce:{currency:"CZK",value:${p.price},items:[{item_id:${JSON.stringify(p.id)},item_name:${JSON.stringify(p.name).replace(/</g, "\\u003c")},price:${p.price},quantity:1}]}});</script>`,
  { desc: p.desc, head: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script><script type="application/ld+json">${JSON.stringify(bc).replace(/</g, "\\u003c")}</script><meta property="og:type" content="product"><meta property="og:image" content="${pic(p)}">` });
}

const topSold = [...ITEMS].filter((p) => p.stock && p.price >= 500).sort((a, b) => b.rank - a.rank);
const HOME_LD = { "@context": "https://schema.org", "@type": "Store", name: "Horský Svět", description: "Rodinný obchod s vybavením do hor", telephone: "+420000000000", address: { "@type": "PostalAddress", streetAddress: "Údolní 58", addressLocality: "Brno", postalCode: "602 00", addressCountry: "CZ" } };
const QUOTES = [["Poradili mi se stanem i spacákem a na týden v Tatrách to vyšlo přesně.", "Jana, Brno"], ["Boty mi nesedly, výměnu velikosti vyřídili za dva dny a poštovné zaplatili.", "Martin, Olomouc"], ["Objednal jsem dopoledne a druhý den jsem měl balík v Zásilkovně.", "Tomáš, Liberec"]];
const HOME = `<section class="hero">${SCENE}<div class="wrap"><h1>Vybavení, na které se v horách spolehnete</h1><p>Rodinný obchod z Brna. Stany, spacáky, batohy a boty, které jsme sami vyzkoušeli na vlastních výpravách.</p><div class="row"><a class="btn" href="/kategorie/stany">Vybrat vybavení</a><a class="btn ghost" href="/vyprodej">Podívat se na výprodej</a></div></div></section>
<div class="perks"><div class="wrap"><div><b>Doprava zdarma</b><span>při nákupu nad 2 500 Kč</span></div><div><b>Odesíláme týž den</b><span>objednávky do 14:00</span></div><div><b>30 dní na vrácení</b><span>bez udání důvodu</span></div><div><b>Prodejny Brno a Liberec</b><span>vyzkoušíte si vše na místě</span></div></div></div>
<section class="block"><div class="wrap"><div class="head"><h2>Co hledáte?</h2></div><div class="tiles">${Object.entries(CATS).map(([k, v]) => `<a class="tile" href="/kategorie/${k}"><img src="/img/kat-${k}.svg" alt="" loading="lazy"><span>${v}</span></a>`).join("")}</div></div></section>
<section class="block tint"><div class="wrap"><div class="head"><h2>Nejprodávanější</h2><a href="/kategorie/stany">Celá nabídka →</a></div><div class="grid">${topSold.slice(0, 8).map(card).join("")}</div></div></section>
<section class="block"><div class="wrap"><div class="head"><h2>Výprodej</h2><a href="/vyprodej">Všechny slevy →</a></div><div class="grid">${ITEMS.filter((p) => p.old).sort((a, b) => b.discount - a.discount).slice(0, 4).map(card).join("")}</div></div></section>
<section class="block" style="padding-top:0"><div class="wrap"><div class="club"><div><h2>Klub Horal</h2><p>Registrace zdarma. Z každého nákupu sbíráte peníze na ten další a dozvíte se o akcích jako první.</p><a class="btn" href="/info/vernostni-program">Jak klub funguje</a></div><ul><li>3 % z každého nákupu zpět</li><li>5 % po útratě 10 000 Kč za rok</li><li>Slevový kód jen pro členy</li></ul></div></div></section>
<section class="block tint"><div class="wrap"><div class="head"><h2>Rady z hor</h2><a href="/blog">Všechny články →</a></div><div class="posts">${BLOG.slice(0, 3).map(([k, t, x], i) => `<a class="post" href="/blog/${k}"><img src="/img/blog-${i}.svg" alt="" loading="lazy"><div><h3>${esc(t)}</h3><p>${esc(x.slice(0, 95))}…</p></div></a>`).join("")}</div></div></section>
<section class="block"><div class="wrap"><div class="head"><h2>Co říkají zákazníci</h2></div><div class="quotes">${QUOTES.map(([q, w]) => `<blockquote class="quote" style="margin:0"><span class="stars">★★★★★</span><p style="margin:7px 0 0">${esc(q)}</p><cite>${esc(w)}</cite></blockquote>`).join("")}</div></div></section>
<section class="block tint"><div class="wrap news"><div><h2>Novinky a tipy na výlety</h2><p>Jednou za měsíc, bez spamu. Odhlásíte se jedním klikem.</p></div><form class="newsletter"><input class="f" type="email" required placeholder="Váš e-mail" aria-label="E-mail"><button class="btn dark">Odebírat</button></form></div></section>`;

const CHECKOUT = `${crumbs(["Košík", "/kosik"], ["Pokladna"])}<main class="wrap page"><h1>Pokladna</h1><div class="steps"><span>1. Košík</span><span>›</span><b>2. Doprava, platba a údaje</b><span>›</span><span>3. Hotovo</span></div>
<div class="demo-note">Ukázkový obchod: objednávka nikam nejde. Nevyplňujte skutečné údaje, nic se neukládá ani neodesílá.</div>
<form id="checkout-form" class="cartgrid"><div><fieldset class="fset"><legend>Doprava</legend><p id="pickup-note" class="demo-note" hidden>V košíku máte plynovou kartuši, tu lze převzít jen v prodejně.</p>
<label class="opt" data-mail><input type="radio" name="ship" value="zasilkovna" data-price="79" data-cz="1" data-label="Zásilkovna" checked> Zásilkovna – výdejní místo<span>79 Kč</span></label>
<label class="opt" data-mail><input type="radio" name="ship" value="ppl" data-price="119" data-cz="1" data-label="PPL kurýr"> PPL – kurýr na adresu<span>119 Kč</span></label>
<label class="opt" data-mail><input type="radio" name="ship" value="sk" data-price="149" data-cz="0" data-label="Packeta Slovensko"> Slovensko – Packeta<span>149 Kč</span></label>
<label class="opt"><input type="radio" name="ship" value="brno" data-price="0" data-cz="0" data-label="Odběr Brno"> Osobní odběr – Brno<span>zdarma</span></label>
<label class="opt"><input type="radio" name="ship" value="liberec" data-price="0" data-cz="0" data-label="Odběr Liberec"> Osobní odběr – Liberec<span>zdarma</span></label></fieldset>
<fieldset class="fset"><legend>Platba</legend>
<label class="opt"><input type="radio" name="pay" value="karta" checked> Platební karta online<span>zdarma</span></label><label class="opt"><input type="radio" name="pay" value="wallet"> Apple Pay / Google Pay<span>zdarma</span></label><label class="opt"><input type="radio" name="pay" value="prevod"> Bankovní převod<span>zdarma</span></label><label class="opt"><input type="radio" name="pay" value="dobirka" data-fee="39"> Dobírka<span>+39 Kč</span></label></fieldset>
<fieldset class="fset"><legend>Vaše údaje</legend><div class="fields"><label>Jméno a příjmení<input class="f" name="jmeno" required autocomplete="off"></label><label>E-mail<input class="f" type="email" name="email" required autocomplete="off"></label><label class="wide">Ulice a číslo<input class="f" name="ulice" autocomplete="off"></label><label>Město<input class="f" name="mesto" autocomplete="off"></label><label>PSČ<input class="f" name="psc" autocomplete="off"></label></div></fieldset></div>
<aside><div class="summary"><div id="co-sum"></div><button class="btn" id="order" style="width:100%;margin-top:14px">Odeslat objednávku</button></div></aside></form></main>`;

// ---- write it all
fs.rmSync(OUT, { recursive: true, force: true });
const write = (rel, text) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.copyFileSync(path.join(here, "src", "shop.css"), path.join(OUT, "assets", "shop.css"));
fs.copyFileSync(path.join(here, "src", "shop.js"), path.join(OUT, "assets", "shop.js"));
write("logo.svg", LOGO.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '));

write("index.html", layout("Vybavení na hory a do přírody", HOME, { head: `<script type="application/ld+json">${JSON.stringify(HOME_LD)}</script>` }));
for (const [k, v] of Object.entries(CATS)) {
  write(`kategorie/${k}.html`, listingPage(v, CAT_LEAD[k], ITEMS.filter((p) => p.cat === k).sort((a, b) => b.rank - a.rank)));
  write(`img/kat-${k}.svg`, art(k, k + "x", 1));
}
write("vyprodej.html", listingPage("Výprodej", "Zboží ve slevě, dokud nedojde. Slevy z výprodeje nelze kombinovat s Klubem Horal.", ITEMS.filter((p) => p.old).sort((a, b) => b.discount - a.discount)));
for (const b of BRANDS) write(`znacka/${slug(b)}.html`, listingPage(`Značka ${b}`, `Veškeré vybavení značky ${b}, které máme v nabídce.`, ITEMS.filter((p) => p.brand === b).sort((x, y) => y.rank - x.rank), { crumb: [`Značka ${b}`] }));
for (const p of ITEMS) {
  write(`produkt/${p.slug}.html`, productPage(p));
  for (const n of [1, 2, 3]) write(`img/${p.slug}-${n}.svg`, art(p.cat, p.slug, n, p.name));
}
const infoMenu = `<nav class="sidemenu" aria-label="Informace">${[...SERVICE, ...OFFER, ...ABOUT, ...LEGAL].map(([k, v]) => `<a href="/info/${k}">${v}</a>`).join("")}</nav>`;
const CONTACT_FORM = `<h2>Napište nám</h2><form class="contact fields"><label>Jméno<input class="f" required></label><label>E-mail<input class="f" type="email" required></label><label class="wide">Zpráva<textarea class="f" required></textarea></label><div class="wide"><button class="btn dark">Odeslat</button></div></form>`;
for (const [k, [title, html]] of Object.entries(INFO)) write(`info/${k}.html`, layout(title, `${crumbs([title])}<main class="wrap page twocol">${infoMenu}<article class="prose"><h1>${esc(title)}</h1>${html}${k === "kontakt" ? CONTACT_FORM : ""}</article></main>`));
write("blog.html", layout("Blog a rady z hor", `${crumbs(["Blog"])}<main class="wrap page"><h1>Blog a rady z hor</h1><div class="posts">${BLOG.map(([k, t, x], i) => `<a class="post" href="/blog/${k}"><img src="/img/blog-${i}.svg" alt="" loading="lazy"><div><h3>${esc(t)}</h3><p>${esc(x.slice(0, 110))}…</p></div></a>`).join("")}</div></main>`));
BLOG.forEach(([k, title, text], i) => {
  write(`img/blog-${i}.svg`, blogArt(i));
  const about = ITEMS.filter((p) => text.includes(p.name)).slice(0, 4);
  write(`blog/${k}.html`, layout(title, `${crumbs(["Blog", "/blog"], [title])}<main class="wrap page"><article class="prose" style="margin:0 auto"><div class="articlehero"><img src="/img/blog-${i}.svg" alt=""></div><h1>${esc(title)}</h1><p><small>Tým Horského Světa</small></p><p>${esc(text)}</p><p>Nejste si jistí výběrem? Zastavte se v prodejně v Brně nebo v Liberci, rádi poradíme.</p></article>${about.length ? `<section style="margin-top:32px"><h2>Zmíněné produkty</h2><div class="grid">${about.map(card).join("")}</div></section>` : ""}</main>`, { desc: text.slice(0, 150) }));
});
write("hledat.html", layout("Hledání", `${crumbs(["Hledání"])}<main class="wrap page"><h1 id="sh">Hledání</h1><p id="sc"></p><div class="grid" id="hits"></div></main><script>
const q=(new URLSearchParams(location.search).get("q")||"").trim(),L=${JSON.stringify(ITEMS.map((p) => ({ n: p.name, b: p.brand, s: p.slug, p: p.price, o: p.old, st: p.stock, d: p.desc }))).replace(/</g, "\\u003c")};
const nrm=(s)=>s.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"");const w=nrm(q).split(/\\s+/).filter(Boolean);
const h=w.length?L.filter(x=>{const t=nrm(x.n+" "+x.b+" "+x.d);return w.every(y=>t.includes(y))}):[];const e=(s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");const k=(n)=>n.toLocaleString("cs-CZ")+" Kč";
document.getElementById("sh").textContent=q?"Hledání: "+q:"Hledání";document.getElementById("sc").textContent=q?("Nalezeno produktů: "+h.length):"Zadejte, co hledáte.";
document.getElementById("hits").innerHTML=h.map(x=>'<article class="card"><a href="/produkt/'+x.s+'"><img src="/img/'+x.s+'-1.svg" alt="" width="400" height="300"></a><div class="in"><span class="brand">'+e(x.b)+'</span><h3>'+e(x.n)+'</h3><div class="bottom"><div class="price">'+k(x.p)+'</div><div class="stock'+(x.st?"":" no")+'">'+(x.st?"Skladem":"Momentálně vyprodáno")+'</div></div></div></article>').join("");
if(q)window.dataLayer.push({event:"search",search_term:q});</script>`));
write("kosik.html", layout("Košík", `${crumbs(["Košík"])}<main class="wrap page" id="cart-page"><h1>Košík</h1><div class="cartgrid"><div id="cart-lines"></div><aside><div class="summary"><div id="ship-note" class="ship-note"></div><div id="cart-sum"></div><a class="btn" id="checkout" href="/pokladna" style="width:100%;margin-top:14px">Pokračovat k pokladně</a></div></aside></div></main>`));
write("pokladna.html", layout("Pokladna", CHECKOUT));
write("objednavka/dekujeme.html", layout("Děkujeme za objednávku", `<main class="wrap page"><div class="okbox" id="order-done"><div class="tick">✓</div><h1>Děkujeme za objednávku!</h1><p>Číslo objednávky <b id="order-no"></b>. Ukázkový obchod: objednávka nikam nejde a nic vám nepřijde.</p><div class="summary" style="position:static;text-align:left"><h3>Shrnutí</h3><div id="order-lines"></div></div><p style="margin-top:20px"><a class="btn dark" href="/">Zpět do obchodu</a></p></div></main>`));
write("404.html", layout("Stránka nenalezena", `<main class="wrap page"><div class="okbox"><h1>Tuhle stránku jsme nenašli</h1><p>Možná se přesunula. Zkuste hledání nahoře, nebo se vraťte na úvod.</p><a class="btn" href="/">Na úvodní stránku</a></div></main>`));
console.log(`${ITEMS.length} produktů, ${Object.keys(INFO).length} informačních stránek, ${BLOG.length} článků; kód Selly: ${embed ? "vložený" : "zatím není"}`);
