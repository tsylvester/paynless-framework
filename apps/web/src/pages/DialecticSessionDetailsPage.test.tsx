import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DialecticSessionDetailsPage } from './DialecticSessionDetailsPage';
import { setDialecticState, resetDialecticStoreMock, getDialecticStoreState } from '../mocks/dialecticStore.mock';
import type {
  DialecticProject,
  DialecticSession,
  DialecticStage,
  DialecticProcessTemplate,
} from '@paynless/types';

// Use the centralized mock for the store
vi.mock('@paynless/store', () => import('../mocks/dialecticStore.mock'));

// Mock child components
vi.mock('../components/dialectic/SessionInfoCard', () => ({ SessionInfoCard: () => <div data-testid="mock-session-info-card" /> }));
vi.mock('../components/dialectic/StageTabCard', () => ({
  StageTabCard: ({ stage, isActiveStage }: { stage: DialecticStage; isActiveStage: boolean }) => (
    <div data-testid={`mock-stage-tab-card-${stage.slug}`} data-active={String(isActiveStage)}>
      {stage.display_name}
    </div>
  ),
}));
vi.mock('../components/dialectic/SessionContributionsDisplayCard', () => ({ SessionContributionsDisplayCard: () => <div data-testid="mock-session-contributions-display-card" /> }));

// Define Mocks
const mockProjectId = 'project-123';
const mockSessionId = 'session-abc';

const mockStages: DialecticStage[] = [
    { id: 'stage-1', slug: 'hypothesis', display_name: 'Hypothesis', description: 'desc', created_at: 'now', default_system_prompt_id: 'p1', input_artifact_rules: {}, expected_output_artifacts: {}},
    { id: 'stage-2', slug: 'antithesis', display_name: 'Antithesis', description: 'desc', created_at: 'now', default_system_prompt_id: 'p1', input_artifact_rules: {}, expected_output_artifacts: {}},
];

const mockProcessTemplate: DialecticProcessTemplate = {
  id: 'pt-1',
  name: 'Standard Dialectic',
  description: 'A standard process',
  created_at: 'now',
  stages: mockStages,
  starting_stage_id: 'stage-1',
};

const mockSession: DialecticSession = {
  id: mockSessionId,
  project_id: mockProjectId,
  session_description: 'Test Session',
  current_stage_id: mockStages[0].id,
  iteration_count: 1,
  created_at: '2023-01-01T09:00:00Z',
  updated_at: '2023-01-01T11:05:00Z',
  status: 'active',
  associated_chat_id: null,
  user_input_reference_url: null,
  selected_model_catalog_ids: [],
};

const mockProject: DialecticProject = {
  id: mockProjectId,
  user_id: 'user-test',
  project_name: 'Test Project',
  initial_user_prompt: 'This is the initial user prompt.',
  created_at: '2023-01-01T08:00:00Z',
  updated_at: '2023-01-01T08:00:00Z',
  dialectic_sessions: [mockSession],
  repo_url: null,
  selected_domain_id: 'domain-1',
  dialectic_domains: { name: 'Software Development' },
  selected_domain_overlay_id: 'overlay-1',
  status: 'active',
  process_template_id: 'pt-1',
  dialectic_process_templates: mockProcessTemplate,
};

const renderWithRouter = (
  {
    route = `/dialectic/${mockProjectId}/session/${mockSessionId}`,
    path = '/dialectic/:projectId/session/:sessionId',
  }: { route?: string; path?: string; } = {},
) => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={<DialecticSessionDetailsPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('DialecticSessionDetailsPage', () => {
  beforeEach(() => {
    resetDialecticStoreMock();
  });

  it('should fetch project details if not available in the store', async () => {
    setDialecticState({ currentProjectDetail: null });
    const store = getDialecticStoreState();
    
    renderWithRouter({});

    await waitFor(() => {
      expect(store.fetchDialecticProjectDetails).toHaveBeenCalledWith(mockProjectId);
    });
  });

  it('should render session details and correctly identify active stage when project is already in store', async () => {
    setDialecticState({
      currentProjectDetail: mockProject,
      currentProcessTemplate: mockProcessTemplate,
      activeContextStage: mockStages[0],
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(screen.getByTestId('mock-session-info-card')).toBeInTheDocument();
    });

    const hypothesisTab = screen.getByTestId('mock-stage-tab-card-hypothesis');
    const antithesisTab = screen.getByTestId('mock-stage-tab-card-antithesis');

    expect(hypothesisTab).toHaveAttribute('data-active', 'true');
    expect(antithesisTab).toHaveAttribute('data-active', 'false');

    expect(screen.getByTestId('mock-session-contributions-display-card')).toBeInTheDocument();
  });
}); 