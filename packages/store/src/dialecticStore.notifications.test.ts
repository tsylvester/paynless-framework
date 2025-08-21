import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDialecticStore, initialDialecticStateValues } from './dialecticStore';
import type {
  ApiError,
  DialecticProject,
  DialecticSession,
  AIModelCatalogEntry,
  DialecticLifecycleEvent,
  GenerateContributionsResponse,
} from '@paynless/types';
import { api } from '@paynless/api';
import { resetApiMock, getMockDialecticClient } from '@paynless/api/mocks';

// Mock the entire API module
vi.mock('@paynless/api', async () => {
  const { api, resetApiMock, getMockDialecticClient } = await import('@paynless/api/mocks');
  return {
    api,
    resetApiMock,
    getMockDialecticClient,
  };
});

// Mock Data
const mockModel1: AIModelCatalogEntry = {
    id: 'model-1',
    model_name: 'Test Model 1',
    api_identifier: 'test-model-1',
    provider_name: 'TestProvider',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: true,
    description: null,
    strengths: null,
    weaknesses: null,
    context_window_tokens: null,
    input_token_cost_usd_millionths: null,
    output_token_cost_usd_millionths: null,
    max_output_tokens: null,
};

const mockModel2: AIModelCatalogEntry = {
    id: 'model-2',
    model_name: 'Test Model 2',
    api_identifier: 'test-model-2',
    provider_name: 'TestProvider',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: true,
    description: null,
    strengths: null,
    weaknesses: null,
    context_window_tokens: null,
    input_token_cost_usd_millionths: null,
    output_token_cost_usd_millionths: null,
    max_output_tokens: null,
};


const mockSession: DialecticSession = {
    id: 'session-1',
    project_id: 'proj-1',
    status: 'active',
    iteration_count: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_stage_id: 'stage-1',
    selected_model_ids: ['model-1', 'model-2'],
    dialectic_contributions: [],
    session_description: null,
    user_input_reference_url: null,
    associated_chat_id: null,
};

const mockProject: DialecticProject = {
    id: 'proj-1',
    user_id: 'user-1',
    project_name: 'Test Project',
    selected_domain_id: 'domain-1',
    dialectic_domains: { name: 'Test Domain' },
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_sessions: [mockSession],
    dialectic_process_templates: null,
    process_template_id: 'pt-1',
    isLoadingProcessTemplate: false,
    processTemplateError: null,
    contributionGenerationStatus: 'idle',
    generateContributionsError: null,
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
    isSavingContributionEdit: false,
    saveContributionEditError: null,
    initial_user_prompt: 'Test',
    initial_prompt_resource_id: null,
    selected_domain_overlay_id: null,
    repo_url: null,
};


