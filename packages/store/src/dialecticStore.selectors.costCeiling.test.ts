import { describe, it, expect, vi } from 'vitest';
import {
    selectCostCeiling,
    selectPreProjectCostCeiling,
} from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import {
    computeCostCeiling,
    buildComputeCostCeilingDeps,
    buildComputeCostCeilingParams,
    buildComputeCostCeilingPayload,
    buildComputeCostCeilingContributionInput,
    buildComputeCostCeilingErrorReturn,
    isApiError,
    ComputeCostCeilingReturn,
    ComputeCostCeilingStageInput,
    ComputeCostCeilingSuccessReturn,
} from '@paynless/utils';
import {
    DialecticStateValues,
    DialecticProject,
    DialecticSession,
    DialecticProcessTemplate,
    ApiError,
    StageExpectedCount,
    STAGE_RUN_DOCUMENT_KEY_SEPARATOR,
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

describe('selectCostCeiling', () => {
    it('returns estimate with single output token cost rate', () => {
        const sessionId = 'session-cost-ceiling';
        const iterationNumber = 1;
        const maxOutputTokens = 1000;
        const outputTokenCostRate = 3;
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: outputTokenCostRate },
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

        const result: ComputeCostCeilingReturn | null = selectCostCeiling(state, sessionId);

        expect(result).not.toBeNull();
        expect(result !== null && 'error' in result).toBe(false);
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
        expect(expected !== null && !('error' in expected)).toBe(true);
        if (result !== null && !('error' in result) && expected !== null && !('error' in expected)) {
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
        const catalogEntryA = mockAiProvidersRow({
            id: 'model-a',
            config: { ...mockAiModelConfig(), output_token_cost_rate: 2 },
        });
        const catalogEntryB = mockAiProvidersRow({
            id: 'model-b',
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        const result: ComputeCostCeilingReturn | null = selectCostCeiling(state, sessionId);

        expect(result).not.toBeNull();
        expect(result !== null && 'error' in result).toBe(false);
        if (result !== null && !('error' in result)) {
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
        const catalogEntrySelected = mockAiProvidersRow({
            id: 'model-selected',
            config: {
                ...mockAiModelConfig(),
                input_token_cost_rate: inputTokenCostRate,
                output_token_cost_rate: outputTokenCostRate,
            },
        });
        const catalogEntryContribution = mockAiProvidersRow({
            id: 'model-contribution',
            config: {
                ...mockAiModelConfig(),
                input_token_cost_rate: inputTokenCostRate,
                output_token_cost_rate: contributionOutputTokenCostRate,
            },
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

        const result: ComputeCostCeilingReturn | null = selectCostCeiling(state, sessionId);

        expect(result).not.toBeNull();
        expect(result !== null && 'error' in result).toBe(false);
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
        expect(expected !== null && !('error' in expected)).toBe(true);
        if (result !== null && !('error' in result) && expected !== null && !('error' in expected)) {
            const success: ComputeCostCeilingSuccessReturn = result;
            const expectedSuccess: ComputeCostCeilingSuccessReturn = expected;
            expect(success.projectCeiling).toBe(9500);
            expect(success.projectCeiling).toBe(expectedSuccess.projectCeiling);
        }
    });

    it('returns null when maxOutputTokens is null', () => {
        const sessionId = 'session-cost-ceiling-null-cap';
        const iterationNumber = 1;
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectCostCeiling(state, sessionId)).toBeNull();
    });

    it('returns null when selectedModels is empty', () => {
        const sessionId = 'session-cost-ceiling-empty-models';
        const iterationNumber = 1;
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectCostCeiling(state, sessionId)).toBeNull();
    });

    it('returns null when no catalog entry has a valid AiModelExtendedConfig', () => {
        const sessionId = 'session-cost-ceiling-invalid-config';
        const iterationNumber = 1;
        const catalogEntry = mockAiProvidersRow({ config: {} });
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

        expect(selectCostCeiling(state, sessionId)).toBeNull();
    });

    it('returns null when stageExpectedCountsByRun is missing the run key', () => {
        const sessionId = 'session-cost-ceiling-missing-run-key';
        const iterationNumber = 1;
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectCostCeiling(state, sessionId)).toBeNull();
    });

    it('returns null when a template stage slug is missing from the counts map', () => {
        const sessionId = 'session-cost-ceiling-missing-slug';
        const iterationNumber = 1;
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectCostCeiling(state, sessionId)).toBeNull();
    });

    it('returns null when a completed-stage contribution has tokens_used_input null', () => {
        const sessionId = 'session-cost-ceiling-null-tokens';
        const iterationNumber = 1;
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectCostCeiling(state, sessionId)).toBeNull();
    });

    it('returns null when expectedCount on the counts map is invalid', () => {
        const sessionId = 'session-cost-ceiling-invalid-count';
        const iterationNumber = 1;
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectCostCeiling(state, sessionId)).toBeNull();
    });

    it('passes through computeCostCeiling error unchanged', async () => {
        const sessionId = 'session-cost-ceiling-error';
        const iterationNumber = 1;
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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
        const errorReturn = buildComputeCostCeilingErrorReturn({
            error: { code: 'CEILING_ERROR', message: 'compute failed' },
        });
        const paynlessUtils = await import('@paynless/utils');
        const computeCostCeilingSpy = vi
            .spyOn(paynlessUtils, 'computeCostCeiling')
            .mockReturnValueOnce(errorReturn);

        const result: ComputeCostCeilingReturn | null = selectCostCeiling(state, sessionId);

        expect(result).not.toBeNull();
        expect(result !== null && 'error' in result).toBe(true);
        if (result !== null && 'error' in result) {
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
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: outputTokenCostRate },
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

        const result: ComputeCostCeilingReturn | null = selectPreProjectCostCeiling(state);

        expect(result).not.toBeNull();
        expect(result !== null && 'error' in result).toBe(false);
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
        expect(expected !== null && !('error' in expected)).toBe(true);
        if (result !== null && !('error' in result) && expected !== null && !('error' in expected)) {
            const success: ComputeCostCeilingSuccessReturn = result;
            const expectedSuccess: ComputeCostCeilingSuccessReturn = expected;
            expect(success.projectCeiling).toBe(expectedSuccess.projectCeiling);
        }
    });

    it('returns null when selectedDomain is null', () => {
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectPreProjectCostCeiling(state)).toBeNull();
    });

    it('returns null when domainProcessAssociationError is set', () => {
        const associationError: ApiError = { code: 'ASSOCIATION_ERROR', message: 'failed' };
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectPreProjectCostCeiling(state)).toBeNull();
    });

    it('returns null when selectedDomainProcessAssociation is null', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectPreProjectCostCeiling(state)).toBeNull();
    });

    it('returns null when selectedDomainProcessAssociation domain_id does not match selectedDomain id', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectPreProjectCostCeiling(state)).toBeNull();
    });

    it('returns null when preProjectStageExpectedCounts is null', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectPreProjectCostCeiling(state)).toBeNull();
    });

    it('returns null when preProjectStageExpectedCounts is empty', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectPreProjectCostCeiling(state)).toBeNull();
    });

    it('returns null when maxOutputTokens is missing', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectPreProjectCostCeiling(state)).toBeNull();
    });

    it('returns null when outputTokenCostRates cannot be assembled', () => {
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

        expect(selectPreProjectCostCeiling(state)).toBeNull();
    });

    it('returns null when expectedCount on a stored count is invalid', () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        expect(selectPreProjectCostCeiling(state)).toBeNull();
    });

    it('passes through computeCostCeiling error unchanged', async () => {
        const selectedDomain = mockDialecticDomain({ id: 'dom-1' });
        const catalogEntry = mockAiProvidersRow({
            config: { ...mockAiModelConfig(), output_token_cost_rate: 3 },
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

        const result: ComputeCostCeilingReturn | null = selectPreProjectCostCeiling(state);

        expect(result).not.toBeNull();
        expect(result !== null && 'error' in result).toBe(true);
        if (result !== null && 'error' in result) {
            expect(isApiError(result.error)).toBe(true);
            expect(result.error).toEqual(errorReturn.error);
        }
        computeCostCeilingSpy.mockRestore();
    });
});
