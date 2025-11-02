import { describe, it, expect } from 'vitest';
import type {
  DialecticContribution,
  DialecticFeedback,
  DialecticProcessTemplate,
  DialecticProject,
  DialecticProjectResource,
  DialecticSession,
  DialecticStage,
  DialecticStageRecipe,
  DialecticStageRecipeStep,
  DialecticStateValues,
} from '@paynless/types';
import { initialDialecticStateValues } from './dialecticStore';
import {
  selectStageRecipe,
  selectStepList,
  selectStageRunProgress,
  selectStepStatus,
  selectDocumentsForStageRun,
  selectDocumentStatus,
  selectLatestRenderedRef,
  selectIsStageReadyForSessionIteration,
} from './dialecticStore.selectors';

describe('Selectors - Recipes', () => {
  const stageSlug = 'synthesis';

  const stepA: DialecticStageRecipeStep = {
    id: 'step-a',
    step_key: 'a_key',
    step_slug: 'a-slug',
    step_name: 'A',
    execution_order: 1,
    parallel_group: 1,
    branch_key: 'branch_a',
    job_type: 'PLAN',
    prompt_type: 'Planner',
    prompt_template_id: 'pt-a',
    output_type: 'HeaderContext',
    granularity_strategy: 'all_to_one',
    inputs_required: [{ type: 'seed_prompt', document_key: 'seed_prompt', required: true, slug: 'seed_prompt' }],
    inputs_relevance: [],
    outputs_required: [{ document_key: 'header_ctx_a', artifact_class: 'header_context', file_type: 'json' }],
  };

  const stepB: DialecticStageRecipeStep = {
    id: 'step-b',
    step_key: 'b_key',
    step_slug: 'b-slug',
    step_name: 'B',
    execution_order: 2,
    parallel_group: 2,
    branch_key: 'branch_b',
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    prompt_template_id: 'pt-b',
    output_type: 'AssembledDocumentJson',
    granularity_strategy: 'one_to_one',
    inputs_required: [{ type: 'document', document_key: 'feature_spec', required: true, slug: 'feature_spec' }],
    inputs_relevance: [{ document_key: 'feature_spec', relevance: 1, type: 'feedback', slug: 'feature_spec' }],
    outputs_required: [{ document_key: 'header_ctx_b', artifact_class: 'header_context', file_type: 'json' }],
  };

  const recipe: DialecticStageRecipe = {
    stageSlug,
    instanceId: 'instance-123',
    // Intentionally out-of-order array to verify ordering behavior in selector
    steps: [stepB, stepA],
  };

  const makeState = (overrides?: Partial<DialecticStateValues>): DialecticStateValues => ({
    ...initialDialecticStateValues,
    recipesByStageSlug: { [stageSlug]: recipe },
    stageRunProgress: {},
    ...(overrides || {}),
  });

  it('selectStageRecipe returns the stored recipe for a stageSlug', () => {
    const state = makeState();
    const r = selectStageRecipe(state, stageSlug);
    expect(r).toBeDefined();
    expect(r?.stageSlug).toBe(stageSlug);
    expect(Array.isArray(r?.steps)).toBe(true);
  });

  it('selectStepList returns steps ordered by execution_order and exposes parallel_group/branch_key', () => {
    const state = makeState();
    const list = selectStepList(state, stageSlug);
    expect(list.map(s => s.step_key)).toEqual(['a_key', 'b_key']);
    expect(list[0].parallel_group).toBe(1);
    expect(list[0].branch_key).toBe('branch_a');
    expect(list[1].parallel_group).toBe(2);
    expect(list[1].branch_key).toBe('branch_b');
  });

  describe('stage run progress selectors', () => {
    const sessionId = 'sess-xyz';
    const iterationNumber = 2;
    const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

    const baseProgressState = makeState({
      stageRunProgress: {
        [progressKey]: {
          stepStatuses: {
            a_key: 'completed',
            b_key: 'not_started',
          },
          documents: {
            doc_a: { status: 'completed', job_id: 'job-1', latestRenderedResourceId: 'res-1' },
            doc_b: { status: 'generating', job_id: 'job-2', latestRenderedResourceId: null },
          },
        },
      },
    });

    it('selectStageRunProgress returns the progress bucket for the session/stage/iteration', () => {
      const progress = selectStageRunProgress(baseProgressState, sessionId, stageSlug, iterationNumber);
      expect(progress).toBeDefined();
      expect(progress?.stepStatuses.a_key).toBe('completed');
    });

    it('selectStepStatus reads the specific step status from a progress bucket', () => {
      const status = selectStepStatus(baseProgressState, progressKey, 'b_key');
      expect(status).toBe('not_started');
    });

    it('selectDocumentsForStageRun returns the documents record for the progress bucket', () => {
      const docs = selectDocumentsForStageRun(baseProgressState, progressKey);
      expect(Object.keys(docs)).toEqual(['doc_a', 'doc_b']);
      expect(docs.doc_a.status).toBe('completed');
    });

    it('selectDocumentStatus returns a document status when present', () => {
      const status = selectDocumentStatus(baseProgressState, progressKey, 'doc_b');
      expect(status).toBe('generating');
    });

    it('selectLatestRenderedRef returns the latestRenderedResourceId for a document', () => {
      const ref = selectLatestRenderedRef(baseProgressState, progressKey, 'doc_a');
      expect(ref).toBe('res-1');
    });
  });

  describe('selectIsStageReadyForSessionIteration readiness gating', () => {
    const projectId = 'project-1';
    const sessionId = 'session-1';
    const stageSlugUnderTest = stageSlug;
    const iterationNumber = 1;
    const plannerStepKey = 'prepare_header';
    const executeStepKey = 'produce_document';

    const plannerStep: DialecticStageRecipeStep = {
      id: plannerStepKey,
      step_key: plannerStepKey,
      step_slug: 'prepare-header',
      step_name: 'Prepare Header',
      execution_order: 1,
      parallel_group: 1,
      branch_key: 'planner_branch',
      job_type: 'PLAN',
      prompt_type: 'Planner',
      prompt_template_id: 'planner-template',
      output_type: 'HeaderContext',
      granularity_strategy: 'all_to_one',
      inputs_required: [
        { type: 'seed_prompt', document_key: 'seed_prompt', required: true, slug: `${stageSlugUnderTest}.seed_prompt` },
      ],
      inputs_relevance: [],
      outputs_required: [
        { document_key: 'global_header', artifact_class: 'header_context', file_type: 'json' },
      ],
    };

    const executeStep: DialecticStageRecipeStep = {
      id: executeStepKey,
      step_key: executeStepKey,
      step_slug: 'produce-document',
      step_name: 'Produce Document',
      execution_order: 2,
      parallel_group: 2,
      branch_key: 'document_branch',
      job_type: 'EXECUTE',
      prompt_type: 'Turn',
      prompt_template_id: 'execute-template',
      output_type: 'AssembledDocumentJson',
      granularity_strategy: 'one_to_one',
      inputs_required: [
        { type: 'header_context', document_key: 'global_header', required: true, slug: `${stageSlugUnderTest}.header_context` },
        { type: 'document', document_key: 'feature_spec', required: true, slug: 'thesis.feature_spec' },
        { type: 'feedback', document_key: 'business_case', required: true, slug: 'antithesis.business_case' },
      ],
      inputs_relevance: [],
      outputs_required: [],
    };

    const readinessRecipe: DialecticStageRecipe = {
      stageSlug: stageSlugUnderTest,
      instanceId: 'instance-readiness',
      steps: [plannerStep, executeStep],
    };

    const createStage = (): DialecticStage => {
      const now = new Date().toISOString();
      return {
        id: 'stage-synthesis',
        slug: stageSlugUnderTest,
        display_name: 'Synthesis',
        description: 'Synthesis stage',
        default_system_prompt_id: null,
        recipe_template_id: null,
        active_recipe_instance_id: null,
        expected_output_template_ids: [],
        created_at: now,
      };
    };

    const processTemplate: DialecticProcessTemplate = {
      id: 'template-1',
      name: 'Process Template',
      description: 'Template for readiness tests',
      starting_stage_id: 'stage-synthesis',
      created_at: new Date().toISOString(),
      stages: [createStage()],
      transitions: [],
    };

    type StepStatus = 'not_started' | 'in_progress' | 'waiting_for_children' | 'completed' | 'failed';

    const createResource = (id: string, description: Record<string, unknown>): DialecticProjectResource => {
      const timestamp = new Date().toISOString();
      return {
        id,
        project_id: projectId,
        file_name: `${id}.json`,
        storage_path: `resources/${id}.json`,
        mime_type: 'application/json',
        size_bytes: 256,
        resource_description: JSON.stringify(description),
        created_at: timestamp,
        updated_at: timestamp,
      };
    };

    const createContribution = (params: {
      id: string;
      stage: string | null;
      contributionType: string | null;
    }): DialecticContribution => {
      const timestamp = new Date().toISOString();
      return {
        id: params.id,
        session_id: sessionId,
        user_id: 'user-1',
        stage: params.stage,
        iteration_number: iterationNumber,
        model_id: 'model-1',
        model_name: 'Model One',
        prompt_template_id_used: null,
        seed_prompt_url: null,
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        target_contribution_id: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: null,
        error: null,
        citations: null,
        created_at: timestamp,
        updated_at: timestamp,
        contribution_type: params.contributionType,
        file_name: null,
        storage_bucket: null,
        storage_path: null,
        size_bytes: null,
        mime_type: null,
      };
    };

    const createFeedback = (id: string, stageSlugValue: string, feedbackType: string): DialecticFeedback => {
      const timestamp = new Date().toISOString();
      return {
        id,
        session_id: sessionId,
        project_id: projectId,
        user_id: 'user-1',
        stage_slug: stageSlugValue,
        iteration_number: iterationNumber,
        storage_bucket: 'feedback',
        storage_path: `feedback/${id}.md`,
        file_name: `${id}.md`,
        mime_type: 'text/markdown',
        size_bytes: 512,
        feedback_type: feedbackType,
        created_at: timestamp,
        updated_at: timestamp,
      };
    };

    const buildState = (config?: {
      resources?: DialecticProjectResource[];
      contributions?: DialecticContribution[];
      feedbackEntries?: DialecticFeedback[];
      stepStatuses?: Partial<Record<string, StepStatus>>;
    }): DialecticStateValues => {
      const resources = config?.resources ?? [];
      const contributions = config?.contributions ?? [];
      const feedbackEntries = config?.feedbackEntries ?? [];
      const stepStatuses: Record<string, StepStatus> = {
        [plannerStepKey]: 'not_started',
        [executeStepKey]: 'not_started',
        ...(config?.stepStatuses ?? {}),
      };

      const session: DialecticSession = {
        id: sessionId,
        project_id: projectId,
        session_description: 'Test Session',
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_model_ids: [],
        status: 'active',
        associated_chat_id: null,
        current_stage_id: processTemplate.starting_stage_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dialectic_session_models: [],
        dialectic_contributions: contributions,
        feedback: feedbackEntries,
      };

      const project: DialecticProject = {
        id: projectId,
        user_id: 'user-1',
        project_name: 'Test Project',
        initial_user_prompt: null,
        initial_prompt_resource_id: null,
        selected_domain_id: 'domain-1',
        dialectic_domains: { name: 'Domain' },
        selected_domain_overlay_id: null,
        repo_url: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dialectic_sessions: [session],
        resources,
        process_template_id: processTemplate.id,
        dialectic_process_templates: processTemplate,
        isLoadingProcessTemplate: false,
        processTemplateError: null,
        contributionGenerationStatus: 'idle',
        generateContributionsError: null,
        isSubmittingStageResponses: false,
        submitStageResponsesError: null,
        isSavingContributionEdit: false,
        saveContributionEditError: null,
      };

      const progressKey = `${sessionId}:${stageSlugUnderTest}:${iterationNumber}`;

      return {
        ...initialDialecticStateValues,
        currentProjectDetail: project,
        currentProcessTemplate: processTemplate,
        recipesByStageSlug: { [stageSlugUnderTest]: readinessRecipe },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses,
            documents: {},
          },
        },
      };
    };

    const seedPromptResource = createResource('resource-seed', {
      type: 'seed_prompt',
      session_id: sessionId,
      stage_slug: stageSlugUnderTest,
      iteration: iterationNumber,
    });

    const headerContextResource = createResource('resource-header', {
      type: 'header_context',
      session_id: sessionId,
      stage_slug: stageSlugUnderTest,
      iteration: iterationNumber,
      document_key: 'global_header',
    });

    it('returns false when the seed prompt required by the planner step is missing', () => {
      const state = buildState();
      expect(
        selectIsStageReadyForSessionIteration(
          state,
          projectId,
          sessionId,
          stageSlugUnderTest,
          iterationNumber,
        ),
      ).toBe(false);
    });

    it('returns true when the planner has its required seed prompt resource', () => {
      const state = buildState({ resources: [seedPromptResource] });
      expect(
        selectIsStageReadyForSessionIteration(
          state,
          projectId,
          sessionId,
          stageSlugUnderTest,
          iterationNumber,
        ),
      ).toBe(true);
    });

    it('returns false after planner completion if the header context output is missing', () => {
      const state = buildState({
        resources: [seedPromptResource],
        stepStatuses: { [plannerStepKey]: 'completed' },
      });
      expect(
        selectIsStageReadyForSessionIteration(
          state,
          projectId,
          sessionId,
          stageSlugUnderTest,
          iterationNumber,
        ),
      ).toBe(false);
    });

    it('returns false when the header context exists but the producing planner step is not completed', () => {
      const state = buildState({
        resources: [seedPromptResource, headerContextResource],
        stepStatuses: { [plannerStepKey]: 'in_progress' },
      });
      expect(
        selectIsStageReadyForSessionIteration(
          state,
          projectId,
          sessionId,
          stageSlugUnderTest,
          iterationNumber,
        ),
      ).toBe(false);
    });

    it('returns false when planner output is ready but downstream document and feedback inputs are missing', () => {
      const state = buildState({
        resources: [seedPromptResource, headerContextResource],
        stepStatuses: { [plannerStepKey]: 'completed' },
      });
      expect(
        selectIsStageReadyForSessionIteration(
          state,
          projectId,
          sessionId,
          stageSlugUnderTest,
          iterationNumber,
        ),
      ).toBe(false);
    });

    it('returns true when planner output, document, and feedback inputs are all satisfied', () => {
      const contribution = createContribution({
        id: 'contribution-feature-spec',
        stage: 'thesis',
        contributionType: 'feature_spec',
      });

      const feedbackEntry = createFeedback('feedback-business-case', 'antithesis', 'business_case');

      const state = buildState({
        resources: [seedPromptResource, headerContextResource],
        contributions: [contribution],
        feedbackEntries: [feedbackEntry],
        stepStatuses: { [plannerStepKey]: 'completed' },
      });

      expect(
        selectIsStageReadyForSessionIteration(
          state,
          projectId,
          sessionId,
          stageSlugUnderTest,
          iterationNumber,
        ),
      ).toBe(true);
    });
  });
});


