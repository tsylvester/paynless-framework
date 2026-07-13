-- Add an explicit `type` to every inputs_relevance rule across the recipe seed data.
--
-- Problem: inputs_relevance rules were seeded without a `type` except for feedback rules.
-- The compression victim-selection matcher keys rules by type + document_key [+ slug], so an
-- untyped rule can never match its artifact and the artifact silently defaults to relevance 0
-- (least important, compressed first) regardless of what the recipe author declared.
--
-- Vocabulary (matches ResourceDocument.type, ratified 2026-07-11):
--   'resource' — a text object supplied to the model call: either the rendered document
--                produced FROM an agent's json output (the agent generates json, which is then
--                rendered into a document — the rule targets that rendered artifact, not the
--                json), or a user-supplied reference document.
--   'feedback' — the user's written response to a rendered document. Already tagged in the
--                seed data; those rules are preserved unchanged. A rule pair like
--                { "document_key": "comparison_vector", ... } and
--                { "document_key": "comparison_vector", "type": "feedback", ... } is two
--                DISTINCT rules: the document itself, and the user's feedback on it.
--   'system'   — internal pipeline artifacts (seed_prompt, header_context family) that are
--                required model-call inclusions but never compression candidates.
--
-- Idempotent: rules that already carry a `type` are left untouched, so re-running changes
-- nothing. Array order is preserved. A trailing validation halts the migration if any rule
-- remains untyped or carries a value outside the ratified vocabulary.

DO $$
DECLARE
    v_invalid_count integer;
BEGIN
    UPDATE public.dialectic_recipe_template_steps s
    SET inputs_relevance = t.updated
    FROM (
        SELECT
            s2.id,
            (
                SELECT jsonb_agg(
                    CASE
                        WHEN e.elem ? 'type' THEN e.elem
                        WHEN e.elem->>'document_key' IN (
                            'seed_prompt',
                            'header_context',
                            'header_context_pairwise',
                            'synthesis_header_context'
                        ) THEN e.elem || jsonb_build_object('type', 'system')
                        ELSE e.elem || jsonb_build_object('type', 'resource')
                    END
                    ORDER BY e.ord
                )
                FROM jsonb_array_elements(s2.inputs_relevance) WITH ORDINALITY AS e(elem, ord)
            ) AS updated
        FROM public.dialectic_recipe_template_steps s2
        WHERE s2.inputs_relevance IS NOT NULL
          AND jsonb_typeof(s2.inputs_relevance) = 'array'
          AND jsonb_array_length(s2.inputs_relevance) > 0
    ) t
    WHERE s.id = t.id;

    UPDATE public.dialectic_stage_recipe_steps s
    SET inputs_relevance = t.updated
    FROM (
        SELECT
            s2.id,
            (
                SELECT jsonb_agg(
                    CASE
                        WHEN e.elem ? 'type' THEN e.elem
                        WHEN e.elem->>'document_key' IN (
                            'seed_prompt',
                            'header_context',
                            'header_context_pairwise',
                            'synthesis_header_context'
                        ) THEN e.elem || jsonb_build_object('type', 'system')
                        ELSE e.elem || jsonb_build_object('type', 'resource')
                    END
                    ORDER BY e.ord
                )
                FROM jsonb_array_elements(s2.inputs_relevance) WITH ORDINALITY AS e(elem, ord)
            ) AS updated
        FROM public.dialectic_stage_recipe_steps s2
        WHERE s2.inputs_relevance IS NOT NULL
          AND jsonb_typeof(s2.inputs_relevance) = 'array'
          AND jsonb_array_length(s2.inputs_relevance) > 0
    ) t
    WHERE s.id = t.id;

    -- Validation: every rule in both tables must now carry a type from the ratified
    -- vocabulary. Any violation is a hard failure — fix the data, never skip it.
    SELECT count(*) INTO v_invalid_count
    FROM (
        SELECT e.elem
        FROM public.dialectic_recipe_template_steps s,
             jsonb_array_elements(s.inputs_relevance) AS e(elem)
        WHERE s.inputs_relevance IS NOT NULL
          AND jsonb_typeof(s.inputs_relevance) = 'array'
        UNION ALL
        SELECT e.elem
        FROM public.dialectic_stage_recipe_steps s,
             jsonb_array_elements(s.inputs_relevance) AS e(elem)
        WHERE s.inputs_relevance IS NOT NULL
          AND jsonb_typeof(s.inputs_relevance) = 'array'
    ) all_rules
    WHERE NOT (all_rules.elem ? 'type')
       OR all_rules.elem->>'type' NOT IN ('resource', 'feedback', 'system');

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'add_type_to_recipes: % inputs_relevance rule(s) remain untyped or carry a type outside (resource, feedback, system)', v_invalid_count;
    END IF;
END $$;
