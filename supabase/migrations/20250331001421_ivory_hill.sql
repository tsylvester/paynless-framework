/*
  # Add AI usage tracking

  1. New Tables
    - `ai_usage`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `model_id` (uuid, references ai_models)
      - `tokens` (integer)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `ai_usage` table
    - Add policies for authenticated users
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
CREATE POLICY "Users can view their own usage"
  ON ai_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert usage records"
  ON ai_usage
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_ai_usage_user_id ON ai_usage(user_id);
CREATE INDEX idx_ai_usage_created_at ON ai_usage(created_at);
CREATE INDEX idx_ai_usage_model_id ON ai_usage(model_id);