INSERT INTO public.tier_definitions (level, name, output_cap_tokens, max_models_per_project)
VALUES (99, 'unreachable', NULL, NULL)
ON CONFLICT (level) DO NOTHING;

UPDATE public.ai_providers
SET min_plan_tier_level = 99
WHERE config->>'output_token_cost_rate' IS NULL
  AND api_identifier NOT LIKE 'dummy-%';

COMMENT ON COLUMN public.ai_providers.min_plan_tier_level IS 'The correct min_plan_tier_level for a null cost value is the HIGHEST level, so it''s inaccessible to any user, not the LOWEST level which makes it accessible by default - which is the wrong outcome.';
