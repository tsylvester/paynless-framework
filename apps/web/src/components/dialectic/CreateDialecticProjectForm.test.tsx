import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { selectActiveChatWalletInfo } from '@paynless/store';
import type {
  CreateProjectAutoStartResult,
  ApiError,
  DialecticDomainRow,
  DialecticProjectRow,
  AiProvidersRow,
  ActiveChatWalletInfo,
  DialecticStateValues,
  DomainProcessAssociationRow,
  DialecticProcessTemplate,
  DialecticStage,
  SelectedModels,
} from '@paynless/types';
import {
  ComputeCostCeilingReturn,
  ComputeCostCeilingSuccessReturn,
} from '@paynless/utils';
import { usePlatform } from '@paynless/platform';
import type { CapabilitiesContextValue, PlatformCapabilities } from '@paynless/types';
import { CreateDialecticProjectForm } from './CreateDialecticProjectForm';
import type { TextInputAreaProps } from '@/components/common/TextInputArea';
import {
  initializeMockDialecticState,
  setDialecticStateValues,
  getDialecticStoreActionMock,
  mockAiProvidersRow,
  mockDialecticDomain,
  mockDomainProcessAssociationRow,
  mockDialecticStage,
  mockDialecticProcessTemplate,
} from '@/mocks/dialecticStore.mock';
import {
  mockedUseAuthStoreHookLogic,
  resetAuthStoreMock,
} from '@/mocks/authStore.mock';
import { mockAllTiers, mockUserTier } from '@/mocks/profile.mock';

const projectNamePlaceholder = "A Notepad App with To Do lists";
const initialUserPromptPlaceholder = `I want to create a notepad app with a to-do list, reminders, and event scheduling. It should say hello world, tell me the date, and then list all of my tasks and notes.

I want it to record dates from my to-do list, schedule when it needs to be completed by, and provide reminders when the deadline is approaching.

It should be a web app with user accounts, built in typescript with next.js and shadcn components.`;

const outputCapNotInitializedError: ApiError = {
  code: 'OUTPUT_CAP_NOT_INITIALIZED',
  message: 'Output cap is not initialized in dialectic store.',
};

const { selectPreProjectCostCeilingMock } = vi.hoisted(() => ({
  selectPreProjectCostCeilingMock: vi.fn<
    [DialecticStateValues],
    ComputeCostCeilingReturn
  >(),
}));

vi.mock('@paynless/store', async () => {
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualPaynlessStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const walletStoreMock = await vi.importActual<typeof import('@/mocks/walletStore.mock')>('@/mocks/walletStore.mock');
  const authStoreMock = await vi.importActual<typeof import('@/mocks/authStore.mock')>('@/mocks/authStore.mock');
  return {
    ...mockStoreExports,
    useAuthStore: authStoreMock.useAuthStore,
    useWalletStore: walletStoreMock.useWalletStore,
    selectActiveChatWalletInfo: walletStoreMock.selectActiveChatWalletInfo,
    initialWalletStateValues: actualPaynlessStore.initialWalletStateValues,
    selectIsCreatingProject: actualPaynlessStore.selectIsCreatingProject,
    selectCreateProjectError: actualPaynlessStore.selectCreateProjectError,
    selectSelectedDomain: actualPaynlessStore.selectSelectedDomain,
    selectDomains: actualPaynlessStore.selectDomains,
    selectDefaultGenerationModels: actualPaynlessStore.selectDefaultGenerationModels,
    selectSortedStages: actualPaynlessStore.selectSortedStages,
    selectPreProjectCostCeiling: selectPreProjectCostCeilingMock,
    initialDialecticStateValues: actualPaynlessStore.initialDialecticStateValues,
  };
});

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

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const createMockPlatformContext = (overrides?: Partial<PlatformCapabilities>): CapabilitiesContextValue => {
  const localDefaultCaps: PlatformCapabilities = { platform: 'web', os: 'unknown', fileSystem: { isAvailable: false } };
  return {
    capabilities: { ...localDefaultCaps, ...(overrides || {}) },
    isLoadingCapabilities: false,
    capabilityError: null,
  };
};

const mockSelectedDomain: DialecticDomainRow = mockDialecticDomain({
  id: 'domain-1',
  name: 'General',
  description: '',
});

