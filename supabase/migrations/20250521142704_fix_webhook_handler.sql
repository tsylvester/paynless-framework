BEGIN;

-- Drop the existing unique constraint on stripe_product_id if it exists
ALTER TABLE public.subscription_plans
DROP CONSTRAINT IF EXISTS subscription_plans_stripe_product_id_key;

-- Drop the unique constraint on stripe_price_id if it already exists (to handle pre-existing cases)
ALTER TABLE public.subscription_plans
DROP CONSTRAINT IF EXISTS subscription_plans_stripe_price_id_key;

-- Add a new unique constraint on stripe_price_id
-- This allows multiple plans (prices) to be associated with a single stripe_product_id,
-- as long as each stripe_price_id is unique.
ALTER TABLE public.subscription_plans
ADD CONSTRAINT subscription_plans_stripe_price_id_key UNIQUE (stripe_price_id);

COMMIT;
