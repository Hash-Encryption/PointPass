import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
// @ts-expect-error Cloudflare supplies this runtime module to Pages Functions.
import { env } from "cloudflare:workers";
import { createServerSupabaseClient } from "@/lib/server-supabase";
import { buildWalletPassPayload } from "@/lib/wallet-payload";
import { generateStampStripDataUri, resolveStampIcon } from "@/lib/strip-generator";
import { captureAppError } from "@/lib/observability";

// Caller-scoped throttle for anonymous guest claims (prevents bot floods while protecting legitimate users)
const anonClaimThrottle = new Map<string, number[]>();
const MAX_ANON_PER_WINDOW = 10;
const ANON_WINDOW_MS = 60_000;

function checkAnonClaimRateLimit(): boolean {
  try {
    const ip =
      getRequestIP({ xForwardedFor: true }) ??
      getRequestHeader("cf-connecting-ip") ??
      "anon_caller";
    const now = Date.now();
    const timestamps = anonClaimThrottle.get(ip) ?? [];
    const valid = timestamps.filter((t) => now - t < ANON_WINDOW_MS);
    if (valid.length >= MAX_ANON_PER_WINDOW) {
      return false;
    }
    valid.push(now);
    anonClaimThrottle.set(ip, valid);

    // Garbage collection on large cache
    if (anonClaimThrottle.size > 10_000) {
      for (const [key, times] of anonClaimThrottle.entries()) {
        if (times.every((t) => now - t >= ANON_WINDOW_MS)) {
          anonClaimThrottle.delete(key);
        }
      }
    }
    return true;
  } catch {
    return true; // Fail open to protect legitimate customer traffic
  }
}

function getPublicStripUrl(
  slug: string,
  stamps: number,
  target: number,
  brandColor?: string | null,
  accentColor?: string | null,
  stampIcon?: string | null,
): string | undefined {
  try {
    const host = getRequestHeader("x-forwarded-host") ?? getRequestHeader("host");
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    if (!host || host.includes("localhost") || host.includes("127.0.0.1")) {
      return undefined;
    }
    const origin = `${proto}://${host}`;
    const params = new URLSearchParams({
      stamps: String(stamps),
      target: String(target),
    });
    if (brandColor) params.set("brand", brandColor);
    if (accentColor) params.set("accent", accentColor);
    if (stampIcon) params.set("icon", stampIcon);
    return `${origin}/api/strip/${encodeURIComponent(slug)}.png?${params.toString()}`;
  } catch {
    return undefined;
  }
}

async function walletFetch(method: "POST" | "PUT", path: string, body: unknown) {
  const apiKey = env.WALLETWALLET_API_KEY ?? process.env["WALLETWALLET_API_KEY"];
  const apiUrl = env.WALLETWALLET_API_URL ?? process.env["WALLETWALLET_API_URL"];
  if (!apiKey || !apiUrl) {
    return {
      ok: false as const,
      status: 503,
      error: "WalletWallet server configuration is incomplete",
      data: null,
    };
  }
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch {
    console.error(`WalletWallet ${path} failed [network]`);
    return {
      ok: false as const,
      status: 502,
      error: "WalletWallet request failed (network)",
      data: null,
    };
  }
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
  phone: z.string().trim().max(30).optional().nullable(),
});

