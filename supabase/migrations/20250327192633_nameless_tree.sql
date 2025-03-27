/*
  # Ensure user_name field exists in profiles table

  1. Changes
    - Ensure the profiles table has a user_name field
    - Add field if it doesn't already exist
  
  2. Security
    - Maintains existing RLS policies
*/

-- Check if user_name column exists and add it if it doesn't
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'user_name'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN user_name TEXT;
  END IF;
  
  -- Ensure email_verified column exists (for email change functionality)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN email_verified BOOLEAN DEFAULT false;
  END IF;
END $$;