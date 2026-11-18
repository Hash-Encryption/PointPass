import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
// @ts-expect-error Cloudflare supplies this runtime module to Pages Functions.
import { env } from "cloudflare:workers";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/server-supabase";
import {
  buildBaselineWalletPassPayload,
  buildWalletPassPayload,
  type WalletPassState,
} from "@/lib/wallet-payload";
import {
  generateNumericPassCode,
  iconToEmoji,
  normalizeCashierLookupQuery,
  normalizePhoneNumber as normalizeCustomerPhoneTier,
  parsePassTemplateMeta,
  resolveRestaurantBranding,
  serializePassTemplateMeta,
} from "@/lib/wallet-tier";
import { generateStampStripDataUri } from "@/lib/strip-generator";
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

async function walletFetch(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  retryCount = 0,
): Promise<{
  ok: boolean;
  status: number;
  error: string | null;
  data: unknown;
}> {
  const apiKey = env.WALLETWALLET_API_KEY ?? process.env["WALLETWALLET_API_KEY"];
  const apiUrl = env.WALLETWALLET_API_URL ?? process.env["WALLETWALLET_API_URL"];
  if (!apiKey || !apiUrl) {
    return {
      ok: false,
      status: 503,
      error: "WalletWallet server configuration is incomplete",
      data: null,
    };
  }

  const endpoint = `${apiUrl.replace(/\/$/, "")}${path}`;
  let res: Response | null = null;
  let text = "";
  let isNetworkError = false;

  try {
    res = await fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch {
    isNetworkError = true;
    console.error(`WalletWallet ${path} failed [network]`);
  }

  // 1-time automatic retry with 600ms delay on 429 rate limit, 5xx, or network failure
  if (retryCount < 1 && (isNetworkError || (res && (res.status === 429 || res.status >= 500)))) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return walletFetch(method, path, body, retryCount + 1);
  }

  if (isNetworkError || !res) {
    return {
      ok: false,
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
      ok: false,
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
  return { ok: true, status: res.status, error: null, data };
}

export function normalizePhoneNumber(raw: string | null | undefined): string | null {
  return normalizeCustomerPhoneTier(raw);
}

export const normalizeCustomerPhone = normalizePhoneNumber;

const publicBusinessSchema = z.object({
  slug: z.string().min(1).max(64),
});

const BUSINESS_BRANDING_COLUMNS =
  "id,slug,name_ar,name_en,logo_url,brand_color,accent_color,program_type,offer_ar,offer_en,target_stamps,sar_per_point,points_per_reward,custom_domain,template_id,status";

type BusinessBrandingRow = {
  id?: string | null | undefined;
  slug?: string | null | undefined;
  name?: string | null | undefined;
  name_ar?: string | null | undefined;
  name_en?: string | null | undefined;
  logo_url?: string | null | undefined;
  brand_color?: string | null | undefined;
  accent_color?: string | null | undefined;
  program_type?: string | null | undefined;
  offer_ar?: string | null | undefined;
  offer_en?: string | null | undefined;
  target_stamps?: number | null | undefined;
  stamps_required?: number | null | undefined;
  sar_per_point?: number | null | undefined;
  points_per_reward?: number | null | undefined;
  custom_domain?: string | null | undefined;
  template_id?: string | null | undefined;
  status?: string | null | undefined;
};

/**
 * Fetches full restaurant branding directly via service-role admin client first so RLS
 * never hides template_id or brand_color, falling back to get_public_business_by_slug RPC.
 */
async function fetchBusinessRowBySlug(
  db: ReturnType<typeof createServerSupabaseClient>,
  anonClient: ReturnType<typeof createServerSupabaseClient>,
  slug: string,
): Promise<BusinessBrandingRow | null> {
  const cleanSlug = slug.toLowerCase().trim();
  let biz: BusinessBrandingRow | null = null;

  try {
    const { data: row } = await db
      .from("businesses")
      .select(BUSINESS_BRANDING_COLUMNS)
      .eq("slug", cleanSlug)
      .maybeSingle();
    if (row) {
      biz = row as BusinessBrandingRow;
    }
  } catch {
    // Fall back to SECURITY DEFINER RPC below
  }

  if (!biz || !biz.template_id || !biz.brand_color) {
    try {
      const { data: rpcRow } = await anonClient
        .rpc("get_public_business_by_slug", { _slug: cleanSlug })
        .maybeSingle();
      if (rpcRow) {
        const r = rpcRow as BusinessBrandingRow;
        biz = {
          ...biz,
          id: r.id ?? biz?.id ?? null,
          slug: r.slug ?? biz?.slug ?? cleanSlug,
          name: r.name ?? (biz ? biz.name_en || biz.name_ar || biz.slug : null),
          name_ar: r.name_ar ?? biz?.name_ar ?? null,
          name_en: r.name_en ?? biz?.name_en ?? null,
          logo_url: r.logo_url ?? biz?.logo_url ?? null,
          brand_color: r.brand_color ?? biz?.brand_color ?? null,
          accent_color: r.accent_color ?? biz?.accent_color ?? null,
          program_type: r.program_type ?? biz?.program_type ?? null,
          offer_ar: r.offer_ar ?? biz?.offer_ar ?? null,
          offer_en: r.offer_en ?? biz?.offer_en ?? null,
          target_stamps: r.target_stamps ?? r.stamps_required ?? biz?.target_stamps ?? null,
          sar_per_point: r.sar_per_point ?? biz?.sar_per_point ?? null,
          points_per_reward: r.points_per_reward ?? biz?.points_per_reward ?? null,
          template_id: r.template_id ?? biz?.template_id ?? null,
        };
      }
    } catch {
      // RPC fallback
    }
  }

  return biz;
}

export const getPublicBusinessBySlug = createServerFn({ method: "GET" })
  .validator((d: unknown) => publicBusinessSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = createAdminSupabaseClient();
    const supabase = createServerSupabaseClient();
    const db = admin ?? supabase;
    const cleanSlug = data.slug.toLowerCase().trim();

    const biz = await fetchBusinessRowBySlug(db, supabase, cleanSlug);

    if (!biz) {
      return {
        ok: false as const,
        error: "Business not found or inactive",
        business: null,
      };
    }

    const rawTemplateId =
      biz.template_id ?? (biz.custom_domain?.startsWith("tpl_") ? biz.custom_domain : null);
    const targetStamps = Number(biz.target_stamps || biz.stamps_required || 8);
    const offerAr = biz.offer_ar || "";
    const offerEn = biz.offer_en || "";
    const nameAr = biz.name_ar || "";
    const nameEn = biz.name_en || "";
    const computedName = biz.name || nameEn || nameAr || cleanSlug;

    const branding = resolveRestaurantBranding({
      brandColor: biz.brand_color ?? null,
      accentColor: biz.accent_color ?? null,
      templateId: rawTemplateId,
      offerEn,
      offerAr,
      nameEn,
      nameAr,
    });

    return {
      ok: true as const,
      error: null,
      business: {
        id: biz.id || "",
        name: computedName,
        name_ar: nameAr,
        name_en: nameEn,
        slug: biz.slug || cleanSlug,
        offer_ar: offerAr,
        offer_en: offerEn,
        target_stamps: targetStamps,
        stamps_required: targetStamps,
        brand_color: branding.brandHex,
        accent_color: branding.accentHex,
        logo_url: biz.logo_url || null,
        template_id: rawTemplateId,
        program_type: biz.program_type || "stamp",
        templateMeta: {
          baseId: rawTemplateId || "blank",
          stampIcon: branding.stampIcon,
          stampEmoji: branding.stampEmoji,
          stripStyle: branding.stripStyle,
          colorPreset: branding.colorPreset,
          tierMode: branding.tierMode,
          accentHex: branding.accentHex,
          brandHex: branding.brandHex,
        },
      },
    };
  });

const refreshPassSchema = z.object({
  slug: z.string().min(1).max(64),
  passSerial: z.string().min(1).max(128),
});

export const refreshCustomerPassStatus = createServerFn({ method: "POST" })
  .validator((d: unknown) => refreshPassSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = createAdminSupabaseClient();
    const supabase = createServerSupabaseClient();
    const db = admin ?? supabase;

    const cleanSerial = data.passSerial.trim();
    const cleanSlug = data.slug.toLowerCase().trim();

    try {
      const { data: passRow, error } = await db
        .from("pass_instances")
        .select(
          `
          serial,
          stamps,
          points,
          program_type,
          wallet_serial,
          last_visit_at,
          created_at,
          businesses!inner(id, slug, target_stamps, offer_ar, offer_en)
        `,
        )
        .eq("serial", cleanSerial)
        .eq("businesses.slug", cleanSlug)
        .maybeSingle();

      if (error || !passRow) {
        return {
          ok: false as const,
          error: "Pass not found",
          currentStamps: 0,
          stampsRequired: 8,
          rewardUnlocked: false,
          pkpassUrl: null,
          updatedAt: null,
          programType: "stamp",
          points: 0,
        };
      }

      const biz = passRow.businesses as unknown as {
        target_stamps?: number | null;
        offer_ar?: string | null;
        offer_en?: string | null;
      };

      const stampsRequired = Number(biz?.target_stamps || 8);
      const currentStamps = Math.max(1, passRow.stamps ?? 1);
      const rewardUnlocked = currentStamps >= stampsRequired;
      const pkpassUrl = passRow.wallet_serial
        ? `https://walletwallet.dev/p/${passRow.wallet_serial}`
        : null;

      return {
        ok: true as const,
        error: null,
        passSerial: passRow.serial,
        currentStamps,
        stampsRequired,
        rewardUnlocked,
        pkpassUrl,
        updatedAt: passRow.last_visit_at || passRow.created_at || new Date().toISOString(),
        programType: passRow.program_type,
        points: passRow.points ?? 0,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Failed to refresh balance",
        currentStamps: 0,
        stampsRequired: 8,
        rewardUnlocked: false,
        pkpassUrl: null,
        updatedAt: null,
        programType: "stamp",
        points: 0,
      };
    }
  });

