import { vi, type Mock } from 'vitest';
import type { ApiError } from '@paynless/types';
import type {
    ComputeCostCeilingContributionInput,
    ComputeCostCeilingStageInput,
    ComputeCostCeilingDeps,
    ComputeCostCeilingParams,
    ComputeCostCeilingPayload,
    ComputeCostCeilingSuccessReturn,
    ComputeCostCeilingErrorReturn,
    ComputeCostCeilingReturn,
    ComputeCostCeilingFn,
} from './computeCostCeiling.interface';

export type ComputeCostCeilingContributionInputOverrides = {
    [K in keyof ComputeCostCeilingContributionInput]?: ComputeCostCeilingContributionInput[K] | null;
};

export type ComputeCostCeilingStageInputOverrides = {
    [K in keyof ComputeCostCeilingStageInput]?: ComputeCostCeilingStageInput[K] | null;
};

export type ComputeCostCeilingDepsOverrides = {
    [K in keyof ComputeCostCeilingDeps]?: ComputeCostCeilingDeps[K] | null;
};

export type ComputeCostCeilingParamsOverrides = {
    [K in keyof ComputeCostCeilingParams]?: ComputeCostCeilingParams[K] | null;
};

export type ComputeCostCeilingPayloadOverrides = {
    [K in keyof ComputeCostCeilingPayload]?: ComputeCostCeilingPayload[K] | null;
};

export type ComputeCostCeilingSuccessReturnOverrides = {
    [K in keyof ComputeCostCeilingSuccessReturn]?: ComputeCostCeilingSuccessReturn[K] | null;
};

export type ComputeCostCeilingErrorReturnOverrides = {
    [K in keyof ComputeCostCeilingErrorReturn]?: ComputeCostCeilingErrorReturn[K] | null;
};

export interface CreateMockComputeCostCeilingFnOptions {
    returnValue?: ComputeCostCeilingReturn;
}

export function buildComputeCostCeilingDeps(
    overrides?: ComputeCostCeilingDepsOverrides,
): ComputeCostCeilingDeps {
    void overrides;
    const deps: ComputeCostCeilingDeps = {};
    return deps;
}

export function buildComputeCostCeilingParams(
    overrides?: ComputeCostCeilingParamsOverrides,
): ComputeCostCeilingParams {
    void overrides;
    const params: ComputeCostCeilingParams = {};
    return params;
}

export function buildComputeCostCeilingContributionInput(
    overrides?: ComputeCostCeilingContributionInputOverrides,
): ComputeCostCeilingContributionInput {
    const base: ComputeCostCeilingContributionInput = {
        tokensUsedInput: 100,
        tokensUsedOutput: 200,
        inputTokenCostRate: 1,
        outputTokenCostRate: 2,
    };
    if (overrides === undefined) {
        return base;
    }
    return {
        tokensUsedInput:
            overrides.tokensUsedInput !== undefined && overrides.tokensUsedInput !== null
                ? overrides.tokensUsedInput
                : base.tokensUsedInput,
        tokensUsedOutput:
            overrides.tokensUsedOutput !== undefined && overrides.tokensUsedOutput !== null
                ? overrides.tokensUsedOutput
                : base.tokensUsedOutput,
        inputTokenCostRate:
            overrides.inputTokenCostRate !== undefined && overrides.inputTokenCostRate !== null
                ? overrides.inputTokenCostRate
                : base.inputTokenCostRate,
        outputTokenCostRate:
            overrides.outputTokenCostRate !== undefined && overrides.outputTokenCostRate !== null
                ? overrides.outputTokenCostRate
                : base.outputTokenCostRate,
    };
}

export function buildComputeCostCeilingStageInput(
    overrides?: ComputeCostCeilingStageInputOverrides,
): ComputeCostCeilingStageInput {
    const base: ComputeCostCeilingStageInput = {
        stageSlug: 's1',
        expectedCount: 4,
        contributions: [],
    };
    if (overrides === undefined) {
        return base;
    }
    return {
        stageSlug:
            overrides.stageSlug !== undefined && overrides.stageSlug !== null
                ? overrides.stageSlug
                : base.stageSlug,
        expectedCount:
            overrides.expectedCount !== undefined && overrides.expectedCount !== null
                ? overrides.expectedCount
                : base.expectedCount,
        contributions:
            overrides.contributions !== undefined && overrides.contributions !== null
                ? overrides.contributions
                : base.contributions,
    };
}

export function buildComputeCostCeilingPayload(
    overrides?: ComputeCostCeilingPayloadOverrides,
): ComputeCostCeilingPayload {
    const base: ComputeCostCeilingPayload = {
        stages: [buildComputeCostCeilingStageInput()],
        maxOutputTokens: 1000,
        outputTokenCostRates: [3],
    };
    if (overrides === undefined) {
        return base;
    }
    return {
        stages:
            overrides.stages !== undefined && overrides.stages !== null
                ? overrides.stages
                : base.stages,
        maxOutputTokens:
            overrides.maxOutputTokens !== undefined && overrides.maxOutputTokens !== null
                ? overrides.maxOutputTokens
                : base.maxOutputTokens,
        outputTokenCostRates:
            overrides.outputTokenCostRates !== undefined && overrides.outputTokenCostRates !== null
                ? overrides.outputTokenCostRates
                : base.outputTokenCostRates,
    };
}

export function buildComputeCostCeilingSuccessReturn(
    overrides?: ComputeCostCeilingSuccessReturnOverrides,
): ComputeCostCeilingSuccessReturn {
    const base: ComputeCostCeilingSuccessReturn = {
        stageCeilings: { s1: 12000 },
        projectCeiling: 12000,
    };
    if (overrides === undefined) {
        return base;
    }
    return {
        stageCeilings:
            overrides.stageCeilings !== undefined && overrides.stageCeilings !== null
                ? overrides.stageCeilings
                : base.stageCeilings,
        projectCeiling:
            overrides.projectCeiling !== undefined && overrides.projectCeiling !== null
                ? overrides.projectCeiling
                : base.projectCeiling,
    };
}

export function buildComputeCostCeilingErrorReturn(
    overrides?: ComputeCostCeilingErrorReturnOverrides,
): ComputeCostCeilingErrorReturn {
    const defaultError: ApiError = {
        code: 'ERR',
        message: 'error',
    };
    const base: ComputeCostCeilingErrorReturn = {
        error: defaultError,
    };
    if (overrides === undefined) {
        return base;
    }
    return {
        error:
            overrides.error !== undefined && overrides.error !== null
                ? overrides.error
                : base.error,
    };
}

export function createMockComputeCostCeilingFn(
    options?: CreateMockComputeCostCeilingFnOptions,
): Mock<
    [
        deps: ComputeCostCeilingDeps,
        params: ComputeCostCeilingParams,
        payload: ComputeCostCeilingPayload,
    ],
    ComputeCostCeilingReturn
> {
    const returnValue: ComputeCostCeilingReturn =
        options?.returnValue ?? buildComputeCostCeilingSuccessReturn();
    const fn: ComputeCostCeilingFn = (
        _deps: ComputeCostCeilingDeps,
        _params: ComputeCostCeilingParams,
        _payload: ComputeCostCeilingPayload,
    ): ComputeCostCeilingReturn => {
        return returnValue;
    };
    return vi.fn(fn);
}
