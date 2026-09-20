import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

console.log("Checking PointPass Phase 4 Onboarding, Plans, and Billing Contract...");

const migrationPath = new URL(
  "../supabase/migrations/20260920040000_phase4_onboarding_billing.sql",
  import.meta.url,
);
const migration = readFileSync(migrationPath, "utf8");

const testSuitePath = new URL(
  "../supabase/tests/verify_phase4_onboarding_billing.sql",
  import.meta.url,
);
const testSuite = readFileSync(testSuitePath, "utf8");

const authSignIn = readFileSync(
  new URL("../src/components/AuthSignIn.tsx", import.meta.url),
  "utf8",
);
const onboardingRoute = readFileSync(
  new URL("../src/routes/onboarding.tsx", import.meta.url),
  "utf8",
);
const dashboardRoute = readFileSync(
  new URL("../src/routes/dashboard.tsx", import.meta.url),
  "utf8",
);
const scanRoute = readFileSync(new URL("../src/routes/scan.tsx", import.meta.url), "utf8");
const joinRoute = readFileSync(new URL("../src/routes/join.$slug.tsx", import.meta.url), "utf8");
const operationsPanel = readFileSync(
  new URL("../src/components/OperationsPanel.tsx", import.meta.url),
  "utf8",
);
const planBillingPanel = readFileSync(
  new URL("../src/components/dashboard/PlanBillingPanel.tsx", import.meta.url),
  "utf8",
);
const plansLib = readFileSync(new URL("../src/lib/plans.ts", import.meta.url), "utf8");
const onboardingFn = readFileSync(
  new URL("../src/lib/onboarding.functions.ts", import.meta.url),
  "utf8",
);
const billingFn = readFileSync(new URL("../src/lib/billing.functions.ts", import.meta.url), "utf8");
const entitlementsLib = readFileSync(
  new URL("../src/lib/entitlements.ts", import.meta.url),
  "utf8",
);

// 1. Owner signup entry remains available
assert.ok(
  authSignIn.includes('mode === "signup"') && authSignIn.includes("supabase.auth.signUp"),
  "AuthSignIn must retain signup mode for new accounts",
);

// 2. Self-service onboarding route and resumable wiring exist
assert.ok(
  onboardingRoute.includes('createFileRoute("/onboarding")') &&
    onboardingRoute.includes("BusinessSetupStep") &&
    onboardingRoute.includes("PlanSelectionStep") &&
    onboardingRoute.includes("LoyaltySetupStep") &&
    onboardingRoute.includes("RewardSetupStep") &&
    onboardingRoute.includes("MainLocationStep") &&
    onboardingRoute.includes("LaunchStep"),
  "Onboarding route must exist with all 6 modular steps",
);
assert.ok(
  onboardingRoute.includes("business_onboarding") && onboardingRoute.includes("setCurrentStep"),
  "Onboarding must support database-backed resumable step tracking",
);

// 3. Secure bootstrap RPC exists
assert.ok(
  migration.includes("create or replace function public.bootstrap_owner_business"),
  "Migration must install bootstrap_owner_business RPC",
);
assert.ok(
  migration.includes("auth.uid()"),
  "bootstrap_owner_business must derive caller identity from auth.uid()",
);
assert.ok(
  migration.includes("pg_advisory_xact_lock"),
  "bootstrap_owner_business must serialize concurrent attempts via advisory locking",
);

// 4. Automatic Main Location trigger is reused
assert.ok(
  migration.includes("trg_ensure_business_main_branch"),
  "Migration must acknowledge and reuse Phase 1 Main Location trigger",
);
assert.ok(
  !migration.includes("insert into public.branches") ||
    !migration.includes("'main', 'الفرع الرئيسي'"),
  "Migration must not manually insert duplicate main location during bootstrap",
);

// 5. Plan/Billing Owner surface exists
assert.ok(
  dashboardRoute.includes("PlanBillingPanel") &&
    dashboardRoute.includes('TabsTrigger value="billing"'),
  "Dashboard must include Plan & Billing tab for Owner",
);

// 6. Manager/Cashier billing navigation is absent
assert.ok(
  dashboardRoute.includes('activeTab === "billing"') &&
    dashboardRoute.includes('setActiveTab("overview")'),
  "Dashboard must reject non-owners from billing tab and redirect them to overview",
);

// 7. Billing state is server/database-backed
assert.ok(
  migration.includes("create or replace function public.get_business_billing_state"),
  "Migration must install get_business_billing_state RPC",
);
assert.ok(
  billingFn.includes("get_business_billing_state"),
  "billing.functions.ts must query get_business_billing_state RPC",
);

// 8. Plan catalog is centralized and authoritative
assert.ok(
  migration.includes("create table if not exists public.plans"),
  "Migration must create plans catalog table",
);
assert.ok(
  plansLib.includes("single_location") && plansLib.includes("multi_location"),
  "src/lib/plans.ts must export single_location and multi_location",
);
assert.ok(
  plansLib.includes("PLAN_CATALOG") && plansLib.includes("AVAILABLE_PLANS"),
  "src/lib/plans.ts must export centralized plan catalog",
);
assert.ok(
  !plansLib.includes("PLAN_CATALOG.growth") && !plansLib.includes("PLAN_CATALOG.enterprise"),
  "src/lib/plans.ts must not have growth or enterprise in AVAILABLE_PLANS",
);

// 9. No fabricated pricing, trials, or fake payment providers
assert.ok(
  !/price\s*[:=]/i.test(plansLib) &&
    !/trial\s*[:=]/i.test(plansLib) &&
    !/free_plan/i.test(plansLib),
  "Plan catalog must not declare pricing or trial properties",
);
assert.ok(
  !migration.includes("stripe") &&
    !migration.includes("moyasar") &&
    !migration.includes("hyperpay"),
  "Migration must not hardcode an unapproved payment provider",
);
assert.ok(
  migration.includes("default 'pending'"),
  "Subscription status must default to pending (never fake active)",
);

// 10. Client does not expose payment secrets
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
assert.ok(
  !envExample.includes("STRIPE_SECRET") && !envExample.includes("MOYASAR_KEY"),
  ".env.example must not add speculative payment provider secrets",
);

// 11. Authoritative Location Limit & UI decoupling
assert.ok(
  migration.includes("create or replace function public.business_location_entitlement"),
  "Migration must update business_location_entitlement to resolve from plans & subscriptions",
);
assert.ok(
  operationsPanel.includes("business_location_entitlement"),
  "OperationsPanel must fetch authoritative location entitlement from database RPC",
);
assert.ok(
  operationsPanel.includes("activeBranchesCount >= entitlement.maxLocations"),
  "OperationsPanel location limit check must use database-resolved maxLocations",
);

// 12. Downgrade safety & non-destructive behavior
assert.ok(
  migration.includes("create or replace function public.request_business_plan_change"),
  "Migration must install request_business_plan_change RPC",
);
assert.ok(
  migration.includes("_active_locations > _target_max"),
  "request_business_plan_change must validate active locations against target limit",
);

// 13. Phase 1-3 invariants preserved
assert.ok(
  dashboardRoute.includes("isCashierUser") && dashboardRoute.includes('Navigate to="/scan"'),
  "Cashier dashboard redirect to /scan must be preserved",
);
assert.ok(
  joinRoute.includes('createFileRoute("/join/$slug")'),
  "Customer join page must remain fully operational",
);
assert.ok(
  scanRoute.includes('createFileRoute("/scan")'),
  "Cashier scanner terminal must remain fully operational",
);

console.log("All Phase 4 Onboarding, Plans, and Billing contract checks passed successfully.");
