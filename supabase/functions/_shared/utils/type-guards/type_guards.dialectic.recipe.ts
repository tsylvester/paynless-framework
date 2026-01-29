import type {
  DialecticRecipeStep,
  DialecticRecipeTemplateStep,
  DialecticStageRecipeStep,
  InputRule,
  RelevanceRule,
  OutputRule,
} from '../../../dialectic-service/dialectic.interface.ts';
import { isRecord } from './type_guards.common.ts';

const validJobTypes = new Set(['PLAN', 'EXECUTE', 'RENDER']);
const validPromptTypes = new Set(['Seed', 'Planner', 'Turn', 'Continuation']);
const validGranularityStrategies = new Set([
    'per_source_document',
    'pairwise_by_origin',
    'per_source_group',
    'all_to_one',
    'per_source_document_by_lineage',
    'per_model',
]);
const validInputRuleTypes = new Set(['document', 'feedback', 'header_context', 'seed_prompt']);

export function isDialecticRecipeTemplateStep(step: unknown): step is DialecticRecipeTemplateStep {
  if (!isRecord(step)) {
    return false;
  }

  if (
    typeof step.id !== 'string' ||
    typeof step.template_id !== 'string' ||
    typeof step.created_at !== 'string' ||
    typeof step.updated_at !== 'string' ||
    typeof step.step_number !== 'number' ||
    typeof step.step_key !== 'string' ||
    typeof step.step_slug !== 'string' ||
    typeof step.step_name !== 'string' ||
    typeof step.job_type !== 'string' || !validJobTypes.has(step.job_type) ||
    typeof step.prompt_type !== 'string' || !validPromptTypes.has(step.prompt_type) ||
    typeof step.output_type !== 'string' ||
    typeof step.granularity_strategy !== 'string' || !validGranularityStrategies.has(step.granularity_strategy) ||
    !Array.isArray(step.inputs_required) ||
    !Array.isArray(step.inputs_relevance) ||
    !isRecord(step.outputs_required)
  ) {
    return false;
  }

  // Optional fields validation
  if (('parallel_group' in step) && step.parallel_group !== null && typeof step.parallel_group !== 'number') {
    return false;
  }
  if (('branch_key' in step) && step.branch_key !== null && typeof step.branch_key !== 'string') {
    return false;
  }
  if (('prompt_template_id' in step) && step.prompt_template_id !== null && typeof step.prompt_template_id !== 'string') {
    return false;
  }
  if (('step_description' in step) && step.step_description !== null && typeof step.step_description !== 'string') {
    return false;
  }

  return true;
}

export function isDialecticStageRecipeStep(step: unknown): step is DialecticStageRecipeStep {
    if (!isRecord(step)) {
        return false;
    }

    if (
        typeof step.id !== 'string' ||
        typeof step.instance_id !== 'string' ||
        (step.template_step_id !== null && typeof step.template_step_id !== 'string') ||
        typeof step.created_at !== 'string' ||
        typeof step.updated_at !== 'string' ||
        typeof step.step_key !== 'string' ||
        typeof step.step_slug !== 'string' ||
        typeof step.step_name !== 'string' ||
        typeof step.job_type !== 'string' || !validJobTypes.has(step.job_type) ||
        typeof step.prompt_type !== 'string' || !validPromptTypes.has(step.prompt_type) ||
        typeof step.output_type !== 'string' ||
        typeof step.granularity_strategy !== 'string' || !validGranularityStrategies.has(step.granularity_strategy) ||
        !isRecord(step.config_override) ||
        typeof step.is_skipped !== 'boolean' ||
        !isRecord(step.object_filter) ||
        !isRecord(step.output_overrides) ||
        !Array.isArray(step.inputs_required) ||
        !Array.isArray(step.inputs_relevance) ||
        !isRecord(step.outputs_required)
    ) {
        return false;
    }

    // Optional fields
    if (step.parallel_group !== null && typeof step.parallel_group !== 'number') return false;
    if (step.branch_key !== null && typeof step.branch_key !== 'string') return false;
    if (step.prompt_template_id !== null && typeof step.prompt_template_id !== 'string') return false;
    if (step.execution_order !== null && typeof step.execution_order !== 'number') return false;

    return true;
}

export function isDialecticRecipeStep(step: unknown): step is DialecticRecipeStep {
    return isDialecticRecipeTemplateStep(step) || isDialecticStageRecipeStep(step);
}

export function isInputRule(obj: unknown): obj is InputRule {
    if (!isRecord(obj)) {
        return false;
    }

    if (typeof obj.type !== 'string' || !validInputRuleTypes.has(obj.type)) {
        return false;
    }

    if (('stage_slug' in obj) && typeof obj.stage_slug !== 'string') return false;
    if (('document_key' in obj) && typeof obj.document_key !== 'string') return false;
    if (('required' in obj) && typeof obj.required !== 'boolean') return false;
    if (('multiple' in obj) && typeof obj.multiple !== 'boolean') return false;

    return true;
}

export function isRelevanceRule(obj: unknown): obj is RelevanceRule {
    if (!isRecord(obj)) {
        return false;
    }

    if (typeof obj.document_key !== 'string' || typeof obj.relevance !== 'number') {
        return false;
    }

    if ('type' in obj && typeof obj.type !== 'string') {
        return false;
    }

    return true;
}

export function isOutputRule(obj: unknown): obj is OutputRule {
    if (!isRecord(obj)) {
        return false;
    }

    // Since all properties on OutputRule are optional, an empty object is valid.
    // We only need to validate the properties if they exist.

    if ('system_materials' in obj && !isRecord(obj.system_materials)) {
        return false;
    }

    if ('header_context_artifact' in obj && !isRecord(obj.header_context_artifact)) {
        return false;
    }

    if ('context_for_documents' in obj && !Array.isArray(obj.context_for_documents)) {
        return false;
    }

    if ('documents' in obj && !Array.isArray(obj.documents)) {
        return false;
    }

    if ('assembled_json' in obj && !Array.isArray(obj.assembled_json)) {
        return false;
    }

    if ('files_to_generate' in obj) {
        if (!Array.isArray(obj.files_to_generate)) {
            return false;
        }
        for (const item of obj.files_to_generate) {
            if (!isRecord(item) || typeof item.from_document_key !== 'string' || typeof item.template_filename !== 'string') {
                return false;
            }
        }
    }

    if ('review_metadata' in obj && !isRecord(obj.review_metadata)) {
        return false;
    }

    return true;
}
