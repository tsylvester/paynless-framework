import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticStore, DialecticProject } from '@paynless/types';
import { EditableInitialProblemStatement } from './EditableInitialProblemStatement';
import { useWarnIfUnsavedChanges } from '@/hooks/useWarnIfUnsavedChanges';

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mockUpdateDialecticProjectInitialPrompt = vi.fn();

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useDialecticStore: vi.fn(),
    // Mock selectors used by the component directly if not handled by the general useDialecticStore mock
    selectCurrentProjectId: vi.fn(state => state.currentProjectDetail?.id),
    selectCurrentProjectInitialPrompt: vi.fn(state => state.currentProjectDetail?.initial_user_prompt),
    selectCurrentProjectDetail: vi.fn(state => state.currentProjectDetail),
  };
});

vi.mock('@/hooks/useWarnIfUnsavedChanges');

const mockTextInputAreaOnChange = vi.fn();
vi.mock('@/components/common/TextInputArea', () => ({
  TextInputArea: vi.fn(({ value, onChange, onFileLoad, label, id, placeholder }) => (
    <textarea
      data-testid="mock-text-input-area"
      aria-label={label || placeholder || 'Initial Problem Statement'}
      value={value}
      onChange={(e) => {
        mockTextInputAreaOnChange(e.target.value); 
        onChange(e.target.value); 
      }}
      // Helper to simulate file load by calling the prop directly from test
      data-onfileload={(content: string, file: File) => onFileLoad(content, file)}
      data-id={id}
      placeholder={placeholder}
    />
  )),
}));

let mockLocalStorageStore: Record<string, string> = {};

const createMockStoreState = (overrides: Partial<DialecticStore> = {}): DialecticStore => {
  const baseState: DialecticStore = {
    ...initialDialecticStateValues,
    currentProjectDetail: null,
    updateDialecticProjectInitialPrompt: mockUpdateDialecticProjectInitialPrompt,
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
    fetchDialecticProjects: vi.fn(),
    availableDomainTags: { data: [] },
    isLoadingDomainTags: false,
    domainTagsError: null,
    selectedDomainTag: null,
    fetchAvailableDomainTags: vi.fn(),
    setSelectedDomainTag: vi.fn(),
    isLoadingProjectDetail: false,
    projectDetailError: null,
    fetchDialecticProjectDetails: vi.fn(),
    modelCatalog: [],
    isLoadingModelCatalog: false,
    modelCatalogError: null,
    fetchAIModelCatalog: vi.fn(),
    isCreatingProject: false,
    createProjectError: null,
    createDialecticProject: vi.fn(),
    isStartingSession: false,
    startSessionError: null,
    startDialecticSession: vi.fn(),
    contributionContentCache: {},
    fetchContributionContent: vi.fn(),
    setStartNewSessionModalOpen: vi.fn(),
    isStartNewSessionModalOpen: false,
    resetCreateProjectError: vi.fn(),
    resetProjectDetailsError: vi.fn(),
    uploadProjectResourceFile: vi.fn(),
    isUpdatingProjectPrompt: false, // This is related to the save action
    isUploadingProjectResource: false,
    uploadProjectResourceError: null,
    allSystemPrompts: null,
    isCloningProject: false,
    cloneProjectError: null,
    isExportingProject: false,
    exportProjectError: null,
    exportDialecticProject: vi.fn(),
    cloneDialecticProject: vi.fn(),
    deleteDialecticProject: vi.fn(),
    selectedStageAssociation: null,
    availableDomainOverlays: null,
    isLoadingDomainOverlays: false,
    domainOverlaysError: null,
    selectedDomainOverlayId: null,
    setSelectedStageAssociation: vi.fn(),
    fetchAvailableDomainOverlays: vi.fn(),
    setSelectedDomainOverlayId: vi.fn(),
    _resetForTesting: vi.fn(),
    ...overrides,
  };
  return baseState;
};

