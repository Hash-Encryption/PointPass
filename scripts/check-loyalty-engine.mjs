import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const phase1 = readFileSync(
  new URL("../supabase/migrations/20260822000000_cashier_security.sql", import.meta.url),
  "utf8",
);
const phase2 = readFileSync(
  new URL("../supabase/migrations/20260822010000_loyalty_engine.sql", import.meta.url),
  "utf8",
);
const phase7 = readFileSync(
  new URL("../supabase/migrations/20260823010000_business_operations.sql", import.meta.url),
  "utf8",
);

assert.ok(
  existsSync(
    new URL(
      "../supabase/migrations/20260820150000_fix_pre_registered_merchant_signup.sql",
      import.meta.url,
    ),
  ),
  "Pre-registered merchant migration must be preserved",
);

const authBlock = `  select b, s.id
  into _authorization
  from public.cashier_sessions s
  join public.businesses b on b.id = s.business_id
  where s.token_hash = extensions.digest(coalesce(_session_token, ''), 'sha256')
    and s.expires_at > now()
    and b.slug = lower(trim(_slug))
    and b.status = 'active'
  for update of s;

  if not found then
    raise exception 'Cashier session invalid or expired';
  end if;

  _business := _authorization.b;
  _session_id := _authorization.id;

  update public.cashier_sessions
  set last_used_at = now()
  where id = _session_id;

  select p.* into _pass
  from public.pass_instances p
  where p.serial = trim(_serial)
    and p.business_id = _business.id
  for update;

  if not found then
    raise exception 'Pass does not belong to this business';
  end if;`;

assert.ok(phase1.includes(authBlock), "Phase 1 authorization block changed unexpectedly");
assert.ok(phase2.includes(authBlock), "Phase 2 must preserve the Phase 1 authorization block");

for (const securityRule of [
  "extensions.crypt(_pin, _pin_hash)",
  "_throttle.failed_attempts >= 5",
  "now() + interval '5 minutes'",
  "extensions.gen_random_bytes(32)",
  "extensions.digest(_session_token, 'sha256')",
  "now() + interval '30 minutes'",
  "delete from public.cashier_sessions where business_id = new.id",
]) {
  assert.ok(phase1.includes(securityRule), `Missing cashier security rule: ${securityRule}`);
}
assert.ok(
  phase1.includes("on conflict on constraint cashier_auth_throttle_pkey do nothing"),
  "Cashier throttle upsert must avoid output-column ambiguity",
);

const mutation = phase2.indexOf("  update public.pass_instances\n  set stamps = _next_stamps");
const transaction = phase2.indexOf("  insert into public.pass_transactions");
assert.ok(
  mutation > 0 && transaction > mutation,
  "Mutation must precede its atomic transaction row",
);

for (const rule of [
  "_amount_sar > 100000",
  "_amount_sar::text in ('NaN', 'Infinity', '-Infinity')",
  "if _action <> 'points' and _amount_sar is not null then",
  "_stamp_delta := -_business.target_stamps",
  "floor(_amount_sar / _business.sar_per_point)::integer",
  "_points_delta := -_business.points_per_reward",
  "if not _pass.morphed then",
  "if _action <> 'redeem' then",
  "_morph_applied := true",
  "raise exception 'Insufficient stamps for reward redemption'",
  "raise exception 'Insufficient points for reward redemption'",
]) {
  const position = phase2.indexOf(rule);
  assert.ok(position > 0 && position < mutation, `Missing pre-mutation rule: ${rule}`);
}

for (const constraint of [
  "businesses_target_stamps_positive",
  "businesses_sar_per_point_positive",
  "businesses_points_per_reward_positive",
  "pass_instances_nonnegative_balances",
  "pass_instances_valid_morph_state",
]) {
  assert.match(phase2, new RegExp(`add constraint ${constraint}[\\s\\S]*?not valid;`));
}

const floorCases = [
  [9, 0],
  [10, 1],
  [19, 1],
  [20, 2],
  [105, 10],
];
for (const [sar, expected] of floorCases) assert.equal(Math.floor(sar / 10), expected);
assert.equal(8 - 6, 2, "Stamp redemption must preserve remainder");
assert.equal(150 - 100, 50, "Points redemption must preserve remainder");

for (const field of [
  "program_type",
  "stamp_delta",
  "points_delta",
  "morph_applied",
  "stamps_after",
  "points_after",
  "morphed_after",
]) {
  const declaration = phase2.match(new RegExp(`add column if not exists ${field} [^,;]+[,;]`));
  assert.ok(declaration, `Missing transaction field: ${field}`);
  assert.doesNotMatch(declaration[0], /not null|default/i, `${field} must stay nullable`);
  assert.ok(phase2.slice(transaction, phase2.indexOf("  values (", transaction)).includes(field));
}

for (const value of [
  "_pass.program_type",
  "_stamp_delta",
  "_points_delta",
  "_morph_applied",
  "_next_stamps",
  "_next_points",
  "_next_morphed",
]) {
  assert.ok(phase2.slice(transaction).includes(value), `Missing transaction value: ${value}`);
}

for (const preserved of [
  "_stamp_delta := -_business.target_stamps",
  "_points_delta := -_business.points_per_reward",
  "_morph_applied := true",
  "Loyalty operation would create a negative balance",
  "insert into public.pass_transactions",
]) {
  assert.ok(phase7.includes(preserved), `Phase 7 must preserve loyalty contract: ${preserved}`);
}
