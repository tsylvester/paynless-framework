-- Tier infrastructure: reference tiers, plan/subscription/provider columns, tier computation,
-- consolidated new-user setup (profile, wallet, free subscription, tokens, newsletter webhook).
-- Tier assignment uses output cost bands (< 10 → free, 10–20 → basic, ≥ 20 → premium).
-- No model gets tier 30 (ultra) from cost — ultra's value is non-model incentives.
-- The sync pipeline uses the same bands for new inserts. Maintainer adjusts individual models after review.

-- Extensions for newsletter webhook (preserved from 20260416000000_add_auth_hook_on_user_created.sql)
CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;

-- Reference tiers
CREATE TABLE public.tier_definitions (
  level INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  output_cap_tokens INTEGER,
  max_models_per_project INTEGER
);

INSERT INTO public.tier_definitions (level, name, output_cap_tokens, max_models_per_project)
VALUES
  (0, 'free', 8192, 1),
  (10, 'basic', 32768, 2),
  (20, 'premium', 131072, 3),
  (30, 'ultra', NULL, NULL);

ALTER TABLE public.tier_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tier_definitions_select"
  ON public.tier_definitions
  FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.subscription_plans
  ADD COLUMN tier_level INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_tier_level_fk
  FOREIGN KEY (tier_level) REFERENCES public.tier_definitions (level);

ALTER TABLE public.user_subscriptions
  ADD COLUMN has_ever_paid BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.user_subscriptions
  ADD COLUMN tier_level INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_tier_level_fk
  FOREIGN KEY (tier_level) REFERENCES public.tier_definitions (level);

ALTER TABLE public.ai_providers
  ADD COLUMN min_plan_tier_level INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.ai_providers
  ADD CONSTRAINT ai_providers_min_plan_tier_level_fk
  FOREIGN KEY (min_plan_tier_level) REFERENCES public.tier_definitions (level);

