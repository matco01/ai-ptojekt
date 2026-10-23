// The home page in both languages: generated from the shared texts, readable without JavaScript, and
// described to search engines correctly (language links, structured data, prices).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { publicPlans } from "../lib/plans.js";

const page = (lang) => fs.readFileSync(new URL(lang === "en" ? "../public/en/index.html" : "../public/index.html", import.meta.url), "utf8");
const ld = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

test("both home pages are up to date with home-text.js and the plans", () => {
  // fails when a text or a price changed without running node scripts/build-home.mjs
  execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build-home.mjs", import.meta.url)), "--check"], { stdio: "pipe" });
});

test("each language has its own address, title and language links", () => {
  for (const [lang, url] of [["cs", "https://sella.chat/"], ["en", "https://sella.chat/en/"]]) {
    const html = page(lang);
    assert.match(html, new RegExp(`<html lang="${lang}"`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${url}">`));
    assert.match(html, /hreflang="cs" href="https:\/\/sella\.chat\/"/);
    assert.match(html, /hreflang="en" href="https:\/\/sella\.chat\/en\/"/);
    assert.match(html, /hreflang="x-default"/);
    assert.match(html, /<meta property="og:image" content="https:\/\/sella\.chat\/og\/sella-(cs|en)\.png">/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.ok(fs.existsSync(new URL(`../public/og/sella-${lang}.png`, import.meta.url)));
  }
  // the English page reads English without JavaScript
  assert.match(page("en"), /<h3 data-i18n="faq.q1">What is Sella\?<\/h3>/);
  assert.match(page("cs"), /<h3 data-i18n="faq.q1">Co je Sella\?<\/h3>/);
});

test("structured data: valid, with the real prices and the questions shown on the page", () => {
  for (const lang of ["cs", "en"]) {
    const html = page(lang);
    const graph = ld(html)["@graph"];
    const types = graph.map((g) => g["@type"]);
    for (const t of ["Organization", "WebSite", "WebPage", "SoftwareApplication", "VideoObject", "FAQPage"]) assert.ok(types.includes(t), `${lang}: ${t}`);
    const offers = graph.find((g) => g["@type"] === "SoftwareApplication").offers;
    assert.deepEqual(offers.offers.map((o) => o.price), publicPlans().map((p) => p.priceCzk));
    // every question in the data is on the page, word for word (search engines require that)
    for (const q of graph.find((g) => g["@type"] === "FAQPage").mainEntity) {
      assert.ok(html.includes(`>${q.name.replace(/&/g, "&amp;")}</h3>`), `${lang}: question on the page: ${q.name}`);
    }
  }
});

test("robots.txt, sitemap and llms.txt point to the public pages", () => {
  const robots = fs.readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Sitemap: https:\/\/sella\.chat\/sitemap\.xml/);
  const sitemap = fs.readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /<loc>https:\/\/sella\.chat\/en\/<\/loc>/);
  const llms = fs.readFileSync(new URL("../public/llms.txt", import.meta.url), "utf8");
  for (const p of publicPlans()) assert.ok(llms.includes(`CZK ${p.priceCzk.toLocaleString("en-GB")}`));
});
