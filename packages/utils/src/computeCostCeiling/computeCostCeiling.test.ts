import { describe, it, expect } from 'vitest';
import { computeCostCeiling } from './computeCostCeiling';
import {
    buildComputeCostCeilingDeps,
    buildComputeCostCeilingParams,
    buildComputeCostCeilingPayload,
    buildComputeCostCeilingStageInput,
    buildComputeCostCeilingContributionInput,
} from './computeCostCeiling.mock';
import { isApiError } from '../type_guards';

describe('computeCostCeiling', () => {
    it('computes per-stage estimate for an incomplete stage', () => {
        const deps = buildComputeCostCeilingDeps();
        const params = buildComputeCostCeilingParams();
        const payload = buildComputeCostCeilingPayload({
            stages: [
                buildComputeCostCeilingStageInput({
                    stageSlug: 's1',
                    expectedCount: 4,
                    contributions: [],
                }),
            ],
            maxOutputTokens: 1000,
            outputTokenCostRates: [3],
        });
        const result = computeCostCeiling(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result.stageCeilings['s1']).toBe(12000);
        expect(result.projectCeiling).toBe(12000);
    });

    it('computes estimates for all remaining stages', () => {
        const deps = buildComputeCostCeilingDeps();
        const params = buildComputeCostCeilingParams();
        const payload = buildComputeCostCeilingPayload({
            stages: [
                buildComputeCostCeilingStageInput({
                    stageSlug: 's1',
                    expectedCount: 2,
                    contributions: [],
                }),
                buildComputeCostCeilingStageInput({
                    stageSlug: 's2',
                    expectedCount: 3,
                    contributions: [],
                }),
            ],
            maxOutputTokens: 1000,
            outputTokenCostRates: [2],
        });
        const result = computeCostCeiling(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result.stageCeilings['s1']).toBe(4000);
        expect(result.stageCeilings['s2']).toBe(6000);
        expect(result.projectCeiling).toBe(10000);
    });

    it('uses mean output token cost rate across models', () => {
        const deps = buildComputeCostCeilingDeps();
        const params = buildComputeCostCeilingParams();
        const payload = buildComputeCostCeilingPayload({
            stages: [
                buildComputeCostCeilingStageInput({
                    expectedCount: 4,
                    contributions: [],
                }),
            ],
            maxOutputTokens: 1000,
            outputTokenCostRates: [2, 3],
        });
        const result = computeCostCeiling(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result.stageCeilings['s1']).toBe(10000);
        expect(result.projectCeiling).toBe(10000);
    });

    it('combines contribution actuals for completed stages with estimates for incomplete stages', () => {
        const deps = buildComputeCostCeilingDeps();
        const params = buildComputeCostCeilingParams();
        const payload = buildComputeCostCeilingPayload({
            stages: [
                buildComputeCostCeilingStageInput({
                    stageSlug: 's1',
                    expectedCount: 4,
                    contributions: [
                        buildComputeCostCeilingContributionInput({
                            tokensUsedInput: 100,
                            tokensUsedOutput: 200,
                            inputTokenCostRate: 1,
                            outputTokenCostRate: 2,
                        }),
                    ],
                }),
                buildComputeCostCeilingStageInput({
                    stageSlug: 's2',
                    expectedCount: 3,
                    contributions: [],
                }),
            ],
            maxOutputTokens: 1000,
            outputTokenCostRates: [3],
        });
        const result = computeCostCeiling(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result.stageCeilings['s1']).toBe(500);
        expect(result.stageCeilings['s2']).toBe(9000);
        expect(result.projectCeiling).toBe(9500);
    });

    it('honors zero actual cost for a completed stage instead of substituting an estimate', () => {
        const deps = buildComputeCostCeilingDeps();
        const params = buildComputeCostCeilingParams();
        const payload = buildComputeCostCeilingPayload({
            stages: [
                buildComputeCostCeilingStageInput({
                    stageSlug: 's1',
                    expectedCount: 4,
                    contributions: [
                        buildComputeCostCeilingContributionInput({
                            tokensUsedInput: 0,
                            tokensUsedOutput: 0,
                            inputTokenCostRate: 1,
                            outputTokenCostRate: 2,
                        }),
                    ],
                }),
                buildComputeCostCeilingStageInput({
                    stageSlug: 's2',
                    expectedCount: 1,
                    contributions: [],
                }),
            ],
            maxOutputTokens: 1000,
            outputTokenCostRates: [3],
        });
        const result = computeCostCeiling(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result.projectCeiling).toBe(3000);
    });

    it('returns zero totals for empty stages input', () => {
        const deps = buildComputeCostCeilingDeps();
        const params = buildComputeCostCeilingParams();
        const payload = buildComputeCostCeilingPayload({
            stages: [],
        });
        const result = computeCostCeiling(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result.stageCeilings).toEqual({});
        expect(result.projectCeiling).toBe(0);
    });

    it('returns zero ceilings without NaN when maxOutputTokens is zero', () => {
        const deps = buildComputeCostCeilingDeps();
        const params = buildComputeCostCeilingParams();
        const payload = buildComputeCostCeilingPayload({
            stages: [
                buildComputeCostCeilingStageInput({
                    stageSlug: 's1',
                    expectedCount: 4,
                    contributions: [],
                }),
            ],
            maxOutputTokens: 0,
            outputTokenCostRates: [3],
        });
        const result = computeCostCeiling(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result.stageCeilings['s1']).toBe(0);
        expect(result.projectCeiling).toBe(0);
        expect(Number.isNaN(result.projectCeiling)).toBe(false);
    });

    it('returns ApiError when payload fails validation', () => {
        const deps = buildComputeCostCeilingDeps();
        const params = buildComputeCostCeilingParams();
        const payload = buildComputeCostCeilingPayload({
            outputTokenCostRates: [],
        });
        const result = computeCostCeiling(deps, params, payload);
        expect('error' in result).toBe(true);
        if (!('error' in result)) {
            return;
        }
        expect(isApiError(result.error)).toBe(true);
    });
});
