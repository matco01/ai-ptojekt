// robots.txt, sitemap.xml and the XML product feed need the site's full address, which is known only once
// it runs – so they're written here from the request. vercel.json leads the three addresses to this function.
import { CATS, PRODUCTS, INFO, BLOG } from "../data.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function handler(req, res) {
  const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const kind = new URL(req.url, origin).searchParams.get("f");
  if (kind === "robots") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end(`User-agent: *\nAllow: /\nDisallow: /pokladna\nSitemap: ${origin}/sitemap.xml\n`);
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  if (kind === "sitemap") {
    const urls = ["/", ...Object.keys(CATS).map((c) => `/kategorie/${c}`), ...PRODUCTS.map((p) => `/produkt/${p.slug}`), ...Object.keys(INFO).map((i) => `/info/${i}`), "/blog", ...BLOG.map((b) => `/blog/${b[0]}`)];
    return res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${origin}${u}</loc></url>`).join("")}</urlset>`);
  }
  res.end(`<?xml version="1.0" encoding="utf-8"?><SHOP>${PRODUCTS.map((p) => `<SHOPITEM><ITEM_ID>${p.id}</ITEM_ID><PRODUCTNAME>${esc(p.name)}</PRODUCTNAME><DESCRIPTION>${esc(p.desc)}</DESCRIPTION><URL>${origin}/produkt/${p.slug}</URL><IMGURL>${origin}/img/${p.slug}.svg</IMGURL><PRICE_VAT>${p.price}</PRICE_VAT><MANUFACTURER>${esc(p.brand)}</MANUFACTURER><CATEGORYTEXT>${esc(CATS[p.cat])}</CATEGORYTEXT><DELIVERY_DATE>${p.stock ? 0 : 30}</DELIVERY_DATE></SHOPITEM>`).join("")}</SHOP>`);
}
