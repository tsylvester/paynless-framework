import { render, screen, fireEvent } from '@testing-library/react';
import { ChatMessageBubble, ChatMessageBubbleProps } from './ChatMessageBubble';
import { vi } from 'vitest';
import { ChatMessage, UserProfile } from '@paynless/shared-types';
// Store hooks are imported for type casting if needed, but actual mocks are handled by vi.mock
// import { useAuthStore, useOrganizationStore } from '@paynless/store';

// Mock AttributionDisplay
const actualMockAttributionDisplay = vi.fn();
vi.mock('../common/AttributionDisplay', () => ({
  // The factory returns an object, and the 'AttributionDisplay' key
  // gets a function. This function, when called by React, will
  // then call our `actualMockAttributionDisplay`.
  AttributionDisplay: (props: any) => actualMockAttributionDisplay(props),
}));

// Mock stores: The factory creates the mocks.
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
  useOrganizationStore: vi.fn(),
}));

// After vi.mock, dynamically import the mocked store to get references to the mock functions.
let mockedAuthStoreHook: vi.Mock;
let mockedOrgStoreHook: vi.Mock;

// This needs to be in a beforeEach or beforeAll, or an async context at the top level.
// For simplicity in setup, let's do it in a describe.concurrent block or ensure tests run after this promise resolves.
// Or, more simply, access them after an import inside beforeEach.

const defaultMockUserMessage: ChatMessage = {
  id: 'user-msg-1',
  chat_id: 'chat-1',
  user_id: 'user-123',
  role: 'user',
  content: 'Hello, assistant!',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  token_usage: null,
  model_id: null,
};

const defaultMockAssistantMessage: ChatMessage = {
  id: 'assistant-msg-1',
  chat_id: 'chat-1',
  user_id: null,
  role: 'assistant',
  content: 'Hello, user! How can I help you today?',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  token_usage: { prompt: 10, completion: 20, total: 30 },
  model_id: 'gpt-4',
};

// Style strings defined in ChatMessageBubble.tsx
const userMessageStyles = 'bg-blue-100 dark:bg-blue-900 self-end';
const assistantMessageStyles = 'bg-gray-100 dark:bg-gray-700 self-start';

