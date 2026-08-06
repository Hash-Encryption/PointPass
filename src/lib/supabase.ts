import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env["VITE_SUPABASE_URL"] ||
  import.meta.env["SUPABASE_URL"] ||
  "https://tldzmrghbvqfaclantlr.supabase.co";

const SUPABASE_ANON_KEY =
  import.meta.env["VITE_SUPABASE_ANON_KEY"] ||
  import.meta.env["SUPABASE_ANON_KEY"] ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsZHptcmdoYnZxZmFjbGFudGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MjQ4MjUsImV4cCI6MjEwMDQwMDgyNX0.KvpR7DqUi-Ed4E3s_wVkJXMqB5cj3DHKEmis_jiTffw";

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