CREATE OR REPLACE FUNCTION public.current_plan_tier(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_ever_paid BOOLEAN;
  v_tier INTEGER;
BEGIN
  SELECT us.has_ever_paid
  INTO v_has_ever_paid
  FROM public.user_subscriptions us
  WHERE us.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_has_ever_paid IS NOT TRUE THEN
    RETURN 0;
  END IF;

  SELECT sp.tier_level
  INTO v_tier
  FROM public.user_subscriptions us
  INNER JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
  LIMIT 1;

  IF FOUND THEN
    RETURN v_tier;
  END IF;

  RETURN 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_user_tier(p_user_id UUID, p_set_ratchet BOOLEAN)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier_level INTEGER;
  v_rows_affected INTEGER;
BEGIN
  IF p_set_ratchet THEN
    UPDATE public.user_subscriptions
    SET has_ever_paid = true
    WHERE user_id = p_user_id;
  END IF;

  v_tier_level := public.current_plan_tier(p_user_id);

  UPDATE public.user_subscriptions
  SET tier_level = v_tier_level,
      updated_at = now()
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE WARNING '[refresh_user_tier] No user_subscriptions row found for user_id %. This function is triggered by subscription state transitions and should not be reached without a subscription record.', p_user_id;
    RETURN -1;
  END IF;

  RETURN v_tier_level;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := NEW.id;
  v_user_email TEXT := NEW.email;
  v_raw_user_meta_data JSONB := NEW.raw_user_meta_data;

  v_profile_first_name TEXT;

  v_free_plan_id UUID;
  v_tokens_to_award NUMERIC;
  v_target_wallet_id UUID;
  v_current_wallet_balance NUMERIC;
  v_new_wallet_balance NUMERIC;

  v_system_user_id UUID;
  v_system_user_email_pattern TEXT := 'system-token-allocator-%@internal.app';
  v_idempotency_key_grant TEXT;

  request_id BIGINT;
  service_role_key TEXT;
  supabase_url TEXT;
BEGIN
  RAISE LOG '[handle_new_user] Processing new user ID: %, Email: %', v_user_id, v_user_email;

  v_profile_first_name := v_raw_user_meta_data ->> 'first_name';
  INSERT INTO public.user_profiles (id, role, first_name)
  VALUES (v_user_id, 'user', v_profile_first_name)
  ON CONFLICT (id) DO NOTHING;
  RAISE LOG '[handle_new_user] Ensured profile for user ID: %.', v_user_id;

  INSERT INTO public.token_wallets (user_id, currency)
  VALUES (v_user_id, 'AI_TOKEN')
  ON CONFLICT (user_id) WHERE organization_id IS NULL
  DO NOTHING
  RETURNING wallet_id INTO v_target_wallet_id;

  IF v_target_wallet_id IS NULL THEN
    SELECT wallet_id INTO v_target_wallet_id
    FROM public.token_wallets
    WHERE user_id = v_user_id AND organization_id IS NULL;
  END IF;

  IF v_target_wallet_id IS NULL THEN
    RAISE WARNING '[handle_new_user] Failed to create or find personal wallet for user ID: %. Aborting token grant.', v_user_id;
    RETURN NEW;
  END IF;
  RAISE LOG '[handle_new_user] Ensured wallet ID: % for user ID: %.', v_target_wallet_id, v_user_id;

  SELECT id, tokens_to_award INTO v_free_plan_id, v_tokens_to_award
  FROM public.subscription_plans
  WHERE name = 'Free'
  LIMIT 1;

  IF v_free_plan_id IS NULL THEN
    RAISE LOG '[handle_new_user] ''Free'' plan not found. No initial tokens will be granted for user ID: %.', v_user_id;
  ELSIF v_tokens_to_award IS NULL OR v_tokens_to_award <= 0 THEN
    RAISE LOG '[handle_new_user] ''Free'' plan (ID: %) found, but tokens_to_award is not positive (Value: %). No initial tokens for user ID: %.', v_free_plan_id, v_tokens_to_award, v_user_id;
  ELSE
    RAISE LOG '[handle_new_user] ''Free'' plan ID: % found with % tokens to award for user ID: %.', v_free_plan_id, v_tokens_to_award, v_user_id;

    INSERT INTO public.user_subscriptions (
      user_id,
      plan_id,
      status,
      current_period_start,
      current_period_end,
      has_ever_paid,
      tier_level
    )
    VALUES (
      v_user_id,
      v_free_plan_id,
      'free',
      NOW(),
      NOW() + interval '1 month',
      false,
      0
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      status = EXCLUDED.status,
      updated_at = NOW(),
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      tier_level = EXCLUDED.tier_level
    WHERE public.user_subscriptions.status <> 'free';

    RAISE LOG '[handle_new_user] Ensured user % subscribed to Free plan %.', v_user_id, v_free_plan_id;

    SELECT id INTO v_system_user_id
    FROM auth.users
    WHERE email LIKE v_system_user_email_pattern
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_system_user_id IS NULL THEN
      RAISE WARNING '[handle_new_user] System user for token allocation (pattern: %) not found. Grant for user % will be recorded by the user themselves.', v_system_user_email_pattern, v_user_id;
    END IF;

    v_idempotency_key_grant := 'initial_free_grant_' || v_user_id::text || '_' || v_free_plan_id::text;

    IF EXISTS (
      SELECT 1
      FROM public.token_wallet_transactions
      WHERE wallet_id = v_target_wallet_id
        AND idempotency_key = v_idempotency_key_grant
    ) THEN
      RAISE LOG '[handle_new_user] Initial free tokens (Plan ID: %) already granted to user ID: % (Wallet: %) via idempotency key: %.', v_free_plan_id, v_user_id, v_target_wallet_id, v_idempotency_key_grant;
    ELSE
      RAISE LOG '[handle_new_user] Attempting to grant % tokens to wallet % for user % by system user (or self): %.', v_tokens_to_award, v_target_wallet_id, v_user_id, COALESCE(v_system_user_id, v_user_id);
      BEGIN
        SELECT balance INTO v_current_wallet_balance
        FROM public.token_wallets
        WHERE wallet_id = v_target_wallet_id
        FOR UPDATE;

        v_new_wallet_balance := v_current_wallet_balance + v_tokens_to_award;

        UPDATE public.token_wallets
        SET balance = v_new_wallet_balance,
            updated_at = now()
        WHERE public.token_wallets.wallet_id = v_target_wallet_id;

        INSERT INTO public.token_wallet_transactions (
          wallet_id,
          transaction_type,
          amount,
          balance_after_txn,
          recorded_by_user_id,
          related_entity_id,
          related_entity_type,
          notes,
          idempotency_key
        )
        VALUES (
          v_target_wallet_id,
          'CREDIT_INITIAL_FREE_ALLOCATION',
          v_tokens_to_award,
          v_new_wallet_balance,
          COALESCE(v_system_user_id, v_user_id),
          v_free_plan_id::TEXT,
          'subscription_plans',
          'Initial token allocation for new free plan user.',
          v_idempotency_key_grant
        );
        RAISE LOG '[handle_new_user] Successfully granted % tokens to wallet % (User ID: %). New balance: %.', v_tokens_to_award, v_target_wallet_id, v_user_id, v_new_wallet_balance;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING '[handle_new_user] Error during token grant transaction for user ID %: %.', v_user_id, SQLERRM;
      END;
    END IF;
  END IF;

  BEGIN
    service_role_key := current_setting('app.settings.jwt_secret', true);
    supabase_url := 'http://supabase_kong_paynless-framework:8000';

    SELECT extensions.http_post(
      url := supabase_url || '/functions/v1/on-user-created',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'users',
        'schema', 'auth',
        'record', row_to_json(NEW)
      )::text
    ) INTO request_id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to call on-user-created webhook: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] Unexpected error for user ID % (Email: %): %.', COALESCE(v_user_id, 'UNKNOWN_USER_ID'), COALESCE(v_user_email, 'UNKNOWN_EMAIL'), SQLERRM;
    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_plan_tier(UUID) TO service_role, authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_user_tier(UUID, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_user_tier(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_user_tier(UUID, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_user_tier(UUID, BOOLEAN) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

UPDATE public.subscription_plans
SET tier_level = 0
WHERE item_id_internal = 'SYSTEM_FREE_TIER_MONTHLY_ALLOWANCE'
   OR name = 'Free';

UPDATE public.subscription_plans
SET tier_level = 10
WHERE tier_level = 0
  AND item_id_internal IS DISTINCT FROM 'SYSTEM_FREE_TIER_MONTHLY_ALLOWANCE'
  AND name IS DISTINCT FROM 'Free';

UPDATE public.user_subscriptions
SET has_ever_paid = true
WHERE user_id IN (
  SELECT DISTINCT user_id
  FROM public.payment_transactions
  WHERE status = 'COMPLETED'
);

UPDATE public.user_subscriptions
SET tier_level = public.current_plan_tier(user_id);

UPDATE public.ai_providers
SET min_plan_tier_level = 0
WHERE api_identifier LIKE 'dummy-%';

UPDATE public.ai_providers
SET min_plan_tier_level = 10
WHERE config->>'output_token_cost_rate' IS NULL
  AND api_identifier NOT LIKE 'dummy-%';

UPDATE public.ai_providers
SET min_plan_tier_level = 0
WHERE (config->>'output_token_cost_rate')::NUMERIC < 10
  AND api_identifier NOT LIKE 'dummy-%';

UPDATE public.ai_providers
SET min_plan_tier_level = 10
WHERE (config->>'output_token_cost_rate')::NUMERIC >= 10
  AND (config->>'output_token_cost_rate')::NUMERIC < 20;

UPDATE public.ai_providers
SET min_plan_tier_level = 20
WHERE (config->>'output_token_cost_rate')::NUMERIC >= 20;

COMMENT ON FUNCTION public.current_plan_tier(UUID) IS 'Computes effective subscription tier (tier_definitions.level) from payment ratchet and active plan; caches use refresh_user_tier.';

COMMENT ON FUNCTION public.refresh_user_tier(UUID, BOOLEAN) IS 'Updates has_ever_paid ratchet when requested, recomputes tier via current_plan_tier, writes user_subscriptions.tier_level.';

COMMENT ON FUNCTION public.handle_new_user() IS 'New user setup: profile, wallet, free subscription (has_ever_paid=false, tier_level=0), initial free tokens, Kit newsletter webhook. Idempotent.';
