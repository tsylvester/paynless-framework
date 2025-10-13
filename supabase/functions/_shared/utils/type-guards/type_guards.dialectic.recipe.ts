import type {
  DialecticRecipeStep,
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

export function isDialecticRecipeStep(obj: unknown): obj is DialecticRecipeStep {
  if (!isRecord(obj)) {
    return false;
  }

  if (typeof obj.step_number !== 'number' ||
      typeof obj.step_key !== 'string' ||
      typeof obj.step_slug !== 'string' ||
      typeof obj.step_name !== 'string' ||
      typeof obj.job_type !== 'string' || !validJobTypes.has(obj.job_type) ||
      typeof obj.prompt_type !== 'string' || !validPromptTypes.has(obj.prompt_type) ||
      typeof obj.output_type !== 'string' ||
      typeof obj.granularity_strategy !== 'string' || !validGranularityStrategies.has(obj.granularity_strategy) ||
      !Array.isArray(obj.inputs_required) ||
      !Array.isArray(obj.inputs_relevance) ||
      !Array.isArray(obj.outputs_required)) {
    return false;
  }
    
  // Optional fields validation
  if (('parallel_group' in obj) && obj.parallel_group !== null && typeof obj.parallel_group !== 'number') {
    return false;
  }
  if (('branch_key' in obj) && obj.branch_key !== null && typeof obj.branch_key !== 'string') {
    return false;
  }
  if (('prompt_template_id' in obj) && obj.prompt_template_id !== null && typeof obj.prompt_template_id !== 'string') {
    return false;
  }

  return true;
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

    return (
        typeof obj.document_key === 'string' &&
        typeof obj.type === 'string' &&
        typeof obj.relevance === 'number'
    );
}

export function isOutputRule(obj: unknown): obj is OutputRule {
    if (!isRecord(obj)) {
        return false;
    }

    return (
        typeof obj.type === 'string' &&
        typeof obj.document_key === 'string'
    );
}
