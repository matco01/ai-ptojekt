// Loads .env and .env.local (if present) before anything else reads process.env.
// Imported first in server.js so it also works after `node --watch` restarts.
for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); } catch {}
}
