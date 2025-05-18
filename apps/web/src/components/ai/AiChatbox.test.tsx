import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AiChatbox, AiChatboxProps } from './AiChatbox';
import { vi } from 'vitest';
import { ChatMessage, AiProvider, SystemPrompt, ChatMessageRow, AiStore, TokenUsage, Json } from '@paynless/types';

// Import the shared mock utilities
import { 
  mockedUseAiStoreHookLogic, 
  mockSetState,
  resetAiStoreMock,
  // Access action spies via the initial state or exported spies from the mock file
  // For example, if sendMessage is vi.fn() on the initial state of the mock:
  // let mockSendMessage; (will be assigned from the store mock state)
} from '../../mocks/aiStore.mock'; // Adjusted path

// Import missing store items
import { useAiStore, selectCurrentChatMessages } from '@paynless/store';


// Mock ChatMessageBubble
const mockChatMessageBubble = vi.fn((props: { message: ChatMessage; onEditClick?: (id: string, content: string) => void; }) => <div data-testid={`mock-bubble-${props.message.id}`} />); 
vi.mock('./ChatMessageBubble', () => ({
  ChatMessageBubble: (props: { message: ChatMessage; onEditClick?: (id: string, content: string) => void; }) => mockChatMessageBubble(props), 
}));

// Mock CurrentMessageTokenEstimator (New)
interface MockCurrentMessageTokenEstimatorProps { // Renamed to avoid conflict if imported
  textInput: string;
}
const mockCurrentMessageTokenEstimator = vi.fn((props: MockCurrentMessageTokenEstimatorProps) => (
  <div data-testid="mock-current-message-token-estimator">Est. tokens for: {props.textInput}</div>
));
vi.mock('./CurrentMessageTokenEstimator', () => ({
  CurrentMessageTokenEstimator: (props: MockCurrentMessageTokenEstimatorProps) => mockCurrentMessageTokenEstimator(props),
}));

