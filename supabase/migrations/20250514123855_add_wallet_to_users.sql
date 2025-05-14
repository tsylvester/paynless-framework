-- Step 1: Ensure all users in auth.users have a corresponding user_profile.
-- This script assumes 'user' as the default role and attempts to get 'first_name' from metadata.
INSERT INTO public.user_profiles (id, role, first_name)
SELECT
    u.id,
    'user', -- Default role
    u.raw_user_meta_data ->> 'first_name'
FROM
    auth.users u
LEFT JOIN
    public.user_profiles up ON u.id = up.id
WHERE
    up.id IS NULL;

-- Step 2: Recreate or replace the handle_new_user function to include wallet creation.
-- This ensures that new users going forward will get a profile and a wallet.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  free_plan_id uuid;
BEGIN
  -- Insert into public.user_profiles
  INSERT INTO public.user_profiles (id, role, first_name)
  VALUES (
    NEW.id,
    'user', -- Default role
    NEW.raw_user_meta_data ->> 'first_name'
  )
  ON CONFLICT (id) DO NOTHING; -- Avoid error if profile somehow already exists (e.g., from Step 1 if trigger ran between Step 1 and this)

  -- Create a token wallet for the new user
  INSERT INTO public.token_wallets (user_id) -- currency, balance, and wallet_id have defaults
  VALUES (NEW.id)
  ON CONFLICT (user_id) WHERE organization_id IS NULL DO NOTHING; -- Avoid error if wallet already exists

  -- Optional: Find the 'Free' plan ID (adjust '''Free''' name if needed)
  SELECT id INTO free_plan_id FROM public.subscription_plans WHERE name = '''Free''' LIMIT 1;

  -- Optional: If a Free plan exists, create an entry in user_subscriptions
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, free_plan_id, '''free''') -- Set status to '''free''' or appropriate default
    ON CONFLICT (user_id, plan_id) DO NOTHING; -- Example: simple conflict handling, adjust if needed
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the trigger is still in place (it should be, but defensive)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 3: Backfill token wallets for any existing user profiles that don't have one.
-- This covers users who existed before this migration and users whose profiles were created in Step 1.
INSERT INTO public.token_wallets (user_id)
SELECT
    up.id
FROM
    public.user_profiles up
LEFT JOIN
    public.token_wallets tw ON up.id = tw.user_id AND tw.organization_id IS NULL -- Ensure we're checking for user wallets
WHERE
    tw.wallet_id IS NULL;

-- ORGANIZATION WALLET PROVISIONING
-- Step 4: Define a function to create a token wallet when a new organization is created.
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Create a token wallet for the new organization.
  -- user_id will be NULL. currency, balance, and wallet_id have defaults.
  INSERT INTO public.token_wallets (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) WHERE user_id IS NULL DO NOTHING; -- Avoid error if wallet already exists for this org.

  RETURN NEW;
END;
$$;

-- Step 5: Create a trigger on the organizations table to call the new function.
-- This ensures that new organizations going forward will get a wallet.
DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();

-- Step 6: Backfill token wallets for any existing organizations that don't have one.
INSERT INTO public.token_wallets (organization_id)
SELECT
    o.id
FROM
    public.organizations o
LEFT JOIN
    public.token_wallets tw ON o.id = tw.organization_id AND tw.user_id IS NULL -- Crucial: ensure user_id IS NULL for org wallets
WHERE
    tw.wallet_id IS NULL; -- If no matching wallet is found (wallet_id is PK so it cannot be NULL if row exists)
