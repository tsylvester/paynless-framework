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
}); 