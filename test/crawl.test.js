// Reading products straight from a shop's website, against small fake shops served locally.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { crawlShop, ldProducts, pageText } from "../lib/crawl.js";

/** Serves `routes` (path → [contentType, body]) on 127.0.0.1; returns its base URL. */
async function shop(t, routes) {
  const server = http.createServer((req, res) => {
    const r = routes[req.url];
    if (!r) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": r[0] });
    res.end(typeof r[1] === "function" ? r[1](`http://127.0.0.1:${server.address().port}`) : r[1]);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}
const html = (body, head = "") => ["text/html; charset=utf-8", `<!doctype html><html><head><title>Obchod</title>${head}</head><body>${body}</body></html>`];
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const crawl = (base, opts = {}) => crawlShop("127.0.0.1", { startUrls: [base + "/"], seconds: 20, ...opts });

test("product pages from the sitemap, read from their Google product data", async (t) => {
  const base = await shop(t, {
    "/": html(`<a href="/kontakt">Kontakt</a>`),
    "/robots.txt": ["text/plain", (b) => `User-agent: *\nSitemap: ${b}/sitemap.xml`],
    "/sitemap.xml": ["application/xml", (b) => `<?xml version="1.0"?><urlset><url><loc>${b}/produkt/hrnek</loc></url><url><loc>${b}/produkt/konvice</loc></url><url><loc>${b}/kontakt</loc></url></urlset>`],
    "/produkt/hrnek": html("<h1>Hrnek</h1>", ld({
      "@context": "https://schema.org", "@graph": [
        { "@type": "BreadcrumbList", itemListElement: [{ name: "Domů" }, { name: "Nádobí" }, { name: "Hrnek" }] },
        { "@type": "Product", name: "Keramický hrnek", sku: "H-1", description: "<p>Ručně točený</p>", image: ["/img/hrnek.jpg"],
          brand: { name: "Hlína" }, offers: { "@type": "Offer", price: "349.00", priceCurrency: "CZK", availability: "https://schema.org/InStock" } },
      ],
    })),
    "/produkt/konvice": html("<h1>Konvice</h1>", ld({ "@type": "Product", name: "Konvice", category: "Nádobí > Konvice",
      offers: [{ price: 1290, availability: "OutOfStock", priceSpecification: [{ priceType: "https://schema.org/StrikethroughPrice", price: 1590 }] }] })),
    "/kontakt": html("<p>Ulice 1</p>"),
  });
  const r = await crawl(base);
  assert.equal(r.method, "structured");
  assert.equal(r.products.length, 2);
  const hrnek = r.products.find((p) => p.id === "H-1");
  assert.equal(hrnek.name, "Keramický hrnek");
  assert.equal(hrnek.price, 349);
  assert.equal(hrnek.brand, "Hlína");
  assert.equal(hrnek.image, `${base}/img/hrnek.jpg`);
  assert.equal(hrnek.description, "Ručně točený");
  assert.equal(r.categories.find((c) => c.id === hrnek.category).name, "Nádobí");
  const konvice = r.products.find((p) => p.name === "Konvice");
  assert.equal(konvice.stock, 0);
  assert.equal(konvice.oldPrice, 1590);
  assert.equal(r.categories.find((c) => c.id === konvice.category).name, "Konvice");
});

test("no sitemap: pages are found by following links; Open Graph product tags count too", async (t) => {
  const base = await shop(t, {
    "/": html(`<a href="/kategorie">Vše</a> <a href="/kosik">Košík</a> <a href="https://jiny-web.cz/x">jinam</a>`),
    "/kategorie": html(`<a href="/svicka">Svíčka</a> <a href="/obrazek.jpg">foto</a>`),
    "/svicka": html("<h1>Svíčka</h1>", `<meta property="og:type" content="product"><meta property="og:title" content="Sójová svíčka">
      <meta property="product:price:amount" content="259"><meta property="og:image" content="/svicka.jpg">`),
    "/kosik": html("košík"),
  });
  const r = await crawl(base);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].name, "Sójová svíčka");
  assert.equal(r.products[0].price, 259);
  assert.equal(r.products[0].image, `${base}/svicka.jpg`);
});

test("Shopify stores: every product from /products.json", async (t) => {
  const base = await shop(t, {
    "/": html("shop"),
    "/products.json?limit=250&page=1": ["application/json", JSON.stringify({ products: [
      { id: 7, title: "Mýdlo", handle: "mydlo", body_html: "<b>Levandule</b>", vendor: "Ruční", product_type: "Kosmetika",
        variants: [{ price: "120.00", compare_at_price: "150.00", available: true }], images: [{ src: "https://cdn.x/m.jpg" }] },
    ] })],
  });
  const r = await crawl(base);
  assert.equal(r.method, "shopify");
  assert.equal(r.products[0].name, "Mýdlo");
  assert.equal(r.products[0].price, 120);
  assert.equal(r.products[0].oldPrice, 150);
  assert.equal(r.products[0].url, `${base}/products/mydlo`);
});

test("a feed at a usual address is used when the shop has one", async (t) => {
  const base = await shop(t, {
    "/": html("shop"),
    "/heureka.xml": ["application/xml", `<SHOP><SHOPITEM><ITEM_ID>1</ITEM_ID><PRODUCTNAME>Čaj</PRODUCTNAME><PRICE_VAT>99</PRICE_VAT></SHOPITEM></SHOP>`],
  });
  const r = await crawl(base);
  assert.equal(r.method, "feed");
  assert.equal(r.products[0].name, "Čaj");
});

test("a website that can't be opened is reported", async () => {
  await assert.rejects(crawlShop("127.0.0.1", { startUrls: ["http://127.0.0.1:9/"], seconds: 5 }), /nepodařilo otevřít/);
});

test("page text for Claude keeps product links and pictures", () => {
  const text = pageText(`<html><head><title>Svíčky</title><style>.x{}</style></head><body><nav><a href="/kosik">Košík</a></nav>
    <div class="p"><img src="/a.jpg" alt="Levandule"><a href="/svicka-levandule">Levandulová svíčka</a><span>259&nbsp;Kč</span></div>
    <script>var x = 1;</script></body></html>`, "https://obchod.cz/svicky");
  assert.match(text, /^Svíčky/);
  assert.match(text, /\[obrázek Levandule: https:\/\/obchod\.cz\/a\.jpg\]/);
  assert.match(text, /\[odkaz https:\/\/obchod\.cz\/svicka-levandule\] Levandulová svíčka/);
  assert.match(text, /259 Kč/);
  assert.doesNotMatch(text, /var x|\.x\{|kosik/);
});

test("JSON-LD that isn't valid JSON is skipped", () => {
  assert.deepEqual(ldProducts(`<script type="application/ld+json">{ broken</script>`, "https://x.cz/"), []);
});
