-- ==============================================================================
-- PointPass Phase 1: Role + Location Foundation Executable Verification Suite
-- Matches actual PointPass schema and RPC signatures.
-- Executes inside a transaction with automatic ROLLBACK so no test data remains.
-- ==============================================================================

BEGIN;

-- Helper function in temporary schema for auth context simulation
CREATE OR REPLACE FUNCTION pg_temp.set_test_auth(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
END;
$$;

-- Force RLS on tested relations so tests evaluate policies even if run by table owner / postgres
ALTER TABLE public.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_branch_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pass_transactions FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_owner_user_id uuid := gen_random_uuid();
  v_other_owner_id uuid := gen_random_uuid();
  v_manager_user_id uuid := gen_random_uuid();
  v_cashier_user_id uuid := gen_random_uuid();
  v_legacy_admin_user_id uuid := gen_random_uuid();

  v_single_biz_id uuid;
  v_multi_biz_id uuid;
  v_other_biz_id uuid;

  v_single_main_branch_id uuid;
  v_multi_branch_a_id uuid;
  v_multi_branch_b_id uuid;
  v_other_branch_id uuid;

  v_staff_mgr_id uuid;
  v_staff_csh_id uuid;
  v_staff_other_branch_id uuid;
  v_staff_legacy_admin_id uuid;

  v_session_a_id uuid;
  v_session_b_id uuid;
  v_session_unattributed_id uuid;

  v_tx_a_id uuid;
  v_tx_b_id uuid;
  v_tx_unattributed_id uuid;

  v_count integer;
  v_limit integer;
  v_name_ar text;
  v_name_en text;
  v_status text;
  v_role text;
  v_can_manage boolean;
  v_can_manage_biz boolean;
  v_managed_branch_ids uuid[];
  v_analytics jsonb;
  v_error_thrown boolean;
  v_error_message text;
BEGIN
  RAISE NOTICE '==============================================================';
  RAISE NOTICE 'Starting PointPass Phase 1 Real Database Certification Suite';
  RAISE NOTICE '==============================================================';

  -- ----------------------------------------------------------------------------
  -- Setup: Create Mock auth.users records for referential integrity
  -- ----------------------------------------------------------------------------
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES
    (v_owner_user_id, 'owner@test.local', '{}'::jsonb),
    (v_other_owner_id, 'other_owner@test.local', '{}'::jsonb),
    (v_manager_user_id, 'manager_a@test.local', '{}'::jsonb),
    (v_cashier_user_id, 'cashier_a@test.local', '{}'::jsonb),
    (v_legacy_admin_user_id, 'legacy_admin@test.local', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- ----------------------------------------------------------------------------
  -- TEST 1: Automatic Main Location Creation on Business Insert
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[TEST 1] Verifying automatic main branch creation...';

  INSERT INTO public.businesses (
    id, owner_id, slug, name_ar, name_en, plan, status
  ) VALUES (
    gen_random_uuid(), v_owner_user_id, 'single-bakery-' || substr(gen_random_uuid()::text, 1, 8),
    'مخبز الفرع الواحد', 'Single Bakery', 'single_location', 'active'
  ) RETURNING id INTO v_single_biz_id;

  SELECT id, code, name_ar, name_en, status
  INTO v_single_main_branch_id, v_role, v_name_ar, v_name_en, v_status
  FROM public.branches
  WHERE business_id = v_single_biz_id AND lower(code) = 'main';

  IF v_single_main_branch_id IS NULL THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Main branch was not automatically created';
  END IF;

  IF v_name_ar <> 'الفرع الرئيسي' OR v_name_en <> 'Main Location' OR v_status <> 'active' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Main branch defaults incorrect: ar=%, en=%, status=%',
      v_name_ar, v_name_en, v_status;
  END IF;

  -- Main Location Idempotency check: duplicate insert should be ignored
  INSERT INTO public.branches (
    business_id, code, name_ar, name_en, status
  ) VALUES (
    v_single_biz_id, 'main', 'الفرع الرئيسي', 'Main Location', 'active'
  ) ON CONFLICT (business_id, lower(code)) DO NOTHING;

  SELECT count(*) INTO v_count
  FROM public.branches
  WHERE business_id = v_single_biz_id AND lower(code) = 'main';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Main branch was duplicated on conflict';
  END IF;

  RAISE NOTICE '  PASS: Automatic main location created with correct defaults and idempotency.';

  -- ----------------------------------------------------------------------------
  -- TEST 2: Single-Location Limit Enforcement (max = 1)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[TEST 2] Verifying single_location business cannot exceed 1 branch...';

  SELECT max_locations INTO v_limit
  FROM public.business_location_entitlement(v_single_biz_id);

  IF v_limit <> 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Expected entitlement max_locations = 1, got %', v_limit;
  END IF;

  -- Attempting to insert a 2nd active branch must fail
  v_error_thrown := false;
  BEGIN
    INSERT INTO public.branches (
      business_id, code, name_ar, name_en, status
    ) VALUES (
      v_single_biz_id, 'second-branch', 'فرع ثاني', 'Second Branch', 'active'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Location limit exceeded%' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Single-location business inserted a 2nd branch (error: %)', v_error_message;
  END IF;

  -- Deactivating main branch allows replacement active branch
  UPDATE public.branches SET status = 'inactive' WHERE id = v_single_main_branch_id;

  INSERT INTO public.branches (
    business_id, code, name_ar, name_en, status
  ) VALUES (
    v_single_biz_id, 'replacement-branch', 'فرع بديل', 'Replacement Branch', 'active'
  );

  -- Clean up replacement branch and reactivate main branch
  DELETE FROM public.branches WHERE business_id = v_single_biz_id AND code = 'replacement-branch';
  UPDATE public.branches SET status = 'active' WHERE id = v_single_main_branch_id;

  RAISE NOTICE '  PASS: Single-location limit strictly enforced; inactive branches do not block replacements.';

  -- ----------------------------------------------------------------------------
  -- TEST 3: Multi-Location Limit Enforcement (CONFIGURED_MULTI_LIMIT = 10)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[TEST 3] Verifying multi_location business limit (limit = 10)...';

  INSERT INTO public.businesses (
    id, owner_id, slug, name_ar, name_en, plan, status
  ) VALUES (
    gen_random_uuid(), v_owner_user_id, 'multi-roastery-' || substr(gen_random_uuid()::text, 1, 8),
    'محمصة الفروع المتعددة', 'Multi Branch Roastery', 'multi_location', 'active'
  ) RETURNING id INTO v_multi_biz_id;

  SELECT id INTO v_multi_branch_a_id
  FROM public.branches
  WHERE business_id = v_multi_biz_id AND lower(code) = 'main';

  SELECT max_locations INTO v_limit
  FROM public.business_location_entitlement(v_multi_biz_id);

  IF v_limit <> 10 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Expected entitlement max_locations = 10, got %', v_limit;
  END IF;

  -- Multi business already has branch 1 (main). Insert 9 more branches (reaching 10 total).
  FOR i IN 2..10 LOOP
    INSERT INTO public.branches (
      business_id, code, name_ar, name_en, status
    ) VALUES (
      v_multi_biz_id, 'branch-' || i, 'فرع ' || i, 'Branch ' || i, 'active'
    ) RETURNING id INTO v_multi_branch_b_id;
  END LOOP;

  SELECT count(*) INTO v_count
  FROM public.branches
  WHERE business_id = v_multi_biz_id AND status = 'active';

  IF v_count <> 10 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Expected 10 active branches, found %', v_count;
  END IF;

  -- Attempting to insert an 11th branch must fail
  v_error_thrown := false;
  BEGIN
    INSERT INTO public.branches (
      business_id, code, name_ar, name_en, status
    ) VALUES (
      v_multi_biz_id, 'branch-11', 'فرع 11', 'Branch 11', 'active'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Location limit exceeded%' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Multi-location business inserted an 11th branch (error: %)', v_error_message;
  END IF;

  RAISE NOTICE '  PASS: Multi-location limit (10) strictly enforced at DB level.';

  -- ----------------------------------------------------------------------------
  -- Setup: Other Business for Cross-Tenant Isolation
  -- ----------------------------------------------------------------------------
  INSERT INTO public.businesses (
    id, owner_id, slug, name_ar, name_en, plan, status
  ) VALUES (
    gen_random_uuid(), v_other_owner_id, 'other-biz-' || substr(gen_random_uuid()::text, 1, 8),
    'متجر منافس', 'Competitor Store', 'single_location', 'active'
  ) RETURNING id INTO v_other_biz_id;

  SELECT id INTO v_other_branch_id
  FROM public.branches
  WHERE business_id = v_other_biz_id AND lower(code) = 'main';

  -- ----------------------------------------------------------------------------
  -- TEST 4: Backend Staff Role Creation Restrictions (operations_upsert_staff)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[TEST 4] Verifying authoritative backend restriction on new staff roles...';

  PERFORM pg_temp.set_test_auth(v_owner_user_id);

  -- 4a. Fresh staff with role 'admin' must fail
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_staff(
      _business_id := v_multi_biz_id,
      _staff_id := NULL,
      _code := 'bad-admin',
      _name_ar := 'مشرف جديد',
      _name_en := 'New Admin',
      _email := 'badadmin@test.local',
      _role := 'admin'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%New staff members can only be created with manager or cashier roles%' THEN
    RAISE EXCEPTION 'TEST 4a FAILED: Allowed creation of new staff with admin role (error: %)', v_error_message;
  END IF;

  -- 4b. Fresh staff with role 'staff' must fail
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_staff(
      _business_id := v_multi_biz_id,
      _staff_id := NULL,
      _code := 'bad-staff',
      _name_ar := 'موظف عام',
      _name_en := 'Generic Staff',
      _email := 'badstaff@test.local',
      _role := 'staff'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%New staff members can only be created with manager or cashier roles%' THEN
    RAISE EXCEPTION 'TEST 4b FAILED: Allowed creation of new staff with generic staff role (error: %)', v_error_message;
  END IF;

  -- 4c. Fresh staff with role 'manager' must SUCCEED
  v_staff_mgr_id := public.operations_upsert_staff(
    _business_id := v_multi_biz_id,
    _staff_id := NULL,
    _code := 'mgr-a',
    _name_ar := 'مدير فرع أ',
    _name_en := 'Manager Branch A',
    _email := 'manager_a@test.local',
    _role := 'manager'
  );

  -- 4d. Fresh staff with role 'cashier' must SUCCEED
  v_staff_csh_id := public.operations_upsert_staff(
    _business_id := v_multi_biz_id,
    _staff_id := NULL,
    _code := 'csh-a',
    _name_ar := 'كاشير فرع أ',
    _name_en := 'Cashier Branch A',
    _email := 'cashier_a@test.local',
    _role := 'cashier',
    _pin := '1234'
  );

  -- Create staff for Location B to test cross-branch staff isolation
  v_staff_other_branch_id := public.operations_upsert_staff(
    _business_id := v_multi_biz_id,
    _staff_id := NULL,
    _code := 'csh-b',
    _name_ar := 'كاشير فرع ب',
    _name_en := 'Cashier Branch B',
    _email := 'cashier_b@test.local',
    _role := 'cashier',
    _pin := '5678'
  );

  -- 4e. Legacy Staff Preservation: insert legacy 'admin' via DB seed (simulating existing legacy user)
  INSERT INTO public.staff_members (
    business_id, auth_user_id, code, name_ar, name_en, email, role, status
  ) VALUES (
    v_multi_biz_id, v_legacy_admin_user_id, 'legacy-adm', 'مشرف قديم', 'Legacy Admin',
    'legacy_admin@test.local', 'admin', 'active'
  ) RETURNING id INTO v_staff_legacy_admin_id;

  -- Editing existing legacy admin without changing role must SUCCEED (preserving legacy role)
  PERFORM public.operations_upsert_staff(
    _business_id := v_multi_biz_id,
    _staff_id := v_staff_legacy_admin_id,
    _code := 'legacy-adm',
    _name_ar := 'مشرف قديم معدل',
    _name_en := 'Updated Legacy Admin',
    _email := 'legacy_admin@test.local',
    _role := 'admin'
  );

  -- Transitioning manager to 'admin' must fail
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_staff(
      _business_id := v_multi_biz_id,
      _staff_id := v_staff_mgr_id,
      _code := 'mgr-a',
      _name_ar := 'مدير فرع أ',
      _name_en := 'Manager Branch A',
      _email := 'manager_a@test.local',
      _role := 'admin'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Role can only be transitioned to manager or cashier%' THEN
    RAISE EXCEPTION 'TEST 4e FAILED: Allowed transition of manager to admin (error: %)', v_error_message;
  END IF;

  RAISE NOTICE '  PASS: Authoritative backend role restrictions validated.';

  -- ----------------------------------------------------------------------------
  -- Setup: Staff Branch Assignments & Sessions & Transactions
  -- ----------------------------------------------------------------------------
  -- Assign Manager and Cashier A ONLY to Branch A (main)
  PERFORM public.operations_assign_staff(v_multi_biz_id, v_staff_mgr_id, v_multi_branch_a_id, true);
  PERFORM public.operations_assign_staff(v_multi_biz_id, v_staff_csh_id, v_multi_branch_a_id, true);

  -- Assign Cashier B to Branch B
  PERFORM public.operations_assign_staff(v_multi_biz_id, v_staff_other_branch_id, v_multi_branch_b_id, true);

  -- Cashier Session in Branch A
  INSERT INTO public.cashier_sessions (
    business_id, branch_id, staff_id, token_hash, device_name, expires_at
  ) VALUES (
    v_multi_biz_id, v_multi_branch_a_id, v_staff_csh_id, 'hash-token-a', 'Terminal A', now() + interval '1 hour'
  ) RETURNING id INTO v_session_a_id;

  -- Cashier Session in Branch B
  INSERT INTO public.cashier_sessions (
    business_id, branch_id, staff_id, token_hash, device_name, expires_at
  ) VALUES (
    v_multi_biz_id, v_multi_branch_b_id, v_staff_other_branch_id, 'hash-token-b', 'Terminal B', now() + interval '1 hour'
  ) RETURNING id INTO v_session_b_id;

  -- Legacy Unattributed Cashier Session (branch_id IS NULL)
  INSERT INTO public.cashier_sessions (
    business_id, branch_id, staff_id, token_hash, device_name, expires_at
  ) VALUES (
    v_multi_biz_id, NULL, NULL, 'hash-token-legacy', 'Legacy Device', now() + interval '1 hour'
  ) RETURNING id INTO v_session_unattributed_id;

  -- Transaction in Branch A
  INSERT INTO public.pass_transactions (
    pass_serial, business_id, branch_id, staff_id, action, amount_sar
  ) VALUES (
    'PASS-001', v_multi_biz_id, v_multi_branch_a_id, v_staff_csh_id, 'stamp', NULL
  ) RETURNING id INTO v_tx_a_id;

  -- Transaction in Branch B
  INSERT INTO public.pass_transactions (
    pass_serial, business_id, branch_id, staff_id, action, amount_sar
  ) VALUES (
    'PASS-002', v_multi_biz_id, v_multi_branch_b_id, v_staff_other_branch_id, 'stamp', NULL
  ) RETURNING id INTO v_tx_b_id;

  -- Legacy Unattributed Transaction (branch_id IS NULL)
  INSERT INTO public.pass_transactions (
    pass_serial, business_id, branch_id, staff_id, action, amount_sar
  ) VALUES (
    'PASS-003', v_multi_biz_id, NULL, NULL, 'points', 50
  ) RETURNING id INTO v_tx_unattributed_id;

  -- ----------------------------------------------------------------------------
  -- TEST 5: RLS Recursion Audit & Manager READ Isolation
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[TEST 5] Testing RLS queries under Manager context (recursion & isolation audit)...';

  PERFORM pg_temp.set_test_auth(v_manager_user_id);

  -- 5a. Branch read isolation
  SELECT count(*) INTO v_count FROM public.branches WHERE business_id = v_multi_biz_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5a FAILED: Manager should only see 1 assigned branch, saw %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.branches WHERE id = v_multi_branch_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5a FAILED: Manager was able to select unassigned Branch B!';
  END IF;

  -- 5b. Staff read isolation
  -- Manager should see self + staff assigned to Branch A (Cashier A). Should NOT see Cashier B.
  SELECT count(*) INTO v_count FROM public.staff_members WHERE id = v_staff_mgr_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5b FAILED: Manager cannot read their own staff record';
  END IF;

  SELECT count(*) INTO v_count FROM public.staff_members WHERE id = v_staff_csh_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5b FAILED: Manager cannot read staff in same branch';
  END IF;

  SELECT count(*) INTO v_count FROM public.staff_members WHERE id = v_staff_other_branch_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5b FAILED: Manager was able to select staff from unassigned Branch B!';
  END IF;

  -- 5c. Staff Branch Assignments read isolation
  SELECT count(*) INTO v_count FROM public.staff_branch_assignments WHERE branch_id = v_multi_branch_a_id;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'TEST 5c FAILED: Manager cannot read assignments for assigned branch';
  END IF;

  SELECT count(*) INTO v_count FROM public.staff_branch_assignments WHERE branch_id = v_multi_branch_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5c FAILED: Manager was able to select assignments for unassigned Branch B!';
  END IF;

  -- 5d. Cashier Sessions read isolation
  SELECT count(*) INTO v_count FROM public.cashier_sessions WHERE id = v_session_a_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5d FAILED: Manager cannot read cashier session for assigned Branch A';
  END IF;

  SELECT count(*) INTO v_count FROM public.cashier_sessions WHERE id = v_session_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5d FAILED: Manager was able to select cashier session for unassigned Branch B!';
  END IF;

  SELECT count(*) INTO v_count FROM public.cashier_sessions WHERE id = v_session_unattributed_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5d FAILED: Manager was able to select unattributed cashier session!';
  END IF;

  -- 5e. Transactions read isolation
  SELECT count(*) INTO v_count FROM public.pass_transactions WHERE id = v_tx_a_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5e FAILED: Manager cannot read transaction for assigned Branch A';
  END IF;

  SELECT count(*) INTO v_count FROM public.pass_transactions WHERE id = v_tx_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5e FAILED: Manager was able to select transaction for unassigned Branch B!';
  END IF;

  SELECT count(*) INTO v_count FROM public.pass_transactions WHERE id = v_tx_unattributed_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5e FAILED: Manager was able to select unattributed transaction!';
  END IF;

  RAISE NOTICE '  PASS: Manager read isolation on branches, staff, assignments, sessions, and transactions verified with zero recursion.';

  -- ----------------------------------------------------------------------------
  -- TEST 6: Manager Mutation Isolation (operations_upsert_branch)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[TEST 6] Verifying Manager mutation isolation via RPC...';

  -- 6a. Manager updating assigned Branch A -> SUCCEEDS
  PERFORM public.operations_upsert_branch(
    _business_id := v_multi_biz_id,
    _branch_id := v_multi_branch_a_id,
    _code := 'main',
    _name_ar := 'الفرع الرئيسي المحدث',
    _name_en := 'Updated Main Branch'
  );

  -- 6b. Manager updating unassigned Branch B -> FAILS
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_branch(
      _business_id := v_multi_biz_id,
      _branch_id := v_multi_branch_b_id,
      _code := 'branch-b-hacked',
      _name_ar := 'فرع مخترق',
      _name_en := 'Hacked Branch'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Branch update denied%' THEN
    RAISE EXCEPTION 'TEST 6b FAILED: Manager was able to update unassigned branch (error: %)', v_error_message;
  END IF;

  -- 6c. Manager creating new branch -> FAILS
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_branch(
      _business_id := v_multi_biz_id,
      _branch_id := NULL,
      _code := 'manager-new-branch',
      _name_ar := 'فرع جديد',
      _name_en := 'New Branch'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Branch creation denied%' THEN
    RAISE EXCEPTION 'TEST 6c FAILED: Manager was able to create a branch (error: %)', v_error_message;
  END IF;

  RAISE NOTICE '  PASS: Manager cannot update unassigned branches or create branches.';

  -- ----------------------------------------------------------------------------
  -- TEST 7: Cashier Denials
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[TEST 7] Verifying Cashier restrictions...';

  PERFORM pg_temp.set_test_auth(v_cashier_user_id);

  -- 7a. Cashier cannot view cashier sessions
  SELECT count(*) INTO v_count FROM public.cashier_sessions WHERE business_id = v_multi_biz_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 7a FAILED: Cashier was able to read cashier_sessions table directly!';
  END IF;

  -- 7b. Cashier cannot update branch
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_branch(
      _business_id := v_multi_biz_id,
      _branch_id := v_multi_branch_a_id,
      _code := 'main',
      _name_ar := 'كاشير يحاول التعديل',
      _name_en := 'Cashier Attempt'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'TEST 7b FAILED: Cashier was able to mutate a branch!';
  END IF;

  -- 7c. Cashier cannot manage staff
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_staff(
      _business_id := v_multi_biz_id,
      _staff_id := NULL,
      _code := 'csh-rogue',
      _name_ar := 'موظف غير مصرح',
      _name_en := 'Rogue Staff',
      _email := 'rogue@test.local',
      _role := 'cashier'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'TEST 7c FAILED: Cashier was able to call operations_upsert_staff!';
  END IF;

  -- 7d. Cashier operations_access returns role cashier, can_manage false
  SELECT operational_role, can_manage, can_manage_business
  INTO v_role, v_can_manage, v_can_manage_biz
  FROM public.operations_access(v_multi_biz_id);

  IF v_role <> 'cashier' OR v_can_manage OR v_can_manage_biz THEN
    RAISE EXCEPTION 'TEST 7d FAILED: Cashier operations_access returned invalid permissions (role: %, can_manage: %)',
      v_role, v_can_manage;
  END IF;

  RAISE NOTICE '  PASS: Cashier operational restrictions verified.';

  -- ----------------------------------------------------------------------------
  -- TEST 8: Owner Access & Cross-Business Isolation
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[TEST 8] Verifying Owner access and cross-business isolation...';

  PERFORM pg_temp.set_test_auth(v_owner_user_id);

  -- 8a. Owner can read all own branches (10 total)
  SELECT count(*) INTO v_count FROM public.branches WHERE business_id = v_multi_biz_id;
  IF v_count <> 10 THEN
    RAISE EXCEPTION 'TEST 8a FAILED: Owner should see 10 branches, saw %', v_count;
  END IF;

  -- 8b. Owner can read all sessions (including unattributed)
  SELECT count(*) INTO v_count FROM public.cashier_sessions WHERE business_id = v_multi_biz_id;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'TEST 8b FAILED: Owner should see 3 sessions, saw %', v_count;
  END IF;

  -- 8c. Owner can read all transactions (including unattributed)
  SELECT count(*) INTO v_count FROM public.pass_transactions WHERE business_id = v_multi_biz_id;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'TEST 8c FAILED: Owner should see 3 transactions, saw %', v_count;
  END IF;

  -- 8d. Cross-business isolation: Owner querying competitor business
  SELECT count(*) INTO v_count FROM public.branches WHERE business_id = v_other_biz_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 8d FAILED: Owner was able to view competitor branches!';
  END IF;

  -- 8e. Owner mutating competitor branch fails
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_branch(
      _business_id := v_other_biz_id,
      _branch_id := v_other_branch_id,
      _code := 'main',
      _name_ar := 'محاولة تعديل منافس',
      _name_en := 'Competitor Mutate Attempt'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'TEST 8e FAILED: Owner was able to mutate a competitor branch!';
  END IF;

  RAISE NOTICE '  PASS: Owner access and cross-business tenant isolation verified.';

  -- ----------------------------------------------------------------------------
  -- TEST 9: Manager Analytics Isolation (business_analytics RPC)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[TEST 9] Verifying Manager Analytics scoping in business_analytics...';

  PERFORM pg_temp.set_test_auth(v_manager_user_id);

  -- 9a. Unfiltered analytics under Manager context returns ONLY Branch A
  v_analytics := public.business_analytics(
    _business_id := v_multi_biz_id,
    _date_from := current_date - 1,
    _date_to := current_date + 1
  );

  IF (v_analytics->'summary'->>'totalTransactions')::integer <> 1 THEN
    RAISE EXCEPTION 'TEST 9a FAILED: Manager analytics totalTransactions should be 1 (Location A only), got %',
      v_analytics->'summary'->>'totalTransactions';
  END IF;

  -- Location B must NOT appear in filters.branches
  IF jsonb_path_exists(v_analytics, '$.filters.branches[*] ? (@.id == $id)', jsonb_build_object('id', v_multi_branch_b_id)) THEN
    RAISE EXCEPTION 'TEST 9a FAILED: Unassigned Branch B leaked into Manager analytics filter list!';
  END IF;

  -- 9b. Manager attempting to query analytics explicitly for unassigned Branch B -> FAILS
  v_error_thrown := false;
  BEGIN
    PERFORM public.business_analytics(
      _business_id := v_multi_biz_id,
      _date_from := current_date - 1,
      _date_to := current_date + 1,
      _branch_id := v_multi_branch_b_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Analytics access denied%' THEN
    RAISE EXCEPTION 'TEST 9b FAILED: Manager was able to request analytics for unassigned Branch B! (error: %)', v_error_message;
  END IF;

  -- 9c. Owner analytics sees all transactions (Location A + Location B + unattributed = 3)
  PERFORM pg_temp.set_test_auth(v_owner_user_id);
  v_analytics := public.business_analytics(
    _business_id := v_multi_biz_id,
    _date_from := current_date - 1,
    _date_to := current_date + 1
  );

  IF (v_analytics->'summary'->>'totalTransactions')::integer <> 3 THEN
    RAISE EXCEPTION 'TEST 9c FAILED: Owner analytics should see 3 transactions, got %',
      v_analytics->'summary'->>'totalTransactions';
  END IF;

  RAISE NOTICE '  PASS: Manager analytics strictly scoped; unassigned data and branches completely hidden.';

  RAISE NOTICE '==============================================================';
  RAISE NOTICE 'ALL PHASE 1 CERTIFICATION TESTS PASSED SUCCESSFULLY!';
  RAISE NOTICE '==============================================================';

END $$;

ROLLBACK;
