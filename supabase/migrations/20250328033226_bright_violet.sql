/*
  # Add Free Subscriptions for Existing Users
  
  1. Changes
    - Creates free subscription records for all existing users who don't have one
    - Ensures every user has a subscription record by default
  
  2. Rationale
    - Fixes errors where users without subscription records can't access subscription page
    - Ensures consistent subscription data for all users
    - Maintains compatibility with subscription context and UI components
*/

-- Find all users without subscriptions and create free subscriptions for them
DO $$
DECLARE
  user_rec RECORD;
  user_count INTEGER := 0;
BEGIN
  -- Loop through all users in auth.users table who don't have a subscription
  FOR user_rec IN 
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN subscriptions s ON au.id = s.user_id
    WHERE s.subscription_id IS NULL
  LOOP
    -- Create a free subscription for this user
    INSERT INTO subscriptions (
      user_id,
      subscription_status,
      subscription_plan_id,
      subscription_price,
      current_period_start,
      metadata
    )
    VALUES (
      user_rec.id,
      'active',
      'free',
      0,
      CURRENT_TIMESTAMP,
      jsonb_build_object('auto_created', true, 'created_by_migration', true)
    );
    
    -- Log a subscription event
    INSERT INTO subscription_events (
      user_id,
      subscription_event_type,
      subscription_status,
      event_data
    )
    VALUES (
      user_rec.id,
      'subscription_created',
      'active',
      jsonb_build_object('plan_id', 'free', 'auto_created', true, 'created_by_migration', true)
    );
    
    user_count := user_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Created free subscriptions for % user(s)', user_count;
END $$;

-- Drop existing function and trigger if they exist
DROP TRIGGER IF EXISTS on_user_created_add_subscription ON auth.users;
DROP FUNCTION IF EXISTS create_free_subscription();

-- Create function to automatically create free subscription for new users
CREATE OR REPLACE FUNCTION create_free_subscription()
RETURNS TRIGGER AS $$
DECLARE
  subscription_id UUID;
BEGIN
  -- Log the trigger execution
  RAISE NOTICE 'Creating free subscription for new user: %', NEW.id;
  
  -- Check if the user already has a subscription to prevent duplicates
  IF NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = NEW.id) THEN
    -- Create the subscription
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
      jsonb_build_object(
        'auto_created', true,
        'created_at', CURRENT_TIMESTAMP,
        'created_by', 'user_signup_trigger'
      )
    )
    RETURNING subscription_id INTO subscription_id;
    
    -- Log subscription event
    INSERT INTO subscription_events (
      user_id,
      subscription_id,
      subscription_event_type,
      subscription_status,
      event_data
    )
    VALUES (
      NEW.id,
      subscription_id,
      'subscription_created',
      'active',
      jsonb_build_object(
        'plan_id', 'free',
        'auto_created', true,
        'created_by', 'user_signup_trigger',
        'user_id', NEW.id
      )
    );
    
    RAISE NOTICE 'Successfully created free subscription for user: %', NEW.id;
  ELSE
    RAISE NOTICE 'User % already has a subscription, skipping creation', NEW.id;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log any errors that occur
    RAISE WARNING 'Error creating free subscription for user %: %', NEW.id, SQLERRM;
    RETURN NEW; -- Still return NEW to allow the user creation to proceed
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup to add free subscription
CREATE TRIGGER on_user_created_add_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_free_subscription();