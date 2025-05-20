-- Migration: token_allocation_for_new_users
-- Purpose: 
-- 1. Create a dedicated system user for token allocations.
-- 2. Configure the 'Free' plan in subscription_plans with tokens_awarded.
-- 3. Create a helper function to grant initial tokens to new free users.
-- 4. Modify handle_new_user trigger to set period dates and grant initial tokens.
-- 5. Backfill period dates for existing free users.

BEGIN;

-- 1. Create a dedicated system user for token allocations
DO $$
DECLARE
  new_system_user_id uuid;
  system_user_email TEXT;
  instance_id_val uuid;
BEGIN
  new_system_user_id := gen_random_uuid();
  system_user_email := 'system-token-allocator-' || substr(replace(new_system_user_id::text, '-', ''), 1, 12) || '@internal.app';

  -- Get the instance_id, required for auth.users. It should be consistent for the Supabase instance.
  -- This typically comes from a JWT or Supabase settings. Attempt to infer it or use a common default if necessary.
  -- In a live Supabase instance, this could be fetched dynamically if context allows.
  -- For a migration, if current_setting('request.jwt.claims', true)::jsonb->>'instance_id' doesn't work,
  -- you might need to hardcode it if known, or use a common default like '00000000-0000-0000-0000-000000000000'
  -- if your local/dev Supabase setup uses that for non-authenticated service roles.
  -- A more robust way might be to query it from an existing user if one exists.
  SELECT COALESCE(
      (SELECT ins.id FROM auth.instances ins LIMIT 1),
      '00000000-0000-0000-0000-000000000000'::uuid -- Fallback if auth.instances is empty or not accessible
  ) INTO instance_id_val;

  RAISE LOG 'Creating system user with ID: %, Email: %', new_system_user_id, system_user_email;

  -- Insert into auth.users
  -- Using a placeholder for encrypted_password as this user should not log in via password.
  -- Key fields: id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, 
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    new_system_user_id, instance_id_val, 'authenticated', 'authenticated', system_user_email, '$SYSTEM_USER_NO_LOGIN$', 
    NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert into auth.identities
  -- Key fields: id (identity's own UUID), user_id, identity_data, provider, provider_id, created_at, updated_at
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), new_system_user_id, 
    jsonb_build_object('sub', new_system_user_id, 'email', system_user_email), 
    'email', system_user_email, NOW(), NOW()
  )
  ON CONFLICT (provider, provider_id) DO NOTHING; -- Assuming unique constraint on (provider, provider_id)

  -- Create the temp table and store the new system user ID
  DROP TABLE IF EXISTS _vars;
  CREATE TEMP TABLE _vars (system_user_id uuid PRIMARY KEY);
  INSERT INTO _vars (system_user_id) VALUES (new_system_user_id);

  RAISE LOG 'System user % created and ID stored in _vars.', system_user_email;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[System User Creation] Error creating system user: %', SQLERRM;
        -- If system user creation fails, ensure _vars might still get a fallback or the script might need to halt.
        -- For now, we let it proceed, and subsequent functions will fail if system_user_id is not in _vars.
        DROP TABLE IF EXISTS _vars; -- Clean up if error before population
        CREATE TEMP TABLE _vars (system_user_id uuid PRIMARY KEY);
        INSERT INTO _vars (system_user_id) VALUES ('00000000-0000-0000-0000-000000000000'::uuid); -- Fallback placeholder
        RAISE WARNING '[System User Creation] Using fallback placeholder for system_user_id due to error.';
END $$;


-- 2. Configure the 'Free' plan in subscription_plans
UPDATE public.subscription_plans
SET
    tokens_awarded = 100000,
    item_id_internal = 'SYSTEM_FREE_TIER_MONTHLY_ALLOWANCE', -- Unique internal identifier
    plan_type = 'subscription', -- Explicitly set plan type
    interval = 'month', -- Ensure interval is month
    interval_count = 1     -- Ensure interval count is 1
WHERE
    name = 'Free'; 
    -- Or, if more reliable: stripe_price_id = 'price_FREE';

-- Ensure the 'Free' plan exists, otherwise the update does nothing.
-- If it might not exist, consider an INSERT ON CONFLICT DO UPDATE.
-- For this script, we assume the 'Free' plan was seeded by a previous migration.

