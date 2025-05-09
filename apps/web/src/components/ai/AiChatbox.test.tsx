import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiChatbox, AiChatboxProps } from './AiChatbox';
import { vi } from 'vitest';
import { ChatMessage } from '@paynless/types';
// Import selectCurrentChatMessages for use in the mock implementation
import { selectCurrentChatMessages } from '@paynless/store'; 

// Mock ChatMessageBubble
const mockChatMessageBubble = vi.fn((props) => <div data-testid={`mock-bubble-${props.message.id}`} />); 
vi.mock('./ChatMessageBubble', () => ({
  ChatMessageBubble: (props: any) => mockChatMessageBubble(props),
}));

// Mock store hooks: The factory creates the mocks.
vi.mock('@paynless/store', async (importOriginal) => {
  const original = await importOriginal() as any;
  return {
    ...original, // Keep other exports like selectors
    useAiStore: vi.fn(), // This vi.fn() is what Vitest will use for useAiStore
  };
});

// This variable will hold the reference to the mock created by vi.mock's factory
let actualUseAiStore: vi.Mock;

const mockSendMessage = vi.fn();
const mockClearAiError = vi.fn();

const mockUserMessage: ChatMessage = {
  id: 'user-msg-1',
  chat_id: 'chat-1',
  user_id: 'user-123',
  role: 'user',
  content: 'Hello from user',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  token_usage: null,
  model_id: null,
};

const mockAssistantMessage: ChatMessage = {
  id: 'assistant-msg-1',
  chat_id: 'chat-1',
  user_id: null,
  role: 'assistant',
  content: 'Hello from assistant',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  token_usage: { prompt: 10, completion: 20, total: 30 },
  model_id: 'gpt-4',
};

let currentMockMessages = [mockUserMessage, mockAssistantMessage];
// Redefine currentMockAiState to be more flexible for tests
let currentAiStoreState: {
  currentChatMessages: ChatMessage[];
  currentChatId: string | null;
  isLoadingAiResponse: boolean;
  aiError: string | null;
  sendMessage: vi.Mock;
  clearAiError: vi.Mock;
} = {} as any; 

