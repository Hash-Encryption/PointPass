export type WalletTierMode = "free" | "pro";
export type StripStyle = "pizzatown" | "nails_white" | "linear_dark";
export type WalletColorPreset = "dark" | "blue" | "green" | "red" | "purple" | "orange";

export interface PassTemplateMeta {
  baseId: string;
  stampIcon: string;
  stripStyle: StripStyle;
  colorPreset: WalletColorPreset;
  tierMode: WalletTierMode;
}

export const WALLET_COLOR_PRESETS: Record<
  WalletColorPreset,
  { nameAr: string; nameEn: string; hex: string; accent: string }
> = {
  dark: { nameAr: "أسود داكن", nameEn: "Dark Obsidian", hex: "#121214", accent: "#10B981" },
  red: { nameAr: "أحمر قرمزي", nameEn: "Crimson Red", hex: "#991B1B", accent: "#F87171" },
  orange: { nameAr: "برتقالي دافئ", nameEn: "Warm Orange", hex: "#C2410C", accent: "#FBBF24" },
  green: { nameAr: "أخضر زمردي", nameEn: "Emerald Green", hex: "#065F46", accent: "#34D399" },
  purple: { nameAr: "بنفسجي ملكي", nameEn: "Royal Purple", hex: "#581C87", accent: "#C084FC" },
  blue: { nameAr: "أزرق محيطي", nameEn: "Ocean Blue", hex: "#1E40AF", accent: "#60A5FA" },
};

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

export function serializePassTemplateMeta(params: {
  baseId?: string | null | undefined;
  stampIcon?: string | null | undefined;
  stripStyle?: StripStyle | null | undefined;
  colorPreset?: WalletColorPreset | null | undefined;
  tierMode?: WalletTierMode | null | undefined;
}): string {
  const base = params.baseId?.trim() || "custom";
  const icon = emojiToIcon(params.stampIcon || "star");
  const style: StripStyle = params.stripStyle || "pizzatown";
  const preset: WalletColorPreset = params.colorPreset || "dark";
  const tier: WalletTierMode = params.tierMode === "pro" ? "pro" : "free";

  return `${base}__icon-${icon}__style-${style}__preset-${preset}__tier-${tier}`;
}

export function parsePassTemplateMeta(templateId?: string | null): PassTemplateMeta {
  if (!templateId || typeof templateId !== "string") {
    return {
      baseId: "custom",
      stampIcon: "star",
      stripStyle: "pizzatown",
      colorPreset: "dark",
      tierMode: "free",
    };
  }

  const raw = templateId.trim();
  const parts = raw.split("__");
  const baseId = parts[0] || "custom";

  let stampIcon = "star";
  let stripStyle: StripStyle = "pizzatown";
  let colorPreset: WalletColorPreset = "dark";
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
  }

  return {
    baseId,
    stampIcon,
    stripStyle,
    colorPreset,
    tierMode,
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
