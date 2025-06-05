import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDialecticStore, useAiStore, initialDialecticStateValues, initialAiStateValues } from '@paynless/store';
import { AIModelSelector } from './AIModelSelector';
// Import AiProvider and DialecticStateValues for typing mock stores
import type { AiProvider, DialecticStateValues, AiState } from '@paynless/types';

// Mock the Zustand stores
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAiStore: vi.fn(),
    useDialecticStore: vi.fn(),
  };
});

const mockUseAiStore = useAiStore as jest.MockedFunction<typeof useAiStore>;
const mockUseDialecticStore = useDialecticStore as jest.MockedFunction<typeof useDialecticStore>;

// Helper function to set up mock store states and actions
const setupMockStores = (
  initialDialecticConfig: Partial<DialecticStateValues> = {},
  initialAiConfig: Partial<AiState> = {}
) => {
  const dialecticState: DialecticStateValues = {
    ...initialDialecticStateValues,
    selectedModelIds: [], // Default selectedModelIds to empty array
    ...initialDialecticConfig,
  };

  const aiState: AiState = {
    ...initialAiStateValues,
    availableProviders: [],
    isConfigLoading: false,
    aiError: null,
    ...initialAiConfig,
  };

  const dialecticActions = {
    toggleSelectedModelId: vi.fn(),
    // Add other dialectic actions if used by the component indirectly
  };

  const aiActions = {
    loadAiConfig: vi.fn(),
    // Add other AI actions if used
  };

  mockUseDialecticStore.mockImplementation((selector) => {
    if (typeof selector === 'function') {
      // @ts-ignore
      return selector({ ...dialecticState, ...dialecticActions });
    }
    // @ts-ignore
    return { ...dialecticState, ...dialecticActions }[selector];
  });

  mockUseAiStore.mockImplementation((selector) => {
    if (typeof selector === 'function') {
      // @ts-ignore
      return selector({ ...aiState, ...aiActions });
    }
    // @ts-ignore
    return { ...aiState, ...aiActions }[selector];
  });

  return { dialecticState, dialecticActions, aiState, aiActions };
};

const mockAiProvidersData: AiProvider[] = [
  { id: 'model1', name: 'GPT-4', provider: 'OpenAI', api_identifier: 'gpt-4', created_at: 'test', updated_at: 'test', is_active: true, is_enabled: true, config: null, description: null, default_model_config: null, credentials_schema: null, credentials_status: null, default_provider_model_id: null, last_synced_at: null, organization_id: null, requires_credentials: true, supports_system_prompt: true, supports_tools: false, user_id: null },
  { id: 'model2', name: 'Claude 3', provider: 'Anthropic', api_identifier: 'claude-3', created_at: 'test', updated_at: 'test', is_active: true, is_enabled: true, config: null, description: null, default_model_config: null, credentials_schema: null, credentials_status: null, default_provider_model_id: null, last_synced_at: null, organization_id: null, requires_credentials: true, supports_system_prompt: true, supports_tools: false, user_id: null  },
];

describe('AIModelSelector', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  test('renders loading state initially when isConfigLoading is true', async () => {
    setupMockStores({}, { isConfigLoading: true, availableProviders: [] });
    render(<AIModelSelector />);
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Loading models...')).toBeInTheDocument();
  });

  test('calls loadAiConfig on mount if providers not available and not loading', () => {
    const { aiActions } = setupMockStores({}, { availableProviders: [], isConfigLoading: false, aiError: null });
    render(<AIModelSelector />);
    expect(aiActions.loadAiConfig).toHaveBeenCalledTimes(1);
  });

  test('does not call loadAiConfig if providers already loaded', () => {
    const { aiActions } = setupMockStores({}, { availableProviders: mockAiProvidersData, isConfigLoading: false, aiError: null });
    render(<AIModelSelector />);
    expect(aiActions.loadAiConfig).not.toHaveBeenCalled();
  });

  test('renders error state from aiStore', async () => {
    const errorMsg = 'Failed to load AI providers';
    setupMockStores({}, { aiError: errorMsg, isConfigLoading: false, availableProviders: [] });
    render(<AIModelSelector />);
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByText(`Error: ${errorMsg}`)).toBeInTheDocument();
  });

  test('renders no models available message', async () => {
    setupMockStores({}, { availableProviders: [], isConfigLoading: false, aiError: null });
    render(<AIModelSelector />);
    expect(screen.getByText('No models available')).toBeInTheDocument(); 
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('No models available to select.')).toBeInTheDocument();
  });

  test('renders available providers and allows selection', async () => {
    const { dialecticActions } = setupMockStores(
      { selectedModelIds: [] }, 
      { availableProviders: mockAiProvidersData, isConfigLoading: false }
    );
    render(<AIModelSelector />);

    expect(screen.getByText('No models selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));

    await waitFor(async () => {
      expect(screen.getByText('GPT-4')).toBeInTheDocument();
      expect(screen.getByText('Claude 3')).toBeInTheDocument(); 
    });

    await userEvent.click(screen.getByText('GPT-4'));
    expect(dialecticActions.toggleSelectedModelId).toHaveBeenCalledWith('model1');
  });

  test('displays selected models summary correctly', () => {
    setupMockStores({ selectedModelIds: [] }, { availableProviders: mockAiProvidersData });
    render(<AIModelSelector />);
    expect(screen.getByText('No models selected')).toBeInTheDocument();

    setupMockStores({ selectedModelIds: ['model1'] }, { availableProviders: mockAiProvidersData });
    render(<AIModelSelector />); // Re-render with new state
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    
    setupMockStores({ selectedModelIds: ['model1', 'model2'] }, { availableProviders: mockAiProvidersData });
    render(<AIModelSelector />); // Re-render
    expect(screen.getByText('GPT-4, Claude 3')).toBeInTheDocument();

    const manyProviders = [
        ...mockAiProvidersData,
        { id: 'model3', name: 'Gemini', provider: 'Google', api_identifier: 'gemini', created_at: 'test', updated_at: 'test', is_active: true, is_enabled: true, config: null, description: null, default_model_config: null, credentials_schema: null, credentials_status: null, default_provider_model_id: null, last_synced_at: null, organization_id: null, requires_credentials: true, supports_system_prompt: true, supports_tools: false, user_id: null },
    ];
    setupMockStores({ selectedModelIds: ['model1', 'model2', 'model3'] }, { availableProviders: manyProviders });
    render(<AIModelSelector />); // Re-render
    expect(screen.getByText('GPT-4, Claude 3, +1 more')).toBeInTheDocument(); // Comma added
  });

  test('dropdown is disabled when disabled prop is true', () => {
    setupMockStores({}, { availableProviders: mockAiProvidersData });
    render(<AIModelSelector disabled={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

   test('dropdown is NOT disabled when loading, so loading message can be shown', () => {
    setupMockStores({}, { availableProviders: [], isConfigLoading: true });
    render(<AIModelSelector />);
    expect(screen.getByRole('button')).not.toBeDisabled(); // Changed from toBeDisabled
  });

  test('dropdown is disabled when no models and not loading (and no error)', () => {
    setupMockStores({}, { availableProviders: [], isConfigLoading: false, aiError: null });
    render(<AIModelSelector />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('dropdown is NOT disabled if there is an error, even if no models', () => {
    setupMockStores({}, { availableProviders: [], isConfigLoading: false, aiError: 'Some error' });
    render(<AIModelSelector />);
    expect(screen.getByRole('button')).not.toBeDisabled(); // Button should be clickable to show error
  });
}); 