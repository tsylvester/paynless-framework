import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import {
  initializeMockDialecticState,
  setDialecticStateValues,
  getDialecticStoreActionMock,
  mockDialecticDomain,
  mockDialecticStage,
  mockDialecticProcessTemplate,
  mockAiProvidersRow,
  mockAiModelConfig,
  mockDomainProcessAssociationRow,
} from '@/mocks/dialecticStore.mock';
import {
  mockedUseAuthStoreHookLogic,
  resetAuthStoreMock,
} from '@/mocks/authStore.mock';
import { mockAllTiers, mockUserTier } from '@/mocks/profile.mock';
import {
  selectActiveChatWalletInfo,
  selectSelectedModels,
} from '@paynless/store';
import type {
  DialecticProjectRow,
  ApiError,
  DialecticDomainRow,
  DialecticStage,
  DialecticProcessTemplate,
  CreateProjectAutoStartResult,
  AiProvidersRow,
  ActiveChatWalletInfo,
  SelectedModels,
  DialecticStateValues,
  DomainProcessAssociationRow,
} from '@paynless/types';
import {
  buildComputeCostCeilingErrorReturn,
  ComputeCostCeilingReturn,
  ComputeCostCeilingSuccessReturn,
  isJson,
} from '@paynless/utils';
import { usePlatform } from '@paynless/platform';
import type { CapabilitiesContextValue, PlatformCapabilities } from '@paynless/types';
import { toast } from 'sonner';
import { CreateDialecticProjectForm } from './CreateDialecticProjectForm';
import type { TextInputAreaProps } from '@/components/common/TextInputArea';

const projectNamePlaceholder = "A Notepad App with To Do lists";

const mockNavigate = vi.fn();

