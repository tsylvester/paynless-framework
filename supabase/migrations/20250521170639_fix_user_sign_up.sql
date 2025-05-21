-- Migration to consolidate new user setup: profile, wallet, and initial token grant in handle_new_user.
-- This makes handle_new_user the single source of truth for these actions.

BEGIN;

-- Ensure the updated_at trigger function exists (idempotent)
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER LANGUAGE 'plpgsql' AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$;

-- Ensure necessary tables exist with a few key columns, assuming prior migrations handled full creation.
-- This is for idempotency if this script were run on a schema missing these.
-- token_wallets table (minimal for this function's needs)
CREATE TABLE IF NOT EXISTS public.token_wallets (
  wallet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance NUMERIC(19,0) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'AI_TOKEN' CHECK (currency = 'AI_TOKEN'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_or_org_wallet_chk CHECK (
    (user_id IS NOT NULL AND organization_id IS NULL) OR
    (user_id IS NULL AND organization_id IS NOT NULL) OR
    (user_id IS NOT NULL AND organization_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_personal_wallet_idx ON public.token_wallets (user_id) WHERE (organization_id IS NULL);

-- Ensure the trigger exists before attempting to drop and recreate it IF it relies on the function above.
-- For a generic function like set_current_timestamp_updated_at, it's generally safe.
DROP TRIGGER IF EXISTS set_token_wallets_updated_at ON public.token_wallets;
CREATE TRIGGER set_token_wallets_updated_at
BEFORE UPDATE ON public.token_wallets
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


-- token_wallet_transactions table (minimal for this function's needs)
CREATE TABLE IF NOT EXISTS public.token_wallet_transactions (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.token_wallets(wallet_id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL,
  amount NUMERIC(19,0) NOT NULL CHECK (amount >= 0), -- Amount is always positive
  balance_after_txn NUMERIC(19,0) NOT NULL,
  recorded_by_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT, -- User performing the action
  related_entity_id TEXT,
  related_entity_type VARCHAR(50),
  notes TEXT,
  idempotency_key VARCHAR(255),
  payment_transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Ensure recorded_by_user_id is NOT NULL. This requires existing rows to have a value.
-- If this migration might run on a DB with NULLs, they must be handled first.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'token_wallet_transactions' AND column_name = 'recorded_by_user_id') THEN
    UPDATE public.token_wallet_transactions SET recorded_by_user_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE recorded_by_user_id IS NULL; -- Example fallback, adjust as needed
    ALTER TABLE public.token_wallet_transactions ALTER COLUMN recorded_by_user_id SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS unique_twt_idempotency_key_per_wallet ON public.token_wallet_transactions (wallet_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


-- subscription_plans table (minimal for this function's needs)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    tokens_to_award numeric DEFAULT 0 NOT NULL -- Ensure it exists and has a default
    -- other columns (stripe_price_id, interval, etc.) would be here
);

-- user_profiles table (minimal for this function's needs)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'user'::text NOT NULL,
    first_name TEXT
    -- other columns
);

-- user_subscriptions table (minimal for this function's needs)
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
    status text DEFAULT 'pending'::text NOT NULL,
    current_period_start timestamptz,
    current_period_end timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_user_id_key ON public.user_subscriptions (user_id); -- Assuming a user has only one active subscription at a time. Adjust if not.
DROP TRIGGER IF EXISTS set_user_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER set_user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


-- Main function to handle new user setup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public -- Important for SECURITY DEFINER functions
AS $$
DECLARE
  v_user_id UUID := NEW.id; -- ID of the new user from auth.users trigger
  v_user_email TEXT := NEW.email;
  v_raw_user_meta_data JSONB := NEW.raw_user_meta_data;

  v_profile_first_name TEXT;

  v_free_plan_id UUID;
  v_tokens_to_award NUMERIC;
  v_target_wallet_id UUID;
  v_current_wallet_balance NUMERIC;
  v_new_wallet_balance NUMERIC;

  v_system_user_id UUID;
  v_system_user_email_pattern TEXT := 'system-token-allocator-%@internal.app'; -- From previous migration 20250520154343
  v_idempotency_key_grant TEXT;
BEGIN
  RAISE LOG '[handle_new_user] Processing new user ID: %, Email: %', v_user_id, v_user_email;

  -- 1. Create User Profile
  v_profile_first_name := v_raw_user_meta_data ->> 'first_name';
  INSERT INTO public.user_profiles (id, role, first_name)
  VALUES (v_user_id, 'user', v_profile_first_name)
  ON CONFLICT (id) DO NOTHING;
  RAISE LOG '[handle_new_user] Ensured profile for user ID: %.', v_user_id;

  -- 2. Create Token Wallet (defaults to 0 balance as per table DDL)
  INSERT INTO public.token_wallets (user_id, currency)
  VALUES (v_user_id, 'AI_TOKEN')
  ON CONFLICT (user_id) WHERE organization_id IS NULL -- Based on unique_user_personal_wallet_idx
  DO NOTHING
  RETURNING wallet_id INTO v_target_wallet_id;

  IF v_target_wallet_id IS NULL THEN -- Wallet already existed
    SELECT wallet_id INTO v_target_wallet_id
    FROM public.token_wallets
    WHERE user_id = v_user_id AND organization_id IS NULL;
  END IF;

  IF v_target_wallet_id IS NULL THEN
    RAISE WARNING '[handle_new_user] Failed to create or find personal wallet for user ID: %. Aborting token grant.', v_user_id;
    RETURN NEW;
  END IF;
  RAISE LOG '[handle_new_user] Ensured wallet ID: % for user ID: %.', v_target_wallet_id, v_user_id;

  -- 3. Attempt to Grant Initial Free Tokens
  SELECT id, tokens_to_award INTO v_free_plan_id, v_tokens_to_award
  FROM public.subscription_plans
  WHERE name = 'Free' -- IMPORTANT: Ensure this name is exact and matches your 'Free' plan name.
  LIMIT 1;

  IF v_free_plan_id IS NULL THEN
    RAISE LOG '[handle_new_user] ''Free'' plan not found. No initial tokens will be granted for user ID: %.', v_user_id;
  ELSIF v_tokens_to_award IS NULL OR v_tokens_to_award <= 0 THEN
    RAISE LOG '[handle_new_user] ''Free'' plan (ID: %) found, but tokens_to_award is not positive (Value: %). No initial tokens for user ID: %.', v_free_plan_id, v_tokens_to_award, v_user_id;
  ELSE
    RAISE LOG '[handle_new_user] ''Free'' plan ID: % found with % tokens to award for user ID: %.', v_free_plan_id, v_tokens_to_award, v_user_id;

    INSERT INTO public.user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    VALUES (v_user_id, v_free_plan_id, 'free', NOW(), NOW() + interval '1 month')
    ON CONFLICT (user_id) -- Assumes one subscription per user. If (user_id, plan_id) is unique, adjust.
    DO UPDATE SET plan_id = EXCLUDED.plan_id, status = EXCLUDED.status, updated_at = NOW(), current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end
    WHERE public.user_subscriptions.status <> 'free'; -- Only update if not already actively 'free'
    RAISE LOG '[handle_new_user] Ensured user % subscribed to Free plan %.', v_user_id, v_free_plan_id;

    SELECT id INTO v_system_user_id FROM auth.users WHERE email LIKE v_system_user_email_pattern ORDER BY created_at DESC LIMIT 1;

    IF v_system_user_id IS NULL THEN
       RAISE WARNING '[handle_new_user] System user for token allocation (pattern: %) not found. Grant for user % will be recorded by the user themselves.', v_system_user_email_pattern, v_user_id;
    END IF;
    
    v_idempotency_key_grant := 'initial_free_grant_' || v_user_id::text || '_' || v_free_plan_id::text;

    IF EXISTS (SELECT 1 FROM public.token_wallet_transactions WHERE wallet_id = v_target_wallet_id AND idempotency_key = v_idempotency_key_grant) THEN
      RAISE LOG '[handle_new_user] Initial free tokens (Plan ID: %) already granted to user ID: % (Wallet: %) via idempotency key: %.', v_free_plan_id, v_user_id, v_target_wallet_id, v_idempotency_key_grant;
    ELSE
      RAISE LOG '[handle_new_user] Attempting to grant % tokens to wallet % for user % by system user (or self): %.', v_tokens_to_award, v_target_wallet_id, v_user_id, COALESCE(v_system_user_id, v_user_id);
      BEGIN
        SELECT balance INTO v_current_wallet_balance FROM public.token_wallets WHERE wallet_id = v_target_wallet_id FOR UPDATE;
        v_new_wallet_balance := v_current_wallet_balance + v_tokens_to_award;

        UPDATE public.token_wallets SET balance = v_new_wallet_balance, updated_at = now() WHERE public.token_wallets.wallet_id = v_target_wallet_id;

        INSERT INTO public.token_wallet_transactions (
            wallet_id, transaction_type, amount, balance_after_txn,
            recorded_by_user_id, related_entity_id, related_entity_type, notes, idempotency_key
        )
        VALUES (
            v_target_wallet_id, 'CREDIT_INITIAL_FREE_ALLOCATION', v_tokens_to_award, v_new_wallet_balance,
            COALESCE(v_system_user_id, v_user_id), -- If system user not found, new user is recorder
            v_free_plan_id::TEXT, 'subscription_plans', 'Initial token allocation for new free plan user.', v_idempotency_key_grant
        );
        RAISE LOG '[handle_new_user] Successfully granted % tokens to wallet % (User ID: %). New balance: %.', v_tokens_to_award, v_target_wallet_id, v_user_id, v_new_wallet_balance;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING '[handle_new_user] Error during token grant transaction for user ID %: %.', v_user_id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] Unexpected error for user ID % (Email: %): %.', COALESCE(v_user_id, 'UNKNOWN_USER_ID'), COALESCE(v_user_email, 'UNKNOWN_EMAIL'), SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure the trigger is attached to auth.users (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS 'Handles new user setup: profile, wallet, Free plan subscription, and initial free tokens. V3 - Consolidated & Idempotent.';

COMMIT;
