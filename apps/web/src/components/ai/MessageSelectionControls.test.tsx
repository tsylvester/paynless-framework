import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { MessageSelectionControls } from './MessageSelectionControls'; // Component to be created
import { useAiStore } from '@paynless/store';

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

describe('MessageSelectionControls', () => {
  beforeEach(() => {
    mockSelectAllMessages.mockClear();
    mockDeselectAllMessages.mockClear();

    // Cast to any to satisfy TypeScript for the mock implementation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseAiStore = useAiStore as any;
    mockUseAiStore.mockReturnValue({
      selectAllMessages: mockSelectAllMessages,
      deselectAllMessages: mockDeselectAllMessages,
      currentChatId: mockCurrentChatId, // Provide a default mock chat ID
    });
  });

  it('should render a "Select All" button', () => {
    render(<MessageSelectionControls />);
    expect(screen.getByRole('button', { name: /^Select all messages$/i })).toBeInTheDocument();
  });

  it('should render a "Deselect All" button', () => {
    render(<MessageSelectionControls />);
    expect(screen.getByRole('button', { name: /^Deselect all messages$/i })).toBeInTheDocument();
  });

  it('should call selectAllMessages with currentChatId when the "Select All" button is clicked', () => {
    render(<MessageSelectionControls />);
    const selectAllButton = screen.getByRole('button', { name: /^Select all messages$/i });
    fireEvent.click(selectAllButton);
    expect(mockSelectAllMessages).toHaveBeenCalledTimes(1);
    expect(mockSelectAllMessages).toHaveBeenCalledWith(mockCurrentChatId);
  });

  it('should call deselectAllMessages with currentChatId when the "Deselect All" button is clicked', () => {
    render(<MessageSelectionControls />);
    const deselectAllButton = screen.getByRole('button', { name: /^Deselect all messages$/i });
    fireEvent.click(deselectAllButton);
    expect(mockDeselectAllMessages).toHaveBeenCalledTimes(1);
    expect(mockDeselectAllMessages).toHaveBeenCalledWith(mockCurrentChatId);
  });

  it('should disable buttons if currentChatId is null', () => {
    mockUseAiStore.mockReturnValue({
      selectAllMessages: mockSelectAllMessages,
      deselectAllMessages: mockDeselectAllMessages,
      currentChatId: null, // Set currentChatId to null for this test
    });
    render(<MessageSelectionControls />);
    expect(screen.getByRole('button', { name: /^Select all messages$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Deselect all messages$/i })).toBeDisabled();
  });

  it('should not call selectAllMessages if currentChatId is null', () => {
    mockUseAiStore.mockReturnValue({
      selectAllMessages: mockSelectAllMessages,
      deselectAllMessages: mockDeselectAllMessages,
      currentChatId: null,
    });
    render(<MessageSelectionControls />);
    const selectAllButton = screen.getByRole('button', { name: /^Select all messages$/i });
    fireEvent.click(selectAllButton);
    expect(mockSelectAllMessages).not.toHaveBeenCalled();
  });

  it('should not call deselectAllMessages if currentChatId is null', () => {
    mockUseAiStore.mockReturnValue({
      selectAllMessages: mockSelectAllMessages,
      deselectAllMessages: mockDeselectAllMessages,
      currentChatId: null,
    });
    render(<MessageSelectionControls />);
    const deselectAllButton = screen.getByRole('button', { name: /^Deselect all messages$/i });
    fireEvent.click(deselectAllButton);
    expect(mockDeselectAllMessages).not.toHaveBeenCalled();
  });

  // Future tests for conditional button states (e.g., disabled) can be added here.
  // For example:
  // it('should disable "Select All" button if all messages are already selected', () => {
  //   mockUseAiStore.mockReturnValue({
  //     selectAllMessages: mockSelectAllMessages,
  //     deselectAllMessages: mockDeselectAllMessages,
  //     areAllMessagesSelected: true, // Hypothetical selector
  //   });
  //   render(<MessageSelectionControls />);
  //   expect(screen.getByRole('button', { name: /^Select all$/i })).toBeDisabled();
  // });
}); 