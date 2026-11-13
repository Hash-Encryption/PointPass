export type WalletTierMode = "free" | "pro";
export type StripStyle = "pizzatown" | "nails_white" | "linear_dark";
export type WalletColorPreset = "dark" | "blue" | "green" | "red" | "purple" | "orange";

export type FreeColorPresetKey = WalletColorPreset;
export type PassTierMode = WalletTierMode;
export type StampIconKey = string;
export type StripStyleKey = StripStyle;

export const STAMP_ICONS = ["⭐", "☕", "🍔", "🥐", "✂️", "🚗", "🎁"] as const;

export interface PassTemplateMeta {
  baseId: string;
  stampIcon: string;
  stripStyle: StripStyle;
  colorPreset: WalletColorPreset;
  tierMode: WalletTierMode;
}

export const FREE_TIER_PRESETS: Record<WalletColorPreset, string> = {
  orange: "#e65100",
  red: "#dc2626",
  blue: "#2563eb",
  purple: "#7c3aed",
  dark: "#18181b",
  green: "#059669",
};

export const WALLET_COLOR_PRESETS: Record<
  WalletColorPreset,
  { nameAr: string; nameEn: string; hex: string; accent: string }
> = {
  orange: {
    nameAr: "برتقالي دافئ",
    nameEn: "Warm Orange",
    hex: FREE_TIER_PRESETS.orange,
    accent: "#fbbf24",
  },
  red: {
    nameAr: "أحمر قرمزي",
    nameEn: "Crimson Red",
    hex: FREE_TIER_PRESETS.red,
    accent: "#f87171",
  },
  blue: {
    nameAr: "أزرق محيطي",
    nameEn: "Ocean Blue",
    hex: FREE_TIER_PRESETS.blue,
    accent: "#60a5fa",
  },
  purple: {
    nameAr: "بنفسجي ملكي",
    nameEn: "Royal Purple",
    hex: FREE_TIER_PRESETS.purple,
    accent: "#c084fc",
  },
  dark: {
    nameAr: "أسود داكن",
    nameEn: "Dark Obsidian",
    hex: FREE_TIER_PRESETS.dark,
    accent: "#fbbf24",
  },
  green: {
    nameAr: "أخضر زمردي",
    nameEn: "Emerald Green",
    hex: FREE_TIER_PRESETS.green,
    accent: "#34d399",
  },
};

function parseHexRgb(hex?: string | null): [number, number, number] | null {
  if (!hex) return null;
  let clean = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** Maps any custom Pro #hex color to the nearest canonical Free Tier colorPreset via RGB distance. */
export function nearestFreeColorPreset(hex?: string | null): WalletColorPreset {
  const rgb = parseHexRgb(hex);
  if (!rgb) return "dark";

  let bestPreset: WalletColorPreset = "dark";
  let bestDist = Number.POSITIVE_INFINITY;

  for (const [preset, presetHex] of Object.entries(FREE_TIER_PRESETS) as Array<
    [WalletColorPreset, string]
  >) {
    const target = parseHexRgb(presetHex)!;
    const dist = (rgb[0] - target[0]) ** 2 + (rgb[1] - target[1]) ** 2 + (rgb[2] - target[2]) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestPreset = preset;
    }
  }

  return bestPreset;
}

export const STRIP_STYLES: Array<{
  id: StripStyle;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
}> = [
  {
    id: "pizzatown",
    nameAr: "شارات بيتزاتاون الدائرية",
    nameEn: "Pizzatown Badges",
    descriptionAr: "خلفية بلون الهوية مع شارات دائرية بيضاء ناصعة للأختام المكتملة",
    descriptionEn: "Full-bleed brand background with high-contrast circular stamp badges",
  },
  {
    id: "nails_white",
    nameAr: "بطاقة نيلز البيضاء",
    nameEn: "Nails White Card",
    descriptionAr: "بطاقة بيضاء نقية بداخل الشريط مع أختام ملونة وحواف ناعمة",
    descriptionEn: "Crisp white rounded card container with vibrant colored stamp circles",
  },
  {
    id: "linear_dark",
    nameAr: "لينير داكن عالي التباين",
    nameEn: "Linear Dark",
    descriptionAr: "سطح داكن مرتفع مع أختام متوهجة بلون التمييز",
    descriptionEn: "Elevated dark charcoal surface with glowing accent rings",
  },
];

