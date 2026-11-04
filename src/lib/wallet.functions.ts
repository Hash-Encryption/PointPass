import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
// @ts-expect-error Cloudflare supplies this runtime module to Pages Functions.
import { env } from "cloudflare:workers";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/server-supabase";
import {
  buildBaselineWalletPassPayload,
  buildWalletPassPayload,
  resolveColorPreset,
  type WalletPassState,
} from "@/lib/wallet-payload";
import { parsePassTemplateMeta } from "@/lib/wallet-tier";
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
  stripStyle?: string | null,
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
      v: String(Date.now()), // Cache-busted timestamp for live OTA Apple Wallet sync
    });
    if (brandColor) params.set("brand", brandColor);
    if (accentColor) params.set("accent", accentColor);
    if (stampIcon) params.set("icon", stampIcon);
    if (stripStyle) params.set("style", stripStyle);
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
    let errorDetail = `WalletWallet request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === "string") {
        errorDetail = parsed.error;
      } else if (parsed && typeof parsed.message === "string") {
        errorDetail = parsed.message;
      }
    } catch {
      if (text && text.length < 200) {
        errorDetail = text;
      }
    }
    console.error(`WalletWallet ${path} failed [${res.status}]: ${errorDetail}`);
    return {
      ok: false as const,
      status: res.status,
      error: errorDetail,
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
  brandColor: z.string().optional().nullable(),
  accentColor: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  offerAr: z.string().optional().nullable(),
  offerEn: z.string().optional().nullable(),
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

    // Query business visual branding (colors, logo, template metadata, offer texts)
    // First try direct table query; if blocked under anon RLS, fall back to get_public_business_by_slug RPC
    let biz: {
      brand_color?: string | null;
      accent_color?: string | null;
      logo_url?: string | null;
      offer_ar?: string | null;
      offer_en?: string | null;
      custom_domain?: string | null;
      template_id?: string | null;
    } | null = null;

    try {
      const { data: bizRow } = await supabase
        .from("businesses")
        .select("brand_color,accent_color,logo_url,offer_ar,offer_en,custom_domain,template_id")
        .eq("slug", data.slug)
        .maybeSingle();
      if (bizRow) {
        biz = bizRow;
      }
    } catch {
      // Direct select may be blocked by anon RLS
    }

    if (!biz || !biz.brand_color) {
      try {
        const { data: rpcBiz } = await supabase
          .rpc("get_public_business_by_slug", { _slug: data.slug })
          .maybeSingle();
        if (rpcBiz) {
          const row = rpcBiz as Record<string, unknown>;
          biz = {
            brand_color: (row["brand_color"] as string) ?? null,
            accent_color: (row["accent_color"] as string) ?? null,
            logo_url: (row["logo_url"] as string) ?? null,
            offer_ar: (row["offer_ar"] as string) ?? null,
            offer_en: (row["offer_en"] as string) ?? null,
            template_id: (row["template_id"] as string) ?? null,
          };
        }
      } catch {
        // Fallback
      }
    }

    // Blend server & client-passed branding attributes (protecting anon callers from RLS nulls)
    const effectiveBrandColor = biz?.brand_color || data.brandColor || null;
    const effectiveAccentColor = biz?.accent_color || data.accentColor || null;
    const rawTemplateId: string | null =
      biz?.template_id ||
      data.templateId ||
      (biz?.custom_domain?.startsWith("tpl_") ? biz.custom_domain : null);

    const templateMeta = parsePassTemplateMeta(rawTemplateId);
    const effectiveColorPreset =
      rawTemplateId && rawTemplateId.includes("preset-")
        ? templateMeta.colorPreset
        : resolveColorPreset(effectiveBrandColor, effectiveAccentColor);

    const targetStamps = claim.business_target_stamps || 8;
    const isStampCard =
      claim.pass_program_type === "stamp" || claim.pass_program_type === "coupon_morph";
    let currentStamps = claim.pass_stamps ?? 0;

    // Start every new or zero-visit pass at 1 pre-filled welcome stamp (1/N)
    if (isStampCard && currentStamps === 0) {
      currentStamps = 1;
      try {
        await supabase.rpc("grant_welcome_stamp", { _pass_serial: claim.pass_serial });
      } catch (rpcErr) {
        try {
          await supabase
            .from("pass_instances")
            .update({ stamps: 1 })
            .eq("serial", claim.pass_serial);
        } catch (directErr) {
          console.warn("Welcome stamp initialization note:", directErr ?? rpcErr);
        }
      }
    }

    const passOffer =
      biz?.offer_en ||
      biz?.offer_ar ||
      data.offerEn ||
      data.offerAr ||
      claim.business_offer ||
      "Special Reward";

    const icon =
      templateMeta.stampIcon !== "star"
        ? templateMeta.stampIcon
        : resolveStampIcon(null, passOffer, effectiveBrandColor);

    let stripDataUri: string | undefined;
    let stripUrl: string | undefined;
    if (isStampCard && templateMeta.tierMode === "pro") {
      try {
        stripUrl = getPublicStripUrl(
          data.slug,
          currentStamps,
          targetStamps,
          effectiveBrandColor,
          effectiveAccentColor,
          icon,
          templateMeta.stripStyle,
        );
        if (!stripUrl) {
          stripDataUri = generateStampStripDataUri({
            targetStamps,
            stamps: currentStamps,
            brandColor: effectiveBrandColor,
            accentColor: effectiveAccentColor,
            stampIcon: icon,
            stripStyle: templateMeta.stripStyle,
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
    const passState: WalletPassState = {
      serial: claim.pass_serial,
      businessName: claim.business_name,
      offer: passOffer,
      programType: claim.pass_program_type,
      stamps: currentStamps,
      points: claim.pass_points ?? 0,
      morphed: claim.pass_morphed ?? false,
      targetStamps,
      brandColor: effectiveBrandColor,
      accentColor: effectiveAccentColor,
      stripUrl,
      stripDataUri,
      logoUrl: biz?.logo_url,
      stampIcon: icon,
      colorPreset: effectiveColorPreset,
      stripStyle: templateMeta.stripStyle,
      tierMode: templateMeta.tierMode,
    };

    let result: {
      ok: boolean;
      status: number;
      error: string | null;
      data: unknown;
    };

    if (claim.pass_wallet_serial) {
      // Existing attached wallet: update WalletWallet pass via PUT and provide active download links
      result = await walletFetch(
        "PUT",
        `/passes/${encodeURIComponent(claim.pass_wallet_serial)}`,
        buildWalletPassPayload(passState),
      );
      if (
        !result.ok &&
        (result.status === 400 ||
          result.status === 403 ||
          result.error?.toLowerCase().includes("pro") ||
          result.error?.toLowerCase().includes("plan"))
      ) {
        result = await walletFetch(
          "PUT",
          `/passes/${encodeURIComponent(claim.pass_wallet_serial)}`,
          buildBaselineWalletPassPayload(passState),
        );
      }
    } else {
      // Fresh pass: create in WalletWallet via POST
      result = await walletFetch("POST", "/passes", buildWalletPassPayload(passState));
      if (
        !result.ok &&
        (result.status === 400 ||
          result.status === 403 ||
          result.error?.toLowerCase().includes("pro") ||
          result.error?.toLowerCase().includes("plan"))
      ) {
        console.warn(
          "WalletWallet rich pass rejected, falling back to baseline payload:",
          result.error,
        );
        result = await walletFetch("POST", "/passes", buildBaselineWalletPassPayload(passState));
      }
    }

    if (!result.ok) {
      // Graceful fallback so the claim flow stays usable while credentials pend.
      return {
        ok: false,
        error: result.error,
        isResumed: claim.is_resumed,
        alreadyEnrolled: false,
        programType: claim.pass_program_type,
        stamps: currentStamps,
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
    } | null;

    if (!claim.pass_wallet_serial) {
      if (!payload?.serialNumber || !payload?.shareUrl) {
        return {
          ok: false,
          error: "WalletWallet returned an incomplete pass response",
          isResumed: claim.is_resumed,
          alreadyEnrolled: false,
          programType: claim.pass_program_type,
          stamps: currentStamps,
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
    }

    const shareUrl =
      payload?.shareUrl ||
      (claim.pass_wallet_serial ? `https://walletwallet.dev/p/${claim.pass_wallet_serial}` : null);
    const googleUrl = payload?.googleSaveUrl ?? shareUrl;

    return {
      ok: true,
      error: null as string | null,
      isResumed: claim.is_resumed,
      alreadyEnrolled: false,
      programType: claim.pass_program_type,
      stamps: currentStamps,
      points: claim.pass_points,
      morphed: claim.pass_morphed,
      targetStamps: claim.business_target_stamps,
      sarPerPoint: claim.business_sar_per_point,
      pointsPerReward: claim.business_points_per_reward,
      appleUrl: shareUrl,
      googleUrl,
    };
  });

