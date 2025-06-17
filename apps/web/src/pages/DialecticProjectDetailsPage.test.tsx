import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DialecticProjectDetailsPage } from './DialecticProjectDetailsPage';
import { setDialecticState, resetDialecticStoreMock, getDialecticStoreState } from '../mocks/dialecticStore.mock';
import type { DialecticProject, ApiError, DialecticSession, DialecticStage, DialecticProcessTemplate } from '@paynless/types';

// Mock child components
vi.mock('@/components/dialectic/InitialProblemStatement', () => ({
  InitialProblemStatement: () => <div data-testid="initial-problem-statement-mock" />,
}));
vi.mock('@/components/dialectic/ProjectSessionsList', () => ({
  ProjectSessionsList: ({ onStartNewSession }: { onStartNewSession: () => void }) => (
    <div data-testid="project-sessions-list-mock">
      <button onClick={onStartNewSession}>Trigger Session From List</button>
    </div>
  ),
}));

// Use the centralized mock for the store
vi.mock('@paynless/store', () => import('../mocks/dialecticStore.mock'));

const mockProjectId = 'project-123';

const mockInitialStage: DialecticStage = {
    id: 'stage-1',
    created_at: new Date().toISOString(),
    slug: 'hypothesis-generation',
    display_name: 'Hypothesis Generation',
    description: 'Generate initial hypotheses.',
    input_artifact_rules: {},
    expected_output_artifacts: {},
    default_system_prompt_id: 'sp-1',
};

const mockProcessTemplate: Omit<DialecticProcessTemplate, 'stages' | 'transitions'> & { stages: DialecticStage[] } = {
  id: 'pt-1',
  name: 'Standard Dialectic',
  description: 'A standard process',
  created_at: 'now',
  stages: [mockInitialStage],
  starting_stage_id: 'stage-1',
};

const mockProject: DialecticProject = {
  id: mockProjectId,
  user_id: 'user-123',
  project_name: 'Detailed Project Name',
  initial_user_prompt: 'The initial prompt.',
  selected_domain_id: 'domain-1',
  dialectic_domains: { name: 'Software Engineering' },
  selected_domain_overlay_id: 'overlay-1',
  repo_url: null,
  status: 'active',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  dialectic_sessions: [],
  resources: [],
  process_template_id: 'pt-1',
  dialectic_process_templates: mockProcessTemplate as DialecticProcessTemplate,
};

const mockSession: DialecticSession = {
    id: 'ses-abc',
    project_id: mockProjectId,
    session_description: 'A session for testing.',
    user_input_reference_url: null,
    iteration_count: 1,
    selected_model_catalog_ids: [],
    status: 'active',
    associated_chat_id: null,
    current_stage_id: 'stage-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

const renderWithRouter = (route: string) => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/dialectic/:projectId" element={<DialecticProjectDetailsPage />} />
        <Route path="/dialectic/:projectId/session/:sessionId" element={<div>Session Page</div>} />
        <Route path="/dialectic" element={<div>Projects List</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('DialecticProjectDetailsPage', () => {
  beforeEach(() => {
    resetDialecticStoreMock();
  });

  it('calls fetchDialecticProjectDetails with projectId on mount and shows loading skeletons', () => {
    setDialecticState({ isLoadingProjectDetail: true });
    const { container } = renderWithRouter(`/dialectic/${mockProjectId}`);
    const store = getDialecticStoreState();
    expect(store.fetchDialecticProjectDetails).toHaveBeenCalledWith(mockProjectId);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('displays error message if projectDetailError is present', () => {
    const error: ApiError = { message: 'Failed to load project', code: '404' };
    setDialecticState({ projectDetailError: error });
    renderWithRouter(`/dialectic/${mockProjectId}`);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText(error.message)).toBeInTheDocument();
  });

  it('displays "Project not found" message if no project is loaded and not loading', () => {
    setDialecticState({ currentProjectDetail: null, isLoadingProjectDetail: false });
    renderWithRouter(`/dialectic/non-existent-id`);
    expect(screen.getByText(/Project not found/i)).toBeInTheDocument();
  });

  it('displays project details and child components when project data is loaded', () => {
    setDialecticState({ currentProjectDetail: mockProject, isLoadingProjectDetail: false });
    renderWithRouter(`/dialectic/${mockProjectId}`);
    expect(screen.getByRole('heading', { name: /Detailed Project Name/i })).toBeInTheDocument();
    expect(screen.getByText(mockProject.dialectic_domains!.name)).toBeInTheDocument();
    expect(screen.getByTestId('initial-problem-statement-mock')).toBeInTheDocument();
    expect(screen.getByTestId('project-sessions-list-mock')).toBeInTheDocument();
  });

  it('calls startDialecticSession with correct parameters when "Start New Session" button is clicked', async () => {
    setDialecticState({
        currentProjectDetail: mockProject,
        activeContextStage: mockInitialStage,
    });
    const store = getDialecticStoreState();
    (store.startDialecticSession as Mock).mockResolvedValue({ data: mockSession, error: null });

    renderWithRouter(`/dialectic/${mockProjectId}`);
    const startSessionButton = screen.getByRole('button', { name: /Start New Session/i });
    fireEvent.click(startSessionButton);
    
    await waitFor(() => {
        expect(store.startDialecticSession).toHaveBeenCalledWith({
            projectId: mockProjectId,
            selectedModelCatalogIds: [],
            stageSlug: mockInitialStage.slug,
        });
    });
  });

  it('navigates to the new session page on successful session start', async () => {
    setDialecticState({
        currentProjectDetail: mockProject,
        activeContextStage: mockInitialStage,
    });
    const store = getDialecticStoreState();
    (store.startDialecticSession as Mock).mockResolvedValue({ data: mockSession, error: null });

    const { container } = renderWithRouter(`/dialectic/${mockProjectId}`);
    const startSessionButton = screen.getByRole('button', { name: /Start New Session/i });
    fireEvent.click(startSessionButton);
    
    await waitFor(() => {
      expect(container.innerHTML).toContain('Session Page');
    });
  });

  it('navigates to the new session page when triggered from sessions list', async () => {
    setDialecticState({
        currentProjectDetail: mockProject,
        activeContextStage: mockInitialStage,
    });
    const store = getDialecticStoreState();
    (store.startDialecticSession as Mock).mockResolvedValue({ data: mockSession, error: null });

    const { container } = renderWithRouter(`/dialectic/${mockProjectId}`);
    const startSessionButton = screen.getByRole('button', { name: /Trigger Session From List/i });
    fireEvent.click(startSessionButton);
    
    await waitFor(() => {
      expect(store.startDialecticSession).toHaveBeenCalled();
      expect(container.innerHTML).toContain('Session Page');
    });
  });
}); 