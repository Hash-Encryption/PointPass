import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260823010000_business_operations.sql", import.meta.url),
  "utf8",
);
const repair = readFileSync(
  new URL("../supabase/migrations/20260823010500_fix_staff_unlock_ambiguity.sql", import.meta.url),
  "utf8",
);
const scan = readFileSync(new URL("../src/routes/scan.tsx", import.meta.url), "utf8");

for (const required of [
  "create table public.branches",
  "create table public.staff_members",
  "create table public.staff_branch_assignments",
  "create table public.staff_cashier_credentials",
  "create or replace function public.cashier_unlock_staff",
  "s.revoked_at is null",
  "sm.status = 'active' and br.status = 'active'",
  "cashier_session_id, cashier_device_name",
  "_authorization.branch_id, _authorization.staff_id",
]) {
  assert.ok(migration.includes(required), `Missing operational contract: ${required}`);
}

assert.ok(
  migration.includes("Legacy business-level cashier sessions remain valid"),
  "Legacy nullable compatibility must be explicit",
);
assert.ok(migration.includes("extensions.crypt(_pin"), "Staff PINs must use bcrypt hashing");
assert.ok(
  migration.includes("extensions.digest(coalesce(_session_token, ''), 'sha256')"),
  "Session lookup must remain digest-based",
);
assert.ok(scan.includes('setPin("")'), "Raw PIN must be cleared after unlock");
assert.ok(scan.includes('rpc("cashier_unlock_staff"'), "Scan must support identified staff unlock");
assert.ok(
  repair.includes("on conflict on constraint staff_cashier_auth_throttle_pkey"),
  "Final staff unlock must avoid output-column ambiguity",
);
assert.ok(repair.includes("where t.staff_id = _unlock.staff_id"));
