// The agent's default name for a shop: a short mascot-style name derived from the shop's name
// ("TechMarket" → "Teko"). Pure function of the name, so it is the same everywhere, every time.
// A client can override it with a fixed name (agent_name in the clients table).
export function personaName(shopName) {
  const b = String(shopName).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "");
  if (!b) return "Bip";
  const first = b[0].toUpperCase(), vowel = (b.slice(1).match(/[aeiouy]/i)?.[0] || "i").toLowerCase();
  return first + vowel + "ko";
}
