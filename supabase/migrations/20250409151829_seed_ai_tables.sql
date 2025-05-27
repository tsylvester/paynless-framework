-- Seed data for ai_providers
-- Note: It's generally recommended to use seed.sql for seeding,
-- but putting this in a migration ensures it runs consistently across environments
-- if seed.sql is not automatically applied.
INSERT INTO public.ai_providers (name, api_identifier, description, is_active)
VALUES 
  ('OpenAI GPT-4o', 'openai-gpt-4o', 'OpenAI''s latest and most advanced model.', true),
  ('Claude 3 Sonnet', 'anthropic-claude-3-sonnet', 'Anthropic''s balanced model for intelligence and speed.', true),
  ('Google Gemini Pro', 'google-gemini-pro', 'Google''s capable multimodal model.', false) -- Example of an inactive provider
ON CONFLICT (api_identifier) DO NOTHING; -- Avoid errors if migration is run multiple times

-- Seed data for system_prompts
-- Use INSERT ... SELECT ... WHERE NOT EXISTS to avoid duplicates without requiring a unique constraint
INSERT INTO public.system_prompts (name, prompt_text, is_active)
SELECT 'Helpful Assistant', 'You are a helpful and concise assistant. Respond to the user''s query directly and accurately.', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.system_prompts WHERE name = 'Helpful Assistant'
);

INSERT INTO public.system_prompts (name, prompt_text, is_active)
SELECT 'Code Generator', 'You are an expert code generation assistant. Provide only the code requested by the user, enclosed in appropriate markdown code blocks. Do not add explanations unless specifically asked.', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.system_prompts WHERE name = 'Code Generator'
);

INSERT INTO public.system_prompts (name, prompt_text, is_active)
SELECT 'Pirate Translator', 'Translate the user''s text into the stereotypical speech of a pirate. Arrr!', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.system_prompts WHERE name = 'Pirate Translator'
);
