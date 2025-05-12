import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// No longer need to mock import.meta for this component's tests
// const mockImportMetaEnvDefault = vi.hoisted(() => ({
//   MODE: 'test', 
// }));
// vi.mock('import.meta', () => ({ env: mockImportMetaEnvDefault }));

import { useAiStore, initialAiStateValues } from '@paynless/store';
import type { AiProvider, AiStore } from '@paynless/types';
import { ModelSelector } from './ModelSelector'; // Direct import

// Mock the @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAiStore: vi.fn(),
  };
});

const mockSetSelectedProvider = vi.fn();
const mockSetSelectedPrompt = vi.fn();
const mockLoadAiConfig = vi.fn();

const mockAvailableProviders: AiProvider[] = [
  { id: 'provider-1', name: 'Provider One', created_at: '', api_identifier: 'model1', config: null, description: null, is_enabled: true, updated_at: '', is_active: true, provider: 'test-provider-type' },
  { id: 'provider-2', name: 'Provider Two', created_at: '', api_identifier: 'model2', config: null, description: null, is_enabled: true, updated_at: '', is_active: true, provider: 'test-provider-type' },
  { id: 'dummy-test-provider', name: 'Dummy Test Provider', created_at: '', api_identifier: 'dummy-model', config: null, description: null, is_enabled: true, updated_at: '', is_active: true, provider: 'dummy-provider-type' },
];

describe('ModelSelector', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    vi.clearAllMocks();
    // No longer need to set mockImportMetaEnvDefault.MODE here
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    vi.resetModules(); // Still good practice if other complex mocks were present, or for future.
  });

  const createMockStoreState = (overrides: Partial<AiStore>): AiStore => {
    return {
      ...initialAiStateValues,
      loadAiConfig: mockLoadAiConfig,
      sendMessage: vi.fn(),
      loadChatHistory: vi.fn(),
      loadChatDetails: vi.fn(),
      startNewChat: vi.fn(),
      clearAiError: vi.fn(),
      checkAndReplayPendingChatAction: vi.fn(),
      deleteChat: vi.fn(),
      prepareRewind: vi.fn(),
      cancelRewindPreparation: vi.fn(),
      setSelectedProvider: mockSetSelectedProvider,
      setSelectedPrompt: mockSetSelectedPrompt,
      setNewChatContext: vi.fn(),
      ...overrides,
    };
  };
  
  // Simplified setup, no longer needs ComponentToRender parameter
  const setup = (
    storeStateOverrides: Partial<AiStore>, 
    props: Partial<React.ComponentProps<typeof ModelSelector>> = {}
  ) => {
    const mockStore = createMockStoreState(storeStateOverrides);
    vi.mocked(useAiStore).mockImplementation(<S extends AiStore, U>(selector: (state: S) => U) => {
      return selector(mockStore as S);
    });
    return render(<ModelSelector {...props} />); // Pass props directly
  };

  it('renders loading state when isConfigLoading is true', () => {
    setup({ isConfigLoading: true, availableProviders: [] }); // isDevelopmentEnvironment will use component default
    expect(screen.getByText('Loading models...')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders "Select an AI model" placeholder when no providers are loaded and not loading', () => {
    setup({ availableProviders: [], isConfigLoading: false });
    expect(screen.getByText('Select an AI model')).toBeInTheDocument();
    expect(screen.getByText('Could not load AI models.')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders with "Could not load AI models." when providers array is undefined', () => {
    setup({ availableProviders: undefined, isConfigLoading: false });
    expect(screen.getByText('Could not load AI models.')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders available providers and allows selection', async () => {
    setup({ availableProviders: mockAvailableProviders, selectedProviderId: null });

    const combobox = screen.getByRole('combobox');
    expect(combobox).not.toBeDisabled();
    expect(screen.getByText('Select an AI model')).toBeInTheDocument();

    fireEvent.click(combobox);

    await waitFor(() => {
      expect(screen.getByText('Provider One')).toBeInTheDocument();
      expect(screen.getByText('Provider Two')).toBeInTheDocument();
      expect(screen.getByText('Dummy Test Provider')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Provider Two'));

    await waitFor(() => {
      expect(mockSetSelectedProvider).toHaveBeenCalledWith('provider-2');
    });
  });

  it('displays the currently selected provider', () => {
    setup({
      availableProviders: mockAvailableProviders,
      selectedProviderId: 'provider-1',
    });
    expect(screen.getByRole('combobox')).toHaveTextContent('Provider One');
  });

  it('is disabled when the disabled prop is true', () => {
    setup({ availableProviders: mockAvailableProviders }, { disabled: true });
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  describe('Default Provider Selection useEffect', () => {
    it('sets the first available provider if none selected and not in development', async () => {
      setup({ availableProviders: mockAvailableProviders, selectedProviderId: null }, { isDevelopmentEnvironment: false });
      await waitFor(() => {
        expect(mockSetSelectedProvider).toHaveBeenCalledWith('provider-1');
      });
    });

    it('sets the dummy provider if available, none selected, and in development', async () => {
      // No more vi.doMock or dynamic imports needed
      // Remove old debug log for mockImportMetaEnvDefault.MODE
      setup(
        { availableProviders: mockAvailableProviders, selectedProviderId: null }, 
        { isDevelopmentEnvironment: true } // Pass the prop directly
      );
      
      await waitFor(() => {
        expect(mockSetSelectedProvider).toHaveBeenCalledWith('dummy-test-provider');
      });
      
      // No more vi.doUnmock needed
    });
    
    it('sets the first provider if dummy not available, none selected, and in development', async () => {
      // No more vi.doMock or dynamic imports needed
      const providersWithoutDummy = mockAvailableProviders.filter(p => p.id !== 'dummy-test-provider');
      // Remove old debug log for mockImportMetaEnvDefault.MODE
      setup(
        { availableProviders: providersWithoutDummy, selectedProviderId: null },
        { isDevelopmentEnvironment: true } // Pass the prop directly
      );
      await waitFor(() => {
        expect(mockSetSelectedProvider).toHaveBeenCalledWith(providersWithoutDummy[0].id);
      });
      // No more vi.doUnmock needed
    });

    it('does not set a provider if one is already selected from the store', async () => {
      setup({
        availableProviders: mockAvailableProviders,
        selectedProviderId: 'provider-2',
      }, { isDevelopmentEnvironment: false }); // Can specify for clarity, or let it default
      await new Promise(resolve => setTimeout(resolve, 0)); 
      expect(mockSetSelectedProvider).not.toHaveBeenCalled();
    });

    it('calls setSelectedProvider with null if no providers available and none selected', async () => {
      setup({ availableProviders: [], selectedProviderId: null }, { isDevelopmentEnvironment: false });
      await waitFor(() => {
        expect(mockSetSelectedProvider).toHaveBeenCalledWith(null);
      });
    });

    it('does not call setSelectedProvider if no providers available but one was somehow selected', async () => {
      setup({ availableProviders: [], selectedProviderId: 'some-lingering-id' }, { isDevelopmentEnvironment: false });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSetSelectedProvider).not.toHaveBeenCalled();
    });
  });
}); 