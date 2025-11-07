import type { Tables } from '../../types_db.ts';
import {
    isDialecticStageRecipeStep,
    isGranularityStrategy,
    isInputRuleArray,
    isJobTypeEnum,
    isOutputRuleArray,
    isPromptType,
    isRelevanceRuleArray,
} from './type-guards/type_guards.dialectic.ts';
import type {
  DatabaseRecipeSteps,
  DialecticStageRecipeStep,
  StageWithRecipeSteps,
} from '../../dialectic-service/dialectic.interface.ts';

export function mapToStageWithRecipeSteps(
  dbResponse: DatabaseRecipeSteps,
): StageWithRecipeSteps {
  // Destructure to separate the stage properties from the nested instances array.
  const { dialectic_stage_recipe_instances, ...dialectic_stage } = dbResponse;

  // The inner join in the query ensures at least one instance, but this provides robustness.
  if (!dialectic_stage_recipe_instances || dialectic_stage_recipe_instances.length === 0) {
    throw new Error(
      'Invalid DatabaseRecipeSteps object: dialectic_stage_recipe_instances is missing or empty.',
    );
  }

  // Take the first recipe instance from the array.
  const instanceWithSteps = dialectic_stage_recipe_instances[0];

  // Destructure the instance to separate its properties from the nested steps array.
  const { dialectic_stage_recipe_steps, ...instance } = instanceWithSteps;

  // The inner join also ensures steps exist, but we provide a fallback for safety.
  const rawSteps = dialectic_stage_recipe_steps || [];

  const transformedSteps: DialecticStageRecipeStep[] = rawSteps.map((step: Tables<'dialectic_stage_recipe_steps'>) => {
    const transformedStep = {
        ...step,
        job_type: isJobTypeEnum(step.job_type) ? step.job_type : undefined,
        prompt_type: isPromptType(step.prompt_type) ? step.prompt_type : undefined,
        granularity_strategy: isGranularityStrategy(step.granularity_strategy) ? step.granularity_strategy : undefined,
        output_type: step.output_type,
        inputs_required: isInputRuleArray(step.inputs_required) ? step.inputs_required : [],
        inputs_relevance: isRelevanceRuleArray(step.inputs_relevance) ? step.inputs_relevance : [],
        outputs_required: isOutputRuleArray(step.outputs_required) ? step.outputs_required : [],
    };

    if (!isDialecticStageRecipeStep(transformedStep)) {
        throw new Error(`Failed to map and validate recipe step: ${JSON.stringify(step)}`);
    }

    return transformedStep;
  });

  return {
    dialectic_stage,
    dialectic_stage_recipe_instances: instance,
    dialectic_stage_recipe_steps: transformedSteps,
  };
}
