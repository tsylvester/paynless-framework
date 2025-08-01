// supabase/functions/dialectic-worker/strategies/granularity.strategies.ts

// These functions will be implemented in subsequent steps.
// For now, they are placeholders to satisfy the type-checker.
import { planPairwiseByOrigin } from './planners/planPairwiseByOrigin.ts';
import { planPerSourceDocument } from './planners/planPerSourceDocument.ts';
import type { GranularityPlannerFn, GranularityStrategyMap } from '../../dialectic-service/dialectic.interface.ts';


export const granularityStrategyMap: GranularityStrategyMap = new Map([
  ['per_source_document', planPerSourceDocument],
  ['pairwise_by_origin', planPairwiseByOrigin],
]);

export function getGranularityPlanner(strategyId: string | null | undefined): GranularityPlannerFn {
    if (!strategyId) {
        return planPerSourceDocument; // Default for null, undefined, or empty string
    }
    const planner = granularityStrategyMap.get(strategyId);
    return planner || planPerSourceDocument; // Default strategy
}