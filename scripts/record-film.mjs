// Records one of the Sella films (public/sella/film.html, navod.html) into an MP4, frame by frame.
// Every frame of a film is a pure function of time (window.__render(t)), so the result is smooth
// however slow the machine is. Needs the app running (npm start) and, only for this script:
//   npm i --no-save puppeteer-core ffmpeg-static
// Usage: node scripts/record-film.mjs navod cs [--audio voice.mp3] [--chrome "C:/…/chrome.exe"]
//   → public/sella/video/navod-cs.mp4 and navod-cs.jpg (the poster)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import ffmpeg from "ffmpeg-static";

const [film = "navod", lang = "cs"] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
const opt = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const FPS = 30;
const base = process.env.APP_URL || "http://localhost:3000";
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "sella", "video", `${film}-${lang}`);
const chrome = opt("chrome") || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find((p) => fs.existsSync(p));
if (!chrome) throw new Error("Chrome not found – pass --chrome <path>");

const browser = await puppeteer.launch({ executablePath: chrome, defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
await page.goto(`${base}/sella/${film}.html?lang=${lang}&rec=1`, { waitUntil: "networkidle0" });
await page.evaluate(() => window.__ready);
const duration = await page.evaluate(() => window.__duration);
const frames = Math.ceil(duration * FPS);
console.log(`${film} (${lang}): ${duration.toFixed(1)} s, ${frames} frames`);

const audio = opt("audio");
const enc = spawn(ffmpeg, [
  "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  ...(audio ? ["-i", audio, "-c:a", "aac", "-b:a", "128k", "-shortest"] : []),
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", "26", "-movflags", "+faststart", `${out}.mp4`,
], { stdio: ["pipe", "inherit", "inherit"] });
const write = (buf) => new Promise((ok) => (enc.stdin.write(buf) ? ok() : enc.stdin.once("drain", ok)));

let poster = null;
for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.__render(t), i / FPS);
  const shot = await page.screenshot({ type: "jpeg", quality: 92 });
  await write(shot);
  // the poster: the title, fully faded in
  if (i === Math.round(2.4 * FPS)) poster = shot;
  if (i % (FPS * 10) === 0) process.stdout.write(`  ${Math.round((i / frames) * 100)} %\r`);
}
enc.stdin.end();
await new Promise((ok, fail) => enc.on("close", (code) => (code ? fail(new Error(`ffmpeg exited ${code}`)) : ok())));
if (poster) fs.writeFileSync(`${out}.jpg`, poster);
await browser.close();
console.log(`→ ${path.relative(process.cwd(), out)}.mp4`);
