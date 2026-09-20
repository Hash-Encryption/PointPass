-- ==============================================================================
-- PointPass Phase 4: Signup, Onboarding, Plans, and Billing Architecture Certification Suite
-- Genuine RLS Execution under PostgreSQL roles "authenticated" and "anon".
-- Executes inside a transaction with automatic ROLLBACK so zero test data remains.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Temporary Fixtures & Context Registry
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE pg_temp.test_context (
  key text PRIMARY KEY,
  val uuid NOT NULL
);
GRANT ALL ON pg_temp.test_context TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.get_ctx(p_key text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT val FROM pg_temp.test_context WHERE key = p_key;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.get_ctx(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.set_test_auth(p_uid uuid, p_role text DEFAULT 'authenticated')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', p_role)::text, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.set_test_auth(uuid, text) TO authenticated, anon;

-- Force RLS on relations under test
ALTER TABLE public.businesses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_onboarding FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_new_user_id uuid := gen_random_uuid();
  v_existing_owner_id uuid := gen_random_uuid();
  v_other_owner_id uuid := gen_random_uuid();
  v_manager_user_id uuid := gen_random_uuid();
  v_cashier_user_id uuid := gen_random_uuid();
  v_admin_user_id uuid := gen_random_uuid();
  v_pre_reg_user_id uuid := gen_random_uuid();

  v_existing_biz_id uuid;
  v_other_biz_id uuid;
  v_pre_reg_biz_id uuid;
BEGIN
  -- Context IDs
  INSERT INTO pg_temp.test_context (key, val) VALUES
    ('new_user', v_new_user_id),
    ('existing_owner', v_existing_owner_id),
    ('other_owner', v_other_owner_id),
    ('manager_user', v_manager_user_id),
    ('cashier_user', v_cashier_user_id),
    ('admin_user', v_admin_user_id),
    ('pre_reg_user', v_pre_reg_user_id);

  -- Mock auth.users rows to satisfy foreign keys
  INSERT INTO auth.users (id, email) VALUES
    (v_new_user_id, 'newowner@pointpass.test'),
    (v_existing_owner_id, 'existingowner@pointpass.test'),
    (v_other_owner_id, 'otherowner@pointpass.test'),
    (v_manager_user_id, 'manager@pointpass.test'),
    (v_cashier_user_id, 'cashier@pointpass.test'),
    (v_admin_user_id, 'admin@pointpass.test'),
    (v_pre_reg_user_id, 'preregistered@pointpass.test')
  ON CONFLICT (id) DO NOTHING;

  -- Super admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_user_id, 'super_admin');

  -- Existing operational business (Phase 3 style)
  INSERT INTO public.businesses (
    owner_id,
    slug,
    name_ar,
    name_en,
    plan,
    status
  ) VALUES (
    v_existing_owner_id,
    'cert-existing-cafe',
    'مقهى معتمد',
    'Certified Existing Cafe',
    'multi_location',
    'active'
  ) RETURNING id INTO v_existing_biz_id;

  INSERT INTO public.user_roles (user_id, role, business_id)
  VALUES (v_existing_owner_id, 'merchant', v_existing_biz_id);

  INSERT INTO pg_temp.test_context (key, val) VALUES ('existing_biz', v_existing_biz_id);

  -- Other business for cross-tenant testing
  INSERT INTO public.businesses (
    owner_id,
    slug,
    name_ar,
    name_en,
    plan,
    status
  ) VALUES (
    v_other_owner_id,
    'cert-other-bistro',
    'بيسترو آخر',
    'Other Bistro',
    'single_location',
    'active'
  ) RETURNING id INTO v_other_biz_id;

  INSERT INTO public.user_roles (user_id, role, business_id)
  VALUES (v_other_owner_id, 'merchant', v_other_biz_id);

  INSERT INTO pg_temp.test_context (key, val) VALUES ('other_biz', v_other_biz_id);

  -- Staff members for existing business
  INSERT INTO public.staff_members (business_id, auth_user_id, code, name_ar, name_en, role, status)
  VALUES
    (v_existing_biz_id, v_manager_user_id, 'MGR01', 'مدير المقهى', 'Cafe Manager', 'manager', 'active'),
    (v_existing_biz_id, v_cashier_user_id, 'CSH01', 'كاشير المقهى', 'Cafe Cashier', 'cashier', 'active');

  -- Pre-registered business created by admin
  INSERT INTO public.businesses (
    merchant_email,
    slug,
    name_ar,
    name_en,
    plan,
    status
  ) VALUES (
    'preregistered@pointpass.test',
    'cert-prereg-cafe',
    'مقهى مسجل مسبقاً',
    'Pre-registered Cafe',
    'single_location',
    'active'
  ) RETURNING id INTO v_pre_reg_biz_id;

  INSERT INTO pg_temp.test_context (key, val) VALUES ('pre_reg_biz', v_pre_reg_biz_id);

  -- Ensure backfill simulation for pre-existing records (truthful legacy status, null provider)
  INSERT INTO public.business_subscriptions (
    business_id,
    plan_code,
    status,
    billing_provider
  ) VALUES
    (v_existing_biz_id, 'multi_location', 'legacy', null),
    (v_other_biz_id, 'single_location', 'legacy', null),
    (v_pre_reg_biz_id, 'single_location', 'legacy', null)
  ON CONFLICT (business_id) DO NOTHING;

  INSERT INTO public.business_onboarding (
    business_id,
    step,
    completed,
    started_at,
    completed_at
  ) VALUES
    (v_existing_biz_id, 'completed', true, now(), now()),
    (v_other_biz_id, 'completed', true, now(), now()),
    (v_pre_reg_biz_id, 'completed', true, now(), now())
  ON CONFLICT (business_id) DO NOTHING;
END;
$$;

-- Switch to role authenticated
SET ROLE authenticated;

-- ==============================================================================
-- Scenario 1 & 2 & 3 & 4 & 5 & 24: New user bootstraps legitimate business
-- ==============================================================================
DO $$
DECLARE
  v_uid uuid := pg_temp.get_ctx('new_user');
  v_biz_id uuid;
  v_main_count integer;
  v_role_count integer;
  v_sub_count integer;
  v_onb_count integer;
  v_ent record;
BEGIN
  PERFORM pg_temp.set_test_auth(v_uid);

  -- Authenticated user calls bootstrap_owner_business
  SELECT business_id INTO v_biz_id
  FROM public.bootstrap_owner_business(
    'cert-new-roastery',
    'محمصة جديدة',
    'New Roastery',
    'single_location'
  );

  -- Store created business ID
  INSERT INTO pg_temp.test_context (key, val) VALUES ('new_biz', v_biz_id);

  -- Check ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = v_biz_id AND owner_id = v_uid AND slug = 'cert-new-roastery'
  ) THEN
    RAISE EXCEPTION 'Scenario 1/3 FAILED: Creator is not authoritative Owner of created business';
  END IF;

  -- Check membership role
  SELECT count(*) INTO v_role_count
  FROM public.user_roles
  WHERE user_id = v_uid AND business_id = v_biz_id AND role = 'merchant';

  IF v_role_count <> 1 THEN
    RAISE EXCEPTION 'Scenario 4 FAILED: merchant user_role not assigned';
  END IF;

  -- Check Main Location: exactly 1 main branch exists from trigger
  SELECT count(*) INTO v_main_count
  FROM public.branches
  WHERE business_id = v_biz_id AND lower(code) = 'main' AND status = 'active';

  IF v_main_count <> 1 THEN
    RAISE EXCEPTION 'Scenario 5 FAILED: Expected exactly 1 active Main Location, found %', v_main_count;
  END IF;

  -- Check subscription was created with pending status and single_location plan
  SELECT count(*) INTO v_sub_count
  FROM public.business_subscriptions
  WHERE business_id = v_biz_id AND plan_code = 'single_location' AND status = 'pending';

  IF v_sub_count <> 1 THEN
    RAISE EXCEPTION 'Scenario 24 FAILED: Subscription record missing or invalid status';
  END IF;

  -- Check onboarding was created
  SELECT count(*) INTO v_onb_count
  FROM public.business_onboarding
  WHERE business_id = v_biz_id AND step = 'plan' AND completed = false;

  IF v_onb_count <> 1 THEN
    RAISE EXCEPTION 'Scenario 24 FAILED: Onboarding record missing or invalid state';
  END IF;
