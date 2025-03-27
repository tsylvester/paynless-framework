/*
  # Create profiles trigger function

  1. Adds
    - Improved error handling for the trigger function
    - Better profile creation process
  
  2. Security
    - Maintains existing security policies
*/

-- Create or replace the function to handle new user signup with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Add exception handling to prevent silent failures
  BEGIN
    -- Check if a profile already exists to prevent duplicates
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
      INSERT INTO public.profiles (id, email, created_at, updated_at)
      VALUES (NEW.id, NEW.email, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Log error details but allow the transaction to continue
      RAISE WARNING 'Error in handle_new_user function: %', SQLERRM;
    END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END
$$;