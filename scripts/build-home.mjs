// Writes Sella's home page in both languages – public/index.html (Czech, the main address "/") and
// public/en/index.html (English, "/en/") – from one template and one set of texts
// (public/sella/home-text.js). Every text, the price list (lib/plans.js) and the page's head – title,
// description, canonical and language links, social cards and structured data for search engines –
// are written straight into the HTML, so search engines and AI crawlers that don't run JavaScript read
// the full page in the right language. The browser applies the same texts again (SellaI18n).
//
//   node scripts/build-home.mjs          rewrite both pages
//   node scripts/build-home.mjs --check  exit 1 if a page is out of date (the tests run this)
//
// SITE_URL sets the public address (default https://sella.chat).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { PLANS, publicPlans } from "../lib/plans.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = (process.env.SITE_URL || "https://sella.chat").replace(/\/$/, "");
const FILES = { cs: path.join(root, "public", "index.html"), en: path.join(root, "public", "en", "index.html") };
const URLS = { cs: `${SITE}/`, en: `${SITE}/en/` };
const VIDEO_UPLOADED = "2026-10-13"; // when the intro films were published
const FAQ_COUNT = 8;

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "public", "sella", "home-text.js"), "utf8"), ctx);
const TEXT = ctx.window.SELLA_HOME_TEXT;