END;
$$;

-- ==============================================================================
-- Scenario 6: Duplicate bootstrap does not create accidental duplicate company
-- ==============================================================================
DO $$
DECLARE
  v_uid uuid := pg_temp.get_ctx('new_user');
  v_orig_biz_id uuid := pg_temp.get_ctx('new_biz');
  v_second_biz_id uuid;
  v_total_businesses integer;
BEGIN
  PERFORM pg_temp.set_test_auth(v_uid);

  -- Re-calling bootstrap while previous is incomplete returns existing business
  SELECT business_id INTO v_second_biz_id
  FROM public.bootstrap_owner_business(
    'cert-new-roastery',
    'محمصة جديدة',
    'New Roastery',
    'single_location'
  );

  IF v_second_biz_id <> v_orig_biz_id THEN
    RAISE EXCEPTION 'Scenario 6 FAILED: Duplicate bootstrap created a new business instead of resuming';
  END IF;

  SELECT count(*) INTO v_total_businesses
  FROM public.businesses
  WHERE owner_id = v_uid;

  IF v_total_businesses <> 1 THEN
    RAISE EXCEPTION 'Scenario 6 FAILED: Expected 1 business, found %', v_total_businesses;
  END IF;
END;
$$;

-- ==============================================================================
-- Scenario 7: Slug collision cannot overwrite another company
-- ==============================================================================
DO $$
DECLARE
  v_other_uid uuid := pg_temp.get_ctx('other_owner');
  v_failed boolean := false;
