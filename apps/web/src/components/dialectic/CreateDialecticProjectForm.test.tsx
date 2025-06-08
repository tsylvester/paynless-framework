import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked, Mock } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticStore, DialecticProject, ApiError, DialecticProjectResource } from '@paynless/types';
import { usePlatform } from '@paynless/platform';
import type { CapabilitiesContextValue, PlatformCapabilities } from '@paynless/types';
import { CreateDialecticProjectForm } from './CreateDialecticProjectForm';
import type { TextInputAreaProps } from '@/components/common/TextInputArea';

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
let capturedTextInputAreaProps: Partial<TextInputAreaProps> = {};
// This function will be reassigned to the onFileLoad passed to the mock
// and can be called by tests to simulate a file load.
let triggerMockTextInputAreaOnFileLoad = async (_content: string | ArrayBuffer, _file: File): Promise<void> => { void _content; void _file; };

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
  let TextInputAreaMockComponent: Mocked<typeof import('@/components/common/TextInputArea').TextInputArea>;

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

    // Reset prop capture and proxy for each test
    capturedTextInputAreaProps = {};
    triggerMockTextInputAreaOnFileLoad = async (_content: string | ArrayBuffer, _file: File): Promise<void> => { void _content; void _file; };
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

    const markdownContent = '# Hello From Test File';
    const fileName = 'test-file-name.md';
    const file = new File([markdownContent], fileName, { type: 'text/markdown' });
    
    renderForm(); // Render the form so capturedTextInputAreaProps.onChange is available

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
    const expectedProjectName = markdownContent.replace(/^#\s*/, '').split('\n')[0]; // Derived from content
    expect(screen.getByLabelText(/Project Name/i)).toHaveValue(expectedProjectName);
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
    
    const mockSuccessfulProject: DialecticProject = { 
      ...testData, 
      id: 'new-proj-123', 
      user_id: 'user-x', 
      created_at: '', 
      updated_at: '', 
      status: 'active', 
      selected_domain_tag: null, 
      selected_domain_overlay_id: null,
      repo_url: null,
      project_name: testData.projectName,
      initial_user_prompt: testData.initialUserPrompt,
    }; 
    mockCreateDialecticProject.mockResolvedValueOnce({ data: mockSuccessfulProject, error: null });
    
    renderForm();

    await user.type(screen.getByLabelText(/Project Name/i), testData.projectName);
    // Simulate typing into our mocked TextInputArea by calling its onChange prop
    act(() => {
      capturedTextInputAreaProps.onChange?.(testData.initialUserPrompt);
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

    const mockProject: DialecticProject = { 
      id: 'proj-file-123', 
      project_name: projectName, 
      initial_user_prompt: fileContent, 
      user_id: 'u', 
      created_at: '', 
      updated_at: '', 
      status: 'active', 
      selected_domain_tag: null, 
      selected_domain_overlay_id: null,
      repo_url: null,
    }; 
    mockCreateDialecticProject.mockResolvedValueOnce({ data: mockProject, error: null });
    const mockResource: Partial<DialecticProjectResource> = { id: 'res-1', file_name: fileName }; 
    (mockStore.uploadProjectResourceFile as Mock).mockResolvedValueOnce({ data: mockResource, error: null });

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
        projectName: 'Project With File',
        initialUserPrompt: '',
        selectedDomainTag: null,
      });
    });

    const mockProjectResult = mockCreateDialecticProject.mock.results[0].value.data;

    // Wait for the upload function to be called
    await waitFor(() => {
      expect(mockUploadProjectResourceFile).toHaveBeenCalledWith({
        projectId: mockProjectResult.id,
        file: expect.any(File),
        fileName: fileName,
        fileSizeBytes: fileToUpload.size,
        fileType: fileToUpload.type,
        resourceDescription: 'Initial prompt file for project creation.',
      });
    });

    expect(mockOnProjectCreated).toHaveBeenCalledWith(mockProjectResult.id, mockProjectResult.project_name);
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
      capturedTextInputAreaProps.onChange?.('some error prompt');
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

  it('auto-fills project name from typed prompt if project name is empty and not manually set', async () => {
    renderForm({ defaultProjectName: '' }); // Start with an empty project name

    const promptTyped = "This is the first line for auto-name.\nSecond line.";
    const expectedProjectName = "This is the first line for auto-name."; // Max 50 chars, but our example is shorter

    // Simulate typing into the mocked TextInputArea for the prompt
    // This calls the onChange prop passed to the mock, which updates RHF's state for initialUserPrompt
    act(() => {
      capturedTextInputAreaProps.onChange?.(promptTyped);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Project Name/i)).toHaveValue(expectedProjectName);
    });

    // Now, type more into the prompt, project name should not change if it was already auto-filled from prompt and not touched
    const additionalPromptText = " More text.";
    act(() => {
      capturedTextInputAreaProps.onChange?.(promptTyped + additionalPromptText);
    });
    // It should still be the original auto-filled name unless a new auto-fill logic for subsequent changes is implemented
    // Based on current logic, it should stick after the first auto-fill from prompt if not manually edited.
    await waitFor(() => {
        expect(screen.getByLabelText(/Project Name/i)).toHaveValue(expectedProjectName);
    });
  });

  it('manual project name edits stop auto-filling from prompt and subsequent file loads', async () => {
    const user = userEvent.setup();
    renderForm({ defaultProjectName: '' });

    // 1. Auto-fill from initial prompt typing
    const initialPrompt = "Auto-fill me first.";
    const expectedInitialAutoName = "Auto-fill me first.";
    act(() => {
      capturedTextInputAreaProps.onChange?.(initialPrompt);
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/Project Name/i)).toHaveValue(expectedInitialAutoName);
    });

    // 2. Manually edit project name
    const manualProjectName = "My Manual Project Name";
    const projectNameInput = screen.getByLabelText(/Project Name/i) as HTMLInputElement;

    // Clear the input. This will trigger auto-fill.
    await user.clear(projectNameInput);

    // Wait for the re-auto-fill to occur and capture the re-auto-filled value's length
    let autoFilledValueLength = 0;
    await waitFor(() => {
      expect(projectNameInput.value).toBe(expectedInitialAutoName); // "Auto-fill me first."
      autoFilledValueLength = projectNameInput.value.length;
    });

    // Now, type the manual name, ensuring it replaces the re-auto-filled content.
    // The component's onChange for the input should set projectNameManuallySet = true on the first char typed.
    await user.type(projectNameInput, manualProjectName, {
        initialSelectionStart: 0,
        initialSelectionEnd: autoFilledValueLength, // Use the captured length
    });

    await waitFor(() => {
      expect(projectNameInput.value).toBe(manualProjectName);
    });

    // 3. Type more into the prompt - project name should NOT change
    const newPromptText = "This new prompt should not change the manual name.";
    act(() => {
      capturedTextInputAreaProps.onChange?.(newPromptText);
    });
    await waitFor(() => {
      expect(projectNameInput).toHaveValue(manualProjectName);
    });

    // 4. Simulate a new file load - project name should also NOT change
    const fileContent = "Content from a new file.";
    const newFile = new File([fileContent], "new-file.md", { type: "text/markdown" });
    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad(fileContent, newFile);
    });
    await waitFor(() => {
      // Prompt text area should update
      expect(capturedTextInputAreaProps.value).toBe(fileContent);
      // Project name should remain the manual one
      expect(projectNameInput).toHaveValue(manualProjectName);
    });
  });

  it('handles promptFile upload failure gracefully after project creation', async () => {
    const user = userEvent.setup();
    const fileName = 'upload-fails.md';
    const fileContent = 'Content for project whose file upload will fail';
    const fileToUpload = new File([fileContent], fileName, { type: 'text/markdown' });

    renderForm({ defaultProjectName: '' });

    // Simulate file load for the prompt
    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad(fileContent, fileToUpload);
    });
    
    const expectedProjectNameFromFileContent = fileContent.split('\n')[0];

    await waitFor(() => {
      expect(capturedTextInputAreaProps.value).toBe(fileContent);
      // Project name should auto-fill from file content's first line
      expect(screen.getByLabelText(/Project Name/i)).toHaveValue(expectedProjectNameFromFileContent); 
    });

    const mockSuccessfulProject: DialecticProject = {
      id: 'proj-upload-fail-456',
      user_id: 'user-y',
      project_name: expectedProjectNameFromFileContent, // Ensure this reflects the auto-filled name
      initial_user_prompt: fileContent, 
      selected_domain_tag: null,
      repo_url: null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as DialecticProject;

    mockCreateDialecticProject.mockResolvedValueOnce({ data: mockSuccessfulProject, error: null });
    // Simulate uploadProjectResourceFile failure
    const uploadError = { message: 'Simulated upload network error', code: 'NETWORK_ERROR' };
    (mockStore.uploadProjectResourceFile as Mock).mockResolvedValueOnce({ data: null, error: uploadError });

    // Spy on console.warn
    const consoleWarnSpy = vi.spyOn(console, 'warn');

    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    // Verify project creation was attempted
    await waitFor(() => {
      expect(mockCreateDialecticProject).toHaveBeenCalledWith({
        projectName: expectedProjectNameFromFileContent,
        initialUserPrompt: '', // Because promptFile is present, this should be empty
        selectedDomainTag: null,
      });
    });

    // Verify file upload was attempted
    await waitFor(() => {
      expect(mockUploadProjectResourceFile).toHaveBeenCalledWith({
        projectId: mockSuccessfulProject.id,
        file: fileToUpload,
        fileName: fileToUpload.name,
        fileSizeBytes: fileToUpload.size,
        fileType: fileToUpload.type,
        resourceDescription: 'Initial prompt file for project creation.',
      });
    });

    // Verify onProjectCreated was still called despite upload failure
    await waitFor(() => {
      expect(mockOnProjectCreated).toHaveBeenCalledWith(mockSuccessfulProject.id, mockSuccessfulProject.project_name);
    });

    // Verify the warning for upload failure was logged
    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Prompt file resource upload failed:',
        uploadError.message
      );
    });
    consoleWarnSpy.mockRestore();
  });
}); 