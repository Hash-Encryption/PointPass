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
};

export type WalletColorPreset = "dark" | "blue" | "green" | "red" | "purple" | "orange";

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

export function buildBaselineWalletPassPayload(state: WalletPassState): Record<string, unknown> {
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

  const payload: Record<string, unknown> = {
    barcodeValue: state.serial,
    barcodeFormat: "QR",
    logoText: state.businessName,
    description: `Loyalty card for ${state.businessName}`,
    primaryFields: [
      {
        label,
        value,
        changeMessage,
      },
    ],
    backFields: [
      {
        label: "NOTIFICATIONS",
        value: state.notification ?? " ",
        changeMessage: "%@",
      },
    ],
    colorPreset: resolveColorPreset(state.brandColor, state.accentColor),
  };

  if (state.offer) {
    payload["secondaryFields"] = [
      {
        label: isCoupon ? "DETAILS" : "REWARD",
        value: state.offer,
      },
    ];
  }

  return payload;
}

export function buildWalletPassPayload(state: WalletPassState) {
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

  // Base payload
  const payload: Record<string, unknown> = {
    barcodeValue: state.serial,
    barcodeFormat: "QR",
    logoText: state.businessName,
    description: `Loyalty card for ${state.businessName}`,
    headerFields,
    backFields,
  };

  if (secondaryFields.length > 0) {
    payload["secondaryFields"] = secondaryFields;
  }

  // When a visual strip is provided, Apple Wallet uses the storeCard layout.
  // In storeCard passes, Apple Wallet renders the strip image across the card.
  // We keep primaryFields when stripDataUri is absent so generic layout passes have a prominent value.
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

  // Visual theming: Custom brand hex or fallback preset
  if (state.brandColor && /^#[0-9a-fA-F]{6}$/.test(state.brandColor)) {
    payload["color"] = state.brandColor;
  }
  payload["colorPreset"] = resolveColorPreset(state.brandColor, state.accentColor);

  if (state.logoUrl) {
    payload["logoURL"] = state.logoUrl;
  }

  return payload;
}
