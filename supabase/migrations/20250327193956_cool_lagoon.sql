/*
  # Remove duplicated email fields from profiles table

  1. Changes
    - Removes email field from profiles table (duplicated from auth.users)
    - Removes email_verified field from profiles table (duplicated from auth.users)
    - Updates trigger to not assign email field
  
  2. Rationale
    - Using auth.users as the single source of truth for email and verification status
    - Eliminates data duplication and potential synchronization issues
    - Follows Supabase best practices for authentication
*/

-- Remove email field (if it exists)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.profiles DROP COLUMN email;
  END IF;
END $$;

-- Remove email_verified field (if it exists)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE public.profiles DROP COLUMN email_verified;
  END IF;
END $$;

-- Update the handle_new_user function to not insert the email field
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
      INSERT INTO public.profiles (id, user_name, created_at, updated_at)
      VALUES (NEW.id, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      
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