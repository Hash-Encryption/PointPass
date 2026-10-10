import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWalletPassPayload } from "../src/lib/wallet-payload.ts";

const payload = buildWalletPassPayload({
  serial: "pass-1",
  businessName: "PointPass Cafe",
  offer: "Free coffee",
  programType: "stamp",
  stamps: 3,
  points: 0,
  morphed: false,
  targetStamps: 9,
});

assert.equal(payload.barcodeValue, "pass-1");
assert.equal(payload.primaryFields[0].value, "3/9");
assert.equal(payload.backFields[0].changeMessage, "%@");

const coupon = buildWalletPassPayload({
  serial: "coupon-1",
  businessName: "PointPass Cafe",
  offer: "20% off",
  programType: "coupon_morph",
  stamps: 0,
  points: 0,
  morphed: false,
  targetStamps: 6,
});
assert.equal(coupon.primaryFields[0].label, "OFFER");
assert.equal(coupon.primaryFields[0].value, "20% off");

const morphed = buildWalletPassPayload({
  serial: "coupon-1",
  businessName: "PointPass Cafe",
  offer: "20% off",
  programType: "coupon_morph",
  stamps: 2,
  points: 0,
  morphed: true,
  targetStamps: 6,
});
assert.equal(morphed.primaryFields[0].label, "STAMPS");
assert.equal(morphed.primaryFields[0].value, "2/6");

const points = buildWalletPassPayload({
  serial: "points-1",
  businessName: "PointPass Cafe",
  offer: "Free coffee",
  programType: "points",
  stamps: 0,
  points: 150,
  morphed: false,
  targetStamps: 6,
});
assert.equal(points.primaryFields[0].label, "POINTS");
assert.equal(points.primaryFields[0].value, "150");

// Assert visual strip & template branding (Apple Wallet storeCard style)
const stripPass = buildWalletPassPayload({
  serial: "strip-pass-1",
  businessName: "Specialty Roaster",
  offer: "Free coffee of your choice",
  programType: "stamp",
  stamps: 3,
  points: 0,
  morphed: false,
  targetStamps: 8,
  brandColor: "#1A1412",
  accentColor: "#D97706",
  stripDataUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
});
assert.equal(stripPass.color, "#1A1412");
assert.equal(stripPass.stripURL, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...");
assert.equal(stripPass.primaryFields, undefined);
assert.equal(stripPass.headerFields[0].label, "STAMPS");
assert.equal(stripPass.headerFields[0].value, "3/8");
assert.equal(stripPass.secondaryFields[0].label, "REWARD");
assert.equal(stripPass.secondaryFields[0].value, "Free coffee of your choice");

// Assert HTTPS public stripURL takes precedence
const httpsStripPass = buildWalletPassPayload({
  serial: "strip-pass-https",
  businessName: "Specialty Roaster",
  offer: "Free coffee",
  programType: "stamp",
  stamps: 8,
  points: 0,
  morphed: false,
  targetStamps: 8,
  stripUrl: "https://pointpass.me/api/strip/bayroast.png?stamps=8&target=8",
  stripDataUri: "data:image/png;base64,fallback...",
});
assert.equal(
  httpsStripPass.stripURL,
  "https://pointpass.me/api/strip/bayroast.png?stamps=8&target=8",
);
assert.equal(httpsStripPass.headerFields[0].value, "8/8");

const walletSource = readFileSync(
  new URL("../src/lib/wallet.functions.ts", import.meta.url),
  "utf8",
);
const scanSource = readFileSync(new URL("../src/routes/scan.tsx", import.meta.url), "utf8");
const actionRpc = walletSource.indexOf('.rpc("cashier_apply_action"');
const walletUpdate = walletSource.indexOf('"PUT",', actionRpc);
assert.ok(actionRpc > 0 && walletUpdate > actionRpc, "Database action must precede wallet sync");
assert.ok(
  walletSource.slice(actionRpc, walletUpdate).includes("recorded: false as const"),
  "Rejected database actions must report not recorded",
);
assert.ok(
  walletSource.slice(walletUpdate).includes("recorded: true as const"),
  "Wallet failures after the RPC commit must report recorded",
);
assert.ok(walletSource.includes("status: 502"), "Network failures must return a wallet sync error");
assert.ok(scanSource.includes("cashierSession"), "Scan flow must retain the cashier session");
assert.ok(scanSource.includes('setPin("")'), "Scan flow must discard the PIN after unlock");
assert.ok(
  scanSource.includes("Action recorded, but wallet sync is unavailable"),
  "Scan flow must warn when a recorded action fails wallet sync",
);
