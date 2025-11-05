import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createClient } from '@supabase/supabase-js';
import { initializeApiClient, _resetApiClient } from '@paynless/api';
import { server } from '../../api/src/setupTests';
import { useDialecticStore } from './dialecticStore';
import {
  type DialecticStageRecipeStep,
  type DialecticStageRecipe,
  type DialecticProcessTemplate,
  type DialecticProject,
  type DialecticSession,
  type DialecticProjectResource,
} from '@paynless/types';
import { selectIsStageReadyForSessionIteration } from './dialecticStore.selectors';

// Mock Supabase to control token for ApiClient used under the hood
vi.mock('@supabase/supabase-js', () => {
  const mockClient = {
    auth: { getSession: vi.fn() },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(), unsubscribe: vi.fn() })),
    removeChannel: vi.fn(),
  };
  return {
    createClient: vi.fn(() => mockClient),
    SupabaseClient: vi.fn(),
  };
});

const MOCK_SUPABASE_URL = 'http://mock-supabase.co';
const MOCK_ANON_KEY = 'mock-anon-key';
const MOCK_FUNCTIONS_URL = `${MOCK_SUPABASE_URL}/functions/v1`;
const MOCK_ACCESS_TOKEN = 'mock-test-access-token-local';

describe('DialecticStore (integration) - exportDialecticProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetApiClient();
    initializeApiClient({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });

    const mockSupabaseClient = (createClient as unknown as { mock: { results: { value: any }[] } }).mock.results[0].value;
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: MOCK_ACCESS_TOKEN } },
      error: null,
    });
    useDialecticStore.getState()._resetForTesting?.();
  });

  afterEach(() => {
    useDialecticStore.getState()._resetForTesting?.();
    _resetApiClient();
    server.resetHandlers();
  });

  it('sets loading, posts exportProject, clears loading, returns { export_url } and no error', async () => {
    const projectId = 'proj-export-999';
    const expectedUrl = `https://example.com/exports/${projectId}.zip`;
    const expectedFileName = `${projectId}.zip`;

    // MSW intercept for the underlying API request
    server.use(
      http.post(`${MOCK_FUNCTIONS_URL}/dialectic-service`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ action: 'exportProject', payload: { projectId } });
        return HttpResponse.json({ export_url: expectedUrl, file_name: expectedFileName }, { status: 200 });
      })
    );

    const store = useDialecticStore.getState();
    expect(store.isExportingProject).toBe(false);
    expect(store.exportProjectError).toBeNull();

    const promise = store.exportDialecticProject(projectId);
    expect(useDialecticStore.getState().isExportingProject).toBe(true);

    const response = await promise;
    expect(response.error).toBeUndefined();
    expect(response.status).toBe(200);
    expect(response.data?.export_url).toBe(expectedUrl);
    expect(response.data?.file_name).toBe(expectedFileName);

    const finalState = useDialecticStore.getState();
    expect(finalState.isExportingProject).toBe(false);
    expect(finalState.exportProjectError).toBeNull();
  });
});

