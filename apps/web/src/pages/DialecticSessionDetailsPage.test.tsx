import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import { DialecticSessionDetailsPage } from './DialecticSessionDetailsPage';
import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type {
  DialecticProject,
  DialecticSession,
  DialecticStore,
  DialecticStage,
} from '@paynless/types';

// Mock the store
vi.mock('@paynless/store', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    useDialecticStore: vi.fn(),
  };
});

// Mock react-router-dom
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: vi.fn(),
    Link: vi.fn(({ to, children, ...props }) => <a href={typeof to === 'string' ? to : '#'} {...props}>{children}</a>),
  };
});

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

vi.mock('@/components/dialectic/DialecticStageSelector', () => ({
  DialecticStageSelector: {
    hypothesis: { id: 'stage-id-hypothesis', display_name: 'Hypothesis', slug: 'hypothesis', description: 'Generate ideas', created_at: new Date().toISOString(), default_system_prompt_id: null, expected_output_artifacts: null, input_artifact_rules: null },
    antithesis: { id: 'stage-id-antithesis', display_name: 'Antithesis', slug: 'antithesis', description: 'Critique ideas', created_at: new Date().toISOString(), default_system_prompt_id: null, expected_output_artifacts: null, input_artifact_rules: null },
  },
}));

const mockSession: DialecticSession = {
  id: mockSessionId,
  project_id: mockProjectId,
  session_description: 'Test Session Description',
  current_stage_id: 'hypothesis',
  iteration_count: 1,
  created_at: '2023-01-01T09:00:00Z',
  updated_at: '2023-01-01T11:05:00Z',
  dialectic_contributions: [],
  status: 'active',
  associated_chat_id: null,
  user_input_reference_url: 'https://example.com/user-input',
  selected_model_catalog_ids: ['model-1', 'model-2'],
};

const mockProject: DialecticProject = {
  id: mockProjectId,
  user_id: 'user-test',
  project_name: 'Test Project',
  initial_user_prompt: 'This is the initial user prompt for the project.',
  created_at: '2023-01-01T08:00:00Z',
  updated_at: '2023-01-01T08:00:00Z',
  dialectic_sessions: [mockSession],
  repo_url: 'https://github.com/paynless/test-project',
  selected_domain_id: 'domain-uuid-1',
  domain_name: 'Software Development',
  selected_domain_overlay_id: 'domain-overlay-uuid-1',
  status: 'active',
};

const createMockStore = (overrides: Partial<DialecticStore> = {}): DialecticStore => ({
  ...initialDialecticStateValues,
  fetchDialecticProjects: vi.fn(),
  fetchDialecticProjectDetails: vi.fn(),
  createDialecticProject: vi.fn(),
  startDialecticSession: vi.fn(),
  fetchAIModelCatalog: vi.fn(),
  fetchContributionContent: vi.fn(),
  fetchAvailableDomainOverlays: vi.fn(),
  setSelectedStageAssociation: vi.fn(),
  setSelectedDomainOverlayId: vi.fn(),
  uploadProjectResourceFile: vi.fn(),
  resetCreateProjectError: vi.fn(),
  resetProjectDetailsError: vi.fn(),
  deleteDialecticProject: vi.fn(),
  cloneDialecticProject: vi.fn(),
  exportDialecticProject: vi.fn(),
  updateDialecticProjectInitialPrompt: vi.fn(),
  setStartNewSessionModalOpen: vi.fn(),
  setModelMultiplicity: vi.fn(),
  resetSelectedModelId: vi.fn(),
  fetchInitialPromptContent: vi.fn(),
  generateContributions: vi.fn(),
  submitStageResponses: vi.fn(),
  resetSubmitStageResponsesError: vi.fn(),
  saveContributionEdit: vi.fn(),
  resetSaveContributionEditError: vi.fn(),
  setActiveContextProjectId: vi.fn(),
  setActiveContextSessionId: vi.fn(),
  setActiveContextStageSlug: vi.fn(),
  setActiveDialecticContext: vi.fn(),
  fetchDomains: vi.fn(),
  setSelectedDomain: vi.fn(),
  ...overrides,
});

const renderWithRouter = (
  ui: React.ReactElement,
  {
    route = `/dialectic/${mockProjectId}/session/${mockSessionId}`,
    path = '/dialectic/:projectId/session/:sessionId',
    initialEntries = [route],
  }: { route?: string; path?: string; initialEntries?: string[] } = {},
) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path={path} element={ui} />
      </Routes>
    </MemoryRouter>
  );
};

describe('DialecticSessionDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
  });

  it('should fetch project details if not available in the store', () => {
    const mockStore = createMockStore({ currentProjectDetail: null });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    
    renderWithRouter(<DialecticSessionDetailsPage />);

    expect(mockStore.fetchDialecticProjectDetails).toHaveBeenCalledWith(mockProjectId);
  });

  it('should render session details and correctly identify active stage when project is already in store', async () => {
    const mockActiveStage = { id: 'stage-id-hypothesis', display_name: 'Hypothesis', slug: 'hypothesis', description: 'Generate ideas', created_at: new Date().toISOString(), default_system_prompt_id: null, expected_output_artifacts: null, input_artifact_rules: null };
    const mockStore = createMockStore({
      currentProjectDetail: mockProject,
      activeContextStageSlug: mockActiveStage, // Pre-set active stage for testing
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    renderWithRouter(<DialecticSessionDetailsPage />);

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