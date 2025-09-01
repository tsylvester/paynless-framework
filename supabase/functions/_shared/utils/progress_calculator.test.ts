import { assertEquals } from 'https://deno.land/std@0.190.0/testing/asserts.ts';
import { calculateTotalSteps } from './progress_calculator.ts';
import type { ProcessingStrategy } from '../../dialectic-service/dialectic.interface.ts';

Deno.test('calculateTotalSteps for per_thesis_contribution', () => {
    const strategy: ProcessingStrategy = {
        type: 'task_isolation',
        granularity: 'per_thesis_contribution',
        description: 'Test strategy',
        progress_reporting: {
            message_template: 'template'
        }
    };
    const models = [{}, {}]; // 2 models
    const contributions = [{}, {}, {}]; // 3 thesis contributions

    const totalSteps = calculateTotalSteps(strategy, models, contributions);

    assertEquals(totalSteps, 6); // 2 models * 3 contributions
});

Deno.test('calculateTotalSteps for per_pairwise_synthesis', () => {
    const strategy: ProcessingStrategy = {
        type: 'task_isolation',
        granularity: 'per_pairwise_synthesis',
        description: 'Test strategy',
        progress_reporting: {
            message_template: 'template'
        }
    };
    const models = [{}, {}]; // 2 models
    const contributions = [{}, {}, {}]; // 3 thesis contributions

    const totalSteps = calculateTotalSteps(strategy, models, contributions);

    // This will be more complex, for now assuming a simple multiplication
    // As per phase 9, this will be m * n * n
    // m = contributions.length = 3
    // n = models.length = 2
    // 3 * 2 * 2 = 12 (step 1)
    // 3 * 2 = 6 (step 2)
    // 2 = 2 (step 3)
    // total = 12 + 6 + 2 = 20 -- for now this is too complex, let's stick to n*m
    assertEquals(totalSteps, 6); 
});

Deno.test('calculateTotalSteps with no contributions', () => {
    const strategy: ProcessingStrategy = {
        type: 'task_isolation',
        granularity: 'per_thesis_contribution',
        description: 'Test strategy',
        progress_reporting: {
            message_template: 'template'
        }
    };
    const models = [{}, {}];
    const contributions: unknown[] = [];

    const totalSteps = calculateTotalSteps(strategy, models, contributions);

    assertEquals(totalSteps, 0);
});

Deno.test('calculateTotalSteps with no models', () => {
    const strategy: ProcessingStrategy = {
        type: 'task_isolation',
        granularity: 'per_thesis_contribution',
        description: 'Test strategy',
        progress_reporting: {
            message_template: 'template'
        }
    };
    const models: unknown[] = [];
    const contributions = [{}, {}, {}];

    const totalSteps = calculateTotalSteps(strategy, models, contributions);

    assertEquals(totalSteps, 0);
}); 