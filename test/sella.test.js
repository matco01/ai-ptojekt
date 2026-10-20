// The assistant on Sella's own website knows Sella – never the demo shops our website links to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getCatalog } from "../lib/catalogs.js";
import { freeClientId } from "../lib/clients.js";

const sella = { id: "sella", name: "Sella", domains: ["ai-ptojekt.vercel.app"], info: {}, integration: {} };

test("Sella's own assistant gets fixed Sella knowledge, without reading the website", async () => {
  for (const lang of ["cs", "en"]) {
    const cat = await getCatalog(sella, { lang });
    assert.equal(cat.products.length, 0);
    const text = cat.store.site.map((p) => p.text).join("\n");
    assert.match(text, /Sella/);
    assert.doesNotMatch(text, /espresso|mlýnek|grinder|iPhone|Samsung/i);
    const chips = cat.store.starters[lang];
    assert.equal(chips.length, 3);
    assert.doesNotMatch(JSON.stringify(chips), /káv|coffee|espresso/i);
    assert.match(cat.store.description, lang === "en" ? /Sella/ : /Selly/);
  }
});

test("a shop called Sella doesn't get our own assistant's id", async () => {
  assert.notEqual(await freeClientId("Sella"), "sella");
  assert.notEqual(await freeClientId("Kavárna"), "kavarna");
});
