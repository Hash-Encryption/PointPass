import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/server-supabase";

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

    const { data: rpcData, error: rpcError } = await serverClient.rpc("save_onboarding_step", {
      _business_id: data.businessId,
      _step: data.step,
      _requested_plan: data.requestedPlan || null,
      _program_type: data.programType || null,
      _brand_color: data.brandColor || null,
      _accent_color: data.accentColor || null,
      _offer_ar: data.offerAr || null,
      _offer_en: data.offerEn || null,
      _target_stamps: data.targetStamps || null,
      _sar_per_point: data.sarPerPoint || null,
      _points_per_reward: data.pointsPerReward || null,
      _main_branch_name_ar: data.mainBranchNameAr || null,
      _main_branch_name_en: data.mainBranchNameEn || null,
      _main_branch_address_ar: data.mainBranchAddressAr || null,
      _main_branch_address_en: data.mainBranchAddressEn || null,
    });

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    return {
      ok: true as const,
      data: rpcData,
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

    const { error: rpcError } = await serverClient.rpc("complete_onboarding", {
      _business_id: data.businessId,
    });

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    return {
      ok: true as const,
      completed: true,
    };
  });
