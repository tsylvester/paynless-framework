/*
  # Add INSERT policy to user_profiles table

  1. Security
    - Add policy for authenticated users to create their own profiles
    - This fixes the RLS policy violation error when creating new profiles
*/

-- Add policy for users to insert their own profiles
CREATE POLICY "Users can create own profile"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);