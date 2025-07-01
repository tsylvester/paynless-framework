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
    DialecticDomain,
} from '@paynless/types';
import { usePlatform } from '@paynless/platform';
import type { CapabilitiesContextValue, PlatformCapabilities } from '@paynless/types';
import { CreateDialecticProjectForm } from './CreateDialecticProjectForm';
import type { TextInputAreaProps } from '@/components/common/TextInputArea';

const projectNamePlaceholder = "A Notepad App with To Do lists";
const initialUserPromptPlaceholder = `I want to create a notepad app with a to-do list, reminders, and event scheduling. It should say hello world, tell me the date, and then list all of my tasks and notes.

I want it to record dates from my to-do list, schedule when it needs to be completed by, and provide reminders when the deadline is approaching.

It should be a web app with user accounts, built in typescript with next.js and shadcn components.`;

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
const mockResetCreateProjectError = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

let mockStoreState: DialecticStore;

const createMockStoreState = (overrides: Partial<DialecticStore>): DialecticStore => {
  mockStoreState = {
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
    setSelectedDomain: vi.fn((domain: DialecticDomain | null) => {
      if (mockStoreState) {
        mockStoreState.selectedDomain = domain;
      }
    }),

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
  return mockStoreState;
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
        <CreateDialecticProjectForm {...props} />
      </MemoryRouter>
    );
  };

  it('renders form fields and passes correct props to TextInputArea', () => {
    renderForm();
    expect(screen.getByPlaceholderText(projectNamePlaceholder)).toBeInTheDocument();
    
    expect(TextInputAreaMockComponent).toHaveBeenCalled();
    const propsPassed = capturedTextInputAreaProps;
    
    expect(propsPassed.id).toBe('initial-user-prompt');
    expect(propsPassed.label).toBe('');
    expect(propsPassed.placeholder).toBe(initialUserPromptPlaceholder);
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
    expect(screen.getByPlaceholderText(projectNamePlaceholder)).toHaveValue(expectedProjectName);
  });

  it('passes showPreviewToggle=true to TextInputArea', () => {
    renderForm();
    expect(TextInputAreaMockComponent).toHaveBeenCalled();
    expect(capturedTextInputAreaProps.showPreviewToggle).toBe(true);
    expect(screen.getByTestId('text-input-area-for-prompt-previewtoggle-indicator')).toBeInTheDocument();
  });

  it('submits with placeholder values when form fields are empty', async () => {
    const user = userEvent.setup();
    const mockSelectedDomain: DialecticDomain = { id: 'domain-1', name: 'General', description: '', parent_domain_id: null, is_enabled: true };
    mockStore = createMockStoreState({ selectedDomain: mockSelectedDomain });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    
    const mockSuccessfulProject: DialecticProject = { id: 'new-proj-123', project_name: projectNamePlaceholder } as DialecticProject;
    mockCreateDialecticProject.mockResolvedValueOnce({ data: mockSuccessfulProject, error: null });
    
    renderForm();
            
    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateDialecticProject).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: projectNamePlaceholder,
          initialUserPrompt: initialUserPromptPlaceholder,
          selectedDomainId: mockSelectedDomain.id,
        })
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/dialectic/${mockSuccessfulProject.id}`);
    });
  });

  it('calls createDialecticProject with form data on submit', async () => {
    const user = userEvent.setup();
    const testData = { projectName: 'Test Project', initialUserPrompt: 'Test Prompt' };
    const mockSelectedDomain: DialecticDomain = { id: 'domain-1', name: 'General', description: '', parent_domain_id: null, is_enabled: true };
    mockStore = createMockStoreState({ selectedDomain: mockSelectedDomain });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    
    const mockSuccessfulProject: DialecticProject = {
      id: 'new-proj-123',
      user_id: 'user-xyz',
      project_name: testData.projectName,
      initial_user_prompt: testData.initialUserPrompt,
      created_at: '',
      updated_at: '',
      status: 'active',
      selected_domain_id: 'domain-1',
      selected_domain_overlay_id: null,
      repo_url: null,
      dialectic_domains: { name: 'General' },
      dialectic_process_templates: null,
      isLoadingProcessTemplate: false,
      processTemplateError: null,
      contributionGenerationStatus: 'idle',
      generateContributionsError: null,
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      isSavingContributionEdit: false,
      saveContributionEditError: null,
    };
    mockCreateDialecticProject.mockResolvedValueOnce({ data: mockSuccessfulProject, error: null });
    
    renderForm();

    await user.type(screen.getByPlaceholderText(projectNamePlaceholder), testData.projectName);
    act(() => {
      capturedTextInputAreaProps.onChange?.(testData.initialUserPrompt);
    });
            
    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateDialecticProject).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: testData.projectName,
          initialUserPrompt: testData.initialUserPrompt,
          selectedDomainId: mockSelectedDomain.id,
        })
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/dialectic/${mockSuccessfulProject.id}`);
    });
  });

  it('uploads promptFile if present after successful project creation', async () => {
    const user = userEvent.setup();
    const markdownContent = '# My Project From File';
    const file = new File([markdownContent], 'test.md', { type: 'text/markdown' });

    const mockCreatedProject: DialecticProject = {
      id: 'proj-with-file',
      user_id: 'user-abc',
      project_name: 'My Project From File',
      created_at: '',
      updated_at: '',
      status: 'active',
      selected_domain_id: 'domain-1',
      selected_domain_overlay_id: null,
      repo_url: null,
      dialectic_domains: { name: 'General' },
      dialectic_process_templates: null,
      isLoadingProcessTemplate: false,
      processTemplateError: null,
      contributionGenerationStatus: 'idle',
      generateContributionsError: null,
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      isSavingContributionEdit: false,
      saveContributionEditError: null,
    };

    mockCreateDialecticProject.mockResolvedValueOnce({ data: mockCreatedProject, error: null });

    const mockSelectedDomain: DialecticDomain = { id: 'domain-1', name: 'General', description: '', parent_domain_id: null, is_enabled: true };
    mockStore = createMockStoreState({ selectedDomain: mockSelectedDomain });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    renderForm();

    // Simulate file upload via the TextInputArea's onFileLoad prop
    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad(markdownContent, file);
    });

    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateDialecticProject).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: 'My Project From File',
          initialUserPrompt: markdownContent,
          promptFile: file,
          selectedDomainId: 'domain-1',
        })
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/dialectic/${mockCreatedProject.id}`);
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
    const error: ApiError = { message: 'Creation failed', code: 'SERVER_ERROR' };
    mockCreateDialecticProject.mockResolvedValueOnce({ data: null, error });

    const mockSelectedDomain: DialecticDomain = { id: 'domain-1', name: 'General', description: '', parent_domain_id: null, is_enabled: true };
    mockStore = createMockStoreState({ 
      selectedDomain: mockSelectedDomain,
      createProjectError: error // Also set the error state
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    
    renderForm();

    await user.type(screen.getByPlaceholderText(projectNamePlaceholder), 'Error Project');
    act(() => {
      capturedTextInputAreaProps.onChange?.('This will fail.');
    });

    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('creation-error-alert')).toHaveTextContent(error.message);
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
    const customText = "Launch It!";
    renderForm({ submitButtonText: customText });
    expect(screen.getByRole('button', { name: new RegExp(customText) })).toBeInTheDocument();
  });

  it('auto-fills project name from typed prompt if project name is empty and not manually set', async () => {
    renderForm();
    const promptText = "This is the first line.\nAnd this is the second.";
    act(() => {
      capturedTextInputAreaProps.onChange?.(promptText);
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(projectNamePlaceholder)).toHaveValue("This is the first line.");
    });
  });

  it('manual project name edits stop auto-filling from prompt and subsequent file loads', async () => {
    const user = userEvent.setup();
    renderForm();

    const manualProjectName = "My Manual Project";
    await user.type(screen.getByPlaceholderText(projectNamePlaceholder), manualProjectName);

    // Now, type in the prompt - project name should NOT change
    act(() => {
      capturedTextInputAreaProps.onChange?.("A new prompt that won't change the name.");
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(projectNamePlaceholder)).toHaveValue(manualProjectName);
    });

    // Now, simulate a file load - project name should also NOT change
    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad("# A file that won't change the name", new File([""], "test.md"));
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(projectNamePlaceholder)).toHaveValue(manualProjectName);
    });
  });

  it('displays error message if creation fails and calls resetCreateProjectError on next submission attempt', async () => {
    const user = userEvent.setup();
    const initialError: ApiError = { message: 'Initial failure', code: 'SERVER_ERROR' };
    
    // First attempt fails
    mockCreateDialecticProject.mockResolvedValueOnce({ data: null, error: initialError });

    const mockSelectedDomain: DialecticDomain = { id: 'domain-1', name: 'General', description: '', parent_domain_id: null, is_enabled: true };
    const mockStoreWithState = createMockStoreState({
        selectedDomain: mockSelectedDomain,
        createProjectError: initialError, // Start with an error
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStoreWithState));

    renderForm();
    
    // Check initial error is shown
    await waitFor(() => {
        expect(screen.getByTestId('creation-error-alert')).toHaveTextContent(initialError.message);
    });

    // Mock successful response for the second attempt
    const mockSuccessfulProject: DialecticProject = { id: 'proj-456', user_id: 'user-xyz', project_name: 'Retry Project', created_at: '', updated_at: '', status: 'active', selected_domain_id: 'domain-1', dialectic_domains: { name: 'General' }, selected_domain_overlay_id: null, repo_url: null, dialectic_process_templates: null, isLoadingProcessTemplate: false, processTemplateError: null, contributionGenerationStatus: 'idle', generateContributionsError: null, isSubmittingStageResponses: false, submitStageResponsesError: null, isSavingContributionEdit: false, saveContributionEditError: null };
    mockCreateDialecticProject.mockResolvedValueOnce({ data: mockSuccessfulProject, error: null });

    // Simulate user trying again
    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    // The component should call resetCreateProjectError on mount/effect if there's an error.
    // The test setup will re-render, triggering this. We can also check if the mock was called.
    await waitFor(() => {
        expect(mockResetCreateProjectError).toHaveBeenCalled();
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

  it('uses custom submitButtonText', () => {
    const customText = "Initiate Dialectic";
    renderForm({ submitButtonText: customText });
    expect(screen.getByRole('button', { name: new RegExp(customText) })).toBeInTheDocument();
  });

  it('auto-fills project name from typed prompt if project name is empty and not manually set', async () => {
    renderForm();
    const promptText = "This is a new line of thinking.\nWith a second line.";
    
    act(() => {
      capturedTextInputAreaProps.onChange?.(promptText);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(projectNamePlaceholder)).toHaveValue("This is a new line of thinking.");
    });
  });

  it('manual project name edits stop auto-filling from prompt and subsequent file loads', async () => {
    const user = userEvent.setup();
    renderForm();

    const manualProjectName = "User Defined Name";
    await user.type(screen.getByPlaceholderText(projectNamePlaceholder), manualProjectName);

    act(() => {
      capturedTextInputAreaProps.onChange?.("This prompt should not override the manual name.");
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(projectNamePlaceholder)).toHaveValue(manualProjectName);
    });

    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad("# This file should not override", new File([""], "another.md"));
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(projectNamePlaceholder)).toHaveValue(manualProjectName);
    });
  });
}); 