import type { ApiError } from '@paynless/types';

export interface ComputeCostCeilingContributionInput {
    tokensUsedInput: number;
    tokensUsedOutput: number;
    inputTokenCostRate: number;
    outputTokenCostRate: number;
}

export interface ComputeCostCeilingStageInput {
    stageSlug: string;
    expectedCount: number;
    contributions: ComputeCostCeilingContributionInput[];
}

export interface ComputeCostCeilingDeps {}

export interface ComputeCostCeilingParams {}

export interface ComputeCostCeilingPayload {
    stages: ComputeCostCeilingStageInput[];
    maxOutputTokens: number;
    outputTokenCostRates: number[];
}

export interface ComputeCostCeilingSuccessReturn {
    stageCeilings: Record<string, number>;
    projectCeiling: number;
}

export interface ComputeCostCeilingErrorReturn {
    error: Error | ApiError;
}

export type ComputeCostCeilingReturn =
    | ComputeCostCeilingSuccessReturn
    | ComputeCostCeilingErrorReturn;

export type ComputeCostCeilingFn = (
    deps: ComputeCostCeilingDeps,
    params: ComputeCostCeilingParams,
    payload: ComputeCostCeilingPayload,
) => ComputeCostCeilingReturn;
