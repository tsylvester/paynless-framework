// supabase/functions/dialectic-worker/strategies/granularity.strategies.test.ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getGranularityPlanner, granularityStrategyMap } from './granularity.strategies.ts';
import { planPairwiseByOrigin } from './planners/planPairwiseByOrigin.ts';
import { planPerSourceDocument } from './planners/planPerSourceDocument.ts';

Deno.test('granularityStrategyMap should contain all core planners', () => {
    assertExists(granularityStrategyMap.get('per_source_document'));
    assertEquals(granularityStrategyMap.get('per_source_document'), planPerSourceDocument);

    assertExists(granularityStrategyMap.get('pairwise_by_origin'));
    assertEquals(granularityStrategyMap.get('pairwise_by_origin'), planPairwiseByOrigin);
});

Deno.test('getGranularityPlanner should return the correct function for each valid strategy', () => {
    const planner1 = getGranularityPlanner('per_source_document');
    assertEquals(planner1, planPerSourceDocument);

    const planner2 = getGranularityPlanner('pairwise_by_origin');
    assertEquals(planner2, planPairwiseByOrigin);
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

// Purpose: Proves getGranularityPlanner rejects an unknown strategy by throwing, rather than
// silently returning a default planner.
Deno.test('getGranularityPlanner should throw for an unknown strategy instead of returning a default', () => {
    // Arrange:
    // 1. Define a strategy string that is not present in granularityStrategyMap
    //    (e.g., 'nonexistent_strategy_xyz'). No cast is needed — getGranularityPlanner
    //    accepts string | null | undefined, so any string is a valid input.

    // Act & Assert:
    // 1. Use assertThrows to call getGranularityPlanner with the unknown strategy.
    // 2. Assert the thrown Error message names the strategy that was not found, proving
    //    the rejection is specific and attributable, not a generic "no planner" message.
}); 