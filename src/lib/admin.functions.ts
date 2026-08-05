import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const createBusinessSchema = z.object({
  accessToken: z.string().min(20),
  merchantEmail: z.string().email().max(254),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  plan: z.enum(["starter", "growth", "enterprise"]),
});

function getServerConfig() {
  const url = process.env["SUPABASE_URL"];
  const secretKey = process.env["SUPABASE_SECRET_KEY"];
  const appUrl = process.env["APP_URL"];

  if (!url || !secretKey || !appUrl) {
    throw new Error("Server authentication is not configured");
  }

  return { url, secretKey, appUrl: appUrl.replace(/\/$/, "") };
}

export const inviteMerchantAndCreateBusiness = createServerFn({ method: "POST" })
  .validator((input: unknown) => createBusinessSchema.parse(input))
  .handler(async ({ data }) => {
    const { url, secretKey, appUrl } = getServerConfig();
    const serverClient = createClient(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await serverClient.auth.getUser(data.accessToken);

    if (userError || !user) {
      throw new Error("Your admin session is no longer valid. Sign in again.");
    }

    const { data: adminRole, error: roleError } = await serverClient
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .is("business_id", null)
      .maybeSingle();

    if (roleError || !adminRole) {
      throw new Error("Only super admins can invite merchants");
    }

    // Pre-register business metadata without creating unconfirmed auth.users row

    const adminSessionClient = createClient(url, secretKey, {
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const { error: businessError } = await adminSessionClient.rpc("admin_create_business", {
      _merchant_email: data.merchantEmail.toLowerCase(),
      _slug: data.slug,
      _name_ar: data.nameAr,
      _name_en: data.nameEn,
      _plan: data.plan,
    });

    if (businessError) {
      const cleanEmail = data.merchantEmail.toLowerCase();
      const { error: directInsertError } = await serverClient
        .from("businesses")
        .insert({
          merchant_email: cleanEmail,
          slug: data.slug,
          name_ar: data.nameAr,
          name_en: data.nameEn,
          plan: data.plan,
        });

      if (directInsertError) {
        throw new Error(directInsertError.message || businessError.message);
      }
    }

    return {
      ok: true as const,
      invitationSent: false,
      merchantEmail: data.merchantEmail.toLowerCase(),
    };
  });

