import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticStore, DialecticProject, CreateProjectPayload, ApiError, PlaceholderDialecticProjectResource } from '@paynless/types';
import { usePlatform } from '@paynless/platform';
import type { CapabilitiesContextValue, PlatformCapabilities } from '@paynless/types';
import { CreateDialecticProjectForm } from './CreateDialecticProjectForm';

// Mock @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useDialecticStore: vi.fn(),
  };
});

// Mock @paynless/platform
vi.mock('@paynless/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/platform')>();
  return {
    ...actual,
    usePlatform: vi.fn(),
    platformEventEmitter: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
  };
});

// Simplified Mock for TextInputArea
let capturedTextInputAreaProps: any = {};
// This function will be reassigned to the onFileLoad passed to the mock
// and can be called by tests to simulate a file load.
let triggerMockTextInputAreaOnFileLoad = async (content: string | ArrayBuffer, file: File) => {};

vi.mock('@/components/common/TextInputArea', () => ({
  TextInputArea: vi.fn((props) => {
    capturedTextInputAreaProps = { ...props }; // Capture all props for inspection
    // Make the passed onFileLoad available for tests to call
    if (props.onFileLoad) {
      triggerMockTextInputAreaOnFileLoad = props.onFileLoad;
    }
    return (
      <div data-testid={props.dataTestId || 'mock-text-input-area'}>
        <label htmlFor={props.id}>{props.label}</label>
        <textarea
          id={props.id}
          value={props.value} // Use the value prop passed by RHF
          onChange={(e) => props.onChange(e.target.value)} // Allow RHF to control changes
          placeholder={props.placeholder}
          aria-label={props.label}
          rows={props.rows}
          disabled={props.disabled}
        />
        {/* Indicators for prop checking */}
        {props.showFileUpload && <div data-testid={`${props.dataTestId}-fileupload-indicator`}>FileUploadActive</div>}
        {props.showPreviewToggle && <div data-testid={`${props.dataTestId}-previewtoggle-indicator`}>PreviewToggleActive</div>}
      </div>
    );
  }),
}));

vi.mock('@/components/dialectic/DomainSelector', () => ({
    DomainSelector: vi.fn(() => <div data-testid="mock-domain-selector">Mock Domain Selector</div>),
}));

const mockCreateDialecticProject = vi.fn();
const mockUploadProjectResourceFile = vi.fn();
const mockResetCreateProjectError = vi.fn();

const createMockStoreState = (overrides: Partial<DialecticStore>): DialecticStore => {
  return {
    ...initialDialecticStateValues,
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
    fetchDialecticProjects: vi.fn(),
    availableDomainTags: [],
    isLoadingDomainTags: false,
    domainTagsError: null,
    selectedDomainTag: null, 
    fetchAvailableDomainTags: vi.fn(),
    setSelectedDomainTag: vi.fn(),
    currentProjectDetail: null,
    isLoadingProjectDetail: false,
    projectDetailError: null,
    fetchDialecticProjectDetails: vi.fn(),
    modelCatalog: [],
    isLoadingModelCatalog: false,
    modelCatalogError: null,
    fetchAIModelCatalog: vi.fn(),
    isCreatingProject: false,
    createProjectError: null,
    createDialecticProject: mockCreateDialecticProject,
    uploadProjectResourceFile: mockUploadProjectResourceFile, 
    isStartingSession: false,
    startSessionError: null,
    startDialecticSession: vi.fn(),
    contributionContentCache: {},
    fetchContributionContent: vi.fn(),
    _resetForTesting: vi.fn(),
    resetCreateProjectError: mockResetCreateProjectError,
    resetProjectDetailsError: vi.fn(),
    ...overrides,
  } as DialecticStore;
};

const createMockPlatformContext = (overrides?: Partial<PlatformCapabilities>): CapabilitiesContextValue => {
  const localDefaultCaps: PlatformCapabilities = {
    platform: 'web',
    os: 'unknown',
    fileSystem: { isAvailable: false },
  };
  const finalCaps = { ...localDefaultCaps, ...(overrides || {}) };
  return {
    capabilities: finalCaps,
    isLoadingCapabilities: false,
    capabilityError: null,
  };
};