const defaultWalletInfo: ActiveChatWalletInfo = {
  status: 'ok',
  type: 'personal',
  walletId: 'test-wallet',
  orgId: null,
  balance: '300000',
  isLoadingPrimaryWallet: false,
};

const processTemplateIdForSubmitTests = 'pt-form-submit-test';

const stageThesisForFormTest: DialecticStage = mockDialecticStage({
  id: 'stage-thesis-form',
  slug: 'thesis',
  display_name: 'Proposal',
  description: 'First stage for form test.',
  default_system_prompt_id: null,
});

const processTemplateForFormTest: DialecticProcessTemplate = mockDialecticProcessTemplate({
  id: processTemplateIdForSubmitTests,
  name: 'Form test template',
  description: null,
  starting_stage_id: stageThesisForFormTest.id,
  stages: [stageThesisForFormTest],
  transitions: [],
});

const mockSelectedDomainProcessAssociation: DomainProcessAssociationRow =
  mockDomainProcessAssociationRow({
    domain_id: mockSelectedDomain.id,
    process_template_id: processTemplateIdForSubmitTests,
    is_default_for_domain: true,
  });

const formTestSuccessCeiling: ComputeCostCeilingSuccessReturn = {
  stageCeilings: { thesis: 100000 },
  projectCeiling: 100000,
};

const catalogEntryOverrides: Partial<AiProvidersRow> = {
  provider: 'Provider',
  description: null,
  config: null,
  created_at: '',
  updated_at: '',
  is_default_embedding: false,
  min_plan_tier_level: 0,
};

const modelCatalogWithDefault: AiProvidersRow[] = [
  mockAiProvidersRow({
    ...catalogEntryOverrides,
    id: 'dft',
    name: 'Default',
    api_identifier: 'dft',
    is_default_generation: true,
    is_active: true,
  }),
];

const defaultSelectedModels: SelectedModels[] = [
  {
    id: 'dft',
    displayName: 'Default',
  },
];

function getProjectNameInput(): HTMLInputElement {
  const projectNameInput: HTMLElement | null = document.getElementById('project-name');
  if (projectNameInput === null || !(projectNameInput instanceof HTMLInputElement)) {
    throw new Error('Project name input not found');
  }
  return projectNameInput;
}

function buildMinimalDialecticProjectRow(overrides: { id: string; project_name: string }): DialecticProjectRow {
  return {
    id: overrides.id,
    user_id: 'user-xyz',
    project_name: overrides.project_name,
    initial_user_prompt: '',
    initial_prompt_resource_id: null,
    selected_domain_id: mockSelectedDomain.id,
    selected_domain_overlay_id: null,
    process_template_id: null,
    user_domain_overlay_values: null,
    repo_url: null,
    status: 'active',
    created_at: '',
    updated_at: '',
    idempotency_key: null,
  };
}

