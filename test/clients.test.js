import { test } from "node:test";
import assert from "node:assert/strict";
import { originAllowed, normalizeDomain, validateClient, getClient } from "../lib/clients.js";

const shop = { domains: ["datart.cz"] };

test("the widget runs only on the client's domains and our own host", () => {
  assert.equal(originAllowed(shop, "https://datart.cz", "app.example"), true);
  assert.equal(originAllowed(shop, "https://www.datart.cz", "app.example"), true);
  assert.equal(originAllowed(shop, "https://evil-datart.cz", "app.example"), false);
  assert.equal(originAllowed(shop, "https://datart.cz.evil.com", "app.example"), false);
  assert.equal(originAllowed(shop, "https://app.example", "app.example"), true);
  assert.equal(originAllowed(shop, undefined, "app.example"), false);
  assert.equal(originAllowed(shop, "not a url", "app.example"), false);
});

test("localhost is allowed only outside production", () => {
  const was = process.env.VERCEL;
  delete process.env.VERCEL;
  assert.equal(originAllowed(shop, "http://localhost:5173", "app.example"), true);
  process.env.VERCEL = "1";
  assert.equal(originAllowed(shop, "http://localhost:5173", "app.example"), false);
  if (was === undefined) delete process.env.VERCEL; else process.env.VERCEL = was;
});

test("an embed without data-client is not treated as any shop", async () => {
  assert.equal(await getClient(undefined), null);
  assert.equal(await getClient(""), null);
  assert.equal(await getClient("does-not-exist"), null);
  assert.equal((await getClient("kavarna")).id, "kavarna");
});

test("domains are normalised", () => {
  assert.equal(normalizeDomain("https://www.Shop.cz/eshop?x=1"), "shop.cz");
  assert.equal(normalizeDomain("shop.cz"), "shop.cz");
  assert.equal(normalizeDomain("localhost"), null);
  assert.equal(normalizeDomain(""), null);
});

test("client settings are validated", () => {
  const ok = validateClient({ id: "datart", name: "Datart", domains: "datart.cz, www.datart.sk", feedUrl: "https://datart.cz/feed.xml", plan: "start", info: { doprava: "zdarma" } }, { isNew: true });
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.row.domains, ["datart.cz", "datart.sk"]);
  assert.equal(ok.row.plan, "start");
  assert.match(validateClient({ id: "Datart!", name: "x", domains: "a.cz" }, { isNew: true }).error, /ID/);
  assert.match(validateClient({ id: "datart", name: "x", domains: "" }, { isNew: true }).error, /doménu/);
  assert.match(validateClient({ id: "datart", name: "x", domains: "a.cz", plan: "gold" }, { isNew: true }).error, /tarif/);
  assert.match(validateClient({ id: "datart", name: "x", domains: "a.cz", feedUrl: "ftp://x" }, { isNew: true }).error, /feedu/);
  assert.match(validateClient({ id: "datart", name: "x", domains: "a.cz", info: { a: 1 } }, { isNew: true }).error, /JSON/);
});
