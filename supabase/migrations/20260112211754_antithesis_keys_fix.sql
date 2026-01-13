DO $$
DECLARE
  v_planner_step_key text := 'antithesis_prepare_proposal_review_plan';
BEGIN
  /*
    Goal:
    Ensure the Antithesis planner (PLAN step) and each executor (EXECUTE step) expect an identical
    `content_to_include` object shape per document_key, defined as the UNION of:
      - planner outputs_required.context_for_documents[].content_to_include
      - executor outputs_required.documents[].content_to_include

    We apply this union in BOTH directions:
      1) planner context_for_documents is expanded to include executor keys
      2) executor documents is expanded to include planner keys
  */

  -- ---------------------------------------------------------------------------
  -- Template recipe steps (dialectic_recipe_template_steps)
  -- ---------------------------------------------------------------------------

  -- Validate planner step exists and has context_for_documents entries with content_to_include objects
  IF NOT EXISTS (
    SELECT 1
    FROM public.dialectic_recipe_template_steps s
    WHERE s.step_key = v_planner_step_key
  ) THEN
    RAISE EXCEPTION 'Missing planner recipe template step with step_key=%', v_planner_step_key;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dialectic_recipe_template_steps p,
      LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
    WHERE p.step_key = v_planner_step_key
      AND NOT (ctx ? 'content_to_include')
  ) THEN
    RAISE EXCEPTION 'Planner step % has a context_for_documents entry missing content_to_include', v_planner_step_key;
  END IF;

  -- 1) Expand planner context_for_documents to include executor keys (per template_id)
  WITH planner AS (
    SELECT id, template_id, outputs_required
    FROM public.dialectic_recipe_template_steps
    WHERE step_key = v_planner_step_key
  ),
  planner_docs AS (
    SELECT
      p.id AS planner_id,
      p.template_id,
      ctx.ctx->>'document_key' AS document_key,
      ctx.ctx->'content_to_include' AS planner_content_to_include
    FROM planner p
      CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') WITH ORDINALITY AS ctx(ctx, ord)
  ),
  expanded AS (
    SELECT
      p.id AS planner_id,
      jsonb_agg(
        jsonb_set(
          ctx.ctx,
          '{content_to_include}',
          (
            ctx.ctx->'content_to_include'
            ||
            COALESCE(exec.exec_content_to_include, '{}'::jsonb)
          ),
          true
        )
        ORDER BY ctx.ord
      ) AS new_context_for_documents
    FROM planner p
      CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') WITH ORDINALITY AS ctx(ctx, ord)
      LEFT JOIN LATERAL (
        SELECT doc->'content_to_include' AS exec_content_to_include
        FROM public.dialectic_recipe_template_steps e
          CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') AS doc
        WHERE e.template_id = p.template_id
          AND e.step_key <> v_planner_step_key
          AND (e.outputs_required ? 'documents')
          AND doc->>'document_key' = ctx.ctx->>'document_key'
          AND (doc ? 'content_to_include')
        LIMIT 1
      ) exec ON true
    GROUP BY p.id
  )
  UPDATE public.dialectic_recipe_template_steps p
  SET outputs_required = jsonb_set(
        p.outputs_required,
        '{context_for_documents}',
        e.new_context_for_documents,
        true
      ),
      updated_at = now()
  FROM expanded e
  WHERE p.id = e.planner_id;

  -- 2) Expand each executor step documents[].content_to_include to include planner keys (per template_id)
  WITH planner AS (
    SELECT template_id, outputs_required
    FROM public.dialectic_recipe_template_steps
    WHERE step_key = v_planner_step_key
  ),
  planner_docs AS (
    SELECT
      p.template_id,
      ctx->>'document_key' AS document_key,
      ctx->'content_to_include' AS planner_content_to_include
    FROM planner p
      CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
  ),
  executor_steps AS (
    SELECT e.id, e.template_id, e.outputs_required
    FROM public.dialectic_recipe_template_steps e
    WHERE e.step_key <> v_planner_step_key
      AND (e.outputs_required ? 'documents')
      AND EXISTS (SELECT 1 FROM planner_docs pd WHERE pd.template_id = e.template_id)
  ),
  expanded_docs AS (
    SELECT
      e.id AS executor_id,
      jsonb_agg(
        CASE
          WHEN pd.planner_content_to_include IS NULL THEN d.doc
          WHEN NOT (d.doc ? 'content_to_include') THEN d.doc
          ELSE jsonb_set(
            d.doc,
            '{content_to_include}',
            (
              d.doc->'content_to_include'
              ||
              pd.planner_content_to_include
            ),
            true
          )
        END
        ORDER BY d.ord
      ) AS new_documents
    FROM executor_steps e
      CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') WITH ORDINALITY AS d(doc, ord)
      LEFT JOIN planner_docs pd
        ON pd.template_id = e.template_id
       AND pd.document_key = d.doc->>'document_key'
    GROUP BY e.id
  )
  UPDATE public.dialectic_recipe_template_steps e
  SET outputs_required = jsonb_set(
        e.outputs_required,
        '{documents}',
        ed.new_documents,
        true
      ),
      updated_at = now()
  FROM expanded_docs ed
  WHERE e.id = ed.executor_id;

  -- ---------------------------------------------------------------------------
  -- Stage recipe instance steps (dialectic_stage_recipe_steps)
  -- ---------------------------------------------------------------------------

  IF NOT EXISTS (
    SELECT 1
    FROM public.dialectic_stage_recipe_steps s
    WHERE s.step_key = v_planner_step_key
  ) THEN
    RAISE EXCEPTION 'Missing planner stage recipe step with step_key=%', v_planner_step_key;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dialectic_stage_recipe_steps p,
      LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
    WHERE p.step_key = v_planner_step_key
      AND NOT (ctx ? 'content_to_include')
  ) THEN
    RAISE EXCEPTION 'Stage planner step % has a context_for_documents entry missing content_to_include', v_planner_step_key;
  END IF;

  -- 1) Expand stage planner context_for_documents to include executor keys (per instance_id)
  WITH planner AS (
    SELECT id, instance_id, outputs_required
    FROM public.dialectic_stage_recipe_steps
    WHERE step_key = v_planner_step_key
  ),
  expanded AS (
    SELECT
      p.id AS planner_id,
      jsonb_agg(
        jsonb_set(
          ctx.ctx,
          '{content_to_include}',
          (
            ctx.ctx->'content_to_include'
            ||
            COALESCE(exec.exec_content_to_include, '{}'::jsonb)
          ),
          true
        )
        ORDER BY ctx.ord
      ) AS new_context_for_documents
    FROM planner p
      CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') WITH ORDINALITY AS ctx(ctx, ord)
      LEFT JOIN LATERAL (
        SELECT doc->'content_to_include' AS exec_content_to_include
        FROM public.dialectic_stage_recipe_steps e
          CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') AS doc
        WHERE e.instance_id = p.instance_id
          AND e.step_key <> v_planner_step_key
          AND (e.outputs_required ? 'documents')
          AND doc->>'document_key' = ctx.ctx->>'document_key'
          AND (doc ? 'content_to_include')
        LIMIT 1
      ) exec ON true
    GROUP BY p.id
  )
  UPDATE public.dialectic_stage_recipe_steps p
  SET outputs_required = jsonb_set(
        p.outputs_required,
        '{context_for_documents}',
        e.new_context_for_documents,
        true
      ),
      updated_at = now()
  FROM expanded e
  WHERE p.id = e.planner_id;

  -- 2) Expand stage executor documents[].content_to_include to include planner keys (per instance_id)
  WITH planner AS (
    SELECT instance_id, outputs_required
    FROM public.dialectic_stage_recipe_steps
    WHERE step_key = v_planner_step_key
  ),
  planner_docs AS (
    SELECT
      p.instance_id,
      ctx->>'document_key' AS document_key,
      ctx->'content_to_include' AS planner_content_to_include
    FROM planner p
      CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
  ),
  executor_steps AS (
    SELECT e.id, e.instance_id, e.outputs_required
    FROM public.dialectic_stage_recipe_steps e
    WHERE e.step_key <> v_planner_step_key
      AND (e.outputs_required ? 'documents')
      AND EXISTS (SELECT 1 FROM planner_docs pd WHERE pd.instance_id = e.instance_id)
  ),
  expanded_docs AS (
    SELECT
      e.id AS executor_id,
      jsonb_agg(
        CASE
          WHEN pd.planner_content_to_include IS NULL THEN d.doc
          WHEN NOT (d.doc ? 'content_to_include') THEN d.doc
          ELSE jsonb_set(
            d.doc,
            '{content_to_include}',
            (
              d.doc->'content_to_include'
              ||
              pd.planner_content_to_include
            ),
            true
          )
        END
        ORDER BY d.ord
      ) AS new_documents
    FROM executor_steps e
      CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') WITH ORDINALITY AS d(doc, ord)
      LEFT JOIN planner_docs pd
        ON pd.instance_id = e.instance_id
       AND pd.document_key = d.doc->>'document_key'
    GROUP BY e.id
  )
  UPDATE public.dialectic_stage_recipe_steps e
  SET outputs_required = jsonb_set(
        e.outputs_required,
        '{documents}',
        ed.new_documents,
        true
      ),
      updated_at = now()
  FROM expanded_docs ed
  WHERE e.id = ed.executor_id;
