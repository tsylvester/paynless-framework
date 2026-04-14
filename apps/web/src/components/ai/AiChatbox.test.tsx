import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AiChatbox, AiChatboxProps } from './AiChatbox';
import { vi } from 'vitest';
import { ChatMessage, ChatMessageRow, AiStore, ChatRole } from '@paynless/types';
import { createSseConnectionStub } from '../../../../../packages/store/src/aiStore.streaming.mock.ts';

vi.mock('@/hooks/useAIChatAffordabilityStatus', () => ({
  useAIChatAffordabilityStatus: () => ({
    canAffordNext: true,
    lowBalanceWarning: false,
    currentBalance: '10000',
    estimatedNextCost: 0,
  }),
}));

// Mock @paynless/utils
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  // Add any other exports from @paynless/utils that are used
}));

// Import the shared mock utilities
import { 
  useMockedAiStoreHookLogic, 
  mockSetState,
  resetAiStoreMock,
  // Access action spies via the initial state or exported spies from the mock file
  // For example, if sendMessage is vi.fn() on the initial state of the mock:
  // let mockSendMessage; (will be assigned from the store mock state)
} from '../../mocks/aiStore.mock'; // Adjusted path

function requireTextarea(node: HTMLElement): HTMLTextAreaElement {
  if (node instanceof HTMLTextAreaElement) {
    return node;
  }
  throw new Error('Expected HTMLTextAreaElement');
}

// Mock ChatMessageBubble
const mockChatMessageBubble = vi.fn((props: { message: ChatMessage; onEditClick?: (id: string, content: string) => void; }) => <div data-testid={`mock-bubble-${props.message.id}`} />); 
vi.mock('./ChatMessageBubble', () => ({
  ChatMessageBubble: (props: { message: ChatMessage; onEditClick?: (id: string, content: string) => void; }) => mockChatMessageBubble(props), 
}));

// Mock the store using the shared mock logic
vi.mock('@paynless/store', async () => {
  const originalStoreModule = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const { useMockedAiStoreHookLogic } = await vi.importActual<typeof import('../../mocks/aiStore.mock')>('../../mocks/aiStore.mock');
  
  const mockTrackEvent = vi.fn();
  const mockGetStateAnalytics = vi.fn(() => ({ trackEvent: mockTrackEvent }));

  return {
    ...originalStoreModule, 
    useAiStore: useMockedAiStoreHookLogic, 
    // selectCurrentChatMessages will be taken from originalStoreModule
    useAnalyticsStore: vi.fn(() => ({
      getState: mockGetStateAnalytics,
    })),
  };
});

// Define some default mock data that might be used across tests
const mockUserMessage: ChatMessageRow = { 
  id: 'user-msg-1',
  chat_id: 'chat-1',
  user_id: 'user-123',
  role: 'user',
  content: 'Hello from user',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  token_usage: null,
  ai_provider_id: null, 
  system_prompt_id: null, 
  is_active_in_thread: true,
  error_type: null,
  response_to_message_id: null,
};

const mockAssistantMessage: ChatMessageRow = { 
  id: 'assistant-msg-1',
  chat_id: 'chat-1',
  user_id: null, 
  role: 'assistant',
  content: 'Hello from assistant',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  token_usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  ai_provider_id: 'provider-1', 
  system_prompt_id: null, 
  is_active_in_thread: true,
  error_type: null,
  response_to_message_id: null,
};

let storeActions: AiStore;
let mockSendStreamingMessage: AiStore['sendStreamingMessage'];
let scrollToStub: ReturnType<typeof vi.fn>;

// Helper to get typed store state
const getMockedStoreState = (): AiStore => {
  return (useMockedAiStoreHookLogic).getState();
};