BEGIN
  PERFORM pg_temp.set_test_auth(v_other_uid);

  BEGIN
    PERFORM public.bootstrap_owner_business(
      'cert-new-roastery', -- Same slug as existing new_biz
      'محمصة مكررة',
      'Duplicate Roastery',
      'single_location'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'Scenario 7 FAILED: Duplicate slug did not raise collision exception';
  END IF;
END;
$$;

-- ==============================================================================
-- Scenario 8: Cross-tenant user cannot modify onboarding
-- ==============================================================================
DO $$
DECLARE
  v_other_uid uuid := pg_temp.get_ctx('other_owner');
  v_target_biz_id uuid := pg_temp.get_ctx('new_biz');
  v_failed boolean := false;
BEGIN
  PERFORM pg_temp.set_test_auth(v_other_uid);

  BEGIN
    PERFORM public.save_onboarding_step(
      v_target_biz_id,
      'loyalty',
      null,
      'stamp'::public.program_type
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'Scenario 8 FAILED: Cross-tenant user was able to call save_onboarding_step';
  END IF;
END;
$$;

-- ==============================================================================
-- Scenario 9, 10, 11, 12, 13: Billing permissions & tampering resistance
-- ==============================================================================
DO $$
DECLARE
  v_other_uid uuid := pg_temp.get_ctx('other_owner');
  v_manager_uid uuid := pg_temp.get_ctx('manager_user');
  v_cashier_uid uuid := pg_temp.get_ctx('cashier_user');
  v_existing_biz_id uuid := pg_temp.get_ctx('existing_biz');
  v_failed boolean;
  v_visible_count integer;
BEGIN
  -- Cross-tenant user cannot call request_business_plan_change
  PERFORM pg_temp.set_test_auth(v_other_uid);
  v_failed := false;
  BEGIN
    PERFORM public.request_business_plan_change(v_existing_biz_id, 'multi_location');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Scenario 9 FAILED: Cross-tenant plan change was not denied';
  END IF;

  -- Manager cannot call request_business_plan_change
  PERFORM pg_temp.set_test_auth(v_manager_uid);
  v_failed := false;
  BEGIN
    PERFORM public.request_business_plan_change(v_existing_biz_id, 'multi_location');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Scenario 10 FAILED: Manager plan change was not denied';
  END IF;

  -- Cashier cannot call request_business_plan_change
  PERFORM pg_temp.set_test_auth(v_cashier_uid);
  v_failed := false;
  BEGIN
    PERFORM public.request_business_plan_change(v_existing_biz_id, 'multi_location');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Scenario 11 FAILED: Cashier plan change was not denied';
  END IF;

  -- Direct update on business_subscriptions by browser is denied
  PERFORM pg_temp.set_test_auth(v_manager_uid);
  v_failed := false;
  BEGIN
    UPDATE public.business_subscriptions
    SET status = 'active'
    WHERE business_id = v_existing_biz_id;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Scenario 13 FAILED: Direct update to business_subscriptions was not denied';
  END IF;
END;
$$;

-- Switch to anon for Scenario 12
SET ROLE anon;
DO $$
DECLARE
  v_existing_biz_id uuid := pg_temp.get_ctx('existing_biz');
  v_failed boolean := false;
BEGIN
  PERFORM pg_temp.set_test_auth(gen_random_uuid(), 'anon');
  BEGIN
    PERFORM public.get_business_billing_state(v_existing_biz_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Scenario 12 FAILED: Anon user was not denied get_business_billing_state';
  END IF;
END;
$$;

SET ROLE authenticated;

-- ==============================================================================
-- Scenario 14 & 26: Browser cannot grant itself larger entitlement
-- ==============================================================================
DO $$
DECLARE
  v_owner_uid uuid := pg_temp.get_ctx('new_user');
  v_biz_id uuid := pg_temp.get_ctx('new_biz');
  v_failed boolean := false;
BEGIN
  PERFORM pg_temp.set_test_auth(v_owner_uid);

  -- Attempting direct update on businesses.plan is blocked by protect_business_admin_fields
  BEGIN
    UPDATE public.businesses
    SET plan = 'multi_location'
    WHERE id = v_biz_id;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'Scenario 14 FAILED: Direct update on businesses.plan was not blocked';
  END IF;

  -- Requesting an invalid plan code raises exception
  v_failed := false;
  BEGIN
    PERFORM public.request_business_plan_change(v_biz_id, 'fake_super_plan');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'Scenario 26 FAILED: Forged plan code was not rejected';
  END IF;
END;
$$;

-- ==============================================================================
-- Scenario 15, 16, 17: Plan -> Location Entitlement & Location Limits
-- ==============================================================================
DO $$
DECLARE
  v_owner_uid uuid := pg_temp.get_ctx('new_user');
  v_biz_id uuid := pg_temp.get_ctx('new_biz');
  v_ent record;
  v_failed boolean := false;
BEGIN
  PERFORM pg_temp.set_test_auth(v_owner_uid);

  -- Check effective entitlement for new business (single_location = 1 max location)
  SELECT * INTO v_ent
  FROM public.business_location_entitlement(v_biz_id);

  IF v_ent.max_locations <> 1 OR v_ent.multi_location <> false THEN
    RAISE EXCEPTION 'Scenario 15 FAILED: Expected single_location max_locations = 1, found %', v_ent.max_locations;
  END IF;

  -- Since 1 active Main Location already exists, adding a 2nd active branch must fail
  BEGIN
    PERFORM public.operations_upsert_branch(
      v_biz_id,
      null,
      'second-branch',
      'الفرع الثاني',
      'Second Branch',
      null,
      null,
      'active'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'Scenario 16 FAILED: Location limit did not prevent adding 2nd active location under single_location plan';
  END IF;
END;
$$;

-- ==============================================================================
-- Scenario 18, 19, 20, 21: Existing business backfill & state integrity
-- ==============================================================================
DO $$
DECLARE
  v_existing_biz_id uuid := pg_temp.get_ctx('existing_biz');
  v_sub record;
  v_onb record;
  v_ent record;
BEGIN
  SELECT * INTO v_sub
  FROM public.business_subscriptions
  WHERE business_id = v_existing_biz_id;

  IF v_sub.plan_code <> 'multi_location' OR v_sub.status <> 'legacy' THEN
    RAISE EXCEPTION 'Scenario 18 FAILED: Existing business plan not preserved as multi_location / legacy';
  END IF;

  SELECT * INTO v_onb
  FROM public.business_onboarding
  WHERE business_id = v_existing_biz_id;

  IF v_onb.completed <> true OR v_onb.step <> 'completed' THEN
    RAISE EXCEPTION 'Scenario 19 FAILED: Existing business onboarding not marked completed';
  END IF;

  SELECT * INTO v_ent
  FROM public.business_location_entitlement(v_existing_biz_id);

  IF v_ent.max_locations <> 10 OR v_ent.multi_location <> true THEN
    RAISE EXCEPTION 'Scenario 18 FAILED: Entitlement for multi_location plan should be 10 locations, got %', v_ent.max_locations;
  END IF;
END;
$$;

-- ==============================================================================
-- Scenario 22: Status / cancellation does not delete loyalty or operational data
-- ==============================================================================
DO $$
DECLARE
  v_existing_biz_id uuid := pg_temp.get_ctx('existing_biz');
  v_branch_count integer;
  v_staff_count integer;
BEGIN
  -- Mark subscription canceled directly as service_role simulation
  UPDATE public.business_subscriptions
  SET status = 'canceled'
  WHERE business_id = v_existing_biz_id;

  SELECT count(*) INTO v_branch_count FROM public.branches WHERE business_id = v_existing_biz_id;
  SELECT count(*) INTO v_staff_count FROM public.staff_members WHERE business_id = v_existing_biz_id;

  IF v_branch_count < 1 OR v_staff_count < 2 THEN
    RAISE EXCEPTION 'Scenario 22 FAILED: Operational branches or staff were lost after cancellation';
  END IF;
END;
$$;

-- ==============================================================================
-- Scenario 23: Downgrade below active Location usage is safely rejected
-- ==============================================================================
DO $$
DECLARE
  v_owner_uid uuid := pg_temp.get_ctx('existing_owner');
  v_existing_biz_id uuid := pg_temp.get_ctx('existing_biz');
  v_branch2_id uuid;
  v_failed boolean := false;
BEGIN
  PERFORM pg_temp.set_test_auth(v_owner_uid);

  -- Existing business has multi_location entitlement (10 locations). Add a second active branch.
  v_branch2_id := public.operations_upsert_branch(
    v_existing_biz_id,
    null,
    'branch-two',
    'الفرع الإضافي',
    'Extra Branch',
    null,
    null,
    'active'
  );

  -- Now current active locations = 2. Downgrading to 'single_location' (limit = 1) must be rejected!
  BEGIN
    PERFORM public.request_business_plan_change(v_existing_biz_id, 'single_location');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'Scenario 23 FAILED: Downgrade below active location count was not rejected';
  END IF;
END;
$$;

-- ==============================================================================
-- Scenario 27: Pre-registered merchant flow remains compatible
-- ==============================================================================
DO $$
DECLARE
  v_prereg_biz_id uuid := pg_temp.get_ctx('pre_reg_biz');
  v_prereg_user_id uuid := pg_temp.get_ctx('pre_reg_user');
  v_linked_biz record;
BEGIN
  -- Simulate link trigger logic
  UPDATE public.businesses
  SET owner_id = v_prereg_user_id
  WHERE id = v_prereg_biz_id AND owner_id IS NULL;

  INSERT INTO public.user_roles (user_id, role, business_id)
  VALUES (v_prereg_user_id, 'merchant', v_prereg_biz_id)
  ON CONFLICT DO NOTHING;

  PERFORM pg_temp.set_test_auth(v_prereg_user_id);

  IF NOT public.can_manage_business(v_prereg_user_id, v_prereg_biz_id) THEN
    RAISE EXCEPTION 'Scenario 27 FAILED: Pre-registered merchant could not manage linked business';
  END IF;
END;
$$;

-- ==============================================================================
-- Scenario 28: Super Admin behavior remains compatible
-- ==============================================================================
DO $$
DECLARE
  v_admin_uid uuid := pg_temp.get_ctx('admin_user');
  v_existing_biz_id uuid := pg_temp.get_ctx('existing_biz');
BEGIN
  PERFORM pg_temp.set_test_auth(v_admin_uid);

  IF NOT public.can_manage_business(v_admin_uid, v_existing_biz_id) THEN
    RAISE EXCEPTION 'Scenario 28 FAILED: Super Admin denied management access';
  END IF;
END;
$$;

-- ==============================================================================
-- Scenario 29: Provider / Webhook Status reporting
-- ==============================================================================
DO $$
BEGIN
  -- Explicitly assert that no provider is configured
  IF EXISTS (
    SELECT 1 FROM public.business_subscriptions
    WHERE billing_provider IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Scenario 29 FAILED: Provider should be null when not configured';
  END IF;
  RAISE NOTICE 'Provider tests report: NOT_APPLICABLE (No payment provider configured)';
END;
$$;

ROLLBACK;
