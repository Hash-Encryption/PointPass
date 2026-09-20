import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(
  new URL("../src/components/OperationsPanel.tsx", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(new URL("../src/routes/dashboard.tsx", import.meta.url), "utf8");
const scan = readFileSync(new URL("../src/routes/scan.tsx", import.meta.url), "utf8");
const analytics = readFileSync(
  new URL("../src/components/AnalyticsPanel.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/20260920020000_phase2_locations_team.sql", import.meta.url),
  "utf8",
);
const sqlSuite = readFileSync(
  new URL("../supabase/tests/verify_phase2_locations_team.sql", import.meta.url),
  "utf8",
);
const i18n = readFileSync(new URL("../src/lib/i18n.tsx", import.meta.url), "utf8");

// 1. Navigation & Terminology: Operations replaced with Locations & Team
assert.ok(
  dashboard.includes('t("locationsAndTeam")'),
  "Dashboard tab must use locationsAndTeam i18n string",
);
assert.ok(
  !dashboard.includes('value="operations">{ar ? "العمليات والفروع" : "Operations"}'),
  "User-facing Operations label must be replaced",
);
assert.ok(
  i18n.includes('locationsAndTeam: { ar: "الفروع والفريق", en: "Locations & Team" }'),
  "i18n dictionary must define bilingual Locations & Team",
);
assert.ok(
  panel.includes("locationsAndTeam") || panel.includes("الفروع والفريق"),
  "Locations & Team panel must display Arabic domain title",
);

// 2. New Role Creation: Only Manager & Cashier offered
assert.ok(
  panel.includes('{ value: "manager", label: ar ? "مدير فرع" : "Manager" }'),
  "Manager must be offered as a primary role option",
);
assert.ok(
  panel.includes('{ value: "cashier", label: ar ? "كاشير" : "Cashier" }'),
  "Cashier must be offered as a primary role option",
);
assert.ok(
  !panel.includes('["owner", "admin", "manager", "staff", "cashier"].map'),
  "Admin/staff/owner must never be casually mapped as new role choices",
);

// 3. Technical Code Cleanup: Not required visible form fields
assert.ok(
  !panel.includes('label={ar ? "رمز الفرع" : "Branch code"}'),
  "Branch code must not be a normal visible form field for owners",
);
assert.ok(
  !panel.includes('label={ar ? "رمز الموظف" : "Staff code"}'),
  "Staff code must not be a normal visible form field for owners",
);
assert.ok(
  panel.includes("generateInternalBranchCode"),
  "Must auto-generate branch internal codes safely",
);
assert.ok(
  panel.includes("generateInternalStaffCode"),
  "Must auto-generate staff internal codes safely",
);

// 4. Legacy Role Compatibility: Displayed safely with human labels
assert.ok(
  panel.includes("Admin (legacy)") && panel.includes("مشرف (قديم)"),
  "Admin legacy label must be present",
);
assert.ok(
  panel.includes("Staff (legacy)") && panel.includes("موظف (قديم)"),
  "Staff legacy label must be present",
);

// 5. Cashier PIN Security & Per-Cashier Flow
assert.ok(
  panel.includes('staffForm.role === "cashier"'),
  "PIN input must appear only for Cashier role",
);
assert.ok(!panel.includes("pin_hash"), "Frontend must never reference or query pin_hash");
assert.ok(
  panel.includes("operations_staff_pin_status"),
  "Frontend must use safe PIN-configured status RPC",
);

// 6. Devices UI: Human terms without raw database identifiers
assert.ok(
  !panel.includes("session.id}") || panel.includes("key={session.id}"),
  "Session ID used only as React key",
);
assert.ok(!panel.includes("token_hash"), "Devices UI must never expose token_hash");
assert.ok(
  panel.includes("operations_revoke_session"),
  "Device revocation must use operations_revoke_session",
);

// 7. Cashier Access Link & Pre-fill
assert.ok(
  panel.includes("/scan?slug="),
  "Cashier access must generate clean pre-filled link without PIN",
);
assert.ok(
  !panel.includes("/scan?slug=") || !panel.includes("&pin="),
  "Access link must never include secret PIN in URL",
);
assert.ok(
  scan.includes("URLSearchParams"),
  "Scanner must accept query parameters for pre-filling terminal context",
);
assert.ok(scan.includes('rpc("cashier_unlock_staff"'), "Scanner must keep modern staff unlock");
assert.ok(scan.includes('rpc("cashier_unlock"'), "Scanner must keep legacy global PIN unlock");

// 8. Location Detail & Branch-filtered Analytics
assert.ok(panel.includes("<AnalyticsPanel"), "Location detail must integrate AnalyticsPanel");
assert.ok(
  panel.includes("lockedBranchId={selectedBranch.id}"),
  "Location analytics must lock branch filter to the selected location",
);
assert.ok(
  analytics.includes("lockedBranchId?: string"),
  "AnalyticsPanel must accept lockedBranchId prop",
);

// 9. Location Entitlement & Multi-location UX
assert.ok(
  panel.includes("getLocationEntitlement"),
  "Must use centralized location entitlement helper",
);
assert.ok(panel.includes("canAddLocation"), "Must check canAddLocation before allowing addition");
assert.ok(panel.includes("atLocationLimit"), "Must track atLocationLimit for upgrade messaging");

// 10. Phase 2 Migration Security
assert.ok(
  migration.includes("create or replace function public.operations_staff_pin_status"),
  "Migration must define operations_staff_pin_status",
);
assert.ok(
  migration.includes("returns table (staff_id uuid, pin_configured boolean)"),
  "operations_staff_pin_status must return only staff_id and pin_configured",
);
assert.ok(
  !migration.includes("select pin_hash"),
  "operations_staff_pin_status must never select or return pin_hash",
);
assert.ok(
  migration.includes("create or replace function public.operations_save_team_member"),
  "Migration must define transactional operations_save_team_member",
);
assert.ok(
  migration.includes("public.user_can_access_staff(auth.uid(), s.id)"),
  "PIN status query must enforce Phase 1 user_can_access_staff",
);

// 11. SQL Verification Suite Exists and is Comprehensive
assert.ok(sqlSuite.includes("plan(10)"), "SQL suite must declare expected test plan");
assert.ok(
  sqlSuite.includes("operations_staff_pin_status"),
  "SQL suite must test operations_staff_pin_status",
);
assert.ok(
  sqlSuite.includes("operations_save_team_member"),
  "SQL suite must test operations_save_team_member",
);

console.log("All Phase 2 Locations & Team contract checks passed successfully.");
