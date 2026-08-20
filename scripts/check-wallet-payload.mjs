import assert from "node:assert/strict";
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
