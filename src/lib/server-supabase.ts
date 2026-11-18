import { createClient } from "@supabase/supabase-js";

function getSupabaseEnv() {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"];
  const serviceKey =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["VITE_SUPABASE_SERVICE_ROLE_KEY"];
  return { url, anonKey, serviceKey };
}

export function hasServiceRoleKey(): boolean {
  const { url, anonKey, serviceKey } = getSupabaseEnv();
  return Boolean(url && serviceKey && serviceKey.trim().length > 0 && serviceKey !== anonKey);
}

export function createUserSupabaseClient(accessToken: string) {
  const { url, anonKey } = getSupabaseEnv();

  if (!url || !anonKey) {
    throw new Error("Server Supabase configuration is incomplete");
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function createServerSupabaseClient(accessToken?: string) {
  if (accessToken) {
    return createUserSupabaseClient(accessToken);
  }

  const { url, anonKey } = getSupabaseEnv();

  if (!url || !anonKey) {
    throw new Error("Server Supabase configuration is incomplete");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function createAdminSupabaseClient() {
  if (!hasServiceRoleKey()) {
    return null;
  }

  const { url, serviceKey } = getSupabaseEnv();

  return createClient(url!, serviceKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
