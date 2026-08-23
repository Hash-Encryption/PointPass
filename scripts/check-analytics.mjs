import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260823020000_analytics.sql", import.meta.url),
  "utf8",
);
const repair = await readFile(
  new URL(
    "../supabase/migrations/20260823020500_fix_analytics_program_filter.sql",
    import.meta.url,
  ),
  "utf8",
);
const panel = await readFile(
  new URL("../src/components/AnalyticsPanel.tsx", import.meta.url),
  "utf8",
);
const dashboard = await readFile(new URL("../src/routes/dashboard.tsx", import.meta.url), "utf8");

for (const required of [
  "create or replace function public.business_analytics",
  "public.can_access_business(auth.uid(), _business_id)",
  "public.can_manage_business(auth.uid(), _business_id)",
  "join public.staff_branch_assignments",
  "_date_to - _date_from > 366",
  "at time zone 'Asia/Riyadh'",
  "limit 50",
  "pass_transactions_business_created_idx",
  "Unattributed / Legacy",
  "revoke all on function public.business_analytics",
]) {
  assert.ok(migration.includes(required), `Analytics migration must include: ${required}`);
}

assert.ok(
  migration.includes("_full_access or t.branch_id in (select id from authorized_branches)"),
  "Branch-scoped analytics must filter authoritative transaction branch IDs",
);
assert.ok(
  repair.includes("t.program_type::text = _program_type") &&
    repair.includes("coalesce(program_type::text, 'legacy')"),
  "Analytics program filtering and legacy grouping must cast the stored enum to text",
);
assert.ok(
  migration.indexOf("raise exception 'Analytics access denied'") <
    migration.indexOf("from public.pass_transactions t"),
  "Authorization must run before transaction aggregation",
);
assert.ok(
  panel.includes('.rpc("business_analytics"'),
  "Analytics UI must use the server aggregation RPC",
);
assert.ok(
  !panel.includes('.from("pass_transactions")'),
  "Analytics UI must not load transactions directly",
);
assert.ok(panel.includes('type="date"'), "Analytics UI must include date filtering");
assert.ok(
  panel.includes("accessibilityLayer"),
  "Analytics charts must expose the accessibility layer",
);
assert.ok(panel.includes("<table"), "Analytics charts must have tabular reporting views");
assert.ok(dashboard.includes("<AnalyticsPanel"), "Dashboard must integrate the analytics panel");
assert.ok(
  dashboard.includes("key={business.id}"),
  "Business changes must clear analytics filters by remounting the panel",
);
assert.ok(
  !dashboard.includes('.from("pass_transactions")'),
  "Dashboard must not load transactions directly",
);

console.log(
  "Analytics security, aggregation, filters, accessibility, and dashboard checks passed.",
);