export const ICON_EMOJI_MAP: Record<string, string> = {
  coffee: "☕",
  burger: "🍔",
  bakery: "🥐",
  salon: "✂️",
  car: "🚗",
  carwash: "🚗",
  gift: "🎁",
  star: "⭐",
};

export const EMOJI_ICON_MAP: Record<string, string> = {
  "☕": "coffee",
  "🍔": "burger",
  "🥐": "bakery",
  "✂️": "salon",
  "🚗": "car",
  "🎁": "gift",
  "⭐": "star",
};

export function iconToEmoji(iconKey?: string | null): string {
  if (!iconKey) return "⭐";
  const clean = iconKey.trim().toLowerCase();
  return ICON_EMOJI_MAP[clean] || (EMOJI_ICON_MAP[clean] ? clean : "⭐");
}

export function emojiToIcon(emojiOrText?: string | null): string {
  if (!emojiOrText) return "star";
  const clean = emojiOrText.trim();
  if (EMOJI_ICON_MAP[clean]) return EMOJI_ICON_MAP[clean]!;
  const lower = clean.toLowerCase();
  if (ICON_EMOJI_MAP[lower]) return lower;
  if (lower.includes("coffee") || lower.includes("cafe")) return "coffee";
  if (lower.includes("burger") || lower.includes("bistro")) return "burger";
  if (lower.includes("bakery") || lower.includes("sweet")) return "bakery";
  if (lower.includes("salon") || lower.includes("barber")) return "salon";
  if (lower.includes("car")) return "car";
  if (lower.includes("gift")) return "gift";
  return "star";
}

export interface SerializePassTemplateOptions {
  colorPreset?: WalletColorPreset | null | undefined;
  tierMode?: WalletTierMode | null | undefined;
  brandColor?: string | null | undefined;
}

export function serializePassTemplateMeta(
  baseIdOrParams?:
    | string
    | {
        baseId?: string | null | undefined;
        stampIcon?: string | null | undefined;
        stripStyle?: StripStyle | null | undefined;
        colorPreset?: WalletColorPreset | null | undefined;
        tierMode?: WalletTierMode | null | undefined;
        brandColor?: string | null | undefined;
      }
    | null,
  stampIcon?: string | null | undefined,
  stripStyle?: StripStyle | null | undefined,
  options?: SerializePassTemplateOptions,
): string {
  let base = "blank";
  let iconRaw: string | null | undefined;
  let styleRaw: StripStyle | null | undefined;
  let presetRaw: WalletColorPreset | null | undefined;
  let tierRaw: WalletTierMode | null | undefined;
  let brandColorRaw: string | null | undefined;

  if (typeof baseIdOrParams === "object" && baseIdOrParams !== null) {
    base = baseIdOrParams.baseId?.trim() || "blank";
    iconRaw = baseIdOrParams.stampIcon;
    styleRaw = baseIdOrParams.stripStyle;
    presetRaw = baseIdOrParams.colorPreset;
    tierRaw = baseIdOrParams.tierMode;
    brandColorRaw = baseIdOrParams.brandColor;
  } else {
    base =
      typeof baseIdOrParams === "string" && baseIdOrParams.trim() ? baseIdOrParams.trim() : "blank";
    iconRaw = stampIcon;
    styleRaw = stripStyle;
    presetRaw = options?.colorPreset;
    tierRaw = options?.tierMode;
    brandColorRaw = options?.brandColor;
  }

  const icon = emojiToIcon(iconRaw || "star");
  const style: StripStyle = styleRaw || "pizzatown";
  const tier: WalletTierMode = tierRaw === "pro" ? "pro" : "free";
  // In Pro mode, always sync the Free Tier backup colorPreset from brandColor via nearestFreeColorPreset
  const preset: WalletColorPreset =
    tier === "pro" && brandColorRaw
      ? nearestFreeColorPreset(brandColorRaw)
      : presetRaw || (brandColorRaw ? nearestFreeColorPreset(brandColorRaw) : "dark");

  return `${base}__icon-${icon}__style-${style}__preset-${preset}__tier-${tier}`;
}

