import {
  iconToEmoji,
  type StripStyle,
  type WalletColorPreset,
  type WalletTierMode,
} from "./wallet-tier.ts";

export type { StripStyle, WalletColorPreset, WalletTierMode };

export type WalletPassState = {
  serial: string;
  businessName: string;
  offer: string;
  programType: "stamp" | "points" | "coupon_morph";
  stamps: number;
  points: number;
  morphed: boolean;
  targetStamps: number;
  notification?: string;
  brandColor?: string | null | undefined;
  accentColor?: string | null | undefined;
  stripDataUri?: string | null | undefined;
  stripUrl?: string | null | undefined;
  logoUrl?: string | null | undefined;
  stampIcon?: string | null | undefined;
  colorPreset?: WalletColorPreset | null | undefined;
  stripStyle?: StripStyle | null | undefined;
  tierMode?: WalletTierMode | null | undefined;
};

export function resolveColorPreset(
  brandColor?: string | null,
  accentColor?: string | null,
): WalletColorPreset {
  const hex =
    brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor)
      ? brandColor
      : accentColor && /^#[0-9a-fA-F]{6}$/.test(accentColor)
        ? accentColor
        : null;

  if (!hex) return "dark";

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  // Very dark or achromatic colors map to dark
  if (l < 0.2 || d < 0.1) return "dark";

  let h = 0;
  if (max === r) {
    h = ((g - b) / d) % 6;
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  if (h >= 15 && h < 55) return "orange";
  if (h >= 55 && h < 170) return "green";
  if (h >= 170 && h < 255) return "blue";
  if (h >= 255 && h < 330) return "purple";
  return "red";
}

/**
 * Builds a 100% Free-tier-compliant pass payload for Apple Wallet and Google Wallet.
 * Features a visual emoji stamp progress bar, header counter, and clean 2-column secondary fields.
 */
export function buildBaselineWalletPassPayload(state: WalletPassState): Record<string, unknown> {
  const isPoints = state.programType === "points";
  const isCoupon = state.programType === "coupon_morph" && !state.morphed;
  const target = Math.max(1, state.targetStamps || 8);
  const stamps = Math.max(0, state.stamps || 0);
  const emoji = iconToEmoji(state.stampIcon);
  const remainingCount = Math.max(0, target - stamps);

  const colorPreset = state.colorPreset || resolveColorPreset(state.brandColor, state.accentColor);

  let headerFields: Array<{ key?: string; label: string; value: string; changeMessage?: string }>;
  let primaryFields: Array<{ key?: string; label: string; value: string; changeMessage?: string }>;
  let secondaryFields: Array<{
    key?: string;
    label: string;
    value: string;
    changeMessage?: string;
  }>;

  if (isPoints) {
    headerFields = [
      {
        key: "points_header",
        label: "POINTS",
        value: String(state.points),
        changeMessage: "You now have %@ points",
      },
    ];
    primaryFields = [
      {
        key: "points_primary",
        label: "POINTS BALANCE",
        value: `${state.points} PTS`,
        changeMessage: "Your balance is now %@",
      },
    ];
    secondaryFields = [
      {
        key: "reward",
        label: "REWARD",
        value: state.offer || "Points Reward",
      },
    ];
  } else if (isCoupon) {
    headerFields = [
      {
        key: "offer_header",
        label: "OFFER",
        value: "WELCOME",
        changeMessage: "Your offer is %@",
      },
    ];
    primaryFields = [
      {
        key: "offer_primary",
        label: "OFFER",
        value: state.offer || "Special Offer",
      },
    ];
    secondaryFields = [
      {
        key: "details",
        label: "DETAILS",
        value: "Scan at counter to redeem & unlock stamp card",
      },
    ];
  } else {
    // Stamp card (or morphed coupon)
    headerFields = [
      {
        key: "stamps_header",
        label: "STAMPS",
        value: `${stamps}/${target}`,
        changeMessage: "You now have %@ stamps",
      },
    ];

    let progressValue: string;
    if (stamps >= target) {
      progressValue = "🎁 REWARD UNLOCKED!";
    } else {
      const earned = Array(stamps).fill(emoji);
      const remaining = Array(remainingCount).fill("⚪");
      progressValue = [...earned, ...remaining].join(" ");
    }

    primaryFields = [
      {
        key: "stamps_progress",
        label: "STAMP PROGRESS",
        value: progressValue,
        changeMessage: "You now have %@ stamps",
      },
    ];

    secondaryFields = [
      {
        key: "remaining",
        label: "REMAINING",
        value: `${remainingCount} left`,
      },
      {
        key: "reward",
        label: "REWARD",
        value: state.offer || "Special Reward",
      },
    ];
  }

  const backFields = [
    {
      label: "NOTIFICATIONS",
      value: state.notification ?? " ",
      changeMessage: "%@",
    },
  ];

  return {
    barcodeValue: state.serial,
    barcodeFormat: "QR",
    logoText: state.businessName,
    description: `Loyalty card for ${state.businessName}`,
    headerFields,
    primaryFields,
    secondaryFields,
    backFields,
    colorPreset,
  };
}

/**
 * Builds the pass payload.
 * When tierMode is 'free' or when no visual strip is available, uses the enhanced baseline Free layout.
 * When tierMode is 'pro' with a stripURL/stripDataUri, builds the retina storeCard pass.
 */
export function buildWalletPassPayload(state: WalletPassState): Record<string, unknown> {
  if (state.tierMode === "free") {
    return buildBaselineWalletPassPayload(state);
  }

  const isPoints = state.programType === "points";
  const isCoupon = state.programType === "coupon_morph" && !state.morphed;
  const label = isPoints ? "POINTS" : isCoupon ? "OFFER" : "STAMPS";
  const value = isPoints
    ? String(state.points)
    : isCoupon
      ? state.offer
      : `${state.stamps}/${state.targetStamps}`;

  const changeMessage = isPoints
    ? "You now have %@ points"
    : isCoupon
      ? "Your offer is now %@"
      : "You now have %@ stamps";

  const headerFields = [
    {
      label,
      value,
      changeMessage,
    },
  ];

  const secondaryFields = state.offer
    ? [
        {
          label: isCoupon ? "DETAILS" : "REWARD",
          value: state.offer,
        },
      ]
    : [];

  const backFields = [
    {
      label: "NOTIFICATIONS",
      value: state.notification ?? " ",
      changeMessage: "%@",
    },
  ];

  const payload: Record<string, unknown> = {
    barcodeValue: state.serial,
    barcodeFormat: "QR",
    logoText: state.businessName,
    description: `Loyalty card for ${state.businessName}`,
    headerFields,
    backFields,
    colorPreset: state.colorPreset || resolveColorPreset(state.brandColor, state.accentColor),
  };

  if (secondaryFields.length > 0) {
    payload["secondaryFields"] = secondaryFields;
  }

  const effectiveStrip = state.stripUrl || state.stripDataUri;
  if (effectiveStrip) {
    payload["stripURL"] = effectiveStrip;
  } else {
    payload["primaryFields"] = [
      {
        label,
        value,
        changeMessage,
      },
    ];
  }

  if (state.brandColor && /^#[0-9a-fA-F]{6}$/.test(state.brandColor)) {
    payload["color"] = state.brandColor;
  }

  if (state.logoUrl) {
    payload["logoURL"] = state.logoUrl;
  }

  return payload;
}
