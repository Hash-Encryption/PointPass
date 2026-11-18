#!/usr/bin/env node
// scripts/check-phase5-production-readiness.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getDefaultRewardForStampIcon, isCanonicalDefaultReward } from "../src/lib/wallet-tier.ts";

const ROOT = process.cwd();
const allowDirty = process.argv.includes("--allow-dirty");
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

console.log("--- PointPass V3: Phase 5 Production Readiness Verification ---");

// 1. Verify Onboarding Continuity (No .name bug + full V3 serializePassTemplateMeta + Tenant Isolation + Icon Rewards)
const onboardingRoute = readFile("src/routes/onboarding.tsx");
const dashboardRoute = readFile("src/routes/dashboard.tsx");
const loyaltySetupStep = readFile("src/components/onboarding/LoyaltySetupStep.tsx");
const walletFunctions = readFile("src/lib/wallet.functions.ts");
const walletTier = readFile("src/lib/wallet-tier.ts");

assert(
  onboardingRoute.includes("name_en") && onboardingRoute.includes("name_ar"),
  "src/routes/onboarding.tsx persists schema-safe name_en and name_ar",
);
assert(
  onboardingRoute.includes("serializePassTemplateMeta"),
  "src/routes/onboarding.tsx serializes V3 template_id via serializePassTemplateMeta",
);
assert(
  onboardingRoute.includes("nearestFreeColorPreset") &&
    onboardingRoute.includes("FREE_TIER_PRESETS"),
  "src/routes/onboarding.tsx syncs Free Tier colorPreset and brand_color",
);
assert(
  !/\.select\([^)]*\bname\b(?![_a-zA-Z])/.test(onboardingRoute),
  "src/routes/onboarding.tsx never selects a nonexistent name column on public.businesses",
);
assert(
  onboardingRoute.includes('.eq("owner_id", user!.id)') ||
    onboardingRoute.includes('.eq("owner_id", user.id)'),
  "src/routes/onboarding.tsx explicitly filters businesses query by owner_id",
);
assert(
  onboardingRoute.includes("saveOnboardingProgressServerFn"),
  "src/routes/onboarding.tsx uses saveOnboardingProgressServerFn",
);
assert(
  dashboardRoute.includes('.eq("owner_id", user!.id)') &&
    dashboardRoute.includes('.eq("business_id", business!.id)'),
  "src/routes/dashboard.tsx explicitly scopes merchant queries by owner_id and business_id",
);
assert(
  walletFunctions.includes("export const saveOnboardingProgressServerFn") &&
    walletFunctions.includes("createAdminSupabaseClient()") &&
    walletFunctions.includes("auth.getUser(data.accessToken)") &&
    walletFunctions.includes("existing.owner_id === user.id") &&
    walletFunctions.includes('businessUpdates["target_stamps"]') &&
    walletFunctions.includes('businessUpdates["offer_en"]') &&
    walletFunctions.includes('businessUpdates["offer_ar"]') &&
    walletFunctions.includes('from("business_onboarding").upsert'),
  "src/lib/wallet.functions.ts implements ownership-verified saveOnboardingProgressServerFn with schema-valid columns",
);
assert(
  walletFunctions.includes('.eq("owner_id", user.id)'),
  "src/lib/wallet.functions.ts enforces owner_id scoping on merchant mutations/campaigns",
);