const updatePassSchema = z.object({
  slug: z.string().min(1).max(64),
  cashierSession: z.string().regex(/^[a-f0-9]{64}$/),
  serial: z.string().min(1).max(128),
  action: z.enum(["stamp", "points", "redeem"]),
  amountSar: z.number().finite().positive().max(100000).optional(),
  count: z.number().int().min(1).max(20).optional(),
  templateId: z.string().optional().nullable(),
  brandColor: z.string().optional().nullable(),
  accentColor: z.string().optional().nullable(),
  businessName: z.string().optional().nullable(),
  offerText: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
});

type CashierActionState = {
  wallet_serial: string | null;
  pass_serial: string;
  pass_program_type: "stamp" | "points" | "coupon_morph";
  pass_stamps: number;
  pass_points: number;
  pass_morphed: boolean;
  business_name: string;
  business_offer: string;
  business_target_stamps: number;
  business_sar_per_point?: number;
};

export const updateWalletPass = createServerFn({ method: "POST" })
  .validator((d: unknown) => updatePassSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = createServerSupabaseClient();
    const repeatCount = data.action === "stamp" ? Math.min(20, Math.max(1, data.count ?? 1)) : 1;

    let actionData: CashierActionState | null = null;
    let actionError: { message: string } | null = null;

    for (let i = 0; i < repeatCount; i++) {
      const { data: stepData, error: stepError } = await supabase
        .rpc("cashier_apply_action", {
          _slug: data.slug,
          _session_token: data.cashierSession,
          _serial: data.serial,
          _action: data.action,
          _amount_sar: data.amountSar ?? null,
        })
        .single();

      if (stepError) {
        actionError = stepError;
        break;
      }
      actionData = stepData as CashierActionState;
    }

    if (actionError || !actionData) {
      const sessionExpired = actionError?.message === "Cashier session invalid or expired";
      return {
        ok: false as const,
        recorded: false as const,
        sessionExpired,
        error: sessionExpired
          ? "Cashier session expired. Unlock the terminal again."
          : (actionError?.message ?? "Failed to apply loyalty action"),
      };
    }

    const state: CashierActionState = actionData;

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

    // Query business visual branding (colors, logo, template metadata, offer texts)
    // First try direct table query; if blocked under anon RLS, fall back to get_public_business_by_slug RPC
    let biz: {
      slug?: string | null;
      name_ar?: string | null;
      name_en?: string | null;
      brand_color?: string | null;
      accent_color?: string | null;
      logo_url?: string | null;
      offer_ar?: string | null;
      offer_en?: string | null;
      custom_domain?: string | null;
      template_id?: string | null;
      target_stamps?: number | null;
    } | null = null;

    try {
      const { data: bizRow } = await supabase
        .from("businesses")
        .select(
          "slug,name_ar,name_en,brand_color,accent_color,logo_url,offer_ar,offer_en,custom_domain,template_id,target_stamps",
        )
        .eq("slug", data.slug)
        .maybeSingle();
      if (bizRow) {
        biz = bizRow;
      }
    } catch {
      // Direct select may be blocked by anon RLS
    }

    if (!biz || !biz.template_id || !biz.brand_color) {
      try {
        const { data: rpcBiz } = await supabase
          .rpc("get_public_business_by_slug", { _slug: data.slug })
          .maybeSingle();
        if (rpcBiz) {
          const row = rpcBiz as Record<string, unknown>;
          biz = {
            ...biz,
            slug: (row["slug"] as string) ?? biz?.slug ?? data.slug,
            name_ar: (row["name_ar"] as string) ?? biz?.name_ar ?? null,
            name_en: (row["name_en"] as string) ?? biz?.name_en ?? null,
            brand_color: (row["brand_color"] as string) ?? biz?.brand_color ?? null,
            accent_color: (row["accent_color"] as string) ?? biz?.accent_color ?? null,
            logo_url: (row["logo_url"] as string) ?? biz?.logo_url ?? null,
            offer_ar: (row["offer_ar"] as string) ?? biz?.offer_ar ?? null,
            offer_en: (row["offer_en"] as string) ?? biz?.offer_en ?? null,
            template_id: (row["template_id"] as string) ?? biz?.template_id ?? null,
          };
        }
      } catch {
        // Fallback
      }
    }

    // Blend server & client-forwarded branding attributes (cashier session fallback)
    const effectiveBrandColor = biz?.brand_color || data.brandColor || null;
    const effectiveAccentColor = biz?.accent_color || data.accentColor || null;
    const rawTemplateId: string | null =
      biz?.template_id ||
      data.templateId ||
      (biz?.custom_domain?.startsWith("tpl_") ? biz.custom_domain : null);

    const templateMeta = parsePassTemplateMeta(rawTemplateId);
    const targetStamps = state.business_target_stamps || biz?.target_stamps || 8;
    const currentStamps = state.pass_stamps ?? 0;
    const isStampCard =
      state.pass_program_type === "stamp" || state.pass_program_type === "coupon_morph";

    const passBusinessName =
      biz?.name_ar ||
      biz?.name_en ||
      data.businessName ||
      state.business_name ||
      "Loyalty Pass";

    const passOffer =
      biz?.offer_ar ||
      biz?.offer_en ||
      data.offerText ||
      state.business_offer ||
      "Special Reward";

    const icon =
      templateMeta.stampIcon !== "star"
        ? templateMeta.stampIcon
        : resolveStampIcon(null, passOffer, effectiveBrandColor);

    const effectiveColorPreset =
      rawTemplateId && rawTemplateId.includes("preset-")
        ? templateMeta.colorPreset
        : resolveColorPreset(effectiveBrandColor, effectiveAccentColor);

    let stripDataUri: string | undefined;
    let stripUrl: string | undefined;
    if (isStampCard && templateMeta.tierMode === "pro") {
      try {
        stripUrl = getPublicStripUrl(
          data.slug,
          currentStamps,
          targetStamps,
          effectiveBrandColor,
          effectiveAccentColor,
          icon,
          templateMeta.stripStyle,
        );
        if (!stripUrl) {
          stripDataUri = generateStampStripDataUri({
            targetStamps,
            stamps: currentStamps,
            brandColor: effectiveBrandColor,
            accentColor: effectiveAccentColor,
            stampIcon: icon,
            stripStyle: templateMeta.stripStyle,
          });
        }
      } catch (stripErr) {
        captureAppError("CUSTOMER", stripErr, {
          slug: data.slug,
          operation: "strip_generation_update",
        });
      }
    }

    const passState: WalletPassState = {
      serial: state.pass_serial,
      businessName: passBusinessName,
      offer: passOffer,
      programType: state.pass_program_type,
      stamps: currentStamps,
      points: state.pass_points,
      morphed: state.pass_morphed,
      targetStamps,
      brandColor: effectiveBrandColor,
      accentColor: effectiveAccentColor,
      stripUrl,
      stripDataUri,
      logoUrl: biz?.logo_url,
      stampIcon: icon,
      colorPreset: effectiveColorPreset,
      stripStyle: templateMeta.stripStyle,
      tierMode: templateMeta.tierMode,
      ...(data.action === "redeem" ? { notification: "Reward redeemed" } : {}),
    };

    let result = await walletFetch(
      "PUT",
      `/passes/${encodeURIComponent(state.wallet_serial)}`,
      buildWalletPassPayload(passState),
    );

    if (
      !result.ok &&
      (result.status === 400 ||
        result.status === 403 ||
        result.error?.toLowerCase().includes("pro") ||
        result.error?.toLowerCase().includes("plan"))
    ) {
      result = await walletFetch(
        "PUT",
        `/passes/${encodeURIComponent(state.wallet_serial)}`,
        buildBaselineWalletPassPayload(passState),
      );
    }
    return {
      ok: result.ok,
      recorded: true as const,
      error: result.error,
      stamps: state.pass_stamps,
      points: state.pass_points,
      morphed: state.pass_morphed,
      programType: state.pass_program_type,
      targetStamps,
      templateMeta,
      businessOffer: passOffer,
      walletUpdated: result.ok,
    };
  });

