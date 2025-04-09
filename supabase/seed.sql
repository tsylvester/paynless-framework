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