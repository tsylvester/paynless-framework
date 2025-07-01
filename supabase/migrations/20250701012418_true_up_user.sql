CREATE OR REPLACE FUNCTION public.true_up_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_email text;
  v_raw_user_meta_data jsonb;
  v_profile_first_name text;
  v_target_wallet_id uuid;
  v_free_plan_id uuid;
  v_tokens_to_award numeric;
  v_idempotency_key_grant text;
  v_newly_created_subscription_id uuid;
  -- Variables for the manual token grant
  v_current_wallet_balance NUMERIC;
  v_new_wallet_balance NUMERIC;
  v_system_user_id UUID;
BEGIN
  -- 1. Get user metadata
  SELECT raw_user_meta_data, email INTO v_raw_user_meta_data, v_user_email FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE WARNING '[true_up_user] User not found: %', p_user_id;
    RETURN;
  END IF;

  -- 2. Ensure profile exists
  v_profile_first_name := v_raw_user_meta_data ->> 'first_name';
  INSERT INTO public.user_profiles (id, role, first_name) VALUES (p_user_id, 'user', v_profile_first_name) ON CONFLICT (id) DO NOTHING;

  -- 3. Ensure wallet exists
  INSERT INTO public.token_wallets (user_id, currency) VALUES (p_user_id, 'AI_TOKEN') ON CONFLICT (user_id) WHERE organization_id IS NULL DO NOTHING RETURNING wallet_id INTO v_target_wallet_id;
  IF v_target_wallet_id IS NULL THEN
    SELECT wallet_id INTO v_target_wallet_id FROM public.token_wallets WHERE user_id = p_user_id AND organization_id IS NULL;
  END IF;
  IF v_target_wallet_id IS NULL THEN
    RAISE WARNING '[true_up_user] Failed to find/create wallet for user: %', p_user_id;
    RETURN;
  END IF;

  -- 4. Find the 'Free' plan
  SELECT id, tokens_to_award INTO v_free_plan_id, v_tokens_to_award FROM public.subscription_plans WHERE name = 'Free' LIMIT 1;
  IF v_free_plan_id IS NULL THEN
    RAISE WARNING '[true_up_user] "Free" plan not found.';
    RETURN;
  END IF;

  -- 5. Ensure a default subscription exists if the user has none
  IF NOT EXISTS (SELECT 1 FROM public.user_subscriptions WHERE user_id = p_user_id) THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    VALUES (p_user_id, v_free_plan_id, 'free', NOW(), NOW() + interval '1 month');
  END IF;

  -- 6. Grant initial tokens if the user has never received them, regardless of subscription.
  IF (v_tokens_to_award IS NOT NULL AND v_tokens_to_award > 0) THEN
    BEGIN
      -- Use transaction_type for idempotency check, which is more robust than a specific key format.
      IF NOT EXISTS (SELECT 1 FROM public.token_wallet_transactions WHERE wallet_id = v_target_wallet_id AND transaction_type = 'CREDIT_INITIAL_FREE_ALLOCATION') THEN
        RAISE LOG '[true_up_user] Granting initial tokens to user: %', p_user_id;
        
        v_idempotency_key_grant := 'initial_free_grant_' || p_user_id::text;
        SELECT id INTO v_system_user_id FROM auth.users WHERE email LIKE 'system-token-allocator-%@internal.app' LIMIT 1;
        
        SELECT balance INTO v_current_wallet_balance FROM public.token_wallets WHERE wallet_id = v_target_wallet_id FOR UPDATE;
        v_new_wallet_balance := v_current_wallet_balance + v_tokens_to_award;
        UPDATE public.token_wallets SET balance = v_new_wallet_balance, updated_at = now() WHERE token_wallets.wallet_id = v_target_wallet_id;

        INSERT INTO public.token_wallet_transactions (wallet_id, transaction_type, amount, balance_after_txn, recorded_by_user_id, related_entity_id, related_entity_type, notes, idempotency_key)
        VALUES (v_target_wallet_id, 'CREDIT_INITIAL_FREE_ALLOCATION', v_tokens_to_award, v_new_wallet_balance, COALESCE(v_system_user_id, p_user_id), v_free_plan_id::TEXT, 'subscription_plans', 'Initial token allocation for new user.', v_idempotency_key_grant);
      ELSE
        RAISE LOG '[true_up_user] User % has already received an initial token grant of type CREDIT_INITIAL_FREE_ALLOCATION. Skipping.', p_user_id;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING '[true_up_user] Error during token grant for user %: %', p_user_id, SQLERRM;
    END;
  END IF;
END;
$$;