// Mock the store using the shared mock logic
vi.mock('@paynless/store', async (importOriginal) => {
  const originalModule = await importOriginal() as { useAiStore: typeof useAiStore; selectCurrentChatMessages: typeof selectCurrentChatMessages }; 
  // Prepare mock for useAnalyticsStore
  const mockTrackEvent = vi.fn();
  const mockGetStateAnalytics = vi.fn(() => ({ trackEvent: mockTrackEvent }));

  return {
    ...originalModule,
    useAiStore: (selector: (state: AiStore) => unknown) => mockedUseAiStoreHookLogic(selector as unknown as (state: AiStore) => unknown), 
    selectCurrentChatMessages: originalModule.selectCurrentChatMessages, 
    useAnalyticsStore: vi.fn(() => ({ // Add mock for useAnalyticsStore
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
};

const mockAssistantMessage: ChatMessageRow = { 
  id: 'assistant-msg-1',
  chat_id: 'chat-1',
  user_id: null, 
  role: 'assistant',
  content: 'Hello from assistant',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  token_usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } as unknown as Json,
  ai_provider_id: 'provider-1', 
  system_prompt_id: null, 
  is_active_in_thread: true,
};

let storeActions: AiStore; 

// Helper to get typed store state
const getMockedStoreState = (): AiStore => {
  return (mockedUseAiStoreHookLogic as typeof useAiStore).getState();
};

describe('AiChatbox', () => {
  beforeAll(async () => {
    storeActions = getMockedStoreState();
  });

  beforeEach(() => {
    vi.clearAllMocks(); 
    resetAiStoreMock(); 
    storeActions = getMockedStoreState(); // Get fresh actions AFTER reset

    // Setup default state for most tests. Specific tests can override.
    mockSetState({ 
      messagesByChatId: {
        'chat-1': [mockUserMessage, { ...mockAssistantMessage, id: 'assistant-msg-default' }],
      },
      currentChatId: 'chat-1',
      isLoadingAiResponse: false,
      aiError: null,
      rewindTargetMessageId: null,
      // Corrected AiProvider mock based on typical DB structure, might need further adjustment if db.types.ts reveals more specific non-nullable fields
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
        description: 'A default provider'
        // Ensure all non-nullable fields from Database['public']['Tables']['ai_providers']['Row'] are present
      } as AiProvider], 
      availablePrompts: [{id: 'prompt-1', name: 'Default Prompt', prompt_text: 'Default Content', created_at: new Date().toISOString(), is_active: true, updated_at: new Date().toISOString(), user_id: null, is_public: false } as SystemPrompt],
      selectedProviderId: 'provider-1', 
      selectedPromptId: 'prompt-1',
    });
    
    vi.spyOn(storeActions, 'sendMessage').mockResolvedValue({ id: 'new-msg', role: 'assistant', content: 'response' } as ChatMessage);
    vi.spyOn(storeActions, 'prepareRewind').mockImplementation((messageId: string, _chatId: string) => { // _chatId is intentionally unused in mock
      act(() => {
        mockSetState({ rewindTargetMessageId: messageId }); 
      });
    });
    vi.spyOn(storeActions, 'cancelRewindPreparation').mockImplementation(() => {
      act(() => {
        mockSetState({ rewindTargetMessageId: null }); 
      });
    });
    vi.spyOn(storeActions, 'clearAiError').mockClear(); 
  });

  const renderAiChatbox = (props: Partial<AiChatboxProps> = {}) => {
    return render(<AiChatbox {...props} />); 
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
    const textarea = screen.getByPlaceholderText(/Type your message here/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Test input' } });
    expect(textarea.value).toBe('Test input');
  });

  it('should call sendMessage with correct parameters when send button is clicked', async () => {
    renderAiChatbox();
    const textarea = screen.getByPlaceholderText(/Type your message here/i);
    const sendButton = screen.getByRole('button', { name: /Send/i });
    const testMessage = 'This is a test message';

    fireEvent.change(textarea, { target: { value: testMessage } });
    await act(async () => {
      fireEvent.click(sendButton);
    });
    
    const { selectedProviderId, selectedPromptId, currentChatId } = getMockedStoreState();

    await waitFor(() => {
      expect(storeActions.sendMessage).toHaveBeenCalledWith({
        message: testMessage,
        providerId: selectedProviderId, 
        promptId: selectedPromptId,     
        chatId: currentChatId, 
      });
    });
  });

  it('should clear input after sending a message', async () => {
    renderAiChatbox();
    const textarea = screen.getByPlaceholderText(/Type your message here/i) as HTMLTextAreaElement;
    const sendButton = screen.getByRole('button', { name: /Send/i });

    fireEvent.change(textarea, { target: { value: 'Another message' } });
    expect(textarea.value).toBe('Another message');
    
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(storeActions.sendMessage).toHaveBeenCalled(); 
    });
    expect(textarea.value).toBe('');
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
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should display loading indicator when isLoadingAiResponse is true', () => {
    mockSetState({ isLoadingAiResponse: true }); 
    renderAiChatbox();
    expect(screen.getByText(/Assistant is thinking/i)).toBeInTheDocument();
  });

  it('should clear AI error when sending a new message', async () => {
    mockSetState({ aiError: 'Previous error!' }); 
    renderAiChatbox();
    expect(screen.getByText('Previous error!')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/Type your message here/i);
    const sendButton = screen.getByRole('button', { name: /Send/i });
    
    fireEvent.change(textarea, { target: { value: 'New message' } });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    expect(storeActions.clearAiError).toHaveBeenCalledTimes(1);
  });

  it('should not send message if providerId is null', async () => {
    mockSetState({ selectedProviderId: null }); 
    renderAiChatbox(); 

    const textarea = screen.getByPlaceholderText(/Type your message here/i) as HTMLTextAreaElement;
    const sendButton = screen.getByRole('button', { name: /Send/i });
    const testMessage = 'Attempt to send with null providerId';

    fireEvent.change(textarea, { target: { value: testMessage } });
    await act(async () => {
      fireEvent.click(sendButton);
    });
    
    expect(storeActions.sendMessage).not.toHaveBeenCalled();
    expect(textarea.value).toBe(testMessage);
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
      });
      storeActions = getMockedStoreState();
      vi.spyOn(storeActions, 'sendMessage').mockResolvedValue({ id: 'new-msg', role: 'assistant', content: 'response' } as ChatMessage);
      vi.spyOn(storeActions, 'prepareRewind').mockImplementation((messageId: string, _chatId: string) => { 
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

    const triggerEditOnUserMessageViaBubble = async (message: ChatMessage) => {
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
          // Ensure onEditClick is not undefined before calling
          if(userBubbleProps.onEditClick) userBubbleProps.onEditClick(message.id, message.content);
        });
      } else {
        console.log('ChatMessageBubble mock calls during triggerEdit:', JSON.stringify(calls.map(c => c[0].message.id)));
        throw new Error(`Could not find user message bubble for ID ${message.id} or its onEditClick prop. Target ID: ${message.id}`);
      }
    };

    it('should initiate rewind mode when onEditClick is called from ChatMessageBubble', async () => {
      renderAiChatbox(); 
      await triggerEditOnUserMessageViaBubble(mockUserMessageToEdit);

      expect(storeActions.prepareRewind).toHaveBeenCalledTimes(1);
      expect(storeActions.prepareRewind).toHaveBeenCalledWith(mockUserMessageToEdit.id, 'chat-1-rewind');
      
      const textarea = await screen.findByPlaceholderText('Edit your message...', {}, { timeout: 3000 }) as HTMLTextAreaElement;
      expect(textarea.value).toBe(mockUserMessageToEdit.content);

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
      
      const textarea = screen.getByPlaceholderText('Edit your message...') as HTMLTextAreaElement;
      // Manually set the textarea value as handleEditClick would do in a full flow,
      // or as it might be if rewind was initiated and then component re-rendered.
      fireEvent.change(textarea, { target: { value: mockUserMessageToEdit.content } });


      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await act(async () => {
        fireEvent.click(cancelButton);
      });

      expect(storeActions.cancelRewindPreparation).toHaveBeenCalledTimes(1);
      
      const revertedTextarea = await screen.findByPlaceholderText(/Type your message here/i, {}, {timeout: 3000}) as HTMLTextAreaElement;
      expect(revertedTextarea.value).toBe('');

      expect(screen.getByRole('button', { name: /Send/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Resubmit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
    });

    it('should call sendMessage and then cancelRewindPreparation when Resubmit is clicked', async () => {
      renderAiChatbox(); 
      await triggerEditOnUserMessageViaBubble(mockUserMessageToEdit);

      const editedContent = 'This is the EDITED message for resubmission.';
      const textarea = screen.getByPlaceholderText('Edit your message...') as HTMLTextAreaElement;
      
      await act(async () => {
        fireEvent.change(textarea, { target: { value: editedContent } });
      });
      
      const resubmitButton = screen.getByRole('button', { name: /Resubmit/i });
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
      
      const textarea = screen.getByPlaceholderText(/Type your message here/i) as HTMLTextAreaElement;
      const sendButton = screen.getByRole('button', { name: /Send/i });
      const testMessage = 'Standard test message, not a rewind.';

      await act(async () => {
        fireEvent.change(textarea, { target: { value: testMessage } });
        fireEvent.click(sendButton);
      });

      const { selectedProviderId, selectedPromptId, currentChatId } = getMockedStoreState();

      await waitFor(() => {
        expect(storeActions.sendMessage).toHaveBeenCalledWith({
          message: testMessage,
          providerId: selectedProviderId, 
          promptId: selectedPromptId,     
          chatId: currentChatId, 
        });
      });
      expect(storeActions.cancelRewindPreparation).not.toHaveBeenCalled();
    });
  });

  describe('Auto-scroll functionality', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockSetState({
        selectedProviderId: 'p-scroll',
        selectedPromptId: 'pr-scroll',
      });
      storeActions = getMockedStoreState();
    });

    afterEach(() => {
      vi.useRealTimers();
    });
    
    it('should attempt to scroll for new assistant messages', async () => {
      const initialMessages: ChatMessageRow[] = [mockUserMessage]; 
      const chatIdScrollTest = 'chat-scroll-test';
      mockSetState({ 
        messagesByChatId: { [chatIdScrollTest]: initialMessages },
        currentChatId: chatIdScrollTest,
        selectedProviderId: 'p-scroll', 
        selectedPromptId: 'pr-scroll',
      });

      const { rerender } = renderAiChatbox(); 

      const mockScrollElement = {
        scrollTop: 0,
        offsetTop: 50,
        querySelectorAll: vi.fn().mockImplementation((selector: string) => { 
          if (selector === '[data-message-id]') {
            const state = getMockedStoreState(); 
            const currentMessagesForScroll = state.messagesByChatId[chatIdScrollTest] || [];
            if (currentMessagesForScroll.find((m: ChatMessage) => m.id === 'new-assistant-scroll')) {
              return [
                { offsetTop: 100, getAttribute: vi.fn().mockReturnValue(mockUserMessage.id) },
                { offsetTop: 200, getAttribute: vi.fn().mockReturnValue('new-assistant-scroll') },
              ];
            }
          }
          return [];
        }),
      };
      const mockUseRefSpy = vi.spyOn(React, 'useRef');
      mockUseRefSpy.mockImplementationOnce(() => ({ current: mockScrollElement }));

      let rAFCallback: FrameRequestCallback | null = null;
      const mockRAF = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rAFCallback = cb;
        return 0;
      });

      const newAssistantMessageForScroll: ChatMessageRow = { ...mockAssistantMessage, id: 'new-assistant-scroll', chat_id: chatIdScrollTest }; 
      await act(async () => {
        mockSetState({ 
            messagesByChatId: { 
                [chatIdScrollTest]: [...initialMessages, newAssistantMessageForScroll] 
            }
        });
      });
      rerender(<AiChatbox />); 

      await act(async () => {});

      await act(async () => {
        vi.runAllTimers(); 
      });

      await waitFor(() => expect(mockRAF).toHaveBeenCalled()); 

      if (rAFCallback) {
        await act(async () => {
        if(rAFCallback) rAFCallback(performance.now()); 
        });
      } else {
        console.error("AiChatbox.test.tsx: rAFCallback was not set, requestAnimationFrame mock might not have captured the callback or rAF was not called.");
      }
      
      await waitFor(() => {
      expect(mockScrollElement.querySelectorAll).toHaveBeenCalledWith('[data-message-id]');
      }, {timeout: 1000}); 
      
      if (mockScrollElement.querySelectorAll.mock.calls.length > 0) { 
        await waitFor(() => {
            expect(mockRAF).toHaveBeenCalled();
        });
      }
      
      mockUseRefSpy.mockRestore();
      mockRAF.mockRestore();
    }, 3000); 
  });

  it('should render MessageSelectionControls', () => {
    renderAiChatbox();
    expect(screen.queryByRole('button', { name: /(Select All|Deselect All)/i })).toBeInTheDocument();
  });

  it('should display the current message token estimator and pass input to it', () => {
    renderAiChatbox();
    const textarea = screen.getByPlaceholderText(/Type your message here/i) as HTMLTextAreaElement;

    // Initial render, estimator should be present
    expect(mockCurrentMessageTokenEstimator).toHaveBeenCalled();
    // Initial input is empty, so textInput prop should be empty
    expect(mockCurrentMessageTokenEstimator).toHaveBeenLastCalledWith(expect.objectContaining({ textInput: '' }));

    // Simulate typing in the textarea
    fireEvent.change(textarea, { target: { value: 'Hello estimator' } });

    // Estimator should be called again with the new text
    // Due to potential debouncing or async updates in the actual hook, we might need waitFor if it was real.
    // But for a direct prop pass in AiChatbox, it should be synchronous.
    expect(mockCurrentMessageTokenEstimator).toHaveBeenLastCalledWith(expect.objectContaining({ textInput: 'Hello estimator' }));

    // Check the mock's output (optional, but good for verifying the mock itself is working as expected in tests)
    expect(screen.getByTestId('mock-current-message-token-estimator')).toHaveTextContent('Est. tokens for: Hello estimator');

    // Simulate clearing the textarea
    fireEvent.change(textarea, { target: { value: '' } });
    expect(mockCurrentMessageTokenEstimator).toHaveBeenLastCalledWith(expect.objectContaining({ textInput: '' }));
  });

  // Test for scrolling behavior
  describe('Scrolling Behavior', () => {
    // ... existing code ...
  });
});
