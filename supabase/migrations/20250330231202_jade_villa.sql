/*
  # Add dating preferences and additional profile fields

  1. New Enums
    - religion_type: For religious beliefs/affiliations
    - political_view: For political leanings
    - substance_use: For substance usage frequency
    - education_level: For educational background
    - looking_for: For relationship goals

  2. New Tables
    - user_preferences: Stores user matching preferences
    - user_details: Additional user profile details

  3. Changes
    - Add new columns to user_profiles for additional details
    - Add privacy settings for new fields

  4. Security
    - Enable RLS on new tables
    - Add policies for data access
*/

-- Create new enum types
CREATE TYPE religion_type AS ENUM (
  'agnostic',
  'atheist',
  'buddhist',
  'christian',
  'hindu',
  'jewish',
  'muslim',
  'sikh',
  'spiritual',
  'other',
  'prefer_not_to_say'
);

CREATE TYPE political_view AS ENUM (
  'very_liberal',
  'liberal',
  'moderate',
  'conservative',
  'very_conservative',
  'apolitical',
  'other',
  'prefer_not_to_say'
);

CREATE TYPE substance_use AS ENUM (
  'never',
  'rarely',
  'socially',
  'regularly',
  'prefer_not_to_say'
);

CREATE TYPE education_level AS ENUM (
  'high_school',
  'some_college',
  'associates',
  'bachelors',
  'masters',
  'doctoral',
  'trade_school',
  'other',
  'prefer_not_to_say'
);

CREATE TYPE looking_for AS ENUM (
  'friendship',
  'dating',
  'long_term',
  'marriage',
  'casual',
  'not_sure',
  'prefer_not_to_say'
);

-- Add new columns to user_profiles
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS religion religion_type,
  ADD COLUMN IF NOT EXISTS political_view political_view,
  ADD COLUMN IF NOT EXISTS education education_level,
  ADD COLUMN IF NOT EXISTS height_cm integer,
  ADD COLUMN IF NOT EXISTS languages text[],
  ADD COLUMN IF NOT EXISTS interests text[],
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS looking_for looking_for,
  ADD COLUMN IF NOT EXISTS children_status text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS school text;

-- Create user_details table for additional profile information
CREATE TABLE IF NOT EXISTS user_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  tobacco_use substance_use DEFAULT 'prefer_not_to_say',
  drinking substance_use DEFAULT 'prefer_not_to_say',
  cannabis_use substance_use DEFAULT 'prefer_not_to_say',
  other_drugs substance_use DEFAULT 'prefer_not_to_say',
  exercise_frequency text,
  diet_preferences text[],
  pets text[],
  privacy_level privacy_level DEFAULT 'private',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Create user_preferences table for matching preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  age_min integer,
  age_max integer,
  distance_max integer, -- in kilometers
  height_min_cm integer,
  height_max_cm integer,
  gender_preferences gender_type[],
  sexuality_preferences sexuality_type[],
  relationship_preferences relationship_status[],
  religion_preferences religion_type[],
  political_preferences political_view[],
  education_preferences education_level[],
  looking_for_preferences looking_for[],
  tobacco_preferences substance_use[],
  drinking_preferences substance_use[],
  cannabis_preferences substance_use[],
  other_drugs_preferences substance_use[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Update privacy settings in user_profiles
DO $$ 
BEGIN
  -- Add new privacy settings if they don't exist
  UPDATE user_profiles 
  SET privacy_settings = privacy_settings || jsonb_build_object(
    'religion', 'public',
    'political_view', 'private',
    'education', 'public',
    'height', 'public',
    'languages', 'public',
    'interests', 'public',
    'bio', 'public',
    'looking_for', 'public',
    'children_status', 'public',
    'occupation', 'public',
    'company', 'private',
    'school', 'public',
    'substance_use', 'private'
  )
  WHERE NOT privacy_settings ?| ARRAY[
    'religion', 'political_view', 'education', 'height', 'languages',
    'interests', 'bio', 'looking_for', 'children_status', 'occupation',
    'company', 'school', 'substance_use'
  ];
END $$;

-- Enable RLS
ALTER TABLE user_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for user_details
CREATE POLICY "Users can manage their own details"
  ON user_details
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view details based on privacy level"
  ON user_details
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR privacy_level = 'public'
    OR (
      privacy_level = 'followers'
      AND EXISTS (
        SELECT 1 FROM user_relationships
        WHERE user_id = user_details.user_id
        AND related_user_id = auth.uid()
        AND relationship_type = 'follow'
      )
    )
  );

-- Create policies for user_preferences
CREATE POLICY "Users can manage their own preferences"
  ON user_preferences
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Only user can view their preferences"
  ON user_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create triggers for updated_at
CREATE TRIGGER update_user_details_updated_at
  BEFORE UPDATE ON user_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_details_user_id ON user_details(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_looking_for ON user_profiles(looking_for);
CREATE INDEX IF NOT EXISTS idx_user_profiles_religion ON user_profiles(religion);
CREATE INDEX IF NOT EXISTS idx_user_profiles_political_view ON user_profiles(political_view);
CREATE INDEX IF NOT EXISTS idx_user_profiles_education ON user_profiles(education);