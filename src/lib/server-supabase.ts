import { createClient } from "@supabase/supabase-js";

export function createServerSupabaseClient(accessToken?: string) {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"];

  if (!url || !anonKey) {
    throw new Error("Server Supabase configuration is incomplete");
  }

  return createClient(url, anonKey, {
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
