import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DialecticProjectDetailsPage } from './DialecticProjectDetailsPage';
import {
  setDialecticStateValues,
  resetDialecticStoreMock,
  getDialecticStoreState,
} from '../mocks/dialecticStore.mock';
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

const mockProjectIdFromUrl = 'project-123'; // Renamed for clarity in new tests

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
  id: mockProjectIdFromUrl, // Ensure mockProject aligns with a potential URL ID
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
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
};

const mockSession: DialecticSession = {
    id: 'ses-abc',
    project_id: mockProjectIdFromUrl,
    session_description: 'A session for testing.',
    user_input_reference_url: null,
    iteration_count: 1,
    selected_model_ids: [],
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
    resetDialecticStoreMock(); // Resets store internal values AND vi.fn() on actions
                               // vi.clearAllMocks() is called inside resetDialecticStoreMock,
                               // so global selectors also reset their mockReturnValues here.
  });

  /* // Commenting out the old unconditional fetch test as per X.1.3.1
  it('calls fetchDialecticProjectDetails with projectId on mount and shows loading skeletons', () => {
    setDialecticStateValues({ isLoadingProjectDetail: true });
    const { container } = renderWithRouter(`/dialectic/${mockProjectIdFromUrl}`);
    const store = getDialecticStoreState();
    expect(store.fetchDialecticProjectDetails).toHaveBeenCalledWith(mockProjectIdFromUrl);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
  */

  // New tests for X.1.3.1: Conditional fetching logic
  describe('[X.1.3.1] Conditional fetching of project details', () => {
    const urlProjectId = 'url-project-id-001';

    it('Scenario 1a: calls fetchDialecticProjectDetails if URL projectId exists and activeContextProjectId differs', () => {
      setDialecticStateValues({
        activeContextProjectId: 'different-project-id-789',
        currentProjectDetail: null,
        isLoadingProjectDetail: false,
        projectDetailError: null,
      });
      const store = getDialecticStoreState();
      (store.fetchDialecticProjectDetails as Mock).mockClear();
      
      renderWithRouter(`/dialectic/${urlProjectId}`);
      
      expect(store.fetchDialecticProjectDetails).toHaveBeenCalledWith(urlProjectId);
    });

    it('Scenario 1b: calls fetchDialecticProjectDetails if URL projectId exists and currentProjectDetail is null (even if activeContextProjectId matches URL)', () => {
      setDialecticStateValues({
        activeContextProjectId: urlProjectId,
        currentProjectDetail: null,
        isLoadingProjectDetail: false,
        projectDetailError: null,
      });
      const store = getDialecticStoreState();
      (store.fetchDialecticProjectDetails as Mock).mockClear();
      
      renderWithRouter(`/dialectic/${urlProjectId}`);
      
      expect(store.fetchDialecticProjectDetails).toHaveBeenCalledWith(urlProjectId);
    });

    it('Scenario 1c: calls fetchDialecticProjectDetails if URL projectId exists and currentProjectDetail.id differs from URL projectId (even if activeContextProjectId matches URL)', () => {
      const differentProject = { ...mockProject, id: 'another-project-id-456' };
      setDialecticStateValues({
        activeContextProjectId: urlProjectId,
        currentProjectDetail: differentProject,
        isLoadingProjectDetail: false,
        projectDetailError: null,
      });
      const store = getDialecticStoreState();
      (store.fetchDialecticProjectDetails as Mock).mockClear();
      
      renderWithRouter(`/dialectic/${urlProjectId}`);
      
      expect(store.fetchDialecticProjectDetails).toHaveBeenCalledWith(urlProjectId);
    });

    it('Scenario 2: does NOT call fetchDialecticProjectDetails if URL projectId exists and context is already aligned (project ID and details match)', () => {
      const correctlyAlignedProject = { ...mockProject, id: urlProjectId, project_name: "Correct Project Name" };
      setDialecticStateValues({
        activeContextProjectId: urlProjectId,
        currentProjectDetail: correctlyAlignedProject,
        isLoadingProjectDetail: false,
        projectDetailError: null,
      });
      const store = getDialecticStoreState();
      (store.fetchDialecticProjectDetails as Mock).mockClear();

      renderWithRouter(`/dialectic/${urlProjectId}`);

      expect(store.fetchDialecticProjectDetails).not.toHaveBeenCalled();
    });
  });

  it('displays error message if projectDetailError is present', () => {
    const error: ApiError = { message: 'Failed to load project', code: '404' };
    setDialecticStateValues({ 
      projectDetailError: error, 
      currentProjectDetail: null, 
      isLoadingProjectDetail: false,
      activeContextProjectId: mockProjectIdFromUrl 
    });
    renderWithRouter(`/dialectic/${mockProjectIdFromUrl}`);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText(error.message)).toBeInTheDocument();
  });

  it('displays "Project not found" message if no project is loaded and not loading', () => {
    const nonExistentId = 'non-existent-id';
    setDialecticStateValues({ 
      currentProjectDetail: null, 
      isLoadingProjectDetail: false, 
      projectDetailError: null,
      activeContextProjectId: nonExistentId
    });
    renderWithRouter(`/dialectic/${nonExistentId}`);
    const paragraphElement = screen.getByText(/Project not found/i).closest('p');
    expect(paragraphElement).toHaveTextContent(`Project not found (ID: ${nonExistentId}).`);
  });

  it('displays project details and child components when project data is loaded from store', () => {
    const projectForStore: DialecticProject = { ...mockProject, id: 'store-project-id-efg', project_name: 'Project Name From Store' };
    setDialecticStateValues({ 
      currentProjectDetail: projectForStore, 
      isLoadingProjectDetail: false,
      projectDetailError: null,
      activeContextProjectId: projectForStore.id
    });
    renderWithRouter(`/dialectic/${projectForStore.id}`); 
    
    expect(screen.getByRole('heading', { name: projectForStore.project_name })).toBeInTheDocument();
    expect(screen.getByText(projectForStore.dialectic_domains!.name)).toBeInTheDocument();
    expect(screen.getByTestId('initial-problem-statement-mock')).toBeInTheDocument();
    expect(screen.getByTestId('project-sessions-list-mock')).toBeInTheDocument();
  });

  it('calls startDialecticSession with correct parameters when "Start New Session" button is clicked', async () => {
    setDialecticStateValues({
        currentProjectDetail: mockProject,
        activeContextStage: mockInitialStage,
        isLoadingProjectDetail: false,
        projectDetailError: null,
        activeContextProjectId: mockProjectIdFromUrl
    });
    const store = getDialecticStoreState();
    (store.startDialecticSession as Mock).mockResolvedValue({ data: mockSession, error: null });

    renderWithRouter(`/dialectic/${mockProjectIdFromUrl}`);
    const startSessionButton = screen.getByRole('button', { name: /Start New Session/i });
    fireEvent.click(startSessionButton);
    
    await waitFor(() => {
        expect(store.startDialecticSession).toHaveBeenCalledWith({
            projectId: mockProjectIdFromUrl,
            selectedModelIds: [],
            stageSlug: mockInitialStage.slug,
        });
    });
  });

  it('navigates to the new session page on successful session start', async () => {
    setDialecticStateValues({
        currentProjectDetail: mockProject,
        activeContextStage: mockInitialStage,
        isLoadingProjectDetail: false,
        projectDetailError: null,
        activeContextProjectId: mockProjectIdFromUrl
    });
    const store = getDialecticStoreState();
    (store.startDialecticSession as Mock).mockResolvedValue({ data: mockSession, error: null });

    const { container } = renderWithRouter(`/dialectic/${mockProjectIdFromUrl}`);
    const startSessionButton = screen.getByRole('button', { name: /Start New Session/i });
    fireEvent.click(startSessionButton);
    
    await waitFor(() => {
      expect(container.innerHTML).toContain('Session Page');
    });
  });

  it('navigates to the new session page when triggered from sessions list', async () => {
    setDialecticStateValues({
        currentProjectDetail: mockProject,
        activeContextStage: mockInitialStage,
        isLoadingProjectDetail: false,
        projectDetailError: null,
        activeContextProjectId: mockProjectIdFromUrl
    });
    const store = getDialecticStoreState();
    (store.startDialecticSession as Mock).mockResolvedValue({ data: mockSession, error: null });

    const { container } = renderWithRouter(`/dialectic/${mockProjectIdFromUrl}`);
    const startSessionButton = screen.getByRole('button', { name: /Trigger Session From List/i });
    fireEvent.click(startSessionButton);
    
    await waitFor(() => {
      expect(store.startDialecticSession).toHaveBeenCalled();
      expect(container.innerHTML).toContain('Session Page');
    });
  });
}); 