-- 3. Create helper function to grant initial tokens and call record_token_transaction
CREATE OR REPLACE FUNCTION public.grant_initial_free_tokens_to_user(
    p_user_id uuid,
    p_free_plan_id uuid
    -- p_system_user_id parameter removed, will be fetched from _vars
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tokens_to_award NUMERIC;
    v_target_wallet_id uuid;
    v_system_user_id uuid;
BEGIN
    -- Get system user ID from temp table
    SELECT system_user_id INTO v_system_user_id FROM _vars LIMIT 1;
    IF v_system_user_id IS NULL THEN
        RAISE EXCEPTION '[grant_initial_free_tokens_to_user] System user ID is not set in _vars.';
    END IF;

    SELECT tokens_awarded INTO v_tokens_to_award
    FROM public.subscription_plans
    WHERE id = p_free_plan_id AND name = 'Free';

    IF v_tokens_to_award IS NULL OR v_tokens_to_award <= 0 THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Free plan ID % (user %) not found or has no tokens to award.', p_free_plan_id, p_user_id;
        RETURN;
    END IF;

    SELECT wallet_id INTO v_target_wallet_id
    FROM public.token_wallets
    WHERE user_id = p_user_id AND organization_id IS NULL;

    IF v_target_wallet_id IS NULL THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Token wallet not found for user ID %.', p_user_id;
        RETURN;
    END IF;

    PERFORM public.record_token_transaction(
        p_wallet_id := v_target_wallet_id,
        p_transaction_type := 'CREDIT_INITIAL_FREE_ALLOCATION',
        p_amount := v_tokens_to_award,
        p_recorded_by_user_id := v_system_user_id,
        p_related_entity_id := p_free_plan_id,
        p_related_entity_type := 'subscription_plans',
        p_notes := 'Initial token allocation for new free plan user.',
        p_idempotency_key := 'initial_free_' || p_user_id::text || '_' || p_free_plan_id::text
    );

    RAISE LOG '[grant_initial_free_tokens_to_user] Awarded % tokens to user % for free plan %.', v_tokens_to_award, p_user_id, p_free_plan_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Error awarding tokens to user %: %', p_user_id, SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.grant_initial_free_tokens_to_user(uuid, uuid) IS 'Grants initial tokens to a new user for the free plan by calling record_token_transaction, using system_user_id from _vars.';


-- 4. Modify handle_new_user trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_free_plan_id uuid;
  -- v_system_user_id uuid; -- No longer needed as parameter for grant_initial_free_tokens_to_user
BEGIN
  INSERT INTO public.user_profiles (id, role, first_name)
  VALUES (NEW.id, 'user', NEW.raw_user_meta_data ->> 'first_name')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.token_wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) WHERE organization_id IS NULL DO NOTHING;

  SELECT id INTO v_free_plan_id FROM public.subscription_plans WHERE name = 'Free' LIMIT 1;

  IF v_free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (
        user_id, plan_id, status, current_period_start, current_period_end
    )
    VALUES (
        NEW.id, v_free_plan_id, 'free', NOW(), NOW() + interval '1 month'
    )
    ON CONFLICT (user_id) DO NOTHING;

    IF EXISTS (SELECT 1 FROM public.user_subscriptions us WHERE us.user_id = NEW.id AND us.plan_id = v_free_plan_id AND us.status = 'free') THEN
        RAISE LOG '[handle_new_user] Calling grant_initial_free_tokens_to_user for user_id: %, free_plan_id: %', NEW.id, v_free_plan_id;
        PERFORM public.grant_initial_free_tokens_to_user(NEW.id, v_free_plan_id);
    ELSE
        RAISE LOG '[handle_new_user] Did not grant initial tokens. Free subscription not found/inserted for user_id: %, free_plan_id: %', NEW.id, v_free_plan_id;
    END IF;
  ELSE
      RAISE LOG '[handle_new_user] Free plan not found. Cannot assign free subscription or tokens to user_id: %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS 'Ensures new user has profile, wallet, default free subscription with period dates, and initial free tokens.';


-- 5. Backfill current_period_start and current_period_end for existing free users
-- Only updates rows where these are NULL to avoid overwriting existing valid data.
WITH free_plan_details AS (
    SELECT id as free_plan_id FROM public.subscription_plans WHERE name = 'Free' LIMIT 1
)
UPDATE public.user_subscriptions us
SET
    current_period_start = COALESCE(us.current_period_start, us.created_at),
    current_period_end = COALESCE(us.current_period_end, us.created_at + interval '1 month')
FROM free_plan_details fpd
WHERE
    us.plan_id = fpd.free_plan_id
    AND us.status = 'free'
    AND (us.current_period_start IS NULL OR us.current_period_end IS NULL);

-- Note: This backfill does NOT grant tokens to existing free users.
-- Their first token grant will occur when the periodic allocation Edge Function runs
-- and finds their current_period_end is in the past.
-- If immediate tokens are needed for existing users who never received any,
-- a separate one-time script would be required after this migration.

DROP TABLE IF EXISTS _vars; -- Clean up temp table

COMMIT;
