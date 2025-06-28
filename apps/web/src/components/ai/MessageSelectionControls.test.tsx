import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { MessageSelectionControls } from './MessageSelectionControls'; // Component to be created
import { useAiStore, selectCurrentChatSelectionState } from '@paynless/store';

// Mock the useAiStore
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAiStore: vi.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockUseAiStore: any;
const mockSelectAllMessages = vi.fn();
const mockDeselectAllMessages = vi.fn();
const mockCurrentChatId = 'test-chat-123';
let mockSelectionState: 'all' | 'none' | 'some' | 'empty' = 'none';

describe('MessageSelectionControls', () => {
  beforeEach(() => {
    mockSelectAllMessages.mockClear();
    mockDeselectAllMessages.mockClear();
    mockSelectionState = 'none'; // Reset selection state

    mockUseAiStore = useAiStore as any;
    // Default mock implementation
    mockUseAiStore.mockImplementation((selector: any) => {
      if (selector === selectCurrentChatSelectionState) {
        return mockSelectionState;
      }
      // For the state object itself
      return {
        selectAllMessages: mockSelectAllMessages,
        deselectAllMessages: mockDeselectAllMessages,
        currentChatId: mockCurrentChatId,
      };
    });
  });

  const getCheckbox = () => screen.getByRole('checkbox');

  it('should render a checkbox and a label', () => {
    render(<MessageSelectionControls />);
    expect(getCheckbox()).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('should have aria-label "Select all messages" and label "None" when selectionState is "none"', () => {
    mockSelectionState = 'none';
    render(<MessageSelectionControls />);
    expect(getCheckbox()).toHaveAttribute('aria-label', 'Select all messages');
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('should have aria-label "Deselect all messages" and label "All" when selectionState is "all"', () => {
    mockSelectionState = 'all';
    render(<MessageSelectionControls />);
    expect(getCheckbox()).toHaveAttribute('aria-label', 'Deselect all messages');
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('should have aria-label "Select all messages" and label "Some" when selectionState is "some"', () => {
    mockSelectionState = 'some';
    render(<MessageSelectionControls />);
    expect(getCheckbox()).toHaveAttribute('aria-label', 'Select all messages'); // Or Deselect, depends on desired toggle from 'some'
    expect(screen.getByText('Some')).toBeInTheDocument();
  });

  it('should call selectAllMessages when checkbox is clicked and state is "none"', () => {
    mockSelectionState = 'none';
    render(<MessageSelectionControls />);
    fireEvent.click(getCheckbox());
    expect(mockSelectAllMessages).toHaveBeenCalledTimes(1);
    expect(mockSelectAllMessages).toHaveBeenCalledWith(mockCurrentChatId);
    expect(mockDeselectAllMessages).not.toHaveBeenCalled();
  });

  it('should call selectAllMessages when checkbox is clicked and state is "some"', () => {
    mockSelectionState = 'some';
    render(<MessageSelectionControls />);
    fireEvent.click(getCheckbox());
    expect(mockSelectAllMessages).toHaveBeenCalledTimes(1);
    expect(mockSelectAllMessages).toHaveBeenCalledWith(mockCurrentChatId);
    expect(mockDeselectAllMessages).not.toHaveBeenCalled();
  });

  it('should call deselectAllMessages when checkbox is clicked and state is "all"', () => {
    mockSelectionState = 'all';
    render(<MessageSelectionControls />);
    fireEvent.click(getCheckbox());
    expect(mockDeselectAllMessages).toHaveBeenCalledTimes(1);
    expect(mockDeselectAllMessages).toHaveBeenCalledWith(mockCurrentChatId);
    expect(mockSelectAllMessages).not.toHaveBeenCalled();
  });

  it('should disable checkbox if currentChatId is null', () => {
    mockUseAiStore.mockImplementation((selector: any) => {
      if (selector === selectCurrentChatSelectionState) {
        return 'empty'; // or any state, disabled is based on currentChatId
      }
      return {
        selectAllMessages: mockSelectAllMessages,
        deselectAllMessages: mockDeselectAllMessages,
        currentChatId: null, // Set currentChatId to null
      };
    });
    render(<MessageSelectionControls />);
    expect(getCheckbox()).toBeDisabled();
  });

  it('should disable checkbox if selectionState is "empty"', () => {
    mockSelectionState = 'empty';
    render(<MessageSelectionControls />);
    expect(getCheckbox()).toBeDisabled();
    expect(screen.getByText('None')).toBeInTheDocument(); // Label should still reflect a non-interactive state
  });

  it('should not call selectAllMessages or deselectAllMessages if currentChatId is null when clicked', () => {
    mockUseAiStore.mockImplementation((selector: any) => {
      if (selector === selectCurrentChatSelectionState) {
        return 'none';
      }
      return {
        selectAllMessages: mockSelectAllMessages,
        deselectAllMessages: mockDeselectAllMessages,
        currentChatId: null,
      };
    });
    render(<MessageSelectionControls />);
    fireEvent.click(getCheckbox());
    expect(mockSelectAllMessages).not.toHaveBeenCalled();
    expect(mockDeselectAllMessages).not.toHaveBeenCalled();
  });

  it('should correctly set checkbox checked state for "none"', () => {
    mockSelectionState = 'none';
    render(<MessageSelectionControls />);
    expect(getCheckbox()).not.toBeChecked();
    expect(getCheckbox().getAttribute('data-state')).toBe('unchecked');
  });

  it('should correctly set checkbox checked state for "all"', () => {
    mockSelectionState = 'all';
    render(<MessageSelectionControls />);
    expect(getCheckbox()).toBeChecked();
    expect(getCheckbox().getAttribute('data-state')).toBe('checked');
  });

  it('should correctly set checkbox checked state for "some" (indeterminate)', () => {
    mockSelectionState = 'some';
    render(<MessageSelectionControls />);
    // For indeterminate, 'checked' prop is false, but data-state is 'indeterminate' via useEffect
    expect(getCheckbox()).not.toBeChecked(); 
    expect(getCheckbox().getAttribute('data-state')).toBe('indeterminate');
  });

}); 