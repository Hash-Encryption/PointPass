import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/server-supabase";

const billingStateSchema = z.object({
  accessToken: z.string().min(20),
  businessId: z.string().uuid(),
});

export interface BillingStateResult {
  planCode: string;
  planNameAr: string;
  planNameEn: string;
  requestedPlanCode: string | null;
  subscriptionStatus: string;
  billingProvider: string | null;
  activeLocations: number;
  maxLocations: number;
  canAddLocation: boolean;
  providerConfigured: boolean;
}

export const getBusinessBillingStateFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => billingStateSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; state: BillingStateResult }> => {
    const serverClient = createServerSupabaseClient(data.accessToken);
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser(data.accessToken);

    if (authError || !user) {
      throw new Error("Authentication required");
    }

    const { data: rpcData, error: rpcError } = await serverClient.rpc(
      "get_business_billing_state",
      {
        _business_id: data.businessId,
      },
    );

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row) {
      throw new Error("Billing record not found");
    }

    return {
      ok: true,
      state: {
        planCode: row.plan_code,
        planNameAr: row.plan_name_ar,
        planNameEn: row.plan_name_en,
        requestedPlanCode: row.requested_plan_code,
        subscriptionStatus: row.subscription_status,
        billingProvider: row.billing_provider,
        activeLocations: row.active_locations,
        maxLocations: row.max_locations,
        canAddLocation: row.can_add_location,
        providerConfigured: row.provider_configured ?? false,
      },
    };
  });

const planChangeSchema = z.object({
  accessToken: z.string().min(20),
  businessId: z.string().uuid(),
  targetPlan: z.enum(["starter", "growth", "enterprise", "single_location", "multi_location"]),
});

export const requestBusinessPlanChangeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => planChangeSchema.parse(input))
  .handler(async ({ data }) => {
    const serverClient = createServerSupabaseClient(data.accessToken);
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser(data.accessToken);

    if (authError || !user) {
      throw new Error("Authentication required");
    }

    const { data: rpcData, error: rpcError } = await serverClient.rpc(
      "request_business_plan_change",
      {
        _business_id: data.businessId,
        _target_plan: data.targetPlan,
      },
    );

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return {
      ok: true as const,
      result: row as {
        effective_plan: string;
        requested_plan: string;
        status: string;
        message_code: string;
      },
    };
  });
