import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260920000000_role_location_foundation.sql", import.meta.url),
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
  assert.ok(migration.includes(required), `Missing Main Location contract: ${required}`);
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
  assert.ok(migration.includes(required), `Missing Entitlement contract: ${required}`);
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
  assert.ok(migration.includes(required), `Missing Location Enforcement contract: ${required}`);
}

// 4. Strict Manager Read & Write Isolation (RLS)
for (const required of [
  "authorized members read business branches",
  "on public.branches for select to authenticated",
  "authorized members read branch assignments",
  "on public.staff_branch_assignments for select to authenticated",
  "authorized members read business staff",
  "on public.staff_members for select to authenticated",
]) {
  assert.ok(migration.includes(required), `Missing Manager RLS Isolation contract: ${required}`);
}

// 5. Enhanced Operations Access RPC
for (const required of [
  "create or replace function public.operations_access",
  "can_manage_business boolean",
  "managed_branch_ids uuid[]",
]) {
  assert.ok(migration.includes(required), `Missing operations_access contract: ${required}`);
}

// 6. Frontend Entitlements & Access Helpers
assert.ok(entitlements.includes("CONFIGURED_MULTI_LIMIT = 10"), "Configured multi limit must be 10");
assert.ok(entitlements.includes("getLocationEntitlement"), "Must export getLocationEntitlement");
assert.ok(entitlements.includes("canAddLocation"), "Must export canAddLocation");

assert.ok(access.includes("isOwner"), "Must export isOwner helper");
assert.ok(access.includes("isManager"), "Must export isManager helper");
assert.ok(access.includes("isCashier"), "Must export isCashier helper");
assert.ok(access.includes("canManageBusiness"), "Must export canManageBusiness");
assert.ok(access.includes("canManageBranch"), "Must export canManageBranch");

// 7. OperationsPanel UI Constraints (No admin/staff for new role selection)
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

// 8. Dashboard Scoping for Manager and Cashier
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

console.log("All Phase 1 Role + Location Foundation contract checks passed.");
