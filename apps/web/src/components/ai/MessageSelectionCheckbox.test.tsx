import { render, screen, fireEvent } from '@testing-library/react';
import { MessageSelectionCheckbox, MessageSelectionCheckboxProps } from './MessageSelectionCheckbox';
import { useAiStore } from '@paynless/store';
import type { AiStore } from '@paynless/types'; // Import AiStore for typing mocks
import type { Mock } from 'vitest'; // Import the Mock type

// Mock the useAiStore - vi should be global
vi.mock('@paynless/store', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/store')>();
    return {
        ...actual,
        useAiStore: vi.fn(), // vi from global
    };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseAiStore = useAiStore as any; // Cast to any to bypass complex type error for now

// Define a more specific type for the mock return value of the store state slice
type MockAiStoreStateSlice = Partial<Pick<AiStore, 'selectedMessagesMap' | 'toggleMessageSelection'>> & {
    // Add other properties if the component or hook relies on them.
};

// Define the type for the selector function itself
type AiStoreSelector<TResult> = (state: AiStore) => TResult;


describe('MessageSelectionCheckbox', () => {
  const mockToggleMessageSelection = vi.fn(); // vi from global
  
  const defaultProps: MessageSelectionCheckboxProps = {
    messageId: 'msg1',
    chatId: 'chat1',
  };

  // Helper to set up the mock for each test, providing default state
  const setupMockAiStore = (stateSlice: MockAiStoreStateSlice) => {
    // Ensure mockUseAiStore is treated as a mock function for implementation
    (mockUseAiStore as Mock).mockImplementation(<TResult,>(selector: AiStoreSelector<TResult>): TResult => {
        // The selector expects the full AiStore type, but we are mocking a slice.
        // We cast our stateSlice to AiStore for the purpose of the selector execution.
        // This assumes the selector only accesses parts of the state we've mocked in stateSlice.
        return selector(stateSlice as AiStore);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks(); // vi from global
    // Set up a default mock state for most tests
    setupMockAiStore({
        selectedMessagesMap: { chat1: { msg1: true } },
        toggleMessageSelection: mockToggleMessageSelection,
    });
  });

  it('renders the checkbox', () => {
    render(<MessageSelectionCheckbox {...defaultProps} />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('message-selection-checkbox-msg1')).toBeInTheDocument();
  });

  it('is checked if selectedMessagesMap indicates true for the message', () => {
    render(<MessageSelectionCheckbox {...defaultProps} />); // Relies on beforeEach setup
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('is not checked if selectedMessagesMap indicates false for the message', () => {
    setupMockAiStore({
        selectedMessagesMap: { chat1: { msg1: false } },
        toggleMessageSelection: mockToggleMessageSelection,
    });
    render(<MessageSelectionCheckbox {...defaultProps} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('is checked by default if messageId is not in selectedMessagesMap for the chat', () => {
    setupMockAiStore({
        selectedMessagesMap: { chat1: {} }, // msg1 not in map
        toggleMessageSelection: mockToggleMessageSelection,
    });
    render(<MessageSelectionCheckbox {...defaultProps} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('is checked by default if chatId is not in selectedMessagesMap', () => {
    setupMockAiStore({
        selectedMessagesMap: {}, // chat1 not in map
        toggleMessageSelection: mockToggleMessageSelection,
    });
    render(<MessageSelectionCheckbox {...defaultProps} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
  
  it('calls toggleMessageSelection with correct chatId and messageId on change', () => {
    render(<MessageSelectionCheckbox {...defaultProps} />); // Relies on beforeEach setup
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(mockToggleMessageSelection).toHaveBeenCalledWith('chat1', 'msg1');
  });

  it('does not render if chatId is null', () => {
    // For this test, ensure the store setup doesn't interfere, or is set appropriately
    setupMockAiStore({ // Minimal setup for this case
        selectedMessagesMap: {},
        toggleMessageSelection: mockToggleMessageSelection,
    });
    const { container } = render(<MessageSelectionCheckbox messageId="msg1" chatId={null} />); 
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('does not call toggleMessageSelection if chatId is null when somehow clicked (though it should not render)', () => {
    setupMockAiStore({ // Minimal setup
        selectedMessagesMap: {},
        toggleMessageSelection: mockToggleMessageSelection,
    });
    render(<MessageSelectionCheckbox messageId="msg1" chatId={null} />); 
    const checkbox = screen.queryByRole('checkbox');
    if (checkbox) {
        fireEvent.click(checkbox); 
    }
    expect(mockToggleMessageSelection).not.toHaveBeenCalled();
  });
}); 