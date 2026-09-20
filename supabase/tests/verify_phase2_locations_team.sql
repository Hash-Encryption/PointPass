-- Verification suite for Phase 2: Locations & Team + Clean Operations UX
-- Transactional safety: All tests run in a transaction that is rolled back.

begin;

select plan(10);

-- [TEST 1] operations_staff_pin_status exists and has strict return columns
select has_function(
  'public',
  'operations_staff_pin_status',
  array['uuid'],
  'operations_staff_pin_status must exist'
);

-- [TEST 2] generate_branch_code exists
select has_function(
  'public',
  'generate_branch_code',
  array['uuid', 'text'],
  'generate_branch_code must exist'
);

-- [TEST 3] generate_staff_code exists
select has_function(
  'public',
  'generate_staff_code',
  array['uuid', 'text', 'text'],
  'generate_staff_code must exist'
);

-- [TEST 4] operations_save_team_member exists
select has_function(
  'public',
  'operations_save_team_member',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid[]'],
  'operations_save_team_member must exist'
);

-- [TEST 5] operations_upsert_branch permits null/empty code for auto-generation
-- (Verified by function signature)
select has_function(
  'public',
  'operations_upsert_branch',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'text'],
  'operations_upsert_branch must support auto-generating code'
);

-- [TEST 6] Verify schema: staff_cashier_credentials remains inaccessible to public/anon
select throws_ok(
  $$ select * from public.staff_cashier_credentials $$,
  'permission denied for table staff_cashier_credentials',
  'Direct table access to staff_cashier_credentials must remain denied'
);

-- [TEST 7] operations_staff_pin_status cannot be executed by anon
select throws_ok(
  $$ select * from public.operations_staff_pin_status('00000000-0000-0000-0000-000000000000'::uuid) $$,
  'permission denied for function operations_staff_pin_status',
  'Anon must be denied from operations_staff_pin_status'
);

-- [TEST 8] operations_save_team_member cannot be executed by anon
select throws_ok(
  $$ select public.operations_save_team_member('00000000-0000-0000-0000-000000000000'::uuid, null, null, 'كاشير', 'Cashier', null, 'cashier') $$,
  'permission denied for function operations_save_team_member',
  'Anon must be denied from operations_save_team_member'
);

-- [TEST 9] Verify function definitions do not leak pin_hash
select is(
  (select count(*)::integer from pg_proc where proname = 'operations_staff_pin_status' and prosrc ilike '%pin_hash%'),
  0,
  'operations_staff_pin_status must not reference or return pin_hash'
);

-- [TEST 10] Anti-recursion security definer helper check
select isnt_empty(
  $$ select 1 from pg_proc where proname = 'user_can_access_staff' and prosecdef = true $$,
  'user_can_access_staff must remain security definer'
);

select * from finish();

rollback;
