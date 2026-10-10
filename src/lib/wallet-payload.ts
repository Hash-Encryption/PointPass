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
  } else {
    payload["colorPreset"] = "green";
  }

  if (state.logoUrl) {
    payload["logoURL"] = state.logoUrl;
  }

  return payload;
}
