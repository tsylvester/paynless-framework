import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';
import {
  useDialecticStore,
  initialDialecticStateValues,
} from './dialecticStore';
import { useWalletStore } from './walletStore';
import type {
  ApiError,
  ApiResponse,
  CreateProjectPayload,
  CreateProjectAutoStartResult,
  DialecticProject,
  DialecticStage,
  DialecticSession,
  StartSessionSuccessResponse,
  AssembledPrompt,
  AIModelCatalogEntry,
  SelectedModels,
  GenerateContributionsPayload,
  GenerateContributionsResponse,
  TokenWallet,
} from '@paynless/types';

vi.mock('@paynless/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@paynless/api')>();
  const { api } = await import('@paynless/api/mocks');
  return {
    ...original,
    api,
    initializeApiClient: vi.fn(),
  };
});

import { resetApiMock, getMockDialecticClient, type MockDialecticApiClient } from '@paynless/api/mocks';

function projectWithStages(projectId: string, stages: DialecticStage[]): DialecticProject {
  const base: DialecticProject = {
    id: projectId,
    user_id: 'user-1',
    project_name: 'Test',
    selected_domain_id: 'dom-1',
    dialectic_domains: null,
    selected_domain_overlay_id: null,
    repo_url: null,
    status: 'active',
    created_at: '2023-01-01T00:00:00.000Z',
    updated_at: '2023-01-01T00:00:00.000Z',
    process_template_id: 'pt-1',
    dialectic_process_templates: {
      id: 'pt-1',
      name: 'Standard',
      description: null,
      created_at: '2023-01-01T00:00:00.000Z',
      starting_stage_id: 'stage-1',
      stages,
    },
    isLoadingProcessTemplate: false,
    processTemplateError: null,
    contributionGenerationStatus: 'idle',
    generateContributionsError: null,
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
    isSavingContributionEdit: false,
    saveContributionEditError: null,
  };
  return base;
}

function catalogEntry(overrides: Partial<AIModelCatalogEntry>): AIModelCatalogEntry {
  const base: AIModelCatalogEntry = {
    id: 'base-id',
    provider_name: 'Provider',
    model_name: 'Base Model',
    api_identifier: 'api-id',
    description: null,
    strengths: null,
    weaknesses: null,
    context_window_tokens: null,
    input_token_cost_usd_millionths: null,
    output_token_cost_usd_millionths: null,
    max_output_tokens: null,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    is_default_generation: false,
  };
  return { ...base, ...overrides };
}

function sessionSuccessResponse(sessionId: string, projectId: string): StartSessionSuccessResponse {
  const seedPrompt: AssembledPrompt = {
    promptContent: 'test',
    source_prompt_resource_id: 'res-123',
  };
  const session: DialecticSession = {
    id: sessionId,
    project_id: projectId,
    session_description: null,
    iteration_count: 1,
    created_at: '2023-01-01T00:00:00.000Z',
    updated_at: '2023-01-01T00:00:00.000Z',
    selected_models: [],
    status: 'active',
    associated_chat_id: null,
    current_stage_id: null,
    user_input_reference_url: null,
  };
  return { ...session, seedPrompt };
}

