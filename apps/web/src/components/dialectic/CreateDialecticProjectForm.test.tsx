import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { 
    DialecticStore, 
    DialecticProject, 
    ApiError, 
    DialecticProjectResource,
} from '@paynless/types';
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
let triggerMockTextInputAreaOnFileLoad = async (_content: string | ArrayBuffer, _file: File): Promise<void> => { void _content; void _file; };

vi.mock('@/components/common/TextInputArea', () => ({
  TextInputArea: vi.fn((props) => {
    capturedTextInputAreaProps = { ...props };
    if (props.onFileLoad) {
      triggerMockTextInputAreaOnFileLoad = props.onFileLoad;
    }
    return (
      <div data-testid={props.dataTestId || 'mock-text-input-area'}>
        <label htmlFor={props.id}>{props.label}</label>
        <textarea
          id={props.id}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          aria-label={props.label}
          rows={props.rows}
          disabled={props.disabled}
        />
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
const mockSetSelectedDomain = vi.fn();

const createMockStoreState = (overrides: Partial<DialecticStore>): DialecticStore => {
  return {
    ...initialDialecticStateValues,
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
    fetchDialecticProjects: vi.fn(),
    
    domains: [],
    isLoadingDomains: false,
    domainsError: null,
    selectedDomain: null,
    fetchDomains: vi.fn(),
    setSelectedDomain: mockSetSelectedDomain,

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
  const localDefaultCaps: PlatformCapabilities = { platform: 'web', os: 'unknown', fileSystem: { isAvailable: false } };
  return {
    capabilities: { ...localDefaultCaps, ...(overrides || {}) },
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
    
    const TIA_Module = await import('@/components/common/TextInputArea');
    TextInputAreaMockComponent = vi.mocked(TIA_Module.TextInputArea);

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
    
    expect(propsPassed.id).toBe('initial-user-prompt');
    expect(propsPassed.label).toBe('Initial User Prompt / Problem Statement');
    expect(propsPassed.dataTestId).toBe('text-input-area-for-prompt');
    expect(propsPassed.showPreviewToggle).toBe(true);
    expect(propsPassed.showFileUpload).toBe(true);
    expect(propsPassed.onFileLoad).toBeInstanceOf(Function);
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
    
    renderForm();

    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad(markdownContent, file);
    });
    
    await waitFor(() => {
        expect(capturedTextInputAreaProps.value).toBe(markdownContent);
    });
    
    const expectedProjectName = markdownContent.replace(/^#\s*/, '').split('\n')[0];
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
    mockStore = createMockStoreState({ selectedDomain: null });
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
    act(() => {
      capturedTextInputAreaProps.onChange?.(testData.initialUserPrompt);
    });
            
    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateDialecticProject).toHaveBeenCalledWith({
        projectName: testData.projectName,
        initialUserPromptText: testData.initialUserPrompt,
        domainId: undefined,
        selectedDomainOverlayId: null,
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
    mockUploadProjectResourceFile.mockResolvedValueOnce({ data: mockResource, error: null });

    renderForm();

    await user.type(screen.getByLabelText(/Project Name/i), projectName);
    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad(fileContent, fileToUpload);
    });
        
    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateDialecticProject).toHaveBeenCalledWith({
        projectName: projectName,
        promptFile: fileToUpload,
        domainId: undefined,
        selectedDomainOverlayId: null,
      });
    });

    await waitFor(() => {
      const resultValue = mockCreateDialecticProject.mock.results[0]?.value;
      expect(resultValue).toBeDefined();
      const mockProjectResult = resultValue?.data;
      expect(mockProjectResult).toBeDefined();
      expect(mockOnProjectCreated).toHaveBeenCalledWith(mockProjectResult.id, mockProjectResult.project_name);
    });
  });

  it('displays loading state correctly', () => {
    mockStore = createMockStoreState({ isCreatingProject: true });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    const customSubmitText = 'Launch';
    renderForm({submitButtonText: customSubmitText});
    const expectedButtonText = new RegExp(`Creating.*${customSubmitText}.*\\.\\.\\.`);
    expect(screen.getByRole('button', { name: expectedButtonText })).toBeDisabled();
  });

  it('displays error message if creation fails', async () => {
    const user = userEvent.setup();
    const error = { message: 'Creation Failed badly' } as ApiError;
    
    mockStore = createMockStoreState({});
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    
    mockCreateDialecticProject.mockImplementation(async () => {
      // Simulate the store update that would happen on failure
      mockStore.createProjectError = error;
      vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
      return { data: null, error };
    });

    renderForm();
    
    await user.type(screen.getByLabelText(/Project Name/i), 'Error Attempt');
    act(() => {
      capturedTextInputAreaProps.onChange?.('some error prompt');
    });
    
    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText('Creation Failed')).toBeInTheDocument();
      expect(screen.getByText(error.message)).toBeInTheDocument();
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
    renderForm({ defaultProjectName: '' });

    const promptTyped = "This is the first line for auto-name.\nSecond line.";
    const expectedProjectName = "This is the first line for auto-name.";

    act(() => {
      capturedTextInputAreaProps.onChange?.(promptTyped);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Project Name/i)).toHaveValue(expectedProjectName);
    });

    const additionalPromptText = " More text.";
    act(() => {
      capturedTextInputAreaProps.onChange?.(promptTyped + additionalPromptText);
    });
    await waitFor(() => {
        expect(screen.getByLabelText(/Project Name/i)).toHaveValue(expectedProjectName);
    });
  });

  it('manual project name edits stop auto-filling from prompt and subsequent file loads', async () => {
    const user = userEvent.setup();
    renderForm({ defaultProjectName: '' });

    const initialPrompt = "Auto-fill me first.";
    const expectedInitialAutoName = "Auto-fill me first.";
    act(() => {
      capturedTextInputAreaProps.onChange?.(initialPrompt);
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/Project Name/i)).toHaveValue(expectedInitialAutoName);
    });

    const manualProjectName = "My Manual Project Name";
    const projectNameInput = screen.getByLabelText(/Project Name/i) as HTMLInputElement;

    await user.clear(projectNameInput);

    await waitFor(() => {
      expect(projectNameInput.value).toBe(expectedInitialAutoName);
    });

    await user.type(projectNameInput, manualProjectName, {
        initialSelectionStart: 0,
        initialSelectionEnd: projectNameInput.value.length,
    });

    await waitFor(() => {
      expect(projectNameInput.value).toBe(manualProjectName);
    });

    const newPromptText = "This new prompt should not change the manual name.";
    act(() => {
      capturedTextInputAreaProps.onChange?.(newPromptText);
    });
    await waitFor(() => {
      expect(projectNameInput).toHaveValue(manualProjectName);
    });

    const fileContent = "Content from a new file.";
    const newFile = new File([fileContent], "new-file.md", { type: "text/markdown" });
    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad(fileContent, newFile);
    });
    await waitFor(() => {
      expect(capturedTextInputAreaProps.value).toBe(fileContent);
      expect(projectNameInput).toHaveValue(manualProjectName);
    });
  });

  it('handles promptFile upload failure gracefully after project creation', async () => {
    const user = userEvent.setup();
    const fileName = 'upload-fails.md';
    const fileContent = 'Content for project whose file upload will fail';
    const fileToUpload = new File([fileContent], fileName, { type: 'text/markdown' });

    renderForm({ defaultProjectName: '' });

    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad(fileContent, fileToUpload);
    });
    
    const expectedProjectNameFromFileContent = fileContent.split('\n')[0];

    await waitFor(() => {
      expect(capturedTextInputAreaProps.value).toBe(fileContent);
      expect(screen.getByLabelText(/Project Name/i)).toHaveValue(expectedProjectNameFromFileContent); 
    });

    const uploadError = { message: 'Simulated upload network error', code: 'NETWORK_ERROR' } as ApiError;
    
    mockCreateDialecticProject.mockReset();
    mockCreateDialecticProject.mockImplementation(async () => {
      mockStore.isCreatingProject = false;
      mockStore.createProjectError = uploadError;
      return { data: null, error: uploadError };
    });

    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    
    await act(async () => {
      await user.click(submitButton);
      vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    });

    await waitFor(() => {
      expect(mockCreateDialecticProject).toHaveBeenCalledWith({
        projectName: expectedProjectNameFromFileContent,
        promptFile: fileToUpload, 
        domainId: undefined,
        selectedDomainOverlayId: null,
      });
    });
    
    await waitFor(() => {
      expect(mockOnProjectCreated).not.toHaveBeenCalled();
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText('Creation Failed')).toBeInTheDocument();
      expect(screen.getByText(uploadError.message)).toBeInTheDocument();
    });
  });

  it('displays error message if creation fails and calls resetCreateProjectError on next submission attempt', async () => {
    const user = userEvent.setup();
    const error: ApiError = { message: 'Creation Failed badly', code: 'SERVER_ERROR' };

    // Initial render with an error
    let mockStore = createMockStoreState({ createProjectError: error });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    const { rerender } = render(
        <MemoryRouter>
            <CreateDialecticProjectForm onProjectCreated={mockOnProjectCreated} />
        </MemoryRouter>
    );
    await waitFor(() => {
        expect(screen.getByTestId('creation-error-alert')).toBeInTheDocument();
    });

    // Mock a successful submission for the next attempt
    mockCreateDialecticProject.mockResolvedValue({ data: { id: 'proj-456', project_name: 'New attempt' } as DialecticProject });
    
    // Simulate the user typing and clearing the error
    mockStore = createMockStoreState({ createProjectError: null });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    
    rerender(
        <MemoryRouter>
            <CreateDialecticProjectForm onProjectCreated={mockOnProjectCreated} />
        </MemoryRouter>
    );

    await waitFor(() => {
        expect(screen.queryByTestId('creation-error-alert')).not.toBeInTheDocument();
    });

    // Now, perform the submission
    await user.type(screen.getByLabelText(/Project Name/i), 'New attempt');
    act(() => {
      capturedTextInputAreaProps.onChange?.('This is a sufficiently long prompt');
    });
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    // Verify the successful submission
    await waitFor(() => {
        expect(mockOnProjectCreated).toHaveBeenCalledWith('proj-456', 'New attempt');
    });
  });
  
  it('displays DomainSelector when enableDomainSelection is true', () => {
    renderForm({ enableDomainSelection: true });
    expect(screen.getByTestId('mock-domain-selector')).toBeInTheDocument();
  });

  it('does not display DomainSelector when enableDomainSelection is false', () => {
    renderForm({ enableDomainSelection: false });
    expect(screen.queryByTestId('mock-domain-selector')).not.toBeInTheDocument();
  });
}); 