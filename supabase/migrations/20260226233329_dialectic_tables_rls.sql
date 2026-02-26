-- Enable RLS on dialectic tables (COW DAG) with authenticated read policy.
-- service_role bypasses RLS; authenticated users can SELECT for getStageRecipe and future user access.
-- See: docs/implementations/Current/Checklists/Current/RLS Gaps Validation Report.md

ALTER TABLE public.dialectic_document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialectic_document_templates_authenticated_select"
  ON public.dialectic_document_templates FOR SELECT TO authenticated USING (true);

ALTER TABLE public.dialectic_recipe_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialectic_recipe_templates_authenticated_select"
  ON public.dialectic_recipe_templates FOR SELECT TO authenticated USING (true);

ALTER TABLE public.dialectic_recipe_template_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialectic_recipe_template_steps_authenticated_select"
  ON public.dialectic_recipe_template_steps FOR SELECT TO authenticated USING (true);

ALTER TABLE public.dialectic_recipe_template_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialectic_recipe_template_edges_authenticated_select"
  ON public.dialectic_recipe_template_edges FOR SELECT TO authenticated USING (true);

ALTER TABLE public.dialectic_stage_recipe_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialectic_stage_recipe_instances_authenticated_select"
  ON public.dialectic_stage_recipe_instances FOR SELECT TO authenticated USING (true);

ALTER TABLE public.dialectic_stage_recipe_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialectic_stage_recipe_steps_authenticated_select"
  ON public.dialectic_stage_recipe_steps FOR SELECT TO authenticated USING (true);

ALTER TABLE public.dialectic_stage_recipe_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialectic_stage_recipe_edges_authenticated_select"
  ON public.dialectic_stage_recipe_edges FOR SELECT TO authenticated USING (true);
