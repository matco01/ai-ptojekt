// Writes the test shop into public/ as plain files (Vercel serves them as they are).
// Run it again after changing embed.html – that's the place where the "owner" pastes Sella's code:
//   node build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATS, PRODUCTS, INFO, BLOG } from "./data.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "public");
const embed = fs.existsSync(path.join(here, "embed.html"))
  ? fs.readFileSync(path.join(here, "embed.html"), "utf8").split("\n").filter((l) => !l.trim().startsWith("<!--")).join("\n").trim()
  : "";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kc = (n) => n.toLocaleString("cs-CZ") + " Kč";
const img = (p) => `/img/${p.slug}.svg`;
const hue = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

function layout(title, body, { head = "", desc = "Vybavení na hory: stany, spacáky, batohy, obuv a oblečení od rodinného obchodu z Brna." } = {}) {
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} | Horský Svět</title>
<meta name="description" content="${esc(desc)}"><meta name="robots" content="noindex"><meta property="og:site_name" content="Horský Svět"><link rel="icon" href="/logo.svg">
<style>:root{--g:#2f6b4f}*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,"Segoe UI",Arial,sans-serif;color:#1f2a24;background:#f6f7f4}a{color:var(--g)}
.note{background:#1f2a24;color:#fff;font-size:13px;text-align:center;padding:5px 12px}
header{background:var(--g);color:#fff;padding:14px 24px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}header a{color:#fff;text-decoration:none}.logo{font-weight:800;font-size:22px}
nav{display:flex;gap:14px;flex-wrap:wrap;font-size:14.5px}main{max-width:1100px;margin:0 auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.card{background:#fff;border-radius:12px;padding:14px;box-shadow:0 1px 3px #0002}.card img,.pimg{width:100%;border-radius:8px;background:#e7ece6}.price{font-weight:700;font-size:18px}.old{text-decoration:line-through;color:#888;margin-left:8px;font-weight:400}
.detail{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}@media(max-width:700px){.detail{grid-template-columns:1fr}}
button.add-to-cart,.btn{background:var(--g);color:#fff;border:0;border-radius:8px;padding:11px 18px;font-size:15px;cursor:pointer;text-decoration:none;display:inline-block}button[disabled]{background:#aaa}
footer{padding:24px;text-align:center;color:#667;font-size:14px}footer a{margin:0 6px}table{border-collapse:collapse}td,th{border:1px solid #ccd;padding:6px 10px}form.s{margin-left:auto}input{padding:8px;border:1px solid #ccd;border-radius:6px}</style>${head}</head><body>
<div class="note">Testovací e-shop k vyzkoušení Selly. Firma je smyšlená, nic se tu neprodává a objednávky nikam nejdou.</div>
<script>window.dataLayer=window.dataLayer||[];</script>
<header><a class="logo" href="/">Horský Svět</a><nav>${Object.entries(CATS).map(([k, v]) => `<a href="/kategorie/${k}">${v}</a>`).join("")}</nav><form class="s" action="/hledat"><input name="q" placeholder="Hledat…" aria-label="Hledat"></form><a href="/kosik" class="cart-link">Košík (<span id="cc">0</span>)</a></header>
<main>${body}</main><footer>${Object.entries(INFO).map(([k, v]) => `<a href="/info/${k}">${v[0]}</a>`).join("")}<a href="/blog">Blog</a></footer>
<script>
const cart=()=>JSON.parse(localStorage.getItem("hs-cart")||"[]");const setCart=(c)=>{localStorage.setItem("hs-cart",JSON.stringify(c));document.getElementById("cc").textContent=c.reduce((n,i)=>n+i.q,0)};setCart(cart());
document.addEventListener("click",(e)=>{const b=e.target.closest(".add-to-cart");if(!b)return;const c=cart(),l=c.find(i=>i.id===b.dataset.id);if(l)l.q++;else c.push({id:b.dataset.id,name:b.dataset.name,price:+b.dataset.price,q:1});setCart(c);
window.dataLayer.push({event:"add_to_cart",ecommerce:{currency:"CZK",items:[{item_id:b.dataset.id,item_name:b.dataset.name,price:+b.dataset.price,quantity:1}]}});b.textContent="Přidáno ✓"});
</script>
${embed}
</body></html>`;
}

const card = (p) => `<div class="card"><a href="/produkt/${p.slug}"><img src="${img(p)}" alt="${esc(p.name)}" width="220" height="160" loading="lazy"><h3>${esc(p.name)}</h3></a><div class="price">${kc(p.price)}${p.old ? `<span class="old">${kc(p.old)}</span>` : ""}</div><small>${p.stock ? "Skladem" : "Vyprodáno"}</small></div>`;

function productPage(p) {
  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, sku: p.id, brand: { "@type": "Brand", name: p.brand }, description: p.desc, image: img(p), category: CATS[p.cat],
    offers: {
      "@type": "Offer", url: `/produkt/${p.slug}`, price: p.price, priceCurrency: "CZK", availability: `https://schema.org/${p.stock ? "InStock" : "OutOfStock"}`,
      ...(p.old ? { priceSpecification: [{ "@type": "UnitPriceSpecification", priceType: "https://schema.org/ListPrice", price: p.old, priceCurrency: "CZK" }] } : {}),
    },
  };
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: CATS[p.cat], item: `/kategorie/${p.cat}` }, { "@type": "ListItem", position: 2, name: p.name }] };
  return layout(p.name, `<p><a href="/kategorie/${p.cat}">${CATS[p.cat]}</a></p><h1>${esc(p.name)}</h1><div class="detail"><img class="pimg" src="${img(p)}" alt="" height="320">
    <div><p>Značka: ${esc(p.brand)} · Kód: ${p.id}</p><p class="price">${kc(p.price)}${p.old ? `<span class="old">${kc(p.old)}</span>` : ""}</p><p>${p.stock ? `Skladem (${p.stock} ks)` : "Momentálně vyprodáno"}</p>
    <button class="add-to-cart" data-id="${p.id}" data-name="${esc(p.name)}" data-price="${p.price}"${p.stock ? "" : " disabled"}>Do košíku</button><h2>Popis</h2><p>${esc(p.desc)}</p></div></div>
    <script>window.dataLayer.push({event:"view_item",ecommerce:{currency:"CZK",value:${p.price},items:[{item_id:${JSON.stringify(p.id)},item_name:${JSON.stringify(p.name)},price:${p.price},quantity:1}]}});</script>`,
  { desc: p.desc, head: `<script type="application/ld+json">${JSON.stringify(ld)}</script><script type="application/ld+json">${JSON.stringify(crumbs)}</script><meta property="og:type" content="product">` });
}

const SEARCH = `<h1 id="sh">Hledání</h1><div class="grid" id="hits"></div><script>
const q=new URLSearchParams(location.search).get("q")||"",L=${JSON.stringify(PRODUCTS.map((p) => ({ n: p.name, s: p.slug, p: p.price, st: p.stock })))};
document.getElementById("sh").textContent="Hledání: "+q;const h=L.filter(x=>x.n.toLowerCase().includes(q.toLowerCase()));
document.getElementById("hits").innerHTML=h.map(x=>'<div class="card"><a href="/produkt/'+x.s+'"><img src="/img/'+x.s+'.svg" alt="" width="220" height="160"><h3>'+x.n.replace(/</g,"&lt;")+'</h3></a><div class="price">'+x.p.toLocaleString("cs-CZ")+' Kč</div></div>').join("")||"<p>Nic jsme nenašli.</p>";
window.dataLayer.push({event:"search",search_term:q});</script>`;
const CART = `<h1>Košík</h1><div id="lines"></div><p><a class="btn" id="checkout" href="/pokladna">K pokladně</a></p><script>document.getElementById("lines").innerHTML=(JSON.parse(localStorage.getItem("hs-cart")||"[]")).map(i=>"<p>"+i.q+"× "+i.name.replace(/</g,"&lt;")+" – "+i.price+" Kč</p>").join("")||"<p>Košík je prázdný.</p>";</script>`;
const CHECKOUT = `<h1>Pokladna</h1><p>Testovací pokladna: žádné údaje se nikam neposílají ani neukládají.</p><form action="/objednavka/dekujeme"><p><input name="jmeno" placeholder="Jméno" required></p><button class="btn" id="order">Objednat</button></form>`;
const THANKS = `<h1>Děkujeme za objednávku!</h1><p>Testovací objednávka: nic se neposílá.</p><script>const c=JSON.parse(localStorage.getItem("hs-cart")||"[]");if(c.length){window.dataLayer.push({event:"purchase",ecommerce:{transaction_id:"T"+Date.now(),currency:"CZK",value:c.reduce((n,i)=>n+i.q*i.price,0),items:c.map(i=>({item_id:i.id,item_name:i.name,price:i.price,quantity:i.q}))}});localStorage.removeItem("hs-cart");}</script>`;

fs.rmSync(OUT, { recursive: true, force: true });
const write = (rel, text) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

write("index.html", layout("Vybavení na hory", `<h1>Vše na hory, od stanu po čelovku</h1><p>Rodinný obchod z Brna, přes ${PRODUCTS.length} ověřených produktů. Doprava zdarma nad 2 500 Kč.</p><h2>Ve slevě</h2><div class="grid">${PRODUCTS.filter((p) => p.old).slice(0, 8).map(card).join("")}</div><h2>Kategorie</h2><ul>${Object.entries(CATS).map(([k, v]) => `<li><a href="/kategorie/${k}">${v}</a></li>`).join("")}</ul>`));
write("logo.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#fff"/><path d="M6 54 26 16l12 21 7-11 13 28z" fill="#2f6b4f"/></svg>`);
for (const [k, v] of Object.entries(CATS)) write(`kategorie/${k}.html`, layout(v, `<h1>${v}</h1><div class="grid">${PRODUCTS.filter((p) => p.cat === k).map(card).join("")}</div>`));
for (const p of PRODUCTS) {
  write(`produkt/${p.slug}.html`, productPage(p));
  write(`img/${p.slug}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 160"><rect width="220" height="160" fill="hsl(${hue(p.slug)} 30% 75%)"/><path d="M0 160 70 60l40 50 30-30 80 80z" fill="hsl(${hue(p.slug)} 35% 40%)"/></svg>`);
}
for (const [k, [title, html]] of Object.entries(INFO)) write(`info/${k}.html`, layout(title, `<h1>${title}</h1>${html}`));
write("blog.html", layout("Blog", `<h1>Blog</h1>${BLOG.map((b) => `<p><a href="/blog/${b[0]}">${esc(b[1])}</a></p>`).join("")}`));
for (const [k, title, text] of BLOG) write(`blog/${k}.html`, layout(title, `<article><h1>${esc(title)}</h1><p>${esc(text)}</p></article>`));
write("hledat.html", layout("Hledání", SEARCH));
write("kosik.html", layout("Košík", CART));
write("pokladna.html", layout("Pokladna", CHECKOUT));
write("objednavka/dekujeme.html", layout("Děkujeme", THANKS));
write("404.html", layout("Stránka nenalezena", "<h1>Tuhle stránku jsme nenašli</h1>"));
console.log(`${PRODUCTS.length} produktů, ${Object.keys(INFO).length} informačních stránek, ${BLOG.length} článků; kód Selly: ${embed ? "vložený" : "zatím není"}`);
