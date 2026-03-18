-- Table: document key → friendly name, stage group, layer, audience for GitHub sync (per recipe template).
CREATE TABLE public.dialectic_sync_maps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid NOT NULL REFERENCES public.dialectic_recipe_templates(id) ON DELETE CASCADE,
    document_key text NOT NULL,
    friendly_name text NOT NULL,
    stage_group text NOT NULL,
    layer text NOT NULL CHECK (layer IN ('research', 'decision', 'action')),
    audience text CHECK (audience IN ('leadership', 'management', 'build')),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (template_id, document_key)
);

COMMENT ON TABLE public.dialectic_sync_maps IS 'Per-template mapping of document keys to friendly export names and audience presets for GitHub sync.';
COMMENT ON COLUMN public.dialectic_sync_maps.template_id IS 'Recipe template this row belongs to.';
COMMENT ON COLUMN public.dialectic_sync_maps.document_key IS 'FileType document key (e.g. business_case, actionable_checklist).';
COMMENT ON COLUMN public.dialectic_sync_maps.friendly_name IS 'Human-friendly export file name without extension.';
COMMENT ON COLUMN public.dialectic_sync_maps.stage_group IS 'Human-readable stage label (e.g. proposal, review, planning).';
COMMENT ON COLUMN public.dialectic_sync_maps.layer IS 'Categorization for UI: research, decision, or action.';
COMMENT ON COLUMN public.dialectic_sync_maps.audience IS 'Audience preset (leadership, management, build); NULL = opt-in only.';
COMMENT ON COLUMN public.dialectic_sync_maps.sort_order IS 'Display order in sync dialog.';

ALTER TABLE public.dialectic_sync_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dialectic_sync_maps_authenticated_select"
    ON public.dialectic_sync_maps FOR SELECT TO authenticated USING (true);

-- Seed: insert 18 document keys for every active recipe template (so getSyncMap works for any project template).
INSERT INTO public.dialectic_sync_maps (template_id, document_key, friendly_name, stage_group, layer, audience, sort_order)
SELECT t.id, v.document_key, v.friendly_name, v.stage_group, v.layer, v.audience, v.sort_order
FROM public.dialectic_recipe_templates t
CROSS JOIN (VALUES
    ('business_case', 'business_case', 'proposal', 'research', 'leadership'::text, 1),
    ('feature_spec', 'feature_specifications', 'proposal', 'research', 'leadership', 2),
    ('technical_approach', 'technical_approach', 'proposal', 'research', 'leadership', 3),
    ('success_metrics', 'success_metrics', 'proposal', 'research', 'leadership', 4),
    ('business_case_critique', 'business_case_critique', 'review', 'research', NULL, 5),
    ('technical_feasibility_assessment', 'technical_feasibility', 'review', 'research', NULL, 6),
    ('risk_register', 'risk_register', 'review', 'research', NULL, 7),
    ('non_functional_requirements', 'non_functional_requirements', 'review', 'research', NULL, 8),
    ('dependency_map', 'dependency_map', 'review', 'research', NULL, 9),
    ('product_requirements', 'product_requirements', 'refinement', 'decision', 'management', 10),
    ('system_architecture', 'system_architecture', 'refinement', 'decision', 'management', 11),
    ('tech_stack', 'tech_stack', 'refinement', 'decision', 'management', 12),
    ('technical_requirements', 'technical_requirements', 'planning', 'action', 'management', 13),
    ('master_plan', 'master_plan', 'planning', 'action', 'build', 14),
    ('milestone_schema', 'milestones', 'planning', 'action', 'build', 15),
    ('updated_master_plan', 'updated_master_plan', 'implementation', 'action', 'build', 16),
    ('actionable_checklist', 'work_plan', 'implementation', 'action', 'build', 17),
    ('advisor_recommendations', 'recommendations', 'implementation', 'action', 'build', 18)
) AS v(document_key, friendly_name, stage_group, layer, audience, sort_order)
WHERE t.is_active;
