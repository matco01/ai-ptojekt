// What a shop owner can change about their assistant on the "Vaše prodavačka" page:
//   - its name and look (colour, light/dark, mascot from the logo, a letter tile or their own picture),
//   - its manner (tone, female/male voice in Czech, the owner's own instructions),
//   - what it knows beyond the catalogue: shop information by topic and uploaded documents
//     (PDF, Word, text) the assistant searches when a customer asks.
// Validation lives here; the client row (appearance, persona, info, agent_name) is written by
// lib/clients.js and documents go to the "knowledge" table (data/knowledge.json without Supabase).
import fs from "node:fs";
import zlib from "node:zlib";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";
import { dataFile } from "./storage.js";
import { norm } from "./catalog.js";
import { isProduction } from "./auth.js";

export const LIMITS = { name: 30, instructions: 1500, topics: 20, topicName: 40, topicText: 3000, docs: 30, docChars: 120_000, totalChars: 300_000, imageChars: 200_000, uploadBytes: 3_000_000 };
const TONES = ["friendly", "professional", "playful"], THEMES = ["auto", "light", "dark"], AVATARS = ["auto", "logo", "letter", "image"]; // auto = Sella's own blob in the website's colour
// the mascot: its outline ("free" = a picture as it is, uncut) and how much of a face it gets
const SHAPES = ["square", "circle", "triangle", "blob", "free"], FACES = ["full", "eyes", "none"];
const int = (v, min, max, def) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Math.min(max, Math.max(min, Math.round(Number(v)))) : def);
const HEX = /^#[0-9a-f]{6}$/i;

const bad = (message) => Object.assign(new Error(message), { status: 400 });
const s = (v, max) => String(v ?? "").trim().slice(0, max);

/** Checks the owner's settings; returns the values to store or throws a 400 with a message for the owner. */
export function validateBot(input = {}) {
  const agentName = s(input.name, LIMITS.name);
  if (agentName && !/^[\p{L}\p{N} .'’-]+$/u.test(agentName)) throw bad("Jméno může obsahovat jen písmena, číslice, mezery a pomlčky.");

  const a = input.appearance ?? {};
  const appearance = {
    color: HEX.test(a.color ?? "") ? a.color.toLowerCase() : "",
    theme: THEMES.includes(a.theme) ? a.theme : "auto",
    avatar: AVATARS.includes(a.avatar) ? a.avatar : "auto",
    letter: [...s(a.letter, 8)].slice(0, 2).join(""),
    avatarColor: HEX.test(a.avatarColor ?? "") ? a.avatarColor.toLowerCase() : "",
    image: "",
    shape: SHAPES.includes(a.shape) ? a.shape : "",   // empty = the default (a tile; a picture uncut)
    face: FACES.includes(a.face) ? a.face : "none",
    faceY: int(a.faceY, -30, 30, 0),                  // moves the face up/down (drawing units, 100 = mascot height)
    faceScale: int(a.faceScale, 50, 150, 100),         // face size in %
  };
  if (a.image) {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(a.image)) throw bad("Obrázek prodavačky musí být PNG, JPG nebo WebP.");
    if (a.image.length > LIMITS.imageChars) throw bad("Obrázek prodavačky je moc velký.");
    appearance.image = a.image;
  }
  if (appearance.avatar === "image" && !appearance.image) throw bad("Nahrajte obrázek prodavačky, nebo zvolte jiný vzhled.");

  const p = input.persona ?? {};
  const persona = {
    tone: TONES.includes(p.tone) ? p.tone : "friendly",
    gender: p.gender === "m" ? "m" : "f",
    instructions: s(p.instructions, LIMITS.instructions),
  };

  const info = {};
  const topics = Array.isArray(input.info) ? input.info : Object.entries(input.info ?? {}).map(([topic, text]) => ({ topic, text }));
  for (const t of topics) {
    const topic = s(t?.topic, LIMITS.topicName), text = s(t?.text, LIMITS.topicText);
    if (!topic && !text) continue;
    if (!topic || !text) throw bad("Každá informace o obchodě potřebuje téma i text.");
    if (Object.keys(info).length >= LIMITS.topics) throw bad(`Nejvýš ${LIMITS.topics} témat.`);
    info[topic] = text;
  }
  return { agentName, appearance, persona, info };
}

/** The look the widget applies (the picture is served separately, see /api/avatar). */
export function widgetLook(client) {
  const a = client.appearance ?? {};
  const look = {};
  if (client.agentName) look.name = client.agentName;
  if (a.color) look.color = a.color;
  if (a.theme && a.theme !== "auto") look.theme = a.theme;
  if (a.avatar === "logo") look.avatar = "logo";
  if (a.avatar === "letter") { look.letter = a.letter || [...String(client.name || "A")][0]; if (a.avatarColor) look.avatarColor = a.avatarColor; }
  if (a.avatar === "image" && a.image) look.image = `/api/avatar/${encodeURIComponent(client.id)}?v=${hash(a.image)}`;
  if (a.shape) look.shape = a.shape;
  if (a.face && a.face !== "none") look.face = a.face;
  if (a.faceY) look.faceY = a.faceY;
  if (a.faceScale && a.faceScale !== 100) look.faceScale = a.faceScale;
  return look;
}
const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i += 97) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return (h ^ str.length).toString(36); };

