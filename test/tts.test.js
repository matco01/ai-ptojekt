import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceFor, ssml, ttsProvider } from "../lib/tts.js";

test("the voice follows the page's language and the assistant's gender", () => {
  assert.equal(voiceFor("cs", "f"), "cs-CZ-VlastaNeural");
  assert.equal(voiceFor("cs", "m"), "cs-CZ-AntoninNeural");
  assert.equal(voiceFor("en", "f"), "en-US-AvaNeural");
  assert.equal(voiceFor("en", "m"), "en-US-AndrewNeural");
  assert.equal(voiceFor(undefined, undefined), "cs-CZ-VlastaNeural"); // Czech, a she
  assert.equal(voiceFor("de", "x"), "cs-CZ-VlastaNeural");
});

test("the answer's text can't break out of the SSML", () => {
  const s = ssml(`Cena <b>289 Kč</b> & "sleva" '10 %'`, "cs-CZ-VlastaNeural");
  assert.match(s, /^<speak version="1.0" xml:lang="cs-CZ"><voice name="cs-CZ-VlastaNeural">/);
  assert.ok(s.includes("Cena &lt;b&gt;289 Kč&lt;/b&gt; &amp; &quot;sleva&quot; &apos;10 %&apos;"));
  assert.ok(!s.includes("<b>"));
});

test("without a key the widget uses the browser's voice", () => {
  const key = process.env.AZURE_SPEECH_KEY;
  delete process.env.AZURE_SPEECH_KEY;
  assert.equal(ttsProvider(), "browser");
  process.env.AZURE_SPEECH_KEY = "x";
  assert.equal(ttsProvider(), "azure");
  if (key === undefined) delete process.env.AZURE_SPEECH_KEY; else process.env.AZURE_SPEECH_KEY = key;
});
