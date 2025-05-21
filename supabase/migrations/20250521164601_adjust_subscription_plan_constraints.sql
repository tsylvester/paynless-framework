-- Remove the unique constraint on stripe_product_id
ALTER TABLE public.subscription_plans
DROP CONSTRAINT IF EXISTS subscription_plans_stripe_product_id_key;

-- The unique constraint on stripe_price_id (subscription_plans_stripe_price_id_key) already exists,
-- so no action is needed here to add it.
-- If it didn't exist, the following would be used (after ensuring the column is NOT NULL if desired):
-- ALTER TABLE public.subscription_plans
-- ADD CONSTRAINT subscription_plans_stripe_price_id_key UNIQUE (stripe_price_id); 