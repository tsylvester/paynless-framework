/*
  # Add Subscription Management Tables

  1. New Tables
    - `subscription_plans` - Stores plan types with details
      - `subscription_plan_id` (text, primary key)
      - `subscription_name` (text)
      - `subscription_description` (text)
      - `subscription_price` (numeric)
      - `interval` (text)
      - `features` (text[])
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `subscription_limits` (jsonb)
      - `stripe_price_id` (text)

    - `subscription_events` - Records changes to subscriptions
      - `subscription_event_id` (uuid, primary key)
      - `subscription_id` (uuid)
      - `user_id` (uuid)
      - `stripe_subscription_id` (text)
      - `subscription_event_type` (text)
      - `subscription_previous_state` (text)
      - `subscription_status` (text)
      - `event_data` (jsonb)
      - `created_at` (timestamptz)

    - `subscriptions` - Stores active subscriptions
      - `subscription_id` (uuid, primary key)
      - `user_id` (uuid)
      - `stripe_subscription_id` (text)
      - `stripe_customer_id` (text)
      - `subscription_status` (text)
      - `subscription_plan_id` (text)
      - `subscription_price` (numeric)
      - `current_period_start` (timestamptz)
      - `current_period_end` (timestamptz)
      - `canceled_at` (timestamptz)
      - `ended_at` (timestamptz)
      - `metadata` (jsonb)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for users to access their own subscriptions and events
    - Add general access policies for subscription plans
*/

-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  subscription_plan_id TEXT PRIMARY KEY,
  subscription_name TEXT NOT NULL,
  subscription_description TEXT,
  subscription_price NUMERIC NOT NULL,
  interval TEXT NOT NULL,
  features TEXT[] NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  subscription_limits JSONB,
  stripe_price_id TEXT
);

-- Create subscription_events table
CREATE TABLE IF NOT EXISTS subscription_events (
  subscription_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  subscription_event_type TEXT NOT NULL,
  subscription_previous_state TEXT,
  subscription_status TEXT,
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  subscription_status TEXT NOT NULL,
  subscription_plan_id TEXT REFERENCES subscription_plans(subscription_plan_id),
  subscription_price NUMERIC NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view active subscription plans" ON subscription_plans;
DROP POLICY IF EXISTS "Users can view their own subscription events" ON subscription_events;
DROP POLICY IF EXISTS "Service role can insert subscription events" ON subscription_events;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON subscriptions;

-- Create policies for subscription_plans
CREATE POLICY "Anyone can view active subscription plans"
  ON subscription_plans
  FOR SELECT
  USING (is_active = true);

-- Create policies for subscription_events
CREATE POLICY "Users can view their own subscription events"
  ON subscription_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert subscription events"
  ON subscription_events
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR
    (SELECT rolname FROM pg_roles WHERE oid = current_setting('role')::oid) = 'service_role'
  );

-- Create policies for subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions
  FOR ALL
  USING (
    (SELECT rolname FROM pg_roles WHERE oid = current_setting('role')::oid) = 'service_role'
  );

-- Insert default subscription plans if they don't exist
INSERT INTO subscription_plans (
  subscription_plan_id,
  subscription_name,
  subscription_description,
  subscription_price,
  interval,
  features,
  is_active,
  subscription_limits,
  stripe_price_id
) VALUES 
(
  'free',
  'Free',
  'Basic access to AI chat with limited features',
  0,
  'month',
  ARRAY['5 AI messages per day', 'Basic prompt library', 'Standard response time'],
  true,
  '{"messages_per_day": 5, "history_days": 7}',
  NULL
),
(
  'premium',
  'Premium',
  'Full access to all features with unlimited messaging',
  9.99,
  'month',
  ARRAY['Unlimited AI messages', 'Full prompt library', 'Priority response time', 'Advanced conversation memory', 'Chat export features'],
  true,
  '{"messages_per_day": null, "history_days": null}',
  'price_premium_monthly'
)
ON CONFLICT (subscription_plan_id) DO NOTHING;

-- Create function to automatically create free subscription for new users
CREATE OR REPLACE FUNCTION create_free_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (
    user_id,
    subscription_status,
    subscription_plan_id,
    subscription_price,
    current_period_start,
    current_period_end,
    metadata
  ) 
  VALUES (
    NEW.id,
    'active',
    'free',
    0,
    CURRENT_TIMESTAMP,
    NULL,
    '{"auto_created": true}'
  );
  
  -- Log subscription event
  INSERT INTO subscription_events (
    user_id,
    subscription_event_type,
    subscription_status,
    event_data
  )
  VALUES (
    NEW.id,
    'subscription_created',
    'active',
    jsonb_build_object('plan_id', 'free', 'auto_created', true)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup to add free subscription
DROP TRIGGER IF EXISTS on_user_created_add_subscription ON auth.users;
CREATE TRIGGER on_user_created_add_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_free_subscription();