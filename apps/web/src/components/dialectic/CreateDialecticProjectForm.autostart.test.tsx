import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import {
  initializeMockDialecticState,
  setDialecticStateValues,
  getDialecticStoreActionMock,
} from '@/mocks/dialecticStore.mock';
import { selectActiveChatWalletInfo } from '@paynless/store';
import type {
  DialecticProjectRow,
  ApiError,
  DialecticDomain,
  DialecticStage,
  DialecticProcessTemplate,
  CreateProjectAutoStartResult,
  AIModelCatalogEntry,
  ActiveChatWalletInfo,
} from '@paynless/types';
import { usePlatform } from '@paynless/platform';
import type { CapabilitiesContextValue, PlatformCapabilities } from '@paynless/types';
import { toast } from 'sonner';
import { CreateDialecticProjectForm } from './CreateDialecticProjectForm';
import type { TextInputAreaProps } from '@/components/common/TextInputArea';

const projectNamePlaceholder = "A Notepad App with To Do lists";

const mockNavigate = vi.fn();

vi.mock('@paynless/store', async () => {
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualPaynlessStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const walletStoreMock = await vi.importActual<typeof import('@/mocks/walletStore.mock')>('@/mocks/walletStore.mock');
  return {
    ...mockStoreExports,
    useWalletStore: walletStoreMock.useWalletStore,
    selectActiveChatWalletInfo: walletStoreMock.selectActiveChatWalletInfo,
    initialWalletStateValues: actualPaynlessStore.initialWalletStateValues,
    selectIsCreatingProject: actualPaynlessStore.selectIsCreatingProject,
    selectCreateProjectError: actualPaynlessStore.selectCreateProjectError,
    selectSelectedDomain: actualPaynlessStore.selectSelectedDomain,
    selectDomains: actualPaynlessStore.selectDomains,
    selectDefaultGenerationModels: actualPaynlessStore.selectDefaultGenerationModels,
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

vi.mock('@/components/common/TextInputArea', () => ({
  TextInputArea: vi.fn((props: TextInputAreaProps) => (
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
  )),
}));

vi.mock('@/components/dialectic/DomainSelector', () => ({
  DomainSelector: vi.fn(() => <div data-testid="mock-domain-selector">Mock Domain Selector</div>),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockSelectedDomain: DialecticDomain = {
  id: 'domain-1',
  name: 'General',
  description: '',
  parent_domain_id: null,
  is_enabled: true,
};

const defaultWalletInfo: ActiveChatWalletInfo = {
  status: 'ok',
  type: 'personal',
  walletId: 'wallet-1',
  orgId: null,
  balance: '300000',
  isLoadingPrimaryWallet: false,
};

const firstStageMinBalanceForAutostartTest = 100000;

const stageThesisForAutostart: DialecticStage = {
  id: 'stage-thesis-autostart',
  slug: 'thesis',
  display_name: 'Proposal',
  description: 'First stage for autostart balance test.',
  created_at: new Date().toISOString(),
  default_system_prompt_id: null,
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
  minimum_balance: firstStageMinBalanceForAutostartTest,
};

const processTemplateForAutostartBalanceTest: DialecticProcessTemplate = {
  id: 'pt-autostart-balance',
  name: 'Autostart balance test template',
  description: null,
  created_at: new Date().toISOString(),
  starting_stage_id: stageThesisForAutostart.id,
  stages: [stageThesisForAutostart],
  transitions: [],
};

const defaultCatalogWithDefaultModel: AIModelCatalogEntry[] = [
  buildMinimalAIModelCatalogEntry({ id: 'dft', model_name: 'Default', is_default_generation: true, is_active: true }),
];

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
  };
}

function buildMinimalAIModelCatalogEntry(overrides: { id: string; model_name: string; is_default_generation: boolean; is_active: boolean }): AIModelCatalogEntry {
  return {
    id: overrides.id,
    provider_name: 'Provider',
    model_name: overrides.model_name,
    api_identifier: overrides.id,
    description: null,
    strengths: null,
    weaknesses: null,
    context_window_tokens: null,
    input_token_cost_usd_millionths: null,
    output_token_cost_usd_millionths: null,
    max_output_tokens: null,
    is_active: overrides.is_active,
    created_at: '',
    updated_at: '',
    is_default_generation: overrides.is_default_generation,
  };
}

const createMockPlatformContext = (overrides?: Partial<PlatformCapabilities>): CapabilitiesContextValue => {
  const localDefaultCaps: PlatformCapabilities = { platform: 'web', os: 'unknown', fileSystem: { isAvailable: false } };
  return {
    capabilities: { ...localDefaultCaps, ...(overrides || {}) },
    isLoadingCapabilities: false,
    capabilityError: null,
  };
};

describe('CreateDialecticProjectForm (autostart)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    initializeMockDialecticState({
      selectedDomain: mockSelectedDomain,
      modelCatalog: defaultCatalogWithDefaultModel,
      isLoadingModelCatalog: false,
    });
    const { initializeMockWalletStore } = await import('@/mocks/walletStore.mock');
    initializeMockWalletStore();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    vi.mocked(usePlatform).mockReturnValue(createMockPlatformContext());
  });

  const renderForm = (props: Partial<Parameters<typeof CreateDialecticProjectForm>[0]> = {}) => {
    return render(
      <MemoryRouter>
        <CreateDialecticProjectForm {...props} />
      </MemoryRouter>
    );
  };

  it('renders single setup-mode control in Autostart state (checked) by default', () => {
    renderForm();
    const control = screen.getByRole('checkbox', { name: /Autostart/i });
    expect(control).toBeInTheDocument();
    expect(control).toBeChecked();
  });

  it('on hover, shows explainer text for all three states (Autostart, Autoconfig, Manual) so user knows what each does without iterating', async () => {
    const user = userEvent.setup();
    renderForm();
    const control = screen.getByRole('checkbox', { name: /Autostart/i });
    await user.hover(control);
    await waitFor(() => {
      const explainerContent =
        document.querySelector('[data-slot="tooltip-content"]') ??
        (control.getAttribute('title') ? { textContent: control.getAttribute('title') } : null);
      expect(explainerContent).toBeTruthy();
      const text = explainerContent?.textContent ?? '';
      expect(text).toMatch(/Autostart/i);
      expect(text).toMatch(/Autoconfig/i);
      expect(text).toMatch(/Manual/i);
      expect(text.length).toBeGreaterThan(50);
    });
  });

  it('explainer text describes Autostart (auto session and start generation)', async () => {
    const user = userEvent.setup();
    renderForm();
    const control = screen.getByRole('checkbox', { name: /Autostart/i });
    await user.hover(control);
    await waitFor(() => {
      const explainerContent =
        document.querySelector('[data-slot="tooltip-content"]') ??
        (control.getAttribute('title') ? { textContent: control.getAttribute('title') } : null);
      const text = explainerContent?.textContent ?? '';
      expect(text).toMatch(/Autostart/i);
      expect(text).toMatch(/session|start|automatically/i);
    });
  });

  it('explainer text describes Autoconfig (auto session, user starts generation)', async () => {
    const user = userEvent.setup();
    renderForm();
    const control = screen.getByRole('checkbox', { name: /Autostart/i });
    await user.hover(control);
    await waitFor(() => {
      const explainerContent =
        document.querySelector('[data-slot="tooltip-content"]') ??
        (control.getAttribute('title') ? { textContent: control.getAttribute('title') } : null);
      const text = explainerContent?.textContent ?? '';
      expect(text).toMatch(/Autoconfig/i);
      expect(text).toMatch(/default|model|start|when/i);
    });
  });

  it('explainer text describes Manual (create project only, user creates session)', async () => {
    const user = userEvent.setup();
    renderForm();
    const control = screen.getByRole('checkbox', { name: /Autostart/i });
    await user.hover(control);
    await waitFor(() => {
      const explainerContent =
        document.querySelector('[data-slot="tooltip-content"]') ??
        (control.getAttribute('title') ? { textContent: control.getAttribute('title') } : null);
      const text = explainerContent?.textContent ?? '';
      expect(text).toMatch(/Manual/i);
      expect(text).toMatch(/project only|create.*session|manual/i);
    });
  });

  it('first click cycles setup mode from Autostart to Autoconfig (half-checked)', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('checkbox', { name: /Autostart/i }));
    const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
    expect(control).toBeInTheDocument();
    expect(control).toHaveAttribute('aria-checked', 'mixed');
  });

  it('second click cycles setup mode from Autoconfig to Manual (unchecked)', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('checkbox', { name: /Autostart/i }));
    await user.click(screen.getByRole('checkbox', { name: /Autoconfig/i }));
    const control = screen.getByRole('checkbox', { name: /Manual/i });
    expect(control).toBeInTheDocument();
    expect(control).not.toBeChecked();
  });

  it('third click cycles setup mode from Manual back to Autostart', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('checkbox', { name: /Autostart/i }));
    await user.click(screen.getByRole('checkbox', { name: /Autoconfig/i }));
    await user.click(screen.getByRole('checkbox', { name: /Manual/i }));
    const control = screen.getByRole('checkbox', { name: /Autostart/i });
    expect(control).toBeInTheDocument();
    expect(control).toBeChecked();
  });

  it('submit with Manual mode calls createDialecticProject and navigates to project page', async () => {
    const user = userEvent.setup();
    const mockProjectRow: DialecticProjectRow = buildMinimalDialecticProjectRow({ id: 'proj-manual', project_name: 'Manual' });
    vi.mocked(getDialecticStoreActionMock('createDialecticProject')).mockResolvedValueOnce({ data: mockProjectRow, status: 200 });

    renderForm();
    await user.click(screen.getByRole('checkbox', { name: /Autostart/i }));
    await user.click(screen.getByRole('checkbox', { name: /Autoconfig/i }));
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createDialecticProject')).toHaveBeenCalled();
    });
    expect(getDialecticStoreActionMock('createProjectAndAutoStart')).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/dialectic/${mockProjectRow.id}`);
    });
  });

  it('submit with Autostart mode (default) calls createProjectAndAutoStart', async () => {
    const user = userEvent.setup();
    const result: CreateProjectAutoStartResult = { projectId: 'proj-auto', sessionId: 'sess-1', hasDefaultModels: true };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);

    renderForm();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createProjectAndAutoStart')).toHaveBeenCalled();
    });
    expect(getDialecticStoreActionMock('createDialecticProject')).not.toHaveBeenCalled();
  });

  it('successful auto-start navigates to session page', async () => {
    const user = userEvent.setup();
    const result: CreateProjectAutoStartResult = { projectId: 'proj-auto', sessionId: 'sess-1', hasDefaultModels: true };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);

    renderForm();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dialectic/proj-auto/session/sess-1', expect.any(Object));
    });
  });

  it('successful auto-start with Autostart mode navigates with state autoStartGeneration true', async () => {
    const user = userEvent.setup();
    const result: CreateProjectAutoStartResult = { projectId: 'proj-auto', sessionId: 'sess-1', hasDefaultModels: true };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);

    renderForm();
    const control = screen.getByRole('checkbox', { name: /Autostart/i });
    expect(control).toBeChecked();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dialectic/proj-auto/session/sess-1', expect.objectContaining({ state: { autoStartGeneration: true } }));
    });
  });

  it('successful auto-start with Autoconfig mode navigates without auto-start state', async () => {
    const user = userEvent.setup();
    const result: CreateProjectAutoStartResult = { projectId: 'proj-auto', sessionId: 'sess-1', hasDefaultModels: true };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);

    renderForm();
    await user.click(screen.getByRole('checkbox', { name: /Autostart/i }));
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      const navCall = mockNavigate.mock.calls[0];
      expect(navCall[0]).toBe('/dialectic/proj-auto/session/sess-1');
      expect(navCall[1]?.state?.autoStartGeneration).not.toBe(true);
    });
  });

  it('auto-start with hasDefaultModels false navigates to project page without auto-start state', async () => {
    const user = userEvent.setup();
    const result: CreateProjectAutoStartResult = { projectId: 'proj-no-models', sessionId: null, hasDefaultModels: false };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);

    renderForm();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/dialectic/proj-no-models'));
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('/session/'), expect.anything());
    });
  });

  it('defaults to Autoconfig (half-checked) when no default models available and shows explanatory text', async () => {
    const catalogNoDefaults: AIModelCatalogEntry[] = [
      buildMinimalAIModelCatalogEntry({ id: 'm1', model_name: 'Model 1', is_default_generation: false, is_active: true }),
    ];
    initializeMockDialecticState({
      selectedDomain: mockSelectedDomain,
      modelCatalog: catalogNoDefaults,
      isLoadingModelCatalog: false,
    });

    renderForm();
    await waitFor(() => {
      const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
      expect(control).toHaveAttribute('aria-checked', 'mixed');
    });
    expect(screen.getByText(/No default models available/i)).toBeInTheDocument();
  });

  it('defaults to Autoconfig (half-checked) when wallet balance below thesis threshold and shows explanatory text', async () => {
    const lowBalance: ActiveChatWalletInfo = {
      ...defaultWalletInfo,
      balance: String(firstStageMinBalanceForAutostartTest - 1),
    };
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(lowBalance);
    initializeMockDialecticState({
      selectedDomain: mockSelectedDomain,
      modelCatalog: defaultCatalogWithDefaultModel,
      isLoadingModelCatalog: false,
      currentProcessTemplate: processTemplateForAutostartBalanceTest,
    });

    renderForm();
    await waitFor(() => {
      const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
      expect(control).toHaveAttribute('aria-checked', 'mixed');
    });
    expect(screen.getByText(/Wallet balance too low for auto-start/i)).toBeInTheDocument();
  });

  it('displays progressive loader from autoStartStep during auto-start', () => {
    setDialecticStateValues({
      isAutoStarting: true,
      autoStartStep: 'Loading project details…',
    });

    renderForm();
    expect(screen.getByText('Loading project details…')).toBeInTheDocument();
  });

  it('disables submit button when isAutoStarting is true', () => {
    setDialecticStateValues({ isAutoStarting: true });

    renderForm();
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeDisabled();
  });

  it('disables submit button when isCreatingProject is true', () => {
    setDialecticStateValues({ isCreatingProject: true });

    renderForm();
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeDisabled();
  });

  it('shows error toast on createProjectAndAutoStart failure and form remains visible', async () => {
    const user = userEvent.setup();
    const error: ApiError = { message: 'Auto-start failed', code: 'SERVER_ERROR' };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce({
      projectId: 'proj',
      sessionId: null,
      hasDefaultModels: false,
      error,
    });

    renderForm();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalled();
    });
    expect(screen.getByPlaceholderText(projectNamePlaceholder)).toBeInTheDocument();
  });

  it('calls fetchAIModelCatalog on mount', () => {
    renderForm();

    expect(getDialecticStoreActionMock('fetchAIModelCatalog')).toHaveBeenCalled();
  });
});
