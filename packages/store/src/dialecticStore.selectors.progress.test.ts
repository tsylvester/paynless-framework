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
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';

describe('selectUnifiedProjectProgress', () => {
    const sessionId = 'session-unified';
    const iterationNumber = 1;
    const progressKeyForStage = (stageSlug: string): string =>
        `${sessionId}:${stageSlug}:${iterationNumber}`;

    const stage1ForUnified: DialecticStage = {
      id: 'stage-abc',
      slug: 'mock-stage-1',
      display_name: 'Mock Stage 1',
      description: 'First mock stage',
      created_at: new Date().toISOString(),
      default_system_prompt_id: 'sp-1',
      expected_output_template_ids: [],
      recipe_template_id: null,
      active_recipe_instance_id: null,
    };
    const stage2ForUnified: DialecticStage = {
      id: 'stage-def',
      slug: 'mock-stage-2',
      display_name: 'Mock Stage 2',
      description: 'Second mock stage',
      created_at: new Date().toISOString(),
      default_system_prompt_id: 'sp-2',
      expected_output_template_ids: [],
      recipe_template_id: null,
      active_recipe_instance_id: null,
    };
    const templateForUnified: DialecticProcessTemplate = {
      id: 'pt-1',
      name: 'Test Template',
      description: 'A test template',
      created_at: new Date().toISOString(),
      starting_stage_id: 'stage-abc',
      stages: [stage1ForUnified, stage2ForUnified],
      transitions: [
        { id: 't1', process_template_id: 'pt-1', source_stage_id: 'stage-abc', target_stage_id: 'stage-def', created_at: new Date().toISOString(), condition_description: null },
      ],
    };
    const projectBaseForUnified: DialecticProject = {
      id: 'proj-1',
      user_id: 'user1',
      project_name: 'Detailed Project',
      initial_user_prompt: 'Initial Prompt Text',
      selected_domain_id: 'domain1',
      dialectic_domains: { name: 'Tech' },
      selected_domain_overlay_id: 'overlay1',
      repo_url: null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      dialectic_sessions: [],
      resources: [],
      process_template_id: 'pt1',
      dialectic_process_templates: templateForUnified,
      isLoadingProcessTemplate: false,
      processTemplateError: null,
      contributionGenerationStatus: 'idle',
      generateContributionsError: null,
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      isSavingContributionEdit: false,
      saveContributionEditError: null,
    };

    it('returns 0% progress for new project with no completed documents', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: {},
        stageRunProgress: {},
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.overallPercentage).toBe(0);
      expect(result.completedStages).toBe(0);
      expect(result.totalStages).toBe(2);
      expect(result.projectStatus).toBe('not_started');
      expect(result.stageDetails).toBeDefined();
      expect(Array.isArray(result.stageDetails)).toBe(true);
      expect(result.stageDetails.length).toBe(result.totalStages);
    });

    it('three-step stage with one in_progress rest not_started: completedSteps 0 totalSteps 3 stagePercentage 0 stageStatus in_progress', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          { id: 's1', step_key: 'step_a', step_slug: 'step-a', step_name: 'Step A', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' }] },
          { id: 's2', step_key: 'step_b', step_slug: 'step-b', step_name: 'Step B', execution_order: 2, parallel_group: 2, branch_key: 'b2', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_b', artifact_class: 'rendered_document', file_type: 'markdown' }] },
          { id: 's3', step_key: 'step_c', step_slug: 'step-c', step_name: 'Step C', execution_order: 3, parallel_group: 3, branch_key: 'b3', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_c', artifact_class: 'rendered_document', file_type: 'markdown' }] },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { step_a: 'not_started', step_b: 'not_started', step_c: 'in_progress' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 3, failedSteps: 0 },
          },
        },
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.totalStages).toBe(2);
      expect(result.completedStages).toBe(0);
      expect(result.projectStatus).toBe('in_progress');
      expect(result.overallPercentage).toBe(0);
      const firstStage = result.stageDetails[0];
      expect(firstStage.completedSteps).toBe(0);
      expect(firstStage.totalSteps).toBe(3);
      expect(firstStage.failedSteps).toBe(0);
      expect(firstStage.stagePercentage).toBe(0);
      expect(firstStage.stageStatus).toBe('in_progress');
      expect(firstStage.stepsDetail[0].status).toBe('not_started');
      expect(firstStage.stepsDetail[1].status).toBe('not_started');
      expect(firstStage.stepsDetail[2].status).toBe('in_progress');
    });

    it('three-step stage all completed: completedSteps 3 totalSteps 3 stagePercentage 100 stageStatus completed', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          { id: 's1', step_key: 'step_a', step_slug: 'step-a', step_name: 'Step A', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' }] },
          { id: 's2', step_key: 'step_b', step_slug: 'step-b', step_name: 'Step B', execution_order: 2, parallel_group: 2, branch_key: 'b2', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_b', artifact_class: 'rendered_document', file_type: 'markdown' }] },
          { id: 's3', step_key: 'step_c', step_slug: 'step-c', step_name: 'Step C', execution_order: 3, parallel_group: 3, branch_key: 'b3', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_c', artifact_class: 'rendered_document', file_type: 'markdown' }] },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { step_a: 'completed', step_b: 'completed', step_c: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 3, totalSteps: 3, failedSteps: 0 },
          },
        },
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      const firstStage = result.stageDetails[0];
      expect(firstStage.completedSteps).toBe(3);
      expect(firstStage.totalSteps).toBe(3);
      expect(firstStage.failedSteps).toBe(0);
      expect(firstStage.stagePercentage).toBe(100);
      expect(firstStage.stageStatus).toBe('completed');
      expect(firstStage.stepsDetail[0].status).toBe('completed');
      expect(firstStage.stepsDetail[1].status).toBe('completed');
      expect(firstStage.stepsDetail[2].status).toBe('completed');
    });

    it('stagePercentage equals (completedSteps/totalSteps)*100 for multi-step stage', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          { id: 's1', step_key: 'step_a', step_slug: 'step-a', step_name: 'Step A', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' }] },
          { id: 's2', step_key: 'step_b', step_slug: 'step-b', step_name: 'Step B', execution_order: 2, parallel_group: 2, branch_key: 'b2', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_b', artifact_class: 'rendered_document', file_type: 'markdown' }] },
          { id: 's3', step_key: 'step_c', step_slug: 'step-c', step_name: 'Step C', execution_order: 3, parallel_group: 3, branch_key: 'b3', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_c', artifact_class: 'rendered_document', file_type: 'markdown' }] },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { step_a: 'completed', step_b: 'completed', step_c: 'in_progress' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 2, totalSteps: 3, failedSteps: 0 },
          },
        },
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.totalStages).toBe(2);
      expect(result.currentStageSlug).toBe('mock-stage-1');
      const firstStage = result.stageDetails[0];
      expect(firstStage.completedSteps).toBe(2);
      expect(firstStage.totalSteps).toBe(3);
      expect(firstStage.stagePercentage).toBeCloseTo((2 / 3) * 100, 1);
      expect(firstStage.stageStatus).toBe('in_progress');
      expect(firstStage.stepsDetail[0].status).toBe('completed');
      expect(firstStage.stepsDetail[1].status).toBe('completed');
      expect(firstStage.stepsDetail[2].status).toBe('in_progress');
    });

    it('overallPercentage is 50 when one stage completed and current stage has 0% (step in_progress)', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-def',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe1: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'i1',
        steps: [{ id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd1', artifact_class: 'rendered_document', file_type: 'markdown' }] }],
      };
      const recipe2: DialecticStageRecipe = {
        stageSlug: 'mock-stage-2',
        instanceId: 'i2',
        steps: [{ id: 's2', step_key: 'step_2', step_slug: 's2', step_name: 'Step 2', execution_order: 1, parallel_group: 1, branch_key: 'b2', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd2', artifact_class: 'rendered_document', file_type: 'markdown' }] }],
      };
      const key1 = progressKeyForStage('mock-stage-1');
      const key2 = progressKeyForStage('mock-stage-2');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe1, 'mock-stage-2': recipe2 },
        stageRunProgress: {
          [key1]: {
            stepStatuses: { step_1: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
          },
          [key2]: {
            stepStatuses: { step_2: 'in_progress' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
          },
        },
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.totalStages).toBe(2);
      expect(result.completedStages).toBe(1);
      expect(result.currentStageSlug).toBe('mock-stage-2');
      expect(result.overallPercentage).toBe(50);
    });

    it('returns 100% when all stages complete', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-def',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe1: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'i1',
        steps: [{ id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd1', artifact_class: 'rendered_document', file_type: 'markdown' }] }],
      };
      const recipe2: DialecticStageRecipe = {
        stageSlug: 'mock-stage-2',
        instanceId: 'i2',
        steps: [{ id: 's2', step_key: 'step_2', step_slug: 's2', step_name: 'Step 2', execution_order: 1, parallel_group: 1, branch_key: 'b2', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd2', artifact_class: 'rendered_document', file_type: 'markdown' }] }],
      };
      const key1 = progressKeyForStage('mock-stage-1');
      const key2 = progressKeyForStage('mock-stage-2');
      const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;
      const completedDoc: StageRenderedDocumentDescriptor = {
        descriptorType: 'rendered',
        status: 'completed',
        job_id: 'j1',
        latestRenderedResourceId: 'r1',
        modelId: 'model-1',
        versionHash: 'v1',
        lastRenderedResourceId: 'r1',
        lastRenderAtIso: new Date().toISOString(),
      };
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe1, 'mock-stage-2': recipe2 },
        stageRunProgress: {
          [key1]: {
            stepStatuses: { step_1: 'completed' },
            documents: { [`d1${sep}model-1`]: completedDoc },
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
          [key2]: {
            stepStatuses: { step_2: 'completed' },  
            documents: { [`d2${sep}model-1`]: { ...completedDoc, job_id: 'j2', latestRenderedResourceId: 'r2', lastRenderedResourceId: 'r2' } },
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.overallPercentage).toBe(100);
      expect(result.completedStages).toBe(2);
      expect(result.projectStatus).toBe('completed');
      expect(result.stageDetails).toBeDefined();
      expect(Array.isArray(result.stageDetails)).toBe(true);
      expect(result.stageDetails.length).toBe(result.totalStages);
    });

    it('handles multi-model steps correctly (3 models = step complete only when all 3 finish)', () => {
      const documentKey = 'doc_a';
      const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [
            { id: 'model-1', displayName: 'Model 1' },
            { id: 'model-2', displayName: 'Model 2' },
            { id: 'model-3', displayName: 'Model 3' },
        ],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [{
          id: 'step-1',
          step_key: 'doc_step',
          step_slug: 'doc-step',
          step_name: 'Doc Step',
          execution_order: 1,
          parallel_group: 1,
          branch_key: 'b1',
          job_type: 'EXECUTE',
          prompt_type: 'Turn',
          output_type: 'assembled_document_json',
          granularity_strategy: 'per_source_document',
          inputs_required: [],
          inputs_relevance: [],
          outputs_required: [{ document_key: documentKey, artifact_class: 'rendered_document', file_type: 'markdown' }],
        }],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const baseDoc: StageRenderedDocumentDescriptor = {
        descriptorType: 'rendered',
        status: 'completed',
        job_id: 'j1',
        latestRenderedResourceId: 'r1',
        modelId: 'model-1',
        versionHash: 'v1',
        lastRenderedResourceId: 'r1',
        lastRenderAtIso: new Date().toISOString(),
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [
            { id: 'model-1', displayName: 'Model 1' },
            { id: 'model-2', displayName: 'Model 2' },
            { id: 'model-3', displayName: 'Model 3' },
        ],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { doc_step: 'in_progress' },
            documents: {
              [`${documentKey}${sep}model-1`]: { ...baseDoc, descriptorType: 'rendered', status: 'completed', modelId: 'model-1' },
              [`${documentKey}${sep}model-2`]: { ...baseDoc, descriptorType: 'rendered', status: 'generating', modelId: 'model-2' },
              [`${documentKey}${sep}model-3`]: { ...baseDoc, descriptorType: 'rendered', status: 'not_started', modelId: 'model-3' },
            },
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.totalStages).toBe(2);
      expect(result.projectStatus).toBe('in_progress');
      expect(result.stageDetails).toBeDefined();
      expect(Array.isArray(result.stageDetails)).toBe(true);
      expect(result.stageDetails.length).toBe(result.totalStages);
      const firstStage = result.stageDetails[0];
      expect(firstStage).toBeDefined();
      expect(firstStage.stepsDetail).toBeDefined();
      expect(firstStage.stepsDetail.length).toBeGreaterThan(0);
      const docStep = firstStage.stepsDetail[0];
      expect(docStep.status).toBe('in_progress');
    });

    it('handles non-model steps as 1/1 (step without model call counts as complete when step completes)', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          {
            id: 'render-step',
            step_key: 'render_step',
            step_slug: 'render-step',
            step_name: 'Render Step',
            execution_order: 2,
            parallel_group: 2,
            branch_key: 'b2',
            job_type: 'RENDER',
            prompt_type: 'Turn',
            output_type: 'rendered_document',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: [{ document_key: 'out', artifact_class: 'rendered_document', file_type: 'markdown' }],
          },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { render_step: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.totalStages).toBe(2);
      expect(result.projectStatus).toBe('in_progress');
      expect(result.stageDetails).toBeDefined();
      expect(Array.isArray(result.stageDetails)).toBe(true);
      expect(result.stageDetails.length).toBe(result.totalStages);
    });

    it('mixed recipe with model and non-model steps calculates correctly', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          {
            id: 'exec-1',
            step_key: 'exec_step',
            step_slug: 'exec-step',
            step_name: 'Exec Step',
            execution_order: 1,
            parallel_group: 1,
            branch_key: 'b1',
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            output_type: 'assembled_document_json',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: [{ document_key: 'doc_x', artifact_class: 'rendered_document', file_type: 'markdown' }],
          },
          {
            id: 'render-1',
            step_key: 'render_step',
            step_slug: 'render-step',
            step_name: 'Render Step',
            execution_order: 2,
            parallel_group: 2,
            branch_key: 'b2',
            job_type: 'RENDER',
            prompt_type: 'Turn',
            output_type: 'rendered_document',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: [{ document_key: 'doc_x', artifact_class: 'rendered_document', file_type: 'markdown' }],
          },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { exec_step: 'completed', render_step: 'completed' },
            documents: {
              'doc_x': {
                descriptorType: 'rendered',
                status: 'completed',
                job_id: 'j1',
                latestRenderedResourceId: 'r1',
                modelId: 'model-1',
                versionHash: 'v1',
                lastRenderedResourceId: 'r1',
                lastRenderAtIso: new Date().toISOString(),
              },
            },
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.totalStages).toBe(2);
      expect(result.overallPercentage).toBeGreaterThanOrEqual(0);
      expect(result.overallPercentage).toBeLessThanOrEqual(100);
      expect(result.stageDetails).toBeDefined();
      expect(Array.isArray(result.stageDetails)).toBe(true);
      expect(result.stageDetails.length).toBe(result.totalStages);
    });

    it('returns failed status if any document has failed status', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          { id: 's1', step_key: 'step_a', step_slug: 'step-a', step_name: 'Step A', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' }] },
          { id: 's2', step_key: 'step_b', step_slug: 'step-b', step_name: 'Step B', execution_order: 2, parallel_group: 2, branch_key: 'b2', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_b', artifact_class: 'rendered_document', file_type: 'markdown' }] },
          { id: 's3', step_key: 'step_c', step_slug: 'step-c', step_name: 'Step C', execution_order: 3, parallel_group: 3, branch_key: 'b3', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'doc_c', artifact_class: 'rendered_document', file_type: 'markdown' }] },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { step_a: 'completed', step_b: 'failed', step_c: 'not_started' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 1, totalSteps: 3, failedSteps: 1 },
          },
        },
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.projectStatus).toBe('failed');
      expect(result.stageDetails).toBeDefined();
      expect(Array.isArray(result.stageDetails)).toBe(true);
      expect(result.stageDetails.length).toBe(result.totalStages);
      const firstStage = result.stageDetails[0];
      expect(firstStage.failedSteps).toBe(1);
      expect(firstStage.completedSteps).toBe(1);
      expect(firstStage.totalSteps).toBe(3);
      expect(firstStage.stageStatus).toBe('failed');
      expect(firstStage.stepsDetail[0].status).toBe('completed');
      expect(firstStage.stepsDetail[1].status).toBe('failed');
      expect(firstStage.stepsDetail[2].status).toBe('not_started');
    });

    it('returns in_progress status when documents are generating', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [{
          id: 's1',
          step_key: 'doc_step',
          step_slug: 'doc-step',
          step_name: 'Doc Step',
          execution_order: 1,
          parallel_group: 1,
          branch_key: 'b1',
          job_type: 'EXECUTE',
          prompt_type: 'Turn',
          output_type: 'assembled_document_json',
          granularity_strategy: 'per_source_document',
          inputs_required: [],
          inputs_relevance: [],
          outputs_required: [{ document_key: 'doc_gen', artifact_class: 'rendered_document', file_type: 'markdown' }],
        }],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { doc_step: 'in_progress' },
            documents: {
              'doc_gen': {
                descriptorType: 'rendered',
                status: 'generating',
                job_id: 'j1',
                latestRenderedResourceId: 'r1',
                modelId: 'model-1',
                versionHash: 'v1',
                lastRenderedResourceId: 'r1',
                lastRenderAtIso: new Date().toISOString(),
              },
            },
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.projectStatus).toBe('in_progress');
      expect(result.stageDetails).toBeDefined();
      expect(Array.isArray(result.stageDetails)).toBe(true);
      expect(result.stageDetails.length).toBe(result.totalStages);
    });

    it('returns not_started status for stages with no progress data', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: {},
        stageRunProgress: {},
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.projectStatus).toBe('not_started');
      expect(result.overallPercentage).toBe(0);
      expect(result.stageDetails).toBeDefined();
      expect(Array.isArray(result.stageDetails)).toBe(true);
      expect(result.stageDetails.length).toBe(result.totalStages);
    });

    it('returns stageDetails array with one entry per stage and correct StageProgressDetail shape', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          {
            id: 'step-1',
            step_key: 'doc_step',
            step_slug: 'doc-step',
            step_name: 'Doc Step',
            execution_order: 1,
            parallel_group: 1,
            branch_key: 'b1',
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            output_type: 'assembled_document_json',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: [{ document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' }],
          },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { doc_step: 'completed' },
            documents: {},
            jobProgress: {
              doc_step: { totalJobs: 2, completedJobs: 2, inProgressJobs: 0, failedJobs: 0 },
            },
            progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
          },
        },
      };

      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);

      expect(result.stageDetails).toBeDefined();
      expect(Array.isArray(result.stageDetails)).toBe(true);
      expect(result.stageDetails.length).toBe(result.totalStages);

      const statusValues: Array<UnifiedProjectProgress['projectStatus']> = ['not_started', 'in_progress', 'completed', 'failed'];
      for (let i = 0; i < result.stageDetails.length; i += 1) {
        const detail: StageProgressDetail = result.stageDetails[i];
        expect(detail).toBeDefined();
        expect(typeof detail.stageSlug).toBe('string');
        expect(detail.stageSlug.length).toBeGreaterThan(0);
        expect(typeof detail.totalSteps).toBe('number');
        expect(typeof detail.completedSteps).toBe('number');
        expect(typeof detail.failedSteps).toBe('number');
        expect(detail.completedSteps).toBeGreaterThanOrEqual(0);
        expect(detail.completedSteps).toBeLessThanOrEqual(detail.totalSteps);
        expect(typeof detail.stagePercentage).toBe('number');
        expect(detail.stagePercentage).toBeGreaterThanOrEqual(0);
        expect(detail.stagePercentage).toBeLessThanOrEqual(100);
        expect(Array.isArray(detail.stepsDetail)).toBe(true);
        expect(statusValues).toContain(detail.stageStatus);
        if (detail.stepsDetail.length > 0) {
          const stepDetail = detail.stepsDetail[0];
          expect(typeof stepDetail.stepKey).toBe('string');
          expect(typeof stepDetail.stepName).toBe('string');
          expect(statusValues).toContain(stepDetail.status);
        }
      }
    });

    it('returns correct progress when selectedModels is empty but jobs exist', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          {
            id: 'step-1',
            step_key: 'doc_step',
            step_slug: 'doc-step',
            step_name: 'Doc Step',
            execution_order: 1,
            parallel_group: 1,
            branch_key: 'b1',
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            output_type: 'assembled_document_json',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: [{ document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' }],
          },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { doc_step: 'in_progress' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      expect(result.stageDetails).toBeDefined();
      expect(result.stageDetails.length).toBeGreaterThan(0);
      const firstStage = result.stageDetails[0];
      expect(firstStage.stepsDetail.length).toBeGreaterThan(0);
      const docStep = firstStage.stepsDetail[0];
      expect(docStep.status).toBe('in_progress');
      expect(firstStage.stagePercentage).toBeGreaterThanOrEqual(0);
    });

    it('returns correct progress when selectedModels changes but job state unchanged', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          {
            id: 'step-1',
            step_key: 'doc_step',
            step_slug: 'doc-step',
            step_name: 'Doc Step',
            execution_order: 1,
            parallel_group: 1,
            branch_key: 'b1',
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            output_type: 'assembled_document_json',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: [{ document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' }],
          },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const jobProgressEntry: JobProgressEntry = {
        totalJobs: 2,
        completedJobs: 2,
        inProgressJobs: 0,
        failedJobs: 0,
      };
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const baseState: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { doc_step: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };
      const stateWithTwoModels: DialecticStateValues = { ...baseState, selectedModels: [{ id: 'model-1', displayName: 'M1' }, { id: 'model-2', displayName: 'M2' }] };
      const stateWithOneModel: DialecticStateValues = { ...baseState, selectedModels: [{ id: 'model-1', displayName: 'M1' }] };
      const result1: UnifiedProjectProgress = selectUnifiedProjectProgress(stateWithTwoModels, sessionId);
      const result2: UnifiedProjectProgress = selectUnifiedProjectProgress(stateWithOneModel, sessionId);
      const step1 = result1.stageDetails[0].stepsDetail[0];
      const step2 = result2.stageDetails[0].stepsDetail[0];
      expect(step1.status).toBe(step2.status);
      expect(step1.stepKey).toBe(step2.stepKey);
    });

    it('returns status=completed for PLAN step when stepStatus is completed', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          {
            id: 'plan-step',
            step_key: 'plan_step',
            step_slug: 'plan-step',
            step_name: 'Plan Step',
            execution_order: 1,
            parallel_group: 1,
            branch_key: 'b1',
            job_type: 'PLAN',
            prompt_type: 'Planner',
            output_type: 'header_context',
            granularity_strategy: 'all_to_one',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: [],
          },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { plan_step: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      const planStep = result.stageDetails[0].stepsDetail[0];
      expect(planStep.status).toBe('completed');
    });

    it('returns status=not_started for PLAN step when stepStatus is not_started', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          {
            id: 'plan-step',
            step_key: 'plan_step',
            step_slug: 'plan-step',
            step_name: 'Plan Step',
            execution_order: 1,
            parallel_group: 1,
            branch_key: 'b1',
            job_type: 'PLAN',
            prompt_type: 'Planner',
            output_type: 'header_context',
            granularity_strategy: 'all_to_one',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: [],
          },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { plan_step: 'not_started' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      const planStep = result.stageDetails[0].stepsDetail[0];
      expect(planStep.status).toBe('not_started');
    });

    it('returns status=in_progress for EXECUTE step when stepStatus is in_progress', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          {
            id: 'step-1',
            step_key: 'doc_step',
            step_slug: 'doc-step',
            step_name: 'Doc Step',
            execution_order: 1,
            parallel_group: 1,
            branch_key: 'b1',
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            output_type: 'assembled_document_json',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: [{ document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' }],
          },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { doc_step: 'in_progress' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      const docStep = result.stageDetails[0].stepsDetail[0];
      expect(docStep.status).toBe('in_progress');
    });

    it('overallPercentage equals (completedStages*100 + currentStagePercentage) / totalStages when current stage partial', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-def',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe1: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'i1',
        steps: [{ id: 's1', step_key: 'step_1', step_slug: 's1', step_name: 'Step 1', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd1', artifact_class: 'rendered_document', file_type: 'markdown' }] }],
      };
      const recipe2: DialecticStageRecipe = {
        stageSlug: 'mock-stage-2',
        instanceId: 'i2',
        steps: [
          { id: 's2a', step_key: 'step_2a', step_slug: 's2a', step_name: 'Step 2a', execution_order: 1, parallel_group: 1, branch_key: 'b2', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd2a', artifact_class: 'rendered_document', file_type: 'markdown' }] },
          { id: 's2b', step_key: 'step_2b', step_slug: 's2b', step_name: 'Step 2b', execution_order: 2, parallel_group: 2, branch_key: 'b2', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd2b', artifact_class: 'rendered_document', file_type: 'markdown' }] },
        ],
      };
      const key1 = progressKeyForStage('mock-stage-1');
      const key2 = progressKeyForStage('mock-stage-2');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe1, 'mock-stage-2': recipe2 },
        stageRunProgress: {
          [key1]: {
            stepStatuses: { step_1: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
          },
          [key2]: {
            stepStatuses: { step_2a: 'completed', step_2b: 'in_progress' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 1, totalSteps: 2, failedSteps: 0 },
          },
        },
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      expect(result.completedStages).toBe(1);
      expect(result.totalStages).toBe(2);
      const stage1 = result.stageDetails[0];
      const stage2 = result.stageDetails[1];
      expect(stage1.stageStatus).toBe('completed');
      expect(stage1.stagePercentage).toBe(100);
      expect(stage2.stageStatus).toBe('in_progress');
      expect(stage2.completedSteps).toBe(1);
      expect(stage2.totalSteps).toBe(2);
      expect(stage2.stagePercentage).toBe(50);
      const currentStagePct = 50;
      const expectedOverall = (1 * 100 + currentStagePct) / 2;
      expect(result.overallPercentage).toBeCloseTo(expectedOverall, 1);
    });

    it('returns status=failed for step when stepStatus is failed', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [
          { id: 's1', step_key: 'step_a', step_slug: 'step-a', step_name: 'Step A', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd1', artifact_class: 'rendered_document', file_type: 'markdown' }] },
          { id: 's2', step_key: 'step_b', step_slug: 'step-b', step_name: 'Step B', execution_order: 2, parallel_group: 2, branch_key: 'b2', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd2', artifact_class: 'rendered_document', file_type: 'markdown' }] },
          { id: 's3', step_key: 'step_c', step_slug: 'step-c', step_name: 'Step C', execution_order: 3, parallel_group: 3, branch_key: 'b3', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd3', artifact_class: 'rendered_document', file_type: 'markdown' }] },
        ],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { step_a: 'completed', step_b: 'failed', step_c: 'not_started' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 1, totalSteps: 3, failedSteps: 1 },
          },
        },
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      const firstStage = result.stageDetails[0];
      expect(firstStage.failedSteps).toBe(1);
      expect(firstStage.stageStatus).toBe('failed');
      expect(firstStage.stepsDetail[0].status).toBe('completed');
      expect(firstStage.stepsDetail[1].status).toBe('failed');
      expect(firstStage.stepsDetail[2].status).toBe('not_started');
    });

    it('returns status=in_progress for step when stepStatus is in_progress', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [{ id: 's1', step_key: 'doc_step', step_slug: 'doc-step', step_name: 'Doc Step', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd1', artifact_class: 'rendered_document', file_type: 'markdown' }] }],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { doc_step: 'in_progress' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      const docStep = result.stageDetails[0].stepsDetail[0];
      expect(docStep.status).toBe('in_progress');
    });

    it('returns status=completed for step when stepStatus is completed', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const recipe: DialecticStageRecipe = {
        stageSlug: 'mock-stage-1',
        instanceId: 'inst-1',
        steps: [{ id: 's1', step_key: 'doc_step', step_slug: 'doc-step', step_name: 'Doc Step', execution_order: 1, parallel_group: 1, branch_key: 'b1', job_type: 'EXECUTE', prompt_type: 'Turn', output_type: 'assembled_document_json', granularity_strategy: 'per_source_document', inputs_required: [], inputs_relevance: [], outputs_required: [{ document_key: 'd1', artifact_class: 'rendered_document', file_type: 'markdown' }] }],
      };
      const progressKey = progressKeyForStage('mock-stage-1');
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: { 'mock-stage-1': recipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: { doc_step: 'completed' },
            documents: {},
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        },
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      const docStep = result.stageDetails[0].stepsDetail[0];
      expect(docStep.status).toBe('completed');
    });

    it('selectUnifiedProjectProgress returns correct totalStages when currentProcessTemplate has stages', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: {},
        stageRunProgress: {},
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      expect(result.totalStages).toBe(2);
    });

    it('selectUnifiedProjectProgress returns totalStages 0 when currentProcessTemplate is null', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: null,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: {},
        stageRunProgress: {},
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      expect(result.totalStages).toBe(0);
    });

    it('selectUnifiedProjectProgress returns correct overallPercentage based on currentProcessTemplate stages', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const projectWithSession: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithSession,
        currentProcessTemplate: templateForUnified,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: {},
        stageRunProgress: {},
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      expect(result.totalStages).toBe(2);
      expect(result.overallPercentage).toBeGreaterThanOrEqual(0);
      expect(result.overallPercentage).toBeLessThanOrEqual(100);
    });

    it('selectUnifiedProjectProgress ignores project.dialectic_process_templates and uses currentProcessTemplate', () => {
      const session: DialecticSession = {
        id: sessionId,
        project_id: 'proj-1',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: 'stage-abc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const projectWithTemplate: DialecticProject = {
        ...projectBaseForUnified,
        dialectic_sessions: [session],
        dialectic_process_templates: templateForUnified,
      };
      const state: DialecticStateValues = {
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithTemplate,
        currentProcessTemplate: null,
        selectedModels: [{ id: 'model-1', displayName: 'Model 1' }],
        recipesByStageSlug: {},
        stageRunProgress: {},
      };
      const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
      expect(result.totalStages).toBe(0);
    });
  });

describe('selectStageHasUnsavedChanges', () => {
  const sessionId = 'session-unsaved-test';
  const stageSlug = 'thesis';
  const iterationNumber = 1;
  const modelId = 'model-1';
  const documentKey = 'business_case';
  const keyPrefix = `${sessionId}:${stageSlug}:${iterationNumber}:`;

  function makeContent(overrides: { isDirty?: boolean; feedbackIsDirty?: boolean }): StageDocumentContentState {
    return {
      baselineMarkdown: '',
      currentDraftMarkdown: '',
      isDirty: overrides.isDirty ?? false,
      isLoading: false,
      error: null,
      lastBaselineVersion: null,
      pendingDiff: null,
      lastAppliedVersionHash: null,
      sourceContributionId: null,
      feedbackDraftMarkdown: undefined,
      feedbackIsDirty: overrides.feedbackIsDirty ?? false,
      resourceType: null,
    };
  }

  it('returns { hasUnsavedEdits: false, hasUnsavedFeedback: false } when stageDocumentContent is empty', () => {
    const state: DialecticStateValues = {
      ...initialDialecticStateValues,
      stageDocumentContent: {},
    };
    const result = selectStageHasUnsavedChanges(state, sessionId, stageSlug, iterationNumber);
    expect(result).toEqual({ hasUnsavedEdits: false, hasUnsavedFeedback: false });
  });

  it('returns { hasUnsavedEdits: true, hasUnsavedFeedback: false } when one document has isDirty: true and feedbackIsDirty: false', () => {
    const compositeKey = `${keyPrefix}${modelId}:${documentKey}`;
    const state: DialecticStateValues = {
      ...initialDialecticStateValues,
      stageDocumentContent: {
        [compositeKey]: makeContent({ isDirty: true, feedbackIsDirty: false }),
      },
    };
    const result = selectStageHasUnsavedChanges(state, sessionId, stageSlug, iterationNumber);
    expect(result).toEqual({ hasUnsavedEdits: true, hasUnsavedFeedback: false });
  });

  it('returns { hasUnsavedEdits: false, hasUnsavedFeedback: true } when one document has isDirty: false and feedbackIsDirty: true', () => {
    const compositeKey = `${keyPrefix}${modelId}:${documentKey}`;
    const state: DialecticStateValues = {
      ...initialDialecticStateValues,
      stageDocumentContent: {
        [compositeKey]: makeContent({ isDirty: false, feedbackIsDirty: true }),
      },
    };
    const result = selectStageHasUnsavedChanges(state, sessionId, stageSlug, iterationNumber);
    expect(result).toEqual({ hasUnsavedEdits: false, hasUnsavedFeedback: true });
  });

  it('returns { hasUnsavedEdits: true, hasUnsavedFeedback: true } when documents have mixed dirty states', () => {
    const key1 = `${keyPrefix}model-a:doc1`;
    const key2 = `${keyPrefix}model-b:doc2`;
    const state: DialecticStateValues = {
      ...initialDialecticStateValues,
      stageDocumentContent: {
        [key1]: makeContent({ isDirty: true, feedbackIsDirty: false }),
        [key2]: makeContent({ isDirty: false, feedbackIsDirty: true }),
      },
    };
    const result = selectStageHasUnsavedChanges(state, sessionId, stageSlug, iterationNumber);
    expect(result).toEqual({ hasUnsavedEdits: true, hasUnsavedFeedback: true });
  });

  it('ignores documents from different sessions (key prefix mismatch)', () => {
    const otherSessionId = 'other-session';
    const compositeKey = `${otherSessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;
    const state: DialecticStateValues = {
      ...initialDialecticStateValues,
      stageDocumentContent: {
        [compositeKey]: makeContent({ isDirty: true, feedbackIsDirty: true }),
      },
    };
    const result = selectStageHasUnsavedChanges(state, sessionId, stageSlug, iterationNumber);
    expect(result).toEqual({ hasUnsavedEdits: false, hasUnsavedFeedback: false });
  });

  it('ignores documents from different stages (key prefix mismatch)', () => {
    const otherStageSlug = 'antithesis';
    const compositeKey = `${sessionId}:${otherStageSlug}:${iterationNumber}:${modelId}:${documentKey}`;
    const state: DialecticStateValues = {
      ...initialDialecticStateValues,
      stageDocumentContent: {
        [compositeKey]: makeContent({ isDirty: true, feedbackIsDirty: true }),
      },
    };
    const result = selectStageHasUnsavedChanges(state, sessionId, stageSlug, iterationNumber);
    expect(result).toEqual({ hasUnsavedEdits: false, hasUnsavedFeedback: false });
  });

  it('ignores documents from different iterations (key prefix mismatch)', () => {
    const otherIteration = 2;
    const compositeKey = `${sessionId}:${stageSlug}:${otherIteration}:${modelId}:${documentKey}`;
    const state: DialecticStateValues = {
      ...initialDialecticStateValues,
      stageDocumentContent: {
        [compositeKey]: makeContent({ isDirty: true, feedbackIsDirty: true }),
      },
    };
    const result = selectStageHasUnsavedChanges(state, sessionId, stageSlug, iterationNumber);
    expect(result).toEqual({ hasUnsavedEdits: false, hasUnsavedFeedback: false });
  });
});