function normalizeScannedQuery(raw: string): string {
  const trimmed = raw.trim();
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      const fromParam = url.searchParams.get("serial") || url.searchParams.get("pass");
      if (fromParam) return fromParam.trim();
      const segments = url.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      if (last && (last.startsWith("PP-") || last.length > 5)) {
        return last.trim();
      }
    }
  } catch {
    // not URL
  }
  const match = trimmed.match(/PP-[A-Za-z0-9_-]+/i);
  if (match) return match[0];
  return trimmed;
}

const lookupCustomerSchema = z.object({
  slug: z.string().min(1).max(64),
  query: z.string().min(1).max(256),
  cashierSession: z.string().regex(/^[a-f0-9]{64}$/).optional().nullable(),
});

export const lookupCustomerPass = createServerFn({ method: "POST" })
  .validator((d: unknown) => lookupCustomerSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = createServerSupabaseClient();
    const cleanQuery = normalizeScannedQuery(data.query);
    const isPhone =
      /^[0-9+() -]{6,20}$/.test(cleanQuery) && !cleanQuery.toUpperCase().startsWith("PP-");

    // 1. Try Service Role Admin Client if configured
    const admin = createAdminSupabaseClient();
    if (admin) {
      try {
        let passQuery = admin
          .from("pass_instances")
          .select(`
            serial,
            stamps,
            points,
            morphed,
            program_type,
            wallet_serial,
            phone,
            created_at,
            businesses!inner(id, slug, name_ar, name_en, offer_ar, offer_en, target_stamps)
          `)
          .eq("businesses.slug", data.slug);

        if (isPhone) {
          const digitsOnly = cleanQuery.replace(/[^0-9]/g, "");
          passQuery = passQuery.or(`phone.eq.${cleanQuery},phone.ilike.%${digitsOnly.slice(-9)}%`);
        } else {
          passQuery = passQuery.or(`serial.eq.${cleanQuery},wallet_serial.eq.${cleanQuery}`);
        }

        const { data: passRow } = await passQuery.limit(1).maybeSingle();
        if (passRow) {
          const bizRow = passRow.businesses as unknown as {
            target_stamps?: number;
            offer_en?: string;
            offer_ar?: string;
          };

          const { count: redeemCount } = await admin
            .from("pass_transactions")
            .select("id", { count: "exact", head: true })
            .eq("pass_serial", passRow.serial)
            .eq("action", "redeem");

          const currentStamps = Math.max(1, passRow.stamps ?? 1);
          return {
            ok: true as const,
            found: true as const,
            serial: passRow.serial,
            phone: passRow.phone,
            stamps: currentStamps,
            points: passRow.points ?? 0,
            targetStamps: bizRow?.target_stamps || 8,
            programType: passRow.program_type as "stamp" | "points" | "coupon_morph",
            morphed: passRow.morphed ?? false,
            offer: bizRow?.offer_en || bizRow?.offer_ar || "Special Reward",
            customerName: passRow.phone
              ? `Customer (${passRow.phone.slice(-4)})`
              : "Loyalty Member",
            rewardsRedeemed: redeemCount ?? 0,
            totalStamps: currentStamps,
            isNew: false,
          };
        }
      } catch (adminErr) {
        console.warn("Admin pass lookup note:", adminErr);
      }
    }

    // 2. Try cashier_lookup_pass RPC (SECURITY DEFINER)
    try {
      const { data: rpcPass, error: rpcError } = await supabase
        .rpc("cashier_lookup_pass", {
          _slug: data.slug,
          _query: cleanQuery,
          _session_token: data.cashierSession ?? null,
        })
        .maybeSingle();

      if (!rpcError && rpcPass) {
        const p = rpcPass as Record<string, unknown>;
        const currentStamps = Math.max(1, (p["pass_stamps"] as number) ?? 1);
        return {
          ok: true as const,
          found: true as const,
          serial: (p["pass_serial"] as string) || cleanQuery,
          phone: (p["customer_phone"] as string) || null,
          stamps: currentStamps,
          points: (p["pass_points"] as number) ?? 0,
          targetStamps: (p["business_target_stamps"] as number) || 8,
          programType: (p["program_type"] as "stamp" | "points" | "coupon_morph") || "stamp",
          morphed: Boolean(p["pass_morphed"]),
          offer: (p["business_offer"] as string) || "Special Reward",
          customerName:
            (p["customer_name"] as string) ||
            (p["customer_phone"]
              ? `Customer (${String(p["customer_phone"]).slice(-4)})`
              : "Loyalty Member"),
          rewardsRedeemed: (p["rewards_redeemed"] as number) || 0,
          totalStamps: (p["total_stamps"] as number) || currentStamps,
          isNew: false,
        };
      }
    } catch {
      // RPC may not be installed yet, proceed
    }

    // 3. If query is a phone number, resolve via claim_public_pass RPC
    if (isPhone) {
      const { data: claimData, error: claimError } = await supabase
        .rpc("claim_public_pass", {
          _slug: data.slug,
          _phone: cleanQuery,
        })
        .single();

      if (!claimError && claimData) {
        const claim = claimData as {
          pass_serial: string;
          pass_program_type: "stamp" | "points" | "coupon_morph";
          business_name: string;
          business_offer: string;
          business_target_stamps: number;
          pass_stamps: number;
          pass_points: number;
          pass_morphed: boolean;
          pass_wallet_serial: string | null;
          is_resumed: boolean;
        };
        const currentStamps = Math.max(1, claim.pass_stamps ?? 1);
        return {
          ok: true as const,
          found: true as const,
          serial: claim.pass_serial,
          phone: cleanQuery,
          stamps: currentStamps,
          points: claim.pass_points ?? 0,
          targetStamps: claim.business_target_stamps || 8,
          programType: claim.pass_program_type,
          morphed: claim.pass_morphed,
          offer: claim.business_offer || "Special Reward",
          customerName: `Customer (${cleanQuery.slice(-4)})`,
          rewardsRedeemed: 0,
          totalStamps: currentStamps,
          isNew: !claim.is_resumed,
        };
      }
    }

    // 4. Guaranteed welcome stamp default: every PointPass starts with 1 welcome stamp
    return {
      ok: true as const,
      found: false as const,
      serial: cleanQuery,
      phone: null,
      stamps: 1, // Welcome stamp guarantee (never 0/N on initial scan)
      points: 0,
      targetStamps: 8,
      programType: "stamp" as const,
      morphed: false,
      offer: "",
      customerName: "Loyalty Member",
      rewardsRedeemed: 0,
      totalStamps: 1,
      isNew: false,
    };
  });

