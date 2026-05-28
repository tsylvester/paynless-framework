import { describe, it, expect } from 'vitest';
import {
    selectContributionById,
    selectStageDocumentResource,
    selectEditedDocumentByKey,
    selectValidMarkdownDocumentKeys,
    selectDocumentDisplayMetadata,
    selectUnifiedProjectProgress,
    selectStageDocumentChecklist,
} from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import type {
    DialecticStateValues,
    DialecticProject,
    DialecticStage,
    DialecticProcessTemplate,
    DialecticSession,
    DialecticStageRecipe,
    DialecticStageRecipeStep,
    UnifiedProjectProgress,
    DocumentDisplayMetadata,
    OutputRequirement,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';
import {
    mockDialecticStage,
    mockDialecticStageTransition,
    mockDialecticProcessTemplate,
    mockDialecticProject,
    mockSession,
    mockDialecticContribution,
    mockSelectedModel,
    mockDialecticStageRecipe,
    mockDialecticStageRecipeStep,
    mockStageRunProgressSnapshot,
    mockJobProgressDto,
    mockStageRenderedDocumentDescriptor,
    mockStageDocumentContentState,
} from '../../../apps/web/src/mocks/dialecticStore.mock';

describe('selectStageDocumentResource and selectEditedDocumentByKey', () => {
    const sessionId = 'session-resource-test';
    const stageSlug = 'thesis';
    const iterationNumber = 1;
    const modelId = 'model-test';
    const documentKey = 'business_case';
    const compositeKey = `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;

    it('should return document resource content from stageDocumentContent with baselineMarkdown, timestamps, and resource id', () => {
        const testContent = mockStageDocumentContentState({
            baselineMarkdown: 'Edited document content from resource',
            currentDraftMarkdown: 'Edited document content from resource',
            lastBaselineVersion: {
                resourceId: 'resource-123',
                versionHash: 'hash-abc',
                updatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
            },
            lastAppliedVersionHash: 'hash-abc',
            resourceType: null,
        });

        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            stageDocumentContent: {
                [compositeKey]: testContent,
            },
        };

        const result = selectStageDocumentResource(state, sessionId, stageSlug, iterationNumber, modelId, documentKey);
        
        expect(result).toBeDefined();
        expect(result?.baselineMarkdown).toBe('Edited document content from resource');
        expect(result?.lastBaselineVersion?.resourceId).toBe('resource-123');
        expect(result?.lastBaselineVersion?.updatedAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should return edited document metadata by composite key with content and timestamps', () => {
        const testContent = mockStageDocumentContentState({
            baselineMarkdown: 'Edited content from composite key lookup',
            currentDraftMarkdown: 'Edited content from composite key lookup',
            lastBaselineVersion: {
                resourceId: 'resource-456',
                versionHash: 'hash-def',
                updatedAt: new Date('2024-01-02T00:00:00Z').toISOString(),
            },
            lastAppliedVersionHash: 'hash-def',
            resourceType: null,
        });

        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            stageDocumentContent: {
                [compositeKey]: testContent,
            },
        };

        const result = selectEditedDocumentByKey(state, compositeKey);
        
        expect(result).toBeDefined();
        expect(result?.baselineMarkdown).toBe('Edited content from composite key lookup');
        expect(result?.lastBaselineVersion?.resourceId).toBe('resource-456');
        expect(result?.lastBaselineVersion?.updatedAt).toBe('2024-01-02T00:00:00.000Z');
    });

    it('should return undefined when document resource does not exist in stageDocumentContent', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            stageDocumentContent: {},
        };

        const result = selectStageDocumentResource(state, sessionId, stageSlug, iterationNumber, modelId, documentKey);
        
        expect(result).toBeUndefined();
    });

    it('should assert that resource selectors are authoritative source for editable documents, not dialectic_contributions', () => {
        // This test asserts that for documents with entries in stageDocumentContent,
        // the new resource selectors are the authoritative source, not legacy selectContributionById
        
        const testContent = mockStageDocumentContentState({
            baselineMarkdown: 'Resource-based content - authoritative source',
            currentDraftMarkdown: 'Resource-based content - authoritative source',
            lastBaselineVersion: {
                resourceId: 'resource-789',
                versionHash: 'hash-ghi',
                updatedAt: new Date('2024-01-03T00:00:00Z').toISOString(),
            },
            lastAppliedVersionHash: 'hash-ghi',
            resourceType: null,
        });

        const staleContribution = mockDialecticContribution({
            id: 'contrib-stale',
            session_id: sessionId,
            stage: stageSlug,
            iteration_number: iterationNumber,
            contribution_type: documentKey,
            model_id: modelId,
            model_name: null,
            created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
            updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
        });

        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            stageDocumentContent: {
                [compositeKey]: testContent,
            },
            currentProjectDetail: mockDialecticProject({
                id: 'proj-test',
                dialectic_sessions: [
                    mockSession({
                        id: sessionId,
                        project_id: 'proj-test',
                        iteration_count: iterationNumber,
                        selected_models: [mockSelectedModel({ id: modelId, displayName: modelId })],
                        dialectic_contributions: [staleContribution],
                        dialectic_session_models: [],
                        feedback: [],
                    }),
                ],
                process_template_id: null,
                dialectic_process_templates: null,
            }),
        };

        // This is the authoritative source for editable documents
        const resourceResult = selectStageDocumentResource(state, sessionId, stageSlug, iterationNumber, modelId, documentKey);
        expect(resourceResult?.baselineMarkdown).toBe('Resource-based content - authoritative source');
        expect(resourceResult?.lastBaselineVersion?.resourceId).toBe('resource-789');
        
        // Legacy selectContributionById should NOT be used for documents that have
        // entries in stageDocumentContent. The resource selector is authoritative.
        // Note: selectContributionById may still work for historical lookups, but
        // it should NOT drive UI renders for editable documents when stageDocumentContent exists.
        const legacyResult = selectContributionById(state, staleContribution.id);
        
        // The test documents that for editable documents, the resource selector
        // must be used, not the legacy contribution selector
        // UI components should prefer resourceResult over legacyResult for editable documents
        expect(resourceResult).toBeDefined();
        expect(resourceResult?.baselineMarkdown).not.toBe(staleContribution.contribution_type);
    });

    it('should return document resource with dirty draft state', () => {
        const testContent = mockStageDocumentContentState({
            baselineMarkdown: 'Original baseline content',
            currentDraftMarkdown: 'Modified draft content',
            isDirty: true,
            lastBaselineVersion: {
                resourceId: 'resource-dirty',
                versionHash: 'hash-dirty',
                updatedAt: new Date('2024-01-04T00:00:00Z').toISOString(),
            },
            lastAppliedVersionHash: 'hash-dirty',
            resourceType: null,
        });

        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            stageDocumentContent: {
                [compositeKey]: testContent,
            },
        };

        const result = selectStageDocumentResource(state, sessionId, stageSlug, iterationNumber, modelId, documentKey);
        
        expect(result).toBeDefined();
        expect(result?.isDirty).toBe(true);
        expect(result?.baselineMarkdown).toBe('Original baseline content');
        expect(result?.currentDraftMarkdown).toBe('Modified draft content');
    });
});

describe('selectValidMarkdownDocumentKeys', () => {
    const stageSlug = 'thesis';
    const stageWithMixedOutputs: DialecticStageRecipe = mockDialecticStageRecipe({
        stageSlug,
        instanceId: 'instance-mixed',
        steps: [
            mockDialecticStageRecipeStep({
                id: 'step-markdown-1',
                step_key: 'markdown_step_1',
                step_slug: 'markdown-step-1',
                step_name: 'Markdown Step 1',
                branch_key: 'branch-1',
                prompt_template_id: 'prompt-1',
                outputs_required: [
                    {
                        document_key: 'draft_document_markdown',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                    },
                ],
            }),
            mockDialecticStageRecipeStep({
                id: 'step-json',
                step_key: 'json_step',
                step_slug: 'json-step',
                step_name: 'JSON Step',
                execution_order: 2,
                parallel_group: 2,
                branch_key: 'branch-2',
                job_type: 'PLAN',
                prompt_type: 'Planner',
                prompt_template_id: 'prompt-2',
                output_type: 'header_context',
                granularity_strategy: 'all_to_one',
                outputs_required: [
                    {
                        document_key: 'HeaderContext',
                        artifact_class: 'header_context',
                        file_type: 'json',
                    },
                ],
            }),
            mockDialecticStageRecipeStep({
                id: 'step-markdown-2',
                step_key: 'markdown_step_2',
                step_slug: 'markdown-step-2',
                step_name: 'Markdown Step 2',
                execution_order: 3,
                parallel_group: 3,
                branch_key: 'branch-3',
                prompt_template_id: 'prompt-3',
                outputs_required: [
                    {
                        document_key: 'business_case_markdown',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                    },
                ],
            }),
        ],
    });

    const stageWithNoMarkdownOutputs: DialecticStageRecipe = mockDialecticStageRecipe({
        stageSlug: 'no-markdown',
        instanceId: 'instance-no-markdown',
        steps: [
            mockDialecticStageRecipeStep({
                id: 'step-json-only',
                step_key: 'json_only_step',
                step_slug: 'json-only-step',
                step_name: 'JSON Only Step',
                job_type: 'PLAN',
                prompt_type: 'Planner',
                prompt_template_id: 'prompt-1',
                output_type: 'header_context',
                granularity_strategy: 'all_to_one',
                outputs_required: [
                    {
                        document_key: 'HeaderContext',
                        artifact_class: 'header_context',
                        file_type: 'json',
                    },
                ],
            }),
        ],
    });

    it('should return a Set containing only markdown document keys, excluding non-markdown artifacts', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: {
                [stageSlug]: stageWithMixedOutputs,
            },
        };

        const result = selectValidMarkdownDocumentKeys(state, stageSlug);

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(2);
        expect(result.has('draft_document_markdown')).toBe(true);
        expect(result.has('business_case_markdown')).toBe(true);
        expect(result.has('HeaderContext')).toBe(false);
    });

    it('should return an empty Set when no markdown outputs exist for the stage', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: {
                'no-markdown': stageWithNoMarkdownOutputs,
            },
        };

        const result = selectValidMarkdownDocumentKeys(state, 'no-markdown');

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
    });

    it('should return an empty Set when the stage has no recipe', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: {},
        };

        const result = selectValidMarkdownDocumentKeys(state, 'nonexistent-stage');

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
    });

    it('should return an empty Set when the recipe has no steps', () => {
        const stageWithNoSteps: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'empty-stage',
            instanceId: 'instance-empty',
            steps: [],
        });

        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: {
                'empty-stage': stageWithNoSteps,
            },
        };

        const result = selectValidMarkdownDocumentKeys(state, 'empty-stage');

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
    });

    it('should return an empty Set when steps have no outputs_required', () => {
        const stageWithNoOutputs: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'no-outputs-stage',
            instanceId: 'instance-no-outputs',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 'step-no-outputs',
                    step_key: 'no_outputs_step',
                    step_slug: 'no-outputs-step',
                    step_name: 'No Outputs Step',
                    branch_key: 'branch-1',
                    prompt_template_id: 'prompt-1',
                    outputs_required: undefined,
                }),
            ],
        });

        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: {
                'no-outputs-stage': stageWithNoOutputs,
            },
        };

        const result = selectValidMarkdownDocumentKeys(state, 'no-outputs-stage');

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
    });

    it('should exclude markdown document keys from header_context steps', () => {
        const stageWithHeaderContextMarkdown: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'header-markdown-stage',
            instanceId: 'instance-header-markdown',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 'step-header-md',
                    step_key: 'header_context_step',
                    step_slug: 'header-context-step',
                    step_name: 'Header Context Step',
                    branch_key: 'branch-1',
                    job_type: 'PLAN',
                    prompt_type: 'Planner',
                    prompt_template_id: 'prompt-1',
                    output_type: 'header_context',
                    granularity_strategy: 'all_to_one',
                    outputs_required: [
                        {
                            document_key: 'header_context_doc',
                            artifact_class: 'header_context',
                            file_type: 'markdown',
                        },
                    ],
                }),
                mockDialecticStageRecipeStep({
                    id: 'step-rendered',
                    step_key: 'rendered_step',
                    step_slug: 'rendered-step',
                    step_name: 'Rendered Step',
                    execution_order: 2,
                    parallel_group: 2,
                    branch_key: 'branch-2',
                    prompt_template_id: 'prompt-2',
                    output_type: 'rendered_document',
                    outputs_required: [
                        {
                            document_key: 'business_case',
                            artifact_class: 'rendered_document',
                            file_type: 'markdown',
                        },
                    ],
                }),
                mockDialecticStageRecipeStep({
                    id: 'step-assembled',
                    step_key: 'assembled_step',
                    step_slug: 'assembled-step',
                    step_name: 'Assembled Step',
                    execution_order: 3,
                    parallel_group: 3,
                    branch_key: 'branch-3',
                    prompt_template_id: 'prompt-3',
                    outputs_required: [
                        {
                            document_key: 'feature_spec',
                            artifact_class: 'rendered_document',
                            file_type: 'markdown',
                        },
                    ],
                }),
            ],
        });

        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: {
                'header-markdown-stage': stageWithHeaderContextMarkdown,
            },
        };

        const result = selectValidMarkdownDocumentKeys(state, 'header-markdown-stage');

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(2);
        expect(result.has('business_case')).toBe(true);
        expect(result.has('feature_spec')).toBe(true);
        expect(result.has('header_context_doc')).toBe(false);
    });
  });

describe('selectStageDocumentChecklist', () => {
    it('excludes header_context documents by filtering against selectValidMarkdownDocumentKeys', () => {
        const sessionId = 'session-checklist-filter';
        const stageSlug = 'header-markdown-stage';
        const iterationNumber = 1;
        const modelId = 'model-1';
        const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
        const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;

        const stageWithHeaderContextMarkdown: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'header-markdown-stage',
            instanceId: 'instance-header-markdown',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 'step-header-md',
                    step_key: 'header_context_step',
                    step_slug: 'header-context-step',
                    step_name: 'Header Context Step',
                    branch_key: 'branch-1',
                    job_type: 'PLAN',
                    prompt_type: 'Planner',
                    prompt_template_id: 'prompt-1',
                    output_type: 'header_context',
                    granularity_strategy: 'all_to_one',
                    outputs_required: [
                        {
                            document_key: 'header_context_doc',
                            artifact_class: 'header_context',
                            file_type: 'markdown',
                        },
                    ],
                }),
                mockDialecticStageRecipeStep({
                    id: 'step-rendered',
                    step_key: 'rendered_step',
                    step_slug: 'rendered-step',
                    step_name: 'Rendered Step',
                    execution_order: 2,
                    parallel_group: 2,
                    branch_key: 'branch-2',
                    prompt_template_id: 'prompt-2',
                    output_type: 'rendered_document',
                    outputs_required: [
                        {
                            document_key: 'business_case',
                            artifact_class: 'rendered_document',
                            file_type: 'markdown',
                        },
                    ],
                }),
            ],
        });

        const renderedDescriptor = mockStageRenderedDocumentDescriptor({
            status: 'completed',
            job_id: 'job-1',
            latestRenderedResourceId: 'res-1',
            modelId,
            versionHash: 'hash-1',
            lastRenderedResourceId: 'res-1',
            lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            stepKey: 'rendered_step',
        });

        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: {
                [stageSlug]: stageWithHeaderContextMarkdown,
            },
            stageRunProgress: {
                [progressKey]: mockStageRunProgressSnapshot({
                    stepStatuses: { rendered_step: 'completed', header_context_step: 'completed' },
                    documents: {
                        [`business_case${sep}${modelId}`]: renderedDescriptor,
                        [`header_context_doc${sep}${modelId}`]: mockStageRenderedDocumentDescriptor({
                            status: 'completed',
                            job_id: 'job-2',
                            latestRenderedResourceId: 'res-2',
                            modelId,
                            versionHash: 'hash-1',
                            lastRenderedResourceId: 'res-1',
                            lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                            stepKey: 'rendered_step',
                        }),
                    },
                    jobProgress: {},
                    progress: { totalSteps: 2, completedSteps: 2, failedSteps: 0 },
                    jobs: [],
                }),
            },
        };

        const checklist = selectStageDocumentChecklist(state, progressKey, modelId);

        expect(checklist).toHaveLength(1);
        expect(checklist[0].documentKey).toBe('business_case');
        expect(checklist.map((e) => e.documentKey)).not.toContain('header_context_doc');
    });
});

describe('selectUnifiedProjectProgress', () => {
    const sessionId = 'session-unified-docs';
    const iterationNumber = 1;
    const progressKeyForStage = (stageSlug: string): string =>
        `${sessionId}:${stageSlug}:${iterationNumber}`;
    const unifiedStepOne = mockDialecticStageRecipeStep({
        id: 's1',
        step_key: 'step_1',
        step_slug: 's1',
        step_name: 'Step 1',
        outputs_required: [],
    });
    const unifiedStepTwo = mockDialecticStageRecipeStep({
        id: 's2',
        step_key: 'step_2',
        step_slug: 's2',
        step_name: 'Step 2',
        execution_order: 2,
        parallel_group: 2,
        branch_key: 'b2',
        outputs_required: [],
    });

    const stageA: DialecticStage = mockDialecticStage({
        id: 'stage-a',
        slug: 'stage-a',
        display_name: 'Stage A',
        description: '',
        default_system_prompt_id: null,
        minimum_balance: 0,
    });
    const stageB: DialecticStage = mockDialecticStage({
        id: 'stage-b',
        slug: 'stage-b',
        display_name: 'Stage B',
        description: '',
        default_system_prompt_id: null,
        minimum_balance: 0,
    });
    const template: DialecticProcessTemplate = mockDialecticProcessTemplate({
        starting_stage_id: 'stage-a',
        stages: [stageA, stageB],
        transitions: [
            mockDialecticStageTransition({
                id: 't1',
                source_stage_id: 'stage-a',
                target_stage_id: 'stage-b',
            }),
        ],
    });
    const session: DialecticSession = mockSession({
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        iteration_count: iterationNumber,
        selected_models: [mockSelectedModel()],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-a',
        viewing_stage_id: null,
        dialectic_contributions: [],
        dialectic_session_models: [],
        feedback: [],
    });
    const projectWithSession: DialecticProject = mockDialecticProject({
        id: 'proj-1',
        user_id: 'user1',
        project_name: 'Project',
        initial_user_prompt: null,
        selected_domain_id: 'dom1',
        dialectic_domains: { name: 'Domain' },
        dialectic_sessions: [session],
        process_template_id: 'pt1',
        dialectic_process_templates: template,
    });

    const recipeB: DialecticStageRecipe = mockDialecticStageRecipe({
        stageSlug: 'stage-b',
        instanceId: 'inst-b',
        steps: [],
    });
    const progressB = mockStageRunProgressSnapshot({
        stepStatuses: {},
        documents: {},
        jobProgress: {},
        progress: { totalSteps: 0, completedSteps: 0, failedSteps: 0 },
        jobs: [],
    });

    it('returns hydrationReady false when currentProcessTemplate is null', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: null,
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: mockStageRunProgressSnapshot({
                    stepStatuses: { step_1: 'completed' },
                    documents: {},
                    jobProgress: {},
                    progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
                    jobs: [],
                }),
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        expect(result.hydrationReady).toBe(false);
    });

    it('returns result with hydrationReady false and synthetic not_started for missing stage (partial progress / renavigation)', () => {
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-a',
            steps: [unifiedStepOne],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
        expect(result.hydrationReady).toBe(false);
        expect(result.stageDetails).toHaveLength(2);
        const detailA = result.stageDetails.find((d) => d.stageSlug === 'stage-a');
        const detailB = result.stageDetails.find((d) => d.stageSlug === 'stage-b');
        expect(detailA).toBeDefined();
        expect(detailB).toBeDefined();
        expect(detailA?.stageStatus).toBe('not_started');
        expect(detailA?.stagePercentage).toBe(0);
        expect(detailA?.totalSteps).toBe(1);
        expect(detailA?.completedSteps).toBe(0);
        expect(detailA?.stepsDetail).toHaveLength(1);
        expect(detailA?.stepsDetail[0].status).toBe('not_started');
        expect(detailB?.totalSteps).toBe(0);
        expect(result.currentStageSlug).toBe('stage-a');
    });

    it('returns hydrationReady true when process template and progress snapshots are present', () => {
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-a',
            steps: [unifiedStepOne],
        });
        const progressA = mockStageRunProgressSnapshot({
            stepStatuses: { step_1: 'not_started' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 1, completedSteps: 0, failedSteps: 0 },
            jobs: [],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: progressA,
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        expect(result.hydrationReady).toBe(true);
    });

    it('uses progress.progress.totalSteps from backend, not recipe.steps.length', () => {
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [unifiedStepOne],
        });
        const progressA = mockStageRunProgressSnapshot({
            stepStatuses: { step_1: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 5, completedSteps: 1, failedSteps: 0 },
            jobs: [],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: progressA,
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        const stageADetail = result.stageDetails.find((d) => d.stageSlug === 'stage-a');
        expect(stageADetail).toBeDefined();
        expect(stageADetail?.totalSteps).toBe(5);
    });

    it('uses progress.progress.completedSteps from backend, not recomputed count', () => {
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [unifiedStepOne, unifiedStepTwo],
        });
        const progressA = mockStageRunProgressSnapshot({
            stepStatuses: { step_1: 'completed', step_2: 'not_started' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 2, completedSteps: 2, failedSteps: 0 },
            jobs: [],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: progressA,
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        const stageADetail = result.stageDetails.find((d) => d.stageSlug === 'stage-a');
        expect(stageADetail).toBeDefined();
        expect(stageADetail?.completedSteps).toBe(2);
    });

    it('uses progress.progress.failedSteps from backend, not recomputed count', () => {
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [unifiedStepOne],
        });
        const progressA = mockStageRunProgressSnapshot({
            stepStatuses: { step_1: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 1, completedSteps: 1, failedSteps: 3 },
            jobs: [],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: progressA,
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        const stageADetail = result.stageDetails.find((d) => d.stageSlug === 'stage-a');
        expect(stageADetail).toBeDefined();
        expect(stageADetail?.failedSteps).toBe(3);
    });

    it('enumerates steps from progress.stepStatuses keys', () => {
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 'bx',
                    step_key: 'backend_step_x',
                    step_slug: 'bx',
                    step_name: 'backend_step_x',
                    outputs_required: [],
                }),
                mockDialecticStageRecipeStep({
                    id: 'by',
                    step_key: 'backend_step_y',
                    step_slug: 'by',
                    step_name: 'backend_step_y',
                    execution_order: 2,
                    parallel_group: 2,
                    branch_key: 'b2',
                    outputs_required: [],
                }),
            ],
        });
        const progressA = mockStageRunProgressSnapshot({
            stepStatuses: { backend_step_x: 'completed', backend_step_y: 'in_progress' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 2, completedSteps: 1, failedSteps: 0 },
            jobs: [],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: progressA,
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        const stageADetail = result.stageDetails.find((d) => d.stageSlug === 'stage-a');
        expect(stageADetail).toBeDefined();
        expect(stageADetail?.stepsDetail.length).toBe(2);
        const stepKeys = stageADetail?.stepsDetail.map((s) => s.stepKey).sort() ?? [];
        expect(stepKeys).toEqual(['backend_step_x', 'backend_step_y']);
        const stepNames = stageADetail?.stepsDetail.map((s) => s.stepName).sort() ?? [];
        expect(stepNames).toEqual(['backend_step_x', 'backend_step_y']);
    });

    it('uses recipe step names when recipe is loaded (enrichment)', () => {
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 's1',
                    step_key: 'step_1',
                    step_slug: 's1',
                    step_name: 'Display Name From Recipe',
                    outputs_required: [],
                }),
            ],
        });
        const progressA = mockStageRunProgressSnapshot({
            stepStatuses: { step_1: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
            jobs: [],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: progressA,
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        const stageADetail = result.stageDetails.find((d) => d.stageSlug === 'stage-a');
        expect(stageADetail).toBeDefined();
        expect(stageADetail?.stepsDetail[0].stepName).toBe('Display Name From Recipe');
        expect(stageADetail?.stepsDetail[0].stepKey).toBe('step_1');
    });

    it('computes completedDocumentsForStage from progress.documents entries with status completed', () => {
        const docKey1 = `doc_a${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}model-1`;
        const docKey2 = `doc_b${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}model-1`;
        const jobDocA = mockJobProgressDto({
            id: 'job-1',
            status: 'completed',
            stepKey: 'step_1',
            documentKey: 'doc_a',
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        });
        const jobDocB = mockJobProgressDto({
            id: 'job-2',
            status: 'processing',
            stepKey: 'step_1',
            documentKey: 'doc_b',
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        });
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 's1',
                    step_key: 'step_1',
                    step_slug: 's1',
                    step_name: 'Step 1',
                    outputs_required: [
                        { document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' },
                        { document_key: 'doc_b', artifact_class: 'rendered_document', file_type: 'markdown' },
                    ],
                }),
            ],
        });
        const progressA = mockStageRunProgressSnapshot({
            stepStatuses: { step_1: 'completed' },
            documents: {
                [docKey1]: mockStageRenderedDocumentDescriptor({
                    status: 'completed',
                    job_id: 'job-1',
                    latestRenderedResourceId: 'res-1',
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                }),
                [docKey2]: mockStageRenderedDocumentDescriptor({
                    status: 'generating',
                    job_id: 'job-2',
                    latestRenderedResourceId: 'res-2',
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                }),
            },
            jobProgress: {},
            jobs: [jobDocA, jobDocB],
            progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: progressA,
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        const stageADetail = result.stageDetails.find((d) => d.stageSlug === 'stage-a');
        expect(stageADetail).toBeDefined();
        expect(stageADetail?.completedDocuments).toBe(1);
    });

    it('computes totalDocumentsForStage from validMarkdownKeys size', () => {
        const docKey1 = `doc_a${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}model-1`;
        const docKey2 = `doc_b${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}model-1`;
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 's1',
                    step_key: 'step_1',
                    step_slug: 's1',
                    step_name: 'Step 1',
                    outputs_required: [
                        { document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' },
                        { document_key: 'doc_b', artifact_class: 'rendered_document', file_type: 'markdown' },
                    ],
                }),
            ],
        });
        const progressA = mockStageRunProgressSnapshot({
            stepStatuses: { step_1: 'completed' },
            documents: {
                [docKey1]: mockStageRenderedDocumentDescriptor({
                    status: 'completed',
                    job_id: 'job-1',
                    latestRenderedResourceId: 'res-1',
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                }),
                [docKey2]: mockStageRenderedDocumentDescriptor({
                    status: 'generating',
                    job_id: 'job-2',
                    latestRenderedResourceId: 'res-2',
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                }),
            },
            jobProgress: {},
            jobs: [],
            progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: progressA,
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        const stageADetail = result.stageDetails.find((d) => d.stageSlug === 'stage-a');
        expect(stageADetail).toBeDefined();
        expect(stageADetail?.totalDocuments).toBe(2);
    });

    it('2 models both complete same document → completedDocuments 1, totalDocuments 1', () => {
        const docKey = 'doc_a';
        const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;
        const composite1 = `${docKey}${sep}model-1`;
        const composite2 = `${docKey}${sep}model-2`;
        const job1 = mockJobProgressDto({
            id: 'j1',
            status: 'completed',
            stepKey: 'step_1',
            modelId: 'model-1',
            documentKey: docKey,
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        });
        const job2 = mockJobProgressDto({
            id: 'j2',
            status: 'completed',
            stepKey: 'step_1',
            modelId: 'model-2',
            documentKey: docKey,
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        });
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 's1',
                    step_key: 'step_1',
                    step_slug: 's1',
                    step_name: 'Step 1',
                    outputs_required: [{ document_key: docKey, artifact_class: 'rendered_document', file_type: 'markdown' }],
                }),
            ],
        });
        const progressA = mockStageRunProgressSnapshot({
            stepStatuses: { step_1: 'completed' },
            documents: {
                [composite1]: mockStageRenderedDocumentDescriptor({
                    status: 'completed',
                    job_id: 'j1',
                    latestRenderedResourceId: 'res-1',
                    modelId: 'model-1',
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                }),
                [composite2]: mockStageRenderedDocumentDescriptor({
                    status: 'completed',
                    job_id: 'j2',
                    latestRenderedResourceId: 'res-2',
                    modelId: 'model-2',
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                }),
            },
            jobProgress: {},
            jobs: [job1, job2],
            progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: progressA,
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        const stageADetail = result.stageDetails.find((d) => d.stageSlug === 'stage-a');
        expect(stageADetail).toBeDefined();
        expect(stageADetail?.completedDocuments).toBe(1);
        expect(stageADetail?.totalDocuments).toBe(1);
    });

    it('2 models, only 1 completes → completedDocuments 0, totalDocuments 1', () => {
        const docKey = 'doc_a';
        const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;
        const composite1 = `${docKey}${sep}model-1`;
        const composite2 = `${docKey}${sep}model-2`;
        const job1 = mockJobProgressDto({
            id: 'j1',
            status: 'completed',
            stepKey: 'step_1',
            modelId: 'model-1',
            documentKey: docKey,
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        });
        const job2 = mockJobProgressDto({
            id: 'j2',
            status: 'processing',
            stepKey: 'step_1',
            modelId: 'model-2',
            documentKey: docKey,
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        });
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 's1',
                    step_key: 'step_1',
                    step_slug: 's1',
                    step_name: 'Step 1',
                    outputs_required: [{ document_key: docKey, artifact_class: 'rendered_document', file_type: 'markdown' }],
                }),
            ],
        });
        const progressA = mockStageRunProgressSnapshot({
            stepStatuses: { step_1: 'in_progress' },
            documents: {
                [composite1]: mockStageRenderedDocumentDescriptor({
                    status: 'completed',
                    job_id: 'j1',
                    latestRenderedResourceId: 'res-1',
                    modelId: 'model-1',
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                }),
                [composite2]: mockStageRenderedDocumentDescriptor({
                    status: 'generating',
                    job_id: 'j2',
                    latestRenderedResourceId: 'res-2',
                    modelId: 'model-2',
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                }),
            },
            jobProgress: {},
            jobs: [job1, job2],
            progress: { totalSteps: 1, completedSteps: 0, failedSteps: 0 },
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: progressA,
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        const stageADetail = result.stageDetails.find((d) => d.stageSlug === 'stage-a');
        expect(stageADetail).toBeDefined();
        expect(stageADetail?.completedDocuments).toBe(0);
        expect(stageADetail?.totalDocuments).toBe(1);
    });

    it('0 jobs for a document key → document not counted as complete', () => {
        const docKey = 'doc_a';
        const recipeA: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 's1',
                    step_key: 'step_1',
                    step_slug: 's1',
                    step_name: 'Step 1',
                    outputs_required: [{ document_key: docKey, artifact_class: 'rendered_document', file_type: 'markdown' }],
                }),
            ],
        });
        const progressA = mockStageRunProgressSnapshot({
            stepStatuses: { step_1: 'not_started' },
            documents: {},
            jobProgress: {},
            jobs: [],
            progress: { totalSteps: 1, completedSteps: 0, failedSteps: 0 },
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: template,
            recipesByStageSlug: { 'stage-a': recipeA, 'stage-b': recipeB },
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: progressA,
                [progressKeyForStage('stage-b')]: progressB,
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        const stageADetail = result.stageDetails.find((d) => d.stageSlug === 'stage-a');
        expect(stageADetail).toBeDefined();
        expect(stageADetail?.totalDocuments).toBe(1);
        expect(stageADetail?.completedDocuments).toBe(0);
    });
});

describe('selectDocumentDisplayMetadata', () => {
    const stageSlug = 'thesis';

    it('returns empty map when no recipe steps exist', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: {},
        };

        const result = selectDocumentDisplayMetadata(state, 'nonexistent-stage');

        expect(result).toBeInstanceOf(Map);
        expect(result.size).toBe(0);
    });

    it('extracts display_name and description from document entries in outputs_required', () => {
        const recipe: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug,
            instanceId: 'inst-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 'step-1',
                    step_key: 'step_1',
                    step_slug: 'step-1',
                    step_name: 'Step 1',
                    branch_key: 'b1',
                    prompt_template_id: 'p1',
                    outputs_required: [
                        {
                            document_key: 'business_case',
                            artifact_class: 'rendered_document',
                            file_type: 'markdown',
                            display_name: 'Business Case',
                            description: 'A business case document.',
                        },
                    ],
                }),
            ],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: { [stageSlug]: recipe },
        };

        const result = selectDocumentDisplayMetadata(state, stageSlug);

        expect(result.size).toBe(1);
        const meta: DocumentDisplayMetadata | undefined = result.get('business_case');
        expect(meta).toBeDefined();
        expect(meta?.displayName).toBe('Business Case');
        expect(meta?.description).toBe('A business case document.');
    });

    it('falls back to title-cased document_key when display_name is absent', () => {
        const recipe: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug,
            instanceId: 'inst-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 'step-1',
                    step_key: 'step_1',
                    step_slug: 'step-1',
                    step_name: 'Step 1',
                    branch_key: 'b1',
                    prompt_template_id: 'p1',
                    outputs_required: [
                        {
                            document_key: 'feature_spec',
                            artifact_class: 'rendered_document',
                            file_type: 'markdown',
                        },
                    ],
                }),
            ],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: { [stageSlug]: recipe },
        };

        const result = selectDocumentDisplayMetadata(state, stageSlug);

        expect(result.size).toBe(1);
        const meta: DocumentDisplayMetadata | undefined = result.get('feature_spec');
        expect(meta).toBeDefined();
        expect(meta?.displayName).toBe('Feature Spec');
        expect(meta?.description).toBe('');
    });

    it('falls back to empty string when description is absent', () => {
        const recipe: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug,
            instanceId: 'inst-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 'step-1',
                    step_key: 'step_1',
                    step_slug: 'step-1',
                    step_name: 'Step 1',
                    branch_key: 'b1',
                    prompt_template_id: 'p1',
                    outputs_required: [
                        {
                            document_key: 'success_metrics',
                            artifact_class: 'rendered_document',
                            file_type: 'markdown',
                            display_name: 'Success Metrics',
                        },
                    ],
                }),
            ],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: { [stageSlug]: recipe },
        };

        const result = selectDocumentDisplayMetadata(state, stageSlug);

        expect(result.size).toBe(1);
        const meta: DocumentDisplayMetadata | undefined = result.get('success_metrics');
        expect(meta).toBeDefined();
        expect(meta?.displayName).toBe('Success Metrics');
        expect(meta?.description).toBe('');
    });

    it('ignores header_context output_type steps', () => {
        const recipe: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'header-stage',
            instanceId: 'inst-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 'step-header',
                    step_key: 'header_step',
                    step_slug: 'header-step',
                    step_name: 'Header Step',
                    branch_key: 'b1',
                    job_type: 'PLAN',
                    prompt_type: 'Planner',
                    prompt_template_id: 'p1',
                    output_type: 'header_context',
                    granularity_strategy: 'all_to_one',
                    outputs_required: [
                        {
                            document_key: 'header_doc',
                            artifact_class: 'header_context',
                            file_type: 'markdown',
                            display_name: 'Header Doc',
                            description: 'Should be excluded.',
                        },
                    ],
                }),
            ],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: { 'header-stage': recipe },
        };

        const result = selectDocumentDisplayMetadata(state, 'header-stage');

        expect(result.size).toBe(0);
    });

    it('handles string JSONB (unparsed) outputs_required', () => {
        const outputsRequired: OutputRequirement[] = [
            {
                document_key: 'technical_approach',
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                display_name: 'Technical Approach',
                description: 'Technical approach document.',
            },
        ];
        const stepWithStringOutputs: DialecticStageRecipeStep = mockDialecticStageRecipeStep({
            id: 'step-1',
            step_key: 'step_1',
            step_slug: 'step-1',
            step_name: 'Step 1',
            branch_key: 'b1',
            prompt_template_id: 'p1',
            outputs_required: outputsRequired,
        });
        const stepWithStringOutputsUntyped: DialecticStageRecipeStep = mockDialecticStageRecipeStep({
            id: 'step-1',
            step_key: 'step_1',
            step_slug: 'step-1',
            step_name: 'Step 1',
            branch_key: 'b1',
            prompt_template_id: 'p1',
            outputs_required: JSON.stringify(outputsRequired),
        });
        const recipe: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug,
            instanceId: 'inst-1',
            steps: [stepWithStringOutputsUntyped],
        });
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: { [stageSlug]: recipe },
        };

        const result = selectDocumentDisplayMetadata(state, stageSlug);

        expect(result.size).toBe(1);
        const meta: DocumentDisplayMetadata | undefined = result.get('technical_approach');
        expect(meta).toBeDefined();
        expect(meta?.displayName).toBe('Technical Approach');
        expect(meta?.description).toBe('Technical approach document.');
    });
});

