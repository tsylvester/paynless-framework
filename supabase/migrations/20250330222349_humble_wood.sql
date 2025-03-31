/*
  # Add AI Provider Tables

  1. New Tables
    - `ai_providers`
      - `id` (uuid, primary key)
      - `name` (text)
      - `type` (text)
      - `is_enabled` (boolean)
      - `config` (jsonb)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `ai_models`
      - `id` (uuid, primary key)
      - `provider_id` (uuid, foreign key)
      - `model_id` (text)
      - `name` (text)
      - `capabilities` (text[])
      - `max_tokens` (integer)
      - `context_window` (integer)
      - `is_enabled` (boolean)
      - `config` (jsonb)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `system_prompts`
      - `id` (uuid, primary key)
      - `name` (text)
      - `description` (text)
      - `content` (text)
      - `category` (text)
      - `is_enabled` (boolean)
      - `metadata` (jsonb)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for admin management
    - Add policies for user access to enabled records

  3. Default Data
    - Insert OpenAI provider
    - Insert default models
    - Insert default system prompts
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
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ai_providers' AND policyname = 'Admins can manage AI providers'
  ) THEN
    CREATE POLICY "Admins can manage AI providers"
      ON ai_providers
      TO authenticated
      USING ((auth.jwt() ->> 'role'::text) = 'admin'::text)
      WITH CHECK ((auth.jwt() ->> 'role'::text) = 'admin'::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ai_providers' AND policyname = 'Users can view enabled AI providers'
  ) THEN
    CREATE POLICY "Users can view enabled AI providers"
      ON ai_providers
      FOR SELECT
      TO authenticated
      USING (is_enabled = true);
  END IF;
END $$;

-- Create policies for ai_models
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ai_models' AND policyname = 'Admins can manage AI models'
  ) THEN
    CREATE POLICY "Admins can manage AI models"
      ON ai_models
      TO authenticated
      USING ((auth.jwt() ->> 'role'::text) = 'admin'::text)
      WITH CHECK ((auth.jwt() ->> 'role'::text) = 'admin'::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ai_models' AND policyname = 'Users can view enabled AI models'
  ) THEN
    CREATE POLICY "Users can view enabled AI models"
      ON ai_models
      FOR SELECT
      TO authenticated
      USING (is_enabled = true);
  END IF;
END $$;

-- Create policies for system_prompts
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'system_prompts' AND policyname = 'Admins can manage system prompts'
  ) THEN
    CREATE POLICY "Admins can manage system prompts"
      ON system_prompts
      TO authenticated
      USING ((auth.jwt() ->> 'role'::text) = 'admin'::text)
      WITH CHECK ((auth.jwt() ->> 'role'::text) = 'admin'::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'system_prompts' AND policyname = 'Users can view enabled system prompts'
  ) THEN
    CREATE POLICY "Users can view enabled system prompts"
      ON system_prompts
      FOR SELECT
      TO authenticated
      USING (is_enabled = true);
  END IF;
END $$;

-- Insert default OpenAI provider and models if they don't exist
DO $$
DECLARE
  provider_id uuid;
BEGIN
  -- Insert OpenAI provider if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM ai_providers WHERE type = 'openai') THEN
    INSERT INTO ai_providers (name, type, config) VALUES
    ('OpenAI', 'openai', '{"api_version": "2024-02-15"}'::jsonb)
    RETURNING id INTO provider_id;

    -- Insert default models
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
  END IF;
END $$;

-- Insert default system prompts if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM system_prompts WHERE category = 'chat' AND name = 'General Chat Assistant') THEN
    INSERT INTO system_prompts (name, description, content, category) VALUES
    (
      'General Chat Assistant',
      'A helpful, friendly chat assistant',
      'You are a helpful assistant that provides clear, accurate, and friendly responses.',
      'chat'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM system_prompts WHERE category = 'code' AND name = 'Code Expert') THEN
    INSERT INTO system_prompts (name, description, content, category) VALUES
    (
      'Code Expert',
      'A programming expert that helps write and explain code',
      'You are an expert programmer. Write clean, efficient, and well-documented code. Explain your solutions clearly and provide context when needed.',
      'code'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM system_prompts WHERE category = 'writing' AND name = 'Writing Assistant') THEN
    INSERT INTO system_prompts (name, description, content, category) VALUES
    (
      'Writing Assistant',
      'Helps improve and refine written content',
      'You are a skilled writing assistant. Help users improve their writing while maintaining their voice and intent. Focus on clarity, conciseness, and impact.',
      'writing'
    );
  END IF;
END $$;

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_ai_providers_updated_at'
  ) THEN
    CREATE TRIGGER update_ai_providers_updated_at
      BEFORE UPDATE ON ai_providers
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_ai_models_updated_at'
  ) THEN
    CREATE TRIGGER update_ai_models_updated_at
      BEFORE UPDATE ON ai_models
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_system_prompts_updated_at'
  ) THEN
    CREATE TRIGGER update_system_prompts_updated_at
      BEFORE UPDATE ON system_prompts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;