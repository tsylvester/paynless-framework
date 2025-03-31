/*
  # Create subscription tables
  
  1. New Tables
    - `subscription_plans` - Stores plan data synced from Stripe
      - `id` (uuid, primary key)
      - `stripe_price_id` (text, unique)
      - `name` (text)
      - `description` (text)
      - `amount` (integer)
      - `currency` (text)
      - `interval` (text)
      - `interval_count` (integer)
      - `active` (boolean)
      - `metadata` (jsonb)
      - `created_at` (timestamp with time zone)
      - `updated_at` (timestamp with time zone)
      
    - `user_subscriptions` - Stores user subscription status
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to user_profiles)
      - `stripe_customer_id` (text)
      - `stripe_subscription_id` (text)
      - `plan_id` (uuid, foreign key to subscription_plans)
      - `status` (text)
      - `current_period_start` (timestamp with time zone)
      - `current_period_end` (timestamp with time zone)
      - `cancel_at_period_end` (boolean)
      - `created_at` (timestamp with time zone)
      - `updated_at` (timestamp with time zone)
      
    - `subscription_transactions` - Stores payment history for audit
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to user_profiles)
      - `subscription_id` (uuid, foreign key to user_subscriptions)
      - `stripe_invoice_id` (text)
      - `stripe_payment_intent_id` (text)
      - `amount` (integer)
      - `currency` (text)
      - `status` (text)
      - `created_at` (timestamp with time zone)
      
  2. Updates to Existing Tables
    - Add subscription-related fields to `user_profiles`:
      - `stripe_customer_id` (text)
      - `subscription_status` (text) - 'free', 'active', 'past_due', 'canceled', etc.
      
  3. Security
    - Enable RLS on all tables
    - Add appropriate policies for secure access
*/

-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_price_id text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  interval text NOT NULL,
  interval_count integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  plan_id uuid REFERENCES subscription_plans(id),
  status text NOT NULL DEFAULT 'free',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, stripe_subscription_id)
);

-- Create subscription_transactions table
CREATE TABLE IF NOT EXISTS subscription_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add subscription fields to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'free' NOT NULL;

-- Enable Row Level Security
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Subscription plans visible to all authenticated users
CREATE POLICY "Subscription plans are viewable by all authenticated users"
  ON subscription_plans
  FOR SELECT
  TO authenticated
  USING (true);
  
-- Admins can manage subscription plans
CREATE POLICY "Admins can manage subscription plans"
  ON subscription_plans
  USING (auth.jwt() ->> 'role' = 'admin');

-- Users can view their own subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON user_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- User subscriptions can be created/updated through service roles only
CREATE POLICY "Service role can manage user subscriptions"
  ON user_subscriptions
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can view their own transactions
CREATE POLICY "Users can view their own transactions"
  ON subscription_transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers
CREATE TRIGGER update_subscription_plans_updated_at
BEFORE UPDATE ON subscription_plans
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON user_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
