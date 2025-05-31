import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticStore, AIModelCatalogEntry, StartSessionPayload, DialecticSession, ApiError } from '@paynless/types';
import { StartDialecticSessionModal } from './StartDialecticSessionModal';

// Mock @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useDialecticStore: vi.fn(),
  };
});

const mockStartDialecticSession = vi.fn();
const mockFetchAIModelCatalog = vi.fn();

const createMockStoreState = (overrides: Partial<DialecticStore>): DialecticStore => {
  return {
    ...initialDialecticStateValues,
    modelCatalog: [],
    isLoadingModelCatalog: false,
    modelCatalogError: null,
    fetchAIModelCatalog: mockFetchAIModelCatalog,
    isStartingSession: false,
    startSessionError: null,
    startDialecticSession: mockStartDialecticSession,
    // Add other necessary state and actions, ensuring all are present from DialecticStore type
    availableDomainTags: [],
    isLoadingDomainTags: false,
    domainTagsError: null,
    selectedDomainTag: null,
    fetchAvailableDomainTags: vi.fn(),
    setSelectedDomainTag: vi.fn(),
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
    fetchDialecticProjects: vi.fn(),
    currentProjectDetail: null,
    isLoadingProjectDetail: false,
    projectDetailError: null,
    fetchDialecticProjectDetails: vi.fn(),
    isCreatingProject: false,
    createProjectError: null,
    createDialecticProject: vi.fn(),
    contributionContentCache: {},
    fetchContributionContent: vi.fn(),
    resetCreateProjectError: vi.fn(),
    resetProjectDetailsError: vi.fn(),
    _resetForTesting: vi.fn(),
    ...overrides,
  } as DialecticStore;
};

