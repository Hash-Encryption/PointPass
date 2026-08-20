import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/server-supabase";
import { buildWalletPassPayload } from "@/lib/wallet-payload";

async function walletFetch(method: "POST" | "PUT", path: string, body: unknown) {
  const apiKey = process.env["WALLETWALLET_API_KEY"];
  const apiUrl = process.env["WALLETWALLET_API_URL"];
  if (!apiKey || !apiUrl) {
    return {
      ok: false as const,
      status: 503,
      error: "WalletWallet server configuration is incomplete",
      data: null,
    };
  }
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`WalletWallet ${path} failed [${res.status}]`);
    return {
      ok: false as const,
      status: res.status,
      error: `WalletWallet request failed (${res.status})`,
      data: null,
    };
  }
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { ok: true as const, status: res.status, error: null, data };
}

const createPassSchema = z.object({
  slug: z.string().min(1).max(64),
  phone: z.string().min(6).max(20),
});

export const createWalletPass = createServerFn({ method: "POST" })
  .validator((d: unknown) => createPassSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = createServerSupabaseClient();
    const { data: claimData, error: claimError } = await supabase
      .rpc("claim_public_pass", {
        _slug: data.slug,
        _phone: data.phone,
      })
      .single();

    if (claimError) throw new Error(claimError.message);
    const claim = claimData as {
      pass_serial: string;
      pass_program_type: "stamp" | "points" | "coupon_morph";
      business_name: string;
      business_offer: string;
      business_target_stamps: number;
    } | null;
    if (!claim) throw new Error("Pass registration returned no result");

    const result = await walletFetch(
      "POST",
      "/passes",
      buildWalletPassPayload({
        serial: claim.pass_serial,
        businessName: claim.business_name,
        offer: claim.business_offer,
        programType: claim.pass_program_type,
        stamps: 0,
        points: 0,
        morphed: false,
        targetStamps: claim.business_target_stamps,
      }),
    );
    if (!result.ok) {
      // Graceful fallback so the claim flow stays usable while credentials pend.
      return {
        ok: false,
        error: result.error,
        appleUrl: null as string | null,
        googleUrl: null as string | null,
      };
    }
    const payload = result.data as {
      serialNumber?: string;
      googleSaveUrl?: string;
      shareUrl?: string;
    };
    if (!payload.serialNumber || !payload.shareUrl) {
      return {
        ok: false,
        error: "WalletWallet returned an incomplete pass response",
        appleUrl: null,
        googleUrl: null,
      };
    }

    const { error: attachError } = await supabase.rpc("attach_wallet_serial", {
      _pass_serial: claim.pass_serial,
      _wallet_serial: payload.serialNumber,
    });
    if (attachError) throw new Error(attachError.message);

    return {
      ok: true,
      error: null as string | null,
      appleUrl: payload.shareUrl,
      googleUrl: payload.googleSaveUrl ?? payload.shareUrl,
    };
  });

const updatePassSchema = z.object({
  slug: z.string().min(1).max(64),
  pin: z.string().regex(/^[0-9]{4}$/),
  serial: z.string().min(1).max(128),
  action: z.enum(["stamp", "points", "redeem"]),
  amountSar: z.number().min(0).max(100000).optional(),
});

export const updateWalletPass = createServerFn({ method: "POST" })
  .validator((d: unknown) => updatePassSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = createServerSupabaseClient();
    const { data: actionData, error: actionError } = await supabase
      .rpc("cashier_apply_action", {
        _slug: data.slug,
        _pin: data.pin,
        _serial: data.serial,
        _action: data.action,
        _amount_sar: data.amountSar ?? null,
      })
      .single();

    if (actionError) {
      return { ok: false as const, recorded: false as const, error: actionError.message };
    }

    const state = actionData as {
      wallet_serial: string | null;
      pass_serial: string;
      pass_program_type: "stamp" | "points" | "coupon_morph";
      pass_stamps: number;
      pass_points: number;
      pass_morphed: boolean;
      business_name: string;
      business_offer: string;
      business_target_stamps: number;
    } | null;

    if (!state?.wallet_serial) {
      return { ok: false as const, recorded: true as const, error: "Wallet pass is not attached" };
    }

    const result = await walletFetch(
      "PUT",
      `/passes/${encodeURIComponent(state.wallet_serial)}`,
      buildWalletPassPayload({
        serial: state.pass_serial,
        businessName: state.business_name,
        offer: state.business_offer,
        programType: state.pass_program_type,
        stamps: state.pass_stamps,
        points: state.pass_points,
        morphed: state.pass_morphed,
        targetStamps: state.business_target_stamps,
        ...(data.action === "redeem" ? { notification: "Reward redeemed" } : {}),
      }),
    );
    return { ok: result.ok, recorded: true as const, error: result.error };
  });

const pushSchema = z.object({
  accessToken: z.string().min(20),
  businessId: z.string().uuid(),
  slug: z.string().min(1).max(64),
  titleAr: z.string().max(80),
  titleEn: z.string().max(80),
  bodyAr: z.string().max(300),
  bodyEn: z.string().max(300),
  segment: z.enum(["all", "inactive_14", "inactive_30", "inactive_60"]).default("all"),
});

export const sendWalletPush = createServerFn({ method: "POST" })
  .validator((d: unknown) => pushSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = createServerSupabaseClient(data.accessToken);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(data.accessToken);

    if (userError || !user) {
      throw new Error("Your merchant session expired. Sign in again.");
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id,name_en,offer_en,target_stamps")
      .eq("id", data.businessId)
      .eq("slug", data.slug)
      .maybeSingle();

    if (businessError || !business) {
      throw new Error("You cannot send campaigns for this business");
    }

    let passesQuery = supabase
      .from("pass_instances")
      .select("serial,wallet_serial,program_type,stamps,points,morphed,last_visit_at")
      .eq("business_id", business.id)
      .not("wallet_serial", "is", null)
      .limit(100); // ponytail: one batch is enough for MVP; add a queue when campaigns exceed 100 passes.

    if (data.segment !== "all") {
      const days = Number(data.segment.split("_")[1]);
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      passesQuery = passesQuery.or(`last_visit_at.is.null,last_visit_at.lt.${cutoff}`);
    }

    const { data: passes, error: passesError } = await passesQuery;
    if (passesError) throw new Error(passesError.message);
    if (!passes?.length)
      return { ok: false as const, error: "No wallet passes match this segment" };

    const notification = [data.titleEn.trim(), data.bodyEn.trim()].filter(Boolean).join(" — ");
    const results = await Promise.all(
      passes.map((pass) =>
        walletFetch(
          "PUT",
          `/passes/${encodeURIComponent(pass.wallet_serial!)}`,
          buildWalletPassPayload({
            serial: pass.serial,
            businessName: business.name_en,
            offer: business.offer_en ?? "",
            programType: pass.program_type,
            stamps: pass.stamps,
            points: pass.points,
            morphed: pass.morphed,
            targetStamps: business.target_stamps ?? 9,
            notification,
          }),
        ),
      ),
    );
    const failed = results.filter((result) => !result.ok).length;
    return {
      ok: failed === 0,
      error: failed ? `${failed} wallet update${failed === 1 ? "" : "s"} failed` : null,
    };
  });