describe('CreateDialecticProjectForm', () => {
  let mockStore: DialecticStore;
  const mockOnProjectCreated = vi.fn();
  let TextInputAreaMockComponent: any; // To store the vi.mocked version

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStore = createMockStoreState({});
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    const defaultPlatformContext = createMockPlatformContext();
    vi.mocked(usePlatform).mockReturnValue(defaultPlatformContext);
    mockOnProjectCreated.mockClear();
    
    // Get the mocked TextInputArea component
    const TIA_Module = await import('@/components/common/TextInputArea');
    TextInputAreaMockComponent = vi.mocked(TIA_Module.TextInputArea);
    TextInputAreaMockComponent.mockClear();

    // Reset prop capture and proxy for each test
    capturedTextInputAreaProps = {};
    triggerMockTextInputAreaOnFileLoad = async (content: string | ArrayBuffer, file: File) => {}; 
  });

  const renderForm = (props: Partial<Parameters<typeof CreateDialecticProjectForm>[0]> = {}) => {
    return render(
      <MemoryRouter>
        <CreateDialecticProjectForm onProjectCreated={mockOnProjectCreated} {...props} />
      </MemoryRouter>
    );
  };

  it('renders form fields and passes correct props to TextInputArea', () => {
    renderForm();
    expect(screen.getByLabelText(/Project Name/i)).toBeInTheDocument();
    
    expect(TextInputAreaMockComponent).toHaveBeenCalled();
    const propsPassed = capturedTextInputAreaProps;
    
    expect(propsPassed.id).toBe('initialUserPrompt');
    expect(propsPassed.label).toBe('Initial User Prompt / Problem Statement');
    expect(propsPassed.dataTestId).toBe('text-input-area-for-prompt');
    expect(propsPassed.showPreviewToggle).toBe(true);
    expect(propsPassed.showFileUpload).toBe(true);
    expect(propsPassed.onFileLoad).toBeInstanceOf(Function); // This is handleFileLoadForPrompt
    expect(propsPassed.fileUploadConfig).toEqual({
      acceptedFileTypes: ['.md', 'text/markdown'],
      maxSize: 5 * 1024 * 1024,
      multipleFiles: false,
    });
    expect(screen.getByTestId('text-input-area-for-prompt-fileupload-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('text-input-area-for-prompt-previewtoggle-indicator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeInTheDocument();
  });

  it('initializes TextInputArea with defaultInitialPrompt', () => {
    const defaultPrompt = "This is my default prompt.";
    renderForm({ defaultInitialPrompt: defaultPrompt });
    expect(capturedTextInputAreaProps.value).toBe(defaultPrompt);
  });

  it('updates prompt value and auto-fills project name when onFileLoad is triggered from TextInputArea', async () => {
    const { rerenderWithProps } = renderForm(); // Use a helper for rerender if needed, or just rerender

    const markdownContent = '# Hello From Test File';
    const fileName = 'test-file-name.md';
    const file = new File([markdownContent], fileName, { type: 'text/markdown' });
    
    // Simulate TextInputArea calling its onFileLoad prop (which is handleFileLoadForPrompt in the form)
    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad(markdownContent, file);
    });
    
    // We need to wait for React Hook Form to update the form state and pass the new value to TextInputArea
    // Then we check the captured props again after the update.
    // A direct rerender might not be enough if RHF updates are async. `waitFor` is better.
    await waitFor(() => {
        expect(capturedTextInputAreaProps.value).toBe(markdownContent);
    });
    
    // And check if the project name was auto-filled
    expect(screen.getByLabelText(/Project Name/i)).toHaveValue(fileName.replace('.md', ''));
  });

  it('passes showPreviewToggle=true to TextInputArea', () => {
    renderForm();
    expect(TextInputAreaMockComponent).toHaveBeenCalled();
    expect(capturedTextInputAreaProps.showPreviewToggle).toBe(true);
    expect(screen.getByTestId('text-input-area-for-prompt-previewtoggle-indicator')).toBeInTheDocument();
  });

  it('calls createDialecticProject with form data on submit', async () => {
    const user = userEvent.setup();
    const testData = { projectName: 'Test Project', initialUserPrompt: 'Test Prompt' };
    mockStore = createMockStoreState({ selectedDomainTag: null });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    
    const mockSuccessfulProject: DialecticProject = { ...testData, id: 'new-proj-123', userId: 'user-x', createdAt: '', updatedAt: '', status: 'active', selectedDomainTag: null, userDomainOverlayValues: null, dialecticSessions: [] }; 
    mockCreateDialecticProject.mockResolvedValueOnce({ data: mockSuccessfulProject, error: null });
    
    renderForm();

    await user.type(screen.getByLabelText(/Project Name/i), testData.projectName);
    // Simulate typing into our mocked TextInputArea by calling its onChange prop
    act(() => {
      capturedTextInputAreaProps.onChange(testData.initialUserPrompt);
    });
            
    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateDialecticProject).toHaveBeenCalledWith({
        ...testData,
        selectedDomainTag: null,
      });
    });
    await waitFor(() => {
      expect(mockOnProjectCreated).toHaveBeenCalledWith(mockSuccessfulProject.id, mockSuccessfulProject.project_name);
    });
  });

  it('uploads promptFile if present after successful project creation', async () => {
    const user = userEvent.setup();
    const projectName = 'Project With File';
    const fileContent = 'Content from uploaded file';
    const fileName = 'upload-me.md';
    const fileToUpload = new File([fileContent], fileName, { type: 'text/markdown' });

    const mockProject: DialecticProject = { id: 'proj-file-123', project_name: projectName, initialUserPrompt: fileContent, userId: 'u', createdAt: '', updatedAt: '', status: 'active', selectedDomainTag: null, userDomainOverlayValues: null, dialecticSessions: [] }; 
    mockCreateDialecticProject.mockResolvedValueOnce({ data: mockProject, error: null });
    const mockResource: Partial<PlaceholderDialecticProjectResource> = { id: 'res-1', fileName: fileName }; 
    (mockStore.uploadProjectResourceFile as any).mockResolvedValueOnce({ data: mockResource, error: null });

    renderForm();

    await user.type(screen.getByLabelText(/Project Name/i), projectName);
    // Simulate file being loaded via TextInputArea
    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad(fileContent, fileToUpload);
    });
        
    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateDialecticProject).toHaveBeenCalledWith({
        projectName: projectName,
        initialUserPrompt: fileContent,
        selectedDomainTag: null,
      });
    });
    await waitFor(() => {
      expect(mockUploadProjectResourceFile).toHaveBeenCalledWith({
        projectId: mockProject.id,
        file: expect.objectContaining({ name: fileName }),
        resourceDescription: 'Initial prompt file for project creation.',
      });
    });
    expect(mockOnProjectCreated).toHaveBeenCalledWith(mockProject.id, mockProject.project_name);
  });

  it('displays loading state correctly', () => {
    mockStore = createMockStoreState({ isCreatingProject: true });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    renderForm({submitButtonText: 'Launch'});
    expect(screen.getByRole('button', { name: /Creating Launch.../i })).toBeDisabled();
  });

  it('displays error message if creation fails and calls resetCreateProjectError', async () => {
    const user = userEvent.setup();
    const error = { message: 'Creation Failed badly' } as ApiError;
    
    // Set up the store that will be used by the component
    // Ensure resetCreateProjectError is the vi.fn() we defined globally
    mockStore = createMockStoreState({ 
        createProjectError: error, 
        isCreatingProject: false,
        // resetCreateProjectError is already mockResetCreateProjectError via createMockStoreState
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    // Simulate the thunk having failed and updated the store, then the component renders/re-renders.
    mockCreateDialecticProject.mockResolvedValueOnce({ data: null, error }); // Thunk call itself

    renderForm();
    
    // Fill form and submit to trigger the path that might use resetCreateProjectError on submit
    await user.type(screen.getByLabelText(/Project Name/i), 'Error Attempt');
    act(() => {
      capturedTextInputAreaProps.onChange('some error prompt');
    });
    
    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    // The submit handler in the component calls resetCreateProjectError first if creationError exists
    // So, by setting creationError in the store beforehand, this call will be made.
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockResetCreateProjectError).toHaveBeenCalled(); // Check if called during submit path
    });

    // Now also check the useEffect cleanup path for a subsequent error scenario
    // For this, we need to ensure the component has mounted with an error
    // and then potentially unmounts or the error changes, triggering the cleanup.
    // This part is tricky; the primary check is if the error is displayed.
    // The useEffect cleanup is harder to deterministically trigger without unmounting.

    // Verify the error alert is displayed
    await waitFor(() => {
      const alert = screen.getByTestId('creation-error-alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText(error.message)).toBeInTheDocument();
    });

    // The original error also mentioned useEffect. If `creationError` is in the store when the component mounts,
    // the useEffect will call `resetCreateProjectError`.
    // To test this specific useEffect call on mount with error:
    mockResetCreateProjectError.mockClear(); // Clear previous calls from submit
    const { unmount } = renderForm(); // Initial render where error is present
    await waitFor(() => {
        // useEffect on mount (if error is present) should call it
        // This relies on mockStore already having createProjectError set.
        expect(mockResetCreateProjectError).toHaveBeenCalled();
    });
    unmount(); // This will trigger the cleanup effect
    await waitFor(() => {
        // useEffect cleanup (if error was present) should call it again
        expect(mockResetCreateProjectError).toHaveBeenCalledTimes(2); // Once on mount, once on unmount
    });
  });

  it('does not display DomainSelector if enableDomainSelection is false', () => {
    renderForm({ enableDomainSelection: false });
    expect(screen.queryByTestId('mock-domain-selector')).not.toBeInTheDocument();
  });

  it('displays DomainSelector by default', () => {
    renderForm();
    expect(screen.getByTestId('mock-domain-selector')).toBeInTheDocument();
  });

  it('uses custom submitButtonText', () => {
    const customText = "Go Go Go";
    renderForm({ submitButtonText: customText });
    expect(screen.getByRole('button', { name: customText })).toBeInTheDocument();
  });
}); 