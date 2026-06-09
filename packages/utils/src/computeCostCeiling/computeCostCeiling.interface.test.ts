import { describe, it, expect } from 'vitest';
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
} from './computeCostCeiling.interface.ts';

describe('computeCostCeiling.interface contract', () => {
    it('ComputeCostCeilingContributionInput accepts a full valid contribution row', () => {
        const contribution: ComputeCostCeilingContributionInput = {
            tokensUsedInput: 100,
            tokensUsedOutput: 200,
            inputTokenCostRate: 1,
            outputTokenCostRate: 2,
        };
        expect(typeof contribution.tokensUsedInput).toBe('number');
        expect(typeof contribution.tokensUsedOutput).toBe('number');
        expect(typeof contribution.inputTokenCostRate).toBe('number');
        expect(typeof contribution.outputTokenCostRate).toBe('number');
    });

    it('ComputeCostCeilingStageInput accepts an incomplete stage with empty contributions', () => {
        const stage: ComputeCostCeilingStageInput = {
            stageSlug: 's1',
            expectedCount: 4,
            contributions: [],
        };
        expect(stage.stageSlug).toBe('s1');
        expect(stage.expectedCount).toBe(4);
        expect(stage.contributions).toEqual([]);
    });

    it('ComputeCostCeilingStageInput accepts a completed stage with one contribution row', () => {
        const contribution: ComputeCostCeilingContributionInput = {
            tokensUsedInput: 100,
            tokensUsedOutput: 200,
            inputTokenCostRate: 1,
            outputTokenCostRate: 2,
        };
        const stage: ComputeCostCeilingStageInput = {
            stageSlug: 's1',
            expectedCount: 4,
            contributions: [contribution],
        };
        expect(stage.contributions).toHaveLength(1);
        expect(stage.contributions[0]).toBe(contribution);
    });

    it('ComputeCostCeilingStageInput accepts a completed stage whose contributions sum to zero', () => {
        const contribution: ComputeCostCeilingContributionInput = {
            tokensUsedInput: 0,
            tokensUsedOutput: 0,
            inputTokenCostRate: 1,
            outputTokenCostRate: 2,
        };
        const stage: ComputeCostCeilingStageInput = {
            stageSlug: 's1',
            expectedCount: 4,
            contributions: [contribution],
        };
        expect(stage.contributions).toHaveLength(1);
        expect(stage.contributions[0].tokensUsedInput).toBe(0);
        expect(stage.contributions[0].tokensUsedOutput).toBe(0);
    });

    it('ComputeCostCeilingPayload accepts a full valid payload', () => {
        const stage: ComputeCostCeilingStageInput = {
            stageSlug: 's1',
            expectedCount: 4,
            contributions: [],
        };
        const payload: ComputeCostCeilingPayload = {
            stages: [stage],
            maxOutputTokens: 1000,
            outputTokenCostRates: [3],
        };
        expect(payload.stages).toHaveLength(1);
        expect(payload.maxOutputTokens).toBe(1000);
        expect(payload.outputTokenCostRates).toEqual([3]);
    });

    it('ComputeCostCeilingSuccessReturn accepts stageCeilings and projectCeiling', () => {
        const success: ComputeCostCeilingSuccessReturn = {
            stageCeilings: { s1: 12000 },
            projectCeiling: 12000,
        };
        expect(success.stageCeilings['s1']).toBe(12000);
        expect(success.projectCeiling).toBe(12000);
    });

    it('ComputeCostCeilingErrorReturn accepts an error wrapper object', () => {
        const errorReturn: ComputeCostCeilingErrorReturn = {
            error: {
                code: 'VALIDATION',
                message: 'invalid payload',
            },
        };
        expect(errorReturn.error.code).toBe('VALIDATION');
        expect(errorReturn.error.message).toBe('invalid payload');
    });

    it('ComputeCostCeilingDeps accepts an empty object', () => {
        const deps: ComputeCostCeilingDeps = {};
        expect(deps).toEqual({});
    });

    it('ComputeCostCeilingParams accepts an empty object', () => {
        const params: ComputeCostCeilingParams = {};
        expect(params).toEqual({});
    });

    it('ComputeCostCeilingReturn accepts a success branch', () => {
        const result: ComputeCostCeilingReturn = {
            stageCeilings: { s1: 12000 },
            projectCeiling: 12000,
        };
        expect(result.projectCeiling).toBe(12000);
    });

    it('ComputeCostCeilingReturn accepts an error branch', () => {
        const result: ComputeCostCeilingReturn = {
            error: {
                code: 'VALIDATION',
                message: 'invalid payload',
            },
        };
        expect(result.error.message).toBe('invalid payload');
    });

    it('ComputeCostCeilingFn accepts deps, params, payload and returns ComputeCostCeilingReturn', () => {
        const fn: ComputeCostCeilingFn = (deps: ComputeCostCeilingDeps, params: ComputeCostCeilingParams, payload: ComputeCostCeilingPayload) => {
            void deps;
            void params;
            void payload;
            const success: ComputeCostCeilingSuccessReturn = {
                stageCeilings: { s1: 12000 },
                projectCeiling: 12000,
            };
            return success;
        };
        const deps: ComputeCostCeilingDeps = {};
        const params: ComputeCostCeilingParams = {};
        const stage: ComputeCostCeilingStageInput = {
            stageSlug: 's1',
            expectedCount: 4,
            contributions: [],
        };
        const payload: ComputeCostCeilingPayload = {
            stages: [stage],
            maxOutputTokens: 1000,
            outputTokenCostRates: [3],
        };
        const result: ComputeCostCeilingReturn = fn(deps, params, payload);
        expect(result).toBeDefined();
    });
});
