-- Add active column to subscription_plans table
ALTER TABLE public.subscription_plans
ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

-- Optional: Add a comment to the new column
COMMENT ON COLUMN public.subscription_plans.active IS 'Whether the plan is currently offered to new subscribers.'; 