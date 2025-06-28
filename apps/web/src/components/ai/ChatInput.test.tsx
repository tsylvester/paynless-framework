import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import ChatInput from './ChatInput';
import { useAiStore, initialAiStateValues, useTokenEstimator } from '@paynless/store';
import type { AiState, ChatMessage, AiProvider, SystemPrompt } from '@paynless/types';
import { act } from '@testing-library/react'; // Import act for state updates
import { useAIChatAffordabilityStatus } from '@/hooks/useAIChatAffordabilityStatus';

// Mock @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const originalStore = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...originalStore,
    useAiStore: vi.fn(), // Mock the hook itself
    useTokenEstimator: vi.fn(), // Mock useTokenEstimator
  };
});

// Mock hooks
vi.mock('@/hooks/useAIChatAffordabilityStatus', () => ({
  useAIChatAffordabilityStatus: vi.fn(), // Mock the hook itself
}));

// Mock child components if their internal logic is not part of this test
vi.mock('./MessageSelectionControls', () => ({ MessageSelectionControls: () => <div data-testid="mock-message-selection-controls"></div> }));
vi.mock('./CurrentMessageTokenEstimator', () => ({ CurrentMessageTokenEstimator: ({ textInput }: { textInput: string }) => <div data-testid="mock-token-estimator">{textInput}</div> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));


describe('ChatInput Component', () => {
  let mockSendMessage: Mock;
  let mockClearAiError: Mock;
  let mockCancelRewindPreparation: Mock;
  let mockSelectSelectedChatMessages: Mock<[], ChatMessage[]>;
  let mockUseTokenEstimator = useTokenEstimator as Mock;
  let mockUseAIChatAffordabilityStatus = useAIChatAffordabilityStatus as Mock;

  const defaultAffordabilityStatus = {
    canAffordNext: true,
    lowBalanceWarning: false,
    currentBalance: '1000',
  };

  const setupMockStore = (initialStoreState: Partial<AiState>, affordabilityStatus = defaultAffordabilityStatus, estimatedTokens = 10) => {
    mockSendMessage = vi.fn().mockResolvedValue(null); 
    mockClearAiError = vi.fn();
    mockCancelRewindPreparation = vi.fn();
    mockSelectSelectedChatMessages = vi.fn().mockReturnValue([]); 
    mockUseTokenEstimator.mockReturnValue(estimatedTokens);
    mockUseAIChatAffordabilityStatus.mockReturnValue(affordabilityStatus);

    const storeState: AiState = {
      ...initialAiStateValues, 
      selectedProviderId: 'test-provider', 
      selectedPromptId: 'test-prompt',     
      ...initialStoreState, 
      sendMessage: mockSendMessage,
      clearAiError: mockClearAiError,
      cancelRewindPreparation: mockCancelRewindPreparation,
      selectSelectedChatMessages: mockSelectSelectedChatMessages, 
    };

    (useAiStore as Mock).mockImplementation((selector?: (state: AiState) => any) => {
      if (selector) {
        return selector(storeState);
      }
      return storeState; 
    });

    useAiStore.getState = vi.fn().mockReturnValue(storeState);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMockStore({}); // Default setup with canAffordNext: true
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

  it('calls sendMessage with contextMessages on send button click when affordable', async () => {
    const selectedMessages: ChatMessage[] = [
      { id: 'msg1', role: 'user', content: 'Previous user msg', chat_id: 'chat-1', created_at: '', updated_at: '', is_active_in_thread: true, ai_provider_id:null, system_prompt_id: null, token_usage: null, user_id: 'user1' },
      { id: 'msg2', role: 'assistant', content: 'Previous AI msg', chat_id: 'chat-1', created_at: '', updated_at: '', is_active_in_thread: true, ai_provider_id:null, system_prompt_id: null, token_usage: null, user_id: null },
    ];
    setupMockStore(
        { currentChatId: 'chat-1', messagesByChatId: { 'chat-1': selectedMessages} },
        { ...defaultAffordabilityStatus, canAffordNext: true }
    );
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

  it('calls handleSend on Enter key press (without Shift) when affordable', async () => {
    setupMockStore({}, { ...defaultAffordabilityStatus, canAffordNext: true });
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
        }, { ...defaultAffordabilityStatus, canAffordNext: true }); // Ensure affordable for rewind tests by default
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
      expect(textarea.value).toBe(''); 
    });

    it('calls sendMessage (for resubmit) and cancelRewindPreparation on resubmit button click when affordable', async () => {
      render(<ChatInput />);
      const resubmitButton = screen.getByTestId('resubmit-message-button');
      const textarea = screen.getByTestId('chat-input-textarea') as HTMLTextAreaElement;
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
      }));
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
    mockSendMessage.mockResolvedValueOnce(null); 
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

  // New tests for affordability
  describe('Affordability UI and Button State', () => {
    it('disables send button and shows insufficient balance alert when !canAffordNext', () => {
      setupMockStore(
        { isLoadingAiResponse: false }, 
        { canAffordNext: false, lowBalanceWarning: true, currentBalance: '10' }, 
        50
      );
      render(<ChatInput />);
      fireEvent.change(screen.getByTestId('chat-input-textarea'), { target: { value: 'test' } });
      expect(screen.getByTestId('send-message-button')).toBeDisabled();
      expect(screen.getByTestId('insufficient-balance-alert')).toBeInTheDocument();
      expect(screen.getByTestId('insufficient-balance-alert')).toHaveTextContent('Insufficient token balance to send this message. Current balance: 10 tokens.');
      expect(screen.queryByTestId('low-balance-alert')).not.toBeInTheDocument();
    });

    it('shows low balance warning when canAffordNext is true but lowBalanceWarning is true', () => {
      setupMockStore(
        { isLoadingAiResponse: false }, 
        { canAffordNext: true, lowBalanceWarning: true, currentBalance: '100' }, 
        50
      );
      render(<ChatInput />);
      fireEvent.change(screen.getByTestId('chat-input-textarea'), { target: { value: 'test message' } });
      expect(screen.getByTestId('send-message-button')).not.toBeDisabled();
      expect(screen.getByTestId('low-balance-alert')).toBeInTheDocument();
      expect(screen.getByTestId('low-balance-alert')).toHaveTextContent('Low token balance. Current balance: 100 tokens.');
      expect(screen.queryByTestId('insufficient-balance-alert')).not.toBeInTheDocument();
    });

    it('does not show any alert when canAffordNext and no lowBalanceWarning', () => {
      setupMockStore(
        { isLoadingAiResponse: false }, 
        { canAffordNext: true, lowBalanceWarning: false, currentBalance: '300' }, 
        50
      );
      render(<ChatInput />);
      expect(screen.queryByTestId('insufficient-balance-alert')).not.toBeInTheDocument();
      expect(screen.queryByTestId('low-balance-alert')).not.toBeInTheDocument();
    });

    it('disables resubmit button when rewinding and !canAffordNext', () => {
      setupMockStore(
        { rewindTargetMessageId: 'rewind-msg', messagesByChatId: {'chat-1': [{id: 'rewind-msg', content: 'rewind content', role: 'user', chat_id: 'chat-1', created_at: '', updated_at: '', is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: 'user1'}]} }, 
        { canAffordNext: false, lowBalanceWarning: true, currentBalance: '5' }, 
        10
      );
      render(<ChatInput />);
      expect(screen.getByTestId('resubmit-message-button')).toBeDisabled();
      expect(screen.getByTestId('insufficient-balance-alert')).toBeInTheDocument();
    });

    it('does not call sendMessage if send button is clicked and !canAffordNext', async () => {
      setupMockStore({}, { canAffordNext: false, lowBalanceWarning: true, currentBalance: '0' });
      render(<ChatInput />);
      const textarea = screen.getByTestId('chat-input-textarea');
      const sendButton = screen.getByTestId('send-message-button');
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);
      await waitFor(() => {
        expect(mockSendMessage).not.toHaveBeenCalled();
      });
    });
  });

}); 