export function parsePassTemplateMeta(
  templateId?: string | null,
  brandColor?: string | null,
): PassTemplateMeta {
  const fallbackPreset: WalletColorPreset = brandColor
    ? nearestFreeColorPreset(brandColor)
    : "dark";

  if (!templateId || typeof templateId !== "string") {
    return {
      baseId: "blank",
      stampIcon: "star",
      stripStyle: "pizzatown",
      colorPreset: fallbackPreset,
      tierMode: "free",
    };
  }

  const raw = templateId.trim();
  const parts = raw.split("__");
  const baseId = parts[0] || "blank";

  let stampIcon = "star";
  let stripStyle: StripStyle = "pizzatown";
  let colorPreset: WalletColorPreset = fallbackPreset;
  let hasExplicitPreset = false;
  let tierMode: WalletTierMode = "free";

  for (const part of parts.slice(1)) {
    if (part.startsWith("icon-")) {
      stampIcon = part.slice(5);
    } else if (part.startsWith("style-")) {
      const s = part.slice(6);
      if (s === "pizzatown" || s === "nails_white" || s === "linear_dark") {
        stripStyle = s;
      }
    } else if (part.startsWith("preset-")) {
      const p = part.slice(7);
      if (
        p === "dark" ||
        p === "blue" ||
        p === "green" ||
        p === "red" ||
        p === "purple" ||
        p === "orange"
      ) {
        colorPreset = p;
        hasExplicitPreset = true;
      }
    } else if (part.startsWith("tier-")) {
      const t = part.slice(5);
      if (t === "pro" || t === "free") {
        tierMode = t;
      }
    }
  }

  // If no __ tokens were present, infer from legacy template identifiers like 'coffee', 'burger', etc.
  if (parts.length === 1) {
    if (baseId.includes("coffee")) {
      stampIcon = "coffee";
      colorPreset = "orange";
    } else if (baseId.includes("burger")) {
      stampIcon = "burger";
      colorPreset = "red";
    } else if (baseId.includes("bakery")) {
      stampIcon = "bakery";
      colorPreset = "orange";
    } else if (baseId.includes("salon")) {
      stampIcon = "salon";
      colorPreset = "purple";
    } else if (baseId.includes("car")) {
      stampIcon = "car";
      colorPreset = "blue";
    }
  } else if (!hasExplicitPreset && brandColor) {
    colorPreset = nearestFreeColorPreset(brandColor);
  }

  return {
    baseId,
    stampIcon,
    stripStyle,
    colorPreset,
    tierMode,
  };
}

export interface ResolvedRestaurantBranding {
  stampIcon: string;
  stampEmoji: string;
  colorPreset: WalletColorPreset;
  brandHex: string;
  accentHex: string;
  tierMode: WalletTierMode;
  stripStyle: StripStyle;
}

