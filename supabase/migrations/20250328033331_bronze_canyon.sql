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

-- Check if our create_free_subscription function exists
DO $$
DECLARE
  func_exists BOOLEAN;
BEGIN
  -- Check if function exists
  SELECT EXISTS(
    SELECT 1 FROM pg_proc WHERE proname = 'create_free_subscription'
  ) INTO func_exists;
  
  -- If function doesn't exist, create it
  IF NOT func_exists THEN
    -- Create the function definition in a separate DO block to avoid nested BEGIN/END
    EXECUTE $FUNC$
      CREATE OR REPLACE FUNCTION create_free_subscription()
      RETURNS TRIGGER AS $BODY$
      BEGIN
        -- Check if the user already has a subscription to prevent duplicates
        IF NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = NEW.id) THEN
          INSERT INTO subscriptions (
            user_id,
            subscription_status,
            subscription_plan_id,
            subscription_price,
            current_period_start,
            metadata
          ) 
          VALUES (
            NEW.id,
            'active',
            'free',
            0,
            CURRENT_TIMESTAMP,
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
        END IF;
        
        RETURN NEW;
      END;
      $BODY$ LANGUAGE plpgsql SECURITY DEFINER;
    $FUNC$;

    -- Create trigger for new user signup to add free subscription if it doesn't exist
    DROP TRIGGER IF EXISTS on_user_created_add_subscription ON auth.users;
    EXECUTE 'CREATE TRIGGER on_user_created_add_subscription
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION create_free_subscription()';
      
    RAISE NOTICE 'Created create_free_subscription function and trigger';
  END IF;
END $$;