const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => escText(s).replace(/"/g, "&quot;");
const plain = (html) => String(html).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** Every element marked data-i18n / data-i18n-html / data-i18n-attr gets the language's text. */
function applyTexts(html, t) {
  // attributes first (the tags keep their place)
  html = html.replace(/<[a-z][^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/gi, (tag, spec) => {
    for (const pair of spec.split(";")) {
      const [attr, key] = pair.split("=").map((x) => x.trim());
      if (!attr || t[key] == null) continue;
      const re = new RegExp(`\\s${attr}="[^"]*"`);
      const value = ` ${attr}="${escAttr(t[key])}"`;
      tag = re.test(tag) ? tag.replace(re, value) : tag.replace(/\s*\/?>$/, (end) => `${value}${end}`);
    }
    return tag;
  });
  // element contents: up to the element's own closing tag (marked elements don't nest their own tag)
  return html.replace(/<([a-z0-9]+)(\s(?:[^>]*?\s)?data-i18n(-html)?="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attrs, isHtml, key, inner) => {
    if (t[key] == null) return m;
    return `<${tag}${attrs}>${isHtml ? t[key] : escText(t[key])}</${tag}>`;
  });
}

/** The price list as the page draws it (the browser redraws it from /api/plans). */
function pricesHtml(lang, t) {
  const loc = lang === "cs" ? "cs-CZ" : "en-GB";
  const nf = (n, o) => Number(n).toLocaleString(loc, o);
  const money = (n, o) => (lang === "cs" ? nf(n, o) + " Kč" : "CZK " + nf(n, o));
  return publicPlans().map((p, i) => `
        <div class="pane plan rv in${p.popular ? " popular" : ""}" style="--d:${i}">
          ${p.popular ? `<span class="flag">${t["pr.popular"]}</span>` : ""}
          <span class="nm">${lang === "en" ? p.nameEn : p.name}</span>
          <span class="pr">${money(p.priceCzk)} <small>${t["pr.month"]}</small></span>
          <span class="per">${money(p.priceCzk / p.messages, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t["pr.perMsg"]}</span>
          <ul><li>${nf(p.messages)} ${t["pr.msgs"]}</li><li>${nf(p.ttsChars)} ${t["pr.voice"]}</li><li>${t["pr.all"]}</li></ul>
          <a class="btn ${p.popular ? "dark" : "light"}" href="/sella/registrace.html?plan=${p.id}">${t["pr.pick"]}</a>
        </div>`).join("") + "\n        ";
}

/** Structured data: who we are, the product with its prices, the intro film and the questions. */
function jsonLd(lang, t) {
  const url = URLS[lang], plans = publicPlans();
  const org = `${SITE}/#organization`, site = `${SITE}/#website`, app = `${SITE}/#software`;
  const graph = [
    { "@type": "Organization", "@id": org, name: "Sella", url: `${SITE}/`, logo: { "@type": "ImageObject", url: `${SITE}/icons/icon-512.png`, width: 512, height: 512 }, areaServed: ["CZ", "SK"] },
    { "@type": "WebSite", "@id": site, url: `${SITE}/`, name: "Sella", inLanguage: ["cs", "en"], publisher: { "@id": org } },
    {
      "@type": "WebPage", "@id": `${url}#webpage`, url, name: t["seo.title"], description: t["seo.desc"], inLanguage: lang,
      isPartOf: { "@id": site }, about: { "@id": app }, primaryImageOfPage: { "@type": "ImageObject", url: `${SITE}/og/sella-${lang}.png` },
    },
    {
      "@type": "SoftwareApplication", "@id": app, name: "Sella", url: `${SITE}/`,
      applicationCategory: "BusinessApplication", applicationSubCategory: lang === "cs" ? "AI chatbot a prodavačka pro e-shopy" : "AI chatbot and shop assistant for online stores",
      operatingSystem: "Web", description: t["seo.desc"], inLanguage: ["cs", "en"], provider: { "@id": org },
      image: `${SITE}/og/sella-${lang}.png`,
      offers: {
        "@type": "AggregateOffer", priceCurrency: "CZK", lowPrice: Math.min(...plans.map((p) => p.priceCzk)), highPrice: Math.max(...plans.map((p) => p.priceCzk)), offerCount: plans.length,
        offers: plans.map((p) => ({
          "@type": "Offer", name: lang === "en" ? p.nameEn : p.name, price: p.priceCzk, priceCurrency: "CZK", url: `${SITE}/sella/registrace.html?plan=${p.id}`,
          availability: "https://schema.org/InStock",
          priceSpecification: { "@type": "UnitPriceSpecification", price: p.priceCzk, priceCurrency: "CZK", unitText: "MONTH", billingDuration: "P1M", valueAddedTaxIncluded: false },
        })),
      },
    },
    {
      "@type": "VideoObject", name: plain(t["demos.title"]), description: t["demos.lead"], inLanguage: lang,
      thumbnailUrl: `${SITE}/sella/video/intro-${lang}.jpg`, contentUrl: `${SITE}/sella/video/intro-${lang}.mp4`,
      uploadDate: VIDEO_UPLOADED, duration: "PT58S", publisher: { "@id": org },
    },
    {
      "@type": "FAQPage", "@id": `${url}#faq`, inLanguage: lang,
      mainEntity: Array.from({ length: FAQ_COUNT }, (_, i) => ({ "@type": "Question", name: t[`faq.q${i + 1}`], acceptedAnswer: { "@type": "Answer", text: t[`faq.a${i + 1}`] } })),
    },
  ];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

function seoBlock(lang, t) {
  const url = URLS[lang], other = lang === "cs" ? "en" : "cs";
  const og = `${SITE}/og/sella-${lang}.png`;
  return `<!-- seo:start – written by scripts/build-home.mjs (title, description, links, social cards, structured data) -->
  <title>${escText(t["seo.title"])}</title>
  <meta name="description" content="${escAttr(t["seo.desc"])}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="cs" href="${URLS.cs}">
  <link rel="alternate" hreflang="en" href="${URLS.en}">
  <link rel="alternate" hreflang="x-default" href="${URLS.cs}">
  <meta name="theme-color" content="#d0d9e1">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/icons/icon-32.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Sella">
  <meta property="og:title" content="${escAttr(t["seo.title"])}">
  <meta property="og:description" content="${escAttr(t["seo.desc"])}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${og}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escAttr(t["seo.h1"])}">
  <meta property="og:locale" content="${lang === "cs" ? "cs_CZ" : "en_GB"}">
  <meta property="og:locale:alternate" content="${other === "cs" ? "cs_CZ" : "en_GB"}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escAttr(t["seo.title"])}">
  <meta name="twitter:description" content="${escAttr(t["seo.desc"])}">
  <meta name="twitter:image" content="${og}">
  <link rel="preload" href="/vendor/fonts/OldStandardTT-normal-400-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/vendor/fonts/Geist-normal-400-latin.woff2" as="font" type="font/woff2" crossorigin>
  <script type="application/ld+json">${jsonLd(lang, t)}</script>
  <!-- seo:end -->`;
}

export function build(lang) {
  const t = TEXT[lang];
  for (let i = 1; i <= FAQ_COUNT; i++) if (!t[`faq.q${i}`] || !t[`faq.a${i}`]) throw new Error(`${lang}: missing faq.q${i} / faq.a${i}`);
  let html = fs.readFileSync(FILES.cs, "utf8").replace(/\r\n/g, "\n");
  html = html.replace(/<!-- seo:start[\s\S]*?<!-- seo:end -->/, () => seoBlock(lang, t));
  html = html.replace(/<!-- prices:start -->[\s\S]*?<!-- prices:end -->/, () => `<!-- prices:start -->${pricesHtml(lang, t)}<!-- prices:end -->`);
  html = html.replace(/<html[^>]*>/, lang === "cs"
    ? `<html lang="cs" data-url-lang="cs" data-lang-default data-alt-cs="/" data-alt-en="/en/">`
    : `<html lang="en" data-url-lang="en" data-alt-cs="/" data-alt-en="/en/">`);
  return applyTexts(html, t);
}

/** /llms.txt – a plain summary of Sella for AI assistants and AI search (llmstxt.org). */
export function llmsTxt() {
  const plans = publicPlans(), en = TEXT.en, cs = TEXT.cs;
  const faq = (t) => Array.from({ length: FAQ_COUNT }, (_, i) => `### ${t[`faq.q${i + 1}`]}\n${t[`faq.a${i + 1}`]}`).join("\n\n");
  return `# Sella

> ${en["seo.desc"]}

Sella is an AI salesperson (an AI chatbot and shop assistant) for online shops, made in the Czech Republic. It runs on any shop website from one line of code and answers in Czech and English, by chat or voice.

## Pages
- [Sella – home (Czech)](${URLS.cs}): what Sella does, demos, pricing, questions
- [Sella – home (English)](${URLS.en})
- [Sign up](${SITE}/sella/registrace.html): create an account, pay for a plan, get the embed code
- [Demo: electronics shop](${SITE}/techmarket/) and [demo: coffee roastery](${SITE}/kavarna) – Sella running on two sample shops
- [Terms](${SITE}/podminky.html), [Data processing agreement](${SITE}/zpracovani-udaju.html), [Privacy](${SITE}/soukromi.html)

## Pricing (monthly, excluding VAT, billed by card)
${plans.map((p) => `- ${p.nameEn}: CZK ${p.priceCzk.toLocaleString("en-GB")} – ${p.messages.toLocaleString("en-GB")} AI messages and ${p.ttsChars.toLocaleString("en-GB")} characters of natural voice${p.popular ? " (most popular)" : ""}`).join("\n")}

When a plan's messages run out, the assistant switches itself off until the month ends, so a shop never pays more.

## Questions
${faq(en)}

## Česky
${cs["seo.desc"]}

${faq(cs)}
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const check = process.argv.includes("--check");
  let stale = [];
  const llms = path.join(root, "public", "llms.txt");
  const nowLlms = fs.existsSync(llms) ? fs.readFileSync(llms, "utf8").replace(/\r\n/g, "\n") : "";
  if (nowLlms !== llmsTxt()) { if (check) stale.push("public/llms.txt"); else { fs.writeFileSync(llms, llmsTxt()); console.log("wrote public/llms.txt"); } }
  // Czech first: the English page is built from the Czech one (the template)
  for (const lang of ["cs", "en"]) {
    const out = build(lang);
    const now = fs.existsSync(FILES[lang]) ? fs.readFileSync(FILES[lang], "utf8").replace(/\r\n/g, "\n") : "";
    if (out === now) continue;
    if (check) { stale.push(path.relative(root, FILES[lang])); continue; }
    fs.mkdirSync(path.dirname(FILES[lang]), { recursive: true });
    fs.writeFileSync(FILES[lang], out);
    console.log(`wrote ${path.relative(root, FILES[lang])}`);
  }
  if (stale.length) { console.error(`out of date – run node scripts/build-home.mjs: ${stale.join(", ")}`); process.exit(1); }
}