/** The owner's picture as bytes for /api/avatar. */
export function avatarImage(client) {
  const m = client.appearance?.image?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  return m ? { type: m[1], body: Buffer.from(m[2], "base64") } : null;
}

// ------------------------------------------------------------ documents ----
const FILE = dataFile("knowledge.json");
const readLocal = () => { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; } };
const cache = new Map(); // clientId → { at, docs }
const needsDb = () => Object.assign(new Error("Dokumenty na serveru potřebují databázi."), { status: 503 });

async function allDocs(clientId) {
  const hit = cache.get(clientId);
  if (hit && Date.now() - hit.at < 60e3) return hit.docs;
  let docs;
  if (db) {
    const { data, error } = await db.from("knowledge").select("id, title, filename, text, chars, created_at").eq("client_id", clientId).order("id");
    if (error) throw new Error(error.message);
    docs = data ?? [];
  } else docs = readLocal().filter((d) => d.client_id === clientId);
  cache.set(clientId, { at: Date.now(), docs });
  return docs;
}

/** The owner's documents without their text (for the settings page). */
export async function listDocs(clientId) {
  return (await allDocs(clientId)).map(({ id, title, filename, chars, created_at }) => ({ id, title, filename, chars, createdAt: created_at }));
}

/** Title + text of every document – what the assistant knows (cached for a minute per server instance). */
export async function knowledgeFor(clientId) {
  try { return (await allDocs(clientId)).map((d) => ({ title: d.title, text: d.text })); }
  catch (err) { console.error("knowledge read failed:", err.message); return []; }
}

export async function addDoc(clientId, { title, filename, text }) {
  title = s(title, 120) || s(filename, 120) || "Dokument";
  text = String(text ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw bad("V dokumentu jsme nenašli žádný text.");
  if (text.length > LIMITS.docChars) throw bad(`Dokument je moc dlouhý (nejvýš ${LIMITS.docChars.toLocaleString("cs-CZ")} znaků, má ${text.length.toLocaleString("cs-CZ")}). Rozdělte ho prosím na menší části.`);
  const docs = await allDocs(clientId);
  if (docs.length >= LIMITS.docs) throw bad(`Nejvýš ${LIMITS.docs} dokumentů – nějaký prosím smažte.`);
  const total = docs.reduce((n, d) => n + d.chars, 0);
  if (total + text.length > LIMITS.totalChars) throw bad("Dokumenty dohromady přesáhly limit 300 000 znaků – nějaký prosím smažte.");
  const row = { client_id: clientId, title, filename: s(filename, 200) || null, text, chars: text.length };
  if (db) {
    const { error } = await db.from("knowledge").insert(row);
    if (error) throw new Error(error.message);
  } else {
    if (isProduction()) throw needsDb();
    const all = readLocal();
    all.push({ ...row, id: Date.now(), created_at: new Date().toISOString() });
    fs.writeFileSync(FILE, JSON.stringify(all, null, 1));
  }
  cache.delete(clientId);
}

export async function deleteDoc(clientId, id) {
  if (db) {
    const { error } = await db.from("knowledge").delete().eq("client_id", clientId).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    fs.writeFileSync(FILE, JSON.stringify(readLocal().filter((d) => !(d.client_id === clientId && String(d.id) === String(id))), null, 1));
  }
  cache.delete(clientId);
}

// ------------------------------------------------- reading uploaded files ----
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml)$/i;
const strip = (html) => html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ");

