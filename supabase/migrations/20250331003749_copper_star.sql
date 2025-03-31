/*
  # Create AI Usage Table and Policies

  1. New Tables
    - `ai_usage` - Tracks AI model usage per user
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `model_id` (uuid, references ai_models)
      - `tokens` (integer)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `ai_usage` table
    - Add policies for:
      - Users can view their own usage
      - Service role can insert usage records

  3. Indexes
    - Create indexes for efficient querying on:
      - user_id
      - created_at
      - model_id
*/

-- Create AI usage table
CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
  tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Add policies
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ai_usage' 
    AND policyname = 'Users can view their own usage'
  ) THEN
    CREATE POLICY "Users can view their own usage"
      ON ai_usage
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ai_usage' 
    AND policyname = 'Service role can insert usage records'
  ) THEN
    CREATE POLICY "Service role can insert usage records"
      ON ai_usage
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model_id ON ai_usage(model_id);