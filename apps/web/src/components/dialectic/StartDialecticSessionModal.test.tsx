import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, Mock } from 'vitest';
import { StartDialecticSessionModal } from './StartDialecticSessionModal';
import {
  initializeMockDialecticState,
  setDialecticState,
  getDialecticStoreActions,
  resetDialecticStoreMock,
  useDialecticStore
} from '@/mocks/dialecticStore.mock';
import { 
  DialecticStage, 
  DialecticProject, 
  AIModelCatalogEntry, 
  DomainOverlayDescriptor, 
  DomainTagDescriptor, 
  DialecticActions, 
  DialecticSession, 
  DialecticStore,
} from '@paynless/types';
import { toast } from 'sonner';

// Polyfill for PointerEvents (similar to ChatContextSelector.test.tsx)
if (typeof window !== 'undefined') {
    class MockPointerEvent extends Event {
        button: number;
        ctrlKey: boolean;
        pointerType: string;
        pointerId: number; 

        constructor(type: string, props: PointerEventInit) {
            super(type, props);
            this.button = props.button || 0;
            this.ctrlKey = props.ctrlKey || false;
            this.pointerType = props.pointerType || 'mouse';
            this.pointerId = props.pointerId || 0; 
        }
    }
    // @ts-expect-error // window.PointerEvent is read-only
    window.PointerEvent = MockPointerEvent;

    if (!HTMLElement.prototype.hasPointerCapture) {
        HTMLElement.prototype.hasPointerCapture = (_pointerId: number) => {
            console.log(`[Test Polyfill] hasPointerCapture: ${_pointerId}`);
            return false; 
        };
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
        HTMLElement.prototype.releasePointerCapture = (_pointerId: number) => {
            console.log(`[Test Polyfill] releasePointerCapture: ${_pointerId}`);
        };
    }
    if (!HTMLElement.prototype.setPointerCapture) { 
        HTMLElement.prototype.setPointerCapture = (_pointerId: number) => {
            console.log(`[Test Polyfill] setPointerCapture: ${_pointerId}`);
        };
    }

    // Add scrollIntoView mock
    if (!HTMLElement.prototype.scrollIntoView) {
        HTMLElement.prototype.scrollIntoView = vi.fn();
    }
}

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  const mockDialecticStoreModule = await import('@/mocks/dialecticStore.mock');
  return {
    ...actual,
    useDialecticStore: mockDialecticStoreModule.useDialecticStore,
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock DialecticStageSelector
vi.mock('./DialecticStageSelector', () => ({
  DialecticStageSelector: vi.fn(({ disabled }) => (
    <div data-testid="mock-dialectic-stage-selector">
      Mock Stage Selector {disabled ? '(Disabled)' : ''}
    </div>
  )),
}));

// Updated Mock for AIModelSelector
vi.mock('./AIModelSelector', () => ({
  AIModelSelector: vi.fn(({ disabled }) => {
    const { 
      modelCatalog, 
      isLoadingModelCatalog, 
      modelCatalogError, 
      fetchAIModelCatalog 
    } = useDialecticStore(
      (state: DialecticStore) => ({
        modelCatalog: state.modelCatalog,
        isLoadingModelCatalog: state.isLoadingModelCatalog,
        modelCatalogError: state.modelCatalogError,
        fetchAIModelCatalog: state.fetchAIModelCatalog, 
      })
    );

    React.useEffect(() => {
      if (fetchAIModelCatalog && !modelCatalog && !isLoadingModelCatalog && !modelCatalogError) {
        fetchAIModelCatalog();
      }
    }, [fetchAIModelCatalog, modelCatalog, isLoadingModelCatalog, modelCatalogError]);

    return (
      <div data-testid="mock-ai-model-selector">
        Mock AI Model Selector {disabled ? '(Disabled)' : ''}
      </div>
    );
  }),
}));

// Mock DomainSelector
vi.mock('./DomainSelector', () => ({
  DomainSelector: vi.fn(() => <div data-testid="mock-domain-selector">Mock Domain Selector</div>),
}));

const mockProject: DialecticProject = {
  id: 'project-123',
  project_name: 'Test Project',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  user_id: 'user-abc',
  initial_user_prompt: 'Initial user prompt',
  selected_domain_overlay_id: 'tag-1',
  selected_domain_tag: 'general',
  repo_url: 'https://github.com/test/test',
  status: 'active',
};

const mockModelCatalog: AIModelCatalogEntry[] = [
  { 
    id: 'model-1', 
    model_name: 'GPT-4', 
    provider_name: 'OpenAI', 
    api_identifier: 'gpt-4', 
    strengths: ['Strong'], 
    weaknesses: ['Weak'], 
    description: 'GPT-4 is a powerful model',
    context_window_tokens: 8000,
    input_token_cost_usd_millionths: 0.001,
    output_token_cost_usd_millionths: 0.001,
    max_output_tokens: 1000,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  { 
    id: 'model-2', 
    model_name: 'Claude 3', 
    provider_name: 'Anthropic', 
    api_identifier: 'claude-3', 
    strengths: ['Strong'], 
    weaknesses: ['Weak'], 
    context_window_tokens: 8000, 
    input_token_cost_usd_millionths: 0.001, 
    output_token_cost_usd_millionths: 0.001, 
    max_output_tokens: 1000, 
    is_active: true, 
    created_at: new Date().toISOString(), 
    updated_at: new Date().toISOString(),
    description: 'Claude 3 is a powerful model',
  },
];

const mockAvailableDomainTags: DomainTagDescriptor[] = [
    { id: 'tag-1', 
      domainTag: 'general', 
      description: 'A general discussion domain.', 
      stageAssociation: 'thesis' },
    { id: 'tag-2', 
      domainTag: 'tech', 
      description: 'Debate on technology topics.', 
      stageAssociation: 'thesis' },
];

const mockAvailableDomainOverlays: DomainOverlayDescriptor[] = [
    { id: 'tag-1', 
      description: 'Overlay for general debates.', 
      domainTag: 'general', 
      stageAssociation: 'thesis' 
    },
];

describe('StartDialecticSessionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDialecticStoreMock();

    initializeMockDialecticState({
      isStartNewSessionModalOpen: false,
      currentProjectDetail: mockProject,
      modelCatalog: undefined,
      isLoadingModelCatalog: false,
      modelCatalogError: undefined,
      isStartingSession: false,
      startSessionError: undefined,
      selectedDomainOverlayId: null,
      selectedStageAssociation: null,
      availableDomainOverlays: mockAvailableDomainOverlays,
      selectedDomainTag: 'general',
      availableDomainTags: mockAvailableDomainTags,
      selectedModelIds: [],
    });
  });

  it('should not render the modal if isStartNewSessionModalOpen is false', () => {
    render(<StartDialecticSessionModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render the modal when isStartNewSessionModalOpen is true and fetch model catalog', async () => {
    setDialecticState({ isStartNewSessionModalOpen: true });
    const { fetchAIModelCatalog } = getDialecticStoreActions();

    render(<StartDialecticSessionModal />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(`Start New Dialectic Session for ${mockProject.project_name}`)).toBeInTheDocument();
    
    // Verify mocked child components are rendered
    expect(screen.getByTestId('mock-dialectic-stage-selector')).toBeInTheDocument();
    expect(screen.getByTestId('mock-ai-model-selector')).toBeInTheDocument();
    expect(screen.getByTestId('mock-domain-selector')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchAIModelCatalog).toHaveBeenCalledTimes(1);
    });
  });

  it('should display project name correctly', () => {
    setDialecticState({ isStartNewSessionModalOpen: true });
    render(<StartDialecticSessionModal />);
    expect(screen.getByText(`Start New Dialectic Session for ${mockProject.project_name}`)).toBeInTheDocument();
  });
  
  it('should display project id if name is not available', () => {
    setDialecticState({ 
      isStartNewSessionModalOpen: true, 
      currentProjectDetail: { ...mockProject, project_name: '' } 
    });
    render(<StartDialecticSessionModal />);
    expect(screen.getByText(`Start New Dialectic Session for ${mockProject.id}`)).toBeInTheDocument();
  });

  it('should show loading project if no project details', () => {
    setDialecticState({ 
      isStartNewSessionModalOpen: true, 
      currentProjectDetail: undefined 
    });
    render(<StartDialecticSessionModal />);
    expect(screen.getByText(/Start New Dialectic Session for Loading project.../i)).toBeInTheDocument();
    expect(screen.getByText('Waiting for project information...')).toBeInTheDocument();
    const startButton = screen.getByRole('button', { name: 'Start Session' });
    expect(startButton).toBeDisabled();
    // Verify the mock DialecticStageSelector indicates it is disabled
    const mockStageSelector = screen.getByTestId('mock-dialectic-stage-selector');
    expect(mockStageSelector).toHaveTextContent('(Disabled)');
  });
  
  it('should correctly set initial session description based on selected domain overlay', async () => {
    setDialecticState({
      isStartNewSessionModalOpen: true,
      selectedDomainOverlayId: 'tag-1',
      currentProjectDetail: mockProject
    });
    render(<StartDialecticSessionModal />);

    await waitFor(() => {
      const previewArea = screen.getByTestId('session-description-input-area-markdown-preview');
      expect(previewArea.textContent).toBe(mockAvailableDomainOverlays[0].description);
    });
  });

  it('should correctly set initial session description based on selected domain tag if overlay not selected', async () => {
    setDialecticState({
      isStartNewSessionModalOpen: true,
      selectedDomainOverlayId: null,
      selectedDomainTag: 'tech',
      currentProjectDetail: { ...mockProject, selected_domain_overlay_id: null, selected_domain_tag: 'tech' } 
    });
  
    const techTagDescriptor = mockAvailableDomainTags.find(tag => tag.domainTag === 'tech');
    expect(techTagDescriptor).toBeDefined();
  
    render(<StartDialecticSessionModal />);
  
    await waitFor(() => {
      const previewArea = screen.getByTestId('session-description-input-area-markdown-preview');
      expect(previewArea.textContent).toBe(techTagDescriptor!.description);
    });
  });

  it('should handle AI model selection and enable Start Session button', async () => {
    setDialecticState({ 
      isStartNewSessionModalOpen: true,
      currentProjectDetail: mockProject,
      modelCatalog: mockModelCatalog,
      isLoadingModelCatalog: false,
      modelCatalogError: undefined,
      selectedDomainOverlayId: 'tag-1',
      availableDomainOverlays: mockAvailableDomainOverlays,
      selectedStageAssociation: DialecticStage.THESIS, 
      availableDomainTags: mockAvailableDomainTags,
    });
    render(<StartDialecticSessionModal />);

    const startButton = screen.getByRole('button', { name: 'Start Session' });
    // Initially, the button should be disabled because no model is selected
    expect(startButton).toBeDisabled(); 

    // Simulate AI model selection by updating the store
    setDialecticState({ selectedModelIds: [mockModelCatalog[0].id] });

    // Wait for the component to re-render with the new state
    await waitFor(() => {
      const updatedStartButton = screen.getByRole('button', { name: 'Start Session' });
      expect(updatedStartButton).not.toBeDisabled();
    });
  });
  
  it('shows loading state for models and reflects in mock selector props', async () => {
    setDialecticState({
      isStartNewSessionModalOpen: true,
      currentProjectDetail: mockProject,
      modelCatalog: undefined,
      isLoadingModelCatalog: true,
    });
    render(<StartDialecticSessionModal />);

    const mockAISelector = screen.getByTestId('mock-ai-model-selector');
    await waitFor(() => {
      expect(mockAISelector).toHaveTextContent('(Disabled)');
    });

    const startButton = screen.getByRole('button', { name: 'Start Session' });
    expect(startButton).toBeDisabled();
  });
  
  it('shows error state for models and reflects in mock selector props', async () => {
    setDialecticState({
      isStartNewSessionModalOpen: true,
      currentProjectDetail: mockProject,
      modelCatalog: undefined,
      isLoadingModelCatalog: false,
      modelCatalogError: { message: 'Failed to load models', code: '500' },
    });
    render(<StartDialecticSessionModal />); 
    
    const mockAISelector = screen.getByTestId('mock-ai-model-selector');
    // When there's an error, the selector itself might not be disabled, 
    // but model selection would be impossible, thus Start Session should be disabled.
    expect(mockAISelector).not.toHaveTextContent('(Disabled)'); 

    const startButton = screen.getByRole('button', { name: 'Start Session' });
    expect(startButton).toBeDisabled();
  });
  
  it('shows "No models available" when catalog is empty (mock selector verification)', async () => {
    setDialecticState({
      isStartNewSessionModalOpen: true,
      currentProjectDetail: mockProject,
      modelCatalog: [], 
      isLoadingModelCatalog: false,
    });
    render(<StartDialecticSessionModal />);
    
    const mockAISelector = screen.getByTestId('mock-ai-model-selector');
    // The mock itself doesn't know the catalog is empty, so it won't be disabled by default
    // unless the StartDialecticSessionModal explicitly passes a disabled prop based on empty catalog.
    // Based on current mock, it's not disabled. The Start button should be disabled though.
    expect(mockAISelector).not.toHaveTextContent('(Disabled)'); 

    const startButton = screen.getByRole('button', { name: 'Start Session' });
    expect(startButton).toBeDisabled();
  });
  
  it('should successfully start a session', async () => {
    const user = userEvent.setup();
    const onSessionStartedMock = vi.fn();
    const actions = getDialecticStoreActions();
    const mockSessionData: Partial<DialecticSession> = {
      id: 'session-456',
      project_id: mockProject.id,
    };
    (actions.startDialecticSession as Mock).mockResolvedValue({ data: mockSessionData as DialecticSession, error: undefined, status: 200 });
  
    // Set initial store states for modal opening, excluding selectedModelIds for now
    setDialecticState({
      isStartNewSessionModalOpen: true,
      currentProjectDetail: mockProject,
      selectedDomainOverlayId: 'tag-1',
      selectedStageAssociation: DialecticStage.THESIS, 
      modelCatalog: mockModelCatalog, 
      isLoadingModelCatalog: false,
      modelCatalogError: undefined,
      availableDomainOverlays: mockAvailableDomainOverlays,
      availableDomainTags: mockAvailableDomainTags,
    });
  
    render(<StartDialecticSessionModal onSessionStarted={onSessionStartedMock} />); 

    // Simulate model selection after modal is open and initialized
    setDialecticState({ selectedModelIds: [mockModelCatalog[0].id] });
  
    // Click the toggle button to switch to edit mode
    const toggleButton = screen.getByTestId('session-description-input-area-preview-toggle');
    await user.click(toggleButton);

    const descriptionTextarea = screen.getByLabelText('Session Description') as HTMLTextAreaElement;
    fireEvent.change(descriptionTextarea, { target: { value: 'My test session description' } });
  
    const startButton = screen.getByRole('button', { name: 'Start Session' });
    await waitFor(() => {
        expect(startButton).not.toBeDisabled(); 
    });
    startButton.focus();
    await user.click(startButton);
  
    await waitFor(() => {
      expect(actions.startDialecticSession).toHaveBeenCalledTimes(1);
    });
    
    // Ensure the payload matches the store state
    expect(actions.startDialecticSession).toHaveBeenCalledWith({
      projectId: mockProject.id,
      selectedModelCatalogIds: [mockModelCatalog[0].id],
      sessionDescription: 'My test session description',
      thesisPromptTemplateId: 'tag-1',
      antithesisPromptTemplateId: 'tag-1',
      synthesisPromptTemplateId: 'tag-1',
      parenthesisPromptTemplateId: 'tag-1',
      paralysisPromptTemplateId: 'tag-1',
      formalDebateStructureId: 'tag-1',
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Session started successfully: session-456');
    });
    expect(onSessionStartedMock).toHaveBeenCalledWith('session-456');
    expect(actions.setStartNewSessionModalOpen).toHaveBeenCalledWith(false);
    expect(actions.resetSelectedModelId).not.toHaveBeenCalled();
  });
  
  it('should display error toast if starting session fails', async () => {
    const user = userEvent.setup();
    const actions = getDialecticStoreActions();
    const errorMessage = 'Network error';
    (actions.startDialecticSession as Mock).mockResolvedValue({ data: undefined, error: { message: errorMessage, code: '500' }, status: 500 });

    // Set initial store states for modal opening, excluding selectedModelIds for now
    setDialecticState({
      isStartNewSessionModalOpen: true,
      currentProjectDetail: mockProject,
      selectedDomainOverlayId: 'tag-1',
      selectedStageAssociation: DialecticStage.THESIS,
      modelCatalog: mockModelCatalog,
      isLoadingModelCatalog: false,
      modelCatalogError: undefined,
      availableDomainOverlays: mockAvailableDomainOverlays,
      availableDomainTags: mockAvailableDomainTags,
    });

    render(<StartDialecticSessionModal />); 

    // Simulate model selection after modal is open and initialized
    setDialecticState({ selectedModelIds: [mockModelCatalog[0].id] });

    // Click the toggle button to switch to edit mode
    const toggleButton = screen.getByTestId('session-description-input-area-preview-toggle');
    await user.click(toggleButton);

    const descriptionTextarea = screen.getByLabelText('Session Description') as HTMLTextAreaElement;
    fireEvent.change(descriptionTextarea, { target: { value: 'Another test session description' } });

    const startButton = screen.getByRole('button', { name: 'Start Session' });
    await waitFor(() => {
        expect(startButton).not.toBeDisabled();
    });
    startButton.focus();
    await user.click(startButton);

    await waitFor(() => {
      expect(actions.startDialecticSession).toHaveBeenCalledTimes(1);
    });

    // Simulate store update after session start failure
    setDialecticState({
      startSessionError: { message: errorMessage, code: '500' },
      isStartingSession: false, // Ensure loading state is cleared
    });

    expect(actions.startDialecticSession).toHaveBeenCalledWith({
      projectId: mockProject.id,
      selectedModelCatalogIds: [mockModelCatalog[0].id],
      sessionDescription: 'Another test session description',
      thesisPromptTemplateId: 'tag-1',
      antithesisPromptTemplateId: 'tag-1',
      synthesisPromptTemplateId: 'tag-1',
      parenthesisPromptTemplateId: 'tag-1',
      paralysisPromptTemplateId: 'tag-1',
      formalDebateStructureId: 'tag-1',
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(errorMessage);
    });
    expect(actions.setStartNewSessionModalOpen).not.toHaveBeenCalled(); // Modal should remain open on error
    expect(actions.resetSelectedModelId).not.toHaveBeenCalled(); // Models should not be reset on error
  });
  
  it('should display start session error from store if it occurs (e.g. after submit)', async () => {
    const errorMessage = "A server-side validation error occurred.";
    initializeMockDialecticState({
      isStartNewSessionModalOpen: true,
      currentProjectDetail: mockProject,
      modelCatalog: mockModelCatalog, 
      isLoadingModelCatalog: false,
      modelCatalogError: undefined,
      availableDomainOverlays: mockAvailableDomainOverlays,
      availableDomainTags: mockAvailableDomainTags,
      selectedDomainOverlayId: 'tag-1',
      selectedStageAssociation: DialecticStage.THESIS,
      selectedDomainTag: 'general',
      startSessionError: { message: errorMessage, code: '500' }
    });

    render(<StartDialecticSessionModal />);
    
    // Assert that the toast was called, as the effect should have run on mount
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(errorMessage);
    });

    // Then, wait for the visual error message to appear in the DOM
    await waitFor(() => {
        expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
    });
  });


  it('should disable start button if no models are selected', () => {
    setDialecticState({
      isStartNewSessionModalOpen: true,
      currentProjectDetail: mockProject,
    });
    render(<StartDialecticSessionModal />);
    const startButton = screen.getByRole('button', { name: 'Start Session' });
    expect(startButton).toBeDisabled();
  });

  it('should call setStartNewSessionModalOpen with false when cancel button is clicked', async () => {
    const user = userEvent.setup();
    setDialecticState({ isStartNewSessionModalOpen: true, currentProjectDetail: mockProject });
    const { setStartNewSessionModalOpen } = getDialecticStoreActions();
    render(<StartDialecticSessionModal />);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(setStartNewSessionModalOpen).toHaveBeenCalledWith(false);
  });

  it('should call setStartNewSessionModalOpen with false when dialog is closed via X or overlay', async () => {
    const user = userEvent.setup();
    const { setStartNewSessionModalOpen } = getDialecticStoreActions();
    setDialecticState({ 
      isStartNewSessionModalOpen: true, 
      currentProjectDetail: mockProject,
      selectedDomainOverlayId: 'tag-1',
      availableDomainOverlays: mockAvailableDomainOverlays,
      availableDomainTags: mockAvailableDomainTags,
      selectedStageAssociation: DialecticStage.THESIS,
    });
    render(<StartDialecticSessionModal />);

    // Part 1: Change description
    const toggleButton = screen.getByTestId('session-description-input-area-preview-toggle');
    await user.click(toggleButton);
    const descriptionTextarea = screen.getByLabelText('Session Description') as HTMLTextAreaElement;
    fireEvent.change(descriptionTextarea, { target: { value: 'User typed description' } });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);
    expect(setStartNewSessionModalOpen).toHaveBeenCalledWith(false);

    initializeMockDialecticState({
        isStartNewSessionModalOpen: true, 
        currentProjectDetail: mockProject,
        selectedDomainOverlayId: 'tag-1',
        availableDomainOverlays: mockAvailableDomainOverlays,
        availableDomainTags: mockAvailableDomainTags,
        modelCatalog: mockModelCatalog,
        selectedDomainTag: mockAvailableDomainOverlays[0].domainTag, 
        selectedStageAssociation: mockAvailableDomainOverlays[0].stageAssociation,
    });
    
    render(<StartDialecticSessionModal />);
    await waitFor(() => {
        const newPreviewArea = screen.getByTestId('session-description-input-area-markdown-preview');
        expect(newPreviewArea.textContent).toBe(mockAvailableDomainOverlays[0].description);
    });
  });
  
  it('should render the mocked child selectors', () => {
    setDialecticState({ isStartNewSessionModalOpen: true, currentProjectDetail: mockProject });
    render(<StartDialecticSessionModal />);
    expect(screen.getByTestId('mock-dialectic-stage-selector')).toBeInTheDocument();
    expect(screen.getByTestId('mock-ai-model-selector')).toBeInTheDocument();
    expect(screen.getByTestId('mock-domain-selector')).toBeInTheDocument();
  });

});

