import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"];
const SUPABASE_ANON_KEY = import.meta.env["VITE_SUPABASE_ANON_KEY"];

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Resolve the tenant slug from a subdomain (slug.platform.com) or /join/:slug path. */
export function resolveSlugFromHost(host: string | undefined, fallback?: string) {
  if (!host) return fallback ?? null;
  const clean = host.split(":")[0]!;
  const parts = clean.split(".");
  const reserved = new Set(["www", "app", "localhost", "lovable", "lovableproject"]);
  if (parts.length >= 3 && !reserved.has(parts[0]!)) return parts[0]!;
  return fallback ?? null;
}