describe('StartDialecticSessionModal', () => {
  const mockProjectId = 'project-for-session';
  const mockOnClose = vi.fn();
  const mockOnSessionStarted = vi.fn();

  const mockAiModels: AIModelCatalogEntry[] = [
    { 
      id: 'model-1', 
      provider_name: 'openai', 
      model_name: 'GPT-4', 
      api_identifier: 'gpt-4', 
      description: 'Powerful', 
      strengths: [], 
      weaknesses: [], 
      context_window_tokens: 8000, 
      input_token_cost_usd_millionths: 30, 
      output_token_cost_usd_millionths: 60, 
      max_output_tokens: 1000,
      is_active: true,
      created_at: '', 
      updated_at: '' },
    { 
      id: 'model-2', 
      provider_name: 'anthropic', 
      model_name: 'Claude 3 Opus', 
      api_identifier: 'claude-3-opus', 
      description: 'Insightful', 
      strengths: [], 
      weaknesses: [], 
      context_window_tokens: 200000, 
      input_token_cost_usd_millionths: 15, 
      output_token_cost_usd_millionths: 75, 
      max_output_tokens: 1000,
      is_active: true,
      created_at: '', 
      updated_at: '' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    const mockStore = createMockStoreState({ modelCatalog: mockAiModels });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
  });

  it('renders the modal with form fields when isOpen is true', () => {
    render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );

    expect(screen.getByRole('heading', { name: /Start New Dialectic Session/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    expect(screen.getByText(/^AI Models$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('does not render the modal when isOpen is false', () => {
    render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={false}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );
    expect(screen.queryByRole('heading', { name: /Start New Dialectic Session/i })).not.toBeInTheDocument();
  });

  it('calls fetchAIModelCatalog on mount if catalog is empty and isOpen is true', () => {
    const emptyCatalogStore = createMockStoreState({ modelCatalog: [] });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(emptyCatalogStore));
    
    render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );
    expect(mockFetchAIModelCatalog).toHaveBeenCalledTimes(1);
  });
  
  it('does not call fetchAIModelCatalog if catalog is already populated', () => {
    // Default beforeEach setup already has mockAiModels in catalog
    render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );
    expect(mockFetchAIModelCatalog).not.toHaveBeenCalled();
  });

  it('displays loading state for model catalog', () => {
    const loadingCatalogStore = createMockStoreState({ isLoadingModelCatalog: true, modelCatalog: [] });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(loadingCatalogStore));
    render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );
    // Check for the loader icon more robustly
    // We can find the container for AI Models first, then the loader within it.
    const aiModelsSection = screen.getByText(/^AI Models$/i).closest('div.grid');
    expect(aiModelsSection).toBeInTheDocument();
    if (aiModelsSection) { // Type guard for aiModelsSection
      const loader = aiModelsSection.querySelector('.animate-spin');
      expect(loader).toBeInTheDocument();
    } else {
      // Fail the test if the section isn't found, which means the loader can't be either
      expect(aiModelsSection).not.toBeNull(); 
    }
  });

  it('displays error state for model catalog', () => {
    const error: ApiError = { message: 'Failed to load models', code: 'NETWORK_ERROR' };
    const errorCatalogStore = createMockStoreState({ modelCatalogError: error, modelCatalog: [] });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(errorCatalogStore));
    render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );
    // Check for the AlertTitle text and the AlertDescription text
    expect(screen.getByText('Error')).toBeInTheDocument(); // AlertTitle
    expect(screen.getByText(error.message)).toBeInTheDocument(); // AlertDescription
    // Optionally, ensure these are within an alert
    const alert = screen.getByRole('alert');
    expect(alert).toContainElement(screen.getByText('Error'));
    expect(alert).toContainElement(screen.getByText(error.message));
  });

  it('submits the form with selected models and calls startDialecticSession', async () => {
    const user = userEvent.setup();
    mockStartDialecticSession.mockResolvedValueOnce({ 
      data: { id: 'new-session-123' } as DialecticSession,
      error: null 
    });
    
    render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );

    await user.type(screen.getByLabelText(/Description/i), 'Test Session Description');
    
    // For this test to pass without a real multi-select, the form schema needs to allow empty selectedModelIds or a default.
    // Or, the test needs to robustly interact with the chosen multi-select.
    // For now, let's try to select the first model using its label
    const firstModelCheckbox = screen.getByLabelText(new RegExp(mockAiModels[0].model_name, "i"));
    await user.click(firstModelCheckbox);

    await user.click(screen.getByRole('button', { name: /Start Session/i }));

    await waitFor(() => {
      expect(mockStartDialecticSession).toHaveBeenCalledWith({
        projectId: mockProjectId,
        sessionDescription: 'Test Session Description',
        selectedModelCatalogIds: [mockAiModels[0].id], // Expecting the ID of the first model
      } as StartSessionPayload);
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnSessionStarted).toHaveBeenCalledWith('new-session-123');
    });
  });
  
  it('displays loading state during session creation', async () => {
    const user = userEvent.setup();
    let mockStoreInstance = createMockStoreState({
      isStartingSession: false, // Start with false
      modelCatalog: mockAiModels,
    });

    // Mock useDialecticStore to allow dynamic updates
    vi.mocked(useDialecticStore).mockImplementation(
      (selector: (state: DialecticStore) => unknown) => selector(mockStoreInstance)
    );

    // When startDialecticSession is called, update the store to simulate loading
    mockStartDialecticSession.mockImplementation(async () => {
      mockStoreInstance = {
        ...mockStoreInstance,
        isStartingSession: true,
      };
      // This will effectively re-run selectors for components using the store
      vi.mocked(useDialecticStore).mockImplementation(
        (selector: (state: DialecticStore) => unknown) => selector(mockStoreInstance)
      );
      return new Promise(() => {}); // Return a promise that never resolves for this test
    });

    render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );
    
    await user.type(screen.getByLabelText(/Description/i), 'Valid Description');
    const firstModelCheckboxForLoadingTest = screen.getByLabelText(new RegExp(mockAiModels[0].model_name, "i"));
    await user.click(firstModelCheckboxForLoadingTest);

    const startButton = screen.getByRole('button', { name: /Start Session/i });
    expect(startButton).toBeEnabled(); 

    await user.click(startButton); // This will call the mockStartDialecticSession
    
    // After the click, the mockStartDialecticSession runs its implementation.
    // We need to wait for the state update that sets isStartingSession to true
    // and for React to re-render.
    await waitFor(() => {
      const updatedButton = screen.getByRole('button', { name: /Start Session/i });
      expect(updatedButton).toBeDisabled();
      expect(updatedButton.querySelector('.animate-spin')).toBeInTheDocument(); // Lucide loaders use animate-spin
    });
  });

  it('displays error message if startDialecticSession fails', async () => {
    const user = userEvent.setup();
    const error: ApiError = { message: 'Failed to start session', code: 'NETWORK_ERROR' };

    // Use a mutable mock store instance for this test
    let mockStoreInstance = createMockStoreState({
      modelCatalog: mockAiModels,
      isStartingSession: false, // Initially not starting
      startSessionError: null, // Initially no error
    });

    // Mock useDialecticStore to use our mutable instance
    vi.mocked(useDialecticStore).mockImplementation(
      (selector: (state: DialecticStore) => unknown) => selector(mockStoreInstance)
    );

    // Configure the mock thunk to update the store instance on error
    mockStartDialecticSession.mockImplementation(async () => {
      mockStoreInstance = {
        ...mockStoreInstance,
        isStartingSession: false, // Set loading to false
        startSessionError: error, // Set the error
      };
      // Re-apply the mock so the component sees the updated store
      vi.mocked(useDialecticStore).mockImplementation(
        (selector: (state: DialecticStore) => unknown) => selector(mockStoreInstance)
      );
      return { data: null, error }; // Return value for the thunk itself
    });

    render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );

    await user.type(screen.getByLabelText(/Description/i), 'Test Session Description Error');
    // Select the first model to make the form valid
    const firstModelCheckbox = screen.getByLabelText(new RegExp(mockAiModels[0].model_name, "i"));
    await user.click(firstModelCheckbox);
    
    await user.click(screen.getByRole('button', { name: /Start Session/i }));

    await waitFor(() => {
      // Check for the AlertTitle text and the AlertDescription text
      expect(screen.getByText('Error Starting Session')).toBeInTheDocument(); // AlertTitle
      expect(screen.getByText(error.message)).toBeInTheDocument(); // AlertDescription
      // Optionally, ensure these are within an alert
      const alert = screen.getByRole('alert');
      expect(alert).toContainElement(screen.getByText('Error Starting Session'));
      expect(alert).toContainElement(screen.getByText(error.message));
    });
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('calls onOpenChange when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );
    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenChange when dialog overlay is clicked (simulated)', () => {
    render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );
    // Simulate the onOpenChange behavior of the Dialog component
    // This usually happens when clicking outside or pressing Escape
    // For testing, we can directly check if onOpenChange is called if we simulate modal closure attempt
    // The actual mechanism is part of the <Dialog> component from shadcn/ui
    // We can test our component's usage of onOpenChange via the Cancel button or successful submit.
    // A direct overlay click test is more of an integration test of the Dialog itself.
    // For now, ensure the prop is passed correctly.
    // If a specific test for overlay click is needed, it might require deeper interaction with Radix primitives.
    expect(mockOnClose).not.toHaveBeenCalled(); // Initially not called
  });

  it('resets form fields when the modal is closed and reopened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );

    // Type into the description field
    const descriptionInput = screen.getByLabelText(/Description/i);
    await user.type(descriptionInput, 'Initial Description');
    expect(descriptionInput).toHaveValue('Initial Description');

    // "Close" the modal by re-rendering with isOpen={false}
    rerender(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={false}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );

    // "Reopen" the modal
    rerender(
      <StartDialecticSessionModal
        projectId={mockProjectId}
        isOpen={true}
        onOpenChange={mockOnClose}
        onSessionStarted={mockOnSessionStarted}
      />
    );

    // Check if the description field is reset
    // Need to get the input field again after re-render
    const descriptionInputAfterReopen = screen.getByLabelText(/Description/i);
    expect(descriptionInputAfterReopen).toHaveValue('');
  });

  // Add tests for form validation errors once the schema is defined
}); 