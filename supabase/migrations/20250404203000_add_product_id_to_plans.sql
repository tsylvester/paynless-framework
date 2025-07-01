-- Add stripe_product_id to subscription_plans

ALTER TABLE public.subscription_plans
ADD COLUMN stripe_product_id TEXT;

-- Add an index for faster lookups based on product ID
CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_product_id ON public.subscription_plans(stripe_product_id);

-- Add a comment
COMMENT ON COLUMN public.subscription_plans.stripe_product_id IS 'The corresponding Stripe Product ID (prod_...).';

-- Backfill existing rows (optional but recommended)
-- This attempts to find the product ID from the related price ID using Stripe Price metadata
-- NOTE: This requires the price metadata to contain a 'product_id' key. 
-- If not available, you might need a different backfill strategy or do it manually.
-- This part is complex to do generically in SQL. Consider backfilling via a script or manual update.
/*
UPDATE public.subscription_plans p
SET stripe_product_id = pm.value ->> 'product_id' 
FROM stripe.prices pm -- Assuming you have stripe schema from stripe_fdw or similar
WHERE p.stripe_price_id = pm.id
AND p.stripe_product_id IS NULL;
*/
-- Or simply leave it NULL for now and let the sync function populate it on the next run. 