import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import {
    selectCostCeiling,
    selectPreProjectCostCeiling,
} from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import {
    computeCostCeiling,
    isApiError,
    ComputeCostCeilingReturn,
    ComputeCostCeilingStageInput,
    ComputeCostCeilingSuccessReturn,
    isJson,
    ComputeCostCeilingErrorReturn,
} from '@paynless/utils';
import { 
    buildComputeCostCeilingDeps, 
    buildComputeCostCeilingParams, 
    buildComputeCostCeilingPayload, 
    buildComputeCostCeilingContributionInput,
    buildComputeCostCeilingErrorReturn,
} from '../../utils/src/computeCostCeiling/computeCostCeiling.mock';
import {
    DialecticStateValues,
    DialecticProject,
    DialecticSession,
    DialecticProcessTemplate,
    ApiError,
    StageExpectedCount,
    STAGE_RUN_DOCUMENT_KEY_SEPARATOR,
    AiModelExtendedConfig,
} from '@paynless/types';

import {
    mockAiProvidersRow,
    mockAiModelConfig,
    mockDialecticDomain,
    mockDomainProcessAssociationRow,
    mockDialecticStage,
    mockDialecticStageTransition,
    mockDialecticProcessTemplate,
    mockDialecticProject,
    mockSession,
    mockDialecticStageRecipe,
    mockDialecticStageRecipeStep,
    mockStageRunProgressSnapshot,
    mockStageRenderedDocumentDescriptor,
    mockJobProgressDto,
    mockDialecticContribution,
    mockSelectedModelsForCatalog,
} from '../../../apps/web/src/mocks/dialecticStore.mock';
import {
    mockSetAuthError,
    resetAuthStoreMock,
} from '../../../apps/web/src/mocks/authStore.mock';

vi.mock('./authStore', async () => {
    const authStoreMockModule = await import('../../../apps/web/src/mocks/authStore.mock');
    return { useAuthStore: authStoreMockModule.useAuthStore };
});

beforeEach(() => {
    act(() => {
        resetAuthStoreMock();
    });
});

