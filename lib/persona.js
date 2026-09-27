// Gives the agent a name that fits the website it runs on: a short, mascot-style name derived
// deterministically from the brand's own name (e.g. its first letter or sound), so the same
// brand always gets the same name – no randomness, no dependency on storage surviving a restart.
import fs from "node:fs";
import { dataFile } from "./storage.js";

const file = dataFile("personas.json");
let cache = {};
try { cache = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}

// a mascot-style name from the brand's first sounds ("TechMarket" → "Teko")
export function fallbackName(brand) {
  const b = String(brand).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "");
  if (!b) return "Bip";
  const first = b[0].toUpperCase(), vowel = (b.slice(1).match(/[aeiouy]/i)?.[0] || "i").toLowerCase();
  return first + vowel + "ko";
}

/** Returns the (deterministic, stable) name for the brand. */
export function personaName(brand) {
  const key = String(brand).trim().toLowerCase().slice(0, 60);
  if (!key) return "Bip";
  if (cache[key]) return cache[key];
  const name = fallbackName(brand);
  cache[key] = name;
  try { fs.writeFileSync(file, JSON.stringify(cache, null, 2)); } catch {}
  return name;
}