describe('DialecticStore (integration) - readiness notifications', () => {
  const sessionId = 'session-1';
  const stageSlug = 'thesis';
  const iterationNumber = 1;
  const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
  const projectId = 'project-1';
  const plannerStepKey = 'planner_step';
  const writerStepKey = 'writer_step';

  const now = new Date().toISOString();
  const stageId = 'stage-thesis';

  const plannerStep: DialecticStageRecipeStep = {
    id: plannerStepKey,
    step_key: plannerStepKey,
    step_slug: 'planner',
    step_name: 'Planner',
    execution_order: 1,
    job_type: 'PLAN',
    prompt_type: 'Planner',
    output_type: 'HeaderContext',
    granularity_strategy: 'all_to_one',
    inputs_required: [],
    outputs_required: [
      {
        document_key: 'global_header',
        artifact_class: 'header_context',
        file_type: 'json',
      },
    ],
  };

  const writerStep: DialecticStageRecipeStep = {
    id: writerStepKey,
    step_key: writerStepKey,
    step_slug: 'writer',
    step_name: 'Writer',
    execution_order: 2,
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    output_type: 'AssembledDocumentJson',
    granularity_strategy: 'one_to_one',
    inputs_required: [
      {
        type: 'header_context',
        document_key: 'global_header',
        required: true,
        slug: `${stageSlug}.global_header`,
      },
    ],
    outputs_required: [],
  };

  const recipe: DialecticStageRecipe = {
    stageSlug,
    instanceId: 'recipe-instance-1',
    steps: [plannerStep, writerStep],
  };

  const processTemplate: DialecticProcessTemplate = {
    id: 'template-1',
    name: 'Readiness Template',
    description: 'Template for readiness tests',
    starting_stage_id: stageId,
    created_at: now,
    stages: [
      {
        id: stageId,
        slug: stageSlug,
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: null,
        recipe_template_id: null,
        expected_output_template_ids: [],
        created_at: now,
        active_recipe_instance_id: null,
      },
    ],
    transitions: [],
  };

  const seedPromptResource: DialecticProjectResource = {
    id: 'resource-seed',
    project_id: projectId,
    file_name: 'seed_prompt.json',
    storage_path: 'resources/seed_prompt.json',
    mime_type: 'application/json',
    size_bytes: 128,
    resource_description: JSON.stringify({
      type: 'seed_prompt',
      session_id: sessionId,
      stage_slug: stageSlug,
      iteration: iterationNumber,
    }),
    created_at: now,
    updated_at: now,
  };

  const headerContextResource: DialecticProjectResource = {
    id: 'resource-header',
    project_id: projectId,
    file_name: 'header_context.json',
    storage_path: 'resources/header_context.json',
    mime_type: 'application/json',
    size_bytes: 256,
    resource_description: JSON.stringify({
      type: 'header_context',
      session_id: sessionId,
      stage_slug: stageSlug,
      document_key: 'global_header',
      iteration: iterationNumber,
    }),
    created_at: now,
    updated_at: now,
  };

  const createSession = (): DialecticSession => ({
    id: sessionId,
    project_id: projectId,
    status: 'active',
    iteration_count: iterationNumber,
    created_at: now,
    updated_at: now,
    current_stage_id: stageId,
    selected_model_ids: [],
    dialectic_contributions: [],
    session_description: null,
    user_input_reference_url: null,
    associated_chat_id: null,
  });

  const createProject = (): DialecticProject => ({
    id: projectId,
    user_id: 'user-1',
    project_name: 'Readiness Project',
    selected_domain_id: 'domain-1',
    dialectic_domains: { name: 'Readiness Domain' },
    status: 'active',
    created_at: now,
    updated_at: now,
    dialectic_sessions: [createSession()],
    resources: [seedPromptResource],
    dialectic_process_templates: processTemplate,
    process_template_id: processTemplate.id,
    isLoadingProcessTemplate: false,
    processTemplateError: null,
    contributionGenerationStatus: 'idle',
    generateContributionsError: null,
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
    isSavingContributionEdit: false,
    saveContributionEditError: null,
    initial_user_prompt: 'Initial prompt',
    initial_prompt_resource_id: null,
    selected_domain_overlay_id: null,
    repo_url: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    _resetApiClient();
    initializeApiClient({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });

    const mockSupabaseClient = (createClient as unknown as { mock: { results: { value: any }[] } }).mock.results[0].value;
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: MOCK_ACCESS_TOKEN } },
      error: null,
    });

    useDialecticStore.getState()._resetForTesting?.();
    const projectInstance = createProject();
    useDialecticStore.setState((state) => {
      state.currentProcessTemplate = processTemplate;
      state.currentProjectDetail = projectInstance;
      state.recipesByStageSlug[stageSlug] = recipe;
      state.stageRunProgress[progressKey] = {
        stepStatuses: {
          [plannerStepKey]: 'not_started',
          [writerStepKey]: 'not_started',
        },
        documents: {},
      };
    });
  });

  afterEach(() => {
    useDialecticStore.getState()._resetForTesting?.();
    _resetApiClient();
  });

  it('transitions readiness with lifecycle notifications and recovers after job failure', () => {
    const readiness = () =>
      selectIsStageReadyForSessionIteration(
        useDialecticStore.getState(),
        projectId,
        sessionId,
        stageSlug,
        iterationNumber,
      );

    expect(readiness()).toBe(false);

    useDialecticStore.getState()._handleDialecticLifecycleEvent?.({
      type: 'planner_started',
      sessionId,
      stageSlug,
      iterationNumber,
      job_id: 'job-planner',
      document_key: 'global_header',
      modelId: 'model-planner',
      step_key: plannerStepKey,
      latestRenderedResourceId: headerContextResource.id,
    });

    expect(readiness()).toBe(false);

    useDialecticStore.setState((state) => {
      if (!state.currentProjectDetail) {
        return;
      }
      state.currentProjectDetail.resources = [
        ...(state.currentProjectDetail.resources ?? []),
        headerContextResource,
      ];
    });

    useDialecticStore.getState()._handleDialecticLifecycleEvent?.({
      type: 'render_completed',
      sessionId,
      stageSlug,
      iterationNumber,
      job_id: 'job-planner-render',
      document_key: 'global_header',
      modelId: 'model-planner',
      latestRenderedResourceId: headerContextResource.id,
      step_key: plannerStepKey,
    });

    expect(readiness()).toBe(true);

    useDialecticStore.getState()._handleDialecticLifecycleEvent?.({
      type: 'job_failed',
      sessionId,
      stageSlug,
      iterationNumber,
      job_id: 'job-writer',
      document_key: 'business_case',
      modelId: 'model-writer',
      step_key: writerStepKey,
      error: {
        code: 'MODEL_FAILURE',
        message: 'Writer step failed',
      },
      latestRenderedResourceId: headerContextResource.id,
    });

    expect(readiness()).toBe(false);
  });
});