export function resolveRestaurantBranding(params: {
  brandColor?: string | null | undefined;
  accentColor?: string | null | undefined;
  templateId?: string | null | undefined;
  offerEn?: string | null | undefined;
  offerAr?: string | null | undefined;
  nameEn?: string | null | undefined;
  nameAr?: string | null | undefined;
}): ResolvedRestaurantBranding {
  const meta = parsePassTemplateMeta(params.templateId, params.brandColor);
  const hasExplicitPreset = Boolean(params.templateId?.includes("preset-"));
  const combined =
    `${params.offerEn ?? ""} ${params.offerAr ?? ""} ${params.nameEn ?? ""} ${params.nameAr ?? ""} ${params.brandColor ?? ""}`.toLowerCase();

  let stampIcon = meta.stampIcon;
  let colorPreset = meta.colorPreset;

  // Infer industry icon if still default 'star'
  if (stampIcon === "star") {
    if (
      combined.includes("☕") ||
      combined.includes("coffee") ||
      combined.includes("قهوة") ||
      combined.includes("كافيه") ||
      combined.includes("مقهى") ||
      combined.includes("espresso") ||
      combined.includes("latte")
    ) {
      stampIcon = "coffee";
      if (!hasExplicitPreset) colorPreset = "orange";
    } else if (
      combined.includes("🍔") ||
      combined.includes("burger") ||
      combined.includes("برجر") ||
      combined.includes("bistro") ||
      combined.includes("pizza") ||
      combined.includes("بيتزا")
    ) {
      stampIcon = "burger";
      if (!hasExplicitPreset) colorPreset = "red";
    } else if (
      combined.includes("🥐") ||
      combined.includes("bakery") ||
      combined.includes("مخبز") ||
      combined.includes("حلويات") ||
      combined.includes("sweets") ||
      combined.includes("pastry")
    ) {
      stampIcon = "bakery";
      if (!hasExplicitPreset) colorPreset = "orange";
    } else if (
      combined.includes("✂️") ||
      combined.includes("salon") ||
      combined.includes("صالون") ||
      combined.includes("حلاقة") ||
      combined.includes("barber")
    ) {
      stampIcon = "salon";
      if (!hasExplicitPreset) colorPreset = "purple";
    } else if (
      combined.includes("🚗") ||
      combined.includes("car") ||
      combined.includes("غسيل") ||
      combined.includes("سيارات")
    ) {
      stampIcon = "car";
      if (!hasExplicitPreset) colorPreset = "blue";
    } else if (combined.includes("🎁") || combined.includes("gift") || combined.includes("هدية")) {
      stampIcon = "gift";
    }
  }

  const presetInfo = WALLET_COLOR_PRESETS[colorPreset] ?? WALLET_COLOR_PRESETS.dark;
  const isUnconfiguredEmerald =
    params.brandColor?.toLowerCase() === "#059669" && !hasExplicitPreset && stampIcon !== "star";

  let brandHex: string;
  if (meta.tierMode === "free") {
    brandHex = FREE_TIER_PRESETS[colorPreset];
  } else {
    brandHex =
      params.brandColor && !isUnconfiguredEmerald
        ? params.brandColor
        : FREE_TIER_PRESETS[colorPreset];
    if (!hasExplicitPreset) {
      colorPreset = nearestFreeColorPreset(brandHex);
    }
  }

  const resolvedPresetInfo = WALLET_COLOR_PRESETS[colorPreset] ?? presetInfo;
  const accentHex = params.accentColor || resolvedPresetInfo.accent;

  return {
    stampIcon,
    stampEmoji: iconToEmoji(stampIcon),
    colorPreset,
    brandHex,
    accentHex,
    tierMode: meta.tierMode,
    stripStyle: meta.stripStyle,
  };
}

const TIER_STORAGE_KEY = "pointpass_wallet_tier_mode";

export function getStoredWalletTier(): WalletTierMode {
  if (typeof window === "undefined") return "free";
  try {
    const val = window.localStorage.getItem(TIER_STORAGE_KEY);
    return val === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

export function setStoredWalletTier(tier: WalletTierMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TIER_STORAGE_KEY, tier);
    window.dispatchEvent(new CustomEvent("pointpass:tier-change", { detail: tier }));
  } catch {
    // LocalStorage quota or access exception safety
  }
}

/**
 * Normalizes phone numbers with special handling for Saudi mobiles (E.164 canonical: +9665XXXXXXXX).
 */
export function normalizePhoneNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // 1. Convert Arabic-Indic numerals ٠-٩ to western 0-9
  let cleaned = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  // 2. Strip spaces, dashes, parens, dots, slashes, non-digits (preserving leading + if any)
  cleaned = cleaned.trim().replace(/[^0-9+]/g, "");
  if (!cleaned) return null;

  // 3. Saudi mobile normalization (E.164 canonical: +9665XXXXXXXX)
  // Form: 05xxxxxxxx (10 digits)
  if (/^05[0-9]{8}$/.test(cleaned)) {
    return "+9665" + cleaned.slice(2);
  }
  // Form: 5xxxxxxxx (9 digits)
  if (/^5[0-9]{8}$/.test(cleaned)) {
    return "+9665" + cleaned.slice(1);
  }
  // Form: 9665xxxxxxxx (12 digits)
  if (/^9665[0-9]{8}$/.test(cleaned)) {
    return "+" + cleaned;
  }
  // Form: 009665xxxxxxxx (14 digits)
  if (/^009665[0-9]{8}$/.test(cleaned)) {
    return "+9665" + cleaned.slice(6);
  }
  // Form: +9665xxxxxxxx (13 chars)
  if (/^\+9665[0-9]{8}$/.test(cleaned)) {
    return cleaned;
  }
  // Valid international E.164: + followed by 7-15 digits
  if (/^\+[1-9][0-9]{6,14}$/.test(cleaned)) {
    return cleaned;
  }
  // 00 followed by country code + digits
  if (/^00[1-9][0-9]{6,14}$/.test(cleaned)) {
    return "+" + cleaned.slice(2);
  }

  return cleaned;
}

