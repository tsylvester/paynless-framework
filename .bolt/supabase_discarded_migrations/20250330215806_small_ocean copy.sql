/*
  # AI Integration Schema

  1. New Tables
    - `ai_providers`
      - `id` (uuid, primary key)
      - `name` (text) - Provider name (e.g., OpenAI, Claude)
      - `type` (text) - Provider type enum
      - `is_enabled` (boolean) - Whether provider is enabled
      - `config` (jsonb) - Provider-specific configuration
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `ai_models`
      - `id` (uuid, primary key)
      - `provider_id` (uuid) - Reference to ai_providers
      - `model_id` (text) - Model identifier (e.g., gpt-4)
      - `name` (text) - Display name
      - `capabilities` (text[]) - Array of supported capabilities
      - `max_tokens` (integer) - Maximum tokens supported
      - `context_window` (integer) - Context window size
      - `is_enabled` (boolean) - Whether model is enabled
      - `config` (jsonb) - Model-specific configuration
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `system_prompts`
      - `id` (uuid, primary key)
      - `name` (text) - Prompt name/title
      - `description` (text) - Prompt description
      - `content` (text) - The system prompt text
      - `category` (text) - Prompt category (e.g., chat, code)
      - `is_enabled` (boolean) - Whether prompt is enabled
      - `metadata` (jsonb) - Additional metadata
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for admin access
    - Add policies for authenticated user read access
*/

-- Create AI providers table
CREATE TABLE IF NOT EXISTS ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create AI models table
CREATE TABLE IF NOT EXISTS ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  name text NOT NULL,
  capabilities text[] NOT NULL DEFAULT '{}',
  max_tokens integer NOT NULL,
  context_window integer NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, model_id)
);

-- Create system prompts table
CREATE TABLE IF NOT EXISTS system_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  content text NOT NULL,
  category text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_prompts ENABLE ROW LEVEL SECURITY;

-- Create policies for ai_providers
CREATE POLICY "Admins can manage AI providers"
  ON ai_providers
  TO authenticated
  USING ((jwt() ->> 'role'::text) = 'admin'::text)
  WITH CHECK ((jwt() ->> 'role'::text) = 'admin'::text);

CREATE POLICY "Users can view enabled AI providers"
  ON ai_providers
  FOR SELECT
  TO authenticated
  USING (is_enabled = true);

-- Create policies for ai_models
CREATE POLICY "Admins can manage AI models"
  ON ai_models
  TO authenticated
  USING ((jwt() ->> 'role'::text) = 'admin'::text)
  WITH CHECK ((jwt() ->> 'role'::text) = 'admin'::text);

CREATE POLICY "Users can view enabled AI models"
  ON ai_models
  FOR SELECT
  TO authenticated
  USING (is_enabled = true);

-- Create policies for system_prompts
CREATE POLICY "Admins can manage system prompts"
  ON system_prompts
  TO authenticated
  USING ((jwt() ->> 'role'::text) = 'admin'::text)
  WITH CHECK ((jwt() ->> 'role'::text) = 'admin'::text);

CREATE POLICY "Users can view enabled system prompts"
  ON system_prompts
  FOR SELECT
  TO authenticated
  USING (is_enabled = true);

-- Insert default OpenAI provider and models
INSERT INTO ai_providers (name, type, config) VALUES
('OpenAI', 'openai', '{"api_version": "2024-02-15"}'::jsonb);

DO $$
DECLARE
  provider_id uuid;
BEGIN
  SELECT id INTO provider_id FROM ai_providers WHERE type = 'openai' LIMIT 1;
  
  INSERT INTO ai_models (provider_id, model_id, name, capabilities, max_tokens, context_window, config) VALUES
  (
    provider_id,
    'gpt-4-turbo-preview',
    'GPT-4 Turbo',
    ARRAY['text', 'chat', 'code'],
    128000,
    128000,
    '{"temperature": 0.7}'::jsonb
  ),
  (
    provider_id,
    'gpt-4',
    'GPT-4',
    ARRAY['text', 'chat', 'code'],
    8192,
    8192,
    '{"temperature": 0.7}'::jsonb
  ),
  (
    provider_id,
    'gpt-3.5-turbo',
    'GPT-3.5 Turbo',
    ARRAY['text', 'chat', 'code'],
    4096,
    4096,
    '{"temperature": 0.7}'::jsonb
  );
END $$;

-- Insert default system prompts
INSERT INTO system_prompts (name, description, content, category) VALUES
(
  'General Chat Assistant',
  'A helpful, friendly chat assistant',
  'You are a helpful assistant that provides clear, accurate, and friendly responses.',
  'chat'
),
(
  'Code Expert',
  'A programming expert that helps write and explain code',
  'You are an expert programmer. Write clean, efficient, and well-documented code. Explain your solutions clearly and provide context when needed.',
  'code'
),
(
  'Writing Assistant',
  'Helps improve and refine written content',
  'You are a skilled writing assistant. Help users improve their writing while maintaining their voice and intent. Focus on clarity, conciseness, and impact.',
  'writing'
);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ai_providers_updated_at
  BEFORE UPDATE ON ai_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_models_updated_at
  BEFORE UPDATE ON ai_models
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_prompts_updated_at
  BEFORE UPDATE ON system_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();