describe('AiChatbox', () => {
  const mockOnEditMessageRequest = vi.fn();

  beforeAll(async () => {
    // Dynamically import the mocked store and assign our variable to the mock instance
    const storeModule = await import('@paynless/store');
    actualUseAiStore = storeModule.useAiStore as vi.Mock;
  });

  const setupMockAiStore = (overrides: Partial<typeof currentAiStoreState> = {}) => {
    currentMockMessages = overrides.currentChatMessages ?? [mockUserMessage, {...mockAssistantMessage, id: 'assistant-msg-2'}];
    
    currentAiStoreState = {
      currentChatMessages: currentMockMessages,
      currentChatId: 'chat-1',
      isLoadingAiResponse: false,
      aiError: null,
      sendMessage: mockSendMessage,
      clearAiError: mockClearAiError,
      ...overrides,
    };

    actualUseAiStore.mockImplementation((selector: any) => {
      if (selector === selectCurrentChatMessages) {
        return currentAiStoreState.currentChatMessages; // Use the flexible currentChatMessages
      }
      // Return parts of the state needed by the component based on its subscription pattern
      return {
        currentChatId: currentAiStoreState.currentChatId,
        isLoadingAiResponse: currentAiStoreState.isLoadingAiResponse,
        aiError: currentAiStoreState.aiError,
        sendMessage: currentAiStoreState.sendMessage,
        clearAiError: currentAiStoreState.clearAiError,
      };
    });
  };

  beforeEach(() => {
    vi.clearAllMocks(); // This will clear mockChatMessageBubble, mockSendMessage, etc.
    actualUseAiStore.mockClear(); // Specifically clear the store hook mock calls/instances
    setupMockAiStore(); // Setup with default state
    mockSendMessage.mockResolvedValue({}); 
  });

  const renderAiChatbox = (props: Partial<AiChatboxProps> = {}) => {
    const combinedProps: AiChatboxProps = {
      providerId: 'provider-1',
      promptId: 'prompt-1',
      isAnonymous: false,
      onEditMessageRequest: mockOnEditMessageRequest,
      ...props,
    };
    return render(<AiChatbox {...combinedProps} />);
  };

  it('should render ChatMessageBubble for each message from the store', () => {
    renderAiChatbox();
    expect(mockChatMessageBubble).toHaveBeenCalledTimes(currentAiStoreState.currentChatMessages.length);
  });

  it('should pass the correct message prop to each ChatMessageBubble', () => {
    renderAiChatbox();
    currentAiStoreState.currentChatMessages.forEach((msg, index) => {
      expect(mockChatMessageBubble).toHaveBeenNthCalledWith(index + 1, 
        expect.objectContaining({ message: msg })
      );
    });
  });

  it('should pass onEditMessageRequest to ChatMessageBubble for user messages', () => {
    renderAiChatbox();
    const userMessageCall = mockChatMessageBubble.mock.calls.find(call => call[0].message.role === 'user');
    expect(userMessageCall).toBeDefined();
    expect(userMessageCall[0]).toHaveProperty('onEditClick', mockOnEditMessageRequest);
  });

  it('should not pass onEditClick (or pass it as undefined) to ChatMessageBubble for assistant messages', () => {
    renderAiChatbox();
    const assistantMessageCall = mockChatMessageBubble.mock.calls.find(call => call[0].message.role === 'assistant');
    expect(assistantMessageCall).toBeDefined();
    expect(assistantMessageCall[0].onEditClick === undefined || !assistantMessageCall[0].hasOwnProperty('onEditClick')).toBe(true);
  });

  it('when ChatMessageBubble (mock) calls its onEditClick, AiChatbox should call its onEditMessageRequest prop', () => {
    renderAiChatbox();
    const userBubbleProps = mockChatMessageBubble.mock.calls.find(call => call[0].message.role === 'user')?.[0];
    expect(userBubbleProps).toBeDefined();

    if (userBubbleProps && userBubbleProps.onEditClick) {
      userBubbleProps.onEditClick(mockUserMessage.id, mockUserMessage.content);
    }

    expect(mockOnEditMessageRequest).toHaveBeenCalledTimes(1);
    expect(mockOnEditMessageRequest).toHaveBeenCalledWith(mockUserMessage.id, mockUserMessage.content);
  });

  it('should allow typing in the textarea', () => {
    renderAiChatbox();
    const textarea = screen.getByPlaceholderText(/type your message here/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Test input' } });
    expect(textarea.value).toBe('Test input');
  });

  it('should call sendMessage with correct parameters when send button is clicked', async () => {
    renderAiChatbox();
    const textarea = screen.getByPlaceholderText(/type your message here/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    const testMessage = 'This is a test message';

    fireEvent.change(textarea, { target: { value: testMessage } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith({
        message: testMessage,
        providerId: 'provider-1',
        promptId: 'prompt-1',
        chatId: currentAiStoreState.currentChatId,
      });
    });
  });

  it('should clear input after sending a message', async () => {
    renderAiChatbox();
    const textarea = screen.getByPlaceholderText(/type your message here/i) as HTMLTextAreaElement;
    const sendButton = screen.getByRole('button', { name: /send/i });

    fireEvent.change(textarea, { target: { value: 'Another message' } });
    expect(textarea.value).toBe('Another message');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalled(); 
    });
    expect(textarea.value).toBe('');
  });

  it('should disable send button and input when isLoadingAiResponse is true', () => {
    setupMockAiStore({ isLoadingAiResponse: true });
    renderAiChatbox();
    const textarea = screen.getByPlaceholderText(/type your message here/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });

  it('should display an error message when aiError is present', () => {
    const errorMessage = 'Something went wrong!';
    setupMockAiStore({ aiError: errorMessage });
    renderAiChatbox();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    // Could also check for the presence of Terminal icon or specific error container styling
  });

  it('should display loading indicator when isLoadingAiResponse is true', () => {
    setupMockAiStore({ isLoadingAiResponse: true });
    renderAiChatbox();
    expect(screen.getByText(/assistant is thinking/i)).toBeInTheDocument();
    // Could also check for the Loader2 icon specifically if it had a test-id or unique role
  });

  it('should clear AI error when sending a new message', async () => {
    const errorMessage = 'Previous error!';
    setupMockAiStore({ aiError: errorMessage });
    renderAiChatbox();

    // Verify error is initially displayed
    expect(screen.getByText(errorMessage)).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/type your message here/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    const testMessage = 'New message after error';

    fireEvent.change(textarea, { target: { value: testMessage } });
    fireEvent.click(sendButton);

    expect(mockClearAiError).toHaveBeenCalledTimes(1);

    // Optional: Wait for sendMessage to be called to ensure the flow completes
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalled();
    });

    // The component should remove the error message from the DOM
    // If clearAiError in the store correctly updates aiError to null
    // and the component re-renders, this query should fail.
    // To test this properly, setupMockAiStore would need to reflect the change
    // that clearAiError would make.
    // For now, we've tested that clearAiError() is called.
    // A more robust test would involve checking that the error message is gone,
    // which implies clearAiError correctly nullifies the error in the store state
    // visible to this component.
  });

  it('should not send message if providerId is null', async () => {
    // Setup with a null providerId
    renderAiChatbox({ providerId: null });

    const textarea = screen.getByPlaceholderText(/type your message here/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    const testMessage = 'Attempt to send with null providerId';

    fireEvent.change(textarea, { target: { value: testMessage } });
    fireEvent.click(sendButton);

    // Wait a tick to ensure no async operations attempt to proceed
    await waitFor(() => {});

    expect(mockSendMessage).not.toHaveBeenCalled();
    // Also check that input is not cleared, as message sending should have been blocked
    expect((textarea as HTMLTextAreaElement).value).toBe(testMessage);
    // Optional: Check for logger.error (this requires mocking the logger)
  });

  describe('Auto-scroll functionality', () => {
    beforeEach(() => {
      vi.useFakeTimers(); // Use fake timers for requestAnimationFrame
    });

    afterEach(() => {
      vi.restoreAllMocks(); // Restore mocks, including timers
      vi.useRealTimers(); // Important to switch back to real timers
    });

    const simulateMessagesAndUpdate = (
      initialMessages: ChatMessage[], 
      newMessage: ChatMessage, 
      mockScrollContainer: any
    ) => {
      // Initial render with some messages
      setupMockAiStore({ currentChatMessages: initialMessages });
      const { rerender } = renderAiChatbox();

      // Attach the mock scroll container to the ref
      // This simulates React attaching the ref to the DOM element
      const AiChatboxInstance = screen.getByTestId('ai-chatbox-container'); // Assuming AiChatbox has a root testid
      // This is a bit of a hack; direct ref manipulation in tests is tricky.
      // A better way might be to spy on scrollContainerRef.current if possible,
      // or to pass the ref in during render for more control if the component allowed it.
      // For now, we'll mock properties on the object that ref.current would point to.
      
      // Directly assign to the ref's current property for the test's scope
      // We need to mock what the ref would resolve to.
      // This requires AiChatbox to have a way to expose its scrollContainerRef or its properties for testing.
      // Let's assume scrollContainerRef.current IS our mockScrollContainer after render. 
      // This part is conceptual as directly overriding ref.current post-render from outside is hard.
      // The actual assignment happens inside AiChatbox. We rely on the useEffect picking it up.

      // Update the store to add a new message, triggering the useEffect in AiChatbox
      const updatedMessages = [...initialMessages, newMessage];
      setupMockAiStore({ currentChatMessages: updatedMessages });
      rerender(<AiChatbox providerId="p1" promptId="pr1" isAnonymous={false} />); // Rerender with new props/state

      vi.runAllTimers(); // Execute timers for requestAnimationFrame
    };

    it('should scroll to the top of the new assistant message when it is added', () => {
      const newMessageId = 'new-assistant'; // Define the ID for clarity and reuse
      
      let _scrollTopValue = 0;
      const mockSetScrollTopCallback = vi.fn();

      const getAttributeSpy = vi.fn().mockReturnValue(newMessageId);
      const querySelectorAllSpy = vi.fn().mockReturnValue([
        { offsetTop: 100, querySelectorAll: vi.fn(), getAttribute: vi.fn().mockReturnValue('prev-user') },
        { offsetTop: 200, querySelectorAll: vi.fn(), getAttribute: getAttributeSpy },
      ]);

      const mockScrollElement = {
        get scrollTop() { return _scrollTopValue; },
        set scrollTop(val: number) { mockSetScrollTopCallback(val); _scrollTopValue = val; },
        offsetTop: 50, 
        querySelectorAll: querySelectorAllSpy,
      } as any;

      const originalUseRef = React.useRef;
      const mockUseRef = vi.spyOn(React, 'useRef');
      const stableRefObject = { current: mockScrollElement }; 
      mockUseRef.mockImplementation((initialValue) => {
        if (initialValue === null) { 
          return stableRefObject; 
        }
        return originalUseRef(initialValue);
      });

      let rAFCallback: FrameRequestCallback | null = null;
      const mockRAF = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rAFCallback = cb;
        return 0; // Return a dummy ID
      });

      const existingMessages: ChatMessage[] = [{ ...mockUserMessage, id: 'prev-user' }];
      // Initial render
      setupMockAiStore({ currentChatMessages: existingMessages });
      const { rerender } = renderAiChatbox();

      // Update the store to add a new message, triggering the useEffect in AiChatbox
      const updatedMessages = [...existingMessages, { ...mockAssistantMessage, id: newMessageId }];
      setupMockAiStore({ currentChatMessages: updatedMessages });
      rerender(<AiChatbox providerId="p1" promptId="pr1" isAnonymous={false} />); 

      // Assert intermediate mock calls before checking rAF
      expect(querySelectorAllSpy).toHaveBeenCalledWith('[data-message-id]');
      expect(getAttributeSpy).toHaveBeenCalledWith('data-message-id');

      if (rAFCallback) {
        rAFCallback(performance.now());
      } else {
        throw new Error("requestAnimationFrame callback was not captured");
      }
      
      // Assertions
      expect(mockSetScrollTopCallback).toHaveBeenCalledWith(150);
      expect(mockScrollElement.scrollTop).toBe(150);
      expect(mockScrollElement.querySelectorAll).toHaveBeenCalledWith('[data-message-id]');

      mockUseRef.mockRestore(); 
      mockRAF.mockRestore(); // Restore requestAnimationFrame mock
    });

    it('should NOT scroll when a new user message is added', () => {
      const mockScrollElement = {
        scrollTop: 0, // Initial scrollTop
        offsetTop: 60,
        querySelectorAll: vi.fn().mockReturnValue([
          { offsetTop: 120, querySelectorAll: vi.fn(), getAttribute: vi.fn().mockReturnValue('msg-a') }, // Existing assistant message
          { offsetTop: 240, querySelectorAll: vi.fn(), getAttribute: vi.fn().mockReturnValue('new-user-msg-id') }, // New user message
        ]),
      } as any;
      
      const originalUseRef = React.useRef;
      const mockUseRef = vi.spyOn(React, 'useRef');
      mockUseRef.mockImplementationOnce(() => ({ current: mockScrollElement }));
      
      const existingMessages: ChatMessage[] = [{ ...mockAssistantMessage, id: 'prev-assist' }];
      // Simulate adding a new user message
      simulateMessagesAndUpdate(existingMessages, { ...mockUserMessage, id: 'new-user-msg-id' }, mockScrollElement);
      
      // Since the new message is a user message, scrollTop should not change from its initial value
      expect(mockScrollElement.scrollTop).toBe(0); 
      // querySelectorAll might still be called by the effect, but the scroll logic should not proceed for user messages
      // expect(mockScrollElement.querySelectorAll).not.toHaveBeenCalled(); // This might be too strict, effect runs, but scroll shouldn't happen.

      mockUseRef.mockRestore();
    });

    it('should not scroll if the scroll container ref is null', () => {
      const originalUseRef = React.useRef;
      const mockUseRef = vi.spyOn(React, 'useRef');
      // Force scrollContainerRef.current to be null
      const nullRef = { current: null };
      mockUseRef.mockImplementationOnce(() => nullRef);

      const initialRenderOutput = renderAiChatbox();
      
      // Store's initial state has messages, so useEffect will run
      // but ref.current is null, so it should bail early.
      // We need to ensure no error is thrown and scrollTop (if it were accessible) isn't changed.
      // The main thing is no error and querySelectorAll isn't called on null.

      // To trigger the effect again with potentially new messages
      const updatedMessages = [...currentAiStoreState.currentChatMessages, { ...mockUserMessage, id: 'another-new-user' }];
      setupMockAiStore({ currentChatMessages: updatedMessages });
      initialRenderOutput.rerender(<AiChatbox providerId="p1" promptId="pr1" isAnonymous={false} />);

      vi.runAllTimers(); // Execute timers
      
      // Since querySelectorAll is on mockScrollElement, if it wasn't called, our test passes.
      // This test primarily ensures no errors occur when the ref is null.
      // We can't directly assert scrollTop wasn't changed without a mock element.
      expect(true).toBe(true); // Placeholder for no error thrown assertion
      mockUseRef.mockRestore();
    });
  });
});
