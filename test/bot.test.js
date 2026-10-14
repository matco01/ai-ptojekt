import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { validateBot, widgetLook, avatarImage, fileText, unzipEntry, chunks, searchDocs } from "../lib/bot.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("the owner's settings are checked and cleaned", () => {
  const v = validateBot({
    name: "  Bára ", appearance: { color: "#E0662F", theme: "dark", avatar: "letter", letter: "Bxyz", avatarColor: "#123456", image: "" },
    persona: { tone: "playful", gender: "m", instructions: "x".repeat(2000) },
    info: [{ topic: "Doprava", text: "Zdarma nad 1 000 Kč" }, { topic: "", text: "" }],
  });
  assert.equal(v.agentName, "Bára");
  assert.deepEqual(v.appearance, { color: "#e0662f", theme: "dark", avatar: "letter", letter: "Bx", avatarColor: "#123456", image: "", shape: "", face: "full", faceY: 0, faceScale: 100 });
  const m = validateBot({ appearance: { shape: "triangle", face: "eyes", faceY: 99, faceScale: "10" } }).appearance;
  assert.deepEqual([m.shape, m.face, m.faceY, m.faceScale], ["triangle", "eyes", 30, 50]);
  const x = validateBot({ appearance: { shape: "star", face: "weird", faceY: "abc" } }).appearance;
  assert.deepEqual([x.shape, x.face, x.faceY, x.faceScale], ["", "full", 0, 100]);
  assert.equal(v.persona.tone, "playful");
  assert.equal(v.persona.gender, "m");
  assert.equal(v.persona.instructions.length, 1500);
  assert.deepEqual(v.info, { Doprava: "Zdarma nad 1 000 Kč" });

  const d = validateBot({ appearance: { color: "red", theme: "neon", avatar: "?" }, persona: { tone: "rude" } });
  assert.deepEqual([d.appearance.color, d.appearance.theme, d.appearance.avatar, d.persona.tone, d.persona.gender], ["", "auto", "auto", "friendly", "f"]);

  assert.throws(() => validateBot({ name: "<script>" }), /Jméno/);
  assert.throws(() => validateBot({ appearance: { avatar: "image" } }), /obrázek/);
  assert.throws(() => validateBot({ appearance: { image: "data:image/svg+xml;base64,PHN2Zz4=" } }), /PNG, JPG nebo WebP/);
  assert.throws(() => validateBot({ info: [{ topic: "Doprava", text: "" }] }), /téma i text/);
});

test("the widget gets only what was set; the picture travels by its own versioned address", () => {
  assert.deepEqual(widgetLook({ id: "x", name: "Obchod", appearance: {} }), {});
  const look = widgetLook({ id: "shop-1", name: "Obchod", agentName: "Bára", appearance: { color: "#112233", theme: "light", avatar: "image", image: PNG } });
  assert.equal(look.name, "Bára");
  assert.equal(look.color, "#112233");
  assert.equal(look.theme, "light");
  assert.match(look.image, /^\/api\/avatar\/shop-1\?v=\w+$/);
  assert.equal(widgetLook({ id: "s", name: "Kavárna", appearance: { avatar: "letter" } }).letter, "K"); // no letter → the shop's initial
  assert.deepEqual(widgetLook({ id: "s", name: "A", appearance: { shape: "circle", face: "none", faceY: -5, faceScale: 120 } }), { shape: "circle", face: "none", faceY: -5, faceScale: 120 });
  assert.deepEqual(widgetLook({ id: "s", name: "A", appearance: { face: "full", faceY: 0, faceScale: 100 } }), {}); // defaults aren't sent
  const img = avatarImage({ appearance: { image: PNG } });
  assert.equal(img.type, "image/png");
  assert.equal(img.body.subarray(1, 4).toString(), "PNG");
});

/** A minimal ZIP (a .docx is one) with one deflated file – enough for the reader. */
function zip(name, content) {
  const data = zlib.deflateRawSync(Buffer.from(content)), fname = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(fname.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(fname.length, 28); central.writeUInt32LE(0, 42);
  const cdStart = local.length + fname.length + data.length, cdSize = central.length + fname.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(cdStart, 16);
  return Buffer.concat([local, fname, data, central, fname, end]);
}

test("text comes out of Word, plain text and HTML files", async () => {
  const docx = zip("word/document.xml", `<w:document><w:body><w:p><w:r><w:t>Záruka 3 roky</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">na kávovary &amp; mlýnky</w:t></w:r></w:p></w:body></w:document>`);
  assert.equal(unzipEntry(docx, "missing.xml"), null);
  assert.equal((await fileText({ filename: "zaruka.docx", data: docx.toString("base64") })).trim(), "Záruka 3 roky\nna kávovary & mlýnky");
  assert.equal(await fileText({ filename: "faq.txt", data: Buffer.from("﻿Otázka?").toString("base64") }), "Otázka?");
  assert.match(await fileText({ filename: "a.html", data: Buffer.from("<h1>Doprava</h1><script>x()</script><p>Zdarma</p>").toString("base64") }), /Doprava\s*\n\s*Zdarma/);
  await assert.rejects(fileText({ filename: "x.exe", data: Buffer.from("MZ").toString("base64") }), /Podporujeme/);
  await assert.rejects(fileText({ filename: "x.txt", data: "not base64!" }), /poškozený/);
});

test("the documents are searched by keywords, Czech word endings included", () => {
  const docs = [
    { title: "Reklamační řád", text: "Úvod.\n\nReklamaci vyřídíme do 30 dnů od doručení zboží.\n\nVrácení peněz probíhá převodem." },
    { title: "Kávovary", text: "Odvápnění kávovaru doporučujeme každé 3 měsíce." },
  ];
  const r = searchDocs(docs, "Jak dlouho trvá reklamace?");
  assert.equal(r[0].document, "Reklamační řád");
  assert.match(r[0].text, /30 dnů/);
  assert.equal(searchDocs(docs, "odvápnění")[0].document, "Kávovary");
  assert.deepEqual(searchDocs(docs, "a"), []);
  assert.ok(chunks("x".repeat(3000)).every((c) => c.length <= 900));
});