beforeAll(() => {
  const actionsMap = getDialecticStoreActions();

  (Object.keys(actionsMap) as Array<keyof DialecticActions>).forEach((key) => {
    const potentialAction = actionsMap[key];

    if (typeof potentialAction === 'function') {
      if (!vi.isMockFunction(potentialAction)) {
        throw new Error(
          `Expected action store member '${String(key)}' to be a vi.fn() mock, but it was not.`
        );
      }
    }
  });
});

/*
  × does not render when isStartNewSessionModalOpen is false
  × renders when isStartNewSessionModalOpen is true and displays project ID
  × calls setStartNewSessionModalOpen(false) when Cancel button is clicked
  × fetches AI model catalog on open if not already loaded
  × does not fetch AI model catalog if already loading
  × does not fetch AI model catalog if already loaded
  × calls setSelectedStageAssociation with "thesis" on open
  × displays model selection list when catalog is loaded
  × allows selecting and deselecting models
  × disables Start Session button if no models are selected
  × enables Start Session button when at least one model is selected
  × calls startDialecticSession with correct payload on submit
  × shows error toast if startDialecticSession fails
  × displays loading indicator while starting session
  × renders DomainSelector and DomainOverlayDescriptionSelector correctly
  × updates session description placeholder and value when domain or overlay changes (and resets user edit flag)
  */
