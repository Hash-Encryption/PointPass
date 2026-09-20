import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

console.log("Checking PointPass Phase 5 Production Readiness & Certification Contract...");

// 1. Zero Browser/Client-Side Service-Role Key Usage
const supabaseClientSrc = readFileSync(new URL("../src/lib/supabase.ts", import.meta.url), "utf8");
assert.ok(
  !supabaseClientSrc.toLowerCase().includes("service_role"),
  "Browser Supabase client must never reference or expose service_role",
);

const serverSupabaseSrc = readFileSync(
  new URL("../src/lib/server-supabase.ts", import.meta.url),
  "utf8",
);
assert.ok(
  !serverSupabaseSrc.toLowerCase().includes("service_role"),
  "Server Supabase helper must use anonKey with caller authorization token, not service_role",
);

// 2. Critical Protected Routes Exist
const criticalRoutes = [
  "../src/routes/dashboard.tsx",
  "../src/routes/scan.tsx",
  "../src/routes/join.$slug.tsx",
  "../src/routes/onboarding.tsx",
  "../src/routes/admin.tsx",
];

for (const relPath of criticalRoutes) {
  const fileUrl = new URL(relPath, import.meta.url);
  assert.ok(existsSync(fileUrl), `Critical application route must exist: ${relPath}`);
}

// 3. Cashier Dashboard Redirect
const dashboardRouteSrc = readFileSync(
  new URL("../src/routes/dashboard.tsx", import.meta.url),
  "utf8",
);
assert.ok(
  dashboardRouteSrc.includes("isCashierUser") && dashboardRouteSrc.includes('to="/scan"'),
  "Dashboard route must enforce Cashier redirect to /scan",
);

// 4. Onboarding Role Access Restrictions
const onboardingRouteSrc = readFileSync(
  new URL("../src/routes/onboarding.tsx", import.meta.url),
  "utf8",
);
assert.ok(
  onboardingRouteSrc.includes("isCashierUser") && onboardingRouteSrc.includes('to="/scan"'),
  "Onboarding route must redirect Cashier to /scan",
);
assert.ok(
  onboardingRouteSrc.includes("isManagerUser") && onboardingRouteSrc.includes('to="/dashboard"'),
  "Onboarding route must redirect Manager to /dashboard",
);
assert.ok(
  onboardingRouteSrc.includes("isSuperAdmin") && onboardingRouteSrc.includes('to="/admin"'),
  "Onboarding route must redirect Super Admin to /admin",
);

// 5. Billing Provider Truthfully Unconfigured
const planBillingPanelSrc = readFileSync(
  new URL("../src/components/dashboard/PlanBillingPanel.tsx", import.meta.url),
  "utf8",
);
const billingFunctionsSrc = readFileSync(
  new URL("../src/lib/billing.functions.ts", import.meta.url),
  "utf8",
);
assert.ok(
  planBillingPanelSrc.includes("الدفع الإلكتروني غير مفعّل") ||
    planBillingPanelSrc.includes("Online billing is not configured"),
  "Billing UI must truthfully state online billing is unconfigured",
);
assert.ok(
  billingFunctionsSrc.includes("provider_configured"),
  "Billing state must expose truthful provider_configured field",
);

// 6. Requested Plan Separated from Effective Entitlement
assert.ok(
  billingFunctionsSrc.includes("requestedPlanCode") && billingFunctionsSrc.includes("planCode"),
  "Billing domain must keep requestedPlanCode strictly separate from planCode",
);

// 7. Phase 5 Observability Helper Exists
const observabilityPath = new URL("../src/lib/observability.ts", import.meta.url);
assert.ok(existsSync(observabilityPath), "Phase 5 observability module must exist");
const observabilitySrc = readFileSync(observabilityPath, "utf8");
assert.ok(
  observabilitySrc.includes("captureAppError") && observabilitySrc.includes("sanitizeLogMetadata"),
  "Observability must expose captureAppError and sanitizeLogMetadata",
);

// 8. Observability Performs Sensitive-Field Redaction
assert.ok(
  observabilitySrc.includes("access_token") || observabilitySrc.includes("accessToken"),
  "Observability must scrub access tokens",
);
assert.ok(
  observabilitySrc.includes("password") && observabilitySrc.includes("pin"),
  "Observability must scrub passwords and PINs",
);
assert.ok(
  observabilitySrc.includes("service_role") || observabilitySrc.includes("service_?role"),
  "Observability must scrub service_role keys",
);

// 9. Root Failure States Contain Arabic/RTL Support
const rootRouteSrc = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
assert.ok(
  rootRouteSrc.includes("الصفحة غير موجودة") && rootRouteSrc.includes("تعذر تحميل الصفحة"),
  "Root error states must provide Arabic-first messaging",
);

// 10. SSR Error Page Contains Arabic/RTL Support
const errorPageSrc = readFileSync(new URL("../src/lib/error-page.ts", import.meta.url), "utf8");
assert.ok(
  errorPageSrc.includes('dir="rtl"') && errorPageSrc.includes('lang="ar"'),
  "SSR catastrophic error page must be configured with dir=rtl and lang=ar",
);
assert.ok(
  errorPageSrc.includes("تعذر تحميل الصفحة") && errorPageSrc.includes("إعادة المحاولة"),
  "SSR error page must provide Arabic-first messaging and retry action",
);

// 11. .env.example Does Not Contain Real Secrets
const envExampleSrc = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
assert.ok(
  !envExampleSrc.includes("eyJh") && !envExampleSrc.includes("sk_live_"),
  ".env.example must only contain placeholders, no real secrets or JWTs",
);

// 12. Phase 1–4 Verification Scripts Still Exist
const existingChecks = [
  "../scripts/check-role-location-foundation.mjs",
  "../scripts/check-locations-team.mjs",
  "../scripts/check-business-operations.mjs",
  "../scripts/check-loyalty-engine.mjs",
  "../scripts/check-analytics.mjs",
  "../scripts/check-wallet-payload.mjs",
  "../scripts/check-phase3-experience.mjs",
  "../scripts/check-phase4-onboarding-billing.mjs",
];

for (const checkScript of existingChecks) {
  assert.ok(
    existsSync(new URL(checkScript, import.meta.url)),
    `Pre-existing phase check script must be preserved: ${checkScript}`,
  );
}

// 13. Phase 5 Forward Migration Exists
const phase5MigrationPath = new URL(
  "../supabase/migrations/20260920050000_phase5_production_hardening.sql",
  import.meta.url,
);
assert.ok(existsSync(phase5MigrationPath), "Phase 5 forward database migration must exist");
const phase5MigrationSrc = readFileSync(phase5MigrationPath, "utf8");
assert.ok(
  phase5MigrationSrc.includes("idx_businesses_owner_id") &&
    phase5MigrationSrc.includes("idx_pass_transactions_branch_created"),
  "Phase 5 migration must install justified performance indexes",
);
assert.ok(
  phase5MigrationSrc.includes("claim_public_pass"),
  "Phase 5 migration must harden claim_public_pass with abuse backstop",
);

// 14. Phase 5 SQL Verification Exists
const phase5SqlTestPath = new URL(
  "../supabase/tests/verify_phase5_production_hardening.sql",
  import.meta.url,
);
assert.ok(existsSync(phase5SqlTestPath), "Phase 5 SQL verification suite must exist");

console.log("All Phase 5 Production Readiness contract checks passed successfully.");
