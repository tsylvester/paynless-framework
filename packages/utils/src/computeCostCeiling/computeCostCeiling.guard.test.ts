import { describe, it, expect } from 'vitest';
import {
    buildComputeCostCeilingContributionInput,
    buildComputeCostCeilingStageInput,
    buildComputeCostCeilingDeps,
    buildComputeCostCeilingParams,
    buildComputeCostCeilingPayload,
    buildComputeCostCeilingSuccessReturn,
    buildComputeCostCeilingErrorReturn,
} from './computeCostCeiling.mock';
import {
    isComputeCostCeilingContributionInput,
    isComputeCostCeilingStageInput,
    isComputeCostCeilingDeps,
    isComputeCostCeilingParams,
    isComputeCostCeilingPayload,
    isComputeCostCeilingSuccessReturn,
    isComputeCostCeilingErrorReturn,
} from './computeCostCeiling.guard';

describe('isComputeCostCeilingContributionInput', () => {
    it('returns true for a full valid contribution row', () => {
        const value = buildComputeCostCeilingContributionInput();
        expect(isComputeCostCeilingContributionInput(value)).toBe(true);
    });

    it('returns false when tokensUsedInput is non-finite', () => {
        const value = buildComputeCostCeilingContributionInput({
            tokensUsedInput: Number.NaN,
        });
        expect(isComputeCostCeilingContributionInput(value)).toBe(false);
    });

    it('returns false when outputTokenCostRate is non-finite', () => {
        const value = buildComputeCostCeilingContributionInput({
            outputTokenCostRate: Number.POSITIVE_INFINITY,
        });
        expect(isComputeCostCeilingContributionInput(value)).toBe(false);
    });

    it('returns false for null', () => {
        expect(isComputeCostCeilingContributionInput(null)).toBe(false);
    });
});

describe('isComputeCostCeilingStageInput', () => {
    it('returns true for an incomplete stage with empty contributions', () => {
        const value = buildComputeCostCeilingStageInput();
        expect(isComputeCostCeilingStageInput(value)).toBe(true);
    });

    it('returns true for a completed stage with one contribution row', () => {
        const value = buildComputeCostCeilingStageInput({
            contributions: [buildComputeCostCeilingContributionInput()],
        });
        expect(isComputeCostCeilingStageInput(value)).toBe(true);
    });

    it('returns true for a completed stage whose contributions sum to zero', () => {
        const value = buildComputeCostCeilingStageInput({
            contributions: [
                buildComputeCostCeilingContributionInput({
                    tokensUsedInput: 0,
                    tokensUsedOutput: 0,
                }),
            ],
        });
        expect(isComputeCostCeilingStageInput(value)).toBe(true);
    });

    it('returns false when stageSlug is empty', () => {
        const value = buildComputeCostCeilingStageInput({ stageSlug: '' });
        expect(isComputeCostCeilingStageInput(value)).toBe(false);
    });

    it('returns false when expectedCount is non-finite', () => {
        const value = buildComputeCostCeilingStageInput({
            expectedCount: Number.NaN,
        });
        expect(isComputeCostCeilingStageInput(value)).toBe(false);
    });

    it('returns false when contributions is not an array', () => {
        const base = buildComputeCostCeilingStageInput();
        expect(
            isComputeCostCeilingStageInput({
                stageSlug: base.stageSlug,
                expectedCount: base.expectedCount,
                contributions: 'not-an-array',
            }),
        ).toBe(false);
    });

    it('returns false when a contribution element fails the contribution guard', () => {
        const value = buildComputeCostCeilingStageInput({
            contributions: [
                buildComputeCostCeilingContributionInput({
                    tokensUsedInput: Number.NaN,
                }),
            ],
        });
        expect(isComputeCostCeilingStageInput(value)).toBe(false);
    });
});

describe('isComputeCostCeilingDeps', () => {
    it('returns true for an empty object', () => {
        const value = buildComputeCostCeilingDeps();
        expect(isComputeCostCeilingDeps(value)).toBe(true);
    });

    it('returns false for null', () => {
        expect(isComputeCostCeilingDeps(null)).toBe(false);
    });
});

