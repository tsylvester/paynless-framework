import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createClient } from '@supabase/supabase-js';
import { initializeApiClient, _resetApiClient } from '@paynless/api';
import { server } from '../../api/src/setupTests';
import { useDialecticStore } from './dialecticStore';
import {
  DialecticStageRecipeStep,
  DialecticStageRecipe,
  DialecticProcessTemplate,
  DialecticProject,
  DialecticSession,
  DialecticProjectResource,
  SaveContributionEditPayload,
  SaveContributionEditSuccessResponse,
  EditedDocumentResource,
  DialecticContribution,
  StageDocumentCompositeKey,
  GetProjectResourceContentResponse,
} from '@paynless/types';
import { selectIsStageReadyForSessionIteration, selectStageDocumentResource } from './dialecticStore.selectors';

// Mock Supabase to control token for ApiClient used under the hood
// Inline mock client creation to match createMockSupabaseClient utility structure
vi.mock('@supabase/supabase-js', () => {
  const mockSubscription = {
    id: 'mock-subscription-id',
    unsubscribe: vi.fn(),
    callback: vi.fn(),
  };

  const mockClient = {
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: mockSubscription } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(), unsubscribe: vi.fn() })),
    from: vi.fn(),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    removeChannel: vi.fn().mockResolvedValue('ok'),
    removeAllChannels: vi.fn().mockResolvedValue([]),
    storage: {
      from: vi.fn().mockReturnThis(),
    },
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

    const mockSupabaseClient = vi.mocked(createClient).mock.results[0].value;
    vi.mocked(mockSupabaseClient.auth.getSession).mockResolvedValue({
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
    output_type: 'header_context',
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
    output_type: 'assembled_document_json',
    granularity_strategy: 'per_source_document',
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
    selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
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

    const mockSupabaseClient = vi.mocked(createClient).mock.results[0].value;
    vi.mocked(mockSupabaseClient.auth.getSession).mockResolvedValue({
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
        jobProgress: {},
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

describe('DialecticStore (integration) - saveContributionEdit', () => {
  const sessionId = 'session-edit-1';
  const stageSlug = 'synthesis';
  const iterationNumber = 1;
  const projectId = 'project-edit-1';
  const modelId = 'model-1';
  const documentKey = 'synthesis';
  const originalContributionId = 'contrib-original-1';

  const now = new Date().toISOString();
  const stageId = 'stage-synthesis';

  const originalContribution: DialecticContribution = {
    id: originalContributionId,
    session_id: sessionId,
    user_id: 'user-1',
    stage: stageSlug,
    iteration_number: iterationNumber,
    model_id: modelId,
    job_id: 'job-1',
    status: 'completed',
    original_model_contribution_id: null,
    created_at: now,
    updated_at: now,
    model_name: 'Test Model 1',
    prompt_template_id_used: 'prompt-template-1',
    seed_prompt_url: 'path/to/seed.md',
    edit_version: 0,
    is_latest_edit: true,
    raw_response_storage_path: 'path/to/raw.json',
    target_contribution_id: null,
    tokens_used_input: 10,
    tokens_used_output: 20,
    processing_time_ms: 100,
    error: null,
    citations: null,
    contribution_type: documentKey,
    file_name: 'synthesis.md',
    storage_bucket: 'test-bucket',
    storage_path: 'path/to/synthesis.md',
    size_bytes: 100,
    mime_type: 'text/markdown',
  };

  const createSession = (): DialecticSession => ({
    id: sessionId,
    project_id: projectId,
    status: 'active',
    iteration_count: iterationNumber,
    created_at: now,
    updated_at: now,
    current_stage_id: stageId,
    selected_models: [{ id: modelId, displayName: 'Model 1' }],
    dialectic_contributions: [originalContribution],
    session_description: null,
    user_input_reference_url: null,
    associated_chat_id: null,
  });

  const createProject = (): DialecticProject => ({
    id: projectId,
    user_id: 'user-1',
    project_name: 'Edit Project',
    selected_domain_id: 'domain-1',
    dialectic_domains: { name: 'Edit Domain' },
    status: 'active',
    created_at: now,
    updated_at: now,
    dialectic_sessions: [createSession()],
    resources: [],
    dialectic_process_templates: {
      id: 'template-1',
      name: 'Edit Template',
      description: '',
      starting_stage_id: stageId,
      created_at: now,
      stages: [{
        id: stageId,
        slug: stageSlug,
        display_name: 'Synthesis',
        description: '',
        default_system_prompt_id: null,
        recipe_template_id: null,
        expected_output_template_ids: [],
        created_at: now,
        active_recipe_instance_id: null,
      }],
      transitions: [],
    },
    process_template_id: 'template-1',
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

  const editedContentText = 'This is the new, edited content.';
  const newResourceId = 'resource-edited-1';

  const mockEditedResource: EditedDocumentResource = {
    id: newResourceId,
    resource_type: 'rendered_document',
    project_id: projectId,
    session_id: sessionId,
    stage_slug: stageSlug,
    iteration_number: iterationNumber,
    document_key: documentKey,
    source_contribution_id: originalContributionId,
    storage_bucket: 'dialectic-resources',
    storage_path: '/edited/path.md',
    file_name: 'edited.md',
    mime_type: 'text/markdown',
    size_bytes: 150,
    created_at: now,
    updated_at: now,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _resetApiClient();
    initializeApiClient({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });

    const mockSupabaseClient = vi.mocked(createClient).mock.results[0].value;
    vi.mocked(mockSupabaseClient.auth.getSession).mockResolvedValue({
      data: { session: { access_token: MOCK_ACCESS_TOKEN } },
      error: null,
    });

    useDialecticStore.getState()._resetForTesting?.();
    const projectInstance = createProject();
    useDialecticStore.setState((state) => {
      state.currentProjectDetail = projectInstance;
      state.stageDocumentContent = {};
    });
  });

  afterEach(() => {
    useDialecticStore.getState()._resetForTesting?.();
    _resetApiClient();
    server.resetHandlers();
  });

  it('should dispatch saveContributionEdit, assert stageDocumentContent reflects edited markdown, and leave dialectic_contributions unchanged except isLatestEdit flag', async () => {
    const editPayload: SaveContributionEditPayload = {
      originalContributionIdToEdit: originalContributionId,
      editedContentText,
      projectId,
      sessionId,
      originalModelContributionId: originalContributionId,
      responseText: editedContentText,
      documentKey,
      resourceType: 'rendered_document',
    };

    const mockResponse: SaveContributionEditSuccessResponse = {
      resource: mockEditedResource,
      sourceContributionId: originalContributionId,
    };

    server.use(
      http.post(`${MOCK_FUNCTIONS_URL}/dialectic-service`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ action: 'saveContributionEdit', payload: editPayload });
        return HttpResponse.json(mockResponse, { status: 201 });
      })
    );

    const store = useDialecticStore.getState();
    expect(store.stageDocumentContent).toEqual({});
    expect(store.currentProjectDetail?.dialectic_sessions?.[0]?.dialectic_contributions?.[0]?.is_latest_edit).toBe(true);

    const compositeKey = `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;
    expect(store.stageDocumentContent[compositeKey]).toBeUndefined();

    const promise = store.saveContributionEdit(editPayload);
    expect(useDialecticStore.getState().isSavingContributionEdit).toBe(true);

    const response = await promise;
    expect(response.error).toBeUndefined();
    expect(response.status).toBe(201);
    expect(response.data?.resource.id).toBe(newResourceId);

    const finalState = useDialecticStore.getState();
    
    // Assert stageDocumentContent is updated with the edited markdown
    const documentEntry = finalState.stageDocumentContent[compositeKey];
    expect(documentEntry).toBeDefined();
    expect(documentEntry?.baselineMarkdown).toBe(editedContentText);
    expect(documentEntry?.currentDraftMarkdown).toBe(editedContentText);
    expect(documentEntry?.isDirty).toBe(false);
    expect(documentEntry?.isLoading).toBe(false);
    expect(documentEntry?.error).toBeNull();
    expect(documentEntry?.lastBaselineVersion?.resourceId).toBe(newResourceId);
    expect(documentEntry?.sourceContributionId).toBe(mockResponse.sourceContributionId);
    expect(documentEntry?.resourceType).toBe(mockResponse.resource.resource_type);

    // Assert dialectic_contributions is NOT mutated (except isLatestEdit flag)
    const session = finalState.currentProjectDetail?.dialectic_sessions?.find(s => s.id === sessionId);
    const originalContributionInState = session?.dialectic_contributions?.find(c => c.id === originalContributionId);
    expect(originalContributionInState).toBeDefined();
    expect(originalContributionInState?.is_latest_edit).toBe(false); // Flag toggled to false via backend response
    expect(originalContributionInState?.contribution_type).toBe(documentKey); // Content unchanged
    expect(originalContributionInState?.file_name).toBe('synthesis.md'); // Content unchanged

    // Assert no new contribution was added to the array
    const contributionsCount = session?.dialectic_contributions?.length ?? 0;
    expect(contributionsCount).toBe(1); // Only original contribution remains
    const resourceAsContribution = session?.dialectic_contributions?.find(c => c.id === newResourceId);
    expect(resourceAsContribution).toBeUndefined(); // Resource ID should not exist in contributions

    // Verify downstream UI selectors see the new resource
    // This proves the document cache is the authoritative source, not dialectic_contributions
    const documentFromSelector = selectStageDocumentResource(
      finalState,
      sessionId,
      stageSlug,
      iterationNumber,
      modelId,
      documentKey
    );
    expect(documentFromSelector).toBeDefined();
    expect(documentFromSelector?.baselineMarkdown).toBe(editedContentText);
    expect(documentFromSelector?.lastBaselineVersion?.resourceId).toBe(newResourceId);

    expect(finalState.isSavingContributionEdit).toBe(false);
    expect(finalState.saveContributionEditError).toBeNull();
  });
});

describe('DialecticStore (integration) - fetchStageDocumentContent stores sourceContributionId', () => {
  const projectId = 'project-source-contrib-integration';
  const sessionId = 'session-source-contrib-integration';
  const stageSlug = 'thesis';
  const iterationNumber = 1;
  const modelId = 'model-source-contrib-integration';
  const documentKey = 'business_case';
  const resourceId = 'resource-with-source-contrib';
  const sourceContributionId = 'contrib-source-123';
  const testContent = 'Test document content for integration test';
  const now = new Date().toISOString();

  const compositeKey: StageDocumentCompositeKey = {
    sessionId,
    stageSlug,
    iterationNumber,
    modelId,
    documentKey,
  };

  const createSession = (): DialecticSession => ({
    id: sessionId,
    project_id: projectId,
    status: 'active',
    iteration_count: iterationNumber,
    created_at: now,
    updated_at: now,
    current_stage_id: 'stage-1',
    selected_models: [{ id: modelId, displayName: 'Model 1' }],
    dialectic_contributions: [],
    session_description: null,
    user_input_reference_url: null,
    associated_chat_id: null,
  });

  const createProject = (): DialecticProject => ({
    id: projectId,
    user_id: 'user-1',
    project_name: 'Source Contrib Integration Project',
    selected_domain_id: 'domain-1',
    dialectic_domains: { name: 'Test Domain' },
    status: 'active',
    created_at: now,
    updated_at: now,
    dialectic_sessions: [createSession()],
    resources: [],
    dialectic_process_templates: {
      id: 'template-1',
      name: 'Test Template',
      description: '',
      starting_stage_id: 'stage-1',
      created_at: now,
      stages: [{
        id: 'stage-1',
        slug: stageSlug,
        display_name: 'Thesis',
        description: '',
        default_system_prompt_id: null,
        recipe_template_id: null,
        expected_output_template_ids: [],
        created_at: now,
        active_recipe_instance_id: null,
      }],
      transitions: [],
    },
    process_template_id: 'template-1',
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

    const mockSupabaseClient = vi.mocked(createClient).mock.results[0].value;
    vi.mocked(mockSupabaseClient.auth.getSession).mockResolvedValue({
      data: { session: { access_token: MOCK_ACCESS_TOKEN } },
      error: null,
    });

    useDialecticStore.getState()._resetForTesting?.();
    const projectInstance = createProject();
    useDialecticStore.setState((state) => {
      state.currentProjectDetail = projectInstance;
      state.stageDocumentContent = {};
    });
  });

  afterEach(() => {
    useDialecticStore.getState()._resetForTesting?.();
    _resetApiClient();
    server.resetHandlers();
  });

  it('9.f.i: stores sourceContributionId when getProjectResourceContent returns it, and selectStageDocumentResource provides it', async () => {
    // (1) Set up MSW to mock getProjectResourceContent API response with sourceContributionId
    const mockResponse: GetProjectResourceContentResponse = {
      fileName: 'test.md',
      mimeType: 'text/markdown',
      content: testContent,
      sourceContributionId: sourceContributionId,
      resourceType: null,
    };
    server.use(
      http.post(`${MOCK_FUNCTIONS_URL}/dialectic-service`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({
          action: 'getProjectResourceContent',
          payload: { resourceId },
        });
        return HttpResponse.json(mockResponse, { status: 200 });
      })
    );

    // (2) Call fetchStageDocumentContentLogic via the store action
    const store = useDialecticStore.getState();
    const serializedKey = `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;
    expect(store.stageDocumentContent[serializedKey]).toBeUndefined();

    await store.fetchStageDocumentContent(compositeKey, resourceId);

    // (3) Verify sourceContributionId is stored in the state
    const finalState = useDialecticStore.getState();
    const documentEntry = finalState.stageDocumentContent[serializedKey];
    expect(documentEntry).toBeDefined();
    expect(documentEntry?.sourceContributionId).toBe(sourceContributionId);
    expect(documentEntry?.baselineMarkdown).toBe(testContent);
    expect(documentEntry?.isLoading).toBe(false);
    expect(documentEntry?.error).toBeNull();

    // (4) Verify selectStageDocumentResource returns sourceContributionId
    const documentFromSelector = selectStageDocumentResource(
      finalState,
      sessionId,
      stageSlug,
      iterationNumber,
      modelId,
      documentKey
    );
    expect(documentFromSelector).toBeDefined();
    expect(documentFromSelector?.sourceContributionId).toBe(sourceContributionId);
    expect(documentFromSelector?.baselineMarkdown).toBe(testContent);
  });
});


