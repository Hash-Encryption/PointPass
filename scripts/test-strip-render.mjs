import assert from "node:assert/strict";
import fs from "node:fs";
import { generateStampStripPng } from "../src/lib/strip-generator.ts";
import server from "../src/server.ts";

// 1. Coffee (☕, 7 stamps target, 3 stamped)
const coffeeBuf = generateStampStripPng({
  targetStamps: 7,
  stamps: 3,
  brandColor: "#1A1412",
  accentColor: "#D97706",
  stampIcon: "☕",
});
fs.writeFileSync("sample-coffee.png", coffeeBuf);
console.log("Saved sample-coffee.png, size:", coffeeBuf.length, "bytes");

// 2. Burger (🍔, 5 stamps target, 2 stamped)
const burgerBuf = generateStampStripPng({
  targetStamps: 5,
  stamps: 2,
  brandColor: "#18181B",
  accentColor: "#EF4444",
  stampIcon: "🍔",
});
fs.writeFileSync("sample-burger.png", burgerBuf);
console.log("Saved sample-burger.png, size:", burgerBuf.length, "bytes");

// 3. Blank (⭐, 8 stamps target, 4 stamped)
const blankBuf = generateStampStripPng({
  targetStamps: 8,
  stamps: 4,
  brandColor: "#121214",
  accentColor: "#10B981",
  stampIcon: "⭐",
});
fs.writeFileSync("sample-blank.png", blankBuf);
console.log("Saved sample-blank.png, size:", blankBuf.length, "bytes");

// 4. Reward Unlocked (☕, 7 of 7 stamps reached)
const rewardBuf = generateStampStripPng({
  targetStamps: 7,
  stamps: 7,
  brandColor: "#1A1412",
  accentColor: "#D97706",
  stampIcon: "☕",
});
fs.writeFileSync("sample-reward-unlocked.png", rewardBuf);
console.log("Saved sample-reward-unlocked.png, size:", rewardBuf.length, "bytes");

// 5. Test HTTP server endpoint in src/server.ts
const req = new Request(
  "https://pointpass.me/api/strip/bayroast.png?stamps=3&target=7&brand=%231A1412&accent=%23D97706&icon=%E2%98%95",
);
const res = await server.fetch(req, {}, {});
assert.equal(res.status, 200, "Server route must return 200 OK");
assert.equal(res.headers.get("Content-Type"), "image/png", "Content-Type must be image/png");
const resBytes = new Uint8Array(await res.arrayBuffer());
assert.ok(resBytes.length > 1000, "Response must contain valid PNG binary data");
// Verify PNG magic bytes: 0x89, 'P', 'N', 'G'
assert.equal(resBytes[0], 0x89);
assert.equal(resBytes[1], 0x50);
assert.equal(resBytes[2], 0x4e);
assert.equal(resBytes[3], 0x47);
console.log(
  "Verified /api/strip/ HTTP endpoint: 200 OK, Content-Type: image/png, PNG header valid!",
);
