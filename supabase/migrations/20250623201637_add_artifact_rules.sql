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
      "fetch_artifacts": [
        {
          "source": "previous_stage_storage",
          "file_type": "seed_prompt",
          "purpose": "Original user input, domain settings, and project context from the preceding stage.",
          "required": true,
          "multiple": false,
          "section_header": "--- Original Problem and Context (from previous stage''s seed prompt) ---"
        },
        {
          "source": "previous_stage_storage",
          "file_type": "model_contribution_main", 
          "purpose": "AI-generated proposals from the preceding stage.",
          "required": true,
          "multiple": true,
          "section_header": "--- Proposals from Previous Stage ---"
        },
        {
          "source": "current_session_feedback",
          "file_type": "user_feedback",
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
      "fetch_artifacts": [
        {
          "source": "previous_stage_storage",
          "file_type": "seed_prompt",
          "purpose": "Context from the preceding Antithesis stage, which includes the original Hypothesis (thesis proposal and its seed prompt).",
          "required": true,
          "multiple": false,
          "section_header": "--- Context from Previous Stage (Antithesis Seed Prompt: Includes Original Thesis & User Input) ---"
        },
        {
          "source": "previous_stage_storage",
          "file_type": "model_contribution_main",
          "purpose": "Critiques generated during the Antithesis stage.",
          "required": true,
          "multiple": true,
          "section_header": "--- Critiques from Antithesis Stage ---"
        },
        {
          "source": "current_session_feedback",
          "file_type": "user_feedback",
          "purpose": "User''s direct feedback on the critiques from the Antithesis stage.",
          "required": false,
          "multiple": false,
          "section_header": "--- User Feedback on Antithesis Stage Critiques ---"
        }
      ]
    }'::JSONB
    WHERE id = synthesis_stage_id AND input_artifact_rules IS NULL; -- Only update if NULL
    RAISE NOTICE 'Input artifact rules set for synthesis stage if it was null.';
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
      "fetch_artifacts": [
        {
          "source": "previous_stage_storage",
          "file_type": "model_contribution_main",
          "purpose": "The main synthesized proposals from the Synthesis stage.",
          "required": true,
          "multiple": true,
          "section_header": "--- Synthesized Proposals from Previous Stage ---"
        },
        {
          "source": "previous_stage_storage",
          "file_type": "contribution_document_prd",
          "purpose": "PRD documents generated for each synthesized proposal from the Synthesis stage.",
          "required": false,
          "multiple": true,
          "section_header": "--- PRDs from Synthesis Stage ---"
        },
        {
          "source": "previous_stage_storage",
          "file_type": "contribution_document_plan",
          "purpose": "Initial implementation plans generated for each synthesized proposal from the Synthesis stage.",
          "required": false,
          "multiple": true,
          "section_header": "--- Initial Implementation Plans from Synthesis Stage ---"
        },
        {
          "source": "current_session_feedback",
          "file_type": "user_feedback",
          "purpose": "User''s direct feedback on the outputs from the Synthesis stage.",
          "required": false,
          "multiple": false,
          "section_header": "--- User Feedback on Synthesis Stage ---"
        }
      ]
    }'::JSONB
    WHERE id = parenthesis_stage_id AND input_artifact_rules IS NULL; -- Only update if NULL
    RAISE NOTICE 'Input artifact rules set for parenthesis stage if it was null.';
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
      "fetch_artifacts": [
        {
          "source": "previous_stage_storage",
          "file_type": "contribution_document_plan",
          "purpose": "Detailed implementation plans developed during the Parenthesis stage.",
          "required": true,
          "multiple": true,
          "section_header": "--- Implementation Plans from Parenthesis Stage ---"
        },
        {
          "source": "current_session_feedback",
          "file_type": "user_feedback",
          "purpose": "User''s direct feedback on the implementation plans from the Parenthesis stage.",
          "required": false,
          "multiple": false,
          "section_header": "--- User Feedback on Parenthesis Stage ---"
        }
      ]
    }'::JSONB
    WHERE id = paralysis_stage_id AND input_artifact_rules IS NULL; -- Only update if NULL
    RAISE NOTICE 'Input artifact rules set for paralysis stage if it was null.';
  ELSE
    RAISE WARNING 'Paralysis stage not found, input_artifact_rules not set for it.';
  END IF;
END $$;
