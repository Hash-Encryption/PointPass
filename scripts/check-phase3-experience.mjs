import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

console.log("Checking PointPass Phase 3 Experience & Architecture Contract...");

const migration = readFileSync(
  new URL("../supabase/migrations/20260920030000_phase3_customers_rewards.sql", import.meta.url),
  "utf8",
);
const testSuite = readFileSync(
  new URL("../supabase/tests/verify_phase3_customers_rewards.sql", import.meta.url),
  "utf8",
);
const joinSlug = readFileSync(new URL("../src/routes/join.$slug.tsx", import.meta.url), "utf8");
const walletFn = readFileSync(new URL("../src/lib/wallet.functions.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/routes/dashboard.tsx", import.meta.url), "utf8");
const scan = readFileSync(new URL("../src/routes/scan.tsx", import.meta.url), "utf8");

// 1. Fake Guest Phone Elimination
assert.ok(
  !joinSlug.includes("Guest-") && !joinSlug.includes("Math.random"),
  "Active code in join.$slug.tsx must not generate fake Guest-#### phones",
);

// Search all src files for any new Guest- generation
const srcFiles = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(p);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) srcFiles.push(p);
  }
}
walk(new URL("../src", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
for (const file of srcFiles) {
  const content = readFileSync(file, "utf8");
  assert.ok(
    !content.includes("Guest-${Math.random"),
    `File ${file} must not contain fake Guest-${"${Math.random"} generation`,
  );
}

// 2. Pass Instances Phone Nullable in Migration
assert.ok(
  migration.includes("alter table public.pass_instances alter column phone drop not null"),
  "Migration must drop NOT NULL constraint on pass_instances.phone for truthful anonymous customers",
);

// 3. Server-side Phone Normalization
assert.ok(
  migration.includes("create or replace function public.normalize_customer_phone"),
  "Migration must define normalize_customer_phone function",
);

// 4. Repeat Join Idempotency & Advisory Lock
assert.ok(
  migration.includes("pg_advisory_xact_lock"),
  "claim_public_pass must use transactional advisory lock for repeat join concurrency safety",
);
assert.ok(
  migration.includes("is_resumed"),
  "claim_public_pass must distinguish new claims from resumed passes",
);

// 5. Customer RPCs Exist and Enforce Security
assert.ok(
  migration.includes("create or replace function public.operations_customers_list"),
  "Migration must define operations_customers_list RPC",
);
assert.ok(
  migration.includes("create or replace function public.operations_customer_detail"),
  "Migration must define operations_customer_detail RPC",
);
assert.ok(
  migration.includes("create or replace function public.operations_dashboard_summary"),
  "Migration must define operations_dashboard_summary RPC",
);
assert.ok(
  migration.includes("revoke all on function public.operations_customers_list") &&
    migration.includes("revoke all on function public.operations_customer_detail"),
  "Customer RPCs must revoke public/anon execution",
);

// 6. Manager Anti-Leakage Invariant
assert.ok(
  migration.includes("null::integer as current_stamps") &&
    migration.includes("null::integer as current_points"),
  "Manager customer list must set current_stamps and current_points to NULL to prevent cross-location balance leakage",
);

// 7. Cashier Direct Route & Unlock Flows
assert.ok(
  dashboard.includes('to="/scan"') || dashboard.includes('Navigate to="/scan"'),
  "Cashier visiting /dashboard must navigate directly to /scan",
);
assert.ok(
  scan.includes("cashier_unlock_staff") && scan.includes("cashier_unlock"),
  "Both modern staff and legacy cashier unlock flows must be preserved in scan.tsx",
);

// 8. Local QR Generation (No api.qrserver.com)
assert.ok(
  !dashboard.includes("api.qrserver.com"),
  "dashboard.tsx must not rely on api.qrserver.com",
);

// 9. Wallet Resilience
assert.ok(
  walletFn.includes("createWalletPass") && walletFn.includes("updateWalletPass"),
  "Wallet server functions must remain intact",
);

// 10. Analytics preserved
assert.ok(
  dashboard.includes("AnalyticsPanel"),
  "AnalyticsPanel must remain integrated in dashboard",
);

console.log("All Phase 3 Architecture & Contract checks passed successfully.");