const unlockTerminalSchema = z.object({
  slug: z.string().min(1).max(64),
  cashierName: z.string().trim().min(1).max(100),
  pin: z.string().regex(/^[0-9]{4}$/),
  deviceName: z.string().max(120).optional().nullable(),
});

export const unlockCashierTerminal = createServerFn({ method: "POST" })
  .validator((d: unknown) => unlockTerminalSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = createServerSupabaseClient();
    const cleanSlug = data.slug.trim().toLowerCase();
    const cleanName = data.cashierName.trim();
    const pin = data.pin;

    // Check 1: Individual Cashier PIN
    try {
      const { data: staffMembers } = await supabase
        .from("staff_members")
        .select(`
          id,
          name_ar,
          name_en,
          code,
          business:businesses!inner(id, slug),
          assignments:staff_branch_assignments(
            branch:branches(id, code, name_ar, name_en)
          )
        `)
        .eq("business.slug", cleanSlug)
        .eq("status", "active");

      if (staffMembers && staffMembers.length > 0) {
        const matchingStaff = staffMembers.find((s) => {
          const nameAr = ((s as { name_ar?: string | null }).name_ar || "").toLowerCase();
          const nameEn = ((s as { name_en?: string | null }).name_en || "").toLowerCase();
          const code = ((s as { code?: string | null }).code || "").toLowerCase();
          const target = cleanName.toLowerCase();
          return (
            nameAr === target ||
            nameEn === target ||
            code === target ||
            nameAr.includes(target) ||
            nameEn.includes(target)
          );
        });

        if (matchingStaff) {
          const assignment = (
            matchingStaff.assignments as Array<{ branch?: { code?: string } }>
          )?.[0];
          const branchCode = assignment?.branch?.code;
          if (branchCode && matchingStaff.code) {
            const { data: staffUnlock, error: staffError } = await supabase
              .rpc("cashier_unlock_staff", {
                _slug: cleanSlug,
                _branch_code: branchCode,
                _staff_code: matchingStaff.code,
                _pin: pin,
                _device_name: data.deviceName || cleanName,
              })
              .maybeSingle();

            if (!staffError && staffUnlock) {
              const res = staffUnlock as Record<string, unknown>;
              return {
                ok: true as const,
                mode: "staff" as const,
                business_id: res["business_id"] as string,
                business_slug: res["business_slug"] as string,
                name_ar: res["name_ar"] as string,
                name_en: res["name_en"] as string,
                branch_name_ar: res["branch_name_ar"] as string | undefined,
                branch_name_en: res["branch_name_en"] as string | undefined,
                staff_name_ar: (res["staff_name_ar"] as string) || cleanName,
                staff_name_en: (res["staff_name_en"] as string) || cleanName,
                cashier_session: res["cashier_session"] as string,
                session_expires_at: res["session_expires_at"] as string,
                cashier_name: cleanName,
                error: null as string | null,
              };
            }
          }
        }
      }
    } catch {
      // Proceed to Global PIN check
    }

    // Check 2: Global Business PIN (cashier_unlock)
    const { data: globalUnlock, error: globalError } = await supabase
      .rpc("cashier_unlock", {
        _slug: cleanSlug,
        _pin: pin,
      })
      .maybeSingle();

    if (!globalError && globalUnlock) {
      const res = globalUnlock as Record<string, unknown>;
      return {
        ok: true as const,
        mode: "global" as const,
        business_id: res["business_id"] as string,
        business_slug: res["business_slug"] as string,
        name_ar: res["name_ar"] as string,
        name_en: res["name_en"] as string,
        branch_name_ar: undefined,
        branch_name_en: undefined,
        staff_name_ar: cleanName,
        staff_name_en: cleanName,
        cashier_session: res["cashier_session"] as string,
        session_expires_at: res["session_expires_at"] as string,
        cashier_name: cleanName,
        error: null as string | null,
      };
    }

    return {
      ok: false as const,
      error: "Incorrect business slug or cashier PIN",
      business_id: null,
      business_slug: null,
      name_ar: null,
      name_en: null,
      branch_name_ar: undefined,
      branch_name_en: undefined,
      staff_name_ar: null,
      staff_name_en: null,
      cashier_session: null,
      session_expires_at: null,
      cashier_name: null,
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
      .select(
        "id,name_en,offer_en,target_stamps,brand_color,accent_color,logo_url,offer_ar,custom_domain",
      )
      .eq("id", data.businessId)
      .eq("slug", data.slug)
      .maybeSingle();

    if (businessError || !business) {
      throw new Error("You cannot send campaigns for this business");
    }

    let rawTemplateId: string | null = null;
    try {
      const { data: tplRow } = await supabase
        .from("businesses")
        .select("template_id")
        .eq("id", data.businessId)
        .maybeSingle();
      if (tplRow && (tplRow as { template_id?: string | null }).template_id) {
        rawTemplateId = (tplRow as { template_id?: string | null }).template_id!;
      }
    } catch {
      // Table column may not exist yet
    }

    if (!rawTemplateId && business?.custom_domain?.startsWith("tpl_")) {
      rawTemplateId = business.custom_domain;
    }

    const templateMeta = parsePassTemplateMeta(rawTemplateId);

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

    const icon =
      templateMeta.stampIcon !== "star"
        ? templateMeta.stampIcon
        : resolveStampIcon(null, business.offer_ar || business.offer_en, business.brand_color);

    const results = await Promise.all(
      passes.map(async (pass) => {
        const isStampCard = pass.program_type === "stamp" || pass.program_type === "coupon_morph";
        let stripDataUri: string | undefined;
        let stripUrl: string | undefined;
        if (isStampCard && templateMeta.tierMode === "pro") {
          try {
            stripUrl = getPublicStripUrl(
              data.slug,
              pass.stamps,
              targetStamps,
              business.brand_color,
              business.accent_color,
              icon,
              templateMeta.stripStyle,
            );
            if (!stripUrl) {
              stripDataUri = generateStampStripDataUri({
                targetStamps,
                stamps: pass.stamps,
                brandColor: business.brand_color,
                accentColor: business.accent_color,
                stampIcon: icon,
                stripStyle: templateMeta.stripStyle,
              });
            }
          } catch {
            // Graceful fallback to text payload
          }
        }

        const passState: WalletPassState = {
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
          stampIcon: icon,
          colorPreset: templateMeta.colorPreset,
          stripStyle: templateMeta.stripStyle,
          tierMode: templateMeta.tierMode,
        };

        const res = await walletFetch(
          "PUT",
          `/passes/${encodeURIComponent(pass.wallet_serial!)}`,
          buildWalletPassPayload(passState),
        );

        if (
          !res.ok &&
          (res.status === 400 ||
            res.status === 403 ||
            res.error?.toLowerCase().includes("pro") ||
            res.error?.toLowerCase().includes("plan"))
        ) {
          return walletFetch(
            "PUT",
            `/passes/${encodeURIComponent(pass.wallet_serial!)}`,
            buildBaselineWalletPassPayload(passState),
          );
        }

        return res;
      }),
    );
    const failed = results.filter((result) => !result.ok).length;
    return {
      ok: failed === 0,
      error: failed ? `${failed} wallet update${failed === 1 ? "" : "s"} failed` : null,
    };
  });
