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
    selectUnifiedProjectProgress,
    selectStageHasUnsavedChanges,
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
    UnifiedProjectProgress,
    SelectedModels,
    JobProgressEntry,
} from '@paynless/types';

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
  });

