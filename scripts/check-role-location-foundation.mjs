import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationFoundation = readFileSync(
  new URL("../supabase/migrations/20260920000000_role_location_foundation.sql", import.meta.url),
  "utf8",
);
const migrationHardening = readFileSync(
  new URL("../supabase/migrations/20260920010000_phase1_foundation_hardening.sql", import.meta.url),
  "utf8",
);
const testSuite = readFileSync(
  new URL("../supabase/tests/verify_phase1_foundation.sql", import.meta.url),
  "utf8",
);
const panel = readFileSync(
  new URL("../src/components/OperationsPanel.tsx", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../src/routes/dashboard.tsx", import.meta.url),
  "utf8",
);
const entitlements = readFileSync(
  new URL("../src/lib/entitlements.ts", import.meta.url),
  "utf8",
);
const access = readFileSync(
  new URL("../src/lib/access.ts", import.meta.url),
  "utf8",
);

// 1. Automatic Main Location Architecture
for (const required of [
  "create or replace function public.ensure_business_main_branch",
  "trg_ensure_business_main_branch",
  "after insert on public.businesses",
  "'main'",
  "'الفرع الرئيسي'",
  "'Main Location'",
  "on conflict (business_id, lower(code)) do nothing",
]) {
  assert.ok(migrationFoundation.includes(required), `Missing Main Location contract: ${required}`);
}

// 2. Location Entitlement Foundation & Multi-Location Limit
for (const required of [
  "create or replace function public.business_location_entitlement",
  "multi_location",
  "single_location",
  "then 10",
  "else 1",
  "end as max_locations",
]) {
  assert.ok(migrationFoundation.includes(required), `Missing Entitlement contract: ${required}`);
}

// 3. Authoritative Location Count Enforcement with Advisory Locking
for (const required of [
  "create or replace function public.enforce_branch_location_limit",
  "trg_enforce_branch_location_limit",
  "before insert or update of status, business_id on public.branches",
  "pg_advisory_xact_lock",
  "hashtext('branch_limit_' ||",
  "Location limit exceeded",
]) {
  assert.ok(migrationFoundation.includes(required), `Missing Location Enforcement contract: ${required}`);
}

// 4. Anti-Recursion Security Definer Helper Architecture
for (const required of [
  "create or replace function public.user_can_access_branch",
  "create or replace function public.user_can_access_staff",
  "create or replace function public.user_can_access_branch_assignment",
  "create or replace function public.user_can_access_session",
  "create or replace function public.user_can_access_transaction",
  "security definer",
  "set search_path = public",
]) {
  assert.ok(migrationHardening.includes(required), `Missing Anti-Recursion Helper contract: ${required}`);
}

// 5. Strict Manager & Cashier RLS Isolation
for (const required of [
  "on public.branches for select to authenticated",
  "using (public.user_can_access_branch(auth.uid(), id))",
  "on public.staff_branch_assignments for select to authenticated",
  "using (public.user_can_access_branch_assignment(auth.uid(), business_id, branch_id))",
  "on public.staff_members for select to authenticated",
  "using (public.user_can_access_staff(auth.uid(), id))",
  "on public.cashier_sessions for select to authenticated",
  "using (public.user_can_access_session(auth.uid(), business_id, branch_id))",
  "on public.pass_transactions for select to authenticated",
  "using (public.user_can_access_transaction(auth.uid(), business_id, branch_id))",
]) {
  assert.ok(migrationHardening.includes(required), `Missing Hardened RLS Policy contract: ${required}`);
}

// 6. Authoritative Backend Staff Role Creation Restrictions
for (const required of [
  "create or replace function public.operations_upsert_staff",
  "New staff members can only be created with manager or cashier roles",
  "Role can only be transitioned to manager or cashier",
]) {
  assert.ok(migrationHardening.includes(required), `Missing Backend Staff Role Restriction contract: ${required}`);
}

// 7. Enhanced Operations Access RPC
for (const required of [
  "create or replace function public.operations_access",
  "can_manage_business boolean",
  "managed_branch_ids uuid[]",
]) {
  assert.ok(migrationFoundation.includes(required), `Missing operations_access contract: ${required}`);
}

// 8. SQL Verification Suite Schema Integrity
assert.ok(!testSuite.includes("is_active"), "Test suite must not reference fake is_active column");
assert.ok(!testSuite.includes("deleted_at"), "Test suite must not reference fake deleted_at column");
assert.ok(!testSuite.includes("businesses.name"), "Test suite must not reference fake businesses.name column");
assert.ok(testSuite.includes("public.branches FORCE ROW LEVEL SECURITY"), "Test suite must enforce RLS testing");
assert.ok(testSuite.includes("SET LOCAL ROLE authenticated"), "Test suite must execute tests under authenticated role");
assert.ok(testSuite.includes("current_user <> 'authenticated'"), "Test suite must verify current_user is authenticated");
assert.ok(testSuite.includes("RESET ROLE"), "Test suite must safely reset role");
assert.ok(testSuite.includes("[TEST 1]"), "Test suite must include Test 1");
assert.ok(testSuite.includes("[TEST 2]"), "Test suite must include Test 2");
assert.ok(testSuite.includes("[TEST 3]"), "Test suite must include Test 3");
assert.ok(testSuite.includes("[TEST 4]"), "Test suite must include Test 4");
assert.ok(testSuite.includes("[TEST 5]"), "Test suite must include Test 5");
assert.ok(testSuite.includes("[TEST 6]"), "Test suite must include Test 6");
assert.ok(testSuite.includes("[TEST 7]"), "Test suite must include Test 7");
assert.ok(testSuite.includes("[TEST 8]"), "Test suite must include Test 8");
assert.ok(testSuite.includes("[TEST 9]"), "Test suite must include Test 9");

// 9. Frontend Entitlements & Access Helpers
assert.ok(entitlements.includes("CONFIGURED_MULTI_LIMIT = 10"), "Configured multi limit must be 10");
assert.ok(entitlements.includes("getLocationEntitlement"), "Must export getLocationEntitlement");
assert.ok(entitlements.includes("canAddLocation"), "Must export canAddLocation");

assert.ok(access.includes("isOwner"), "Must export isOwner helper");
assert.ok(access.includes("isManager"), "Must export isManager helper");
assert.ok(access.includes("isCashier"), "Must export isCashier helper");
assert.ok(access.includes("canManageBusiness"), "Must export canManageBusiness");
assert.ok(access.includes("canManageBranch"), "Must export canManageBranch");

// 10. OperationsPanel UI Constraints
assert.ok(
  panel.includes('{ value: "manager", label: ar ? "مدير فرع" : "Manager" }'),
  "OperationsPanel must expose Manager as primary role",
);
assert.ok(
  panel.includes('{ value: "cashier", label: ar ? "كاشير" : "Cashier" }'),
  "OperationsPanel must expose Cashier as primary role",
);
assert.ok(
  !panel.includes('["owner", "admin", "manager", "staff", "cashier"].map'),
  "OperationsPanel must not casually expose admin/staff as new client role choices",
);
assert.ok(
  panel.includes("userCanManageBranch(branch.id)"),
  "OperationsPanel must check branch management permissions per branch",
);
assert.ok(
  panel.includes("atLocationLimit"),
  "OperationsPanel must check location limit before allowing branch addition",
);

// 11. Dashboard Scoping for Manager and Cashier
assert.ok(
  dashboard.includes("isOwnerUser ? ("),
  "Dashboard must restrict owner-only tabs to owners",
);
assert.ok(
  dashboard.includes("isCashierUser"),
  "Dashboard must check cashier role",
);
assert.ok(
  dashboard.includes("/scan"),
  "Dashboard must direct cashier accounts to /scan",
);

console.log("All Phase 1 Role + Location Foundation & Hardening contract checks passed.");
