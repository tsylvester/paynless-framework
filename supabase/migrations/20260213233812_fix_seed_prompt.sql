-- Fix seed_prompt slug in Antithesis stage inputs_required
-- The seed_prompt for antithesis stage should reference the thesis stage seed_prompt,
-- not the antithesis stage seed_prompt (which doesn't exist yet when antithesis runs).

DO $$
DECLARE
  v_planner_step_key text := 'antithesis_prepare_proposal_review_plan';
BEGIN
  -- Update template steps
  UPDATE public.dialectic_recipe_template_steps
  SET inputs_required = (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'type' = 'seed_prompt' 
         AND elem->>'document_key' = 'seed_prompt' 
         AND elem->>'slug' = 'antithesis'
        THEN jsonb_set(elem, '{slug}', '"thesis"'::jsonb)
        ELSE elem
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(inputs_required) WITH ORDINALITY AS t(elem, ord)
  ),
  updated_at = now()
  WHERE step_key = v_planner_step_key
    AND inputs_required IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(inputs_required) elem
      WHERE elem->>'type' = 'seed_prompt'
        AND elem->>'document_key' = 'seed_prompt'
        AND elem->>'slug' = 'antithesis'
    );

  -- Update instance steps
  UPDATE public.dialectic_stage_recipe_steps
  SET inputs_required = (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'type' = 'seed_prompt' 
         AND elem->>'document_key' = 'seed_prompt' 
         AND elem->>'slug' = 'antithesis'
        THEN jsonb_set(elem, '{slug}', '"thesis"'::jsonb)
        ELSE elem
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(inputs_required) WITH ORDINALITY AS t(elem, ord)
  ),
  updated_at = now()
  WHERE step_key = v_planner_step_key
    AND inputs_required IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(inputs_required) elem
      WHERE elem->>'type' = 'seed_prompt'
        AND elem->>'document_key' = 'seed_prompt'
        AND elem->>'slug' = 'antithesis'
    );
END $$;
