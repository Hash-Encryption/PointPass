-- ==============================================================================
-- PointPass Phase 1: Role + Location Foundation Verification Script
-- Safe to execute against Supabase / Postgres inside a rolled-back transaction.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_owner_user_id uuid := gen_random_uuid();
  v_other_owner_id uuid := gen_random_uuid();
  v_manager_user_id uuid := gen_random_uuid();
  v_cashier_user_id uuid := gen_random_uuid();

  v_single_biz_id uuid;
  v_multi_biz_id uuid;
  v_other_biz_id uuid;

  v_single_main_branch_id uuid;
  v_multi_main_branch_id uuid;
  v_multi_branch_b_id uuid;
  v_other_branch_id uuid;

  v_staff_manager_id uuid;
  v_staff_cashier_id uuid;

  v_count integer;
  v_limit integer;
  v_role text;
  v_can_manage boolean;
  v_can_manage_biz boolean;
  v_managed_branch_ids uuid[];
  v_error_thrown boolean;
BEGIN
  RAISE NOTICE '=== Starting Phase 1 Foundation Verification ===';

  -- ----------------------------------------------------------------------------
  -- 1. Automatic Main Location on Business Creation
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Test 1: Verifying automatic main branch creation on new business...';

  INSERT INTO businesses (name, owner_id, plan, status)
  VALUES ('Single Location Bakery', v_owner_user_id, 'single_location', 'active')
  RETURNING id INTO v_single_biz_id;

  SELECT id INTO v_single_main_branch_id
  FROM branches
  WHERE business_id = v_single_biz_id AND code = 'main';

  IF v_single_main_branch_id IS NULL THEN
    RAISE EXCEPTION 'FAILED: Main branch was not automatically created for single_location business';
  END IF;

  SELECT name, is_active INTO v_role, v_can_manage
  FROM branches
  WHERE id = v_single_main_branch_id;

  IF v_role <> 'Main Location' OR v_can_manage <> true THEN
    RAISE EXCEPTION 'FAILED: Main branch has incorrect defaults (name: %, is_active: %)', v_role, v_can_manage;
  END IF;

  RAISE NOTICE '  PASS: Automatic main location created successfully.';

  -- ----------------------------------------------------------------------------
  -- 2. Entitlement Enforcement: Single-Location Business (Limit = 1)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Test 2: Verifying single_location business cannot exceed 1 branch...';

  v_limit := business_location_entitlement(v_single_biz_id);
  IF v_limit <> 1 THEN
    RAISE EXCEPTION 'FAILED: business_location_entitlement returned % for single_location, expected 1', v_limit;
  END IF;

  v_error_thrown := false;
  BEGIN
    INSERT INTO branches (business_id, name, code, is_active)
    VALUES (v_single_biz_id, 'Second Branch', 'second', true);
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    RAISE NOTICE '  Caught expected exception: %', SQLERRM;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'FAILED: Single-location business was able to insert a 2nd active branch!';
  END IF;

  -- Test soft-deleted branch does not block replacement branch
  UPDATE branches SET deleted_at = now(), is_active = false WHERE id = v_single_main_branch_id;
  
  -- Now inserting a replacement active branch should succeed
  INSERT INTO branches (business_id, name, code, is_active)
  VALUES (v_single_biz_id, 'Replacement Main', 'replacement', true);

  -- Restore single_main_branch for subsequent tests
  DELETE FROM branches WHERE business_id = v_single_biz_id AND code = 'replacement';
  UPDATE branches SET deleted_at = NULL, is_active = true WHERE id = v_single_main_branch_id;

  RAISE NOTICE '  PASS: Single-location limit strictly enforced at DB level.';

  -- ----------------------------------------------------------------------------
  -- 3. Entitlement Enforcement: Multi-Location Business (Limit = 10)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Test 3: Verifying multi_location business limit (CONFIGURED_MULTI_LIMIT = 10)...';

  INSERT INTO businesses (name, owner_id, plan, status)
  VALUES ('Multi Branch Roastery', v_owner_user_id, 'multi_location', 'active')
  RETURNING id INTO v_multi_biz_id;

  SELECT id INTO v_multi_main_branch_id
  FROM branches
  WHERE business_id = v_multi_biz_id AND code = 'main';

  v_limit := business_location_entitlement(v_multi_biz_id);
  IF v_limit <> 10 THEN
    RAISE EXCEPTION 'FAILED: business_location_entitlement returned % for multi_location, expected 10', v_limit;
  END IF;

  -- Already has 1 branch (main). Insert 9 more branches (reaching 10 total).
  FOR i IN 2..10 LOOP
    INSERT INTO branches (business_id, name, code, is_active)
    VALUES (v_multi_biz_id, 'Branch ' || i, 'branch-' || i, true)
    RETURNING id INTO v_multi_branch_b_id;
  END LOOP;

  SELECT count(*) INTO v_count
  FROM branches
  WHERE business_id = v_multi_biz_id AND is_active = true AND deleted_at IS NULL;

  IF v_count <> 10 THEN
    RAISE EXCEPTION 'FAILED: Expected 10 active branches, found %', v_count;
  END IF;

  -- 11th branch must fail
  v_error_thrown := false;
  BEGIN
    INSERT INTO branches (business_id, name, code, is_active)
    VALUES (v_multi_biz_id, 'Branch 11 (Over Limit)', 'branch-11', true);
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    RAISE NOTICE '  Caught expected exception: %', SQLERRM;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'FAILED: Multi-location business was able to insert an 11th active branch!';
  END IF;

  RAISE NOTICE '  PASS: Multi-location 10-branch limit strictly enforced at DB level.';

  -- ----------------------------------------------------------------------------
  -- 4. Setup Other Business for Cross-Tenant Isolation
  -- ----------------------------------------------------------------------------
  INSERT INTO businesses (name, owner_id, plan, status)
  VALUES ('Competitor Cafe', v_other_owner_id, 'single_location', 'active')
  RETURNING id INTO v_other_biz_id;

  SELECT id INTO v_other_branch_id
  FROM branches
  WHERE business_id = v_other_biz_id AND code = 'main';

  -- ----------------------------------------------------------------------------
  -- 5. Manager Setup & Scoped Assignments
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Test 4: Setting up Manager and Cashier staff...';

  -- Create Manager in Multi Branch Roastery
  INSERT INTO staff_members (business_id, user_id, email, full_name, role, status)
  VALUES (v_multi_biz_id, v_manager_user_id, 'manager@roastery.test', 'Branch Manager A', 'manager', 'active')
  RETURNING id INTO v_staff_manager_id;

  -- Assign Manager ONLY to main branch (Location A)
  INSERT INTO staff_branch_assignments (staff_id, branch_id)
  VALUES (v_staff_manager_id, v_multi_main_branch_id);

  -- Create Cashier in Multi Branch Roastery
  INSERT INTO staff_members (business_id, user_id, email, full_name, role, status)
  VALUES (v_multi_biz_id, v_cashier_user_id, 'cashier@roastery.test', 'Cashier A', 'cashier', 'active')
  RETURNING id INTO v_staff_cashier_id;

  -- Assign Cashier to main branch
  INSERT INTO staff_branch_assignments (staff_id, branch_id)
  VALUES (v_staff_cashier_id, v_multi_main_branch_id);

  -- ----------------------------------------------------------------------------
  -- 6. Operational Access RPC Evaluation
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Test 5: Verifying operations_access RPC roles and permissions...';

  -- A) Owner check
  SELECT operational_role, can_manage, can_manage_business, managed_branch_ids
  INTO v_role, v_can_manage, v_can_manage_biz, v_managed_branch_ids
  FROM operations_access(v_multi_biz_id, v_owner_user_id);

  IF v_role <> 'owner' OR NOT v_can_manage OR NOT v_can_manage_biz THEN
    RAISE EXCEPTION 'FAILED: Owner does not have full operational management access (role: %, can_manage: %, can_biz: %)',
      v_role, v_can_manage, v_can_manage_biz;
  END IF;

  -- B) Manager check
  SELECT operational_role, can_manage, can_manage_business, managed_branch_ids
  INTO v_role, v_can_manage, v_can_manage_biz, v_managed_branch_ids
  FROM operations_access(v_multi_biz_id, v_manager_user_id);

  IF v_role <> 'manager' OR NOT v_can_manage OR v_can_manage_biz THEN
    RAISE EXCEPTION 'FAILED: Manager has incorrect permissions (role: %, can_manage: %, can_biz: %)',
      v_role, v_can_manage, v_can_manage_biz;
  END IF;

  IF NOT (v_multi_main_branch_id = ANY(v_managed_branch_ids)) OR (v_multi_branch_b_id = ANY(v_managed_branch_ids)) THEN
    RAISE EXCEPTION 'FAILED: Manager managed_branch_ids incorrect: %', v_managed_branch_ids;
  END IF;

  -- C) Cashier check
  SELECT operational_role, can_manage, can_manage_business, managed_branch_ids
  INTO v_role, v_can_manage, v_can_manage_biz, v_managed_branch_ids
  FROM operations_access(v_multi_biz_id, v_cashier_user_id);

  IF v_role <> 'cashier' OR v_can_manage OR v_can_manage_biz THEN
    RAISE EXCEPTION 'FAILED: Cashier has management rights when they should have none (role: %, can_manage: %)',
      v_role, v_can_manage;
  END IF;

  RAISE NOTICE '  PASS: operations_access correctly scopes owner, manager, and cashier.';

  -- ----------------------------------------------------------------------------
  -- 7. Manager Isolation in operations_upsert_branch
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Test 6: Verifying Manager cannot mutate unassigned branch via operations_upsert_branch...';

  -- Manager updating Location A (assigned) -> ALLOW
  PERFORM operations_upsert_branch(
    p_business_id := v_multi_biz_id,
    p_branch_id := v_multi_main_branch_id,
    p_name := 'Main Flagship',
    p_code := 'main',
    p_actor_user_id := v_manager_user_id
  );

  -- Manager updating Location B (unassigned) -> DENY
  v_error_thrown := false;
  BEGIN
    PERFORM operations_upsert_branch(
      p_business_id := v_multi_biz_id,
      p_branch_id := v_multi_branch_b_id,
      p_name := 'Hacked Branch B',
      p_code := 'branch-b',
      p_actor_user_id := v_manager_user_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    RAISE NOTICE '  Caught expected exception: %', SQLERRM;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'FAILED: Manager was able to mutate unassigned Branch B!';
  END IF;

  -- Manager creating a new branch -> DENY (Manager cannot create branches, only Owner can)
  v_error_thrown := false;
  BEGIN
    PERFORM operations_upsert_branch(
      p_business_id := v_multi_biz_id,
      p_branch_id := NULL,
      p_name := 'New Branch By Manager',
      p_code := 'mgr-new',
      p_actor_user_id := v_manager_user_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    RAISE NOTICE '  Caught expected exception: %', SQLERRM;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'FAILED: Manager was able to create a new branch!';
  END IF;

  RAISE NOTICE '  PASS: Manager cannot mutate unassigned branches or create new branches.';

  -- ----------------------------------------------------------------------------
  -- 8. Cashier Denial in operations_upsert_branch
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Test 7: Verifying Cashier cannot mutate branches...';

  v_error_thrown := false;
  BEGIN
    PERFORM operations_upsert_branch(
      p_business_id := v_multi_biz_id,
      p_branch_id := v_multi_main_branch_id,
      p_name := 'Cashier Modified Name',
      p_code := 'main',
      p_actor_user_id := v_cashier_user_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    RAISE NOTICE '  Caught expected exception: %', SQLERRM;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'FAILED: Cashier was able to mutate a branch!';
  END IF;

  RAISE NOTICE '  PASS: Cashier cannot mutate branches.';

  -- ----------------------------------------------------------------------------
  -- 9. Cross-Tenant Owner Isolation
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Test 8: Verifying Owner cannot mutate branch of another business...';

  v_error_thrown := false;
  BEGIN
    PERFORM operations_upsert_branch(
      p_business_id := v_other_biz_id,
      p_branch_id := v_other_branch_id,
      p_name := 'Comp Attack',
      p_code := 'main',
      p_actor_user_id := v_owner_user_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    RAISE NOTICE '  Caught expected exception: %', SQLERRM;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'FAILED: Owner was able to mutate branch of another business!';
  END IF;

  RAISE NOTICE '  PASS: Cross-tenant isolation strictly enforced.';

  RAISE NOTICE '=== ALL PHASE 1 FOUNDATION VERIFICATIONS PASSED ===';
END $$;

ROLLBACK;
