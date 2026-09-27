// Supabase connection (server-side only – the secret key must never reach the browser).
// Without the env vars the app falls back to local files, so it still runs for development.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export const db = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
