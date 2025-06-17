import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionInfoCard } from './SessionInfoCard';
import { useDialecticStore } from '@paynless/store';
import { DialecticSession, DialecticStage, DialecticProjectResource, DialecticProject } from '@paynless/types';
import { Mock } from 'vitest';

vi.mock('@paynless/store');
vi.mock('@/components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: vi.fn(({ content }) => <div data-testid="markdown-renderer-mock">{content}</div>),
}));

const mockProjectId = 'proj-123';
const mockSessionId = 'sess-abc';
const mockStageSlug = 'thesis';

const mockStage: DialecticStage = {
    id: 's1',
    slug: mockStageSlug,
    display_name: 'Thesis',
    description: 'A stage for initial ideas.',
    default_system_prompt_id: 'p1',
    input_artifact_rules: {},
    expected_output_artifacts: {},
    created_at: 'now',
}

const iterationUserPromptResource: DialecticProjectResource = {
    id: 'res-123',
    project_id: mockProjectId,
    storage_path: `projects/${mockProjectId}/resources/user_prompt.md`,
    resource_description: JSON.stringify({
        type: 'seed_prompt',
        session_id: mockSessionId,
        stage_slug: mockStageSlug,
        iteration: 1
    }),
    file_name: 'user_prompt.md',
    file_type: 'text/markdown',
    file_size: 100,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
};

const mockSession: DialecticSession = {
  id: mockSessionId,
  project_id: mockProjectId,
  session_name: 'Test Session',
  session_description: 'Test Session Detailed Description',
  status: 'pending_antithesis',
  iteration_count: 1,
  current_stage_slug: mockStageSlug,
  created_at: '2023-01-01T00:00:00.000Z',
  updated_at: '2023-01-01T00:00:00.000Z',
};

const mockProject: DialecticProject = {
  id: mockProjectId,
  project_name: 'Test Project Name',
  project_description: 'A test project.',
  dialectic_sessions: [mockSession],
  resources: [iterationUserPromptResource],
  created_at: '2023-01-01T00:00:00.000Z',
  updated_at: '2023-01-01T00:00:00.000Z',
  organization_id: 'org-123',
  user_id: 'user-123',
} as DialecticProject;

const mockUseDialecticStore = useDialecticStore as Mock;
const mockFetchInitialPromptContent = vi.fn();

const setupMockStore = (overrides: any = {}) => {
  const defaultState = {
    currentProjectDetail: mockProject,
    activeContextStage: mockStage,
    initialPromptContentCache: {},
    fetchInitialPromptContent: mockFetchInitialPromptContent,
    ...overrides,
  };

  if (overrides.initialPromptContentCache) {
    defaultState.initialPromptContentCache = {
      ...defaultState.initialPromptContentCache,
      ...overrides.initialPromptContentCache
    }
  }

  mockUseDialecticStore.mockImplementation(selector => {
    return selector(defaultState)
  });
};


describe('SessionInfoCard', () => {

  const renderComponent = (session: DialecticSession) => {
    return render(<SessionInfoCard session={session} />);
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    setupMockStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders basic session information correctly', async () => {
    renderComponent(mockSession);
    await waitFor(() => {
      expect(screen.getByText(mockSession.session_description!)).toBeInTheDocument();
      expect(screen.getByText(/Test Project Name/)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`Iteration: ${mockSession.iteration_count}`))).toBeInTheDocument();
      expect(screen.getByText(new RegExp(mockSession.status!, 'i'))).toBeInTheDocument();
    })
  });

  it('displays loading state for iteration user prompt initially', async () => {
    setupMockStore({
      initialPromptContentCache: {
        [iterationUserPromptResource.id]: { isLoading: true }
      },
    });
    renderComponent(mockSession);
    await waitFor(() => {
      expect(screen.getByTestId('iteration-prompt-loading')).toBeInTheDocument()
    });
  });
  
  it('fetches iteration user prompt content on mount if not available and session has seed prompt path', async () => {
    renderComponent(mockSession);
    await waitFor(() => {
      expect(mockFetchInitialPromptContent).toHaveBeenCalledWith(iterationUserPromptResource.id);
    });
  });

  it('renders iteration user prompt content once loaded', async () => {
    const promptContent = 'This is the initial user prompt.';
    setupMockStore({
      initialPromptContentCache: {
        [iterationUserPromptResource.id]: { content: promptContent, isLoading: false, error: null }
      },
    });

    renderComponent(mockSession);

    await waitFor(() => {
      const markdownMock = screen.getByTestId('markdown-renderer-mock');
      expect(markdownMock).toBeInTheDocument();
      expect(markdownMock).toHaveTextContent(promptContent);
    });
  });

  it('displays error state if iteration user prompt content fetching fails', async () => {
    const error = { message: 'Failed to load iteration prompt' };
    setupMockStore({
      initialPromptContentCache: {
        [iterationUserPromptResource.id]: { error: error, isLoading: false, content: null }
      },
    });
    renderComponent(mockSession);

    await waitFor(() => {
      expect(screen.getByText(error.message)).toBeInTheDocument();
    });
  });

  it('does not attempt to render prompt if session or project is not found', () => {
    setupMockStore({ currentProjectDetail: null });
    render(<SessionInfoCard session={undefined} />);
    expect(screen.getByText('Loading Session Information...')).toBeInTheDocument();
    expect(mockFetchInitialPromptContent).not.toHaveBeenCalled();
  });

  it('shows placeholder if iteration user prompt content is empty but loaded', async () => {
    setupMockStore({
      initialPromptContentCache: {
        [iterationUserPromptResource.id]: { content: '', isLoading: false, error: null }
      },
    });
    renderComponent(mockSession);

    await waitFor(() => {
      expect(screen.getByText(/No specific prompt was set for this iteration./i)).toBeInTheDocument();
    });
  });

}); 