/*
  # Add ChatGPT integration tables

  1. New Tables
    - `user_events`
      - `event_id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `event_type` (text)
      - `created_at` (timestamptz)
      - `event_description` (text)
      - `event_details` (jsonb)
    - `system_prompts`
      - `prompt_id` (uuid, primary key)
      - `name` (text)
      - `description` (text)
      - `content` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `is_active` (boolean)
      - `tag` (text)
  
  2. Security
    - Enable RLS on both tables
    - Add policies for users to access their own events
    - Add policies for accessing system prompts
*/

-- Create user_events table
CREATE TABLE IF NOT EXISTS user_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  event_description TEXT,
  event_details JSONB
);

-- Enable RLS on user_events
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

-- Create policies for user_events
CREATE POLICY "Users can view their own events"
  ON user_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own events"
  ON user_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create system_prompts table
CREATE TABLE IF NOT EXISTS system_prompts (
  prompt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  tag TEXT
);

-- Enable RLS on system_prompts
ALTER TABLE system_prompts ENABLE ROW LEVEL SECURITY;

-- Create policies for system_prompts
CREATE POLICY "Anyone can view active system prompts"
  ON system_prompts
  FOR SELECT
  USING (is_active = true);

-- Insert default system prompt
INSERT INTO system_prompts (name, description, content, tag)
VALUES 
('default', 'Default system prompt for general conversations', 'You are a helpful AI assistant. Answer questions concisely and accurately.', 'general'),
('code_assistant', 'System prompt for coding help', 'You are a coding assistant. Provide clear, concise code examples and explanations for programming questions.', 'coding'),
('creative_writing', 'System prompt for creative writing assistance', 'You are a creative writing assistant. Help users with story ideas, character development, and narrative structure.', 'creative');