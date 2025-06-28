-- Seed data for ai_providers
INSERT INTO public.ai_providers (name, api_identifier, description, is_active)
VALUES 
  ('OpenAI GPT-4o', 'openai-gpt-4o', 'OpenAI''s latest and most advanced model.', true),
  ('Claude 3 Sonnet', 'anthropic-claude-3-sonnet', 'Anthropic''s balanced model for intelligence and speed.', true),
  ('Google Gemini Pro', 'google-gemini-pro', 'Google''s capable multimodal model.', false) -- Example of an inactive provider
ON CONFLICT (api_identifier) DO NOTHING; -- Avoid errors if script is run multiple times

-- Seed data for system_prompts
INSERT INTO public.system_prompts (name, prompt_text, is_active)
VALUES
  ('Helpful Assistant', 'You are a helpful and concise assistant. Respond to the user''s query directly and accurately.', true),
  ('Code Generator', 'You are an expert code generation assistant. Provide only the code requested by the user, enclosed in appropriate markdown code blocks. Do not add explanations unless specifically asked.', true),
  ('Pirate Translator', 'Translate the user''s text into the stereotypical speech of a pirate. Arrr!', true)
ON CONFLICT (name) DO NOTHING; -- Assuming name should be unique for prompts too

-- Note: Chats and chat_messages tables are typically populated by user interaction, not seeding. 

-- Seed Test Users needed for RLS policy tests
-- Use well-known UUIDs for consistency with tests
INSERT INTO auth.users (id, email, encrypted_password, role, aud, email_confirmed_at)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'user_a@test.com', crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now()),
  ('b0000000-0000-0000-0000-000000000002', 'user_b@test.com', crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now()),
  ('c0000000-0000-0000-0000-000000000003', 'user_c@test.com', crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now())
ON CONFLICT (id) DO NOTHING; -- Avoid errors if users already exist 

-- Seed data for local development and testing

-- Example: Insert a default organization if needed
-- INSERT INTO public.organizations (id, name) VALUES
-- ('your-default-org-id', 'Default Organization')
-- ON CONFLICT (id) DO NOTHING;

-- Example: Insert default user roles if you have a roles table
-- INSERT INTO public.roles (id, name) VALUES
-- (1, 'admin'),
-- (2, 'member')
-- ON CONFLICT (id) DO NOTHING;

-- Add Dummy AI Provider for testing
INSERT INTO public.ai_providers (id, name, provider, api_identifier, is_active, config, is_enabled)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Dummy Echo v1', 'dummy', 'dummy-echo-v1', true,
     '{
        "mode": "echo",
        "modelId": "dummy-echo-v1", 
        "tokensPerChar": 0.25,
        "basePromptTokens": 2,
        "tokenization_strategy": {
          "type": "tiktoken",
          "tiktoken_encoding_name": "cl100k_base"
        },
        "api_identifier": "dummy-echo-v1",
        "input_token_cost_rate": 1,
        "output_token_cost_rate": 1
      }'::jsonb, 
      true
    )
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    provider = EXCLUDED.provider,
    api_identifier = EXCLUDED.api_identifier,
    is_active = EXCLUDED.is_active,
    config = EXCLUDED.config;

-- Add Dummy System Prompt for testing
INSERT INTO public.system_prompts (id, name, prompt_text, is_active)
VALUES
    ('22222222-2222-2222-2222-222222222222', 'Dummy Test Prompt', 'You are a dummy assistant.', true)
ON CONFLICT (id) DO NOTHING;


-- You can add other baseline data here 