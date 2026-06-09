import type {
    ComputeCostCeilingContributionInput,
    ComputeCostCeilingStageInput,
    ComputeCostCeilingDeps,
    ComputeCostCeilingParams,
    ComputeCostCeilingPayload,
    ComputeCostCeilingSuccessReturn,
    ComputeCostCeilingErrorReturn,
} from './computeCostCeiling.interface';
import { isRecord } from '../dialectic.guard';
import { isApiError } from '../type_guards';

export function isComputeCostCeilingContributionInput(
    value: unknown,
): value is ComputeCostCeilingContributionInput {
    if (!isRecord(value)) {
        return false;
    }
    const tokensUsedInput: unknown = value['tokensUsedInput'];
    if (typeof tokensUsedInput !== 'number' || !Number.isFinite(tokensUsedInput)) {
        return false;
    }
    const tokensUsedOutput: unknown = value['tokensUsedOutput'];
    if (typeof tokensUsedOutput !== 'number' || !Number.isFinite(tokensUsedOutput)) {
        return false;
    }
    const inputTokenCostRate: unknown = value['inputTokenCostRate'];
    if (typeof inputTokenCostRate !== 'number' || !Number.isFinite(inputTokenCostRate)) {
        return false;
    }
    const outputTokenCostRate: unknown = value['outputTokenCostRate'];
    if (typeof outputTokenCostRate !== 'number' || !Number.isFinite(outputTokenCostRate)) {
        return false;
    }
    return true;
}

export function isComputeCostCeilingStageInput(
    value: unknown,
): value is ComputeCostCeilingStageInput {
    if (!isRecord(value)) {
        return false;
    }
    const stageSlug: unknown = value['stageSlug'];
    if (typeof stageSlug !== 'string' || stageSlug.length === 0) {
        return false;
    }
    const expectedCount: unknown = value['expectedCount'];
    if (typeof expectedCount !== 'number' || !Number.isFinite(expectedCount)) {
        return false;
    }
    const contributions: unknown = value['contributions'];
    if (!Array.isArray(contributions)) {
        return false;
    }
    for (const contribution of contributions) {
        if (!isComputeCostCeilingContributionInput(contribution)) {
            return false;
        }
    }
    return true;
}

export function isComputeCostCeilingDeps(value: unknown): value is ComputeCostCeilingDeps {
    if (!isRecord(value)) {
        return false;
    }
    return Object.keys(value).length === 0;
}

export function isComputeCostCeilingParams(value: unknown): value is ComputeCostCeilingParams {
    if (!isRecord(value)) {
        return false;
    }
    return Object.keys(value).length === 0;
}

export function isComputeCostCeilingPayload(value: unknown): value is ComputeCostCeilingPayload {
    if (!isRecord(value)) {
        return false;
    }
    const stages: unknown = value['stages'];
    if (!Array.isArray(stages)) {
        return false;
    }
    for (const stage of stages) {
        if (!isComputeCostCeilingStageInput(stage)) {
            return false;
        }
    }
    const maxOutputTokens: unknown = value['maxOutputTokens'];
    if (typeof maxOutputTokens !== 'number' || !Number.isFinite(maxOutputTokens)) {
        return false;
    }
    const outputTokenCostRates: unknown = value['outputTokenCostRates'];
    if (!Array.isArray(outputTokenCostRates) || outputTokenCostRates.length === 0) {
        return false;
    }
    for (const rate of outputTokenCostRates) {
        if (typeof rate !== 'number' || !Number.isFinite(rate)) {
            return false;
        }
    }
    return true;
}

export function isComputeCostCeilingSuccessReturn(
    value: unknown,
): value is ComputeCostCeilingSuccessReturn {
    if (!isRecord(value)) {
        return false;
    }
    const stageCeilings: unknown = value['stageCeilings'];
    if (!isRecord(stageCeilings)) {
        return false;
    }
    for (const ceiling of Object.values(stageCeilings)) {
        if (typeof ceiling !== 'number' || !Number.isFinite(ceiling)) {
            return false;
        }
    }
    const projectCeiling: unknown = value['projectCeiling'];
    if (typeof projectCeiling !== 'number' || !Number.isFinite(projectCeiling)) {
        return false;
    }
    return true;
}

export function isComputeCostCeilingErrorReturn(
    value: unknown,
): value is ComputeCostCeilingErrorReturn {
    if (!isRecord(value)) {
        return false;
    }
    return isApiError(value['error']);
}