const createPassSchema = z.object({
  slug: z.string().min(1).max(64),
  phone: z.string().trim().max(40).optional().nullable(),
  customerName: z.string().trim().max(100).optional().nullable(),
  brandColor: z.string().optional().nullable(),
  accentColor: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  offerAr: z.string().optional().nullable(),
  offerEn: z.string().optional().nullable(),
});

export const createWalletPass = createServerFn({ method: "POST" })
  .validator((d: unknown) => createPassSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = createAdminSupabaseClient();
    const supabase = createServerSupabaseClient();
    const db = admin ?? supabase;
    const cleanPhone = normalizePhoneNumber(data.phone);

    // Caller-scoped rate limit for anonymous claims (where phone is null)
    if (!cleanPhone && !checkAnonClaimRateLimit()) {
      captureAppError("CUSTOMER", new Error("Anonymous claim rate limit exceeded for caller"), {
        slug: data.slug,
        operation: "claim_public_pass",
      });
      throw new Error("Too many guest pass requests from this device. Please wait a moment.");
    }

    const { data: claimData, error: claimError } = await db
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

    const isReturning = Boolean(claim.is_resumed);
    let effectiveSerial = claim.pass_serial;

    // Query business visual branding directly via admin client first so RLS never hides template_id/brand_color
    const biz = await fetchBusinessRowBySlug(db, supabase, data.slug);

    // For brand-new passes, generate short 5-digit numeric pass code (PP-XXXXX) with 90k auto-scaling fallback
    if (!isReturning) {
      try {
        let existingPassCount = 0;
        if (biz?.id) {
          const { count } = await db
            .from("pass_instances")
            .select("id", { count: "exact", head: true })
            .eq("business_id", biz.id);
          existingPassCount = count ?? 0;
        }

        let chosenSerial: string | null = null;
        const forceSixDigits = existingPassCount >= 90_000;

        // Try up to 12 attempts to generate a unique 5-digit PP-XXXXX code
        for (let attempt = 0; attempt < 12; attempt++) {
          const candidate = generateNumericPassCode(existingPassCount, forceSixDigits);
          const { data: existing } = await db
            .from("pass_instances")
            .select("id")
            .eq("serial", candidate)
            .maybeSingle();

          if (!existing) {
            chosenSerial = candidate;
            break;
          }
        }

        // If all 12 5-digit attempts collided (or at 90k capacity), scale to 6 digits
        if (!chosenSerial) {
          for (let attempt = 0; attempt < 12; attempt++) {
            const candidate = generateNumericPassCode(existingPassCount, true);
            const { data: existing } = await db
              .from("pass_instances")
              .select("id")
              .eq("serial", candidate)
              .maybeSingle();

            if (!existing) {
              chosenSerial = candidate;
              break;
            }
          }
        }

        if (chosenSerial) {
          const { error: updateErr } = await db
            .from("pass_instances")
            .update({ serial: chosenSerial })
            .eq("serial", claim.pass_serial);
          if (!updateErr) {
            effectiveSerial = chosenSerial;
          }
        }
      } catch (err) {
        console.warn("Could not generate 5-digit numeric pass code:", err);
      }
    }

    // Blend server & client-passed branding attributes (DB row always wins)
    const effectiveBrandColor = biz?.brand_color || data.brandColor || null;
    const effectiveAccentColor = biz?.accent_color || data.accentColor || null;
    const rawTemplateId: string | null =
      biz?.template_id ||
      data.templateId ||
      (biz?.custom_domain?.startsWith("tpl_") ? biz.custom_domain : null);

    const passOffer =
      biz?.offer_en ||
      biz?.offer_ar ||
      data.offerEn ||
      data.offerAr ||
      claim.business_offer ||
      "Special Reward";

    const branding = resolveRestaurantBranding({
      brandColor: effectiveBrandColor,
      accentColor: effectiveAccentColor,
      templateId: rawTemplateId,
      offerEn: passOffer,
      offerAr: biz?.offer_ar || data.offerAr,
      nameEn: biz?.name_en || claim.business_name,
      nameAr: biz?.name_ar,
    });

    const targetStamps = Number(biz?.target_stamps || claim.business_target_stamps || 8);
    const isStampCard =
      claim.pass_program_type === "stamp" || claim.pass_program_type === "coupon_morph";
    let currentStamps = claim.pass_stamps ?? 0;

    // Start every new or zero-visit pass at 1 pre-filled welcome stamp (1/N)
    if (isStampCard && currentStamps === 0) {
      currentStamps = 1;
      try {
        await db.rpc("grant_welcome_stamp", { _pass_serial: effectiveSerial });
      } catch (rpcErr) {
        try {
          await db.from("pass_instances").update({ stamps: 1 }).eq("serial", effectiveSerial);
        } catch (directErr) {
          console.warn("Welcome stamp initialization note:", directErr ?? rpcErr);
        }
      }
    }

    const icon = branding.stampIcon;

    let stripDataUri: string | undefined;
    let stripUrl: string | undefined;
    if (isStampCard && branding.tierMode === "pro") {
      try {
        stripUrl = getPublicStripUrl(
          data.slug,
          currentStamps,
          targetStamps,
          branding.brandHex,
          branding.accentHex,
          icon,
          branding.stripStyle,
        );
        if (!stripUrl) {
          stripDataUri = generateStampStripDataUri({
            targetStamps,
            stamps: currentStamps,
            brandColor: branding.brandHex,
            accentColor: branding.accentHex,
            stampIcon: icon,
            stripStyle: branding.stripStyle,
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
      serial: effectiveSerial,
      businessName: claim.business_name,
      offer: passOffer,
      programType: claim.pass_program_type,
      stamps: currentStamps,
      points: claim.pass_points ?? 0,
      morphed: claim.pass_morphed ?? false,
      targetStamps,
      brandColor: branding.brandHex,
      accentColor: branding.accentHex,
      stripUrl,
      stripDataUri,
      logoUrl: biz?.logo_url,
      stampIcon: icon,
      colorPreset: branding.colorPreset,
      stripStyle: branding.stripStyle,
      tierMode: branding.tierMode,
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

    const rewardUnlocked = currentStamps >= targetStamps;

    if (!result.ok) {
      // Graceful fallback so the claim flow stays usable while credentials pend or in offline/dev mode
      return {
        ok: true,
        walletError: result.error,
        error: null as string | null,
        passSerial: effectiveSerial,
        currentStamps,
        stampsRequired: targetStamps,
        isReturning,
        customerName: data.customerName || null,
        customerPhone: cleanPhone,
        pkpassUrl: null as string | null,
        rewardUnlocked,
        offerAr: biz?.offer_ar || data.offerAr || "",
        offerEn: biz?.offer_en || data.offerEn || "",
        templateMeta: {
          baseId: rawTemplateId || "blank",
          stampIcon: branding.stampIcon,
          stampEmoji: branding.stampEmoji,
          stripStyle: branding.stripStyle,
          colorPreset: branding.colorPreset,
          tierMode: branding.tierMode,
          accentHex: branding.accentHex,
          brandHex: branding.brandHex,
        },
        appleUrl: null as string | null,
        googleUrl: null as string | null,
        isResumed: isReturning,
        alreadyEnrolled: false,
        programType: claim.pass_program_type,
        stamps: currentStamps,
        points: claim.pass_points ?? 0,
        morphed: claim.pass_morphed ?? false,
        targetStamps,
        sarPerPoint: claim.business_sar_per_point,
        pointsPerReward: claim.business_points_per_reward,
      };
    }

    const payload = result.data as {
      serialNumber?: string;
      googleSaveUrl?: string;
      shareUrl?: string;
    } | null;

    if (!claim.pass_wallet_serial && payload?.serialNumber) {
      const { error: attachError } = await db.rpc("attach_wallet_serial", {
        _pass_serial: effectiveSerial,
        _wallet_serial: payload.serialNumber,
      });
      if (attachError) {
        try {
          await db
            .from("pass_instances")
            .update({ wallet_serial: payload.serialNumber })
            .eq("serial", effectiveSerial);
        } catch {
          // ignore
        }
      }
    }

    const shareUrl =
      payload?.shareUrl ||
      (claim.pass_wallet_serial ? `https://walletwallet.dev/p/${claim.pass_wallet_serial}` : null);
    const googleUrl = payload?.googleSaveUrl ?? shareUrl;

    return {
      ok: true,
      error: null as string | null,
      passSerial: effectiveSerial,
      currentStamps,
      stampsRequired: targetStamps,
      isReturning,
      customerName: data.customerName || null,
      customerPhone: cleanPhone,
      pkpassUrl: shareUrl,
      rewardUnlocked,
      offerAr: biz?.offer_ar || data.offerAr || "",
      offerEn: biz?.offer_en || data.offerEn || "",
      templateMeta: {
        baseId: rawTemplateId || "blank",
        stampIcon: branding.stampIcon,
        stampEmoji: branding.stampEmoji,
        stripStyle: branding.stripStyle,
        colorPreset: branding.colorPreset,
        tierMode: branding.tierMode,
        accentHex: branding.accentHex,
        brandHex: branding.brandHex,
      },
      appleUrl: shareUrl,
      googleUrl,
      isResumed: isReturning,
      alreadyEnrolled: false,
      programType: claim.pass_program_type,
      stamps: currentStamps,
      points: claim.pass_points ?? 0,
      morphed: claim.pass_morphed ?? false,
      targetStamps,
      sarPerPoint: claim.business_sar_per_point,
      pointsPerReward: claim.business_points_per_reward,
    };
  });

export const claimCustomerPass = createWalletPass;

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
    const admin = createAdminSupabaseClient();
    const dbClient = admin ?? supabase;
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

    let walletSerial = state?.wallet_serial;
    if (!walletSerial && admin && state?.pass_serial) {
      try {
        const { data: pInst } = await admin
          .from("pass_instances")
          .select("wallet_serial")
          .eq("serial", state.pass_serial)
          .maybeSingle();
        if (pInst?.wallet_serial) {
          walletSerial = pInst.wallet_serial;
        }
      } catch {
        // Fallback
      }
    }

    if (!walletSerial) {
      return {
        ok: false as const,
        recorded: true as const,
        sessionExpired: false as const,
        error: "Wallet pass is not attached",
        stamps: state?.pass_stamps,
        points: state?.pass_points,
        morphed: state?.pass_morphed,
        programType: state?.pass_program_type,
        targetStamps: state?.business_target_stamps,
        walletSync: { synced: false, status: 404, error: "Wallet pass is not attached" },
      };
    }

    // Query business visual branding directly via admin client first so RLS never hides template_id/brand_color
    const biz = await fetchBusinessRowBySlug(dbClient, supabase, data.slug);

    // Blend server & client-forwarded branding attributes (DB row always wins)
    const effectiveBrandColor = biz?.brand_color || data.brandColor || null;
    const effectiveAccentColor = biz?.accent_color || data.accentColor || null;
    const rawTemplateId: string | null =
      biz?.template_id ||
      data.templateId ||
      (biz?.custom_domain?.startsWith("tpl_") ? biz.custom_domain : null);

    const targetStamps = Number(biz?.target_stamps || state.business_target_stamps || 8);
    const currentStamps = state.pass_stamps ?? 0;
    const isStampCard =
      state.pass_program_type === "stamp" || state.pass_program_type === "coupon_morph";

    const passBusinessName =
      biz?.name_ar || biz?.name_en || data.businessName || state.business_name || "Loyalty Pass";

    const passOffer =
      biz?.offer_ar || biz?.offer_en || data.offerText || state.business_offer || "Special Reward";

    const parsedMeta = parsePassTemplateMeta(rawTemplateId, effectiveBrandColor);
    const branding = resolveRestaurantBranding({
      brandColor: effectiveBrandColor,
      accentColor: effectiveAccentColor,
      templateId: rawTemplateId,
      offerEn: biz?.offer_en || passOffer,
      offerAr: biz?.offer_ar,
      nameEn: biz?.name_en || state.business_name,
      nameAr: biz?.name_ar,
    });
    const templateMeta = {
      ...parsedMeta,
      stampIcon: branding.stampIcon,
      colorPreset: branding.colorPreset,
      stripStyle: branding.stripStyle,
      tierMode: branding.tierMode,
    };
    const icon = branding.stampIcon;

    let stripDataUri: string | undefined;
    let stripUrl: string | undefined;
    if (isStampCard && branding.tierMode === "pro") {
      try {
        stripUrl = getPublicStripUrl(
          data.slug,
          currentStamps,
          targetStamps,
          branding.brandHex,
          branding.accentHex,
          icon,
          branding.stripStyle,
        );
        if (!stripUrl) {
          stripDataUri = generateStampStripDataUri({
            targetStamps,
            stamps: currentStamps,
            brandColor: branding.brandHex,
            accentColor: branding.accentHex,
            stampIcon: icon,
            stripStyle: branding.stripStyle,
          });
        }
      } catch (stripErr) {
        captureAppError("CUSTOMER", stripErr, {
          slug: data.slug,
          operation: "strip_generation_update",
        });
      }
    }

    const emoji = branding.stampEmoji;
    let notificationText: string;
    if (data.action === "redeem") {
      notificationText = `🎁 Reward redeemed: ${passOffer}`;
    } else if (data.action === "points") {
      notificationText = `⭐ Points updated! Balance: ${state.pass_points} PTS`;
    } else {
      if (currentStamps >= targetStamps) {
        notificationText = `🎉 Reward unlocked: ${passOffer} (${currentStamps}/${targetStamps})`;
      } else {
        const addedCount = Math.min(20, Math.max(1, data.count ?? 1));
        notificationText = `${emoji} +${addedCount} stamp${addedCount > 1 ? "s" : ""} added! (${currentStamps}/${targetStamps})`;
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
      brandColor: branding.brandHex,
      accentColor: branding.accentHex,
      stripUrl,
      stripDataUri,
      logoUrl: biz?.logo_url,
      stampIcon: icon,
      colorPreset: branding.colorPreset,
      stripStyle: branding.stripStyle,
      tierMode: branding.tierMode,
      notification: notificationText,
    };

    let result = await walletFetch(
      "PUT",
      `/passes/${encodeURIComponent(walletSerial)}`,
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
        `/passes/${encodeURIComponent(walletSerial)}`,
        buildBaselineWalletPassPayload(passState),
      );
    }

    const walletSync = {
      synced: result.ok,
      status: result.status,
      ...(result.error ? { error: result.error } : {}),
    };

    return {
      ok: result.ok,
      recorded: true as const,
      sessionExpired: false as const,
      error: result.error,
      stamps: state.pass_stamps,
      points: state.pass_points,
      morphed: state.pass_morphed,
      programType: state.pass_program_type,
      targetStamps,
      templateMeta,
      businessOffer: passOffer,
      walletUpdated: result.ok,
      walletSync,
    };
  });

function normalizeScannedQuery(raw: string): string {
  return normalizeCashierLookupQuery(raw).normalized;
}

const lookupCustomerSchema = z.object({
  slug: z.string().min(1).max(64),
  query: z.string().min(1).max(256),
  cashierSession: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional()
    .nullable(),
});

export const lookupCustomerPass = createServerFn({ method: "POST" })
  .validator((d: unknown) => lookupCustomerSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = createServerSupabaseClient();
    const { normalized: cleanQuery, isPhone } = normalizeCashierLookupQuery(data.query);

    // 1. Try Service Role Admin Client if configured
    const admin = createAdminSupabaseClient();
    if (admin) {
      try {
        let passQuery = admin
          .from("pass_instances")
          .select(
            `
            serial,
            stamps,
            points,
            morphed,
            program_type,
            wallet_serial,
            phone,
            created_at,
            businesses!inner(id, slug, name_ar, name_en, offer_ar, offer_en, target_stamps)
          `,
          )
          .eq("businesses.slug", data.slug);

        if (isPhone) {
          const normalized = normalizePhoneNumber(cleanQuery) || cleanQuery;
          const digitsOnly = cleanQuery.replace(/[^0-9]/g, "");
          const orFilter = `phone.eq.${cleanQuery},phone.eq.${normalized},phone.ilike.%${digitsOnly.slice(-9)}%`;
          passQuery = passQuery.or(orFilter);
        } else {
          passQuery = passQuery.or(
            `serial.eq.${cleanQuery},serial.ilike.${cleanQuery},serial.eq.${data.query.trim()},wallet_serial.eq.${cleanQuery}`,
          );
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
        .select(
          `
          id,
          name_ar,
          name_en,
          code,
          business:businesses!inner(id, slug),
          assignments:staff_branch_assignments(
            branch:branches(id, code, name_ar, name_en)
          )
        `,
        )
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
        "id,owner_id,name_ar,name_en,offer_en,target_stamps,brand_color,accent_color,logo_url,offer_ar,custom_domain,template_id",
      )
      .eq("id", data.businessId)
      .eq("slug", data.slug)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (businessError || !business || business.owner_id !== user.id) {
      throw new Error("You cannot send campaigns for this business");
    }

    const rawTemplateId: string | null =
      business.template_id ??
      (business.custom_domain?.startsWith("tpl_") ? business.custom_domain : null);

    const branding = resolveRestaurantBranding({
      brandColor: business.brand_color,
      accentColor: business.accent_color,
      templateId: rawTemplateId,
      offerEn: business.offer_en,
      offerAr: business.offer_ar,
      nameEn: business.name_en,
      nameAr: business.name_ar,
    });

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
    const icon = branding.stampIcon;

    const results = await Promise.all(
      passes.map(async (pass) => {
        const isStampCard = pass.program_type === "stamp" || pass.program_type === "coupon_morph";
        let stripDataUri: string | undefined;
        let stripUrl: string | undefined;
        if (isStampCard && branding.tierMode === "pro") {
          try {
            stripUrl = getPublicStripUrl(
              data.slug,
              pass.stamps,
              targetStamps,
              branding.brandHex,
              branding.accentHex,
              icon,
              branding.stripStyle,
            );
            if (!stripUrl) {
              stripDataUri = generateStampStripDataUri({
                targetStamps,
                stamps: pass.stamps,
                brandColor: branding.brandHex,
                accentColor: branding.accentHex,
                stampIcon: icon,
                stripStyle: branding.stripStyle,
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
          brandColor: branding.brandHex,
          accentColor: branding.accentHex,
          stripUrl,
          stripDataUri,
          logoUrl: business.logo_url,
          stampIcon: icon,
          colorPreset: branding.colorPreset,
          stripStyle: branding.stripStyle,
          tierMode: branding.tierMode,
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

const saveOnboardingProgressSchema = z.object({
  accessToken: z.string().min(20),
  businessId: z.string().uuid().optional(),
  step: z.enum(["business", "plan", "loyalty", "reward", "location", "launch", "completed"]),
  completed: z.boolean().optional(),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  nameEn: z.string().trim().min(1).max(120).optional(),
  nameAr: z.string().trim().min(1).max(120).optional(),
  programType: z.enum(["stamp", "points", "coupon_morph"]).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  templateId: z.string().max(250).optional(),
  baseTemplateId: z.string().max(80).optional(),
  stampIcon: z.string().max(32).optional(),
  stripStyle: z.enum(["pizzatown", "nails_white", "linear_dark"]).optional(),
  colorPreset: z.enum(["dark", "blue", "green", "red", "purple", "orange"]).optional(),
  tierMode: z.enum(["free", "pro"]).optional(),
  targetStamps: z.number().int().positive().max(30).optional(),
  offerEn: z.string().max(250).optional(),
  offerAr: z.string().max(250).optional(),
  sarPerPoint: z.number().int().positive().optional(),
  pointsPerReward: z.number().int().positive().optional(),
  requestedPlan: z.string().max(64).optional(),
  mainBranchNameAr: z.string().max(120).optional(),
  mainBranchNameEn: z.string().max(120).optional(),
  mainBranchAddressAr: z.string().max(250).optional(),
  mainBranchAddressEn: z.string().max(250).optional(),
});

export const saveOnboardingProgressServerFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => saveOnboardingProgressSchema.parse(d))
  .handler(async ({ data }) => {
    const userClient = createServerSupabaseClient(data.accessToken);
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(data.accessToken);

    if (authError || !user) {
      throw new Error("Authentication required");
    }

    const admin = createAdminSupabaseClient();
    const db = admin ?? userClient;
    const nowIso = new Date().toISOString();

    let targetBusinessId = data.businessId;
    let allowCrossOwnerUpdate = false;

    if (targetBusinessId) {
      const { data: existing, error: lookupError } = await db
        .from("businesses")
        .select("id,owner_id,merchant_email")
        .eq("id", targetBusinessId)
        .maybeSingle();

      if (lookupError || !existing) {
        throw new Error("Business not found");
      }

      const ownerMatches = existing.owner_id === user.id;
      const emailMatches = Boolean(
        existing.merchant_email &&
        user.email &&
        existing.merchant_email.toLowerCase() === user.email.toLowerCase(),
      );

      let hasRoleAccess = false;
      if (!ownerMatches && !emailMatches) {
        const { data: roles } = await db
          .from("user_roles")
          .select("role,business_id")
          .eq("user_id", user.id)
          .in("role", ["super_admin", "merchant"]);

        for (const r of roles ?? []) {
          if (r.role === "super_admin") {
            allowCrossOwnerUpdate = true;
            hasRoleAccess = true;
            break;
          }
          if (r.role === "merchant" && r.business_id === targetBusinessId) {
            allowCrossOwnerUpdate = true;
            hasRoleAccess = true;
          }
        }
      }

      if (!ownerMatches && !emailMatches && !hasRoleAccess) {
        throw new Error("Forbidden: you do not have permission to update this business");
      }

      if (emailMatches && !existing.owner_id) {
        await db.from("businesses").update({ owner_id: user.id }).eq("id", targetBusinessId);
      }
    } else {
      if (!data.slug || (!data.nameEn && !data.nameAr)) {
        throw new Error("Business ID or initial store identity is required");
      }

      const cleanSlug = data.slug.toLowerCase().trim();
      const cleanNameEn = (data.nameEn ?? data.nameAr ?? "").trim();
      const cleanNameAr = (data.nameAr ?? data.nameEn ?? "").trim();

      const { data: created, error: insertError } = await db
        .from("businesses")
        .insert({
          owner_id: user.id,
          slug: cleanSlug,
          name_en: cleanNameEn,
          name_ar: cleanNameAr,
          plan: "single_location",
          status: "active",
        })
        .select("id")
        .single();

      if (insertError || !created) {
        throw new Error(insertError?.message ?? "Could not create business");
      }

      targetBusinessId = created.id as string;

      await db
        .from("user_roles")
        .upsert(
          { user_id: user.id, role: "merchant", business_id: targetBusinessId },
          { onConflict: "user_id,role,business_id", ignoreDuplicates: true },
        );

      await db.from("business_subscriptions").upsert(
        {
          business_id: targetBusinessId,
          plan_code: "single_location",
          requested_plan_code: "single_location",
          status: "pending",
          updated_at: nowIso,
        },
        { onConflict: "business_id" },
      );
    }

    const resolvedTemplateId =
      data.templateId ??
      (data.stampIcon || data.stripStyle || data.colorPreset || data.tierMode
        ? serializePassTemplateMeta({
            baseId: data.baseTemplateId ?? "blank",
            stampIcon: data.stampIcon,
            stripStyle: data.stripStyle,
            colorPreset: data.colorPreset,
            tierMode: data.tierMode,
            brandColor: data.brandColor,
          })
        : undefined);

    const businessUpdates: Record<string, unknown> = {};
    if (data.nameEn !== undefined) businessUpdates["name_en"] = data.nameEn.trim();
    if (data.nameAr !== undefined) businessUpdates["name_ar"] = data.nameAr.trim();
    if (data.programType !== undefined) businessUpdates["program_type"] = data.programType;
    if (data.brandColor !== undefined) businessUpdates["brand_color"] = data.brandColor;
    if (data.accentColor !== undefined) businessUpdates["accent_color"] = data.accentColor;
    if (resolvedTemplateId !== undefined) businessUpdates["template_id"] = resolvedTemplateId;
    if (data.targetStamps !== undefined) businessUpdates["target_stamps"] = data.targetStamps;
    if (data.offerEn !== undefined) businessUpdates["offer_en"] = data.offerEn;
    if (data.offerAr !== undefined) businessUpdates["offer_ar"] = data.offerAr;
    if (data.sarPerPoint !== undefined) businessUpdates["sar_per_point"] = data.sarPerPoint;
    if (data.pointsPerReward !== undefined) {
      businessUpdates["points_per_reward"] = data.pointsPerReward;
    }

    if (Object.keys(businessUpdates).length > 0) {
      let updateQuery = db.from("businesses").update(businessUpdates).eq("id", targetBusinessId);
      if (!allowCrossOwnerUpdate) {
        updateQuery = updateQuery.eq("owner_id", user.id);
      }
      const { error: updateError } = await updateQuery;
      if (updateError) {
        throw new Error(updateError.message);
      }
    }

    if (data.requestedPlan) {
      const lowerPlan = data.requestedPlan.trim().toLowerCase();
      const canonicalPlan =
        lowerPlan === "multi_location" || lowerPlan === "growth" || lowerPlan === "enterprise"
          ? "multi_location"
          : "single_location";

      await db.from("business_subscriptions").upsert(
        {
          business_id: targetBusinessId,
          plan_code: "single_location",
          requested_plan_code: canonicalPlan,
          updated_at: nowIso,
        },
        { onConflict: "business_id" },
      );
    }

    if (
      data.mainBranchNameAr ||
      data.mainBranchNameEn ||
      data.mainBranchAddressAr ||
      data.mainBranchAddressEn
    ) {
      const branchUpdates: Record<string, unknown> = { updated_at: nowIso };
      if (data.mainBranchNameAr?.trim()) branchUpdates["name_ar"] = data.mainBranchNameAr.trim();
      if (data.mainBranchNameEn?.trim()) branchUpdates["name_en"] = data.mainBranchNameEn.trim();
      if (data.mainBranchAddressAr?.trim()) {
        branchUpdates["address_ar"] = data.mainBranchAddressAr.trim();
      }
      if (data.mainBranchAddressEn?.trim()) {
        branchUpdates["address_en"] = data.mainBranchAddressEn.trim();
      }
      await db
        .from("branches")
        .update(branchUpdates)
        .eq("business_id", targetBusinessId)
        .eq("code", "main");
    }

    const isCompleted = Boolean(data.completed) || data.step === "completed";
    const targetStep = isCompleted ? "completed" : data.step;

    const { error: onboardingError } = await db.from("business_onboarding").upsert(
      {
        business_id: targetBusinessId,
        step: targetStep,
        completed: isCompleted,
        ...(isCompleted ? { completed_at: nowIso } : {}),
        updated_at: nowIso,
      },
      { onConflict: "business_id" },
    );

    if (onboardingError) {
      throw new Error(onboardingError.message);
    }

    return {
      ok: true as const,
      businessId: targetBusinessId,
      step: targetStep,
      completed: isCompleted,
      templateId: resolvedTemplateId ?? null,
    };
  });