export const createWalletPass = createServerFn({ method: "POST" })
  .validator((d: unknown) => createPassSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = createServerSupabaseClient();
    const cleanPhone = data.phone?.trim() ? data.phone.trim() : null;

    // Caller-scoped rate limit for anonymous claims (where phone is null)
    if (!cleanPhone && !checkAnonClaimRateLimit()) {
      captureAppError("CUSTOMER", new Error("Anonymous claim rate limit exceeded for caller"), {
        slug: data.slug,
        operation: "claim_public_pass",
      });
      throw new Error("Too many guest pass requests from this device. Please wait a moment.");
    }

    const { data: claimData, error: claimError } = await supabase
      .rpc("claim_public_pass", {
        _slug: data.slug,
        _phone: cleanPhone,
      })
      .single();

    if (claimError) {
      captureAppError("CUSTOMER", claimError, { slug: data.slug, operation: "claim_public_pass" });
      throw new Error(claimError.message);
    }
    const claim = claimData as {
      pass_serial: string;
      pass_program_type: "stamp" | "points" | "coupon_morph";
      business_name: string;
      business_offer: string;
      business_target_stamps: number;
      business_sar_per_point: number;
      business_points_per_reward: number;
      pass_stamps: number;
      pass_points: number;
      pass_morphed: boolean;
      pass_wallet_serial: string | null;
      is_resumed: boolean;
    } | null;
    if (!claim) throw new Error("Pass registration returned no result");

    // Resumed pass with an existing attached wallet: preserve loyalty identity and state
    if (claim.is_resumed && claim.pass_wallet_serial) {
      return {
        ok: true,
        error: null as string | null,
        isResumed: true,
        alreadyEnrolled: true,
        programType: claim.pass_program_type,
        stamps: claim.pass_stamps,
        points: claim.pass_points,
        morphed: claim.pass_morphed,
        targetStamps: claim.business_target_stamps,
        sarPerPoint: claim.business_sar_per_point,
        pointsPerReward: claim.business_points_per_reward,
        appleUrl: null as string | null,
        googleUrl: null as string | null,
      };
    }

    // Query business visual branding (colors, logo, template metadata)
    const { data: biz } = await supabase
      .from("businesses")
      .select("brand_color,accent_color,logo_url,offer_ar,offer_en")
      .eq("slug", data.slug)
      .maybeSingle();

    const targetStamps = claim.business_target_stamps || 8;
    const currentStamps = claim.pass_stamps ?? 0;
    const isStampCard =
      claim.pass_program_type === "stamp" || claim.pass_program_type === "coupon_morph";

    let stripDataUri: string | undefined;
    let stripUrl: string | undefined;
    if (isStampCard) {
      try {
        const icon = resolveStampIcon(
          null,
          biz?.offer_ar || biz?.offer_en || claim.business_offer,
          biz?.brand_color,
        );
        stripUrl = getPublicStripUrl(
          data.slug,
          currentStamps,
          targetStamps,
          biz?.brand_color,
          biz?.accent_color,
          icon,
        );
        if (!stripUrl) {
          stripDataUri = generateStampStripDataUri({
            targetStamps,
            stamps: currentStamps,
            brandColor: biz?.brand_color,
            accentColor: biz?.accent_color,
            stampIcon: icon,
          });
        }
      } catch (stripErr) {
        captureAppError("CUSTOMER", stripErr, {
          slug: data.slug,
          operation: "strip_generation_create",
        });
      }
    }

    // Build payload using actual loyalty state (never 0 if resumed)
    const result = await walletFetch(
      "POST",
      "/passes",
      buildWalletPassPayload({
        serial: claim.pass_serial,
        businessName: claim.business_name,
        offer: claim.business_offer,
        programType: claim.pass_program_type,
        stamps: currentStamps,
        points: claim.pass_points ?? 0,
        morphed: claim.pass_morphed ?? false,
        targetStamps,
        brandColor: biz?.brand_color,
        accentColor: biz?.accent_color,
        stripUrl,
        stripDataUri,
        logoUrl: biz?.logo_url,
      }),
    );
    if (!result.ok) {
      // Graceful fallback so the claim flow stays usable while credentials pend.
      return {
        ok: false,
        error: result.error,
        isResumed: claim.is_resumed,
        alreadyEnrolled: false,
        programType: claim.pass_program_type,
        stamps: claim.pass_stamps,
        points: claim.pass_points,
        morphed: claim.pass_morphed,
        targetStamps: claim.business_target_stamps,
        sarPerPoint: claim.business_sar_per_point,
        pointsPerReward: claim.business_points_per_reward,
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
        isResumed: claim.is_resumed,
        alreadyEnrolled: false,
        programType: claim.pass_program_type,
        stamps: claim.pass_stamps,
        points: claim.pass_points,
        morphed: claim.pass_morphed,
        targetStamps: claim.business_target_stamps,
        sarPerPoint: claim.business_sar_per_point,
        pointsPerReward: claim.business_points_per_reward,
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
      isResumed: claim.is_resumed,
      alreadyEnrolled: false,
      programType: claim.pass_program_type,
      stamps: claim.pass_stamps,
      points: claim.pass_points,
      morphed: claim.pass_morphed,
      targetStamps: claim.business_target_stamps,
      sarPerPoint: claim.business_sar_per_point,
      pointsPerReward: claim.business_points_per_reward,
      appleUrl: payload.shareUrl,
      googleUrl: payload.googleSaveUrl ?? payload.shareUrl,
    };
  });

const updatePassSchema = z.object({
  slug: z.string().min(1).max(64),
  cashierSession: z.string().regex(/^[a-f0-9]{64}$/),
  serial: z.string().min(1).max(128),
  action: z.enum(["stamp", "points", "redeem"]),
  amountSar: z.number().finite().positive().max(100000).optional(),
});

