import assert from "node:assert/strict";
import fs from "node:fs";
import { generateStampStripPng } from "../src/lib/strip-generator.ts";
import server from "../src/server.ts";

function verifyPngBuffer(buf, label) {
  assert.ok(buf instanceof Buffer || buf instanceof Uint8Array, `${label}: must be Buffer`);
  assert.ok(buf.length > 1000, `${label}: size must be > 1000 bytes`);
  assert.equal(buf[0], 0x89, `${label}: PNG magic byte 0`);
  assert.equal(buf[1], 0x50, `${label}: PNG magic byte 1 (P)`);
  assert.equal(buf[2], 0x4e, `${label}: PNG magic byte 2 (N)`);
  assert.equal(buf[3], 0x47, `${label}: PNG magic byte 3 (G)`);
}

// 1. Pizzatown Style (🍔 Burger, 5 stamps target, 2 stamped)
const pizzatownBuf = generateStampStripPng({
  targetStamps: 5,
  stamps: 2,
  brandColor: "#18181B",
  accentColor: "#EF4444",
  stampIcon: "🍔",
  stripStyle: "pizzatown",
});
verifyPngBuffer(pizzatownBuf, "Pizzatown");
fs.writeFileSync("sample-pizzatown.png", pizzatownBuf);
console.log("Verified Pizzatown strip style (size:", pizzatownBuf.length, "bytes)");

// 2. Nails White Style (✂️ Salon, 6 stamps target, 3 stamped)
const nailsWhiteBuf = generateStampStripPng({
  targetStamps: 6,
  stamps: 3,
  brandColor: "#0F172A",
  accentColor: "#8B5CF6",
  stampIcon: "✂️",
  stripStyle: "nails_white",
});
verifyPngBuffer(nailsWhiteBuf, "Nails White");
fs.writeFileSync("sample-nails-white.png", nailsWhiteBuf);
console.log("Verified Nails White strip style (size:", nailsWhiteBuf.length, "bytes)");

// 3. Linear Dark Style (☕ Coffee, 7 stamps target, 4 stamped)
const linearDarkBuf = generateStampStripPng({
  targetStamps: 7,
  stamps: 4,
  brandColor: "#1A1412",
  accentColor: "#D97706",
  stampIcon: "☕",
  stripStyle: "linear_dark",
});
verifyPngBuffer(linearDarkBuf, "Linear Dark");
fs.writeFileSync("sample-linear-dark.png", linearDarkBuf);
console.log("Verified Linear Dark strip style (size:", linearDarkBuf.length, "bytes)");

// 4. Reward Unlocked (☕, 7 of 7 stamps reached)
const rewardBuf = generateStampStripPng({
  targetStamps: 7,
  stamps: 7,
  brandColor: "#1A1412",
  accentColor: "#D97706",
  stampIcon: "☕",
  stripStyle: "pizzatown",
});
verifyPngBuffer(rewardBuf, "Reward Unlocked");
fs.writeFileSync("sample-reward-unlocked.png", rewardBuf);
console.log("Verified Reward Unlocked state (size:", rewardBuf.length, "bytes)");

// 5. Test HTTP server endpoint in src/server.ts with style param
const req = new Request(
  "https://pointpass.me/api/strip/bayroast.png?stamps=3&target=7&brand=%231A1412&accent=%23D97706&icon=%E2%98%95&style=nails_white",
);
const res = await server.fetch(req, {}, {});
assert.equal(res.status, 200, "Server route must return 200 OK");
assert.equal(res.headers.get("Content-Type"), "image/png", "Content-Type must be image/png");
const resBytes = new Uint8Array(await res.arrayBuffer());
verifyPngBuffer(resBytes, "Server HTTP Endpoint");
console.log(
  "Verified /api/strip/ HTTP endpoint: 200 OK, Content-Type: image/png, PNG header valid!",
);

// Cleanup temporary files
[
  "sample-coffee.png",
  "sample-burger.png",
  "sample-blank.png",
  "sample-pizzatown.png",
  "sample-nails-white.png",
  "sample-linear-dark.png",
  "sample-reward-unlocked.png",
].forEach((f) => {
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
  }
});
console.log("Cleaned up all temporary sample images.");
