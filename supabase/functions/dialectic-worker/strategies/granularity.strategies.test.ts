// supabase/functions/dialectic-worker/strategies/granularity.strategies.test.ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getGranularityPlanner, granularityStrategyMap } from './granularity.strategies.ts';
import { planAllToOne } from './planners/planAllToOne.ts';
import { planPairwiseByOrigin } from './planners/planPairwiseByOrigin.ts';
import { planPerSourceDocument } from './planners/planPerSourceDocument.ts';
import { planPerSourceGroup } from './planners/planPerSourceGroup.ts';

Deno.test('granularityStrategyMap should contain all core planners', () => {
    assertExists(granularityStrategyMap.get('per_source_document'));
    assertEquals(granularityStrategyMap.get('per_source_document'), planPerSourceDocument);

    assertExists(granularityStrategyMap.get('pairwise_by_origin'));
    assertEquals(granularityStrategyMap.get('pairwise_by_origin'), planPairwiseByOrigin);

    assertExists(granularityStrategyMap.get('per_source_group'));
    assertEquals(granularityStrategyMap.get('per_source_group'), planPerSourceGroup);

    assertExists(granularityStrategyMap.get('all_to_one'));
    assertEquals(granularityStrategyMap.get('all_to_one'), planAllToOne);
});

Deno.test('getGranularityPlanner should return the correct function for each valid strategy', () => {
    const planner1 = getGranularityPlanner('per_source_document');
    assertEquals(planner1, planPerSourceDocument);

    const planner2 = getGranularityPlanner('pairwise_by_origin');
    assertEquals(planner2, planPairwiseByOrigin);

    const planner3 = getGranularityPlanner('per_source_group');
    assertEquals(planner3, planPerSourceGroup);

    const planner4 = getGranularityPlanner('all_to_one');
    assertEquals(planner4, planAllToOne);
});

Deno.test('getGranularityPlanner should return the default planner for an invalid strategy', () => {
    const defaultPlanner = getGranularityPlanner('non_existent_strategy');
    assertEquals(defaultPlanner, planPerSourceDocument, "Should return default planner for an unknown key");
});

Deno.test('getGranularityPlanner should return the default planner for an empty string', () => {
    const defaultPlanner = getGranularityPlanner('');
    assertEquals(defaultPlanner, planPerSourceDocument, "Should return default planner for an empty string");
});

Deno.test('getGranularityPlanner should be case-sensitive and return default for mismatched case', () => {
    const defaultPlanner = getGranularityPlanner('ALL_TO_ONE');
    assertEquals(defaultPlanner, planPerSourceDocument, "Should be case-sensitive and fall back to default");
});

Deno.test('getGranularityPlanner should return the default planner for a null input', () => {
    const defaultPlanner = getGranularityPlanner(null);
    assertEquals(defaultPlanner, planPerSourceDocument, "Should return default planner for null");
});

Deno.test('getGranularityPlanner should return the default planner for an undefined input', () => {
    const defaultPlanner = getGranularityPlanner(undefined);
    assertEquals(defaultPlanner, planPerSourceDocument, "Should return default planner for undefined");
});

Deno.test('getGranularityPlanner should be immune to prototype pollution and return default', () => {
    const defaultPlanner = getGranularityPlanner('constructor');
    assertEquals(defaultPlanner, planPerSourceDocument, "Should not resolve prototype properties");
}); 