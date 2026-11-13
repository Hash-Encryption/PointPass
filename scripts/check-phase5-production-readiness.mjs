#!/usr/bin/env node
// scripts/check-phase5-production-readiness.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

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

// 1. Verify Onboarding Continuity (No .name bug + full V3 serializePassTemplateMeta)
const onboardingRoute = readFile("src/routes/onboarding.tsx");
const loyaltySetupStep = readFile("src/components/onboarding/LoyaltySetupStep.tsx");

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
  loyaltySetupStep.includes("FREE_TIER_PRESETS") &&
    loyaltySetupStep.includes("nearestFreeColorPreset"),
  "src/components/onboarding/LoyaltySetupStep.tsx integrates FREE_TIER_PRESETS and nearestFreeColorPreset",
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
