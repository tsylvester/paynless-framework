ALTER TABLE public.subscription_plans
ADD COLUMN item_id_internal TEXT,
ADD COLUMN tokens_awarded NUMERIC(19,0),
ADD COLUMN plan_type TEXT NOT NULL DEFAULT 'subscription';

-- Add a unique constraint to item_id_internal. 
-- If you have existing data in subscription_plans, you will need to ensure all rows 
-- have a unique value for item_id_internal BEFORE this migration can apply successfully 
-- or you might need to make this column nullable initially, populate it, then add the constraint.
-- For this migration, we assume it can be added directly.
ALTER TABLE public.subscription_plans
ADD CONSTRAINT subscription_plans_item_id_internal_key UNIQUE (item_id_internal);

-- Later, after populating, you might want to make item_id_internal NOT NULL:
-- ALTER TABLE public.subscription_plans ALTER COLUMN item_id_internal SET NOT NULL;

-- Similarly for tokens_awarded, if it should always be NOT NULL for certain plan_types:
-- (This might be better as a CHECK constraint or handled by application logic)
-- Example: ALTER TABLE public.subscription_plans ADD CONSTRAINT check_tokens_for_one_time CHECK (plan_type <> 'one_time_purchase' OR tokens_awarded IS NOT NULL);

COMMENT ON COLUMN public.subscription_plans.item_id_internal IS 'Stable internal identifier for the plan/package, used by the application (e.g., in PurchaseRequest.itemId).';
COMMENT ON COLUMN public.subscription_plans.tokens_awarded IS 'Number of AI tokens awarded upon successful purchase of this plan/package.';
COMMENT ON COLUMN public.subscription_plans.plan_type IS 'Type of plan, e.g., ''subscription'' for recurring plans, ''one_time_purchase'' for token packages.';

-- If you have an updated_at trigger, ensure it covers these new columns or is generic enough.
