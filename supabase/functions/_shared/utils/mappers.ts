import {
  isDialecticStageRecipeStep,
  isGranularityStrategy,
  isJobTypeEnum,
  isPromptType,
} from './type-guards/type_guards.dialectic.ts';
import { isFileType } from './type-guards/type_guards.file_manager.ts';
import { isRecord } from './type-guards/type_guards.common.ts';
import type {
  DatabaseRecipeSteps,
  DialecticStageRecipeStep,
  StageWithRecipeSteps,
  OutputRule,
} from '../../dialectic-service/dialectic.interface.ts';
import type { Tables } from '../../types_db.ts';

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter, index) => {
    return index === 0 ? letter.toLowerCase() : `_${letter.toLowerCase()}`;
  });
}

export function mapToStageWithRecipeSteps(
  dbResponse: DatabaseRecipeSteps,
): StageWithRecipeSteps {
  // Destructure to separate the stage properties from the nested instances array.
  const { dialectic_stage_recipe_instances, ...dialectic_stage } = dbResponse;

  const instances = Array.isArray(dialectic_stage_recipe_instances) 
    ? dialectic_stage_recipe_instances 
    : [dialectic_stage_recipe_instances];

  // The inner join in the query ensures at least one instance, but this provides robustness.
  if (!instances || instances.length === 0) {
    throw new Error(
      'Invalid DatabaseRecipeSteps object: dialectic_stage_recipe_instances is missing or empty.',
    );
  }

  // Take the first recipe instance from the array.
  const instanceWithSteps = instances[0];

  // Destructure the instance to separate its properties from the nested steps array.
  const { dialectic_stage_recipe_steps, ...instance } = instanceWithSteps;

  // The inner join also ensures steps exist, but we provide a fallback for safety.
  const rawSteps = dialectic_stage_recipe_steps || [];

  const transformedSteps: DialecticStageRecipeStep[] = rawSteps.map((
    step: Tables<'dialectic_stage_recipe_steps'>,
  ) => {
    const jobType = step.job_type;
    const promptType = step.prompt_type;
    const granularityStrategy = step.granularity_strategy;
    const outputType = toSnakeCase(step.output_type);

    if (!isJobTypeEnum(jobType)) {
      throw new Error(`Invalid job_type: ${jobType}`);
    }
    if (!isPromptType(promptType)) {
      throw new Error(`Invalid prompt_type: ${promptType}`);
    }
    if (!isGranularityStrategy(granularityStrategy)) {
      throw new Error(
        `Invalid granularity_strategy: ${granularityStrategy}`,
      );
    }
    if (!isFileType(outputType)) {
      throw new Error(`Invalid output_type: ${step.output_type}`);
    }

    let inputsRequired, inputsRelevance, outputsRequired: OutputRule;

    try {
      const parsed = typeof step.inputs_required === 'string'
        ? JSON.parse(step.inputs_required)
        : step.inputs_required;
      inputsRequired = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error(
        `JSON parse error in inputs_required for step: ${step.step_key}`,
        step.inputs_required,
      );
      throw e;
    }

    try {
      const parsed = typeof step.inputs_relevance === 'string'
        ? JSON.parse(step.inputs_relevance)
        : step.inputs_relevance;
      inputsRelevance = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error(
        `JSON parse error in inputs_relevance for step: ${step.step_key}`,
        step.inputs_relevance,
      );
      throw e;
    }

    try {
      const parsed = typeof step.outputs_required === 'string'
        ? JSON.parse(step.outputs_required)
        : step.outputs_required;
      outputsRequired = isRecord(parsed) ? parsed : {};
    } catch (e) {
      console.error(
        `Invalid outputs_required for step: ${step.step_key}`,
        step.outputs_required,
      );
      throw new Error(`Invalid outputs_required for step: ${step.step_key}`);
    }

    const transformedStep: DialecticStageRecipeStep = {
      ...step,
      job_type: jobType,
      prompt_type: promptType,
      granularity_strategy: granularityStrategy,
      output_type: outputType,
      inputs_required: inputsRequired,
      inputs_relevance: inputsRelevance,
      outputs_required: outputsRequired,
    };

    if (!isDialecticStageRecipeStep(transformedStep)) {
      console.error(
        'Validation failed for step:',
        JSON.stringify(transformedStep, null, 2),
      );
      throw new Error(
        `Failed to map and validate recipe step: ${step.step_key}. The transformed object did not pass type guard validation.`,
      );
    }

    return transformedStep;
  });

  return {
    dialectic_stage,
    dialectic_stage_recipe_instances: instance,
    dialectic_stage_recipe_steps: transformedSteps,
  };
}

