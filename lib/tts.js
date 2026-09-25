// Natural voice for the agent via ElevenLabs (neural TTS, speaks Czech well).
// Without ELEVENLABS_API_KEY the widget falls back to the browser's built-in voice.
import { Readable } from "node:stream";

const KEY = () => process.env.ELEVENLABS_API_KEY;
// "Jessica" – a young, expressive, playful voice that fits a cartoon mascot. Swap via ELEVENLABS_VOICE_ID.
const VOICE_ID = () => process.env.ELEVENLABS_VOICE_ID || "cgSgspJ2msm6clMCkdW9";
// Multilingual v2 = the most natural Czech pronunciation (first sound ≈ 1.1 s; later sentences are
// fetched while the first one plays). For speed over quality: ELEVENLABS_MODEL=eleven_turbo_v2_5 (≈ 0.25 s).
const MODEL_ID = () => process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

export const ttsProvider = () => (KEY() ? "elevenlabs" : "browser");

/** Streams MP3 speech for `text` into the Express response. */
export async function streamSpeech(text, res, signal) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID()}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    signal,
    headers: { "xi-api-key": KEY(), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID(),
      // the v2.5 models accept a language hint; multilingual v2 detects Czech by itself
      ...(/v2_5/.test(MODEL_ID()) ? { language_code: "cs" } : {}),
      // a bit of style and less stability = livelier, more characterful delivery
      voice_settings: { stability: 0.38, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1.05 },
    }),
  });
  if (!r.ok || !r.body) {
    const detail = await r.text().catch(() => "");
    throw Object.assign(new Error(`ElevenLabs ${r.status}: ${detail.slice(0, 200)}`), { status: r.status });
  }
  res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
  await new Promise((resolve, reject) => {
    Readable.fromWeb(r.body).on("error", reject).pipe(res).on("finish", resolve).on("error", reject);
  });
}
