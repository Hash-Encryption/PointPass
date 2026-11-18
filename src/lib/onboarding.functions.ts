import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/server-supabase";
export { saveOnboardingProgressServerFn } from "@/lib/wallet.functions";

const bootstrapSchema = z.object({
  accessToken: z.string().min(20),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  plan: z
    .enum(["single_location", "multi_location", "starter", "growth", "enterprise"])
    .default("single_location"),
});

export const bootstrapOwnerBusinessFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => bootstrapSchema.parse(input))
  .handler(async ({ data }) => {
    const serverClient = createServerSupabaseClient(data.accessToken);
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser(data.accessToken);

    if (authError || !user) {
      throw new Error("Authentication required to create a business");
    }

    const { data: rpcData, error: rpcError } = await serverClient.rpc("bootstrap_owner_business", {
      _slug: data.slug,
      _name_ar: data.nameAr,
      _name_en: data.nameEn,
      _plan: data.plan,
    });

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return {
      ok: true as const,
      business: row as {
        business_id: string;
        slug: string;
        name_ar: string;
        name_en: string;
        effective_plan: string;
        onboarding_step: string;
      },
    };
  });

const saveStepSchema = z.object({
  accessToken: z.string().min(20),
  businessId: z.string().uuid(),
  step: z.enum(["business", "plan", "loyalty", "reward", "location", "launch"]),
  requestedPlan: z.string().optional(),
  programType: z.enum(["stamp", "points", "coupon_morph"]).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  offerAr: z.string().max(250).optional(),
  offerEn: z.string().max(250).optional(),
  targetStamps: z.number().int().positive().optional(),
  sarPerPoint: z.number().int().positive().optional(),
  pointsPerReward: z.number().int().positive().optional(),
  mainBranchNameAr: z.string().max(120).optional(),
  mainBranchNameEn: z.string().max(120).optional(),
  mainBranchAddressAr: z.string().max(250).optional(),
  mainBranchAddressEn: z.string().max(250).optional(),
  templateId: z.string().max(250).optional(),
});

export const saveOnboardingStepFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => saveStepSchema.parse(input))
  .handler(async ({ data }) => {
    const serverClient = createServerSupabaseClient(data.accessToken);
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser(data.accessToken);

    if (authError || !user) {
      throw new Error("Authentication required");
    }

    const db = createAdminSupabaseClient() ?? serverClient;
    const { data: biz, error: bizErr } = await db
      .from("businesses")
      .select("id,owner_id,merchant_email")
      .eq("id", data.businessId)
      .maybeSingle();

    if (bizErr || !biz) {
      throw new Error("Business not found");
    }

    const isOwner =
      biz.owner_id === user.id ||
      Boolean(
        biz.merchant_email &&
        user.email &&
        biz.merchant_email.toLowerCase() === user.email.toLowerCase(),
      );

    if (!isOwner) {
      throw new Error("Forbidden: you do not own this business");
    }

    const nowIso = new Date().toISOString();
    const updates: Record<string, unknown> = {};
    if (data.programType) updates["program_type"] = data.programType;
    if (data.brandColor) updates["brand_color"] = data.brandColor;
    if (data.accentColor) updates["accent_color"] = data.accentColor;
    if (data.offerAr !== undefined) updates["offer_ar"] = data.offerAr;
    if (data.offerEn !== undefined) updates["offer_en"] = data.offerEn;
    if (data.targetStamps !== undefined) updates["target_stamps"] = data.targetStamps;
    if (data.sarPerPoint !== undefined) updates["sar_per_point"] = data.sarPerPoint;
    if (data.pointsPerReward !== undefined) updates["points_per_reward"] = data.pointsPerReward;
    if (data.templateId) updates["template_id"] = data.templateId;

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await db
        .from("businesses")
        .update(updates)
        .eq("id", data.businessId);
      if (updateErr) throw new Error(updateErr.message);
    }

    const { error: onbErr } = await db.from("business_onboarding").upsert(
      {
        business_id: data.businessId,
        step: data.step,
        completed: false,
        updated_at: nowIso,
      },
      { onConflict: "business_id" },
    );
    if (onbErr) throw new Error(onbErr.message);

    return {
      ok: true as const,
      data: [{ step: data.step, completed: false }],
    };
  });

const completeSchema = z.object({
  accessToken: z.string().min(20),
  businessId: z.string().uuid(),
});

export const completeOnboardingFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => completeSchema.parse(input))
  .handler(async ({ data }) => {
    const serverClient = createServerSupabaseClient(data.accessToken);
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser(data.accessToken);

    if (authError || !user) {
      throw new Error("Authentication required");
    }

    const db = createAdminSupabaseClient() ?? serverClient;
    const { data: biz, error: bizErr } = await db
      .from("businesses")
      .select("id,owner_id,merchant_email")
      .eq("id", data.businessId)
      .maybeSingle();

    if (bizErr || !biz) {
      throw new Error("Business not found");
    }

    const isOwner =
      biz.owner_id === user.id ||
      Boolean(
        biz.merchant_email &&
        user.email &&
        biz.merchant_email.toLowerCase() === user.email.toLowerCase(),
      );

    if (!isOwner) {
      throw new Error("Forbidden: you do not own this business");
    }

    const nowIso = new Date().toISOString();
    const { error: onbErr } = await db.from("business_onboarding").upsert(
      {
        business_id: data.businessId,
        step: "completed",
        completed: true,
        completed_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "business_id" },
    );
    if (onbErr) throw new Error(onbErr.message);

    return {
      ok: true as const,
      completed: true,
    };
  });
