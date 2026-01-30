import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDialecticStore } from './dialecticStore';
import type {
  ApiResponse,
  DialecticProcessTemplate,
  DialecticStage,
  DialecticProject,
  DialecticSession,
} from '@paynless/types';

vi.mock('@paynless/api', async () => {
  const { api, resetApiMock, getMockDialecticClient } = await import(
    '@paynless/api/mocks'
  );
  return {
    api,
    initializeApiClient: vi.fn(),
    resetApiMock,
    getMockDialecticClient,
  };
});

import { resetApiMock, getMockDialecticClient } from '@paynless/api/mocks';

const thesisStage: DialecticStage = {
  id: 'stage-1',
  slug: 'thesis',
  description: 'Thesis stage',
  created_at: new Date().toISOString(),
  display_name: 'Thesis',
  default_system_prompt_id: null,
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
};

const antithesisStage: DialecticStage = {
  id: 'stage-2',
  slug: 'antithesis',
  description: 'Antithesis stage',
  created_at: new Date().toISOString(),
  display_name: 'Antithesis',
  default_system_prompt_id: null,
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
};

const templateWithStages: DialecticProcessTemplate = {
  id: 'pt1',
  name: 'Standard Dialectic',
  description: 'A standard template',
  created_at: new Date().toISOString(),
  starting_stage_id: 'stage-1',
  stages: [thesisStage, antithesisStage],
};

const sessionWithThesisStage: DialecticSession = {
  id: 'session-1',
  project_id: 'proj-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  current_stage_id: 'stage-1',
  selected_model_ids: [],
  dialectic_contributions: [],
  feedback: [],
  session_description: null,
  user_input_reference_url: null,
  iteration_count: 1,
  status: 'active',
  associated_chat_id: null,
  dialectic_session_models: [],
};

const currentProjectDetailWithSession: DialecticProject = {
  id: 'proj-1',
  project_name: 'Test Project',
  selected_domain_id: 'domain-1',
  user_id: 'user-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: 'active',
  initial_user_prompt: null,
  initial_prompt_resource_id: null,
  selected_domain_overlay_id: null,
  repo_url: null,
  process_template_id: 'pt1',
  dialectic_domains: { name: 'Test' },
  dialectic_sessions: [sessionWithThesisStage],
  dialectic_process_templates: null,
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
};

describe('fetchProcessTemplate stage guard', () => {
  beforeEach(() => {
    resetApiMock();
    useDialecticStore.getState()._resetForTesting?.();
    vi.clearAllMocks();
  });

  it('sets activeContextStage on initial load when activeStageSlug is null', async () => {
    const mockResponse: ApiResponse<DialecticProcessTemplate> = {
      data: templateWithStages,
      status: 200,
    };
    getMockDialecticClient().fetchProcessTemplate.mockResolvedValue(mockResponse);

    useDialecticStore.setState({
      currentProjectDetail: currentProjectDetailWithSession,
      activeStageSlug: null,
      activeContextStage: null,
    });

    const { fetchProcessTemplate } = useDialecticStore.getState();
    await fetchProcessTemplate('pt1');

    const state = useDialecticStore.getState();
    expect(state.activeContextStage).toEqual(thesisStage);
    expect(state.currentProcessTemplate).toEqual(templateWithStages);
  });

  it('does not overwrite activeContextStage when activeStageSlug is already set', async () => {
    const mockResponse: ApiResponse<DialecticProcessTemplate> = {
      data: templateWithStages,
      status: 200,
    };
    getMockDialecticClient().fetchProcessTemplate.mockResolvedValue(mockResponse);

    useDialecticStore.setState({
      currentProjectDetail: currentProjectDetailWithSession,
      activeStageSlug: 'antithesis',
      activeContextStage: antithesisStage,
    });

    const { fetchProcessTemplate } = useDialecticStore.getState();
    await fetchProcessTemplate('pt1');

    const state = useDialecticStore.getState();
    expect(state.activeStageSlug).toBe('antithesis');
    expect(state.activeContextStage).toEqual(antithesisStage);
    expect(state.currentProcessTemplate).toEqual(templateWithStages);
  });

  it('does not change activeContextStage or activeStageSlug when fetchProcessTemplate is called again after user has selected stage', async () => {
    const mockResponse: ApiResponse<DialecticProcessTemplate> = {
      data: templateWithStages,
      status: 200,
    };
    getMockDialecticClient().fetchProcessTemplate.mockResolvedValue(mockResponse);

    useDialecticStore.setState({
      currentProjectDetail: currentProjectDetailWithSession,
      activeStageSlug: null,
      activeContextStage: null,
    });

    const { fetchProcessTemplate, setActiveStage } = useDialecticStore.getState();
    await fetchProcessTemplate('pt1');

    const afterFirst = useDialecticStore.getState();
    expect(afterFirst.activeContextStage).toEqual(thesisStage);
    expect(afterFirst.activeStageSlug).toBeNull();

    setActiveStage('antithesis');
    useDialecticStore.setState({ activeContextStage: antithesisStage });

    await fetchProcessTemplate('pt1');

    const afterSecond = useDialecticStore.getState();
    expect(afterSecond.activeStageSlug).toBe('antithesis');
    expect(afterSecond.activeContextStage).toEqual(antithesisStage);
  });

  it('allows activeContextStage to be set via setActiveContextStage when user navigates explicitly', () => {
    useDialecticStore.setState({
      activeStageSlug: 'thesis',
      activeContextStage: thesisStage,
    });

    const { setActiveContextStage } = useDialecticStore.getState();
    setActiveContextStage(antithesisStage);

    const state = useDialecticStore.getState();
    expect(state.activeContextStage).toEqual(antithesisStage);
  });
});