/** One file out of a ZIP archive (a .docx is a ZIP) – stored or deflated entries. */
export function unzipEntry(buf, name) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString("utf8", p + 46, p + 46 + nameLen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function docxText(buf) {
  const xml = unzipEntry(buf, "word/document.xml");
  if (!xml) throw bad("Soubor Wordu se nepodařilo otevřít (podporujeme .docx).");
  return xml.toString("utf8")
    .replace(/<w:tab\/>/g, "\t").replace(/<w:br[^>]*\/>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<\/w:tc>/g, "\t")
    .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** Claude reads a PDF (also scanned ones) and writes out its text. */
async function pdfText(base64, { model, meter }) {
  if (!process.env.ANTHROPIC_API_KEY) throw bad("PDF umíme přečíst jen se zapnutou AI. Pošlete prosím dokument jako .docx nebo .txt.");
  const r = await new Anthropic().messages.create({
    model, max_tokens: 16000, output_config: { effort: "low" },
    messages: [{ role: "user", content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      { type: "text", text: "Přepiš veškerý text tohoto dokumentu do prostého textu ve stejném jazyce. Zachovej nadpisy a pořadí, tabulky převeď na řádky textu. Nic nevynechávej, nic nepřidávej, nic nekomentuj – vrať jen text dokumentu." },
    ] }],
  }, { timeout: 120000, maxRetries: 1 });
  meter?.(r.usage);
  if (r.stop_reason === "refusal") throw bad("Tento dokument nedokážeme zpracovat.");
  return r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

/** Text of an uploaded file: { filename, data (base64) }. */
export async function fileText({ filename, data }, opts) {
  if (typeof data !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(data)) throw bad("Soubor je poškozený, nahrajte ho prosím znovu.");
  const buf = Buffer.from(data, "base64");
  if (buf.length > LIMITS.uploadBytes) throw bad("Soubor je moc velký (nejvýš 3 MB).");
  const name = String(filename ?? "");
  if (/\.pdf$/i.test(name) || buf.subarray(0, 5).toString() === "%PDF-") return pdfText(data, opts);
  if (/\.docx$/i.test(name)) return docxText(buf);
  if (/\.html?$/i.test(name)) return strip(buf.toString("utf8"));
  if (TEXT_EXT.test(name)) return buf.toString("utf8").replace(/^﻿/, "");
  throw bad("Podporujeme PDF, Word (.docx), TXT, Markdown, CSV a HTML.");
}

// ------------------------------------------------ searching the documents ----
/** Splits a document into passages of about `size` characters along paragraph breaks. */
export function chunks(text, size = 900) {
  const out = [];
  let cur = "";
  for (const para of text.split(/\n{2,}|\n(?=[-•*\d])/)) {
    if (cur && cur.length + para.length > size) { out.push(cur.trim()); cur = ""; }
    if (para.length > size * 1.5) { for (let i = 0; i < para.length; i += size) out.push(para.slice(i, i + size).trim()); continue; }
    cur += (cur ? "\n" : "") + para;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/** The passages of the owner's documents that best match a question (simple keyword scoring). */
export function searchDocs(docs, query, n = 4) {
  const words = [...new Set(norm(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 3))];
  if (!words.length) return [];
  const stems = words.map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w)); // Czech endings: "reklamace" ~ "reklamaci"
  const scored = [];
  for (const d of docs) {
    for (const passage of chunks(d.text)) {
      const hay = norm(passage);
      const score = stems.reduce((sum, w) => sum + (hay.split(w).length - 1 ? 1 + Math.min(hay.split(w).length - 2, 2) * 0.2 : 0), 0);
      if (score > 0) scored.push({ title: d.title, text: passage, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, n).map(({ title, text }) => ({ document: title, text }));
}
