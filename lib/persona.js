// Gives the agent a name that fits the website it runs on: Claude invents a short,
// friendly name inspired by the brand (e.g. its first letter or sound). Names are
// remembered per brand (data/personas.json), so every visit to a shop meets the same agent.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, "..", "data", "personas.json");
let cache = {};
try { cache = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
// names from the first version were human names – drop anything that isn't a mascot-style name
for (const [k, v] of Object.entries(cache)) if (typeof v !== "string" || v.length > 8 || /^(Márka|Bohunka|Týna|Klára)$/.test(v)) delete cache[k];

// used when Claude isn't available – a mascot-style name from the brand's first sounds ("TechMarket" → "Teko")
export function fallbackName(brand) {
  const b = String(brand).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "");
  if (!b) return "Bip";
  const first = b[0].toUpperCase(), vowel = (b.slice(1).match(/[aeiouy]/i)?.[0] || "i").toLowerCase();
  return first + vowel + "ko";
}

// a name must be one short, simple word
const VALID = /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]{1,7}$/u;

const inflight = new Map();

/** Returns a name for the brand; `invent` asks Claude for one (see lib/assistant.js). */
export async function personaName(brand, invent, about = "") {
  const key = String(brand).trim().toLowerCase().slice(0, 60);
  if (!key) return "Klára";
  if (cache[key]) return cache[key];
  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      let name = null;
      try { name = await invent?.(brand, about); } catch {}
      if (!name || !VALID.test(name)) name = fallbackName(brand);
      cache[key] = name;
      try { fs.writeFileSync(file, JSON.stringify(cache, null, 2)); } catch {}
      return name;
    })().finally(() => inflight.delete(key)));
  }
  return inflight.get(key);
}
