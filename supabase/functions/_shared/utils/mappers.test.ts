import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapToStageWithRecipeSteps } from './mappers.ts';
import type { DatabaseRecipeSteps, DialecticStageRecipeStep, StageWithRecipeSteps } from '../../dialectic-service/dialectic.interface.ts';
import type { Tables } from '../../types_db.ts';
import { isDialecticStageRecipeStep } from './type-guards/type_guards.dialectic.ts';
import { FileType } from '../types/file_manager.types.ts';

describe('mapToStageWithRecipeSteps', () => {
  it('should flatten the nested recipe steps structure into a StageWithRecipeSteps DTO', () => {
    const mockRecipeStep1: Tables<'dialectic_stage_recipe_steps'> = {
      branch_key: null,
      config_override: {},
      created_at: '2025-11-05T12:00:00.000Z',
      execution_order: 1,
      granularity_strategy: 'all_to_one',
      id: 'step-1',
      inputs_relevance: {},
      inputs_required: {},
      instance_id: 'instance-1',
      is_skipped: false,
      job_type: 'PLAN',
      object_filter: {},
      output_overrides: {},
      output_type: FileType.HeaderContext,
      outputs_required: {},
      parallel_group: null,
      prompt_template_id: 'template-planner-a',
      prompt_type: 'Planner',
      step_description: 'First step',
      step_key: 'planner_a',
      step_name: 'Planner A',
      step_slug: 'planner_a',
      template_step_id: null,
      updated_at: '2025-11-05T12:00:00.000Z',
    };

    const mockRecipeStep2: Tables<'dialectic_stage_recipe_steps'> = {
      branch_key: 'synthesis_pairwise_business_case',
      config_override: {},
      created_at: '2025-11-05T12:00:01.000Z',
      execution_order: 2,
      granularity_strategy: 'per_source_document',
      id: 'step-2',
      inputs_relevance: {},
      inputs_required: {},
      instance_id: 'instance-1',
      is_skipped: false,
      job_type: 'EXECUTE',
      object_filter: {},
      output_overrides: {},
      output_type: FileType.AssembledDocumentJson,
      outputs_required: {},
      parallel_group: 1,
      prompt_template_id: 'template-turn-a',
      prompt_type: 'Turn',
      step_description: 'Second step',
      step_key: 'turn_a',
      step_name: 'Turn A',
      step_slug: 'turn_a',
      template_step_id: null,
      updated_at: '2025-11-05T12:00:01.000Z',
    };

    const mockStageData: Tables<'dialectic_stages'> = {
        active_recipe_instance_id: 'instance-1',
        created_at: '2025-11-05T11:58:00.000Z',
        default_system_prompt_id: 'default-prompt',
        description: 'Synthesizes thesis and antithesis.',
        display_name: 'Synthesis',
        expected_output_template_ids: [],
        id: 'stage-1',
        recipe_template_id: 'template-1',
        slug: 'synthesis',
    };

    const mockInstanceData: Tables<'dialectic_stage_recipe_instances'> = {
        cloned_at: null,
        created_at: '2025-11-05T11:59:00.000Z',
        id: 'instance-1',
        is_cloned: false,
        stage_id: 'stage-1',
        template_id: 'template-1',
        updated_at: '2025-11-05T11:59:00.000Z',
    };

    const mockDbResponse: DatabaseRecipeSteps = {
      ...mockStageData,
      dialectic_stage_recipe_instances: [
        {
          ...mockInstanceData,
          dialectic_stage_recipe_steps: [mockRecipeStep1, mockRecipeStep2],
        },
      ],
    };

    const expectedStep1: DialecticStageRecipeStep = {
        ...mockRecipeStep1,
        job_type: 'PLAN',
        prompt_type: 'Planner',
        granularity_strategy: 'all_to_one',
        output_type: FileType.HeaderContext,
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: [],
    };

    const expectedStep2: DialecticStageRecipeStep = {
        ...mockRecipeStep2,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        granularity_strategy: 'per_source_document',
        output_type: FileType.AssembledDocumentJson,
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: [],
    };

    const expected: StageWithRecipeSteps = {
        dialectic_stage: mockStageData,
        dialectic_stage_recipe_instances: mockInstanceData,
        dialectic_stage_recipe_steps: [expectedStep1, expectedStep2],
    };

    const actual = mapToStageWithRecipeSteps(mockDbResponse);

    assertEquals(actual, expected);

    actual.dialectic_stage_recipe_steps.forEach(step => {
        assert(isDialecticStageRecipeStep(step), `Step ${step.id} should be a valid DialecticStageRecipeStep`);
    });
  });
});
