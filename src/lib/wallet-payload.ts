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

  return {
    barcodeValue: state.serial,
    barcodeFormat: "QR",
    logoText: state.businessName,
    description: `Loyalty card for ${state.businessName}`,
    primaryFields: [
      {
        label,
        value,
        changeMessage: isPoints ? "You now have %@ points" : "Your loyalty balance is now %@",
      },
    ],
    backFields: [
      {
        label: "NOTIFICATIONS",
        value: state.notification ?? " ",
        changeMessage: "%@",
      },
    ],
    colorPreset: "green",
  };
}