describe('AiChatbox', () => {
  beforeAll(async () => {
    storeActions = getMockedStoreState();
  });

  function AiChatboxTestRouter(props: { children: React.ReactNode }) {
    return <MemoryRouter>{props.children}</MemoryRouter>;
  }

  beforeEach(() => {
    vi.clearAllMocks(); 
    resetAiStoreMock(); 
    scrollToStub = vi.fn();
    window.scrollTo = scrollToStub;

    // Setup default state for most tests. Specific tests can override.
    const streamingImpl: AiStore['sendStreamingMessage'] = async () =>
      createSseConnectionStub();
    mockSendStreamingMessage = vi.fn(streamingImpl);
    mockSetState({ 
      messagesByChatId: {
        'chat-1': [mockUserMessage, { ...mockAssistantMessage, id: 'assistant-msg-default' }],
      },
      currentChatId: 'chat-1',
      isLoadingAiResponse: false,
      aiError: null,
      rewindTargetMessageId: null,
      sendStreamingMessage: mockSendStreamingMessage,
      availableProviders: [{
        id: 'provider-1', 
        name: 'Default Provider', 
        api_identifier: 'default-api', 
        provider: 'default', 
        is_active: true, 
        is_enabled: true, 
        config: {}, 
        created_at: new Date().toISOString(), 
        updated_at: new Date().toISOString(),
        description: 'A default provider',
        is_default_embedding: false,
        is_default_generation: false,
      }], 
      availablePrompts: [{id: 'prompt-1', name: 'Default Prompt', prompt_text: 'Default Content', created_at: new Date().toISOString(), is_active: true, updated_at: new Date().toISOString(), user_selectable: true, version: 1, description: 'A default prompt', document_template_id: null }],
      selectedProviderId: 'provider-1', 
      selectedPromptId: 'prompt-1',
    });
    storeActions = getMockedStoreState();
    
    vi.spyOn(storeActions, 'sendMessage').mockResolvedValue({ id: 'new-msg', role: 'assistant', content: 'response', created_at: new Date().toISOString(), error_type: null, is_active_in_thread: true, response_to_message_id: null, user_id: null, ai_provider_id: 'provider-1', chat_id: 'chat-1', system_prompt_id: 'prompt-1', token_usage: null, updated_at: new Date().toISOString() });
    vi.spyOn(storeActions, 'prepareRewind').mockImplementation((messageId: string, chatId: string) => {
      void chatId;
      act(() => {
        mockSetState({ rewindTargetMessageId: messageId }); 
      });
    });
    vi.spyOn(storeActions, 'cancelRewindPreparation').mockImplementation(() => {
      act(() => {
        mockSetState({ rewindTargetMessageId: null }); 
      });
    });
    vi.spyOn(storeActions, 'clearAiError').mockImplementation(() => {
      mockSetState({ aiError: null });
    });
  });

  const renderAiChatbox = (props: Partial<AiChatboxProps> = {}) => {
    return render(<AiChatbox {...props} />, { wrapper: AiChatboxTestRouter });
  };

  it('should render ChatMessageBubble for each message from the store', () => {
    renderAiChatbox();
    const state = getMockedStoreState(); 
    const expectedMessagesCount = state.messagesByChatId['chat-1']?.length || 0;
    expect(mockChatMessageBubble).toHaveBeenCalledTimes(expectedMessagesCount);
  });

  it('should pass the correct message prop to each ChatMessageBubble', () => {
    renderAiChatbox();
    const state = getMockedStoreState(); 
    const messagesForCurrentChat = state.messagesByChatId['chat-1'] || [];
    messagesForCurrentChat.forEach((msg: ChatMessage, index: number) => {
      expect(mockChatMessageBubble).toHaveBeenNthCalledWith(index + 1, 
        expect.objectContaining({ message: msg })
      );
    });
  });

  it('should pass onEditClick to ChatMessageBubble for user messages', () => {
    renderAiChatbox();
    const userMessageCall = mockChatMessageBubble.mock.calls.find(call => call[0].message.id === mockUserMessage.id);
    expect(userMessageCall).toBeDefined();
    if (userMessageCall) { 
      expect(userMessageCall[0]).toHaveProperty('onEditClick');
      expect(typeof userMessageCall[0].onEditClick).toBe('function');
    }
  });

  it('should not pass onEditClick to ChatMessageBubble for assistant messages', () => {
    renderAiChatbox();
    const assistantMessageCall = mockChatMessageBubble.mock.calls.find(call => call[0].message.id === 'assistant-msg-default');
    expect(assistantMessageCall).toBeDefined();
    if (assistantMessageCall) { 
      expect(assistantMessageCall[0].onEditClick === undefined || !Object.prototype.hasOwnProperty.call(assistantMessageCall[0], 'onEditClick')).toBe(true);
    }
  });

  it('should allow typing in the textarea', () => {
    renderAiChatbox();
    const textarea = screen.getByPlaceholderText(/Type your message here/i);
    fireEvent.change(textarea, { target: { value: 'Test input' } });
    expect(requireTextarea(textarea).value).toBe('Test input');
  });

  it('should call sendStreamingMessage with correct parameters when send button is clicked', async () => {
    renderAiChatbox();
    const textarea = screen.getByPlaceholderText(/Type your message here/i);
    const sendButton = screen.getByRole('button', { name: /Send/i });
    const testMessage = 'This is a test message';

    // Simulate typing
    await act(async () => {
      fireEvent.change(textarea, { target: { value: testMessage } });
    });

    // Wait for the button to become enabled
    await waitFor(() => expect(sendButton).toBeEnabled());

    // Click the send button
    await act(async () => {
      fireEvent.click(sendButton);
    });
    
    const { selectedProviderId, selectedPromptId, currentChatId } = getMockedStoreState();

    await waitFor(() => {
      expect(mockSendStreamingMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: testMessage,
          providerId: selectedProviderId, 
          promptId: selectedPromptId,     
          chatId: currentChatId, 
        }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  it('should clear input after sending a message', async () => {
    renderAiChatbox();
    const textarea = screen.getByPlaceholderText(/Type your message here/i);
    const sendButton = screen.getByRole('button', { name: /Send/i });

    // Simulate typing
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Another message' } });
    });
    expect(requireTextarea(textarea).value).toBe('Another message'); 
    
    // Wait for the button to become enabled
    await waitFor(() => expect(sendButton).toBeEnabled());

    // Click the send button
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(mockSendStreamingMessage).toHaveBeenCalled(); 
    });
    expect(requireTextarea(textarea).value).toBe('');
  });

  it('should disable send button and input when isLoadingAiResponse is true', () => {
    mockSetState({ isLoadingAiResponse: true }); 
    renderAiChatbox();
    const textarea = screen.getByPlaceholderText(/Type your message here/i); 
    const sendButton = screen.getByRole('button', { name: /Send/i }); 
    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });

  it('should display an error message when aiError is present', () => {
    const errorMessage = 'Something went wrong!';
    mockSetState({ aiError: errorMessage }); 
    renderAiChatbox();
    // Check that the specific error alert container is present and contains the message
    const errorAlert = screen.getByTestId('ai-error-alert');
    expect(errorAlert).toBeInTheDocument();
    expect(within(errorAlert).getByText(errorMessage)).toBeInTheDocument();
  });

  it('should display loading indicator when isLoadingAiResponse is true', () => {
    mockSetState({ isLoadingAiResponse: true }); 
    renderAiChatbox();
    expect(screen.getByText(/Assistant is thinking/i)).toBeInTheDocument();
  });

  it('should clear AI error when sending a new message', async () => {
    mockSetState({ aiError: 'Previous error!' }); 
    renderAiChatbox();
    // Check specific alert for initial error
    const initialErrorAlert = screen.getByTestId('ai-error-alert');
    expect(initialErrorAlert).toBeInTheDocument();
    expect(within(initialErrorAlert).getByText('Previous error!')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/Type your message here/i);
    const sendButton = screen.getByRole('button', { name: /Send/i });
    
    // Simulate typing
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'New message' } });
    });

    // Wait for the button to become enabled
    await waitFor(() => expect(sendButton).toBeEnabled());
    
    // Click the send button
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(storeActions.clearAiError).toHaveBeenCalledTimes(1);
    });
    // After clearing, the alert should not be present
    expect(screen.queryByTestId('ai-error-alert')).not.toBeInTheDocument();
  });

  it('should not send message if providerId is null', async () => {
    mockSetState({ selectedProviderId: null }); 
    renderAiChatbox(); 

    const textarea = screen.getByPlaceholderText(/Type your message here/i);
    const sendButton = screen.getByRole('button', { name: /Send/i });
    const testMessage = 'Attempt to send with null providerId';

    fireEvent.change(textarea, { target: { value: testMessage } });
    await act(async () => {
      fireEvent.click(sendButton);
    });
    
    expect(mockSendStreamingMessage).not.toHaveBeenCalled();
    expect(requireTextarea(textarea).value).toBe(testMessage);
  });

  describe('Rewind Functionality', () => {
    const mockUserMessageToEdit: ChatMessageRow = { 
      id: 'user-msg-to-edit-rewind',
      chat_id: 'chat-1-rewind',
      user_id: 'user-123-rewind',
      role: 'user',
      content: 'This is the original message to edit for rewind.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      token_usage: null, 
      ai_provider_id: null, 
      system_prompt_id: null, 
      is_active_in_thread: true,
      error_type: null,
      response_to_message_id: null,
    };

    beforeEach(() => {
      mockSetState({ 
        messagesByChatId: {
          'chat-1-rewind': [mockUserMessageToEdit, { ...mockAssistantMessage, id: 'assistant-rewind-1' }],
        },
        currentChatId: 'chat-1-rewind',
        rewindTargetMessageId: null,
        selectedProviderId: 'provider-rewind-1', 
        selectedPromptId: 'prompt-rewind-1',
        availableProviders: [{
          id: 'provider-rewind-1',
          name: 'Rewind Provider',
          api_identifier: 'rewind-api',
          provider: 'default',
          is_active: true,
          is_enabled: true,
          config: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          description: 'Rewind test provider',
          is_default_embedding: false,
          is_default_generation: false,
        }],
        availablePrompts: [{ id: 'prompt-rewind-1', name: 'Rewind Prompt', prompt_text: 'Rewind', created_at: new Date().toISOString(), is_active: true, updated_at: new Date().toISOString(), user_selectable: true, version: 1, description: 'A rewind prompt', document_template_id: null } ],
      });
      storeActions = getMockedStoreState();
      vi.spyOn(storeActions, 'sendMessage').mockResolvedValue({ id: 'new-msg', role: 'assistant', content: 'response', created_at: new Date().toISOString(), error_type: null, is_active_in_thread: true, response_to_message_id: null, user_id: null, ai_provider_id: 'provider-rewind-1', chat_id: 'chat-1-rewind', system_prompt_id: 'prompt-rewind-1', token_usage: null, updated_at: new Date().toISOString() });
      vi.spyOn(storeActions, 'prepareRewind').mockImplementation((messageId: string, chatId: string) => { 
        void chatId;
        act(() => {
          mockSetState({ rewindTargetMessageId: messageId }); 
        });
      });
      vi.spyOn(storeActions, 'cancelRewindPreparation').mockImplementation(() => {
        act(() => {
          mockSetState({ rewindTargetMessageId: null }); 
        });
      });
    });

    const triggerEditOnUserMessageViaBubble = async (
      message: ChatMessage,
      rerender: (ui: React.ReactElement) => void,
    ) => {
      let userBubbleProps: { message: ChatMessage; onEditClick?: (id: string, content: string) => void; } | undefined; 
      const calls = mockChatMessageBubble.mock.calls;
      for (const call of calls) {
        if (call[0].message.id === message.id) {
          userBubbleProps = call[0];
          break;
        }
      }

      if (userBubbleProps && userBubbleProps.onEditClick) {
        await act(async () => {
          if (userBubbleProps.onEditClick) userBubbleProps.onEditClick(message.id, message.content);
        });
        await act(async () => {
          rerender(<AiChatbox />);
        });
      } else {
        throw new Error(`Could not find user message bubble for ID ${message.id} or its onEditClick prop. Target ID: ${message.id}`);
      }
    };

    it('should initiate rewind mode when onEditClick is called from ChatMessageBubble', async () => {
      const { rerender } = renderAiChatbox(); 
      await triggerEditOnUserMessageViaBubble(mockUserMessageToEdit, rerender);

      expect(storeActions.prepareRewind).toHaveBeenCalledTimes(1);
      expect(storeActions.prepareRewind).toHaveBeenCalledWith(mockUserMessageToEdit.id, 'chat-1-rewind');
      
      // Wait for the textarea placeholder to change, indicating ChatInput has updated based on store state
      const textarea = await screen.findByPlaceholderText('Edit your message...', {}, { timeout: 3000 });
      expect(textarea).toBeInTheDocument(); // Ensure it's found
      expect(requireTextarea(textarea).value).toBe(mockUserMessageToEdit.content);

      expect(screen.getByRole('button', { name: /Resubmit/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Send/i })).not.toBeInTheDocument();
    });

    it('should cancel rewind mode when Cancel button is clicked', async () => {
      // Set rewindTargetMessageId directly in store for this test setup
      act(() => {
        mockSetState({ 
          rewindTargetMessageId: mockUserMessageToEdit.id,
          messagesByChatId: { 'chat-1-rewind': [mockUserMessageToEdit] }, 
          currentChatId: 'chat-1-rewind', 
        });
      });
      
      renderAiChatbox();
      
      const textarea = screen.getByPlaceholderText('Edit your message...');
      // Manually set the textarea value as handleEditClick would do in a full flow,
      // or as it might be if rewind was initiated and then component re-rendered.
      fireEvent.change(textarea, { target: { value: mockUserMessageToEdit.content } });


      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await act(async () => {
        fireEvent.click(cancelButton);
      });

      expect(storeActions.cancelRewindPreparation).toHaveBeenCalledTimes(1);
      
      const revertedTextarea = await screen.findByPlaceholderText(/Type your message here/i, {}, {timeout: 3000});
      expect(requireTextarea(revertedTextarea).value).toBe('');

      expect(screen.getByRole('button', { name: /Send/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Resubmit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
    });

    it('should call sendMessage and then cancelRewindPreparation when Resubmit is clicked', async () => {
      const { rerender } = renderAiChatbox(); 
      await triggerEditOnUserMessageViaBubble(mockUserMessageToEdit, rerender);

      // Wait for rewind mode to be active by checking for the placeholder
      const textarea = await screen.findByPlaceholderText('Edit your message...', {}, { timeout: 3000 });
      expect(textarea).toBeInTheDocument(); // Ensure it's found before proceeding

      const editedContent = 'This is the EDITED message for resubmission.';
      await act(async () => {
        fireEvent.change(textarea, { target: { value: editedContent } });
      });
      
      const resubmitButton = screen.getByRole('button', { name: /Resubmit/i });
      
      // Wait for the resubmit button to be enabled (it should be by default if input is not empty)
      await waitFor(() => expect(resubmitButton).toBeEnabled());
      
      await act(async () => {
        fireEvent.click(resubmitButton);
      });

      const { selectedProviderId, selectedPromptId, currentChatId } = getMockedStoreState();

      await waitFor(() => {
        expect(storeActions.sendMessage).toHaveBeenCalledWith({
          message: editedContent,
          providerId: selectedProviderId, 
          promptId: selectedPromptId,     
          chatId: currentChatId,
          contextMessages: [
            { role: ChatRole.USER, content: mockUserMessageToEdit.content },
            { role: ChatRole.ASSISTANT, content: mockAssistantMessage.content },
          ],
        });
      });

      await waitFor(() => {
        expect(storeActions.cancelRewindPreparation).toHaveBeenCalledTimes(1);
      });
      
      expect(getMockedStoreState().rewindTargetMessageId).toBeNull(); 

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type your message here/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Send/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Resubmit/i })).not.toBeInTheDocument();
    });

    it('should handle standard send correctly when not in rewind mode', async () => {
      mockSetState({ rewindTargetMessageId: null }); 
      renderAiChatbox(); 
      
      const textarea = screen.getByPlaceholderText(/Type your message here/i);
      const sendButton = screen.getByRole('button', { name: /Send/i });
      const testMessage = 'Standard test message, not a rewind.';

      // Simulate typing
      await act(async () => {
        fireEvent.change(textarea, { target: { value: testMessage } });
      });
      // Wait for the button to become enabled
      await waitFor(() => expect(sendButton).toBeEnabled());
      // Click the send button
      await act(async () => {
        fireEvent.click(sendButton);
      });

      const { selectedProviderId, selectedPromptId, currentChatId } = getMockedStoreState();

      await waitFor(() => {
        expect(mockSendStreamingMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            message: testMessage,
            providerId: selectedProviderId, 
            promptId: selectedPromptId,     
            chatId: currentChatId, 
          }),
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
      });
      expect(storeActions.cancelRewindPreparation).not.toHaveBeenCalled();
    });
  });

  describe('Auto-scroll functionality', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockSetState({
        selectedProviderId: 'p-scroll',
        selectedPromptId: 'pr-scroll',
      });
      storeActions = getMockedStoreState();
    });

    afterEach(() => {
      vi.useRealTimers();
    });
    
    it('should scroll the window when new assistant messages arrive', async () => {
      const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
      const initialMessages: ChatMessageRow[] = [mockUserMessage]; 
      const chatIdScrollTest = 'chat-scroll-test';
      mockSetState({ 
        messagesByChatId: { [chatIdScrollTest]: initialMessages },
        currentChatId: chatIdScrollTest,
        selectedProviderId: 'p-scroll', 
        selectedPromptId: 'pr-scroll',
      });

      const { rerender } = renderAiChatbox(); 

      const newAssistantMessageForScroll: ChatMessageRow = { ...mockAssistantMessage, id: 'new-assistant-scroll', chat_id: chatIdScrollTest }; 
      await act(async () => {
        mockSetState({ 
            messagesByChatId: { 
                [chatIdScrollTest]: [...initialMessages, newAssistantMessageForScroll] 
            }
        });
      });
      rerender(<AiChatbox />); 

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
    });
  });

  it('should render MessageSelectionControls', () => {
    renderAiChatbox();
    // The Checkbox component renders a button with role="checkbox"
    // and an associated label. We find the checkbox via its label.
    expect(screen.getByLabelText(/(Select All|Deselect All)/i)).toBeInTheDocument();
  });

});
