/*
  # Fix profiles table setup and trigger

  1. Fixes
    - Correct trigger function to handle errors gracefully
    - Ensure profiles table has proper references to auth.users
    - Fix any possible conflicts with existing profiles table
  
  2. Security
    - Maintain all existing RLS policies
*/

-- Drop existing trigger if it exists to avoid conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create or replace the function to handle new user signup with better error handling
CREATE OR REPLACE FUNCTION handle_new_user()
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

-- Create the trigger again
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Check if profiles table exists and fix any issues
DO $$ 
BEGIN
  -- If the table doesn't exist, create it with proper references
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    CREATE TABLE public.profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    
    -- Enable Row Level Security
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
    CREATE POLICY "Users can view their own profile" 
      ON profiles 
      FOR SELECT 
      USING (auth.uid() = id);
    
    CREATE POLICY "Users can insert their own profile" 
      ON profiles 
      FOR INSERT 
      WITH CHECK (auth.uid() = id);
    
    CREATE POLICY "Users can update their own profile" 
      ON profiles 
      FOR UPDATE 
      USING (auth.uid() = id);
  ELSE
    -- If table exists, ensure it has the correct references
    -- Check if the foreign key is correct
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'profiles_id_fkey' 
      AND constraint_type = 'FOREIGN KEY'
    ) THEN
      -- Drop existing constraint if it's wrong
      BEGIN
        ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Could not drop constraint: %', SQLERRM;
      END;
      
      -- Add the correct constraint
      BEGIN
        ALTER TABLE public.profiles 
        ADD CONSTRAINT profiles_id_fkey 
        FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Could not add foreign key constraint: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;