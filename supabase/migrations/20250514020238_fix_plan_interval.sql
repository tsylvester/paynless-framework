ALTER TABLE public.subscription_plans
ALTER COLUMN interval DROP NOT NULL,
ALTER COLUMN interval_count DROP NOT NULL;
