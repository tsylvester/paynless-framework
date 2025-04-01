-- Insert the free plan if it doesn't exist
INSERT INTO subscription_plans (
  id, 
  name, 
  description, 
  amount, 
  currency, 
  interval, 
  interval_count, 
  stripe_price_id, 
  active, 
  metadata
)
VALUES (
  '307b5c17-b505-4e57-b0a6-8c525239528b', 
  'Free Plan', 
  'Basic free access', 
  0, 
  'usd', 
  'month', 
  1, 
  'free_plan_price_id', 
  true, 
  '{"features": "Basic features", "is_free_plan": true}'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  active = true;

-- Ensure all users have a subscription by assigning the free plan to any without one
INSERT INTO user_subscriptions (user_id, plan_id, status, cancel_at_period_end)
SELECT id, '307b5c17-b505-4e57-b0a6-8c525239528b', 'free', false
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_subscriptions); 