assert(
  loyaltySetupStep.includes("FREE_TIER_PRESETS") &&
    loyaltySetupStep.includes("nearestFreeColorPreset") &&
    loyaltySetupStep.includes("saveOnboardingProgressServerFn") &&
    loyaltySetupStep.includes("getDefaultRewardForStampIcon") &&
    loyaltySetupStep.includes("isCanonicalDefaultReward"),
  "src/components/onboarding/LoyaltySetupStep.tsx integrates FREE_TIER_PRESETS, saveOnboardingProgressServerFn, and canonical icon reward auto-sync",
);
assert(
  walletTier.includes("STAMP_ICON_DEFAULT_REWARDS") &&
    walletTier.includes("Free Specialty Coffee ☕") &&
    walletTier.includes("Free Classic Burger 🍔") &&
    walletTier.includes("Free Fresh Pastry 🥐") &&
    walletTier.includes("Free Haircut & Styling ✂️") &&
    walletTier.includes("Free Full Car Wash 🚗") &&
    walletTier.includes("Free VIP Reward ⭐"),
  "src/lib/wallet-tier.ts defines canonical STAMP_ICON_DEFAULT_REWARDS map",
);
assert(
  getDefaultRewardForStampIcon("🍔").ar === "برجر كلاسيك مجاني 🍔" &&
    getDefaultRewardForStampIcon("🍔").en === "Free Classic Burger 🍔" &&
    getDefaultRewardForStampIcon("☕").ar === "قهوة مختصة مجانية ☕" &&
    getDefaultRewardForStampIcon("croissant").en === "Free Fresh Pastry 🥐" &&
    getDefaultRewardForStampIcon("scissors").en === "Free Haircut & Styling ✂️" &&
    getDefaultRewardForStampIcon("carwash").ar === "غسيل سيارة مجاني شامل 🚗" &&
    getDefaultRewardForStampIcon("⭐").en === "Free VIP Reward ⭐",
  "getDefaultRewardForStampIcon resolves exact canonical EN/AR rewards for every icon key and emoji",
);
assert(
  isCanonicalDefaultReward("Free Full Car Wash 🚗", "غسيل سيارة مجاني شامل 🚗") === true &&
    isCanonicalDefaultReward("", "") === true &&
    isCanonicalDefaultReward("Free Custom Matcha", "ماتشا خاصة مجانية") === false,
  "isCanonicalDefaultReward auto-syncs default/empty rewards while preserving custom merchant text",
);

// 2. Verify Client Route & Component Isolation (Zero Node / Server PNG imports)
const clientFiles = [
  "src/components/PassPreview.tsx",
  "src/components/onboarding/LoyaltySetupStep.tsx",
  "src/routes/scan.tsx",
  "src/routes/dashboard.tsx",
  "src/routes/admin.tsx",
  "src/routes/join.$slug.tsx",
  "src/routes/onboarding.tsx",
];

const forbiddenClientPatterns = [
  { regex: /from\s+['"][^'"]*strip-generator['"]/, label: "strip-generator" },
  { regex: /from\s+['"]pngjs['"]/, label: "pngjs" },
  { regex: /from\s+['"](?:node:)?zlib['"]/, label: "zlib" },
  { regex: /from\s+['"](?:node:)?buffer['"]/, label: "buffer" },
];

for (const relPath of clientFiles) {
  const source = readFile(relPath);
  for (const { regex, label } of forbiddenClientPatterns) {
    assert(
      !regex.test(source),
      `Client file ${relPath} does NOT import server-only module "${label}"`,
    );
  }
}

// 3. Verify Production Build Output & Cloudflare Pages Bundle Isolation
const distDir = path.join(ROOT, "dist");
if (fs.existsSync(distDir)) {
  const clientAssetsDir = path.join(distDir, "assets");
  if (fs.existsSync(clientAssetsDir)) {
    const jsFiles = fs.readdirSync(clientAssetsDir).filter((f) => f.endsWith(".js"));
    assert(jsFiles.length > 0, "dist/assets contains compiled client JS chunks");

    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(clientAssetsDir, file), "utf8");
      assert(
        !content.includes("pngjs") && !content.includes("strip-generator"),
        `Client bundle chunk ${file} is free of pngjs and strip-generator`,
      );
    }
  }

  const wranglerConfigExists =
    fs.existsSync(path.join(distDir, "_worker.js")) ||
    fs.existsSync(path.join(ROOT, "wrangler.json")) ||
    fs.existsSync(path.join(ROOT, "wrangler.toml"));
  assert(wranglerConfigExists, "Cloudflare Pages worker / wrangler configuration exists");
} else {
  console.log(
    "ℹ️ Note: dist/ directory not found yet — run `npm run build` before final release check.",
  );
}

// 4. Verify Git Working Tree Status (unless --allow-dirty is passed during pre-commit)
if (!allowDirty) {
  try {
    const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
    assert(status.length === 0, "Git working tree is 100% clean (ready for production push)");
  } catch {
    console.warn("⚠️ Could not inspect git status.");
  }
}

if (failures > 0) {
  console.error(`\n💥 Phase 5 Production Readiness check failed with ${failures} error(s).`);
  process.exit(1);
}

console.log("\n🎉 PointPass V3 Phase 5 Production Readiness checks passed (100%)!");
process.exit(0);
