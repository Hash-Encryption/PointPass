import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://cxtmckbpnjxkrsuwlvwl.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4dG1ja2Jwbmp4a3JzdXdsdndsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4ODkyMjgsImV4cCI6MjEwMTQ2NTIyOH0.YjQudMUVdnwSQQiKCx3K8UZjC6aIJcnK-stdyUIeZHU";

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
  const platformHosts = new Set([
    "localhost",
    "127.0.0.1",
    "pointpass.pages.dev",
    "pointpass.hgendi3.workers.dev",
  ]);
  if (platformHosts.has(clean)) return fallback ?? null;
  const parts = clean.split(".");
  const reserved = new Set(["www", "app", "localhost", "lovable", "lovableproject"]);
  if (parts.length >= 3 && !reserved.has(parts[0]!)) return parts[0]!;
  return fallback ?? null;
}
