import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialDialecticStateValues } from '@paynless/store';
import { initialAiStateValues } from '@paynless/types';
import { AIModelSelector } from './AIModelSelector';
// Import AiProvider and DialecticStateValues for typing mock stores
import type { AiProvider, DialecticStateValues, AiState } from '@paynless/types';

// Store references to mock implementations that can be updated
let currentDialecticState: DialecticStateValues;
let currentDialecticActions: { setModelMultiplicity: ReturnType<typeof vi.fn> };
let currentAiState: AiState;
let currentAiActions: { loadAiConfig: ReturnType<typeof vi.fn> };

// Mock the Zustand stores
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  const typesModule = await vi.importActual<typeof import('@paynless/types')>('@paynless/types');
  
  const mockUseDialecticStore = vi.fn((selector?: (state: DialecticStateValues & typeof currentDialecticActions) => unknown) => {
    if (selector) {
      return selector({ ...currentDialecticState, ...currentDialecticActions });
    }
    return { ...currentDialecticState, ...currentDialecticActions };
  });

  const mockUseAiStore = vi.fn((selector?: (state: AiState & typeof currentAiActions) => unknown) => {
    if (selector) {
      return selector({ ...currentAiState, ...currentAiActions });
    }
    return { ...currentAiState, ...currentAiActions };
  });

  return {
    ...actual,
    useAiStore: mockUseAiStore,
    useDialecticStore: mockUseDialecticStore,
    initialAiStateValues: typesModule.initialAiStateValues,
  };
});

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
    setModelMultiplicity: vi.fn(),
    // Add other dialectic actions if used by the component indirectly
  };

  const aiActions = {
    loadAiConfig: vi.fn(),
    // Add other AI actions if used
  };

  // Update the current state references
  currentDialecticState = dialecticState;
  currentDialecticActions = dialecticActions;
  currentAiState = aiState;
  currentAiActions = aiActions;

  return { dialecticState, dialecticActions, aiState, aiActions };
};

