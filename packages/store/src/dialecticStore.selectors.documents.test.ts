import { describe, it, expect } from 'vitest';
import {
    selectDomains,
    selectIsLoadingDomains,
    selectDomainsError,
    selectSelectedDomain,
    selectSelectedStageAssociation,
    selectAvailableDomainOverlays,
    selectIsLoadingDomainOverlays,
    selectDomainOverlaysError,
    selectOverlay,
    selectSelectedDomainOverlayId,
    selectDialecticProjects,
    selectIsLoadingProjects,
    selectProjectsError,
    selectCurrentProjectDetail,
    selectIsLoadingProjectDetail,
    selectProjectDetailError,
    selectModelCatalog,
    selectIsLoadingModelCatalog,
    selectModelCatalogError,
    selectIsCreatingProject,
    selectCreateProjectError,
    selectIsStartingSession,
    selectStartSessionError,
    selectContributionContentCache,
    selectCurrentProcessTemplate,
    selectIsLoadingProcessTemplate,
    selectProcessTemplateError,
    selectCurrentProjectInitialPrompt,
    selectCurrentProjectSessions,
    selectIsUpdatingProjectPrompt,
    selectCurrentProjectId,
    selectSelectedModels,
    selectContributionById,
    selectSaveContributionEditError,
    selectActiveContextProjectId,
    selectActiveContextSessionId,
    selectActiveContextStage,
    selectIsStageReadyForSessionIteration,
    selectContributionGenerationStatus,
    selectGenerateContributionsError,
    selectAllContributionsFromCurrentProject,
    selectSessionById,
    selectStageById,
    selectFeedbackForStageIteration,
    selectSortedStages,
    selectStageProgressSummary,
    selectStageDocumentResource,
    selectEditedDocumentByKey,
    selectValidMarkdownDocumentKeys,
    selectDocumentDisplayMetadata,
    selectUnifiedProjectProgress,
    selectStageHasUnsavedChanges,
    selectStageDocumentChecklist,
} from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import type {
    DialecticStateValues,
    ApiError,
    DomainOverlayDescriptor,
    DialecticProject,
    AIModelCatalogEntry,
    DialecticDomain,
    DialecticStage,
    DialecticProcessTemplate,
    DialecticSession,
    DialecticContribution,
    DialecticProjectResource,
    DialecticFeedback,
    DialecticStageTransition,
    DialecticStageRecipe,
    DialecticStageRecipeStep,
    AssembledPrompt,
    StageDocumentContentState,
    StageRenderedDocumentDescriptor,
    StageProgressDetail,
    StageRunProgressSnapshot,
    UnifiedProjectProgress,
    SelectedModels,
    JobProgressEntry,
    JobProgressDto,
    DocumentDisplayMetadata,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';

describe('selectStageDocumentResource and selectEditedDocumentByKey', () => {
    const sessionId = 'session-resource-test';
    const stageSlug = 'thesis';
    const iterationNumber = 1;
    const modelId = 'model-test';
    const documentKey = 'business_case';
    const compositeKey = `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;

    it('should return document resource content from stageDocumentContent with baselineMarkdown, timestamps, and resource id', () => {
        const testContent: StageDocumentContentState = {
            baselineMarkdown: 'Edited document content from resource',
            currentDraftMarkdown: 'Edited document content from resource',
            isDirty: false,
            isLoading: false,
            error: null,
            lastBaselineVersion: {
                resourceId: 'resource-123',
                versionHash: 'hash-abc',
                updatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
            },
            pendingDiff: null,
            lastAppliedVersionHash: 'hash-abc',
            sourceContributionId: null,
            feedbackDraftMarkdown: undefined,
            feedbackIsDirty: false,
            resourceType: null,
        };

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
        const testContent: StageDocumentContentState = {
            baselineMarkdown: 'Edited content from composite key lookup',
            currentDraftMarkdown: 'Edited content from composite key lookup',
            isDirty: false,
            isLoading: false,
            error: null,
            lastBaselineVersion: {
                resourceId: 'resource-456',
                versionHash: 'hash-def',
                updatedAt: new Date('2024-01-02T00:00:00Z').toISOString(),
            },
            pendingDiff: null,
            lastAppliedVersionHash: 'hash-def',
            sourceContributionId: null,
            feedbackDraftMarkdown: undefined,
            feedbackIsDirty: false,
            resourceType: null,
        };

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
        
        const testContent: StageDocumentContentState = {
            baselineMarkdown: 'Resource-based content - authoritative source',
            currentDraftMarkdown: 'Resource-based content - authoritative source',
            isDirty: false,
            isLoading: false,
            error: null,
            lastBaselineVersion: {
                resourceId: 'resource-789',
                versionHash: 'hash-ghi',
                updatedAt: new Date('2024-01-03T00:00:00Z').toISOString(),
            },
            pendingDiff: null,
            lastAppliedVersionHash: 'hash-ghi',
            sourceContributionId: null,
            feedbackDraftMarkdown: undefined,
            feedbackIsDirty: false,
            resourceType: null,
        };

        const staleContribution: DialecticContribution = {
            id: 'contrib-stale',
            session_id: sessionId,
            stage: stageSlug,
            iteration_number: iterationNumber,
            contribution_type: documentKey,
            is_latest_edit: true,
            edit_version: 1,
            created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
            updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
            user_id: null,
            model_id: modelId,
            model_name: null,
            prompt_template_id_used: null,
            seed_prompt_url: null,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: null,
            tokens_used_output: null,
            processing_time_ms: null,
            error: null,
            citations: null,
            file_name: null,
            storage_bucket: null,
            storage_path: null,
            size_bytes: null,
            mime_type: null,
        };

        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            stageDocumentContent: {
                [compositeKey]: testContent,
            },
            currentProjectDetail: {
                id: 'proj-test',
                user_id: 'user-1',
                project_name: 'Test Project',
                initial_user_prompt: 'Test prompt',
                selected_domain_id: 'dom-1',
                dialectic_domains: { name: 'Test Domain' },
                selected_domain_overlay_id: null,
                repo_url: null,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                dialectic_sessions: [{
                    id: sessionId,
                    project_id: 'proj-test',
                    session_description: 'Test session',
                    iteration_count: iterationNumber,
                    selected_models: [{ id: modelId, displayName: modelId }],
                    status: 'active',
                    associated_chat_id: null,
                    current_stage_id: 'stage-1',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    user_input_reference_url: null,
                    dialectic_contributions: [staleContribution],
                    feedback: [],
                }],
                resources: [],
                process_template_id: null,
                dialectic_process_templates: null,
                isLoadingProcessTemplate: false,
                processTemplateError: null,
                contributionGenerationStatus: 'idle',
                generateContributionsError: null,
                isSubmittingStageResponses: false,
                submitStageResponsesError: null,
                isSavingContributionEdit: false,
                saveContributionEditError: null,
            },
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
        const testContent: StageDocumentContentState = {
            baselineMarkdown: 'Original baseline content',
            currentDraftMarkdown: 'Modified draft content',
            isDirty: true,
            isLoading: false,
            error: null,
            lastBaselineVersion: {
                resourceId: 'resource-dirty',
                versionHash: 'hash-dirty',
                updatedAt: new Date('2024-01-04T00:00:00Z').toISOString(),
            },
            pendingDiff: null,
            lastAppliedVersionHash: 'hash-dirty',
            sourceContributionId: null,
            feedbackDraftMarkdown: undefined,
            feedbackIsDirty: false,
            resourceType: null,
        };

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
    const stageWithMixedOutputs: DialecticStageRecipe = {
        stageSlug,
        instanceId: 'instance-mixed',
        steps: [
            {
                id: 'step-markdown-1',
                step_key: 'markdown_step_1',
                step_slug: 'markdown-step-1',
                step_name: 'Markdown Step 1',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'branch-1',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'prompt-1',
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
                inputs_required: [],
                inputs_relevance: [],
                outputs_required: [
                    {
                        document_key: 'draft_document_markdown',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                    },
                ],
            },
            {
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
                inputs_required: [],
                inputs_relevance: [],
                outputs_required: [
                    {
                        document_key: 'HeaderContext',
                        artifact_class: 'header_context',
                        file_type: 'json',
                    },
                ],
            },
            {
                id: 'step-markdown-2',
                step_key: 'markdown_step_2',
                step_slug: 'markdown-step-2',
                step_name: 'Markdown Step 2',
                execution_order: 3,
                parallel_group: 3,
                branch_key: 'branch-3',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'prompt-3',
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
                inputs_required: [],
                inputs_relevance: [],
                outputs_required: [
                    {
                        document_key: 'business_case_markdown',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                    },
                ],
            },
        ],
        edges: [],
    };

    const stageWithNoMarkdownOutputs: DialecticStageRecipe = {
        stageSlug: 'no-markdown',
        instanceId: 'instance-no-markdown',
        steps: [
            {
                id: 'step-json-only',
                step_key: 'json_only_step',
                step_slug: 'json-only-step',
                step_name: 'JSON Only Step',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'branch-1',
                job_type: 'PLAN',
                prompt_type: 'Planner',
                prompt_template_id: 'prompt-1',
                output_type: 'header_context',
                granularity_strategy: 'all_to_one',
                inputs_required: [],
                inputs_relevance: [],
                outputs_required: [
                    {
                        document_key: 'HeaderContext',
                        artifact_class: 'header_context',
                        file_type: 'json',
                    },
                ],
            },
        ],
        edges: [],
    };

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
        const stageWithNoSteps: DialecticStageRecipe = {
            stageSlug: 'empty-stage',
            instanceId: 'instance-empty',
            steps: [],
            edges: [],
        };

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
        const stageWithNoOutputs: DialecticStageRecipe = {
            stageSlug: 'no-outputs-stage',
            instanceId: 'instance-no-outputs',
            steps: [
                {
                    id: 'step-no-outputs',
                    step_key: 'no_outputs_step',
                    step_slug: 'no-outputs-step',
                    step_name: 'No Outputs Step',
                    execution_order: 1,
                    parallel_group: 1,
                    branch_key: 'branch-1',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-1',
                    output_type: 'assembled_document_json',
                    granularity_strategy: 'per_source_document',
                    inputs_required: [],
                    inputs_relevance: [],
                    outputs_required: undefined,
                },
            ],
            edges: [],
        };

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
        const stageWithHeaderContextMarkdown: DialecticStageRecipe = {
            stageSlug: 'header-markdown-stage',
            instanceId: 'instance-header-markdown',
            edges: [],
            steps: [
                {
                    id: 'step-header-md',
                    step_key: 'header_context_step',
                    step_slug: 'header-context-step',
                    step_name: 'Header Context Step',
                    execution_order: 1,
                    parallel_group: 1,
                    branch_key: 'branch-1',
                    job_type: 'PLAN',
                    prompt_type: 'Planner',
                    prompt_template_id: 'prompt-1',
                    output_type: 'header_context',
                    granularity_strategy: 'all_to_one',
                    inputs_required: [],
                    inputs_relevance: [],
                    outputs_required: [
                        {
                            document_key: 'header_context_doc',
                            artifact_class: 'header_context',
                            file_type: 'markdown',
                        },
                    ],
                },
                {
                    id: 'step-rendered',
                    step_key: 'rendered_step',
                    step_slug: 'rendered-step',
                    step_name: 'Rendered Step',
                    execution_order: 2,
                    parallel_group: 2,
                    branch_key: 'branch-2',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-2',
                    output_type: 'rendered_document',
                    granularity_strategy: 'per_source_document',
                    inputs_required: [],
                    inputs_relevance: [],
                    outputs_required: [
                        {
                            document_key: 'business_case',
                            artifact_class: 'rendered_document',
                            file_type: 'markdown',
                        },
                    ],
                },
                {
                    id: 'step-assembled',
                    step_key: 'assembled_step',
                    step_slug: 'assembled-step',
                    step_name: 'Assembled Step',
                    execution_order: 3,
                    parallel_group: 3,
                    branch_key: 'branch-3',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-3',
                    output_type: 'assembled_document_json',
                    granularity_strategy: 'per_source_document',
                    inputs_required: [],
                    inputs_relevance: [],
                    outputs_required: [
                        {
                            document_key: 'feature_spec',
                            artifact_class: 'rendered_document',
                            file_type: 'markdown',
                        },
                    ],
                },
            ],
        };

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

        const stageWithHeaderContextMarkdown: DialecticStageRecipe = {
            stageSlug: 'header-markdown-stage',
            instanceId: 'instance-header-markdown',
            edges: [],
            steps: [
                {
                    id: 'step-header-md',
                    step_key: 'header_context_step',
                    step_slug: 'header-context-step',
                    step_name: 'Header Context Step',
                    execution_order: 1,
                    parallel_group: 1,
                    branch_key: 'branch-1',
                    job_type: 'PLAN',
                    prompt_type: 'Planner',
                    prompt_template_id: 'prompt-1',
                    output_type: 'header_context',
                    granularity_strategy: 'all_to_one',
                    inputs_required: [],
                    inputs_relevance: [],
                    outputs_required: [
                        {
                            document_key: 'header_context_doc',
                            artifact_class: 'header_context',
                            file_type: 'markdown',
                        },
                    ],
                },
                {
                    id: 'step-rendered',
                    step_key: 'rendered_step',
                    step_slug: 'rendered-step',
                    step_name: 'Rendered Step',
                    execution_order: 2,
                    parallel_group: 2,
                    branch_key: 'branch-2',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-2',
                    output_type: 'rendered_document',
                    granularity_strategy: 'per_source_document',
                    inputs_required: [],
                    inputs_relevance: [],
                    outputs_required: [
                        {
                            document_key: 'business_case',
                            artifact_class: 'rendered_document',
                            file_type: 'markdown',
                        },
                    ],
                },
            ],
        };

        const renderedDescriptor: StageRenderedDocumentDescriptor = {
            descriptorType: 'rendered',
            status: 'completed',
            job_id: 'job-1',
            latestRenderedResourceId: 'res-1',
            modelId,
            versionHash: 'hash-1',
            lastRenderedResourceId: 'res-1',
            lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            stepKey: 'rendered_step',
        };

        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: {
                [stageSlug]: stageWithHeaderContextMarkdown,
            },
            stageRunProgress: {
                [progressKey]: {
                    stepStatuses: { rendered_step: 'completed', header_context_step: 'completed' },
                    documents: {
                        [`business_case${sep}${modelId}`]: renderedDescriptor,
                        [`header_context_doc${sep}${modelId}`]: {
                            ...renderedDescriptor,
                            job_id: 'job-2',
                            latestRenderedResourceId: 'res-2',
                        },
                    },
                    jobProgress: {},
                    progress: { totalSteps: 2, completedSteps: 2, failedSteps: 0 },
                    jobs: [],
                },
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

    const stageA: DialecticStage = {
        id: 'stage-a',
        slug: 'stage-a',
        display_name: 'Stage A',
        description: '',
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
    };
    const stageB: DialecticStage = {
        id: 'stage-b',
        slug: 'stage-b',
        display_name: 'Stage B',
        description: '',
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
    };
    const template: DialecticProcessTemplate = {
        id: 'pt-1',
        name: 'Test Template',
        description: '',
        created_at: new Date().toISOString(),
        starting_stage_id: 'stage-a',
        stages: [stageA, stageB],
        transitions: [
            { id: 't1', process_template_id: 'pt-1', source_stage_id: 'stage-a', target_stage_id: 'stage-b', created_at: new Date().toISOString(), condition_description: null },
        ],
    };
    const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-a',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const projectWithSession: DialecticProject = {
        id: 'proj-1',
        user_id: 'user1',
        project_name: 'Project',
        initial_user_prompt: null,
        selected_domain_id: 'dom1',
        dialectic_domains: { name: 'Domain' },
        selected_domain_overlay_id: null,
        repo_url: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dialectic_sessions: [session],
        resources: [],
        process_template_id: 'pt1',
        dialectic_process_templates: template,
        isLoadingProcessTemplate: false,
        processTemplateError: null,
        contributionGenerationStatus: 'idle',
        generateContributionsError: null,
        isSubmittingStageResponses: false,
        submitStageResponsesError: null,
        isSavingContributionEdit: false,
        saveContributionEditError: null,
    };

    const recipeB: DialecticStageRecipe = {
        stageSlug: 'stage-b',
        instanceId: 'inst-b',
        steps: [],
        edges: [],
    };
    const progressB: StageRunProgressSnapshot = {
        stepStatuses: {},
        documents: {},
        jobProgress: {},
        progress: { totalSteps: 0, completedSteps: 0, failedSteps: 0 },
        jobs: [],
    };

    it('returns hydrationReady false when currentProcessTemplate is null', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithSession,
            currentProcessTemplate: null,
            stageRunProgress: {
                [progressKeyForStage('stage-a')]: {
                    stepStatuses: { step_1: 'completed' },
                    documents: {},
                    jobProgress: {},
                    progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
                    jobs: [],
                },
            },
        };
        const result = selectUnifiedProjectProgress(state, sessionId);
        expect(result.hydrationReady).toBe(false);
    });

    it('returns result with hydrationReady false and synthetic not_started for missing stage (partial progress / renavigation)', () => {
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-a',
            steps: [{ id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [] }],
            edges: [],
        };
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
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-a',
            steps: [{ id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [] }],
            edges: [],
        };
        const progressA: StageRunProgressSnapshot = {
            stepStatuses: { step_1: 'not_started' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 1, completedSteps: 0, failedSteps: 0 },
            jobs: [],
        };
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
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                { id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [] },
            ],
            edges: [],
        };
        const progressA: StageRunProgressSnapshot = {
            stepStatuses: { step_1: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 5, completedSteps: 1, failedSteps: 0 },
            jobs: [],
        };
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
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                { id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [] },
                { id: 's2', step_key: 'step_2', step_slug: 's2', step_name: 'Step 2', execution_order: 2, parallel_group: 2, branch_key: 'b2', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [] },
            ],
            edges: [],
        };
        const progressA: StageRunProgressSnapshot = {
            stepStatuses: { step_1: 'completed', step_2: 'not_started' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 2, completedSteps: 2, failedSteps: 0 },
            jobs: [],
        };
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
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                { id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [] },
            ],
            edges: [],
        };
        const progressA: StageRunProgressSnapshot = {
            stepStatuses: { step_1: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 1, completedSteps: 1, failedSteps: 3 },
            jobs: [],
        };
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
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                { id: 'bx', step_key: 'backend_step_x', step_slug: 'bx', step_name: 'backend_step_x', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [] },
                { id: 'by', step_key: 'backend_step_y', step_slug: 'by', step_name: 'backend_step_y', execution_order: 2, parallel_group: 2, branch_key: 'b2', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [] },
            ],
            edges: [],
        };
        const progressA: StageRunProgressSnapshot = {
            stepStatuses: { backend_step_x: 'completed', backend_step_y: 'in_progress' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 2, completedSteps: 1, failedSteps: 0 },
            jobs: [],
        };
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
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                { id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Display Name From Recipe', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [] },
            ],
            edges: [],
        };
        const progressA: StageRunProgressSnapshot = {
            stepStatuses: { step_1: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
            jobs: [],
        };
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
        const jobDocA: JobProgressDto = {
            id: 'job-1',
            status: 'completed',
            jobType: 'EXECUTE',
            stepKey: 'step_1',
            modelId: 'model-1',
            documentKey: 'doc_a',
            parentJobId: null,
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        };
        const jobDocB: JobProgressDto = {
            id: 'job-2',
            status: 'processing',
            jobType: 'EXECUTE',
            stepKey: 'step_1',
            modelId: 'model-1',
            documentKey: 'doc_b',
            parentJobId: null,
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        };
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                { id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' }, { document_key: 'doc_b', artifact_class: 'rendered_document', file_type: 'markdown' }] },
            ],
            edges: [],
        };
        const progressA: StageRunProgressSnapshot = {
            stepStatuses: { step_1: 'completed' },
            documents: {
                [docKey1]: {
                    descriptorType: 'rendered',
                    status: 'completed',
                    job_id: 'job-1',
                    latestRenderedResourceId: 'res-1',
                    modelId: 'model-1',
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                    lastRenderAtIso: new Date().toISOString(),
                },
                [docKey2]: {
                    descriptorType: 'rendered',
                    status: 'generating',
                    job_id: 'job-2',
                    latestRenderedResourceId: 'res-2',
                    modelId: 'model-1',
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                    lastRenderAtIso: new Date().toISOString(),
                },
            },
            jobProgress: {},
            jobs: [jobDocA, jobDocB],
            progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
        };
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
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                { id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' }, { document_key: 'doc_b', artifact_class: 'rendered_document', file_type: 'markdown' }] },
            ],
            edges: [],
        };
        const progressA: StageRunProgressSnapshot = {
            stepStatuses: { step_1: 'completed' },
            documents: {
                [docKey1]: {
                    descriptorType: 'rendered',
                    status: 'completed',
                    job_id: 'job-1',
                    latestRenderedResourceId: 'res-1',
                    modelId: 'model-1',
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                    lastRenderAtIso: new Date().toISOString(),
                },
                [docKey2]: {
                    descriptorType: 'rendered',
                    status: 'generating',
                    job_id: 'job-2',
                    latestRenderedResourceId: 'res-2',
                    modelId: 'model-1',
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                    lastRenderAtIso: new Date().toISOString(),
                },
            },
            jobProgress: {},
            jobs: [],
            progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
        };
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
        const job1: JobProgressDto = {
            id: 'j1',
            status: 'completed',
            jobType: 'EXECUTE',
            stepKey: 'step_1',
            modelId: 'model-1',
            documentKey: docKey,
            parentJobId: null,
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        };
        const job2: JobProgressDto = {
            id: 'j2',
            status: 'completed',
            jobType: 'EXECUTE',
            stepKey: 'step_1',
            modelId: 'model-2',
            documentKey: docKey,
            parentJobId: null,
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        };
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                { id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: docKey, artifact_class: 'rendered_document', file_type: 'markdown' }] },
            ],
            edges: [],
        };
        const progressA: StageRunProgressSnapshot = {
            stepStatuses: { step_1: 'completed' },
            documents: {
                [composite1]: {
                    descriptorType: 'rendered',
                    status: 'completed',
                    job_id: 'j1',
                    latestRenderedResourceId: 'res-1',
                    modelId: 'model-1',
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                    lastRenderAtIso: new Date().toISOString(),
                },
                [composite2]: {
                    descriptorType: 'rendered',
                    status: 'completed',
                    job_id: 'j2',
                    latestRenderedResourceId: 'res-2',
                    modelId: 'model-2',
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                    lastRenderAtIso: new Date().toISOString(),
                },
            },
            jobProgress: {},
            jobs: [job1, job2],
            progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
        };
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
        const job1: JobProgressDto = {
            id: 'j1',
            status: 'completed',
            jobType: 'EXECUTE',
            stepKey: 'step_1',
            modelId: 'model-1',
            documentKey: docKey,
            parentJobId: null,
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        };
        const job2: JobProgressDto = {
            id: 'j2',
            status: 'processing',
            jobType: 'EXECUTE',
            stepKey: 'step_1',
            modelId: 'model-2',
            documentKey: docKey,
            parentJobId: null,
            createdAt: '',
            startedAt: null,
            completedAt: null,
            modelName: null,
        };
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                { id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: docKey, artifact_class: 'rendered_document', file_type: 'markdown' }] },
            ],
            edges: [],
        };
        const progressA: StageRunProgressSnapshot = {
            stepStatuses: { step_1: 'in_progress' },
            documents: {
                [composite1]: {
                    descriptorType: 'rendered',
                    status: 'completed',
                    job_id: 'j1',
                    latestRenderedResourceId: 'res-1',
                    modelId: 'model-1',
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                    lastRenderAtIso: new Date().toISOString(),
                },
                [composite2]: {
                    descriptorType: 'rendered',
                    status: 'generating',
                    job_id: 'j2',
                    latestRenderedResourceId: 'res-2',
                    modelId: 'model-2',
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                    lastRenderAtIso: new Date().toISOString(),
                },
            },
            jobProgress: {},
            jobs: [job1, job2],
            progress: { totalSteps: 1, completedSteps: 0, failedSteps: 0 },
        };
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
        const recipeA: DialecticStageRecipe = {
            stageSlug: 'stage-a',
            instanceId: 'inst-1',
            steps: [
                { id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: docKey, artifact_class: 'rendered_document', file_type: 'markdown' }] },
            ],
            edges: [],
        };
        const progressA: StageRunProgressSnapshot = {
            stepStatuses: { step_1: 'not_started' },
            documents: {},
            jobProgress: {},
            jobs: [],
            progress: { totalSteps: 1, completedSteps: 0, failedSteps: 0 },
        };
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
        const steps: DialecticStageRecipeStep[] = [
            {
                id: 'step-1',
                step_key: 'step_1',
                step_slug: 'step-1',
                step_name: 'Step 1',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'b1',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'p1',
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
                inputs_required: [],
                inputs_relevance: [],
                outputs_required: [
                    {
                        document_key: 'business_case',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                        display_name: 'Business Case',
                        description: 'A business case document.',
                    },
                ],
            },
        ];
        const recipe: DialecticStageRecipe = {
            stageSlug,
            instanceId: 'inst-1',
            steps,
            edges: [],
        };
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
        const steps: DialecticStageRecipeStep[] = [
            {
                id: 'step-1',
                step_key: 'step_1',
                step_slug: 'step-1',
                step_name: 'Step 1',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'b1',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'p1',
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
                inputs_required: [],
                inputs_relevance: [],
                outputs_required: [
                    {
                        document_key: 'feature_spec',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                    },
                ],
            },
        ];
        const recipe: DialecticStageRecipe = {
            stageSlug,
            instanceId: 'inst-1',
            steps,
            edges: [],
        };
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
        const steps: DialecticStageRecipeStep[] = [
            {
                id: 'step-1',
                step_key: 'step_1',
                step_slug: 'step-1',
                step_name: 'Step 1',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'b1',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'p1',
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
                inputs_required: [],
                inputs_relevance: [],
                outputs_required: [
                    {
                        document_key: 'success_metrics',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                        display_name: 'Success Metrics',
                    },
                ],
            },
        ];
        const recipe: DialecticStageRecipe = {
            stageSlug,
            instanceId: 'inst-1',
            steps,
            edges: [],
        };
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
        const steps: DialecticStageRecipeStep[] = [
            {
                id: 'step-header',
                step_key: 'header_step',
                step_slug: 'header-step',
                step_name: 'Header Step',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'b1',
                job_type: 'PLAN',
                prompt_type: 'Planner',
                prompt_template_id: 'p1',
                output_type: 'header_context',
                granularity_strategy: 'all_to_one',
                inputs_required: [],
                inputs_relevance: [],
                outputs_required: [
                    {
                        document_key: 'header_doc',
                        artifact_class: 'header_context',
                        file_type: 'markdown',
                        display_name: 'Header Doc',
                        description: 'Should be excluded.',
                    },
                ],
            },
        ];
        const recipe: DialecticStageRecipe = {
            stageSlug: 'header-stage',
            instanceId: 'inst-1',
            steps,
            edges: [],
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            recipesByStageSlug: { 'header-stage': recipe },
        };

        const result = selectDocumentDisplayMetadata(state, 'header-stage');

        expect(result.size).toBe(0);
    });

    it('handles string JSONB (unparsed) outputs_required', () => {
        const stepWithStringOutputs: DialecticStageRecipeStep = {
            id: 'step-1',
            step_key: 'step_1',
            step_slug: 'step-1',
            step_name: 'Step 1',
            execution_order: 1,
            parallel_group: 1,
            branch_key: 'b1',
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            prompt_template_id: 'p1',
            output_type: 'assembled_document_json',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: [
                {
                    document_key: 'technical_approach',
                    artifact_class: 'rendered_document',
                    file_type: 'markdown',
                    display_name: 'Technical Approach',
                    description: 'Technical approach document.',
                },
            ],
        };
        const stepWithStringOutputsUntyped: DialecticStageRecipeStep = {
            ...stepWithStringOutputs,
            outputs_required: JSON.stringify(stepWithStringOutputs.outputs_required),
        };
        const recipe: DialecticStageRecipe = {
            stageSlug,
            instanceId: 'inst-1',
            steps: [stepWithStringOutputsUntyped],
            edges: [],
        };
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

