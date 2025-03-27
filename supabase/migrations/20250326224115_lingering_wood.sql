/*
  # Improved user profile creation trigger

  1. Improvements
    - Adds robust error handling for the trigger function
    - Properly manages profile creation process with transaction safety
    - Includes detailed error logging
  
  2. Security
    - Maintains existing RLS policies
    - Uses SECURITY DEFINER for elevated permissions during profile creation
*/

-- Create or replace the function to handle new user signup with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  profile_exists boolean;
BEGIN
  -- Check if a profile already exists to prevent duplicates
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = NEW.id) INTO profile_exists;
  
  -- Only create profile if it doesn't exist
  IF NOT profile_exists THEN
    BEGIN
      INSERT INTO public.profiles (id, email, created_at, updated_at)
      VALUES (NEW.id, NEW.email, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      
      RAISE NOTICE 'Profile created successfully for user %', NEW.id;
    EXCEPTION 
      WHEN unique_violation THEN
        -- Handle race condition where profile might have been created by another process
        RAISE NOTICE 'Profile already exists for user %', NEW.id;
      WHEN foreign_key_violation THEN
        -- Handle issues with foreign key constraints
        RAISE WARNING 'Foreign key violation when creating profile for user %: %', NEW.id, SQLERRM;
      WHEN OTHERS THEN
        -- Log other errors but don't fail the transaction
        RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'Profile already exists for user %, skipping creation', NEW.id;
  END IF;
  
  -- Always return NEW to ensure the user creation succeeds even if profile creation fails
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists
DO $$
BEGIN
  -- Drop existing trigger first to avoid conflicts
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  
  -- Create the trigger
  CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  
  RAISE NOTICE 'User profile creation trigger installed successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error setting up user profile trigger: %', SQLERRM;
END
$$;