-- 1. First, ensure any useful information is migrated from user_profiles to user_subscriptions
UPDATE user_subscriptions 
SET stripe_customer_id = p.stripe_customer_id
FROM user_profiles p
WHERE user_subscriptions.user_id = p.id 
AND user_subscriptions.stripe_customer_id IS NULL
AND p.stripe_customer_id IS NOT NULL;

-- 2. Now remove the subscription-related columns from the user_profiles table
ALTER TABLE user_profiles
DROP COLUMN IF EXISTS stripe_customer_id,
DROP COLUMN IF EXISTS subscription_status; 