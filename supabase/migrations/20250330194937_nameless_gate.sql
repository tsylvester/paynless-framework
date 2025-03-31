/*
  # Add metadata column to user_profiles table

  1. Changes
    - Add metadata column to user_profiles table for storing user settings and other JSON data
    - This column allows storing flexible JSON data without needing to add new columns for every setting
  
  2. Implementation Details
    - Uses JSONB type for efficient storage and querying
    - Sets default to empty JSON object
*/

-- Add metadata column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add comment to the column
COMMENT ON COLUMN user_profiles.metadata IS 'Stores user preferences, settings, and other metadata as JSON';