const mockAiProvidersData: AiProvider[] = [
  { id: 'model1', name: 'GPT-4', provider: 'OpenAI', api_identifier: 'gpt-4', created_at: 'test', updated_at: 'test', is_active: true, is_enabled: true, is_default_embedding: false, config: null, description: null },
  { id: 'model2', name: 'Claude 3', provider: 'Anthropic', api_identifier: 'claude-3', created_at: 'test', updated_at: 'test', is_active: true, is_enabled: true, is_default_embedding: false, config: null, description: null },
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
    const user = userEvent.setup();

    expect(screen.getByText('Click to select AI models')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));

    await waitFor(async () => {
      expect(screen.getByText('GPT-4')).toBeInTheDocument();
      expect(screen.getByText('Claude 3')).toBeInTheDocument(); 
    });

    // Find the GPT-4 model item
    const gpt4Item = await screen.findByTestId('model-item-model1');
    
    // Find the increment button within the GPT-4 item and click it
    // Assuming MultiplicitySelector's increment button has an accessible name or role
    // For this example, let's assume it has title "Increment"
    const incrementButton = within(gpt4Item).getByRole('button', { name: /Increment/i });
    await user.click(incrementButton);

    // Expect setModelMultiplicity to be called with model1 and count 1
    expect(dialecticActions.setModelMultiplicity).toHaveBeenCalledWith('model1', 1);
  });

  test('displays selected models summary correctly', () => {
    let unmount: () => void;

    // Initial: No models selected
    setupMockStores({ selectedModelIds: [] }, { availableProviders: mockAiProvidersData });
    ({ unmount } = render(<AIModelSelector />));
    expect(screen.getByText('Click to select AI models')).toBeInTheDocument();
    unmount();

    // Test with multiplicity 1 for GPT-4
    setupMockStores({ selectedModelIds: ['model1'] }, { availableProviders: mockAiProvidersData });
    ({ unmount } = render(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.queryByText('Claude 3')).not.toBeInTheDocument();
    unmount();

    // Test with multiplicity 2 for GPT-4
    setupMockStores({ selectedModelIds: ['model1', 'model1'] }, { availableProviders: mockAiProvidersData });
    ({ unmount } = render(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Count badge should show 2
    expect(screen.queryByText('Claude 3')).not.toBeInTheDocument();
    unmount();

    // Test with GPT-4 (x1) and Claude 3 (x1)
    setupMockStores({ selectedModelIds: ['model1', 'model2'] }, { availableProviders: mockAiProvidersData });
    ({ unmount } = render(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    unmount();

    // Test with GPT-4 (x2) and Claude 3 (x1)
    setupMockStores({ selectedModelIds: ['model1', 'model1', 'model2'] }, { availableProviders: mockAiProvidersData });
    ({ unmount } = render(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Count badge should show 2
    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    unmount();

    const geminiModel: AiProvider = { id: 'model3', name: 'Gemini', provider: 'Google', api_identifier: 'gemini', created_at: 'test', updated_at: 'test', is_active: true, is_enabled: true, is_default_embedding: false, config: null, description: null };
    const manyProviders: AiProvider[] = [...mockAiProvidersData, geminiModel];

    // Test with three models, GPT-4 (x1), Claude 3 (x1), Gemini (x1)
    setupMockStores({ selectedModelIds: ['model1', 'model2', 'model3'] }, { availableProviders: manyProviders });
    ({ unmount } = render(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    unmount();

    // Test with three models, GPT-4 (x2), Claude 3 (x1), Gemini (x1)
    setupMockStores({ selectedModelIds: ['model1', 'model1', 'model2', 'model3'] }, { availableProviders: manyProviders });
    ({ unmount } = render(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Count badge should show 2
    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    unmount();
  });

  test('renders MultiplicitySelector for each model in the dropdown', async () => {
    setupMockStores(
      { selectedModelIds: [] }, 
      { availableProviders: mockAiProvidersData, isConfigLoading: false }
    );
    render(<AIModelSelector />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));

    for (const provider of mockAiProvidersData) {
      const modelItem = await screen.findByTestId(`model-item-${provider.id}`);
      expect(within(modelItem).getByRole('button', { name: /Increment/i })).toBeInTheDocument();
      expect(within(modelItem).getByRole('button', { name: /Decrement/i })).toBeInTheDocument();
      // Check for the display of count, which is 0 initially for all
      expect(within(modelItem).getByText('0')).toBeInTheDocument(); 
    }
  });

  test('incrementing multiplicity calls setModelMultiplicity correctly', async () => {
    const { dialecticActions } = setupMockStores(
      { selectedModelIds: [] }, // Start with model1 count 0
      { availableProviders: [mockAiProvidersData[0]], isConfigLoading: false } // Only GPT-4 for simplicity
    );
    const { unmount, container } = render(<AIModelSelector />); // Capture unmount and container
    const user = userEvent.setup();
    await user.click(within(container).getByRole('button', { name: /Select AI Models/i }));

    // Dropdown content is usually portalled, so findByTestId might still search globally or within screen
    // but let's assume the dropdown items are within a structure accessible from the initial render for the first interaction
    const modelItem = await screen.findByTestId(`model-item-${mockAiProvidersData[0].id}`);
    const incrementButton = within(modelItem).getByRole('button', { name: /Increment/i });

    // Increment from 0 to 1
    await user.click(incrementButton);
    expect(dialecticActions.setModelMultiplicity).toHaveBeenCalledWith(mockAiProvidersData[0].id, 1);

    await user.keyboard('{Escape}'); // Close the dropdown
    unmount(); // Unmount the previous instance

    // Setup state as if count is now 1 for model1
    // Re-assign dialecticActions for the new setup
    const { dialecticActions: secondPhaseActions } = setupMockStores(
      { selectedModelIds: [mockAiProvidersData[0].id] }, // model1 count is 1
      { availableProviders: [mockAiProvidersData[0]], isConfigLoading: false }
    );
    // Re-render with new state and get the new container
    const { container: newContainer, unmount: newUnmount } = render(<AIModelSelector />); 
    // Use the new container for subsequent queries
    await user.click(within(newContainer).getByRole('button', { name: /Select AI Models/i })); // Re-open dropdown
    
    const updatedModelItem = await screen.findByTestId(`model-item-${mockAiProvidersData[0].id}`);
    const updatedIncrementButton = within(updatedModelItem).getByRole('button', { name: /Increment/i });

    // Increment from 1 to 2
    await user.click(updatedIncrementButton);
    // Check the call to the new spy instance
    expect(secondPhaseActions.setModelMultiplicity).toHaveBeenCalledWith(mockAiProvidersData[0].id, 2);
    expect(secondPhaseActions.setModelMultiplicity).toHaveBeenCalledTimes(1); 
    newUnmount(); // cleanup the second render
  });

  test('decrementing multiplicity calls setModelMultiplicity correctly', async () => {
    // Initial setup for the first phase
    const { dialecticActions: firstPhaseActions } = setupMockStores(
      { selectedModelIds: [mockAiProvidersData[0].id, mockAiProvidersData[0].id] }, // Start with model1 count 2
      { availableProviders: [mockAiProvidersData[0]], isConfigLoading: false }
    );
    const { container, unmount } = render(<AIModelSelector />);
    const user = userEvent.setup();
    
    await user.click(within(container).getByRole('button', { name: /Select AI Models/i }));

    const modelItem = await screen.findByTestId(`model-item-${mockAiProvidersData[0].id}`);
    const decrementButton = within(modelItem).getByRole('button', { name: /Decrement/i });

    // Decrement from 2 to 1
    await user.click(decrementButton);
    expect(firstPhaseActions.setModelMultiplicity).toHaveBeenCalledWith(mockAiProvidersData[0].id, 1);
    expect(firstPhaseActions.setModelMultiplicity).toHaveBeenCalledTimes(1);
    
    await user.keyboard('{Escape}'); // Close the dropdown
    unmount(); // Unmount the previous instance

    // Setup state for the second phase, as if count is now 1 for model1
    const { dialecticActions: secondPhaseActions } = setupMockStores(
      { selectedModelIds: [mockAiProvidersData[0].id] }, // model1 count is 1
      { availableProviders: [mockAiProvidersData[0]], isConfigLoading: false }
    );
    // Re-render and get the new container
    const { container: newContainer, unmount: newUnmount } = render(<AIModelSelector />);
    await user.click(within(newContainer).getByRole('button', { name: /Select AI Models/i })); // Re-open

    const updatedModelItem = await screen.findByTestId(`model-item-${mockAiProvidersData[0].id}`);
    const updatedDecrementButton = within(updatedModelItem).getByRole('button', { name: /Decrement/i });

    // Decrement from 1 to 0
    await user.click(updatedDecrementButton);
    expect(secondPhaseActions.setModelMultiplicity).toHaveBeenCalledWith(mockAiProvidersData[0].id, 0);
    expect(secondPhaseActions.setModelMultiplicity).toHaveBeenCalledTimes(1); 
    newUnmount();
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

describe('AIModelSelector Pulsing animation', () => {
  const getPulsingButton = () => {
    // The pulsing classes are applied directly to the InternalDropdownButton
    return screen.getByRole('button', { name: /Select AI Models/i });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure scrollIntoView is mocked for Radix components that might use it
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  test('applies pulsing animation when no models selected, not disabled, not loading, no error, and providers exist', () => {
    setupMockStores(
      { selectedModelIds: [] }, // No models
      {
        availableProviders: mockAiProvidersData, // Has providers
        isConfigLoading: false,                 // Not loading
        aiError: null,                          // No error
      }
    );
    render(<AIModelSelector disabled={false} />); // Not disabled by prop
    const pulsingButton = getPulsingButton();
    expect(pulsingButton).toHaveClass('ring-2', 'ring-primary', 'animate-pulse');
  });

  test('does NOT apply pulsing animation if models ARE selected', () => {
    setupMockStores(
      { selectedModelIds: ['model1'] }, // Models selected
      { availableProviders: mockAiProvidersData, isConfigLoading: false, aiError: null }
    );
    render(<AIModelSelector disabled={false} />);
    const pulsingButton = getPulsingButton();
    expect(pulsingButton).not.toHaveClass('animate-pulse');
  });

  test('does NOT apply pulsing animation if disabled by prop', () => {
    setupMockStores(
      { selectedModelIds: [] },
      { availableProviders: mockAiProvidersData, isConfigLoading: false, aiError: null }
    );
    render(<AIModelSelector disabled={true} />); // Disabled
    const pulsingButton = getPulsingButton();
    expect(pulsingButton).not.toHaveClass('animate-pulse');
  });

  test('does NOT apply pulsing animation if config is loading', () => {
    setupMockStores(
      { selectedModelIds: [] },
      { availableProviders: mockAiProvidersData, isConfigLoading: true, aiError: null } // Loading
    );
    render(<AIModelSelector disabled={false} />);
    const pulsingButton = getPulsingButton();
    expect(pulsingButton).not.toHaveClass('animate-pulse');
  });

  test('does NOT apply pulsing animation if there is an AI error', () => {
    setupMockStores(
      { selectedModelIds: [] },
      { availableProviders: mockAiProvidersData, isConfigLoading: false, aiError: 'Some Error' } // Error
    );
    render(<AIModelSelector disabled={false} />);
    const pulsingButton = getPulsingButton();
    expect(pulsingButton).not.toHaveClass('animate-pulse');
  });

  test('does NOT apply pulsing animation if there are no available providers', () => {
    // This scenario leads to `finalIsDisabled` being true because `hasContentProviders` is false.
    // The pulse condition `!finalIsDisabled` becomes false.
    setupMockStores(
      { selectedModelIds: [] },
      { availableProviders: [], isConfigLoading: false, aiError: null } // No providers
    );
    render(<AIModelSelector disabled={false} />);
    const button = screen.getByRole('button', { name: /Select AI Models/i });
    expect(button).toBeDisabled(); // Button becomes disabled because no providers + not loading + no error
    expect(button).not.toHaveClass('animate-pulse');
  });
}); 