-- Allow per-document feedback uniqueness 
--
-- Previous constraint:
--   unique_session_stage_iteration_feedback UNIQUE (session_id, project_id, stage_slug, iteration_number)
--
-- New behavior:
--   - Document-specific feedback (resource_description.document_key + resource_description.model_id present)
--     is unique per (session, project, stage, iteration, document_key, model_id).

-- Drop the old stage-level uniqueness constraint (too coarse for doc-centric feedback).
ALTER TABLE public.dialectic_feedback
DROP CONSTRAINT IF EXISTS unique_session_stage_iteration_feedback;

-- Enforce doc-centric uniqueness when document_key and model_id are present.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dialectic_feedback_unique_document_model
ON public.dialectic_feedback (
  session_id,
  project_id,
  stage_slug,
  iteration_number,
  (resource_description->>'document_key'),
  (resource_description->>'model_id')
)
WHERE (resource_description->>'document_key') IS NOT NULL
  AND (resource_description->>'model_id') IS NOT NULL;