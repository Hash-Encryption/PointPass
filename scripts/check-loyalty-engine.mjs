#!/usr/bin/env node
// scripts/check-loyalty-engine.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

function readFile(relPath) {
  const fullPath = path.join(ROOT, relPath);
  assert(fs.existsSync(fullPath), `File exists: ${relPath}`);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
}

console.log("--- PointPass V3: Loyalty Engine Verification ---");

// 1. Verify Server Supabase Admin Client
const serverSupabase = readFile("src/lib/server-supabase.ts");
assert(
  serverSupabase.includes("createAdminSupabaseClient"),
  "src/lib/server-supabase.ts exports createAdminSupabaseClient",
);

// 2. Verify Unified Free/Pro Tier Engine in src/lib/wallet-tier.ts
const walletTier = readFile("src/lib/wallet-tier.ts");
for (const symbol of [
  "FREE_TIER_PRESETS",
  "nearestFreeColorPreset",
  "resolveRestaurantBranding",
  "serializePassTemplateMeta",
  "parsePassTemplateMeta",
]) {
  assert(walletTier.includes(symbol), `src/lib/wallet-tier.ts defines ${symbol}`);
}

for (const preset of ["orange", "red", "blue", "purple", "dark", "green"]) {
  assert(
    walletTier.includes(preset),
    `src/lib/wallet-tier.ts includes canonical Free Tier preset "${preset}"`,
  );
}

// 3. Verify Wallet Payload Schema Compliance in src/lib/wallet-payload.ts
const walletPayload = readFile("src/lib/wallet-payload.ts");
for (const field of [
  "headerFields",
  "primaryFields",
  "secondaryFields",
  "barcodeAltText",
  "backFields",
  "notification",
  "colorPreset",
]) {
  assert(
    walletPayload.includes(field),
    `src/lib/wallet-payload.ts builds WalletWallet V3 field "${field}"`,
  );
}

assert(
  !/auxiliaryFields\s*:/.test(walletPayload),
  "src/lib/wallet-payload.ts strictly excludes forbidden auxiliaryFields property",
);
assert(
  !/\baltText\s*:/.test(walletPayload),
  "src/lib/wallet-payload.ts strictly excludes forbidden altText property (uses barcodeAltText)",
);

// 4. Verify Server Functions in src/lib/wallet.functions.ts
const walletFunctions = readFile("src/lib/wallet.functions.ts");
assert(
  walletFunctions.includes("createAdminSupabaseClient"),
  "src/lib/wallet.functions.ts uses createAdminSupabaseClient",
);
assert(
  walletFunctions.includes("grant_welcome_stamp"),
  "src/lib/wallet.functions.ts grants 1/N welcome stamp via grant_welcome_stamp",
);
assert(
  walletFunctions.includes("cashier_lookup_pass"),
  "src/lib/wallet.functions.ts uses cashier_lookup_pass RPC for POS lookup",
);
assert(
  walletFunctions.includes("name_en") && walletFunctions.includes("name_ar"),
  "src/lib/wallet.functions.ts queries schema-safe name_en and name_ar columns",
);
assert(
  !/\bb\.name\b/.test(walletFunctions),
  "src/lib/wallet.functions.ts never references nonexistent b.name column",
);

// 5. Verify Open Restaurant Sync Migration
const migrationPath = "supabase/migrations/20261112000000_open_restaurant_pass_sync.sql";
const migrationSql = readFile(migrationPath);
assert(
  migrationSql.includes("get_public_business_by_slug"),
  `${migrationPath} defines get_public_business_by_slug`,
);
assert(
  !/\bb\.name\b/.test(migrationSql),
  `${migrationPath} uses b.name_en / b.name_ar and never b.name`,
);

if (failures > 0) {
  console.error(`\n💥 Loyalty Engine check failed with ${failures} error(s).`);
  process.exit(1);
}

console.log("\n🎉 PointPass V3 Loyalty Engine checks passed (100%)!");
process.exit(0);
