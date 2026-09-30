import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { parseFeed } from "../lib/feed.js";
import { fetchFeed } from "../lib/catalogs.js";

test("Heureka feed", () => {
  const { products, categories } = parseFeed(`<?xml version="1.0"?><SHOP>
    <SHOPITEM><ITEM_ID>a1</ITEM_ID><PRODUCTNAME>Káva Etiopie</PRODUCTNAME><PRICE_VAT>289</PRICE_VAT><PRICE_BEFORE_DISCOUNT>320</PRICE_BEFORE_DISCOUNT>
      <CATEGORYTEXT>Káva | Zrnková</CATEGORYTEXT><URL>https://x.cz/a1</URL><DELIVERY_DATE>0</DELIVERY_DATE>
      <PARAM><PARAM_NAME>Pražení</PARAM_NAME><VAL>světlé</VAL></PARAM></SHOPITEM>
    <SHOPITEM><ITEM_ID>a2</ITEM_ID><PRODUCTNAME>Bez ceny</PRODUCTNAME></SHOPITEM>
  </SHOP>`);
  assert.equal(products.length, 1);
  assert.equal(products[0].price, 289);
  assert.equal(products[0].oldPrice, 320);
  assert.equal(products[0].params["Pražení"], "světlé");
  assert.deepEqual(categories, [{ id: "zrnkova", name: "Zrnková" }]);
});

test("Google Merchant feed", () => {
  const { products } = parseFeed(`<rss xmlns:g="http://base.google.com/ns/1.0"><channel>
    <item><g:id>9</g:id><g:title>Mlýnek</g:title><g:price>1 290,00 CZK</g:price><g:sale_price>990 CZK</g:sale_price><g:availability>out_of_stock</g:availability></item>
  </channel></rss>`);
  assert.equal(products[0].price, 990);
  assert.equal(products[0].oldPrice, 1290);
  assert.equal(products[0].stock, 0);
});

test("unknown XML is rejected", () => {
  assert.throws(() => parseFeed("<catalog><x/></catalog>"), /Neznámý formát/);
});

test("a feed over the size limit is cut off even without Content-Length", async (t) => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/xml" }); // chunked – no size announced
    for (let i = 0; i < 50; i++) res.write("x".repeat(1000));
    res.end();
  });
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/feed.xml`;
  await assert.rejects(fetchFeed(url, { maxBytes: 10_000 }), /větší než/);
  assert.equal((await fetchFeed(url, { maxBytes: 100_000 })).length, 50_000);
});
