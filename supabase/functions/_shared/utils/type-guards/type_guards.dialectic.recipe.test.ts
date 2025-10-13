import {
  assertEquals,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import type {
  DialecticRecipeStep,
  InputRule,
  RelevanceRule,
  OutputRule,
} from '../../../dialectic-service/dialectic.interface.ts';
import {
  isDialecticRecipeStep,
  isInputRule,
  isRelevanceRule,
  isOutputRule,
} from './type_guards.dialectic.recipe.ts';

Deno.test('Type Guard: isDialecticRecipeStep', async (t) => {
  const baseValidStep: DialecticRecipeStep = {
    step_number: 1,
    step_key: 'test-step',
    step_slug: 'test-step',
    step_name: 'Test Step',
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    output_type: 'business_case',
    granularity_strategy: 'all_to_one',
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: [],
    parallel_group: 1,
    branch_key: 'business_case',
    prompt_template_id: 'uuid-template-123',
  };

  await t.step('should return true for a valid DialecticRecipeStep object', () => {
    assertEquals(isDialecticRecipeStep(baseValidStep), true);
  });

  await t.step('should return false if step_number is missing', () => {
    const invalid = { ...baseValidStep, step_number: undefined };
    assertEquals(isDialecticRecipeStep(invalid), false);
  });

  await t.step('should return false if step_key is not a string', () => {
    const invalid = { ...baseValidStep, step_key: 123 };
    assertEquals(isDialecticRecipeStep(invalid as any), false);
  });

  await t.step('should return false if job_type is invalid', () => {
    const invalid = { ...baseValidStep, job_type: 'INVALID_JOB_TYPE' };
    assertEquals(isDialecticRecipeStep(invalid as any), false);
  });

    await t.step('should return false if inputs_required is not an array', () => {
    const invalid = { ...baseValidStep, inputs_required: {} };
    assertEquals(isDialecticRecipeStep(invalid as any), false);
  });

  await t.step('should return false for a plain empty object', () => {
    assertEquals(isDialecticRecipeStep({}), false);
  });

    await t.step('should return false for null or undefined', () => {
    assertEquals(isDialecticRecipeStep(null), false);
    assertEquals(isDialecticRecipeStep(undefined), false);
  });
});

Deno.test('Type Guard: isInputRule', async (t) => {
    const validInputRule: InputRule = {
        type: 'document',
        stage_slug: 'thesis',
        document_key: 'business_case',
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

    await t.step('should return false for a plain empty object', () => {
        assertEquals(isInputRule({}), false);
    });
});

Deno.test('Type Guard: isRelevanceRule', async (t) => {
    const validRelevanceRule: RelevanceRule = {
        document_key: 'business_case',
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
    
    await t.step('should return false for a plain empty object', () => {
        assertEquals(isRelevanceRule({}), false);
    });
});

Deno.test('Type Guard: isOutputRule', async (t) => {
    const validOutputRule: OutputRule = {
        type: 'header_context',
        document_key: 'header_context',
    };

    await t.step('should return true for a valid OutputRule object', () => {
        assertEquals(isOutputRule(validOutputRule), true);
    });

    await t.step('should return false if type is missing', () => {
        const invalid = { ...validOutputRule, type: undefined };
        assertEquals(isOutputRule(invalid), false);
    });

    await t.step('should return false if document_key is not a string', () => {
        const invalid = { ...validOutputRule, document_key: 123 };
        assertEquals(isOutputRule(invalid as any), false);
    });
    
    await t.step('should return false for a plain empty object', () => {
        assertEquals(isOutputRule({}), false);
    });
});
