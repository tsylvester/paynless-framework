/*
  # Add Stripe test mode support
  
  1. Changes
     - Add test_mode metadata field to subscription plans
     - This migration adds the necessary structure for tracking test vs production mode for Stripe plans
     
  2. Strategy
     - We'll use the JSONB metadata field to store the test_mode flag rather than adding a new column
     - This avoids backward compatibility issues
*/

-- Check each plan and update its metadata to include test_mode indicator if not already present
DO $$
DECLARE
  plan_record RECORD;
BEGIN
  FOR plan_record IN SELECT id, metadata FROM subscription_plans LOOP
    -- Initialize metadata as empty JSON if null
    IF plan_record.metadata IS NULL THEN
      UPDATE subscription_plans SET metadata = '{}'::jsonb WHERE id = plan_record.id;
      plan_record.metadata := '{}'::jsonb;
    END IF;
    
    -- Check if test_mode is already in metadata
    IF NOT plan_record.metadata ? 'test_mode' THEN
      -- By default, assume existing plans are for production use
      UPDATE subscription_plans 
      SET metadata = metadata || '{"test_mode": false}'::jsonb 
      WHERE id = plan_record.id;
    END IF;
  END LOOP;
END $$;

-- Create a comment to document the metadata usage
COMMENT ON COLUMN subscription_plans.metadata IS 'JSON metadata for the plan. Contains test_mode (boolean) to indicate if this is a test plan.';