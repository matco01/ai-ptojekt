// Where the app may write files (analytics events, invented agent names).
// Locally that's ./data. On Vercel (and other serverless hosts) the project folder is
// read-only, so we fall back to the temp folder – writable, but per instance and wiped on
// cold starts. For data that must survive there, swap this for a database (e.g. Upstash Redis).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function writableDir() {
  const preferred = path.join(here, "..", "data");
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const tmp = path.join(os.tmpdir(), "ai-prodavac");
    fs.mkdirSync(tmp, { recursive: true });
    return tmp;
  }
}

export const dataDir = writableDir();
export const dataFile = (name) => path.join(dataDir, name);