function walletWithBalance(balance: string): TokenWallet {
  return {
    walletId: 'wallet-1',
    balance,
    currency: 'AI_TOKEN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('useDialecticStore', () => {
  let mockDialecticApi: MockDialecticApiClient;

  beforeEach(() => {
    resetApiMock();
    mockDialecticApi = getMockDialecticClient();
    useDialecticStore.getState()._resetForTesting?.();
    useWalletStore.setState({
      personalWallet: null,
      isLoadingPersonalWallet: false,
      personalWalletError: null,
      currentChatWalletDecision: null,
    });
    vi.clearAllMocks();
  });

  describe('createProjectAndAutoStart', () => {
    const payload: CreateProjectPayload = {
      projectName: 'Auto Project',
      selectedDomainId: 'dom-1',
    };
    const projectId = 'proj-auto-1';
    const sessionId = 'sess-auto-1';
    const stageSlug = 'thesis';

    it('calls fetchAIModelCatalog if modelCatalog is empty and not loading, waits for completion before proceeding', async () => {
      useDialecticStore.setState({ ...initialDialecticStateValues, modelCatalog: [], isLoadingModelCatalog: false });
      mockDialecticApi.listModelCatalog.mockResolvedValue({ data: [], status: 200 });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      const projectWithStagesData = projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]);
      mockDialecticApi.getProjectDetails.mockResolvedValue({ data: projectWithStagesData, status: 200 });
      mockDialecticApi.listModelCatalog.mockResolvedValue({
        data: [catalogEntry({ id: 'm1', model_name: 'Model One', is_default_generation: true, is_active: true })],
        status: 200,
      });
      mockDialecticApi.startSession.mockResolvedValue({
        data: sessionSuccessResponse(sessionId, projectId),
        status: 200,
      });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      await createProjectAndAutoStart(payload);

      expect(mockDialecticApi.listModelCatalog).toHaveBeenCalled();
    });

    it('skips fetchAIModelCatalog if catalog is already loaded', async () => {
      const existingCatalog: AIModelCatalogEntry[] = [
        catalogEntry({ id: 'm1', model_name: 'One', is_default_generation: true, is_active: true }),
      ];
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: existingCatalog,
        isLoadingModelCatalog: false,
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      mockDialecticApi.getProjectDetails.mockResolvedValue({
        data: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        status: 200,
      });
      mockDialecticApi.startSession.mockResolvedValue({
        data: sessionSuccessResponse(sessionId, projectId),
        status: 200,
      });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      await createProjectAndAutoStart(payload);

      expect(mockDialecticApi.listModelCatalog).not.toHaveBeenCalled();
    });

    it('calls createDialecticProject with the provided payload and extracts projectId from response.data.id', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: true, is_active: true })],
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      mockDialecticApi.getProjectDetails.mockResolvedValue({
        data: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        status: 200,
      });
      mockDialecticApi.startSession.mockResolvedValue({
        data: sessionSuccessResponse(sessionId, projectId),
        status: 200,
      });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      const result: CreateProjectAutoStartResult = await createProjectAndAutoStart(payload);

      expect(mockDialecticApi.createProject).toHaveBeenCalled();
      expect(result.projectId).toBe(projectId);
    });

    it('calls fetchDialecticProjectDetails(projectId) after project creation and waits for completion', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: true, is_active: true })],
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      const projectData = projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]);
      mockDialecticApi.getProjectDetails.mockResolvedValue({ data: projectData, status: 200 });
      mockDialecticApi.startSession.mockResolvedValue({
        data: sessionSuccessResponse(sessionId, projectId),
        status: 200,
      });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      await createProjectAndAutoStart(payload);

      expect(mockDialecticApi.getProjectDetails).toHaveBeenCalledWith(projectId);
    });

    it('derives initial stage slug from currentProjectDetail.dialectic_process_templates.stages[0].slug', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: true, is_active: true })],
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      mockDialecticApi.getProjectDetails.mockResolvedValue({
        data: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        status: 200,
      });
      mockDialecticApi.startSession.mockResolvedValue({
        data: sessionSuccessResponse(sessionId, projectId),
        status: 200,
      });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      await createProjectAndAutoStart(payload);

      expect(mockDialecticApi.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ projectId, stageSlug, selectedModels: expect.any(Array) }),
      );
    });

    it('resolves default models via selectDefaultGenerationModels and returns projectId, sessionId null, hasDefaultModels false when none found', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: false, is_active: true })],
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      mockDialecticApi.getProjectDetails.mockResolvedValue({
        data: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        status: 200,
      });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      const result: CreateProjectAutoStartResult = await createProjectAndAutoStart(payload);

      expect(result.projectId).toBe(projectId);
      expect(result.sessionId).toBeNull();
      expect(result.hasDefaultModels).toBe(false);
      expect(mockDialecticApi.startSession).not.toHaveBeenCalled();
    });

    it('calls startDialecticSession with projectId, stageSlug, selectedModels defaultModels', async () => {
      const defaultModels: SelectedModels[] = [{ id: 'm1', displayName: 'Model One' }];
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', model_name: 'Model One', is_default_generation: true, is_active: true })],
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      mockDialecticApi.getProjectDetails.mockResolvedValue({
        data: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        status: 200,
      });
      mockDialecticApi.startSession.mockResolvedValue({
        data: sessionSuccessResponse(sessionId, projectId),
        status: 200,
      });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      await createProjectAndAutoStart(payload);

      expect(mockDialecticApi.startSession).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          stageSlug,
          selectedModels: defaultModels,
        }),
      );
    });

    it('returns projectId, sessionId, hasDefaultModels true on full success', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: true, is_active: true })],
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      mockDialecticApi.getProjectDetails.mockResolvedValue({
        data: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        status: 200,
      });
      mockDialecticApi.startSession.mockResolvedValue({
        data: sessionSuccessResponse(sessionId, projectId),
        status: 200,
      });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      const result: CreateProjectAutoStartResult = await createProjectAndAutoStart(payload);

      expect(result.projectId).toBe(projectId);
      expect(result.sessionId).toBe(sessionId);
      expect(result.hasDefaultModels).toBe(true);
    });

    it('stops and returns error if createDialecticProject fails', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: true, is_active: true })],
      });
      const apiError: ApiError = { code: 'CREATE_FAIL', message: 'Server error' };
      mockDialecticApi.createProject.mockResolvedValue({ error: apiError, status: 500 });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      const result: CreateProjectAutoStartResult = await createProjectAndAutoStart(payload);

      expect(result.error).toEqual(apiError);
      expect(mockDialecticApi.getProjectDetails).not.toHaveBeenCalled();
    });

    it('returns partial result with projectId if fetchDialecticProjectDetails fails after project creation', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: true, is_active: true })],
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      mockDialecticApi.getProjectDetails.mockResolvedValue({ data: undefined, status: 500 });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      const result: CreateProjectAutoStartResult = await createProjectAndAutoStart(payload);

      expect(result.projectId).toBe(projectId);
      expect(result.sessionId).toBeNull();
    });

    it('returns error if currentProjectDetail has no stages', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: true, is_active: true })],
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      const projectNoStages = projectWithStages(projectId, []);
      mockDialecticApi.getProjectDetails.mockResolvedValue({ data: projectNoStages, status: 200 });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      const result: CreateProjectAutoStartResult = await createProjectAndAutoStart(payload);

      expect(result.error).toBeDefined();
      expect(mockDialecticApi.startSession).not.toHaveBeenCalled();
    });

    it('stops and returns error if startDialecticSession fails', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: true, is_active: true })],
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      mockDialecticApi.getProjectDetails.mockResolvedValue({
        data: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        status: 200,
      });
      const sessionError: ApiError = { code: 'SESSION_FAIL', message: 'Cannot start session' };
      mockDialecticApi.startSession.mockResolvedValue({ error: sessionError, status: 400 });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      const result: CreateProjectAutoStartResult = await createProjectAndAutoStart(payload);

      expect(result.error).toEqual(sessionError);
    });

    it('updates autoStartStep progressively at each stage', async () => {
      const steps: string[] = [];
      useDialecticStore.subscribe((state) => {
        if (state.autoStartStep !== null) {
          steps.push(state.autoStartStep);
        }
      });
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: true, is_active: true })],
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      mockDialecticApi.getProjectDetails.mockResolvedValue({
        data: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        status: 200,
      });
      mockDialecticApi.startSession.mockResolvedValue({
        data: sessionSuccessResponse(sessionId, projectId),
        status: 200,
      });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      await createProjectAndAutoStart(payload);

      expect(steps).toContain('Creating project…');
      expect(steps).toContain('Loading project details…');
      expect(steps).toContain('Starting session…');
    });

    it('sets isAutoStarting to true at start and false at end', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: true, is_active: true })],
      });
      mockDialecticApi.createProject.mockResolvedValue({
        data: projectWithStages(projectId, []),
        status: 201,
      });
      mockDialecticApi.getProjectDetails.mockResolvedValue({
        data: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        status: 200,
      });
      mockDialecticApi.startSession.mockResolvedValue({
        data: sessionSuccessResponse(sessionId, projectId),
        status: 200,
      });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      const before = useDialecticStore.getState().isAutoStarting;
      const promise = createProjectAndAutoStart(payload);
      const during = useDialecticStore.getState().isAutoStarting;
      await promise;
      const after = useDialecticStore.getState().isAutoStarting;

      expect(before).toBe(false);
      expect(during).toBe(true);
      expect(after).toBe(false);
    });

    it('sets autoStartError on failure', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        modelCatalog: [catalogEntry({ id: 'm1', is_default_generation: true, is_active: true })],
      });
      const apiError: ApiError = { code: 'CREATE_FAIL', message: 'Server error' };
      mockDialecticApi.createProject.mockResolvedValue({ error: apiError, status: 500 });

      const { createProjectAndAutoStart } = useDialecticStore.getState();
      await createProjectAndAutoStart(payload);

      const state = useDialecticStore.getState();
      expect(state.autoStartError).toEqual(apiError);
    });
  });

  describe('autoStartGeneration', () => {
    const projectId = 'proj-gen-1';
    const sessionId = 'sess-gen-1';
    const stageSlug = 'thesis';

    it('builds GenerateContributionsPayload correctly from store state and calls generateContributions with it', async () => {
      const selectedModels: SelectedModels[] = [{ id: 'm1', displayName: 'Model One' }];
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        activeContextSessionId: sessionId,
        activeContextStage: { slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null },
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: null,
          iteration_count: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z',
          selected_models: [],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: null,
          user_input_reference_url: null,
        },
        selectedModels,
      });
      useWalletStore.setState({
        personalWallet: walletWithBalance('500000'),
        isLoadingPersonalWallet: false,
        personalWalletError: null,
      });
      const mockResponse: ApiResponse<GenerateContributionsResponse> = {
        data: {
          sessionId,
          projectId,
          stage: stageSlug,
          iteration: 1,
          status: 'ok',
          successfulContributions: [],
          failedAttempts: [],
        },
        status: 200,
      };
      mockDialecticApi.generateContributions.mockResolvedValue(mockResponse);

      const { autoStartGeneration } = useDialecticStore.getState();
      await autoStartGeneration();

      expect(mockDialecticApi.generateContributions).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId,
          projectId,
          stageSlug,
          iterationNumber: 1,
          continueUntilComplete: true,
          walletId: 'wallet-1',
        } as Partial<GenerateContributionsPayload>),
      );
    });

    it('calls generateContributions with the built payload', async () => {
      const selectedModels: SelectedModels[] = [{ id: 'm1', displayName: 'Model One' }];
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        activeContextSessionId: sessionId,
        activeContextStage: { slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null },
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: null,
          iteration_count: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z',
          selected_models: [],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: null,
          user_input_reference_url: null,
        },
        selectedModels,
      });
      useWalletStore.setState({
        personalWallet: walletWithBalance('500000'),
        isLoadingPersonalWallet: false,
        personalWalletError: null,
      });
      mockDialecticApi.generateContributions.mockResolvedValue({
        data: { sessionId, projectId, stage: stageSlug, iteration: 1, status: 'ok', successfulContributions: [], failedAttempts: [] },
        status: 200,
      });

      const { autoStartGeneration } = useDialecticStore.getState();
      await autoStartGeneration();

      expect(mockDialecticApi.generateContributions).toHaveBeenCalledTimes(1);
    });

    it('returns descriptive error when selectedModels is empty', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        activeContextSessionId: sessionId,
        activeContextStage: { slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null },
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: null,
          iteration_count: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z',
          selected_models: [],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: null,
          user_input_reference_url: null,
        },
        selectedModels: [],
      });
      useWalletStore.setState({
        personalWallet: walletWithBalance('500000'),
        isLoadingPersonalWallet: false,
        personalWalletError: null,
      });

      const { autoStartGeneration } = useDialecticStore.getState();
      const result = await autoStartGeneration();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No models selected');
      expect(mockDialecticApi.generateContributions).not.toHaveBeenCalled();
    });

    it('returns descriptive error when active stage is not set', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        activeContextSessionId: sessionId,
        activeContextStage: null,
        activeStageSlug: null,
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: null,
          iteration_count: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z',
          selected_models: [],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: null,
          user_input_reference_url: null,
        },
        selectedModels: [{ id: 'm1', displayName: 'Model One' }],
      });
      useWalletStore.setState({
        personalWallet: walletWithBalance('500000'),
        isLoadingPersonalWallet: false,
        personalWalletError: null,
      });

      const { autoStartGeneration } = useDialecticStore.getState();
      const result = await autoStartGeneration();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active stage');
      expect(mockDialecticApi.generateContributions).not.toHaveBeenCalled();
    });

    it('returns descriptive error when walletInfo.status is not ok', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        activeContextSessionId: sessionId,
        activeContextStage: { slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null },
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,  
          session_description: null,
          iteration_count: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z',
          selected_models: [],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: null,
          user_input_reference_url: null,
        },
        selectedModels: [{ id: 'm1', displayName: 'Model One' }],
      });
      useWalletStore.setState({
        personalWallet: null,
        isLoadingPersonalWallet: false,
        personalWalletError: { message: 'Wallet load failed', code: 'WALLET_ERROR' },
      });

      const { autoStartGeneration } = useDialecticStore.getState();
      const result = await autoStartGeneration();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Wallet not ready');
      expect(mockDialecticApi.generateContributions).not.toHaveBeenCalled();
    });

    it('returns descriptive error when walletInfo.walletId is falsy', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        activeContextSessionId: sessionId,
        activeContextStage: { slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null },
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: null,
          iteration_count: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z',
          selected_models: [],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: null,
          user_input_reference_url: null,
        },
        selectedModels: [{ id: 'm1', displayName: 'Model One' }],
      });
      const walletNoId: TokenWallet = {
        ...walletWithBalance('500000'),
        walletId: '',
      };
      useWalletStore.setState({
        personalWallet: walletNoId,
        isLoadingPersonalWallet: false,
        personalWalletError: null,
      });

      const { autoStartGeneration } = useDialecticStore.getState();
      const result = await autoStartGeneration();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No wallet available');
      expect(mockDialecticApi.generateContributions).not.toHaveBeenCalled();
    });

    it('returns descriptive error when Number(walletInfo.balance) < STAGE_BALANCE_THRESHOLDS[stageSlug]', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        activeContextSessionId: sessionId,
        activeContextStage: { slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null },
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: null,
          iteration_count: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z',
          selected_models: [],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: null,
          user_input_reference_url: null,
        },
        selectedModels: [{ id: 'm1', displayName: 'Model One' }],
      });
      useWalletStore.setState({
        personalWallet: walletWithBalance('1000'),
        isLoadingPersonalWallet: false,
        personalWalletError: null,
      });

      const { autoStartGeneration } = useDialecticStore.getState();
      const result = await autoStartGeneration();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Wallet balance too low');
      expect(mockDialecticApi.generateContributions).not.toHaveBeenCalled();
    });

    it('returns success when all preconditions met and generateContributions succeeds', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        activeContextSessionId: sessionId,
        activeContextStage: { slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null },
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: null,
          iteration_count: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z',
          selected_models: [],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: null,
          user_input_reference_url: null,
        },
        selectedModels: [{ id: 'm1', displayName: 'Model One' }],
      });
      useWalletStore.setState({
        personalWallet: walletWithBalance('500000'),
        isLoadingPersonalWallet: false,
        personalWalletError: null,
      });
      mockDialecticApi.generateContributions.mockResolvedValue({
        data: { sessionId, projectId, stage: stageSlug, iteration: 1, status: 'ok', successfulContributions: [], failedAttempts: [], job_ids: ['job-1'] },
        status: 200,
      });

      const { autoStartGeneration } = useDialecticStore.getState();
      const result = await autoStartGeneration();

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns error when generateContributions fails', async () => {
      useDialecticStore.setState({
        ...initialDialecticStateValues,
        currentProjectDetail: projectWithStages(projectId, [{ slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null }]),
        activeContextSessionId: sessionId,
        activeContextStage: { slug: stageSlug, display_name: 'Thesis', expected_output_template_ids: [], id: 'stage-1', recipe_template_id: null, created_at: '2023-01-01T00:00:00.000Z', default_system_prompt_id: null, description: null, active_recipe_instance_id: null },
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: null,
          iteration_count: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z',
          selected_models: [],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: null,
          user_input_reference_url: null,
        },
        selectedModels: [{ id: 'm1', displayName: 'Model One' }],
      });
      useWalletStore.setState({
        personalWallet: walletWithBalance('500000'),
        isLoadingPersonalWallet: false,
        personalWalletError: null,
      });
      mockDialecticApi.generateContributions.mockResolvedValue({
        error: { code: 'GEN_FAIL', message: 'Generation failed' },
        status: 500,
      });

      const { autoStartGeneration } = useDialecticStore.getState();
      const result = await autoStartGeneration();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Generation failed');
    });
  });
});
