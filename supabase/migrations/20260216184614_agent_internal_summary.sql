-- Migration: Rename system_materials.executive_summary to system_materials.agent_internal_summary
-- 
-- Rationale: AI models were conflating the top-level system_materials.executive_summary
-- with per-document content_to_include.executive_summary fields, causing semantic 
-- deduplication and dropping required keys from header context outputs.
--
-- This migration updates all PLAN recipe steps to use agent_internal_summary in 
-- system_materials, preserving executive_summary in document content_to_include objects.

-- Update dialectic_recipe_template_steps
UPDATE public.dialectic_recipe_template_steps
SET outputs_required = 
    jsonb_set(
        outputs_required #- '{system_materials,executive_summary}',
        '{system_materials,agent_internal_summary}',
        outputs_required->'system_materials'->'executive_summary'
    )
WHERE job_type = 'PLAN'
  AND outputs_required->'system_materials' ? 'executive_summary';

-- Update dialectic_stage_recipe_steps
UPDATE public.dialectic_stage_recipe_steps
SET outputs_required = 
    jsonb_set(
        outputs_required #- '{system_materials,executive_summary}',
        '{system_materials,agent_internal_summary}',
        outputs_required->'system_materials'->'executive_summary'
    )
WHERE job_type = 'PLAN'
  AND outputs_required->'system_materials' ? 'executive_summary';
