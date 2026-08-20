import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/server-supabase";

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

export const inviteMerchantAndCreateBusiness = createServerFn({ method: "POST" })
  .validator((input: unknown) => createBusinessSchema.parse(input))
  .handler(async ({ data }) => {
    const serverClient = createServerSupabaseClient(data.accessToken);

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
      throw new Error("Only super admins can create businesses");
    }

    const { data: businessId, error: businessError } = await serverClient.rpc(
      "admin_create_business",
      {
        _merchant_email: data.merchantEmail.toLowerCase(),
        _slug: data.slug,
        _name_ar: data.nameAr,
        _name_en: data.nameEn,
        _plan: data.plan,
      },
    );

    if (businessError) {
      throw new Error(businessError.message);
    }

    const { data: business, error: lookupError } = await serverClient
      .from("businesses")
      .select("owner_id")
      .eq("id", businessId)
      .single();

    if (lookupError) throw new Error(lookupError.message);

    return {
      ok: true as const,
      merchantLinked: Boolean(business.owner_id),
      merchantEmail: data.merchantEmail.toLowerCase(),
    };
  });
