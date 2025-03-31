/*
  # Add User Profile Fields

  1. New Fields
    - Birth date and time
    - Gender and pronouns
    - Location
    - Sexuality
    - Relationship status
    - Social links
    - Privacy settings per field
  
  2. Changes
    - Add privacy level enum type
    - Add gender enum type
    - Add relationship status enum type
    - Add social link types
    - Add privacy settings to user_profiles
  
  3. Security
    - Enable RLS
    - Add policies for field-level privacy
*/

-- Create enum types
CREATE TYPE privacy_level AS ENUM (
  'public',      -- Visible to everyone
  'followers',   -- Visible to followers only
  'private'      -- Visible to user only
);

CREATE TYPE gender_type AS ENUM (
  'male',
  'female',
  'non_binary',
  'transgender',
  'other',
  'prefer_not_to_say'
);

CREATE TYPE relationship_status AS ENUM (
  'single',
  'in_relationship',
  'engaged',
  'married',
  'divorced',
  'widowed',
  'its_complicated',
  'prefer_not_to_say'
);

CREATE TYPE sexuality_type AS ENUM (
  'straight',
  'gay',
  'lesbian',
  'bisexual',
  'pansexual',
  'asexual',
  'queer',
  'other',
  'prefer_not_to_say'
);

-- Add new columns to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS birth_time time;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS gender gender_type;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS pronouns text[];
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS location jsonb;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS sexuality sexuality_type;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS relationship_status relationship_status;

-- Create social links table
CREATE TABLE IF NOT EXISTS user_social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  platform text NOT NULL,
  url text NOT NULL,
  privacy_level privacy_level NOT NULL DEFAULT 'public',
  verified boolean DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- Create contact info table
CREATE TABLE IF NOT EXISTS user_contact_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  value text NOT NULL,
  privacy_level privacy_level NOT NULL DEFAULT 'private',
  verified boolean DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, type)
);

-- Add privacy settings to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS privacy_settings jsonb DEFAULT jsonb_build_object(
  'birth_date', 'public',
  'birth_time', 'private',
  'gender', 'public',
  'pronouns', 'public',
  'location', 'public',
  'sexuality', 'private',
  'relationship_status', 'public',
  'email', 'private',
  'phone', 'private'
);

-- Enable RLS
ALTER TABLE user_social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_contact_info ENABLE ROW LEVEL SECURITY;

-- Create policies for user_social_links
CREATE POLICY "Users can manage their own social links"
  ON user_social_links
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view social links based on privacy level"
  ON user_social_links
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR privacy_level = 'public'
    OR (
      privacy_level = 'followers'
      AND EXISTS (
        SELECT 1 FROM user_relationships
        WHERE user_id = user_social_links.user_id
        AND related_user_id = auth.uid()
        AND relationship_type = 'follow'
      )
    )
  );

-- Create policies for user_contact_info
CREATE POLICY "Users can manage their own contact info"
  ON user_contact_info
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view contact info based on privacy level"
  ON user_contact_info
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR privacy_level = 'public'
    OR (
      privacy_level = 'followers'
      AND EXISTS (
        SELECT 1 FROM user_relationships
        WHERE user_id = user_contact_info.user_id
        AND related_user_id = auth.uid()
        AND relationship_type = 'follow'
      )
    )
  );

-- Create updated_at triggers
CREATE TRIGGER update_user_social_links_updated_at
  BEFORE UPDATE ON user_social_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_contact_info_updated_at
  BEFORE UPDATE ON user_contact_info
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_user_social_links_user_id ON user_social_links(user_id);
CREATE INDEX IF NOT EXISTS idx_user_contact_info_user_id ON user_contact_info(user_id);
CREATE INDEX IF NOT EXISTS idx_user_social_links_platform ON user_social_links(platform);
CREATE INDEX IF NOT EXISTS idx_user_contact_info_type ON user_contact_info(type);