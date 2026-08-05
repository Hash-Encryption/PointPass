/**
 * Modular pass template storage.
 *
 * Paste custom pass schemas generated elsewhere directly into
 * `PASS_TEMPLATES` — they are typed against `PassTemplate`.
 */

export type ProgramType = "stamp" | "points" | "coupon_morph";

export type BarcodeFormat = "QR" | "PDF417" | "AZTEC" | "CODE128";

export interface BilingualString {
  ar: string;
  en: string;
}

export interface PassColorTokens {
  /** Card background (hex) */
  background: string;
  /** Foreground text (hex) — can be auto-contrasted at render time */
  foreground: string;
  /** Label / secondary text (hex) */
  label: string;
  /** Accent used for stamps, progress and highlights (hex) */
  accent: string;
}

export interface PassField {
  key: string;
  placement: "header" | "primary" | "secondary" | "auxiliary" | "back";
  label: BilingualString;
  value: BilingualString;
}

export interface PassBarcode {
  format: BarcodeFormat;
  messageEncoding: "iso-8859-1" | "utf-8";
  altTextTemplate: string;
}

export interface PassProgramConfig {
  type: ProgramType;
  /** stamp: number of stamps required */
  targetStamps?: number;
  /** points: SAR spent required to earn 1 point */
  sarPerPoint?: number;
  /** points: points required for a reward */
  pointsPerReward?: number;
  /** coupon_morph: intro offer text */
  introOffer?: BilingualString;
  /** coupon_morph: program the coupon morphs into after first scan */
  morphsInto?: Exclude<ProgramType, "coupon_morph">;
  reward: BilingualString;
}

export interface PassTemplate {
  id: string;
  name: BilingualString;
  logoUrl: string | null;
  colors: PassColorTokens;
  fields: PassField[];
  barcode: PassBarcode;
  program: PassProgramConfig;
  geofence?: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    relevantText: BilingualString;
  };
}

export const DEFAULT_BARCODE: PassBarcode = {
  format: "QR",
  messageEncoding: "iso-8859-1",
  altTextTemplate: "{{pass_serial}}",
};

export const BRAND_COLORS: PassColorTokens = {
  background: "#059669",
  foreground: "#FFFFFF",
  label: "#D1FAE5",
  accent: "#F59E0B",
};

export const PASS_TEMPLATES: Record<ProgramType, PassTemplate> = {
  stamp: {
    id: "tpl_stamp_coffee_9",
    name: { ar: "بطاقة أختام القهوة", en: "Coffee Stamp Card" },
    logoUrl: null,
    colors: BRAND_COLORS,
    fields: [
      {
        key: "member",
        placement: "header",
        label: { ar: "العضو", en: "Member" },
        value: { ar: "{{customer_name}}", en: "{{customer_name}}" },
      },
      {
        key: "stamps",
        placement: "primary",
        label: { ar: "الأختام", en: "Stamps" },
        value: { ar: "{{stamps}} / {{target}}", en: "{{stamps}} / {{target}}" },
      },
      {
        key: "reward",
        placement: "secondary",
        label: { ar: "المكافأة", en: "Reward" },
        value: { ar: "قهوة مجانية", en: "Free coffee" },
      },
    ],
    barcode: DEFAULT_BARCODE,
    program: {
      type: "stamp",
      targetStamps: 9,
      reward: { ar: "اشترِ ٩ واحصل على واحدة مجاناً", en: "Buy 9, get 1 free" },
    },
  },
  points: {
    id: "tpl_points_cashback",
    name: { ar: "نقاط واسترداد نقدي", en: "Points & Cashback" },
    logoUrl: null,
    colors: { ...BRAND_COLORS, background: "#0F172A", label: "#94A3B8" },
    fields: [
      {
        key: "balance",
        placement: "primary",
        label: { ar: "رصيد النقاط", en: "Points balance" },
        value: { ar: "{{points}}", en: "{{points}}" },
      },
      {
        key: "ratio",
        placement: "secondary",
        label: { ar: "معدل الكسب", en: "Earn rate" },
        value: { ar: "نقطة لكل ١٠ ر.س", en: "1 point / 10 SAR" },
      },
    ],
    barcode: DEFAULT_BARCODE,
    program: {
      type: "points",
      sarPerPoint: 10,
      pointsPerReward: 100,
      reward: { ar: "خصم ٥٠ ر.س", en: "SAR 50 off" },
    },
  },
  coupon_morph: {
    id: "tpl_coupon_morph",
    name: { ar: "قسيمة تتحول إلى ولاء", en: "Coupon-to-Loyalty" },
    logoUrl: null,
    colors: { ...BRAND_COLORS, background: "#F59E0B", foreground: "#0F172A", label: "#7C2D12" },
    fields: [
      {
        key: "offer",
        placement: "primary",
        label: { ar: "العرض", en: "Offer" },
        value: { ar: "خصم ٢٠٪ على أول زيارة", en: "20% off first visit" },
      },
      {
        key: "expiry",
        placement: "auxiliary",
        label: { ar: "ينتهي في", en: "Expires" },
        value: { ar: "{{expiry}}", en: "{{expiry}}" },
      },
    ],
    barcode: DEFAULT_BARCODE,
    program: {
      type: "coupon_morph",
      introOffer: { ar: "خصم ٢٠٪ على أول زيارة", en: "20% off first visit" },
      morphsInto: "stamp",
      targetStamps: 6,
      reward: { ar: "مشروب مجاني", en: "Free drink" },
    },
  },
};

/** WCAG-ish luminance contrast helper used by the pass designer. */
export function autoContrast(hex: string): "#FFFFFF" | "#0F172A" {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? "#0F172A" : "#FFFFFF";
}