describe('isComputeCostCeilingParams', () => {
    it('returns true for an empty object', () => {
        const value = buildComputeCostCeilingParams();
        expect(isComputeCostCeilingParams(value)).toBe(true);
    });

    it('returns false for null', () => {
        expect(isComputeCostCeilingParams(null)).toBe(false);
    });
});

describe('isComputeCostCeilingPayload', () => {
    it('returns true for a full valid payload', () => {
        const value = buildComputeCostCeilingPayload();
        expect(isComputeCostCeilingPayload(value)).toBe(true);
    });

    it('returns false for an empty object', () => {
        expect(isComputeCostCeilingPayload({})).toBe(false);
    });

    it('returns false when stages is not an array', () => {
        const base = buildComputeCostCeilingPayload();
        expect(
            isComputeCostCeilingPayload({
                stages: 'not-an-array',
                maxOutputTokens: base.maxOutputTokens,
                outputTokenCostRates: base.outputTokenCostRates,
            }),
        ).toBe(false);
    });

    it('returns false when maxOutputTokens is not finite', () => {
        const value = buildComputeCostCeilingPayload({
            maxOutputTokens: Number.NaN,
        });
        expect(isComputeCostCeilingPayload(value)).toBe(false);
    });

    it('returns false when outputTokenCostRates is an empty array', () => {
        const value = buildComputeCostCeilingPayload({
            outputTokenCostRates: [],
        });
        expect(isComputeCostCeilingPayload(value)).toBe(false);
    });

    it('returns false when outputTokenCostRates is not an array', () => {
        const base = buildComputeCostCeilingPayload();
        expect(
            isComputeCostCeilingPayload({
                stages: base.stages,
                maxOutputTokens: base.maxOutputTokens,
                outputTokenCostRates: 'not-an-array',
            }),
        ).toBe(false);
    });

    it('returns false when outputTokenCostRates contains a non-finite number', () => {
        const value = buildComputeCostCeilingPayload({
            outputTokenCostRates: [Number.NaN],
        });
        expect(isComputeCostCeilingPayload(value)).toBe(false);
    });
});

describe('isComputeCostCeilingSuccessReturn', () => {
    it('returns true for stageCeilings and projectCeiling', () => {
        const value = buildComputeCostCeilingSuccessReturn();
        expect(isComputeCostCeilingSuccessReturn(value)).toBe(true);
    });

    it('returns false when stageCeilings is not a record', () => {
        const base = buildComputeCostCeilingSuccessReturn();
        expect(
            isComputeCostCeilingSuccessReturn({
                stageCeilings: [],
                projectCeiling: base.projectCeiling,
            }),
        ).toBe(false);
    });

    it('returns false when projectCeiling is not finite', () => {
        const value = buildComputeCostCeilingSuccessReturn({
            projectCeiling: Number.NaN,
        });
        expect(isComputeCostCeilingSuccessReturn(value)).toBe(false);
    });

    it('returns false when a stageCeilings value is not finite', () => {
        const value = buildComputeCostCeilingSuccessReturn({
            stageCeilings: { s1: Number.NaN },
        });
        expect(isComputeCostCeilingSuccessReturn(value)).toBe(false);
    });
});

describe('isComputeCostCeilingErrorReturn', () => {
    it('returns true for an error wrapper with a valid ApiError shape', () => {
        const value = buildComputeCostCeilingErrorReturn();
        expect(isComputeCostCeilingErrorReturn(value)).toBe(true);
    });

    it('returns false when error is missing', () => {
        expect(isComputeCostCeilingErrorReturn({})).toBe(false);
    });

    it('returns false when error fails ApiError validation', () => {
        expect(
            isComputeCostCeilingErrorReturn({
                error: {
                    code: 123,
                    message: 'invalid payload',
                },
            }),
        ).toBe(false);
    });
});