describe('CreateDialecticProjectForm', () => {
  let TextInputAreaMockComponent: Mocked<typeof import('@/components/common/TextInputArea').TextInputArea>;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetAuthStoreMock();
    mockedUseAuthStoreHookLogic.setState({
      userTier: mockUserTier,
      availableTiers: mockAllTiers,
    });
    selectPreProjectCostCeilingMock.mockReturnValue({
      error: outputCapNotInitializedError,
    });
    initializeMockDialecticState({
      selectedDomain: mockSelectedDomain,
      selectedDomainProcessAssociation: mockSelectedDomainProcessAssociation,
      modelCatalog: modelCatalogWithDefault,
      selectedModels: defaultSelectedModels,
      maxOutputTokens: 8192,
      isLoadingModelCatalog: false,
      currentProcessTemplate: processTemplateForFormTest,
    });
    const { initializeMockWalletStore } = await import('@/mocks/walletStore.mock');
    initializeMockWalletStore();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    const defaultPlatformContext = createMockPlatformContext();
    vi.mocked(usePlatform).mockReturnValue(defaultPlatformContext);

    const TIA_Module = await import('@/components/common/TextInputArea');
    TextInputAreaMockComponent = vi.mocked(TIA_Module.TextInputArea);

    capturedTextInputAreaProps = {};
    triggerMockTextInputAreaOnFileLoad = async (_content: string | ArrayBuffer, _file: File): Promise<void> => { void _content; void _file; };
  });

  const cycleToManualMode = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.click(screen.getByRole('checkbox', { name: /Autoconfig/i }));
    await waitFor(() => {
      expect(document.body.contains(screen.getByRole('checkbox', { name: /Manual/i }))).toBe(true);
    });
  };

  const renderForm = (props: Partial<Parameters<typeof CreateDialecticProjectForm>[0]> = {}) => {
    return render(
      <MemoryRouter>
        <CreateDialecticProjectForm {...props} />
      </MemoryRouter>
    );
  };

  it('renders form fields and passes correct props to TextInputArea', () => {
    renderForm();
    expect(document.body.contains(screen.getByPlaceholderText(projectNamePlaceholder))).toBe(true);
    
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
    expect(document.body.contains(screen.getByTestId('text-input-area-for-prompt-fileupload-indicator'))).toBe(true);
    expect(document.body.contains(screen.getByTestId('text-input-area-for-prompt-previewtoggle-indicator'))).toBe(true);
    expect(document.body.contains(screen.getByRole('button', { name: /Create Project/i }))).toBe(true);
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
    expect(getProjectNameInput().value).toBe(expectedProjectName);
  });

  it('passes showPreviewToggle=true to TextInputArea', () => {
    renderForm();
    expect(TextInputAreaMockComponent).toHaveBeenCalled();
    expect(capturedTextInputAreaProps.showPreviewToggle).toBe(true);
    expect(document.body.contains(screen.getByTestId('text-input-area-for-prompt-previewtoggle-indicator'))).toBe(true);
  });

  it('Manual path: submits with placeholder values and sends processTemplateId to createDialecticProject', async () => {
    const user = userEvent.setup();

    const mockSuccessfulProject: DialecticProjectRow = buildMinimalDialecticProjectRow({ id: 'new-proj-123', project_name: projectNamePlaceholder });
    vi.mocked(getDialecticStoreActionMock('createDialecticProject')).mockResolvedValueOnce({ data: mockSuccessfulProject, status: 200 });

    renderForm();

    await cycleToManualMode(user);

    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createDialecticProject')).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: projectNamePlaceholder,
          initialUserPrompt: initialUserPromptPlaceholder,
          selectedDomainId: mockSelectedDomain.id,
          processTemplateId: mockSelectedDomainProcessAssociation.process_template_id,
          idempotencyKey: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
        })
      );
    });
    const manualPayload = vi.mocked(getDialecticStoreActionMock('createDialecticProject')).mock.calls[0][0];
    expect(manualPayload).not.toHaveProperty('sessionIdempotencyKey');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/dialectic/${mockSuccessfulProject.id}`);
    });
  });

  it('Autostart path: submits with placeholder values and sends both idempotency keys to createProjectAndAutoStart', async () => {
    const user = userEvent.setup();
    const autoStartResult: CreateProjectAutoStartResult = { projectId: 'autostart-proj-id', sessionId: 'autostart-sess-id', hasDefaultModels: true };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(autoStartResult);
    selectPreProjectCostCeilingMock.mockReturnValue(formTestSuccessCeiling);
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);

    renderForm();

    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createProjectAndAutoStart')).toHaveBeenCalledTimes(1);
    });
    const autoStartPayload = vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mock.calls[0][0];
    expect(autoStartPayload.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(autoStartPayload.sessionIdempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(autoStartPayload).toEqual(
      expect.objectContaining({
        projectName: projectNamePlaceholder,
        initialUserPrompt: initialUserPromptPlaceholder,
        selectedDomainId: mockSelectedDomain.id,
        processTemplateId: mockSelectedDomainProcessAssociation.process_template_id,
      })
    );
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dialectic/autostart-proj-id/session/autostart-sess-id', expect.any(Object));
    });
  });

  it('Manual path: calls createDialecticProject with form data and processTemplateId on submit', async () => {
    const user = userEvent.setup();
    const testData = { projectName: 'Test Project', initialUserPrompt: 'Test Prompt' };

    const mockSuccessfulProject: DialecticProjectRow = buildMinimalDialecticProjectRow({ id: 'new-proj-123', project_name: testData.projectName });
    vi.mocked(getDialecticStoreActionMock('createDialecticProject')).mockResolvedValueOnce({ data: mockSuccessfulProject, status: 200 });

    renderForm();

    await cycleToManualMode(user);

    await user.type(screen.getByPlaceholderText(projectNamePlaceholder), testData.projectName);
    act(() => {
      capturedTextInputAreaProps.onChange?.(testData.initialUserPrompt);
    });

    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createDialecticProject')).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: testData.projectName,
          initialUserPrompt: testData.initialUserPrompt,
          selectedDomainId: mockSelectedDomain.id,
          processTemplateId: mockSelectedDomainProcessAssociation.process_template_id,
          idempotencyKey: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
        })
      );
    });
    const manualPayload = vi.mocked(getDialecticStoreActionMock('createDialecticProject')).mock.calls[0][0];
    expect(manualPayload).not.toHaveProperty('sessionIdempotencyKey');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/dialectic/${mockSuccessfulProject.id}`);
    });
  });

  it('Manual path: uploads promptFile and sends processTemplateId to createDialecticProject', async () => {
    const user = userEvent.setup();
    const markdownContent = '# My Project From File';
    const file = new File([markdownContent], 'test.md', { type: 'text/markdown' });

    const mockCreatedProject: DialecticProjectRow = buildMinimalDialecticProjectRow({ id: 'proj-with-file', project_name: 'My Project From File' });

    vi.mocked(getDialecticStoreActionMock('createDialecticProject')).mockResolvedValueOnce({ data: mockCreatedProject, status: 200 });

    renderForm();

    await cycleToManualMode(user);

    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad(markdownContent, file);
    });

    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createDialecticProject')).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: 'My Project From File',
          initialUserPrompt: markdownContent,
          promptFile: file,
          selectedDomainId: 'domain-1',
          processTemplateId: mockSelectedDomainProcessAssociation.process_template_id,
          idempotencyKey: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
        })
      );
    });
    const manualPayload = vi.mocked(getDialecticStoreActionMock('createDialecticProject')).mock.calls[0][0];
    expect(manualPayload).not.toHaveProperty('sessionIdempotencyKey');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/dialectic/${mockCreatedProject.id}`);
    });
  });

  it('displays loading state correctly', () => {
    initializeMockDialecticState({ isCreatingProject: true });
    const customSubmitText = 'Launch';
    renderForm({submitButtonText: customSubmitText});
    const expectedButtonText = new RegExp(`Creating.*${customSubmitText}.*\\.\\.\\.`);
    const loadingSubmitButton: HTMLElement = screen.getByRole('button', { name: expectedButtonText });
    if (!(loadingSubmitButton instanceof HTMLButtonElement)) {
      throw new Error('Expected submit button to be HTMLButtonElement');
    }
    expect(loadingSubmitButton.disabled).toBe(true);
  });

  it('displays error message if creation fails', async () => {
    const user = userEvent.setup();
    const error: ApiError = { message: 'Creation failed', code: 'SERVER_ERROR' };
    vi.mocked(getDialecticStoreActionMock('createDialecticProject')).mockImplementationOnce(async () => {
      setDialecticStateValues({ createProjectError: error });
      return { data: undefined, error, status: 500 };
    });

    renderForm();

    await cycleToManualMode(user);

    await user.type(screen.getByPlaceholderText(projectNamePlaceholder), 'Error Project');
    act(() => {
      capturedTextInputAreaProps.onChange?.('This will fail.');
    });

    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('creation-error-alert').textContent).toContain(error.message);
    });
  });

  it('does not display DomainSelector if enableDomainSelection is false', () => {
    renderForm({ enableDomainSelection: false });
    expect(screen.queryByTestId('mock-domain-selector')).toBeNull();
  });

  it('displays DomainSelector by default', () => {
    renderForm();
    expect(document.body.contains(screen.getByTestId('mock-domain-selector'))).toBe(true);
  });

  it('uses custom submitButtonText', () => {
    const customText = "Launch It!";
    renderForm({ submitButtonText: customText });
    expect(document.body.contains(screen.getByRole('button', { name: new RegExp(customText) }))).toBe(true);
  });

  it('auto-fills project name from typed prompt if project name is empty and not manually set', async () => {
    renderForm();
    const promptText = "This is the first line.\nAnd this is the second.";
    act(() => {
      capturedTextInputAreaProps.onChange?.(promptText);
    });
    await waitFor(() => {
      expect(getProjectNameInput().value).toBe('This is the first line.');
    });
  });

  it('manual project name edits stop auto-filling from prompt and subsequent file loads', async () => {
    const user = userEvent.setup();
    renderForm();

    const manualProjectName = "My Manual Project";
    await user.type(screen.getByPlaceholderText(projectNamePlaceholder), manualProjectName);

    act(() => {
      capturedTextInputAreaProps.onChange?.("A new prompt that won't change the name.");
    });
    await waitFor(() => {
      expect(getProjectNameInput().value).toBe(manualProjectName);
    });

    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad("# A file that won't change the name", new File([""], "test.md"));
    });
    await waitFor(() => {
      expect(getProjectNameInput().value).toBe(manualProjectName);
    });
  });

  it('displays error message if creation fails and calls resetCreateProjectError on next submission attempt', async () => {
    const user = userEvent.setup();
    const initialError: ApiError = { message: 'Initial failure', code: 'SERVER_ERROR' };
    const mockSuccessfulProject: DialecticProjectRow = buildMinimalDialecticProjectRow({ id: 'proj-456', project_name: 'Retry Project' });

    vi.mocked(getDialecticStoreActionMock('createDialecticProject'))
      .mockImplementationOnce(async () => {
        setDialecticStateValues({ createProjectError: initialError });
        return { data: undefined, error: initialError, status: 500 };
      })
      .mockResolvedValueOnce({ data: mockSuccessfulProject, status: 200 });

    renderForm();

    await cycleToManualMode(user);

    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('creation-error-alert').textContent).toContain(initialError.message);
    });

    await user.click(submitButton);

    await waitFor(() => {
      expect(getDialecticStoreActionMock('resetCreateProjectError')).toHaveBeenCalled();
    });
  });

  it('displays DomainSelector when enableDomainSelection is true', () => {
    renderForm({ enableDomainSelection: true });
    expect(document.body.contains(screen.getByTestId('mock-domain-selector'))).toBe(true);
  });

  it('does not display DomainSelector when enableDomainSelection is false', () => {
    renderForm({ enableDomainSelection: false });
    expect(screen.queryByTestId('mock-domain-selector')).toBeNull();
  });

  it('uses custom submitButtonText', () => {
    const customText = "Initiate Dialectic";
    renderForm({ submitButtonText: customText });
    expect(document.body.contains(screen.getByRole('button', { name: new RegExp(customText) }))).toBe(true);
  });

  it('auto-fills project name from typed prompt if project name is empty and not manually set', async () => {
    renderForm();
    const promptText = "This is a new line of thinking.\nWith a second line.";
    
    act(() => {
      capturedTextInputAreaProps.onChange?.(promptText);
    });

    await waitFor(() => {
      expect(getProjectNameInput().value).toBe('This is a new line of thinking.');
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
      expect(getProjectNameInput().value).toBe(manualProjectName);
    });

    await act(async () => {
      await triggerMockTextInputAreaOnFileLoad("# This file should not override", new File([""], "another.md"));
    });
    await waitFor(() => {
      expect(getProjectNameInput().value).toBe(manualProjectName);
    });
  });

  it('shows create-project-cost-preview when selector returns success', async () => {
    selectPreProjectCostCeilingMock.mockReturnValue(formTestSuccessCeiling);

    renderForm();

    await waitFor(() => {
      expect(document.body.contains(screen.getByTestId('create-project-cost-preview'))).toBe(true);
    });
    expect(screen.queryByTestId('create-project-estimate-error-notice')).toBeNull();
  });

  it('shows create-project-estimate-error-notice when selector returns OUTPUT_CAP_NOT_INITIALIZED', async () => {
    selectPreProjectCostCeilingMock.mockReturnValue({
      error: outputCapNotInitializedError,
    });

    renderForm();

    await waitFor(() => {
      expect(screen.getByTestId('create-project-estimate-error-notice').textContent).toContain(
        outputCapNotInitializedError.message,
      );
    });
    expect(screen.queryByTestId('create-project-no-estimate-notice')).toBeNull();
    expect(screen.queryByTestId('create-project-cost-preview')).toBeNull();
  });

  it('shows create-project-estimate-error-notice when selector returns error', async () => {
    const estimateError: ApiError = { message: 'Counts unavailable', code: 'COUNTS_ERROR' };
    selectPreProjectCostCeilingMock.mockReturnValue({
      error: estimateError,
    });

    renderForm();

    await waitFor(() => {
      expect(screen.getByTestId('create-project-estimate-error-notice').textContent).toContain('Counts unavailable');
    });
    expect(screen.queryByTestId('create-project-cost-preview')).toBeNull();
    expect(screen.queryByTestId('create-project-no-estimate-notice')).toBeNull();
  });
});