describe('Dialectic Store Notification Handlers', () => {
  beforeEach(() => {
    resetApiMock();
    // Set a clean initial state for the store before each test
    useDialecticStore.setState({
      ...initialDialecticStateValues,
      currentProjectDetail: JSON.parse(JSON.stringify(mockProject)), // Deep copy
      modelCatalog: [mockModel1, mockModel2],
      selectedModelIds: ['model-1', 'model-2'],
    });
    vi.clearAllMocks();
  });

  it('should correctly update placeholder status on a multi-model generation', async () => {
    const { generateContributions, _handleDialecticLifecycleEvent } = useDialecticStore.getState();

    // Mock the API call for generateContributions
    const mockApiResponse: GenerateContributionsResponse = {
      sessionId: 'session-1',
      projectId: 'proj-1',
      stage: 'test-stage',
      iteration: 1,
      status: 'pending',
      job_ids: ['job-1', 'job-2'],
      successfulContributions: [],
      failedAttempts: [],
    };
    getMockDialecticClient().generateContributions.mockResolvedValue({
        data: mockApiResponse,
        status: 202
    });

    // 1. Initiate the generation for two models
    await generateContributions({
      sessionId: 'session-1',
      projectId: 'proj-1',
      stageSlug: 'test-stage',
      iterationNumber: 1,
      continueUntilComplete: false,
    });
    
    // Verify that two placeholders were created
    let state = useDialecticStore.getState();
    const sessionContributions = state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
    expect(sessionContributions).toHaveLength(2);
    expect(sessionContributions?.[0].status).toBe('pending');
    expect(sessionContributions?.[1].status).toBe('pending');
    expect(sessionContributions?.[1].model_id).toBe('model-2');

    // 2. Simulate a notification for the SECOND model starting generation
    const startNotification: DialecticLifecycleEvent = {
      type: 'dialectic_contribution_started',
      sessionId: 'session-1',
      modelId: 'model-2', // Specifically targeting the second model
      iterationNumber: 1,
      job_id: 'job-2', // This is the critical missing piece
    };

    if (_handleDialecticLifecycleEvent) {
        _handleDialecticLifecycleEvent(startNotification);
    }
    
    // 3. Assert that the second placeholder's status was updated
    state = useDialecticStore.getState();
    const updatedContributions = state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
    
    // This assertion is now expected to PASS
    expect(updatedContributions?.[1].status).toBe('generating');
  });

  it('should update a placeholder to a received contribution', async () => {
    const { generateContributions, _handleDialecticLifecycleEvent } = useDialecticStore.getState();
    const mockApiResponse: GenerateContributionsResponse = {
      sessionId: 'session-1',
      projectId: 'proj-1',
      stage: 'test-stage',
      iteration: 1,
      status: 'pending',
      job_ids: ['job-1', 'job-2'],
      successfulContributions: [],
      failedAttempts: [],
    };
    getMockDialecticClient().generateContributions.mockResolvedValue({ data: mockApiResponse, status: 202 });

    await generateContributions({
      sessionId: 'session-1',
      projectId: 'proj-1',
      stageSlug: 'test-stage',
      iterationNumber: 1,
      continueUntilComplete: false,
    });

    const receivedContribution = {
        id: 'real-contrib-1',
        model_id: 'model-1',
        iteration_number: 1,
        // ... other required fields
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'test-stage',
        prompt_template_id_used: null,
        seed_prompt_url: null,
        edit_version: 0,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        target_contribution_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        processing_time_ms: null,
        error: null,
        citations: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        contribution_type: null,
        file_name: null,
        storage_bucket: null,
        storage_path: null,
        size_bytes: null,
        mime_type: null,
        model_name: 'Test Model 1',
    };

    const receivedNotification: DialecticLifecycleEvent = {
      type: 'dialectic_contribution_received',
      sessionId: 'session-1',
      contribution: receivedContribution,
      job_id: 'job-1',
    };
    
    if (_handleDialecticLifecycleEvent) {
        _handleDialecticLifecycleEvent(receivedNotification);
    }
    
    const state = useDialecticStore.getState();
    const updatedContributions = state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
    expect(updatedContributions?.[0].id).toBe('real-contrib-1');
    expect(updatedContributions?.[0].status).toBe('completed');
  });
  
  it('should mark remaining placeholders as failed on a session-wide failure', async () => {
      const { generateContributions, _handleDialecticLifecycleEvent } = useDialecticStore.getState();
      const mockApiResponse: GenerateContributionsResponse = {
          sessionId: 'session-1',
          projectId: 'proj-1',
          stage: 'test-stage',
          iteration: 1,
          status: 'pending',
          job_ids: ['job-1', 'job-2'],
          successfulContributions: [],
          failedAttempts: [],
      };
      getMockDialecticClient().generateContributions.mockResolvedValue({ data: mockApiResponse, status: 202 });
      
      await generateContributions({
          sessionId: 'session-1',
          projectId: 'proj-1',
          stageSlug: 'test-stage',
          iterationNumber: 1,
          continueUntilComplete: false,
      });

      const failureNotification: DialecticLifecycleEvent = {
          type: 'contribution_generation_failed',
          sessionId: 'session-1',
          error: { code: 'FATAL', message: 'Something went wrong' }
      };
      
      if (_handleDialecticLifecycleEvent) {
          _handleDialecticLifecycleEvent(failureNotification);
      }
      
      const state = useDialecticStore.getState();
      const updatedContributions = state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
      expect(updatedContributions?.[0].status).toBe('failed');
      expect(updatedContributions?.[1].status).toBe('failed');
      expect(updatedContributions?.[0].error?.message).toBe('Something went wrong');
  });

  it('should update a placeholder to retrying', async () => {
    const { generateContributions, _handleDialecticLifecycleEvent } = useDialecticStore.getState();

    // Mock the API call for generateContributions
    const mockApiResponse: GenerateContributionsResponse = {
      sessionId: 'session-1',
      projectId: 'proj-1',
      stage: 'test-stage',
      iteration: 1,
      status: 'pending',
      job_ids: ['job-1', 'job-2'],
      successfulContributions: [],
      failedAttempts: [],
    };
    getMockDialecticClient().generateContributions.mockResolvedValue({
        data: mockApiResponse,
        status: 202
    });

    await generateContributions({
      sessionId: 'session-1',
      projectId: 'proj-1',
      stageSlug: 'test-stage',
      iterationNumber: 1,
      continueUntilComplete: false,
    });
    
    // First, mark it as generating
    _handleDialecticLifecycleEvent?.({
      type: 'dialectic_contribution_started',
      sessionId: 'session-1',
      modelId: 'model-1',
      iterationNumber: 1,
      job_id: 'job-1', // This is the critical missing piece
    });

    const retryingNotification: DialecticLifecycleEvent = {
        type: 'contribution_generation_retrying',
        sessionId: 'session-1',
        modelId: 'model-1',
        iterationNumber: 1,
        error: 'Model timed out',
        job_id: 'job-1', // This is the critical missing piece
    };
    
    _handleDialecticLifecycleEvent?.(retryingNotification);
    
    const state = useDialecticStore.getState();
    const updatedContributions = state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
    expect(updatedContributions?.[0].status).toBe('retrying');
    expect(updatedContributions?.[0].error?.message).toBe('Model timed out');
  });

  it('should update session progress on progress update notification', () => {
      const { _handleDialecticLifecycleEvent } = useDialecticStore.getState();
      
      const progressNotification: DialecticLifecycleEvent = {
          type: 'dialectic_progress_update',
          sessionId: 'session-1',
          stageSlug: 'test-stage',
          current_step: 5,
          total_steps: 10,
          message: 'Processing item 5 of 10...'
      };

      _handleDialecticLifecycleEvent?.(progressNotification);

      const state = useDialecticStore.getState();
      const progress = state.sessionProgress['session-1'];
      expect(progress).toBeDefined();
      expect(progress.current_step).toBe(5);
      expect(progress.total_steps).toBe(10);
      expect(progress.message).toBe('Processing item 5 of 10...');
  });

  it('should clear generating status and refetch project on completion', async () => {
      const { generateContributions, _handleDialecticLifecycleEvent, fetchDialecticProjectDetails } = useDialecticStore.getState();
      
      // Spy on fetchDialecticProjectDetails
      const fetchDetailsSpy = vi.spyOn(useDialecticStore.getState(), 'fetchDialecticProjectDetails');
      
      // Mock the API call for generateContributions
      const mockApiResponse: GenerateContributionsResponse = {
        sessionId: 'session-1',
        projectId: 'proj-1',
        stage: 'test-stage',
        iteration: 1,
        status: 'pending',
        job_ids: ['job-1', 'job-2'],
        successfulContributions: [],
        failedAttempts: [],
      };
      getMockDialecticClient().generateContributions.mockResolvedValue({
          data: mockApiResponse,
          status: 202
      });

      await generateContributions({
          sessionId: 'session-1',
          projectId: 'proj-1',
          stageSlug: 'test-stage',
          iterationNumber: 1,
          continueUntilComplete: false,
      });

      // Check that the session is being tracked as generating
      expect(useDialecticStore.getState().generatingSessions['session-1']).toBeDefined();

      const completionNotification: DialecticLifecycleEvent = {
          type: 'contribution_generation_complete',
          sessionId: 'session-1',
          projectId: 'proj-1',
      };

      _handleDialecticLifecycleEvent?.(completionNotification);

      // Verify session is no longer tracked as generating
      expect(useDialecticStore.getState().generatingSessions['session-1']).toBeUndefined();
      
      // Verify that the store attempts to refetch the project details
      expect(fetchDetailsSpy).toHaveBeenCalledWith('proj-1');
      
      fetchDetailsSpy.mockRestore();
  });

  it('should update a contribution status to continuing', async () => {
    const { generateContributions, _handleDialecticLifecycleEvent } = useDialecticStore.getState();
    await generateContributions({
      sessionId: 'session-1',
      projectId: 'proj-1',
      stageSlug: 'test-stage',
      iterationNumber: 1,
      continueUntilComplete: false,
    });

    const continuingContribution = {
        id: 'real-contrib-1',
        model_id: 'model-1',
        iteration_number: 1,
        status: 'generating', // It was generating, now it's continuing
        // ... other required fields ...
        session_id: 'session-1', user_id: 'user-1', stage: 'test-stage', prompt_template_id_used: null, seed_prompt_url: null, edit_version: 0, is_latest_edit: true, original_model_contribution_id: null, raw_response_storage_path: null, target_contribution_id: null, tokens_used_input: null, tokens_used_output: null, processing_time_ms: null, error: null, citations: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), contribution_type: null, file_name: null, storage_bucket: null, storage_path: null, size_bytes: null, mime_type: null, model_name: 'Test Model 1',
    };

    const continueNotification: DialecticLifecycleEvent = {
        type: 'contribution_generation_continued',
        sessionId: 'session-1',
        projectId: 'proj-1',
        modelId: 'model-1',
        continuationNumber: 2,
        contribution: continuingContribution,
        job_id: 'job-1-cont',
    };

    _handleDialecticLifecycleEvent?.(continueNotification);

    const state = useDialecticStore.getState();
    const updatedContributions = state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
    expect(updatedContributions?.[0].status).toBe('continuing');
    expect(updatedContributions?.[0].id).toBe('real-contrib-1');
  });

  it('should add a received contribution directly if its placeholder is not found', () => {
    const { _handleDialecticLifecycleEvent } = useDialecticStore.getState();
    const stateBefore = useDialecticStore.getState();
    expect(stateBefore.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions).toHaveLength(0);

    const newContribution = {
        id: 'orphan-contrib-1',
        model_id: 'model-3', // A model that wasn't in the initial generation
        iteration_number: 1,
        // ... other required fields ...
        session_id: 'session-1', user_id: 'user-1', stage: 'test-stage', prompt_template_id_used: null, seed_prompt_url: null, edit_version: 0, is_latest_edit: true, original_model_contribution_id: null, raw_response_storage_path: null, target_contribution_id: null, tokens_used_input: null, tokens_used_output: null, processing_time_ms: null, error: null, citations: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), contribution_type: null, file_name: null, storage_bucket: null, storage_path: null, size_bytes: null, mime_type: null, model_name: 'Test Model 3',
    };

    const receivedNotification: DialecticLifecycleEvent = {
      type: 'dialectic_contribution_received',
      sessionId: 'session-1',
      contribution: newContribution,
      job_id: 'job-3',
    };

    _handleDialecticLifecycleEvent?.(receivedNotification);

    const stateAfter = useDialecticStore.getState();
    const contributions = stateAfter.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
    expect(contributions).toHaveLength(1);
    expect(contributions?.[0].id).toBe('orphan-contrib-1');
    expect(contributions?.[0].status).toBe('completed');
  });

  it('should correctly update placeholders when the same model is used multiple times', async () => {
    // Setup state with duplicate models
    useDialecticStore.setState({ selectedModelIds: ['model-1', 'model-1'] });
    const { generateContributions, _handleDialecticLifecycleEvent } = useDialecticStore.getState();

    // Mock the API call for generateContributions
    const mockApiResponse: GenerateContributionsResponse = {
      sessionId: 'session-1',
      projectId: 'proj-1',
      stage: 'test-stage',
      iteration: 1,
      status: 'pending',
      job_ids: ['job-1', 'job-2'],
      successfulContributions: [],
      failedAttempts: [],
    };
    getMockDialecticClient().generateContributions.mockResolvedValue({
        data: mockApiResponse,
        status: 202
    });

    await generateContributions({
        sessionId: 'session-1',
        projectId: 'proj-1',
        stageSlug: 'test-stage',
        iterationNumber: 1,
        continueUntilComplete: false,
    });
    
    // Check for two placeholders for model-1
    const contributions = useDialecticStore.getState().currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
    expect(contributions).toHaveLength(2);
    expect(contributions?.[0].model_id).toBe('model-1');
    expect(contributions?.[1].model_id).toBe('model-1');

    // First notification for model-1
    _handleDialecticLifecycleEvent?.({
        type: 'dialectic_contribution_started',
        sessionId: 'session-1',
        modelId: 'model-1',
        iterationNumber: 1,
        job_id: 'job-1', // This is the critical missing piece
    });

    let state = useDialecticStore.getState();
    const contribsAfterFirst = state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
    expect(contribsAfterFirst?.[0].status).toBe('generating');
    expect(contribsAfterFirst?.[1].status).toBe('pending');

    // Second notification for model-1
    _handleDialecticLifecycleEvent?.({
        type: 'dialectic_contribution_started',
        sessionId: 'session-1',
        modelId: 'model-1',
        iterationNumber: 1,
        job_id: 'job-2', // This is the critical missing piece
    });

    state = useDialecticStore.getState();
    const contribsAfterSecond = state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
    expect(contribsAfterSecond?.[0].status).toBe('generating');
    expect(contribsAfterSecond?.[1].status).toBe('generating');
  });

});
