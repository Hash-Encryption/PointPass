import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function walletFetch(path: string, body: unknown) {
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
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`WalletWallet ${path} failed [${res.status}]: ${text}`);
    return { ok: false as const, status: res.status, error: text, data: null };
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
  programType: z.enum(["stamp", "points", "coupon_morph"]),
  template: z.record(z.unknown()).optional(),
});

export const createWalletPass = createServerFn({ method: "POST" })
  .validator((d: unknown) => createPassSchema.parse(d))
  .handler(async ({ data }) => {
    const result = await walletFetch("/passes", {
      tenant_slug: data.slug,
      phone: data.phone,
      program_type: data.programType,
      template: data.template ?? null,
    });
    if (!result.ok) {
      // Graceful fallback so the claim flow stays usable while credentials pend.
      return {
        ok: false,
        error: result.error,
        appleUrl: null as string | null,
        googleUrl: null as string | null,
      };
    }
    const payload = result.data as { apple_url?: string; google_url?: string };
    return {
      ok: true,
      error: null as string | null,
      appleUrl: payload.apple_url ?? null,
      googleUrl: payload.google_url ?? null,
    };
  });

const updatePassSchema = z.object({
  serial: z.string().min(1).max(128),
  action: z.enum(["stamp", "points", "redeem"]),
  amountSar: z.number().min(0).max(100000).optional(),
});

export const updateWalletPass = createServerFn({ method: "POST" })
  .validator((d: unknown) => updatePassSchema.parse(d))
  .handler(async ({ data }) => {
    const result = await walletFetch(`/passes/${encodeURIComponent(data.serial)}/update`, {
      action: data.action,
      amount_sar: data.amountSar ?? null,
      push: true,
    });
    return { ok: result.ok, error: result.error };
  });

const pushSchema = z.object({
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
    const result = await walletFetch("/push/broadcast", {
      tenant_slug: data.slug,
      segment: data.segment,
      title: { ar: data.titleAr, en: data.titleEn },
      body: { ar: data.bodyAr, en: data.bodyEn },
    });
    return { ok: result.ok, error: result.error };
  });
