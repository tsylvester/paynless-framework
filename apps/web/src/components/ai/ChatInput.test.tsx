import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import ChatInput from './ChatInput';
import { useAiStore, initialAiStateValues } from '@paynless/store';
import type { AiState, ChatMessage, AiProvider, SystemPrompt } from '@paynless/types';
import { act } from '@testing-library/react'; // Import act for state updates

// Mock @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const originalStore = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...originalStore,
    useAiStore: vi.fn(), // Mock the hook itself
  };
});

// Mock child components if their internal logic is not part of this test
vi.mock('./MessageSelectionControls', () => ({ MessageSelectionControls: () => <div data-testid="mock-message-selection-controls"></div> }));
vi.mock('./CurrentMessageTokenEstimator', () => ({ CurrentMessageTokenEstimator: ({ textInput }: { textInput: string }) => <div data-testid="mock-token-estimator">{textInput}</div> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));


describe('ChatInput Component', () => {
  let mockSendMessage: Mock;
  let mockClearAiError: Mock;
  let mockCancelRewindPreparation: Mock;
  let mockSelectSelectedChatMessages: Mock<[], ChatMessage[]>;

  const setupMockStore = (initialStoreState: Partial<AiState>) => {
    mockSendMessage = vi.fn().mockResolvedValue(null); // Default successful send
    mockClearAiError = vi.fn();
    mockCancelRewindPreparation = vi.fn();
    mockSelectSelectedChatMessages = vi.fn().mockReturnValue([]); // Default no selected messages

    const storeState: AiState = {
      ...initialAiStateValues, // Start with defaults
      selectedProviderId: 'test-provider', // Default provider for tests
      selectedPromptId: 'test-prompt',     // Default prompt for tests
      ...initialStoreState, // Override with specific test state
      // Ensure actions are part of the mock if they are called via getState()
      sendMessage: mockSendMessage,
      clearAiError: mockClearAiError,
      cancelRewindPreparation: mockCancelRewindPreparation,
      selectSelectedChatMessages: mockSelectSelectedChatMessages, 
      // Add other actions if ChatInput calls them directly via getState()
    };

    (useAiStore as Mock).mockImplementation((selector?: (state: AiState) => any) => {
      if (selector) {
        return selector(storeState);
      }
      return storeState; // Return the whole state if no selector
    });

    // Also mock useAiStore.getState() for direct calls within ChatInput
    useAiStore.getState = vi.fn().mockReturnValue(storeState);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default setup for most tests
    setupMockStore({
      isLoadingAiResponse: false,
      rewindTargetMessageId: null,
      currentChatId: 'chat-1',
      messagesByChatId: { 'chat-1': [] },
    });
  });

  it('renders textarea and send button', () => {
    render(<ChatInput />);
    expect(screen.getByTestId('chat-input-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('send-message-button')).toBeInTheDocument();
    expect(screen.getByTestId('mock-message-selection-controls')).toBeInTheDocument();
    expect(screen.getByTestId('mock-token-estimator')).toBeInTheDocument();
  });

  it('updates inputMessage state on textarea change', () => {
    render(<ChatInput />);
    const textarea = screen.getByTestId('chat-input-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    expect(textarea.value).toBe('Hello world');
  });

  it('calls sendMessage with contextMessages on send button click', async () => {
    const selectedMessages: ChatMessage[] = [
      { id: 'msg1', role: 'user', content: 'Previous user msg', chat_id: 'chat-1', created_at: '', updated_at: '', is_active_in_thread: true, ai_provider_id:null, system_prompt_id: null, token_usage: null, user_id: 'user1' },
      { id: 'msg2', role: 'assistant', content: 'Previous AI msg', chat_id: 'chat-1', created_at: '', updated_at: '', is_active_in_thread: true, ai_provider_id:null, system_prompt_id: null, token_usage: null, user_id: null },
    ];
    mockSelectSelectedChatMessages.mockReturnValue(selectedMessages);

    render(<ChatInput />);
    const textarea = screen.getByTestId('chat-input-textarea');
    const sendButton = screen.getByTestId('send-message-button');

    fireEvent.change(textarea, { target: { value: 'New message' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockClearAiError).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
    
    expect(mockSendMessage).toHaveBeenCalledWith({
      message: 'New message',
      chatId: 'chat-1',
      providerId: 'test-provider',
      promptId: 'test-prompt',
      contextMessages: [
        { role: 'user', content: 'Previous user msg' },
        { role: 'assistant', content: 'Previous AI msg' },
      ],
    });
  });

  it('calls handleSend on Enter key press (without Shift)', async () => {
    render(<ChatInput />);
    const textarea = screen.getByTestId('chat-input-textarea');
    fireEvent.change(textarea, { target: { value: 'Enter message' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false });

    await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({ message: 'Enter message' }));
  });

  it('does not call handleSend on Enter key press (with Shift)', () => {
    render(<ChatInput />);
    const textarea = screen.getByTestId('chat-input-textarea');
    fireEvent.change(textarea, { target: { value: 'Shift+Enter message' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: true });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('disables send button and textarea when isLoadingAiResponse is true', () => {
    setupMockStore({ isLoadingAiResponse: true });
    render(<ChatInput />);
    expect(screen.getByTestId('chat-input-textarea')).toBeDisabled();
    expect(screen.getByTestId('send-message-button')).toBeDisabled();
  });

  describe('Rewind Functionality', () => {
    const rewindMessageId = 'rewind-msg-id';
    const rewindMessageContent = 'This is the message to rewind.';
    const chatIdWithRewindMessage = 'chat-for-rewind';

    beforeEach(() => {
        setupMockStore({
            isLoadingAiResponse: false,
            rewindTargetMessageId: rewindMessageId,
            currentChatId: chatIdWithRewindMessage,
            messagesByChatId: {
                [chatIdWithRewindMessage]: [
                    { id: rewindMessageId, role: 'user', content: rewindMessageContent, chat_id: chatIdWithRewindMessage, created_at: '', updated_at: '', is_active_in_thread: true, ai_provider_id:null, system_prompt_id: null, token_usage: null, user_id: 'user1' },
                ]
            },
            selectedProviderId: 'rewind-provider',
            selectedPromptId: 'rewind-prompt',
        });
    });

    it('displays resubmit and cancel buttons when rewinding', () => {
      render(<ChatInput />);
      expect(screen.getByTestId('resubmit-message-button')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-rewind-button')).toBeInTheDocument();
      expect(screen.queryByTestId('send-message-button')).not.toBeInTheDocument();
    });

    it('populates textarea with message content when rewindTargetMessageId is set', () => {
      render(<ChatInput />);
      const textarea = screen.getByTestId('chat-input-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe(rewindMessageContent);
    });

    it('calls cancelRewindPreparation and clears input on cancel rewind button click', () => {
      render(<ChatInput />);
      const cancelButton = screen.getByTestId('cancel-rewind-button');
      fireEvent.click(cancelButton);
      expect(mockCancelRewindPreparation).toHaveBeenCalledTimes(1);
      const textarea = screen.getByTestId('chat-input-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe(''); // Input cleared on cancel
    });

    it('calls sendMessage (for resubmit) and cancelRewindPreparation on resubmit button click', async () => {
      render(<ChatInput />);
      const resubmitButton = screen.getByTestId('resubmit-message-button');
      const textarea = screen.getByTestId('chat-input-textarea') as HTMLTextAreaElement;
      
      // Ensure textarea has content for the resubmit button to be enabled (if logic enforces this)
      expect(textarea.value).toBe(rewindMessageContent);

      fireEvent.click(resubmitButton);

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledTimes(1);
      });
      expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
        message: rewindMessageContent,
        chatId: chatIdWithRewindMessage,
        providerId: 'rewind-provider',
        promptId: 'rewind-prompt',
        // contextMessages would be from selectSelectedChatMessages, ensure it's mocked if needed
      }));
      
      // Assuming sendMessage leads to cancelRewindPreparation being called if it was a rewind
      await waitFor(() => {
        expect(mockCancelRewindPreparation).toHaveBeenCalledTimes(1);
      });
    });
  });

  it('clears input on successful send', async () => {
    render(<ChatInput />);
    const textarea = screen.getByTestId('chat-input-textarea') as HTMLTextAreaElement;
    const sendButton = screen.getByTestId('send-message-button');

    fireEvent.change(textarea, { target: { value: 'Clear this on send' } });
    expect(textarea.value).toBe('Clear this on send');
    
    mockSendMessage.mockResolvedValueOnce(null); // Ensure it resolves to simulate success

    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
    expect(textarea.value).toBe('');
  });

  it('does NOT clear input on failed send', async () => {
    render(<ChatInput />);
    const textarea = screen.getByTestId('chat-input-textarea') as HTMLTextAreaElement;
    const sendButton = screen.getByTestId('send-message-button');

    fireEvent.change(textarea, { target: { value: 'Do not clear this' } });
    expect(textarea.value).toBe('Do not clear this');
    
    mockSendMessage.mockRejectedValueOnce(new Error('Send failed'));

    fireEvent.click(sendButton);

    await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
    expect(textarea.value).toBe('Do not clear this');
  });

}); 