END $$;

-- ---------------------------------------------------------------------------
-- Paralysis keys union fix
-- Only applies the same union-shape rule to the Paralysis recipe (as audited).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_recipe_name text := 'paralysis_v1';
  v_recipe_version integer := 1;
  v_stage_slug text := 'paralysis';
  v_planner_step_key text := 'build-implementation-header';
  v_template_id uuid;
  v_instance_id uuid;
  v_planner_step_id uuid;
BEGIN
  -- -------------------------
  -- Template recipe (paralysis_v1)
  -- -------------------------
  SELECT rt.id
  INTO v_template_id
  FROM public.dialectic_recipe_templates rt
  WHERE rt.recipe_name = v_recipe_name
    AND rt.recipe_version = v_recipe_version
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Missing recipe template with recipe_name=% recipe_version=%', v_recipe_name, v_recipe_version;
  END IF;

  SELECT s.id
  INTO v_planner_step_id
  FROM public.dialectic_recipe_template_steps s
  WHERE s.template_id = v_template_id
    AND s.step_key = v_planner_step_key
    AND s.job_type = 'PLAN'
    AND s.prompt_type = 'Planner'
    AND s.output_type = 'header_context'
  LIMIT 1;

  IF v_planner_step_id IS NULL THEN
    RAISE EXCEPTION 'Missing paralysis template planner step: recipe_name=% recipe_version=% step_key=%', v_recipe_name, v_recipe_version, v_planner_step_key;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dialectic_recipe_template_steps p
      CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
    WHERE p.id = v_planner_step_id
      AND NOT (ctx ? 'content_to_include')
  ) THEN
    RAISE EXCEPTION 'Paralysis template planner step % has a context_for_documents entry missing content_to_include', v_planner_step_id;
  END IF;

  -- 1) Expand planner context_for_documents to include executor keys (within same template_id)
  WITH planner AS (
    SELECT id, template_id, outputs_required
    FROM public.dialectic_recipe_template_steps
    WHERE id = v_planner_step_id
  ),
  expanded AS (
    SELECT
      p.id AS planner_id,
      jsonb_agg(
        jsonb_set(
          ctx.ctx,
          '{content_to_include}',
          (
            ctx.ctx->'content_to_include'
            ||
            COALESCE(exec.exec_content_to_include, '{}'::jsonb)
          ),
          true
        )
        ORDER BY ctx.ord
      ) AS new_context_for_documents
    FROM planner p
      CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') WITH ORDINALITY AS ctx(ctx, ord)
      LEFT JOIN LATERAL (
        SELECT doc->'content_to_include' AS exec_content_to_include
        FROM public.dialectic_recipe_template_steps e
          CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') AS doc
        WHERE e.template_id = p.template_id
          AND e.id <> p.id
          AND (e.outputs_required ? 'documents')
          AND doc->>'document_key' = ctx.ctx->>'document_key'
          AND (doc ? 'content_to_include')
        LIMIT 1
      ) exec ON true
    GROUP BY p.id
  )
  UPDATE public.dialectic_recipe_template_steps p
  SET outputs_required = jsonb_set(
        p.outputs_required,
        '{context_for_documents}',
        e.new_context_for_documents,
        true
      ),
      updated_at = now()
  FROM expanded e
  WHERE p.id = e.planner_id;

  -- 2) Expand each executor step documents[].content_to_include to include planner keys (within same template_id)
  WITH planner_docs AS (
    SELECT
      p.template_id,
      ctx->>'document_key' AS document_key,
      ctx->'content_to_include' AS planner_content_to_include
    FROM public.dialectic_recipe_template_steps p
      CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
    WHERE p.id = v_planner_step_id
  ),
  executor_steps AS (
    SELECT e.id, e.template_id, e.outputs_required
    FROM public.dialectic_recipe_template_steps e
    WHERE e.template_id = v_template_id
      AND e.id <> v_planner_step_id
      AND (e.outputs_required ? 'documents')
  ),
  expanded_docs AS (
    SELECT
      e.id AS executor_id,
      jsonb_agg(
        CASE
          WHEN pd.planner_content_to_include IS NULL THEN d.doc
          WHEN NOT (d.doc ? 'content_to_include') THEN d.doc
          ELSE jsonb_set(
            d.doc,
            '{content_to_include}',
            (
              d.doc->'content_to_include'
              ||
              pd.planner_content_to_include
            ),
            true
          )
        END
        ORDER BY d.ord
      ) AS new_documents
    FROM executor_steps e
      CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') WITH ORDINALITY AS d(doc, ord)
      LEFT JOIN planner_docs pd
        ON pd.template_id = e.template_id
       AND pd.document_key = d.doc->>'document_key'
    GROUP BY e.id
  )
  UPDATE public.dialectic_recipe_template_steps e
  SET outputs_required = jsonb_set(
        e.outputs_required,
        '{documents}',
        ed.new_documents,
        true
      ),
      updated_at = now()
  FROM expanded_docs ed
  WHERE e.id = ed.executor_id;

  -- -------------------------
  -- Stage recipe instances (paralysis)
  -- -------------------------
  FOR v_instance_id IN
    SELECT i.id
    FROM public.dialectic_stage_recipe_instances i
    JOIN public.dialectic_stages s ON s.id = i.stage_id
    WHERE s.slug = v_stage_slug
  LOOP
    SELECT st.id
    INTO v_planner_step_id
    FROM public.dialectic_stage_recipe_steps st
    WHERE st.instance_id = v_instance_id
      AND st.step_key = v_planner_step_key
      AND st.job_type = 'PLAN'
      AND st.prompt_type = 'Planner'
      AND st.output_type = 'header_context'
    LIMIT 1;

    IF v_planner_step_id IS NULL THEN
      RAISE EXCEPTION 'Missing paralysis stage planner step: stage_slug=% instance_id=% step_key=%', v_stage_slug, v_instance_id, v_planner_step_key;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.dialectic_stage_recipe_steps p
        CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
      WHERE p.id = v_planner_step_id
        AND NOT (ctx ? 'content_to_include')
    ) THEN
      RAISE EXCEPTION 'Paralysis stage planner step % has a context_for_documents entry missing content_to_include', v_planner_step_id;
    END IF;

    -- 1) Expand stage planner context_for_documents to include executor keys (within same instance_id)
    WITH planner AS (
      SELECT id, instance_id, outputs_required
      FROM public.dialectic_stage_recipe_steps
      WHERE id = v_planner_step_id
    ),
    expanded AS (
      SELECT
        p.id AS planner_id,
        jsonb_agg(
          jsonb_set(
            ctx.ctx,
            '{content_to_include}',
            (
              ctx.ctx->'content_to_include'
              ||
              COALESCE(exec.exec_content_to_include, '{}'::jsonb)
            ),
            true
          )
          ORDER BY ctx.ord
        ) AS new_context_for_documents
      FROM planner p
        CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') WITH ORDINALITY AS ctx(ctx, ord)
        LEFT JOIN LATERAL (
          SELECT doc->'content_to_include' AS exec_content_to_include
          FROM public.dialectic_stage_recipe_steps e
            CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') AS doc
          WHERE e.instance_id = p.instance_id
            AND e.id <> p.id
            AND (e.outputs_required ? 'documents')
            AND doc->>'document_key' = ctx.ctx->>'document_key'
            AND (doc ? 'content_to_include')
          LIMIT 1
        ) exec ON true
      GROUP BY p.id
    )
    UPDATE public.dialectic_stage_recipe_steps p
    SET outputs_required = jsonb_set(
          p.outputs_required,
          '{context_for_documents}',
          e.new_context_for_documents,
          true
        ),
        updated_at = now()
    FROM expanded e
    WHERE p.id = e.planner_id;

    -- 2) Expand stage executor documents[].content_to_include to include planner keys (within same instance_id)
    WITH planner_docs AS (
      SELECT
        p.instance_id,
        ctx->>'document_key' AS document_key,
        ctx->'content_to_include' AS planner_content_to_include
      FROM public.dialectic_stage_recipe_steps p
        CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
      WHERE p.id = v_planner_step_id
    ),
    executor_steps AS (
      SELECT e.id, e.instance_id, e.outputs_required
      FROM public.dialectic_stage_recipe_steps e
      WHERE e.instance_id = v_instance_id
        AND e.id <> v_planner_step_id
        AND (e.outputs_required ? 'documents')
    ),
    expanded_docs AS (
      SELECT
        e.id AS executor_id,
        jsonb_agg(
          CASE
            WHEN pd.planner_content_to_include IS NULL THEN d.doc
            WHEN NOT (d.doc ? 'content_to_include') THEN d.doc
            ELSE jsonb_set(
              d.doc,
              '{content_to_include}',
              (
                d.doc->'content_to_include'
                ||
                pd.planner_content_to_include
              ),
              true
            )
          END
          ORDER BY d.ord
        ) AS new_documents
      FROM executor_steps e
        CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') WITH ORDINALITY AS d(doc, ord)
        LEFT JOIN planner_docs pd
          ON pd.instance_id = e.instance_id
         AND pd.document_key = d.doc->>'document_key'
      GROUP BY e.id
    )
    UPDATE public.dialectic_stage_recipe_steps e
    SET outputs_required = jsonb_set(
          e.outputs_required,
          '{documents}',
          ed.new_documents,
          true
        ),
        updated_at = now()
    FROM expanded_docs ed
    WHERE e.id = ed.executor_id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Parenthesis keys union fix
