// Natural voice for the agent via Azure AI Speech (neural TTS: native Czech and English voices,
// ≈ $16 per million characters). Without AZURE_SPEECH_KEY the widget falls back to the browser's voice.
import { Readable } from "node:stream";

const KEY = () => process.env.AZURE_SPEECH_KEY;
const REGION = () => process.env.AZURE_SPEECH_REGION || "westeurope";

// The voice follows the page's language and the assistant's gender (her / his manner in the settings).
// AZURE_VOICE_CS_F etc. swap one for any voice from Azure's list.
const VOICES = {
  cs: { f: "cs-CZ-VlastaNeural", m: "cs-CZ-AntoninNeural" },
  en: { f: "en-US-AvaNeural", m: "en-US-AndrewNeural" },
};
export function voiceFor(lang, gender) {
  const l = lang === "en" ? "en" : "cs", g = gender === "m" ? "m" : "f";
  return process.env[`AZURE_VOICE_${l.toUpperCase()}_${g.toUpperCase()}`] || VOICES[l][g];
}

export const ttsProvider = () => (KEY() ? "azure" : "browser");

const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

/** The request Azure gets: the text in SSML, read a touch quicker than default (a lively shop assistant). */
export function ssml(text, voice) {
  const lang = voice.slice(0, 5);
  return `<speak version="1.0" xml:lang="${lang}"><voice name="${xml(voice)}"><prosody rate="+5%">${xml(text)}</prosody></voice></speak>`;
}

/** Streams MP3 speech for `text` into the Express response. */
export async function streamSpeech(text, res, signal, { lang = "cs", gender = "f" } = {}) {
  const r = await fetch(`https://${REGION()}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    signal,
    headers: {
      "Ocp-Apim-Subscription-Key": KEY(),
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "sella",
    },
    body: ssml(text, voiceFor(lang, gender)),
  });
  if (!r.ok || !r.body) {
    const detail = await r.text().catch(() => "");
    throw Object.assign(new Error(`Azure Speech ${r.status}: ${detail.slice(0, 200)}`), { status: r.status });
  }
  res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
  await new Promise((resolve, reject) => {
    Readable.fromWeb(r.body).on("error", reject).pipe(res).on("finish", resolve).on("error", reject);
  });
}