const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockLocalStorageStore[key] || null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorageStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorageStore[key]; }),
  clear: vi.fn(() => { mockLocalStorageStore = {}; }),
};

describe('EditableInitialProblemStatement', () => {
  const testProjectId = 'project-id-123';
  const initialStorePromptText = 'This is the initial prompt from the store.';
  const localStorageKey = `unsavedPrompt_${testProjectId}`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorageStore = {}; 
    Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true });
    vi.mocked(useWarnIfUnsavedChanges).mockReturnValue(undefined);

    // Configure the global useDialecticStore mock for each test
    // The component uses selectors: selectCurrentProjectId, selectCurrentProjectInitialPrompt, selectCurrentProjectDetail
    // and the action: updateDialecticProjectInitialPrompt
    const defaultMockState = createMockStoreState({
        currentProjectDetail: {
            id: testProjectId,
            project_name: 'Test Project',
            initial_user_prompt: initialStorePromptText,
            user_id: 'user-1', selected_domain_overlay_id: null, selected_domain_tag: null, repo_url: null, status: 'active', created_at: 'date', updated_at: 'date',
        } as DialecticProject,
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(defaultMockState));
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', { value: global.localStorage, writable: true }); // Restore original
  });

  it('renders skeletons if currentProjectDetail is null', () => {
    const nullProjectState = createMockStoreState({ currentProjectDetail: null });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(nullProjectState));
    render(<EditableInitialProblemStatement />);
    expect(screen.getAllByTestId('skeleton-loader')[0]).toBeInTheDocument();
  });

  it('renders skeletons if currentProjectDetail.id does not match projectIdFromStore (simulated by initial_user_prompt undefined)', () => {
    // This state simulates data being loaded but incomplete for the current project context (e.g. prompt missing)
    const mismatchedState = createMockStoreState({
      currentProjectDetail: {
        id: testProjectId, // Matches projectIdFromStore due to selector mock, but that's okay.
        project_name: 'Test Project Incomplete',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initial_user_prompt: undefined as any, // This makes actualInitialPrompt undefined, triggering skeletons.
        user_id: 'user-1',
        selected_domain_overlay_id: null,
        selected_domain_tag: null,
        repo_url: null,
        status: 'active',
        created_at: 'date',
        updated_at: 'date',
        // sessions and resources are optional in DialecticProject type
      } as DialecticProject,
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mismatchedState));
    render(<EditableInitialProblemStatement />);
    expect(screen.getAllByTestId('skeleton-loader')[0]).toBeInTheDocument();
  });
  
  it('displays the initial prompt from the store when loaded', () => {
    // Default beforeEach setup provides a valid project with prompt
    render(<EditableInitialProblemStatement />);
    expect(screen.getByTestId('mock-text-input-area')).toHaveValue(initialStorePromptText);
    expect(vi.mocked(useWarnIfUnsavedChanges)).toHaveBeenLastCalledWith(false); // Should not be dirty
  });

  it('loads and displays prompt from localStorage if it exists and differs from store prompt', async () => {
    const localPromptText = 'Unsaved prompt from localStorage.';
    mockLocalStorageStore[localStorageKey] = localPromptText;
    
    // Default beforeEach setup provides store state with initialStorePromptText
    render(<EditableInitialProblemStatement />);    
    await waitFor(() => {
      expect(screen.getByTestId('mock-text-input-area')).toHaveValue(localPromptText);
    });
    expect(vi.mocked(useWarnIfUnsavedChanges)).toHaveBeenLastCalledWith(true); // Should be dirty
  });

  it('initializes with store prompt if localStorage prompt is the same as store prompt', async () => {
    mockLocalStorageStore[localStorageKey] = initialStorePromptText; // Same as store
    render(<EditableInitialProblemStatement />);
    await waitFor(() => {
        expect(screen.getByTestId('mock-text-input-area')).toHaveValue(initialStorePromptText);
    });
    expect(vi.mocked(useWarnIfUnsavedChanges)).toHaveBeenLastCalledWith(false);
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(localStorageKey);
  });

  it('updates text area and localStorage on change, and calls useWarnIfUnsavedChanges', () => {
    render(<EditableInitialProblemStatement />);
    const newPromptText = 'User is typing a new prompt.';
    const textArea = screen.getByTestId('mock-text-input-area');
    
    fireEvent.change(textArea, { target: { value: newPromptText } });
    
    expect(textArea).toHaveValue(newPromptText);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(localStorageKey, newPromptText);
    expect(vi.mocked(useWarnIfUnsavedChanges)).toHaveBeenLastCalledWith(true); // isDirty becomes true

    // Change back to original
    fireEvent.change(textArea, { target: { value: initialStorePromptText } });
    expect(textArea).toHaveValue(initialStorePromptText);
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(localStorageKey);
    expect(vi.mocked(useWarnIfUnsavedChanges)).toHaveBeenLastCalledWith(false); // isDirty becomes false
  });

  it('handles save correctly', async () => {
    mockUpdateDialecticProjectInitialPrompt.mockResolvedValue({ data: { id: testProjectId } as DialecticProject, error: null, status: 200 });
    render(<EditableInitialProblemStatement />);
    const newPromptText = 'This is a new prompt to be saved.';
    const textArea = screen.getByTestId('mock-text-input-area');
    fireEvent.change(textArea, { target: { value: newPromptText } }); // Make it dirty

    // Save button appears because it's dirty, assuming CardFooter with buttons is rendered by the component
    // We need to find the save button. For now, we assume it would be there if dirty.
    // This part requires the component to render the save/cancel buttons when dirty.
    // Since we've mocked TextInputArea, we need to ensure the test can simulate the UI leading to save.
    // Let's assume the save button would be queryable if the component renders it.
    // This test will focus on the action call and state changes post-save.
    
    // Manually trigger save for now as button isn't explicitly in this mock structure
    // In a real scenario, you'd find and click the button.
    // To do this, we'd need to not mock the Card, CardContent, CardFooter parts.
    // For now, let's assume the component has an internal way to trigger handleSave or test it indirectly.

    // To test the save logic more directly without relying on finding the button in a potentially complex DOM:
    // We can simulate the conditions and call the save handler if possible, or verify through side effects.
    
    // Simulate dirty state so save button would be active.
    // The component itself should render a save button. Let's assume it does with text "Save Changes"
    // If not, this test needs to be adapted or the component needs to expose the save button.
    // For now, we directly test the interaction leading to the API call.

    // To make this testable, we need to ensure the save button is rendered or its action is testable.
    // Given the component structure, the save button is within a CardFooter shown when isDirty is true.
    // So, making it dirty should show the button.

    // The component will re-render with CardFooter if isDirty becomes true.
    // Let's try to find the save button after making it dirty.
    await waitFor(() => {
        // The save button should appear, and we can click it
        // This requires that the actual component (not a fully mocked one) is rendered to find the button
        // The test current setup does render the actual EditableInitialProblemStatement component.
        const saveButton = screen.getByRole('button', { name: /Save Changes/i });
        expect(saveButton).toBeInTheDocument();
        fireEvent.click(saveButton);
    });
    
    await waitFor(() => {
      expect(mockUpdateDialecticProjectInitialPrompt).toHaveBeenCalledWith({ projectId: testProjectId, newInitialPrompt: newPromptText });
    });
    expect(toast.success).toHaveBeenCalledWith('Success', { description: 'Initial problem statement saved.' });
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(localStorageKey);
    expect(vi.mocked(useWarnIfUnsavedChanges)).toHaveBeenLastCalledWith(false); // isDirty becomes false after save
  });

  // Further tests: cancel, file upload, save failure, etc.
}); 