-- Add input_artifact_rules column to dialectic_stages
ALTER TABLE public.dialectic_stages
ADD COLUMN IF NOT EXISTS input_artifact_rules JSONB NULL;

COMMENT ON COLUMN public.dialectic_stages.input_artifact_rules IS
'JSONB object defining rules for constructing the seed prompt for this stage, specifying which system prompts, prior artifacts, and current feedback to include.';

-- Populate input_artifact_rules for the 'antithesis' stage
DO $$
DECLARE
  antithesis_stage_id UUID;
BEGIN
  SELECT id INTO antithesis_stage_id FROM public.dialectic_stages WHERE slug = $s$antithesis$s$ LIMIT 1;

  IF antithesis_stage_id IS NOT NULL THEN
    UPDATE public.dialectic_stages
    SET input_artifact_rules = '{
      "sources": [
        {
          "type": "contribution",
          "stage_slug": "thesis",
          "purpose": "AI-generated proposals from the preceding stage.",
          "required": true,
          "multiple": true,
          "section_header": "--- Proposals from Previous Stage ---"
        },
        {
          "type": "feedback",
          "stage_slug": "thesis",
          "purpose": "User''s direct feedback on the proposals from the preceding stage.",
          "required": false,
          "multiple": false,
          "section_header": "--- User Feedback on Previous Stage ---"
        }
      ]
    }'::JSONB
    WHERE id = antithesis_stage_id;
    RAISE NOTICE 'Input artifact rules set for antithesis stage.';
  ELSE
    RAISE WARNING 'Antithesis stage not found, input_artifact_rules not set for it.';
  END IF;
END $$;

-- Populate input_artifact_rules for the 'synthesis' stage
DO $$
DECLARE
  synthesis_stage_id UUID;
BEGIN
  SELECT id INTO synthesis_stage_id FROM public.dialectic_stages WHERE slug = $s$synthesis$s$ LIMIT 1;

  IF synthesis_stage_id IS NOT NULL THEN
    UPDATE public.dialectic_stages
    SET input_artifact_rules = '{
      "sources": [
        {
          "type": "contribution",
          "stage_slug": "thesis",
          "purpose": "AI-generated proposals from the Thesis stage.",
          "required": true,
          "multiple": true,
          "section_header": "--- Proposals from Thesis Stage ---"
        },
        {
          "type": "feedback",
          "stage_slug": "thesis",
          "purpose": "User''s feedback on the Thesis stage proposals.",
          "required": false,
          "multiple": false,
          "section_header": "--- User Feedback on Thesis Stage ---"
        },
        {
          "type": "contribution",
          "stage_slug": "antithesis",
          "purpose": "Critiques generated during the Antithesis stage.",
          "required": true,
          "multiple": true,
          "section_header": "--- Critiques from Antithesis Stage ---"
        },
        {
          "type": "feedback",
          "stage_slug": "antithesis",
          "purpose": "User''s direct feedback on the critiques from the Antithesis stage.",
          "required": false,
          "multiple": false,
          "section_header": "--- User Feedback on Antithesis Stage Critiques ---"
        }
      ]
    }'::JSONB
    WHERE id = synthesis_stage_id;
    RAISE NOTICE 'Input artifact rules set for synthesis stage.';
  ELSE
    RAISE WARNING 'Synthesis stage not found, input_artifact_rules not set for it.';
  END IF;
END $$;

-- Populate input_artifact_rules for the 'parenthesis' stage
DO $$
DECLARE
  parenthesis_stage_id UUID;
BEGIN
  SELECT id INTO parenthesis_stage_id FROM public.dialectic_stages WHERE slug = $s$parenthesis$s$ LIMIT 1;

  IF parenthesis_stage_id IS NOT NULL THEN
    UPDATE public.dialectic_stages
    SET input_artifact_rules = '{
      "sources": [
        {
          "type": "contribution",
          "stage_slug": "synthesis",
          "purpose": "Outputs (proposals, PRDs, plans) from the Synthesis stage.",
          "required": true,
          "multiple": true,
          "section_header": "--- Outputs from Synthesis Stage ---"
        },
        {
          "type": "feedback",
          "stage_slug": "synthesis",
          "purpose": "User''s direct feedback on the outputs from the Synthesis stage.",
          "required": false,
          "multiple": false,
          "section_header": "--- User Feedback on Synthesis Stage ---"
        }
      ]
    }'::JSONB
    WHERE id = parenthesis_stage_id;
    RAISE NOTICE 'Input artifact rules set for parenthesis stage.';
  ELSE
    RAISE WARNING 'Parenthesis stage not found, input_artifact_rules not set for it.';
  END IF;
END $$;

-- Populate input_artifact_rules for the 'paralysis' stage
DO $$
DECLARE
  paralysis_stage_id UUID;
BEGIN
  SELECT id INTO paralysis_stage_id FROM public.dialectic_stages WHERE slug = $s$paralysis$s$ LIMIT 1;

  IF paralysis_stage_id IS NOT NULL THEN
    UPDATE public.dialectic_stages
    SET input_artifact_rules = '{
      "sources": [
        {
          "type": "contribution",
          "stage_slug": "parenthesis",
          "purpose": "Detailed implementation plans developed during the Parenthesis stage.",
          "required": true,
          "multiple": true,
          "section_header": "--- Implementation Plans from Parenthesis Stage ---"
        },
        {
          "type": "feedback",
          "stage_slug": "parenthesis",
          "purpose": "User''s direct feedback on the implementation plans from the Parenthesis stage.",
          "required": false,
          "multiple": false,
          "section_header": "--- User Feedback on Parenthesis Stage ---"
        }
      ]
    }'::JSONB
    WHERE id = paralysis_stage_id;
    RAISE NOTICE 'Input artifact rules set for paralysis stage.';
  ELSE
    RAISE WARNING 'Paralysis stage not found, input_artifact_rules not set for it.';
  END IF;
END $$;
