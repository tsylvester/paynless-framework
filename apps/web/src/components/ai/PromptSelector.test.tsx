import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAiStore } from '@paynless/store';
import type { SystemPrompt, AiStore } from '@paynless/types';
import { PromptSelector } from './PromptSelector';
import { 
  mockedUseAiStoreHookLogic,
  mockSetState,
  resetAiStoreMock,
  getAiStoreState, // Changed from internalMockAiGetState to getAiStoreState
  mockSetAvailablePrompts // If we want to set prompts via the mock's specific utility
} from '../../mocks/aiStore.mock'; // Adjusted path

// Remove the previous mock for @paynless/types if it exists
// vi.mock('@paynless/types', () => ({})); // This line should be removed or commented out

// Mock @paynless/store following ModelSelector.test.tsx pattern
vi.mock('@paynless/store', async (importOriginal) => {
  const actualStoreModule = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actualStoreModule,
    useAiStore: vi.fn(), // Replace useAiStore with a simple mock function here
  };
});

vi.mock('@paynless/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// const mockSetSelectedPrompt = vi.fn(); // Removed, use spy from shared mock

const mockAvailablePromptsData: SystemPrompt[] = [
  { 
    id: 'prompt-1', 
    name: 'General Assistant', 
    prompt_text: 'You are a helpful assistant.', 
    created_at: '2023-01-01T00:00:00Z', 
    updated_at: '2023-01-01T00:00:00Z', 
    is_active: true,
    context: null,
    description: null,
    is_stage_default: false,
    stage_association: null,
    variables_required: {},
    version: 1,
  },
  { 
    id: 'prompt-2', 
    name: 'Code Helper', 
    prompt_text: 'You are an expert programmer.', 
    created_at: '2023-01-01T00:00:00Z', 
    updated_at: '2023-01-01T00:00:00Z', 
    is_active: true,
    context: null,
    description: null,
    is_stage_default: false,
    stage_association: null,
    variables_required: {},
    version: 1,
  },
  { 
    id: 'prompt-3', 
    name: 'Creative Writer', 
    prompt_text: 'Help me write a story.', 
    created_at: '2023-01-01T00:00:00Z', 
    updated_at: '2023-01-01T00:00:00Z', 
    is_active: true,
    context: null,
    description: null,
    is_stage_default: false,
    stage_association: null,
    variables_required: {},
    version: 1,
  },
];

describe('PromptSelector', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  let storeActions: ReturnType<typeof getAiStoreState>; // Changed type to use getAiStoreState

  beforeEach(() => {
    vi.clearAllMocks(); // Still useful
    resetAiStoreMock(); // Reset the shared mock
    
    // Set the mock implementation for useAiStore here, before each test
    vi.mocked(useAiStore).mockImplementation(mockedUseAiStoreHookLogic);

    // Initialize storeActions for easy access to spies, after reset
    storeActions = getAiStoreState(); 
    HTMLElement.prototype.scrollIntoView = vi.fn(); // Mock scrollIntoView

    // Ensure setSelectedPrompt is a spy before each test, if not already by resetAiStoreMock
    // The shared mock's initialAiState should ideally have spies for all actions.
    // Let's assume resetAiStoreMock correctly sets up setSelectedPrompt as a spy.
    // If not, we might need: storeActions.setSelectedPrompt = vi.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView; // Restore original
    vi.resetModules(); // Still good practice
  });

  // Removed local createMockStoreState

  const setup = (
    storeStateOverrides: Partial<AiStore>, // AiStore for compatibility with shared mock state
    props: Partial<React.ComponentProps<typeof PromptSelector>> = {}
  ) => {
    // Set available prompts using the mock's utility if provided, or directly in state
    if (storeStateOverrides.availablePrompts) {
      mockSetAvailablePrompts(storeStateOverrides.availablePrompts);
    }
    // Set the rest of the state
    mockSetState(storeStateOverrides); 
    
    // The useAiStore mock implementation is already set at the top level vi.mock
    return render(<PromptSelector {...props} />);
  };

  it('renders loading state when isConfigLoading is true', () => {
    setup({ isConfigLoading: true });
    expect(screen.getByText('Loading prompts...')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders "Select a system prompt" placeholder when no prompts are loaded and not loading', () => {
    setup({ availablePrompts: [], isConfigLoading: false });
    expect(screen.getByText('Select a system prompt')).toBeInTheDocument();
    expect(screen.getByText('Could not load system prompts.')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
  
  it('renders with "Could not load system prompts." when prompts array is undefined and not loading', () => {
    // mockSetAvailablePrompts([]); // Ensure it's empty if undefined is tricky for the mock
    setup({ availablePrompts: undefined, isConfigLoading: false }); // Test how component handles undefined
    expect(screen.getByText('Could not load system prompts.')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders available prompts and allows selection, including "-- None --"', async () => {
    setup({ availablePrompts: mockAvailablePromptsData, selectedPromptId: null });

    const combobox = screen.getByRole('combobox');
    expect(combobox).not.toBeDisabled();
    expect(screen.getByText('Select a system prompt')).toBeInTheDocument();

    fireEvent.click(combobox);

    await waitFor(() => {
      expect(screen.getByText('-- None --')).toBeInTheDocument();
      expect(screen.getByText('General Assistant')).toBeInTheDocument();
      expect(screen.getByText('Code Helper')).toBeInTheDocument();
      expect(screen.getByText('Creative Writer')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Code Helper'));

    await waitFor(() => {
      expect(storeActions.setSelectedPrompt).toHaveBeenCalledWith('prompt-2');
    });

    // Select "-- None --"
    fireEvent.click(combobox);
    await waitFor(() => screen.getByText('-- None --')); // Ensure it's visible again
    fireEvent.click(screen.getByText('-- None --'));
    await waitFor(() => {
        expect(storeActions.setSelectedPrompt).toHaveBeenCalledWith('__none__');
    });
  });

  it('displays the currently selected prompt', () => {
    setup({
      availablePrompts: mockAvailablePromptsData,
      selectedPromptId: 'prompt-1',
    });
    expect(screen.getByRole('combobox')).toHaveTextContent('General Assistant');
  });

  it('displays "-- None --" when selectedPromptId is "__none__"', () => {
    // This test might need adjustment based on how Radix SelectValue displays this.
    // The shared mock doesn't define a specific behavior for displaying "__none__" in the trigger.
    // We primarily care that the value is correctly set in the store.
    setup({
      availablePrompts: mockAvailablePromptsData,
      selectedPromptId: '__none__',
    });
    // For Radix, if value is set to __none__ and there's a corresponding SelectItem,
    // the SelectValue *might* show that item's text if it's not the placeholder.
    // The component has <SelectItem key="__none__" value="__none__"> -- None -- </SelectItem>
    // So it should display "-- None --" in the trigger.
    expect(screen.getByRole('combobox')).toHaveTextContent('-- None --');
  });


  it('is disabled when the disabled prop is true', () => {
    setup({ availablePrompts: mockAvailablePromptsData }, { disabled: true });
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
  
  it('does not call setSelectedPrompt if one is already selected and component re-renders (no change)', async () => {
    setup({
      availablePrompts: mockAvailablePromptsData,
      selectedPromptId: 'prompt-1',
    });
    await new Promise(resolve => setTimeout(resolve, 0)); 
    expect(storeActions.setSelectedPrompt).not.toHaveBeenCalled();
  });
}); 