-- Change subscription_plans.description from TEXT to JSONB

-- 1. Add a temporary JSONB column
ALTER TABLE public.subscription_plans
ADD COLUMN description_jsonb JSONB;

-- 2. Attempt to copy and cast existing descriptions into a structured format
-- Sets a default structure. Manually update specific plans for more detail later.
UPDATE public.subscription_plans
SET description_jsonb = 
  CASE
    WHEN description IS NULL THEN '{"subtitle": null, "features": []}'::jsonb
    -- Create a basic structure with existing text as subtitle
    ELSE jsonb_build_object('subtitle', description, 'features', '[]'::jsonb)
  END;

-- 3. Drop the old TEXT column
ALTER TABLE public.subscription_plans
DROP COLUMN description;

-- 4. Rename the temporary column to description
ALTER TABLE public.subscription_plans
RENAME COLUMN description_jsonb TO description;

-- 5. Make the column non-nullable if desired (optional)
-- ALTER TABLE public.subscription_plans ALTER COLUMN description SET NOT NULL;

-- 6. Add a comment to the new column
COMMENT ON COLUMN public.subscription_plans.description IS 'Plan description (subtitle) and features list (JSONB).'; 