describe('selectCostCeiling', () => {
    it('returns estimate with single output token cost rate', () => {
        const sessionId = 'session-cost-ceiling';
        const iterationNumber = 1;
        const maxOutputTokens = 1000;
        const outputTokenCostRate = 3;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: outputTokenCostRate });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const stageTwo = mockDialecticStage({ id: 'stage-def', slug: 'mock-stage-2' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne, stageTwo],
            transitions: [
                mockDialecticStageTransition({
                    id: 't1',
                    source_stage_id: 'stage-abc',
                    target_stage_id: 'stage-def',
                }),
            ],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const countStageOne = 4;
        const countStageTwo = 2;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens,
            stageExpectedCountsByRun: {
                [runKey]: {
                    'mock-stage-1': countStageOne,
                    'mock-stage-2': countStageTwo,
                },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
                'mock-stage-2': mockDialecticStageRecipe({ stageSlug: 'mock-stage-2' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
                [`${sessionId}:mock-stage-2:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(false);
        const stages: ComputeCostCeilingStageInput[] = [
            { stageSlug: 'mock-stage-1', expectedCount: countStageOne, contributions: [] },
            { stageSlug: 'mock-stage-2', expectedCount: countStageTwo, contributions: [] },
        ];
        const expected = computeCostCeiling(
            buildComputeCostCeilingDeps(),
            buildComputeCostCeilingParams(),
            buildComputeCostCeilingPayload({
                stages,
                maxOutputTokens,
                outputTokenCostRates: [outputTokenCostRate],
            }),
        );
        expect('error' in expected).toBe(false);
        if (!('error' in result) && !('error' in expected)) {
            const success: ComputeCostCeilingSuccessReturn = result;
            const expectedSuccess: ComputeCostCeilingSuccessReturn = expected;
            expect(success.stageCeilings['mock-stage-1']).toBe(
                countStageOne * maxOutputTokens * outputTokenCostRate,
            );
            expect(success.stageCeilings['mock-stage-2']).toBe(
                countStageTwo * maxOutputTokens * outputTokenCostRate,
            );
            expect(success.projectCeiling).toBe(expectedSuccess.projectCeiling);
        }
    });

    it('returns estimate using mean rate across two selected models', () => {
        const sessionId = 'session-cost-ceiling-mean-rate';
        const iterationNumber = 1;
        const maxOutputTokens = 1000;
        const expectedCount = 4;
        const modelConfigA: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 2 });
        if(!isJson(modelConfigA)) {
            throw new Error('modelConfigA is not a valid Json');
        }
        const modelConfigB: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfigB)) {
            throw new Error('modelConfigB is not a valid Json');
        }
        const catalogEntryA = mockAiProvidersRow({
            id: 'model-a',
            config: modelConfigA,
        });
        const catalogEntryB = mockAiProvidersRow({
            id: 'model-b',
            config: modelConfigB,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntryA, catalogEntryB]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne],
            transitions: [],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntryA, catalogEntryB],
            maxOutputTokens,
            stageExpectedCountsByRun: {
                [runKey]: {
                    'mock-stage-1': expectedCount,
                },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(false);
        if (!('error' in result)) {
            const success: ComputeCostCeilingSuccessReturn = result;
            expect(success.stageCeilings['mock-stage-1']).toBe(10000);
        }
    });

    it('returns mixed actual and estimate when one stage is completed and one is pending', () => {
        const sessionId = 'session-cost-ceiling-mixed';
        const iterationNumber = 1;
        const maxOutputTokens = 1000;
        const outputTokenCostRate = 3;
        const inputTokenCostRate = 1;
        const contributionOutputTokenCostRate = 2;
        const modelConfigSelected: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: outputTokenCostRate });
        if(!isJson(modelConfigSelected)) {
            throw new Error('modelConfigSelected is not a valid Json');
        }
        const modelConfigContribution: AiModelExtendedConfig = mockAiModelConfig({
            input_token_cost_rate: inputTokenCostRate,
            output_token_cost_rate: contributionOutputTokenCostRate,
        });
        if(!isJson(modelConfigContribution)) {
            throw new Error('modelConfigContribution is not a valid Json');
        }
        const catalogEntrySelected = mockAiProvidersRow({
            id: 'model-selected',
            config: modelConfigSelected,
        });
        const catalogEntryContribution = mockAiProvidersRow({
            id: 'model-contribution',
            config: modelConfigContribution,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntrySelected]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const stageTwo = mockDialecticStage({ id: 'stage-def', slug: 'mock-stage-2' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne, stageTwo],
            transitions: [
                mockDialecticStageTransition({
                    id: 't1',
                    source_stage_id: 'stage-abc',
                    target_stage_id: 'stage-def',
                }),
            ],
        });
        const tokensUsedInput = 100;
        const tokensUsedOutput = 200;
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
            dialectic_contributions: [
                mockDialecticContribution({
                    session_id: sessionId,
                    stage: 'mock-stage-1',
                    iteration_number: iterationNumber,
                    model_id: catalogEntryContribution.id,
                    tokens_used_input: tokensUsedInput,
                    tokens_used_output: tokensUsedOutput,
                }),
            ],
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const countStageOne = 4;
        const countStageTwo = 3;
        const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;
        const completedStageOneProgress = mockStageRunProgressSnapshot({
            stepStatuses: { doc_step: 'completed' },
            documents: {
                [`doc_a${sep}${catalogEntryContribution.id}`]: mockStageRenderedDocumentDescriptor({
                    status: 'completed',
                    modelId: catalogEntryContribution.id,
                }),
            },
            jobs: [
                mockJobProgressDto({
                    status: 'completed',
                    stepKey: 'doc_step',
                    modelId: catalogEntryContribution.id,
                }),
            ],
            progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntrySelected, catalogEntryContribution],
            maxOutputTokens,
            stageExpectedCountsByRun: {
                [runKey]: {
                    'mock-stage-1': countStageOne,
                    'mock-stage-2': countStageTwo,
                },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({
                    stageSlug: 'mock-stage-1',
                    steps: [
                        mockDialecticStageRecipeStep({
                            step_key: 'doc_step',
                            outputs_required: [
                                {
                                    document_key: 'doc_a',
                                    artifact_class: 'rendered_document',
                                    file_type: 'markdown',
                                },
                            ],
                        }),
                    ],
                }),
                'mock-stage-2': mockDialecticStageRecipe({ stageSlug: 'mock-stage-2' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: completedStageOneProgress,
                [`${sessionId}:mock-stage-2:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(false);
        const stages: ComputeCostCeilingStageInput[] = [
            {
                stageSlug: 'mock-stage-1',
                expectedCount: countStageOne,
                contributions: [
                    buildComputeCostCeilingContributionInput({
                        tokensUsedInput,
                        tokensUsedOutput,
                        inputTokenCostRate,
                        outputTokenCostRate: contributionOutputTokenCostRate,
                    }),
                ],
            },
            { stageSlug: 'mock-stage-2', expectedCount: countStageTwo, contributions: [] },
        ];
        const expected = computeCostCeiling(
            buildComputeCostCeilingDeps(),
            buildComputeCostCeilingParams(),
            buildComputeCostCeilingPayload({
                stages,
                maxOutputTokens,
                outputTokenCostRates: [outputTokenCostRate],
            }),
        );
        expect('error' in expected).toBe(false);
        if (!('error' in result) && !('error' in expected)) {
            const success: ComputeCostCeilingSuccessReturn = result;
            const expectedSuccess: ComputeCostCeilingSuccessReturn = expected;
            expect(success.projectCeiling).toBe(expectedSuccess.projectCeiling);
        }
    });

    it('returns OUTPUT_CAP_NOT_INITIALIZED when maxOutputTokens is null', () => {
        const sessionId = 'session-cost-ceiling-null-cap';
        const iterationNumber = 1;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const stageTwo = mockDialecticStage({ id: 'stage-def', slug: 'mock-stage-2' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne, stageTwo],
            transitions: [
                mockDialecticStageTransition({
                    id: 't1',
                    source_stage_id: 'stage-abc',
                    target_stage_id: 'stage-def',
                }),
            ],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: null,
            stageExpectedCountsByRun: {
                [runKey]: {
                    'mock-stage-1': 4,
                    'mock-stage-2': 2,
                },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
                'mock-stage-2': mockDialecticStageRecipe({ stageSlug: 'mock-stage-2' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
                [`${sessionId}:mock-stage-2:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('OUTPUT_CAP_NOT_INITIALIZED');
            }
        }
    });

    it('returns NO_MODELS_SELECTED when selectedModels is empty', () => {
        const sessionId = 'session-cost-ceiling-empty-models';
        const iterationNumber = 1;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const stageTwo = mockDialecticStage({ id: 'stage-def', slug: 'mock-stage-2' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne, stageTwo],
            transitions: [
                mockDialecticStageTransition({
                    id: 't1',
                    source_stage_id: 'stage-abc',
                    target_stage_id: 'stage-def',
                }),
            ],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels: [],
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
            stageExpectedCountsByRun: {
                [runKey]: {
                    'mock-stage-1': 4,
                    'mock-stage-2': 2,
                },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
                'mock-stage-2': mockDialecticStageRecipe({ stageSlug: 'mock-stage-2' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
                [`${sessionId}:mock-stage-2:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('NO_MODELS_SELECTED');
            }
        }
    });

    it('returns MODEL_CATALOG_INVALID_CONFIG when no catalog entry has a valid AiModelExtendedConfig', () => {
        const sessionId = 'session-cost-ceiling-invalid-config';
        const iterationNumber = 1;
        const baseModelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        const {
            hard_cap_output_tokens: _hardCapOutputTokens,
            provider_max_output_tokens: _providerMaxOutputTokens,
            ...invalidCatalogConfig
        } = baseModelConfig;
        if (!isJson(invalidCatalogConfig)) {
            throw new Error('invalidCatalogConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({ config: invalidCatalogConfig });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const stageTwo = mockDialecticStage({ id: 'stage-def', slug: 'mock-stage-2' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne, stageTwo],
            transitions: [
                mockDialecticStageTransition({
                    id: 't1',
                    source_stage_id: 'stage-abc',
                    target_stage_id: 'stage-def',
                }),
            ],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
            stageExpectedCountsByRun: {
                [runKey]: {
                    'mock-stage-1': 4,
                    'mock-stage-2': 2,
                },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
                'mock-stage-2': mockDialecticStageRecipe({ stageSlug: 'mock-stage-2' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
                [`${sessionId}:mock-stage-2:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('MODEL_CATALOG_INVALID_CONFIG');
            }
        }
    });

    it('returns STAGE_COUNTS_BY_RUN_MISSING when stageExpectedCountsByRun is missing the run key', () => {
        const sessionId = 'session-cost-ceiling-missing-run-key';
        const iterationNumber = 1;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const stageTwo = mockDialecticStage({ id: 'stage-def', slug: 'mock-stage-2' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne, stageTwo],
            transitions: [
                mockDialecticStageTransition({
                    id: 't1',
                    source_stage_id: 'stage-abc',
                    target_stage_id: 'stage-def',
                }),
            ],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
            stageExpectedCountsByRun: {},
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
                'mock-stage-2': mockDialecticStageRecipe({ stageSlug: 'mock-stage-2' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
                [`${sessionId}:mock-stage-2:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('STAGE_COUNTS_BY_RUN_MISSING');
            }
        }
    });

    it('returns STAGE_EXPECTED_COUNT_MISSING when a template stage slug is missing from the counts map', () => {
        const sessionId = 'session-cost-ceiling-missing-slug';
        const iterationNumber = 1;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const stageTwo = mockDialecticStage({ id: 'stage-def', slug: 'mock-stage-2' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne, stageTwo],
            transitions: [
                mockDialecticStageTransition({
                    id: 't1',
                    source_stage_id: 'stage-abc',
                    target_stage_id: 'stage-def',
                }),
            ],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
            stageExpectedCountsByRun: {
                [runKey]: {
                    'mock-stage-1': 4,
                },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
                'mock-stage-2': mockDialecticStageRecipe({ stageSlug: 'mock-stage-2' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
                [`${sessionId}:mock-stage-2:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('STAGE_EXPECTED_COUNT_MISSING');
            }
        }
    });

    it('returns CONTRIBUTION_COST_DATA_MISSING when a completed-stage contribution has tokens_used_input null', () => {
        const sessionId = 'session-cost-ceiling-null-tokens';
        const iterationNumber = 1;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const stageTwo = mockDialecticStage({ id: 'stage-def', slug: 'mock-stage-2' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne, stageTwo],
            transitions: [
                mockDialecticStageTransition({
                    id: 't1',
                    source_stage_id: 'stage-abc',
                    target_stage_id: 'stage-def',
                }),
            ],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
            dialectic_contributions: [
                mockDialecticContribution({
                    session_id: sessionId,
                    stage: 'mock-stage-1',
                    iteration_number: iterationNumber,
                    model_id: catalogEntry.id,
                    tokens_used_input: null,
                    tokens_used_output: 200,
                }),
            ],
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;
        const completedStageOneProgress = mockStageRunProgressSnapshot({
            stepStatuses: { doc_step: 'completed' },
            documents: {
                [`doc_a${sep}${catalogEntry.id}`]: mockStageRenderedDocumentDescriptor({
                    status: 'completed',
                    modelId: catalogEntry.id,
                }),
            },
            jobs: [mockJobProgressDto({ status: 'completed', stepKey: 'doc_step', modelId: catalogEntry.id })],
            progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
            stageExpectedCountsByRun: {
                [runKey]: {
                    'mock-stage-1': 4,
                    'mock-stage-2': 2,
                },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({
                    stageSlug: 'mock-stage-1',
                    steps: [
                        mockDialecticStageRecipeStep({
                            step_key: 'doc_step',
                            outputs_required: [
                                {
                                    document_key: 'doc_a',
                                    artifact_class: 'rendered_document',
                                    file_type: 'markdown',
                                },
                            ],
                        }),
                    ],
                }),
                'mock-stage-2': mockDialecticStageRecipe({ stageSlug: 'mock-stage-2' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: completedStageOneProgress,
                [`${sessionId}:mock-stage-2:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('CONTRIBUTION_COST_DATA_MISSING');
            }
        }
    });

    it('returns STAGE_EXPECTED_COUNT_MISSING when expectedCount on the counts map is invalid', () => {
        const sessionId = 'session-cost-ceiling-invalid-count';
        const iterationNumber = 1;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const stageTwo = mockDialecticStage({ id: 'stage-def', slug: 'mock-stage-2' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne, stageTwo],
            transitions: [
                mockDialecticStageTransition({
                    id: 't1',
                    source_stage_id: 'stage-abc',
                    target_stage_id: 'stage-def',
                }),
            ],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
            stageExpectedCountsByRun: {
                [runKey]: {
                    'mock-stage-1': -1,
                    'mock-stage-2': 2,
                },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
                'mock-stage-2': mockDialecticStageRecipe({ stageSlug: 'mock-stage-2' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
                [`${sessionId}:mock-stage-2:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('STAGE_EXPECTED_COUNT_MISSING');
            }
        }
    });

    it('passes through useAuthStore error unchanged', () => {
        const authError: Error = new Error('auth failed');
        mockSetAuthError(authError);
        const sessionId = 'session-cost-ceiling-auth-error';
        const iterationNumber = 1;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({ config: modelConfig });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne],
            transitions: [],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
            stageExpectedCountsByRun: {
                [runKey]: { 'mock-stage-1': 4 },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(result.error).toBe(authError);
        }
    });

    it('returns STAGE_PROGRESS_HYDRATION_FAILED before STAGE_COUNTS_BY_RUN_MISSING when hydration status is failed', () => {
        const sessionId = 'session-cost-ceiling-hydration-failed';
        const iterationNumber = 1;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({ config: modelConfig });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne],
            transitions: [],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
            stageExpectedCountsByRun: {},
            progressHydrationStatus: {
                [runKey]: 'failed',
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('STAGE_PROGRESS_HYDRATION_FAILED');
            }
        }
    });

    it('passes through modelCatalogError unchanged', () => {
        const catalogError: ApiError = { code: 'CATALOG_ERROR', message: 'catalog failed' };
        const sessionId = 'session-cost-ceiling-catalog-error';
        const iterationNumber = 1;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({ config: modelConfig });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne],
            transitions: [],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            modelCatalogError: catalogError,
            maxOutputTokens: 1000,
            stageExpectedCountsByRun: {
                [runKey]: { 'mock-stage-1': 4 },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(result.error).toBe(catalogError);
        }
    });

    it('passes through processTemplateError unchanged', () => {
        const templateError: ApiError = { code: 'TEMPLATE_ERROR', message: 'template failed' };
        const sessionId = 'session-cost-ceiling-template-error';
        const iterationNumber = 1;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({ config: modelConfig });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne],
            transitions: [],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            processTemplateError: templateError,
            maxOutputTokens: 1000,
            stageExpectedCountsByRun: {
                [runKey]: { 'mock-stage-1': 4 },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(result.error).toBe(templateError);
        }
    });

    it('does not brigade stageExpectedCountsError when session run counts are present', () => {
        const countsError: ApiError = { code: 'COUNTS_ERROR', message: 'counts failed' };
        const sessionId = 'session-cost-ceiling-no-preproject-brigade';
        const iterationNumber = 1;
        const maxOutputTokens = 1000;
        const outputTokenCostRate = 3;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: outputTokenCostRate });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({ config: modelConfig });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne],
            transitions: [],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const expectedCount = 4;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            stageExpectedCountsError: countsError,
            maxOutputTokens,
            stageExpectedCountsByRun: {
                [runKey]: { 'mock-stage-1': expectedCount },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(false);
        if (!('error' in result)) {
            const success: ComputeCostCeilingSuccessReturn = result;
            expect(success.stageCeilings['mock-stage-1']).toBe(
                expectedCount * maxOutputTokens * outputTokenCostRate,
            );
        }
    });

    it('passes through computeCostCeiling error unchanged', async () => {
        const sessionId = 'session-cost-ceiling-error';
        const iterationNumber = 1;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const stageOne = mockDialecticStage({ id: 'stage-abc', slug: 'mock-stage-1' });
        const stageTwo = mockDialecticStage({ id: 'stage-def', slug: 'mock-stage-2' });
        const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [stageOne, stageTwo],
            transitions: [
                mockDialecticStageTransition({
                    id: 't1',
                    source_stage_id: 'stage-abc',
                    target_stage_id: 'stage-def',
                }),
            ],
        });
        const session: DialecticSession = mockSession({
            id: sessionId,
            iteration_count: iterationNumber,
            current_stage_id: 'stage-abc',
        });
        const project: DialecticProject = mockDialecticProject({
            dialectic_sessions: [session],
            dialectic_process_templates: template,
        });
        const runKey = `${sessionId}:${iterationNumber}`;
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: project,
            currentProcessTemplate: template,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
            stageExpectedCountsByRun: {
                [runKey]: {
                    'mock-stage-1': 4,
                    'mock-stage-2': 2,
                },
            },
            recipesByStageSlug: {
                'mock-stage-1': mockDialecticStageRecipe({ stageSlug: 'mock-stage-1' }),
                'mock-stage-2': mockDialecticStageRecipe({ stageSlug: 'mock-stage-2' }),
            },
            stageRunProgress: {
                [`${sessionId}:mock-stage-1:${iterationNumber}`]: mockStageRunProgressSnapshot(),
                [`${sessionId}:mock-stage-2:${iterationNumber}`]: mockStageRunProgressSnapshot(),
            },
        };
        const errorReturn: ComputeCostCeilingErrorReturn = buildComputeCostCeilingErrorReturn({
            error: { code: 'CEILING_ERROR', message: 'compute failed' },
        });
        const paynlessUtils = await import('@paynless/utils');
        const computeCostCeilingSpy = vi
            .spyOn(paynlessUtils, 'computeCostCeiling')
            .mockReturnValueOnce(errorReturn);

        const result: ComputeCostCeilingReturn = selectCostCeiling(state, sessionId);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            expect(result.error).toEqual(errorReturn.error);
        }
        computeCostCeilingSpy.mockRestore();
    });
});

describe('selectPreProjectCostCeiling', () => {
    it('returns estimate when association chain and counts are complete', () => {
        const maxOutputTokens = 1000;
        const outputTokenCostRate = 3;
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: outputTokenCostRate });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const selectedDomainProcessAssociation = mockDomainProcessAssociationRow({
            domain_id: selectedDomain.id,
        });
        const thesisCount = 4;
        const antithesisCount = 2;
        const preProjectStageExpectedCounts: StageExpectedCount[] = [
            { stageSlug: 'thesis', expectedCount: thesisCount },
            { stageSlug: 'antithesis', expectedCount: antithesisCount },
        ];
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation,
            domainProcessAssociationError: null,
            preProjectStageExpectedCounts,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(false);
        const stages: ComputeCostCeilingStageInput[] = [
            { stageSlug: 'thesis', expectedCount: thesisCount, contributions: [] },
            { stageSlug: 'antithesis', expectedCount: antithesisCount, contributions: [] },
        ];
        const expected = computeCostCeiling(
            buildComputeCostCeilingDeps(),
            buildComputeCostCeilingParams(),
            buildComputeCostCeilingPayload({
                stages,
                maxOutputTokens,
                outputTokenCostRates: [outputTokenCostRate],
            }),
        );
        expect('error' in expected).toBe(false);
        if (!('error' in result) && !('error' in expected)) {
            const success: ComputeCostCeilingSuccessReturn = result;
            const expectedSuccess: ComputeCostCeilingSuccessReturn = expected;
            expect(success.projectCeiling).toBe(expectedSuccess.projectCeiling);
        }
    });

    it('returns SELECTED_DOMAIN_MISSING when selectedDomain is null', () => {
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain: null,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow(),
            domainProcessAssociationError: null,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('SELECTED_DOMAIN_MISSING');
            }
        }
    });

    it('passes through domainProcessAssociationError unchanged', () => {
        const associationError: ApiError = { code: 'ASSOCIATION_ERROR', message: 'failed' };
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: selectedDomain.id,
            }),
            domainProcessAssociationError: associationError,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(result.error).toBe(associationError);
        }
    });

    it('returns DOMAIN_PROCESS_ASSOCIATION_MISSING when selectedDomainProcessAssociation is null', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: null,
            domainProcessAssociationError: null,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('DOMAIN_PROCESS_ASSOCIATION_MISSING');
            }
        }
    });

    it('returns DOMAIN_PROCESS_ASSOCIATION_DOMAIN_MISMATCH when selectedDomainProcessAssociation domain_id does not match selectedDomain id', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: 'other-domain-id',
            }),
            domainProcessAssociationError: null,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('DOMAIN_PROCESS_ASSOCIATION_DOMAIN_MISMATCH');
            }
        }
    });

    it('returns PRE_PROJECT_STAGE_COUNTS_MISSING when preProjectStageExpectedCounts is null', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: selectedDomain.id,
            }),
            domainProcessAssociationError: null,
            preProjectStageExpectedCounts: null,
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('PRE_PROJECT_STAGE_COUNTS_MISSING');
            }
        }
    });

    it('returns PRE_PROJECT_STAGE_COUNTS_MISSING when preProjectStageExpectedCounts is empty', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: selectedDomain.id,
            }),
            domainProcessAssociationError: null,
            preProjectStageExpectedCounts: [],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('PRE_PROJECT_STAGE_COUNTS_MISSING');
            }
        }
    });

    it('returns OUTPUT_CAP_NOT_INITIALIZED when maxOutputTokens is missing', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: selectedDomain.id,
            }),
            domainProcessAssociationError: null,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: null,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('OUTPUT_CAP_NOT_INITIALIZED');
            }
        }
    });

    it('returns MODEL_CATALOG_INVALID_CONFIG when outputTokenCostRates cannot be assembled', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const catalogEntry = mockAiProvidersRow({ config: {} });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: selectedDomain.id,
            }),
            domainProcessAssociationError: null,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('MODEL_CATALOG_INVALID_CONFIG');
            }
        }
    });

    it('returns STAGE_EXPECTED_COUNT_INVALID when expectedCount on a stored count is invalid', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: selectedDomain.id,
            }),
            domainProcessAssociationError: null,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: -1 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            if (isApiError(result.error)) {
                expect(result.error.code).toBe('STAGE_EXPECTED_COUNT_INVALID');
            }
        }
    });

    it('passes through useAuthStore error unchanged', () => {
        const authError: Error = new Error('auth failed');
        mockSetAuthError(authError);
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({ config: modelConfig });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: selectedDomain.id,
            }),
            domainProcessAssociationError: null,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(result.error).toBe(authError);
        }
    });

    it('passes through stageExpectedCountsError unchanged', () => {
        const countsError: ApiError = { code: 'COUNTS_ERROR', message: 'counts failed' };
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({ config: modelConfig });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: selectedDomain.id,
            }),
            domainProcessAssociationError: null,
            stageExpectedCountsError: countsError,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(result.error).toBe(countsError);
        }
    });

    it('passes through modelCatalogError unchanged', () => {
        const catalogError: ApiError = { code: 'CATALOG_ERROR', message: 'catalog failed' };
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({ config: modelConfig });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: selectedDomain.id,
            }),
            domainProcessAssociationError: null,
            modelCatalogError: catalogError,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(result.error).toBe(catalogError);
        }
    });

    it('passes through processTemplateError unchanged', () => {
        const templateError: ApiError = { code: 'TEMPLATE_ERROR', message: 'template failed' };
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({ config: modelConfig });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: selectedDomain.id,
            }),
            domainProcessAssociationError: null,
            processTemplateError: templateError,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(result.error).toBe(templateError);
        }
    });

    it('passes through computeCostCeiling error unchanged', async () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ output_token_cost_rate: 3 });
        if(!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogEntry = mockAiProvidersRow({
            config: modelConfig,
        });
        const selectedModels = mockSelectedModelsForCatalog([catalogEntry]);
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedDomain,
            selectedDomainProcessAssociation: mockDomainProcessAssociationRow({
                domain_id: selectedDomain.id,
            }),
            domainProcessAssociationError: null,
            preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }],
            selectedModels,
            modelCatalog: [catalogEntry],
            maxOutputTokens: 1000,
        };
        const errorReturn = buildComputeCostCeilingErrorReturn({
            error: { code: 'PRE_PROJECT_CEILING_ERROR', message: 'compute failed' },
        });
        const paynlessUtils = await import('@paynless/utils');
        const computeCostCeilingSpy = vi
            .spyOn(paynlessUtils, 'computeCostCeiling')
            .mockReturnValueOnce(errorReturn);

        const result: ComputeCostCeilingReturn = selectPreProjectCostCeiling(state);

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(isApiError(result.error)).toBe(true);
            expect(result.error).toEqual(errorReturn.error);
        }
        computeCostCeilingSpy.mockRestore();
    });
});
