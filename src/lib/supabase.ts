import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://cxtmckbpnjxkrsuwlvwl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4dG1ja2Jwbmp4a3JzdXdsdndsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4ODkyMjgsImV4cCI6MjEwMTQ2NTIyOH0.YjQudMUVdnwSQQiKCx3K8UZjC6aIJcnK-stdyUIeZHU";

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
