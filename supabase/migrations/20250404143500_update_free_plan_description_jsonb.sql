-- Update the JSONB description for the Free plan to include specific features

UPDATE public.subscription_plans
SET description = jsonb_build_object(
    'subtitle', 'Basic access to the platform',
    'features', '["Basic account features", "Limited API access"]'::jsonb
  )
WHERE amount = 0; -- Adjust this WHERE clause if the Free plan is identified differently (e.g., by id or stripe_price_id)

-- Optional: Update comment if needed (though likely unchanged from previous migration)
-- COMMENT ON COLUMN public.subscription_plans.description IS 'Plan description (subtitle) and features list (JSONB).'; 