export const updateWalletPass = createServerFn({ method: "POST" })
  .validator((d: unknown) => updatePassSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = createServerSupabaseClient();
    const { data: actionData, error: actionError } = await supabase
      .rpc("cashier_apply_action", {
        _slug: data.slug,
        _session_token: data.cashierSession,
        _serial: data.serial,
        _action: data.action,
        _amount_sar: data.amountSar ?? null,
      })
      .single();

    if (actionError) {
      const sessionExpired = actionError.message === "Cashier session invalid or expired";
      return {
        ok: false as const,
        recorded: false as const,
        sessionExpired,
        error: sessionExpired
          ? "Cashier session expired. Unlock the terminal again."
          : actionError.message,
      };
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
      return {
        ok: false as const,
        recorded: true as const,
        error: "Wallet pass is not attached",
        stamps: state?.pass_stamps,
        points: state?.pass_points,
        morphed: state?.pass_morphed,
        programType: state?.pass_program_type,
        targetStamps: state?.business_target_stamps,
      };
    }

    // Query business visual branding to update the strip image with the new stamp count
    const { data: biz } = await supabase
      .from("businesses")
      .select("brand_color,accent_color,logo_url,offer_ar,offer_en")
      .eq("slug", data.slug)
      .maybeSingle();

    const targetStamps = state.business_target_stamps || 8;
    const currentStamps = state.pass_stamps ?? 0;
    const isStampCard =
      state.pass_program_type === "stamp" || state.pass_program_type === "coupon_morph";
    let stripDataUri: string | undefined;
    let stripUrl: string | undefined;
    if (isStampCard) {
      try {
        const icon = resolveStampIcon(
          null,
          biz?.offer_ar || biz?.offer_en || state.business_offer,
          biz?.brand_color,
        );
        stripUrl = getPublicStripUrl(
          data.slug,
          currentStamps,
          targetStamps,
          biz?.brand_color,
          biz?.accent_color,
          icon,
        );
        if (!stripUrl) {
          stripDataUri = generateStampStripDataUri({
            targetStamps,
            stamps: currentStamps,
            brandColor: biz?.brand_color,
            accentColor: biz?.accent_color,
            stampIcon: icon,
          });
        }
      } catch (stripErr) {
        captureAppError("CUSTOMER", stripErr, {
          slug: data.slug,
          operation: "strip_generation_update",
        });
      }
    }

    const result = await walletFetch(
      "PUT",
      `/passes/${encodeURIComponent(state.wallet_serial)}`,
      buildWalletPassPayload({
        serial: state.pass_serial,
        businessName: state.business_name,
        offer: state.business_offer,
        programType: state.pass_program_type,
        stamps: currentStamps,
        points: state.pass_points,
        morphed: state.pass_morphed,
        targetStamps,
        brandColor: biz?.brand_color,
        accentColor: biz?.accent_color,
        stripUrl,
        stripDataUri,
        logoUrl: biz?.logo_url,
        ...(data.action === "redeem" ? { notification: "Reward redeemed" } : {}),
      }),
    );
    return {
      ok: result.ok,
      recorded: true as const,
      error: result.error,
      stamps: state.pass_stamps,
      points: state.pass_points,
      morphed: state.pass_morphed,
      programType: state.pass_program_type,
      targetStamps: state.business_target_stamps,
    };
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
      .select("id,name_en,offer_en,target_stamps,brand_color,accent_color,logo_url,offer_ar")
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
    const targetStamps = business.target_stamps ?? 9;

    const results = await Promise.all(
      passes.map((pass) => {
        const isStampCard = pass.program_type === "stamp" || pass.program_type === "coupon_morph";
        let stripDataUri: string | undefined;
        let stripUrl: string | undefined;
        if (isStampCard) {
          try {
            const icon = resolveStampIcon(
              null,
              business.offer_ar || business.offer_en,
              business.brand_color,
            );
            stripUrl = getPublicStripUrl(
              data.slug,
              pass.stamps,
              targetStamps,
              business.brand_color,
              business.accent_color,
              icon,
            );
            if (!stripUrl) {
              stripDataUri = generateStampStripDataUri({
                targetStamps,
                stamps: pass.stamps,
                brandColor: business.brand_color,
                accentColor: business.accent_color,
                stampIcon: icon,
              });
            }
          } catch {
            // Graceful fallback to text payload
          }
        }

        return walletFetch(
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
            targetStamps,
            notification,
            brandColor: business.brand_color,
            accentColor: business.accent_color,
            stripUrl,
            stripDataUri,
            logoUrl: business.logo_url,
          }),
        );
      }),
    );
    const failed = results.filter((result) => !result.ok).length;
    return {
      ok: failed === 0,
      error: failed ? `${failed} wallet update${failed === 1 ? "" : "s"} failed` : null,
    };
  });
