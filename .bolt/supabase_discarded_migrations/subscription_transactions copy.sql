-- Migration file: create_subscription_transaction_function.sql
/*
  # Create subscription transaction function

  This migration creates a database function to handle subscription transactions
  to ensure data consistency and atomicity during subscription operations.

  1. Function
    - `handle_new_subscription` - Handles creating or updating user subscriptions in a transaction
*/

-- Create function to handle new subscriptions in a transaction
CREATE OR REPLACE FUNCTION handle_new_subscription(
  p_user_id UUID,
  p_stripe_customer_id TEXT,
  p_stripe_subscription_id TEXT,
  p_plan_id UUID,
  p_status TEXT,
  p_current_period_start TIMESTAMPTZ,
  p_current_period_end TIMESTAMPTZ,
  p_cancel_at_period_end BOOLEAN
) RETURNS VOID AS $$
DECLARE
  v_subscription_id UUID;
BEGIN
  -- Check if the user already has a subscription
  SELECT id INTO v_subscription_id 
  FROM user_subscriptions 
  WHERE user_id = p_user_id;
  
  IF v_subscription_id IS NULL THEN
    -- Insert new subscription
    INSERT INTO user_subscriptions (
      user_id,
      stripe_customer_id,
      stripe_subscription_id,
      plan_id,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end
    ) VALUES (
      p_user_id,
      p_stripe_customer_id,
      p_stripe_subscription_id,
      p_plan_id,
      p_status,
      p_current_period_start,
      p_current_period_end,
      p_cancel_at_period_end
    )
    RETURNING id INTO v_subscription_id;
  ELSE
    -- Update existing subscription
    UPDATE user_subscriptions
    SET
      stripe_customer_id = p_stripe_customer_id,
      stripe_subscription_id = p_stripe_subscription_id,
      plan_id = p_plan_id,
      status = p_status,
      current_period_start = p_current_period_start,
      current_period_end = p_current_period_end,
      cancel_at_period_end = p_cancel_at_period_end,
      updated_at = NOW()
    WHERE id = v_subscription_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