-- Applies the same union-shape rule to the Parenthesis recipe (as audited).
--
-- Audit finding (from *_stage.sql migrations):
-- - Parenthesis planner defines a smaller `master_plan` content_to_include shape than the
--   later EXECUTE step(s) use. This makes the shape unstable across references and can
--   break validators that compare planner HeaderContext keys to executor requirements.
--
-- This migration stabilizes the shape by taking the UNION of keys between:
-- - planner outputs_required.context_for_documents[].content_to_include
-- - executor outputs_required.documents[].content_to_include
--
-- The union is applied in BOTH directions within the same template_id / instance_id.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_recipe_name text := 'parenthesis_v1';
  v_recipe_version integer := 1;
  v_stage_slug text := 'parenthesis';
  v_planner_step_key text := 'build-planning-header';
  v_template_id uuid;
  v_instance_id uuid;
  v_planner_step_id uuid;
BEGIN
  -- -------------------------
  -- Template recipe (parenthesis_v1)
  -- -------------------------
  SELECT rt.id
  INTO v_template_id
  FROM public.dialectic_recipe_templates rt
  WHERE rt.recipe_name = v_recipe_name
    AND rt.recipe_version = v_recipe_version
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Missing recipe template with recipe_name=% recipe_version=%', v_recipe_name, v_recipe_version;
  END IF;

  SELECT s.id
  INTO v_planner_step_id
  FROM public.dialectic_recipe_template_steps s
  WHERE s.template_id = v_template_id
    AND s.step_key = v_planner_step_key
    AND s.job_type = 'PLAN'
    AND s.prompt_type = 'Planner'
    AND s.output_type = 'header_context'
  LIMIT 1;

  IF v_planner_step_id IS NULL THEN
    RAISE EXCEPTION 'Missing parenthesis template planner step: recipe_name=% recipe_version=% step_key=%', v_recipe_name, v_recipe_version, v_planner_step_key;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dialectic_recipe_template_steps p
      CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
    WHERE p.id = v_planner_step_id
      AND NOT (ctx ? 'content_to_include')
  ) THEN
    RAISE EXCEPTION 'Parenthesis template planner step % has a context_for_documents entry missing content_to_include', v_planner_step_id;
  END IF;

  -- 1) Expand planner context_for_documents to include executor keys (within same template_id)
  WITH planner AS (
    SELECT id, template_id, outputs_required
    FROM public.dialectic_recipe_template_steps
    WHERE id = v_planner_step_id
  ),
  expanded AS (
    SELECT
      p.id AS planner_id,
      jsonb_agg(
        jsonb_set(
          ctx.ctx,
          '{content_to_include}',
          (
            ctx.ctx->'content_to_include'
            ||
            COALESCE(exec.exec_content_to_include, '{}'::jsonb)
          ),
          true
        )
        ORDER BY ctx.ord
      ) AS new_context_for_documents
    FROM planner p
      CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') WITH ORDINALITY AS ctx(ctx, ord)
      LEFT JOIN LATERAL (
        SELECT doc->'content_to_include' AS exec_content_to_include
        FROM public.dialectic_recipe_template_steps e
          CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') AS doc
        WHERE e.template_id = p.template_id
          AND e.id <> p.id
          AND (e.outputs_required ? 'documents')
          AND doc->>'document_key' = ctx.ctx->>'document_key'
          AND (doc ? 'content_to_include')
        LIMIT 1
      ) exec ON true
    GROUP BY p.id
  )
  UPDATE public.dialectic_recipe_template_steps p
  SET outputs_required = jsonb_set(
        p.outputs_required,
        '{context_for_documents}',
        e.new_context_for_documents,
        true
      ),
      updated_at = now()
  FROM expanded e
  WHERE p.id = e.planner_id;

  -- 2) Expand each executor step documents[].content_to_include to include planner keys (within same template_id)
  WITH planner_docs AS (
    SELECT
      p.template_id,
      ctx->>'document_key' AS document_key,
      ctx->'content_to_include' AS planner_content_to_include
    FROM public.dialectic_recipe_template_steps p
      CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
    WHERE p.id = v_planner_step_id
  ),
  executor_steps AS (
    SELECT e.id, e.template_id, e.outputs_required
    FROM public.dialectic_recipe_template_steps e
    WHERE e.template_id = v_template_id
      AND e.id <> v_planner_step_id
      AND (e.outputs_required ? 'documents')
  ),
  expanded_docs AS (
    SELECT
      e.id AS executor_id,
      jsonb_agg(
        CASE
          WHEN pd.planner_content_to_include IS NULL THEN d.doc
          WHEN NOT (d.doc ? 'content_to_include') THEN d.doc
          ELSE jsonb_set(
            d.doc,
            '{content_to_include}',
            (
              d.doc->'content_to_include'
              ||
              pd.planner_content_to_include
            ),
            true
          )
        END
        ORDER BY d.ord
      ) AS new_documents
    FROM executor_steps e
      CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') WITH ORDINALITY AS d(doc, ord)
      LEFT JOIN planner_docs pd
        ON pd.template_id = e.template_id
       AND pd.document_key = d.doc->>'document_key'
    GROUP BY e.id
  )
  UPDATE public.dialectic_recipe_template_steps e
  SET outputs_required = jsonb_set(
        e.outputs_required,
        '{documents}',
        ed.new_documents,
        true
      ),
      updated_at = now()
  FROM expanded_docs ed
  WHERE e.id = ed.executor_id;

  -- -------------------------
  -- Stage recipe instances (parenthesis)
  -- -------------------------
  FOR v_instance_id IN
    SELECT i.id
    FROM public.dialectic_stage_recipe_instances i
    JOIN public.dialectic_stages s ON s.id = i.stage_id
    WHERE s.slug = v_stage_slug
  LOOP
    SELECT st.id
    INTO v_planner_step_id
    FROM public.dialectic_stage_recipe_steps st
    WHERE st.instance_id = v_instance_id
      AND st.step_key = v_planner_step_key
      AND st.job_type = 'PLAN'
      AND st.prompt_type = 'Planner'
      AND st.output_type = 'header_context'
    LIMIT 1;

    IF v_planner_step_id IS NULL THEN
      RAISE EXCEPTION 'Missing parenthesis stage planner step: stage_slug=% instance_id=% step_key=%', v_stage_slug, v_instance_id, v_planner_step_key;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.dialectic_stage_recipe_steps p
        CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
      WHERE p.id = v_planner_step_id
        AND NOT (ctx ? 'content_to_include')
    ) THEN
      RAISE EXCEPTION 'Parenthesis stage planner step % has a context_for_documents entry missing content_to_include', v_planner_step_id;
    END IF;

    -- 1) Expand stage planner context_for_documents to include executor keys (within same instance_id)
    WITH planner AS (
      SELECT id, instance_id, outputs_required
      FROM public.dialectic_stage_recipe_steps
      WHERE id = v_planner_step_id
    ),
    expanded AS (
      SELECT
        p.id AS planner_id,
        jsonb_agg(
          jsonb_set(
            ctx.ctx,
            '{content_to_include}',
            (
              ctx.ctx->'content_to_include'
              ||
              COALESCE(exec.exec_content_to_include, '{}'::jsonb)
            ),
            true
          )
          ORDER BY ctx.ord
        ) AS new_context_for_documents
      FROM planner p
        CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') WITH ORDINALITY AS ctx(ctx, ord)
        LEFT JOIN LATERAL (
          SELECT doc->'content_to_include' AS exec_content_to_include
          FROM public.dialectic_stage_recipe_steps e
            CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') AS doc
          WHERE e.instance_id = p.instance_id
            AND e.id <> p.id
            AND (e.outputs_required ? 'documents')
            AND doc->>'document_key' = ctx.ctx->>'document_key'
            AND (doc ? 'content_to_include')
          LIMIT 1
        ) exec ON true
      GROUP BY p.id
    )
    UPDATE public.dialectic_stage_recipe_steps p
    SET outputs_required = jsonb_set(
          p.outputs_required,
          '{context_for_documents}',
          e.new_context_for_documents,
          true
        ),
        updated_at = now()
    FROM expanded e
    WHERE p.id = e.planner_id;

    -- 2) Expand stage executor documents[].content_to_include to include planner keys (within same instance_id)
    WITH planner_docs AS (
      SELECT
        p.instance_id,
        ctx->>'document_key' AS document_key,
        ctx->'content_to_include' AS planner_content_to_include
      FROM public.dialectic_stage_recipe_steps p
        CROSS JOIN LATERAL jsonb_array_elements(p.outputs_required->'context_for_documents') AS ctx
      WHERE p.id = v_planner_step_id
    ),
    executor_steps AS (
      SELECT e.id, e.instance_id, e.outputs_required
      FROM public.dialectic_stage_recipe_steps e
      WHERE e.instance_id = v_instance_id
        AND e.id <> v_planner_step_id
        AND (e.outputs_required ? 'documents')
    ),
    expanded_docs AS (
      SELECT
        e.id AS executor_id,
        jsonb_agg(
          CASE
            WHEN pd.planner_content_to_include IS NULL THEN d.doc
            WHEN NOT (d.doc ? 'content_to_include') THEN d.doc
            ELSE jsonb_set(
              d.doc,
              '{content_to_include}',
              (
                d.doc->'content_to_include'
                ||
                pd.planner_content_to_include
              ),
              true
            )
          END
          ORDER BY d.ord
        ) AS new_documents
      FROM executor_steps e
        CROSS JOIN LATERAL jsonb_array_elements(e.outputs_required->'documents') WITH ORDINALITY AS d(doc, ord)
        LEFT JOIN planner_docs pd
          ON pd.instance_id = e.instance_id
         AND pd.document_key = d.doc->>'document_key'
      GROUP BY e.id
    )
    UPDATE public.dialectic_stage_recipe_steps e
    SET outputs_required = jsonb_set(
          e.outputs_required,
          '{documents}',
          ed.new_documents,
          true
        ),
        updated_at = now()
    FROM expanded_docs ed
    WHERE e.id = ed.executor_id;
  END LOOP;
END $$;