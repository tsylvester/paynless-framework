-- Migration to fix the handle_new_user function and backfill missing user_subscriptions

-- 1. Recreate or replace the handle_new_user function with correct 'Free' plan lookup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  free_plan_id uuid;
  user_profile_exists BOOLEAN;
  token_wallet_exists BOOLEAN;
BEGIN
  -- Ensure user_profile exists or create it
  INSERT INTO public.user_profiles (id, role, first_name)
  VALUES (
    NEW.id,
    'user', -- Default role
    NEW.raw_user_meta_data ->> 'first_name'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Ensure a token wallet exists or create it
  INSERT INTO public.token_wallets (user_id) -- currency, balance, and wallet_id have defaults
  VALUES (NEW.id)
  ON CONFLICT (user_id) WHERE organization_id IS NULL DO NOTHING;

  -- Find the 'Free' plan ID (corrected: name = 'Free')
  SELECT id INTO free_plan_id FROM public.subscription_plans WHERE name = 'Free' LIMIT 1;

  -- If a Free plan exists, create an entry in user_subscriptions
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, free_plan_id, 'free') -- (corrected: status = 'free')
    -- Add ON CONFLICT (user_id) DO NOTHING; if a user should only ever have one subscription record.
    -- The existing table public.user_subscriptions has a UNIQUE constraint on user_id (from 20250405231315_add_unique_constraint_user_subscriptions_user_id.sql)
    -- So, if a subscription somehow exists (e.g. paid one), this would fail.
    -- We should only insert if one doesn't exist.
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS 'Ensures new user has a profile, a token wallet, and a default free subscription if available. Corrected version from 20250514123855.';

-- 2. Backfill missing 'free' subscriptions for users who were affected by the faulty trigger
--    This targets users who have a profile and a wallet (indicating they were processed by
--    the 20250514 migration or a similar state) but lack a user_subscriptions entry.
WITH users_needing_subscription AS (
  SELECT u.id as user_id
  FROM auth.users u
  JOIN public.user_profiles up ON u.id = up.id             -- Must have a profile
  JOIN public.token_wallets tw ON u.id = tw.user_id        -- Must have a token wallet
  LEFT JOIN public.user_subscriptions us ON u.id = us.user_id
  WHERE us.id IS NULL                                    -- Must NOT have a subscription
    AND tw.organization_id IS NULL                       -- Ensure it's the user's personal wallet
    AND u.created_at >= '2025-05-14 00:00:00+00'         -- Optionally, filter by date if known when faulty trigger was active
),
free_plan AS (
  SELECT id as plan_id FROM public.subscription_plans WHERE name = 'Free' LIMIT 1
)
INSERT INTO public.user_subscriptions (user_id, plan_id, status)
SELECT
  uns.user_id,
  fp.plan_id,
  'free'
FROM users_needing_subscription uns, free_plan fp
WHERE fp.plan_id IS NOT NULL -- Only insert if 'Free' plan exists
ON CONFLICT (user_id) DO NOTHING;

-- Note: The trigger on_auth_user_created on auth.users table should still be in place
-- and will now use this corrected version of public.handle_new_user().
-- No need to recreate the trigger itself. 