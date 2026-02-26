import {
  assertEquals,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import type {
  DialecticRecipeStep,
  DialecticRecipeTemplateStep,
  DialecticStageRecipeStep,
  InputRule,
  RelevanceRule,
  OutputRule,
} from '../../../dialectic-service/dialectic.interface.ts';
import {
  isDialecticRecipeStep,
  isDialecticRecipeTemplateStep,
  isDialecticStageRecipeStep,
  isInputRule,
  isRelevanceRule,
  isOutputRule,
} from './type_guards.dialectic.recipe.ts';
import { FileType } from '../../types/file_manager.types.ts';

Deno.test('Type Guard: isDialecticRecipeTemplateStep', async (t) => {
  const baseValidStep: DialecticRecipeTemplateStep = {
    id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    template_id: 'b2c3d4e5-f6a7-8901-2345-67890abcdef1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    step_description: 'A test description',
    step_number: 1,
    step_key: 'test-step',
    step_slug: 'test-step',
    step_name: 'Test Step',
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    output_type: FileType.business_case,
    granularity_strategy: 'all_to_one',
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: {},
    parallel_group: 1,
    branch_key: 'business_case',
    prompt_template_id: 'uuid-template-123',
  };

  await t.step('should return true for a valid DialecticRecipeTemplateStep object', () => {
    assertEquals(isDialecticRecipeTemplateStep(baseValidStep), true);
  });

  await t.step('should return false if step_number is missing', () => {
    const invalid = { ...baseValidStep, step_number: undefined };
    assertEquals(isDialecticRecipeTemplateStep(invalid), false);
  });

  await t.step('should return false if step_key is not a string', () => {
    const invalid = { ...baseValidStep, step_key: 123 };
    assertEquals(isDialecticRecipeTemplateStep(invalid as any), false);
  });

  await t.step('should return false if job_type is invalid', () => {
    const invalid = { ...baseValidStep, job_type: 'INVALID_JOB_TYPE' };
    assertEquals(isDialecticRecipeTemplateStep(invalid as any), false);
  });

    await t.step('should return false if inputs_required is not an array', () => {
    const invalid = { ...baseValidStep, inputs_required: {} };
    assertEquals(isDialecticRecipeTemplateStep(invalid as any), false);
  });

  await t.step('should return false for a plain empty object', () => {
    assertEquals(isDialecticRecipeTemplateStep({}), false);
  });

    await t.step('should return false for null or undefined', () => {
    assertEquals(isDialecticRecipeTemplateStep(null), false);
    assertEquals(isDialecticRecipeTemplateStep(undefined), false);
  });

  await t.step('should return true for a valid, DB-compliant DialecticRecipeTemplateStep object', () => {
    const dbCompliantStep: DialecticRecipeTemplateStep = {
      ...baseValidStep,
      id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
      template_id: 'b2c3d4e5-f6a7-8901-2345-67890abcdef1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      step_description: 'A test description',
    };
    assertEquals(isDialecticRecipeTemplateStep(dbCompliantStep), true);
  });
});

Deno.test('Type Guard: isDialecticStageRecipeStep', async (t) => {
  const baseValidStageStep: DialecticStageRecipeStep = {
    id: 's1b2c3d4-e5f6-7890-1234-567890abcdef',
    instance_id: 'i2c3d4e5-f6a7-8901-2345-67890abcdef1',
    template_step_id: 't3d4e5f6-a7b8-9012-3456-7890abcdef12',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    step_key: 'test-stage-step',
    step_slug: 'test-stage-step',
    step_name: 'Test Stage Step',
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    output_type: FileType.business_case,
    granularity_strategy: 'all_to_one',
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: {},
    parallel_group: 1,
    branch_key: 'business_case',
    prompt_template_id: 'uuid-template-456',
    config_override: {},
    is_skipped: false,
    object_filter: {},
    output_overrides: {},
    execution_order: 1,
    step_description: 'A test step',
  };

  await t.step('should return true for a valid DialecticStageRecipeStep object', () => {
    assertEquals(isDialecticStageRecipeStep(baseValidStageStep), true);
  });

  await t.step('should return false if instance_id is missing', () => {
    const invalid = { ...baseValidStageStep, instance_id: undefined };
    assertEquals(isDialecticStageRecipeStep(invalid), false);
  });

  await t.step('should return false if is_skipped is not a boolean', () => {
    const invalid = { ...baseValidStageStep, is_skipped: 'true' };
    assertEquals(isDialecticStageRecipeStep(invalid as any), false);
  });

  await t.step('should return false for a plain empty object', () => {
    assertEquals(isDialecticStageRecipeStep({}), false);
  });
});

Deno.test('Type Guard: isDialecticRecipeStep (Union)', async (t) => {
    const templateStep: DialecticRecipeTemplateStep = {
        id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
        template_id: 'b2c3d4e5-f6a7-8901-2345-67890abcdef1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        step_description: 'A test description',
        step_number: 1,
        step_key: 'test-step',
        step_slug: 'test-step',
        step_name: 'Test Step',
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        output_type: FileType.business_case,
        granularity_strategy: 'all_to_one',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        parallel_group: 1,
        branch_key: 'business_case',
        prompt_template_id: 'uuid-template-123',
    };

    const stageStep: DialecticStageRecipeStep = {
        id: 's1b2c3d4-e5f6-7890-1234-567890abcdef',
        instance_id: 'i2c3d4e5-f6a7-8901-2345-67890abcdef1',
        template_step_id: 't3d4e5f6-a7b8-9012-3456-7890abcdef12',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        step_key: 'test-stage-step',
        step_slug: 'test-stage-step',
        step_name: 'Test Stage Step',
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        output_type: FileType.business_case,
        granularity_strategy: 'all_to_one',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        parallel_group: 1,
        branch_key: 'business_case',
        prompt_template_id: 'uuid-template-456',
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        execution_order: 1,
        step_description: 'A test step',
    };

    await t.step('should return true for a valid DialecticRecipeTemplateStep', () => {
        assertEquals(isDialecticRecipeStep(templateStep), true);
    });

    await t.step('should return true for a valid DialecticStageRecipeStep', () => {
        assertEquals(isDialecticRecipeStep(stageStep), true);
    });

    await t.step('should return false for an invalid object', () => {
        assertEquals(isDialecticRecipeStep({ id: '123' }), false);
    });
});

Deno.test('Type Guard: isInputRule', async (t) => {
    const validInputRule: InputRule = {
        type: 'document',
        slug: 'thesis',
        document_key: FileType.business_case,
        required: true,
        multiple: false,
    };

    await t.step('should return true for a valid InputRule object', () => {
        assertEquals(isInputRule(validInputRule), true);
    });

    await t.step('should return false if type is missing', () => {
        const invalid = { ...validInputRule, type: undefined };
        assertEquals(isInputRule(invalid), false);
    });

    await t.step('should return false if type is invalid', () => {
        const invalid = { ...validInputRule, type: 'invalid_type' };
        assertEquals(isInputRule(invalid as any), false);
    });

    await t.step('should return true for type "project_resource"', () => {
        const rule: InputRule = { ...validInputRule, type: 'project_resource', slug: 'thesis', document_key: FileType.InitialUserPrompt };
        assertEquals(isInputRule(rule), true);
    });

    await t.step('should return true for type "contribution"', () => {
        const rule: InputRule = { ...validInputRule, type: 'contribution', slug: 'synthesis', document_key: FileType.comparison_vector };
        assertEquals(isInputRule(rule), true);
    });

    await t.step('should return false for a plain empty object', () => {
        assertEquals(isInputRule({}), false);
    });
});

Deno.test('Type Guard: isRelevanceRule', async (t) => {
    const validRelevanceRule: RelevanceRule = {
        document_key: FileType.business_case,
        type: 'document',
        relevance: 0.9,
    };

    await t.step('should return true for a valid RelevanceRule object', () => {
        assertEquals(isRelevanceRule(validRelevanceRule), true);
    });

    await t.step('should return false if document_key is missing', () => {
        const invalid = { ...validRelevanceRule, document_key: undefined };
        assertEquals(isRelevanceRule(invalid), false);
    });

    await t.step('should return false if relevance is not a number', () => {
        const invalid = { ...validRelevanceRule, relevance: 'high' };
        assertEquals(isRelevanceRule(invalid as any), false);
    });
    
    await t.step('should return true for a valid rule where the optional `type` is omitted', () => {
        const ruleWithoutType = { ...validRelevanceRule };
        delete ruleWithoutType.type;
        assertEquals(isRelevanceRule(ruleWithoutType), true);
    });

    await t.step('should return false for a plain empty object', () => {
        assertEquals(isRelevanceRule({}), false);
    });
});

Deno.test('Type Guard: isOutputRule', async (t) => {
  const validOutputRule: OutputRule = {
    files_to_generate: [{
      from_document_key: 'business_case',
      template_filename: 'template.md',
    }],
  };

  await t.step('should return true for a valid OutputRule object', () => {
    assertEquals(isOutputRule(validOutputRule), true);
  });

  await t.step('should return true for an empty object because all properties are optional', () => {
    assertEquals(isOutputRule({}), true);
  });

  await t.step('should return false for non-record objects', () => {
    assertEquals(isOutputRule(null), false);
    assertEquals(isOutputRule(undefined), false);
    assertEquals(isOutputRule([]), false);
    assertEquals(isOutputRule('string'), false);
    assertEquals(isOutputRule(123), false);
  });
});
