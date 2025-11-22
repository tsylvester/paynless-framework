import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts";
import {
  StageRecipeResponse,
  StageRecipeStepDto,
  InputRule,
  RelevanceRule,
  OutputRule,
  BranchKey,
  JobType, 
  PromptType, 
  GranularityStrategy,
} from "./dialectic.interface.ts";
import { isInputRule, isRelevanceRule, isOutputRule } from "../_shared/utils/type-guards/type_guards.dialectic.recipe.ts";
import { isRecord } from "../_shared/utils/type-guards/type_guards.common.ts";
import type { ModelContributionFileTypes } from "../_shared/types/file_manager.types.ts";
import { isModelContributionFileType, isFileType } from "../_shared/utils/type-guards/type_guards.file_manager.ts";

export async function getStageRecipe(
  payload: { stageSlug: string },
  dbClient: SupabaseClient<Database>
): Promise<{ status: number; data?: StageRecipeResponse; error?: { message: string } }> {
  const stageSlug = payload.stageSlug;
  if (!stageSlug) {
    return { status: 400, error: { message: "stageSlug is required" } };
  }

  // 1) Fetch the stage to get active_recipe_instance_id
  const { data: stageRow, error: stageErr } = await dbClient
    .from('dialectic_stages')
    .select('id, slug, active_recipe_instance_id')
    .eq('slug', stageSlug)
    .single();

  if (stageErr || !stageRow) {
    return { status: 404, error: { message: "Stage not found" } };
  }

  const instanceId = stageRow.active_recipe_instance_id;
  if (!instanceId) {
    return { status: 400, error: { message: "Stage has no active recipe instance" } };
  }

  // 2) Load instance steps
  const { data: rawSteps, error: stepsErr } = await dbClient
    .from('dialectic_stage_recipe_steps')
    .select(
      'id, instance_id, step_key, step_slug, step_name, execution_order, parallel_group, branch_key, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required'
    )
    .eq('instance_id', instanceId)
    .order('execution_order', { ascending: true })
    .order('step_key', { ascending: true });

  if (stepsErr || !rawSteps) {
    return { status: 500, error: { message: "Failed to load stage recipe steps" } };
  }

  // 3) Normalize and validate, then sort DTOs (avoid pre-sort on unknown objects)
  const normalized: StageRecipeStepDto[] = [];

  const isJobType = (v: unknown): v is JobType => v === 'PLAN' || v === 'EXECUTE' || v === 'RENDER';
  const isPromptType = (v: unknown): v is PromptType => v === 'Seed' || v === 'Planner' || v === 'Turn' || v === 'Continuation';
  const isGranularity = (v: unknown): v is GranularityStrategy => (
    v === 'per_source_document' || v === 'pairwise_by_origin' || v === 'per_source_group' || v === 'all_to_one' || v === 'per_source_document_by_lineage' || v === 'per_model'
  );
  const isNumOrNull = (v: unknown): v is number | null => v === null || typeof v === 'number';
  const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
  const isBranchKey = (v: unknown): v is BranchKey => (
    typeof v === 'string' && Object.values(BranchKey).some((bk) => bk === v)
  );
  for (const s of rawSteps) {
    if (!isRecord(s)) {
      return { status: 500, error: { message: "Malformed step row from database (not an object)" } };
    }

    // Identity fields
    if (typeof s.id !== 'string' || typeof s.step_key !== 'string' || typeof s.step_slug !== 'string' || typeof s.step_name !== 'string') {
      return { status: 500, error: { message: `Malformed step identity fields for step_key=${String(s.step_key)}` } };
    }

    // Enum-like fields
    if (!isJobType(s.job_type)) return { status: 500, error: { message: `Invalid job_type for step_key=${s.step_key}: ${String(s.job_type)}` } };
    const jobType: JobType = s.job_type;
    if (!isPromptType(s.prompt_type)) return { status: 500, error: { message: `Invalid prompt_type for step_key=${s.step_key}: ${String(s.prompt_type)}` } };
    const promptType: PromptType = s.prompt_type;
    if (!isGranularity(s.granularity_strategy)) return { status: 500, error: { message: `Invalid granularity_strategy for step_key=${s.step_key}: ${String(s.granularity_strategy)}` } };
    const granularity: GranularityStrategy = s.granularity_strategy;

    // Validate output_type: must be a ModelContributionFileType, and if renderable, include in DTO
    const rawType = String(s.output_type);
    
    // First check if it's a valid FileType at all (if not, this is a data integrity error)
    if (!isFileType(rawType)) {
      return { status: 500, error: { message: `Invalid output_type for step_key=${s.step_key}: ${rawType} is not a valid FileType` } };
    }
    
    // If it's a valid FileType but not a ModelContributionFileType, handle based on type
    if (!isModelContributionFileType(rawType)) {
      // 'rendered_document' for EXECUTE jobs is a data integrity error (migrations should have fixed this)
      // This should cause an error, not be filtered out silently
      if (rawType === 'rendered_document' && jobType === 'EXECUTE') {
        return { status: 500, error: { message: `Invalid output_type for step_key=${s.step_key}: ${rawType} is not a ModelContributionFileType` } };
      }
      // Other backend-only types (like assembled_document_json) should be filtered out silently
      // These are legitimate intermediate types that should not appear in the frontend DTO
      console.error(`[getStageRecipe] Filtering out step with backend-only output_type for step_key=${s.step_key}: ${rawType} is not a ModelContributionFileType (backend-only type)`);
      continue;
    }
    
    // At this point, rawType is validated as a ModelContributionFileType
    // All steps are included in the DTO - frontend needs all steps (including PLAN with header_context) to track progress
    const mappedOutputType: ModelContributionFileTypes = rawType;

    // Validate arrays and elements
    if (!Array.isArray(s.inputs_required)) {
      return { status: 500, error: { message: `Malformed inputs_required (not array) for step_key=${s.step_key}` } };
    }
    const inputsRequired: InputRule[] = [];
    for (let i = 0; i < s.inputs_required.length; i++) {
      const item = s.inputs_required[i];
      if (!isInputRule(item)) return { status: 500, error: { message: `Malformed inputs_required[${i}] for step_key=${s.step_key}` } };
      inputsRequired.push(item);
    }

    if (!Array.isArray(s.inputs_relevance)) {
      return { status: 500, error: { message: `Malformed inputs_relevance (not array) for step_key=${s.step_key}` } };
    }
    const inputsRelevance: RelevanceRule[] = [];
    for (let i = 0; i < s.inputs_relevance.length; i++) {
      const item = s.inputs_relevance[i];
      if (!isRelevanceRule(item)) return { status: 500, error: { message: `Malformed inputs_relevance[${i}] for step_key=${s.step_key}` } };
      inputsRelevance.push(item);
    }

    const outputsRequired: OutputRule[] = [];
    if (!isOutputRule(s.outputs_required)) return { status: 500, error: { message: `Malformed outputs_required for step_key=${s.step_key}` } };
    outputsRequired.push(s.outputs_required);

    // Validate nullable simple fields
    if (!isNumOrNull(s.parallel_group)) {
      return { status: 500, error: { message: `Malformed parallel_group for step_key=${s.step_key}` } };
    }
    if (!isStrOrNull(s.branch_key)) {
      return { status: 500, error: { message: `Malformed branch_key for step_key=${s.step_key}` } };
    }
    if (!isStrOrNull(s.prompt_template_id)) {
      return { status: 500, error: { message: `Malformed prompt_template_id for step_key=${s.step_key}` } };
    }
    const parallelGroup: number | null = s.parallel_group;
    let branchKey: BranchKey | null = null;
    if (s.branch_key !== null) {
      if (!isBranchKey(s.branch_key)) {
        return { status: 500, error: { message: `Invalid branch_key for step_key=${s.step_key}: ${String(s.branch_key)}` } };
      }
      branchKey = s.branch_key;
    }
    const promptTemplateId: string | null = s.prompt_template_id;

    if (typeof s.execution_order !== 'number') {
      return { status: 500, error: { message: `Malformed execution_order for step_key=${s.step_key}` } };
    }
    const execOrder: number = s.execution_order;

    const dto: StageRecipeStepDto = {
      id: String(s.id),
      step_key: s.step_key,
      step_slug: s.step_slug,
      step_name: s.step_name,
      execution_order: execOrder,
      parallel_group: parallelGroup,
      branch_key: branchKey,
      job_type: jobType,
      prompt_type: promptType,
      prompt_template_id: promptTemplateId,
      output_type: mappedOutputType,
      granularity_strategy: granularity,
      inputs_required: inputsRequired,
      inputs_relevance: inputsRelevance,
      outputs_required: outputsRequired,
    };

    normalized.push(dto);
  }

  // Stable sort DTOs now that types are validated
  normalized.sort((a, b) => {
    if (a.execution_order !== b.execution_order) return a.execution_order - b.execution_order;
    return a.step_key.localeCompare(b.step_key);
  });

  const response: StageRecipeResponse = {
    stageSlug,
    instanceId,
    steps: normalized,
  };

  return { status: 200, data: response };
}