/**
 * Generates a short, privacy-safe numeric pass code formatted as PP-XXXXX.
 * Strictly 5 digits (10,000 to 99,999) while existingPassCount < 90,000.
 * Automatically scales to 6 digits (100,000 to 999,999) only when existingPassCount >= 90,000
 * or when forceSixDigits is true (e.g. after 5-digit collision retries exhaust).
 */
export function generateNumericPassCode(existingPassCount = 0, forceSixDigits = false): string {
  const useSixDigits = forceSixDigits || existingPassCount >= 90_000;
  const min = useSixDigits ? 100_000 : 10_000;
  const max = useSixDigits ? 999_999 : 99_999;
  const randomNum = Math.floor(min + Math.random() * (max - min + 1));
  return `PP-${randomNum}`;
}

export function generateStorePassCode(existingPassCount = 0, attempt = 0): string {
  return generateNumericPassCode(existingPassCount, attempt >= 12);
}

export interface CashierLookupNormalizationResult {
  normalized: string;
  isPhone: boolean;
  cleanDigits?: string;
}

/**
 * Normalizes input from POS keyboard, handheld scanner, or QR camera:
 * - Raw 5-6 digits (e.g. "48291" or "482-91") -> "PP-48291"
 * - Explicit "pp-XXXXX" -> "PP-XXXXX" (preserves legacy alphanumeric PP-... codes)
 * - Phone numbers (05... / 5... / +9665...) -> canonical E.164
 * - Full QR URLs -> extracts and normalizes the embedded pass code
 */
export function normalizeCashierLookupQuery(raw: string): CashierLookupNormalizationResult {
  let cleaned = (raw || "").trim();

  // 1. Extract from URL if QR scanned as full URL
  try {
    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
      const url = new URL(cleaned);
      const fromParam = url.searchParams.get("serial") || url.searchParams.get("pass");
      if (fromParam) {
        cleaned = fromParam.trim();
      } else {
        const segments = url.pathname.split("/").filter(Boolean);
        const last = segments[segments.length - 1];
        if (last && (last.toUpperCase().startsWith("PP-") || last.length >= 5)) {
          cleaned = last.trim();
        }
      }
    }
  } catch {
    // Not a valid URL, keep cleaned as-is
  }

  // 2. Explicit PP-... Code (case-insensitive, numeric or legacy alphanumeric)
  const ppMatch = cleaned.match(/^pp-([a-zA-Z0-9_-]+)$/i);
  if (ppMatch?.[1]) {
    return {
      normalized: `PP-${ppMatch[1].toUpperCase()}`,
      isPhone: false,
    };
  }

  // Also check if PP- is embedded in scanned string
  const embeddedMatch = cleaned.match(/PP-[A-Za-z0-9_-]+/i);
  if (embeddedMatch?.[0]) {
    return {
      normalized: embeddedMatch[0].toUpperCase(),
      isPhone: false,
    };
  }

  // 3. Raw 5-to-6 digit numeric code (with optional hyphens/spaces, e.g. 48291 or 482-91)
  const digitsOnly = cleaned.replace(/[\s-]/g, "");
  if (/^\d{5,6}$/.test(digitsOnly)) {
    return {
      normalized: `PP-${digitsOnly}`,
      isPhone: false,
    };
  }

  // 4. Saudi Phone Number or International Phone
  const normalizedPhone = normalizePhoneNumber(cleaned);
  if (normalizedPhone || /^[0-9+() -]{7,20}$/.test(cleaned)) {
    return {
      normalized: normalizedPhone || cleaned,
      isPhone: true,
      cleanDigits: digitsOnly,
    };
  }

  return {
    normalized: cleaned,
    isPhone: false,
  };
}
