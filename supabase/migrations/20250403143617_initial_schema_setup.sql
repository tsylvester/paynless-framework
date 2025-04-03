-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define User Roles Enum (Optional but good practice)
DROP TYPE IF EXISTS public.user_role;
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- 1. Subscription Plans Table
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_price_id text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  amount integer NOT NULL, -- Store amount in the smallest currency unit (e.g., cents)
  currency text NOT NULL CHECK (char_length(currency) = 3),
  interval text NOT NULL CHECK (interval IN ('day', 'week', 'month', 'year')),
  interval_count integer NOT NULL DEFAULT 1,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.subscription_plans IS 'Stores available subscription plans from Stripe.';
COMMENT ON COLUMN public.subscription_plans.amount IS 'Amount in the smallest currency unit (e.g., cents).';

-- 2. User Profiles Table
DROP TABLE IF EXISTS public.user_profiles CASCADE;
CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  role public.user_role NOT NULL DEFAULT 'user',
  -- Add other profile fields as needed, e.g.:
  -- avatar_url text,
  -- company_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
  -- Consider adding a jsonb column for preferences if needed:
  -- preferences jsonb DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.user_profiles IS 'Stores public profile information for users.';
COMMENT ON COLUMN public.user_profiles.id IS 'References auth.users.id';

-- 3. User Subscriptions Table
DROP TABLE IF EXISTS public.user_subscriptions CASCADE;
CREATE TABLE public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  status text NOT NULL, -- Consider creating an ENUM type for status if preferred
  plan_id uuid REFERENCES public.subscription_plans(id),
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.user_subscriptions IS 'Stores user subscription information linked to Stripe.';
COMMENT ON COLUMN public.user_subscriptions.status IS 'Matches Stripe subscription statuses, plus potentially ''free''.';

-- 4. Function to create a user profile and potentially a default subscription
DROP FUNCTION IF EXISTS public.handle_new_user();
CREATE FUNCTION public.handle_new_user()
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
    NEW.raw_user_meta_data ->> 'first_name' -- Example: try to get name from metadata if provided during signup
  );

  -- Optional: Find the 'Free' plan ID (adjust 'Free' name if needed)
  SELECT id INTO free_plan_id FROM public.subscription_plans WHERE name = 'Free' LIMIT 1;

  -- Optional: If a Free plan exists, create an entry in user_subscriptions
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, free_plan_id, 'free'); -- Set status to 'free' or appropriate default
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Trigger to call handle_new_user on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. RLS Policies (Basic Examples - REVIEW AND ADJUST)

-- Allow users to read their own profile
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow individual read access" ON public.user_profiles;
CREATE POLICY "Allow individual read access" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Allow individual update access" ON public.user_profiles;
CREATE POLICY "Allow individual update access" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Allow authenticated users to read subscription plans
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.subscription_plans;
CREATE POLICY "Allow authenticated read access" ON public.subscription_plans
  FOR SELECT TO authenticated USING (true);

-- Allow users to read their own subscription
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow individual read access" ON public.user_subscriptions;
CREATE POLICY "Allow individual read access" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- TODO: Add policies for INSERT/UPDATE/DELETE on user_subscriptions as needed,
-- These will likely be managed by backend functions or triggers using elevated roles.
-- For example, INSERT might only be allowed by the service_role or a trigger.

-- Add function/trigger to update 'updated_at' columns automatically (Optional but recommended)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now(); 
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  
DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial data (e.g., subscription plans)
-- Make sure stripe_price_id matches your actual Stripe price IDs
INSERT INTO public.subscription_plans (stripe_price_id, name, description, amount, currency, interval, interval_count)
VALUES 
  ('price_FREE', 'Free', 'Basic access', 0, 'usd', 'month', 1), -- Example Free plan
  ('YOUR_STRIPE_MONTHLY_PRICE_ID', 'Pro Monthly', 'Pro features, billed monthly', 1000, 'usd', 'month', 1), -- Example Pro Monthly (e.g., $10.00)
  ('YOUR_STRIPE_YEARLY_PRICE_ID', 'Pro Yearly', 'Pro features, billed yearly', 10000, 'usd', 'year', 1) -- Example Pro Yearly (e.g., $100.00)
ON CONFLICT (stripe_price_id) DO NOTHING; -- Avoid errors if plans already exist