describe('ChatMessageBubble', () => {
  const mockCurrentUserId = 'user-123';
  const mockCurrentOrgId = 'org-abc';
  const mockUserProfile: UserProfile = {
    id: mockCurrentUserId,
    email: 'test@example.com',
    full_name: 'Test User',
    avatar_url: null,
    updated_at: new Date().toISOString(),
  };
  const mockOnEditClick = vi.fn();

  beforeAll(async () => {
    // Dynamically import the mocked store and assign hooks
    const store = await import('@paynless/store');
    mockedAuthStoreHook = store.useAuthStore as vi.Mock;
    mockedOrgStoreHook = store.useOrganizationStore as vi.Mock;
  });

  beforeEach(() => {
    // Clear all mock instances
    actualMockAttributionDisplay.mockClear();
    mockedAuthStoreHook.mockClear();
    mockedOrgStoreHook.mockClear();
    mockOnEditClick.mockClear();

    // Set up default implementation for AttributionDisplay mock
    actualMockAttributionDisplay.mockImplementation(({ message }) => (
      <div data-testid="mock-attribution-display">
        {`Attribution for ${message.role}`}
      </div>
    ));

    // Set up default return values for store hooks
    mockedAuthStoreHook.mockReturnValue({
      currentUserId: mockCurrentUserId,
      user: mockUserProfile,
      profile: mockUserProfile, 
    });
    mockedOrgStoreHook.mockReturnValue({
      currentOrgId: mockCurrentOrgId,
    });
  });

  const renderComponent = (props: Partial<ChatMessageBubbleProps>) => {
    const defaultTestProps: ChatMessageBubbleProps = {
      message: defaultMockUserMessage,
      onEditClick: mockOnEditClick, 
    };
    return render(<ChatMessageBubble {...defaultTestProps} {...props} />);
  };

  it('should render the message.content for a user message', () => {
    renderComponent({ message: defaultMockUserMessage });
    expect(screen.getByText(defaultMockUserMessage.content)).toBeInTheDocument();
  });

  it('should render the message.content for an assistant message', () => {
    renderComponent({ message: defaultMockAssistantMessage, onEditClick: undefined }); // No edit for assistant
    expect(screen.getByText(defaultMockAssistantMessage.content)).toBeInTheDocument();
  });

  it('should correctly integrate AttributionDisplay for user messages, passing message, currentUserId, and currentOrgId', () => {
    renderComponent({ message: defaultMockUserMessage });
    expect(actualMockAttributionDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        message: defaultMockUserMessage,
        currentUserId: mockCurrentUserId,
        currentOrgId: mockCurrentOrgId,
      })
    );
    expect(screen.getByTestId('mock-attribution-display')).toHaveTextContent('Attribution for user');
  });

  it('should correctly integrate AttributionDisplay for assistant messages, passing message and model_id (or handling its absence)', () => {
    renderComponent({ message: defaultMockAssistantMessage, onEditClick: undefined });
    expect(actualMockAttributionDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        message: defaultMockAssistantMessage,
        currentUserId: mockCurrentUserId, 
        currentOrgId: mockCurrentOrgId,   
      })
    );
    expect(screen.getByTestId('mock-attribution-display')).toHaveTextContent('Attribution for assistant');
  });

  it('should render as a Card component', () => {
    renderComponent({}); // Renders with defaultMockUserMessage
    expect(screen.getByTestId('chat-message-bubble-card')).toBeInTheDocument();
  });

  it('should apply distinct styling for user messages', () => {
    renderComponent({ message: defaultMockUserMessage });
    const cardElement = screen.getByTestId('chat-message-bubble-card');
    // Check for each class part of userMessageStyles
    userMessageStyles.split(' ').forEach(className => {
      expect(cardElement).toHaveClass(className);
    });
  });

  it('should apply distinct styling for assistant messages', () => {
    renderComponent({ message: defaultMockAssistantMessage, onEditClick: undefined });
    const cardElement = screen.getByTestId('chat-message-bubble-card');
    // Check for each class part of assistantMessageStyles
    assistantMessageStyles.split(' ').forEach(className => {
      expect(cardElement).toHaveClass(className);
    });
  });

  it('should include an edit button for user messages if onEditClick is provided', () => {
    renderComponent({ message: defaultMockUserMessage, onEditClick: mockOnEditClick });
    expect(screen.getByRole('button', { name: /edit message/i })).toBeInTheDocument();
  });

  it('should not include an edit button for user messages if onEditClick is not provided', () => {
    renderComponent({ message: defaultMockUserMessage, onEditClick: undefined });
    expect(screen.queryByRole('button', { name: /edit message/i })).not.toBeInTheDocument();
  });

  it('should not include an edit button for assistant messages', () => {
    renderComponent({ message: defaultMockAssistantMessage, onEditClick: mockOnEditClick }); // onEditClick might be passed but component should ignore for assistant
    expect(screen.queryByRole('button', { name: /edit message/i })).not.toBeInTheDocument();
  });

  it('should call onEditClick with messageId and content when edit button is clicked for user messages', () => {
    renderComponent({ message: defaultMockUserMessage, onEditClick: mockOnEditClick });
    const editButton = screen.getByRole('button', { name: /edit message/i });
    fireEvent.click(editButton);
    expect(mockOnEditClick).toHaveBeenCalledTimes(1);
    expect(mockOnEditClick).toHaveBeenCalledWith(defaultMockUserMessage.id, defaultMockUserMessage.content);
  });

  it.todo('should render markdown content correctly (basic test, to be expanded in STEP-3.4)');
}); 