const { selectPreProjectCostCeilingMock } = vi.hoisted(() => ({
  selectPreProjectCostCeilingMock: vi.fn<
    [DialecticStateValues],
    ComputeCostCeilingReturn | null
  >(() => null),
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

vi.mock('@/components/dialectic/AIModelSelector', () => ({
  AIModelSelector: vi.fn(() => <div data-testid="mock-ai-model-selector">Mock AI Model Selector</div>),
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

const mockSelectedDomain: DialecticDomainRow = mockDialecticDomain({
  id: 'domain-1',
  name: 'General',
  description: '',
});

const defaultWalletInfo: ActiveChatWalletInfo = {
  status: 'ok',
  type: 'personal',
  walletId: 'wallet-1',
  orgId: null,
  balance: '300000',
  isLoadingPrimaryWallet: false,
};

const firstStageMinBalanceForAutostartTest = 100000;

const autostartCatalogEntryOverrides: Partial<AiProvidersRow> = {
  provider: 'Provider',
  description: null,
  config: null,
  created_at: '',
  updated_at: '',
  is_default_embedding: false,
  min_plan_tier_level: 0,
};

const stageThesisForAutostart: DialecticStage = mockDialecticStage({
  id: 'stage-thesis-autostart',
  slug: 'thesis',
  display_name: 'Proposal',
  description: 'First stage for autostart balance test.',
  default_system_prompt_id: null,
});

const processTemplateForAutostartBalanceTest: DialecticProcessTemplate =
  mockDialecticProcessTemplate({
    id: 'pt-autostart-balance',
    name: 'Autostart balance test template',
    description: null,
    starting_stage_id: stageThesisForAutostart.id,
    stages: [stageThesisForAutostart],
    transitions: [],
  });

const mockSelectedDomainProcessAssociation: DomainProcessAssociationRow =
  mockDomainProcessAssociationRow({
    domain_id: mockSelectedDomain.id,
    process_template_id: processTemplateForAutostartBalanceTest.id,
    is_default_for_domain: true,
  });

const autostartSuccessCeiling: ComputeCostCeilingSuccessReturn = {
  stageCeilings: { thesis: firstStageMinBalanceForAutostartTest },
  projectCeiling: firstStageMinBalanceForAutostartTest,
};

const autostartSuccessCeilingHighProject: ComputeCostCeilingSuccessReturn = {
  stageCeilings: { thesis: firstStageMinBalanceForAutostartTest },
  projectCeiling: 500000,
};

const defaultCatalogWithDefaultModel: AiProvidersRow[] = [
  mockAiProvidersRow({
    ...autostartCatalogEntryOverrides,
    id: 'dft',
    name: 'Default',
    api_identifier: 'dft',
    is_default_generation: true,
    is_active: true,
    config: { provider_max_output_tokens: 200000 },
  }),
];

const defaultSelectedModels: SelectedModels[] = [
  {
    id: 'dft',
    displayName: 'Default',
  },
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
    idempotency_key: null,
  };
}

function initializeAutostartFormTestState(
  overrides?: Partial<DialecticStateValues>,
): void {
  initializeMockDialecticState({
    selectedDomain: mockSelectedDomain,
    selectedDomainProcessAssociation: mockSelectedDomainProcessAssociation,
    modelCatalog: defaultCatalogWithDefaultModel,
    selectedModels: defaultSelectedModels,
    maxOutputTokens: 8192,
    isLoadingModelCatalog: false,
    currentProcessTemplate: processTemplateForAutostartBalanceTest,
    ...overrides,
  });
  vi.mocked(selectSelectedModels).mockReturnValue(defaultSelectedModels);
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
    selectPreProjectCostCeilingMock.mockReturnValue(null);
    resetAuthStoreMock();
    mockedUseAuthStoreHookLogic.setState({
      userTier: mockUserTier,
      availableTiers: mockAllTiers,
    });
    initializeMockDialecticState({
      selectedDomain: mockSelectedDomain,
      modelCatalog: defaultCatalogWithDefaultModel,
      selectedModels: defaultSelectedModels,
      maxOutputTokens: 8192,
      isLoadingModelCatalog: false,
    });
    const { initializeMockWalletStore } = await import('@/mocks/walletStore.mock');
    initializeMockWalletStore();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    vi.mocked(selectSelectedModels).mockReturnValue(defaultSelectedModels);
    vi.mocked(usePlatform).mockReturnValue(createMockPlatformContext());
  });

  const renderForm = (props: Partial<Parameters<typeof CreateDialecticProjectForm>[0]> = {}) => {
    return render(
      <MemoryRouter>
        <CreateDialecticProjectForm {...props} />
      </MemoryRouter>,
    );
  };

  it('defaults to Autoconfig (half-checked) when cost estimate is not yet known', async () => {
    renderForm();
    await waitFor(() => {
      const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
      expect(control).toHaveAttribute('aria-checked', 'mixed');
    });
  });

  it('on hover, shows explainer text for all three states (Autostart, Autoconfig, Manual) so user knows what each does without iterating', async () => {
    const user = userEvent.setup();
    renderForm();
    const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
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
    const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
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
    const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
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
    const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
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

  it('first click cycles setup mode from Autoconfig to Manual (unchecked)', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('checkbox', { name: /Autoconfig/i }));
    const control = screen.getByRole('checkbox', { name: /Manual/i });
    expect(control).toBeInTheDocument();
    expect(control).not.toBeChecked();
  });

  it('second click cycles setup mode from Manual back to Autoconfig when autostart is not affordable', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('checkbox', { name: /Autoconfig/i }));
    await user.click(screen.getByRole('checkbox', { name: /Manual/i }));
    const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
    expect(control).toBeInTheDocument();
    expect(control).toHaveAttribute('aria-checked', 'mixed');
  });

  it('third click cycles setup mode from Manual to Autostart when estimate and wallet allow autostart', async () => {
    const user = userEvent.setup();
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    renderForm();
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Autostart/i })).toBeChecked();
    });
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
    initializeAutostartFormTestState();
    vi.mocked(getDialecticStoreActionMock('createDialecticProject')).mockResolvedValueOnce({ data: mockProjectRow, status: 200 });

    renderForm();
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

  it('submit with Autostart mode calls createProjectAndAutoStart when estimate and wallet allow autostart', async () => {
    const user = userEvent.setup();
    const result: CreateProjectAutoStartResult = { projectId: 'proj-auto', sessionId: 'sess-1', hasDefaultModels: true };
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);

    renderForm();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createProjectAndAutoStart')).toHaveBeenCalled();
    });
    expect(getDialecticStoreActionMock('createDialecticProject')).not.toHaveBeenCalled();
  });

  it('upgrade CTA inside real model settings popover navigates to subscription without submitting autostart form', async () => {
    const user = userEvent.setup();
    const outputCapModelConfig = mockAiModelConfig({
      hard_cap_output_tokens: 200001,
      provider_max_output_tokens: 200000,
    });
    if (!isJson(outputCapModelConfig)) {
      throw new Error('outputCapModelConfig is not a valid JSON object');
    }
    const catalogForOutputCapSlider: AiProvidersRow[] = [
      mockAiProvidersRow({
        ...autostartCatalogEntryOverrides,
        id: 'dft',
        name: 'Default',
        api_identifier: 'dft',
        is_default_generation: true,
        is_active: true,
        config: outputCapModelConfig,
      }),
    ];
    initializeAutostartFormTestState({
      modelCatalog: catalogForOutputCapSlider,
    });

    renderForm();

    await user.click(screen.getByRole('button', { name: /1 model/i }));
    await user.click(await screen.findByRole('button', { name: /premium/i }));
    await user.click(screen.getByRole('button', { name: /^upgrade$/i }));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/subscription');
    expect(getDialecticStoreActionMock('createProjectAndAutoStart')).not.toHaveBeenCalled();
    expect(getDialecticStoreActionMock('createDialecticProject')).not.toHaveBeenCalled();
  });

  it('successful auto-start navigates to session page when estimate and wallet allow autostart', async () => {
    const user = userEvent.setup();
    const result: CreateProjectAutoStartResult = { projectId: 'proj-auto', sessionId: 'sess-1', hasDefaultModels: true };
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
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
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
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
    initializeAutostartFormTestState();
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);

    renderForm();
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
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);

    renderForm();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/dialectic/proj-no-models'));
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('/session/'), expect.anything());
    });
  });

  it('defaults to Autoconfig (half-checked) when no default models available and shows explanatory text', async () => {
    const catalogNoDefaults: AiProvidersRow[] = [
      mockAiProvidersRow({
        ...autostartCatalogEntryOverrides,
        id: 'm1',
        name: 'Model 1',
        is_default_generation: false,
        is_active: true,
      }),
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

  it('defaults to Autoconfig (half-checked) when wallet balance is below first-stage ceiling and shows ceiling copy', async () => {
    const lowBalance: ActiveChatWalletInfo = {
      ...defaultWalletInfo,
      balance: String(firstStageMinBalanceForAutostartTest - 1),
    };
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(lowBalance);
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeMockDialecticState({
      selectedDomain: mockSelectedDomain,
      selectedDomainProcessAssociation: mockSelectedDomainProcessAssociation,
      modelCatalog: defaultCatalogWithDefaultModel,
      isLoadingModelCatalog: false,
      currentProcessTemplate: processTemplateForAutostartBalanceTest,
    });

    renderForm();
    await waitFor(() => {
      const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
      expect(control).toHaveAttribute('aria-checked', 'mixed');
    });
    expect(screen.getByText(/Estimated first-stage cost exceeds wallet balance for auto-start/i)).toBeInTheDocument();
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
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
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

  it('calls fetchProcessAssociation with selected domain id after render', async () => {
    renderForm();

    await waitFor(() => {
      expect(getDialecticStoreActionMock('fetchProcessAssociation')).toHaveBeenCalledWith({
        domainId: mockSelectedDomain.id,
      });
    });
  });

  it('does not call fetchProcessTemplate or fetchStageExpectedCounts when association is null', async () => {
    initializeMockDialecticState({
      selectedDomain: mockSelectedDomain,
      selectedDomainProcessAssociation: null,
      modelCatalog: defaultCatalogWithDefaultModel,
      selectedModels: defaultSelectedModels,
      maxOutputTokens: 8192,
      isLoadingModelCatalog: false,
    });

    renderForm();

    await waitFor(() => {
      expect(getDialecticStoreActionMock('fetchProcessAssociation')).toHaveBeenCalled();
    });
    expect(getDialecticStoreActionMock('fetchProcessTemplate')).not.toHaveBeenCalled();
    expect(getDialecticStoreActionMock('fetchStageExpectedCounts')).not.toHaveBeenCalled();
  });

  it('calls fetchProcessTemplate with association process_template_id when association row is present', async () => {
    initializeMockDialecticState({
      selectedDomain: mockSelectedDomain,
      selectedDomainProcessAssociation: mockSelectedDomainProcessAssociation,
      modelCatalog: defaultCatalogWithDefaultModel,
      selectedModels: defaultSelectedModels,
      maxOutputTokens: 8192,
      isLoadingModelCatalog: false,
    });

    renderForm();

    await waitFor(() => {
      expect(getDialecticStoreActionMock('fetchProcessTemplate')).toHaveBeenCalledWith(
        mockSelectedDomainProcessAssociation.process_template_id,
      );
    });
  });

  it('Manual submit payload includes processTemplateId from selectedDomainProcessAssociation', async () => {
    const user = userEvent.setup();
    const mockProjectRow: DialecticProjectRow = buildMinimalDialecticProjectRow({ id: 'proj-manual-template', project_name: 'Manual Template' });
    initializeAutostartFormTestState();
    vi.mocked(getDialecticStoreActionMock('createDialecticProject')).mockResolvedValueOnce({ data: mockProjectRow, status: 200 });

    renderForm();
    await user.click(screen.getByRole('checkbox', { name: /Autoconfig/i }));
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createDialecticProject')).toHaveBeenCalledWith(
        expect.objectContaining({
          processTemplateId: mockSelectedDomainProcessAssociation.process_template_id,
        }),
      );
    });
  });

  it('Autoconfig submit payload includes processTemplateId on createProjectAndAutoStart', async () => {
    const user = userEvent.setup();
    const result: CreateProjectAutoStartResult = { projectId: 'proj-autoconfig-template', sessionId: 'sess-template', hasDefaultModels: true };
    initializeAutostartFormTestState();
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);

    renderForm();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createProjectAndAutoStart')).toHaveBeenCalledWith(
        expect.objectContaining({
          processTemplateId: mockSelectedDomainProcessAssociation.process_template_id,
        }),
      );
    });
  });

  it('defaults to Autostart (checked) when success estimate and wallet meet first-stage ceiling', async () => {
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    renderForm();

    await waitFor(() => {
      const control = screen.getByRole('checkbox', { name: /Autostart/i });
      expect(control).toBeChecked();
    });
  });

  it('shows no-estimate notice and disables Autostart when selector returns null', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByTestId('create-project-no-estimate-notice')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('create-project-cost-preview')).not.toBeInTheDocument();
    const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
    expect(control).toHaveAttribute('aria-checked', 'mixed');
    expect(screen.getByText(/estimate not ready/i)).toBeInTheDocument();
  });

  it('shows estimate-error notice when selector returns error', async () => {
    const estimateError: ApiError = { message: 'Invalid payload', code: 'INVALID_PAYLOAD' };
    selectPreProjectCostCeilingMock.mockReturnValue(
      buildComputeCostCeilingErrorReturn({ error: estimateError }),
    );

    renderForm();

    await waitFor(() => {
      expect(screen.getByTestId('create-project-estimate-error-notice')).toHaveTextContent('Invalid payload');
    });
    expect(screen.queryByTestId('create-project-cost-preview')).not.toBeInTheDocument();
    const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
    expect(control).toHaveAttribute('aria-checked', 'mixed');
  });

  it('demotes to Autoconfig when estimate becomes null before submit and allows Autoconfig submit', async () => {
    const user = userEvent.setup();
    const result: CreateProjectAutoStartResult = { projectId: 'proj-demoted-null', sessionId: 'sess-demoted-null', hasDefaultModels: true };
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    renderForm();

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Autostart/i })).toBeChecked();
    });

    selectPreProjectCostCeilingMock.mockReturnValue(null);
    setDialecticStateValues({ preProjectStageExpectedCounts: null });
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Autoconfig/i })).toHaveAttribute('aria-checked', 'mixed');
    });

    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createProjectAndAutoStart')).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it('demotes to Autoconfig when estimate becomes error before submit and allows Autoconfig submit', async () => {
    const user = userEvent.setup();
    const estimateError: ApiError = { message: 'Ceiling computation failed', code: 'CEILING_ERROR' };
    const result: CreateProjectAutoStartResult = { projectId: 'proj-demoted-error', sessionId: 'sess-demoted-error', hasDefaultModels: true };
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    renderForm();

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Autostart/i })).toBeChecked();
    });

    selectPreProjectCostCeilingMock.mockReturnValue(
      buildComputeCostCeilingErrorReturn({ error: estimateError }),
    );
    setDialecticStateValues({ stageExpectedCountsError: estimateError });
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Autoconfig/i })).toHaveAttribute('aria-checked', 'mixed');
    });

    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createProjectAndAutoStart')).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(toast.error)).not.toHaveBeenCalledWith('Ceiling computation failed');
  });

  it('allows Autoconfig submit when selector returns null', async () => {
    const user = userEvent.setup();
    const result: CreateProjectAutoStartResult = { projectId: 'proj-autoconfig-null', sessionId: 'sess-null', hasDefaultModels: true };
    initializeAutostartFormTestState();
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);

    renderForm();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createProjectAndAutoStart')).toHaveBeenCalledTimes(1);
    });
  });

  it('calls createProjectAndAutoStart once on Autostart submit when estimate and wallet allow autostart', async () => {
    const user = userEvent.setup();
    const result: CreateProjectAutoStartResult = { projectId: 'proj-autostart-once', sessionId: 'sess-once', hasDefaultModels: true };
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValueOnce(result);

    renderForm();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(getDialecticStoreActionMock('createProjectAndAutoStart')).toHaveBeenCalledTimes(1);
    });
  });

  it('calls fetchStageExpectedCounts with association process_template_id and modelCount after association is present', async () => {
    initializeAutostartFormTestState();

    renderForm();

    await waitFor(() => {
      expect(getDialecticStoreActionMock('fetchStageExpectedCounts')).toHaveBeenCalledWith({
        processTemplateId: mockSelectedDomainProcessAssociation.process_template_id,
        modelCount: 1,
      });
    });
  });

  it('shows formatted project and first-stage cost preview on success estimate', async () => {
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();

    renderForm();

    await waitFor(() => {
      const preview = screen.getByTestId('create-project-cost-preview');
      expect(preview).toHaveTextContent('~100,000');
      expect(preview).toHaveTextContent('Estimated token cost');
      expect(preview).toHaveTextContent('full project');
      expect(preview).toHaveTextContent('first stage');
    });
  });

  it('shows project balance warning when project ceiling exceeds wallet while Create stays enabled', async () => {
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeilingHighProject);
    initializeAutostartFormTestState();

    renderForm();

    await waitFor(() => {
      expect(screen.getByTestId('create-project-project-balance-warning')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeEnabled();
  });

  it('shows autostart top-up link when balance blocks autostart', async () => {
    const lowBalance: ActiveChatWalletInfo = {
      ...defaultWalletInfo,
      balance: String(firstStageMinBalanceForAutostartTest - 1),
    };
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(lowBalance);
    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
    initializeAutostartFormTestState();

    renderForm();

    await waitFor(() => {
      const topUpLink = screen.getByTestId('create-project-autostart-top-up-link');
      expect(topUpLink).toHaveAttribute('href', '/subscription?tab=top-up');
    });
  });

  it('does not enable Autostart when cycling from Manual while estimate is null', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('checkbox', { name: /Autoconfig/i }));
    await user.click(screen.getByRole('checkbox', { name: /Manual/i }));

    const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
    expect(control).toHaveAttribute('aria-checked', 'mixed');
    expect(screen.queryByRole('checkbox', { name: /Autostart/i })).not.toBeInTheDocument();
  });

  it('does not enable Autostart when cycling from Manual while estimate returns error', async () => {
    const user = userEvent.setup();
    const estimateError: ApiError = { message: 'Counts unavailable', code: 'COUNTS_ERROR' };
    selectPreProjectCostCeilingMock.mockReturnValue(
      buildComputeCostCeilingErrorReturn({ error: estimateError }),
    );

    renderForm();
    await user.click(screen.getByRole('checkbox', { name: /Autoconfig/i }));
    await user.click(screen.getByRole('checkbox', { name: /Manual/i }));

    const control = screen.getByRole('checkbox', { name: /Autoconfig/i });
    expect(control).toHaveAttribute('aria-checked', 'mixed');
    expect(screen.queryByRole('checkbox', { name: /Autostart/i })).not.toBeInTheDocument();
  });
});
