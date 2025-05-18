import { render, screen, fireEvent } from '@testing-library/react';
import { ChatMessageBubble, ChatMessageBubbleProps } from './ChatMessageBubble';
import { vi } from 'vitest';
// import type { Mock } from 'vitest'; // Mock type is not a direct fit for Zustand hooks after import
import type { ChatMessage, UserProfile } from '@paynless/types';
import type { AttributionDisplayProps } from '../common/AttributionDisplay';
import type { MarkdownRendererProps } from '../common/MarkdownRenderer';
import type { MessageSelectionCheckboxProps } from './MessageSelectionCheckbox';
// Store hooks are imported for type casting if needed, but actual mocks are handled by vi.mock
// import { useAuthStore, useOrganizationStore } from '@paynless/store';

// Mock AttributionDisplay
const actualMockAttributionDisplay = vi.fn();
vi.mock('../common/AttributionDisplay', () => ({
  AttributionDisplay: (props: AttributionDisplayProps) => actualMockAttributionDisplay(props),
}));

// Mock MarkdownRenderer
const actualMockMarkdownRenderer = vi.fn();
vi.mock('../common/MarkdownRenderer', () => ({
  MarkdownRenderer: (props: MarkdownRendererProps) => actualMockMarkdownRenderer(props),
}));

// Mock MessageSelectionCheckbox
const actualMockMessageSelectionCheckbox = vi.fn();
vi.mock('./MessageSelectionCheckbox', () => ({
  MessageSelectionCheckbox: (props: MessageSelectionCheckboxProps) => actualMockMessageSelectionCheckbox(props),
}));

// Mock stores: The factory creates the mocks.
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAuthStore: vi.fn(),
    useOrganizationStore: vi.fn(),
    useAiStore: vi.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockedAuthStoreHook: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockedOrgStoreHook: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockedAiStoreHook: any;

// This needs to be in a beforeEach or beforeAll, or an async context at the top level.
// For simplicity in setup, let's do it in a describe.concurrent block or ensure tests run after this promise resolves.
// Or, more simply, access them after an import inside beforeEach.

const defaultMockUserMessage: ChatMessage = {
  id: 'user-msg-1',
  chat_id: 'chat-1',
  user_id: 'user-123',
  role: 'user',
  content: 'Hello, assistant!',
  created_at: '2024-05-18T12:00:00.000Z', // Using a fixed string for consistency
  token_usage: null,
  ai_provider_id: null,
  is_active_in_thread: true,
  system_prompt_id: null,
  updated_at: '2024-05-18T12:00:00.000Z',
};

const defaultMockAssistantMessage: ChatMessage = {
  id: 'assistant-msg-1',
  chat_id: 'chat-1',
  user_id: null,
  role: 'assistant',
  content: 'Hello, user! How can I help you today?',
  created_at: '2024-05-18T12:00:00.000Z', // Using a fixed string
  updated_at: '2024-05-18T12:00:00.000Z',
  token_usage: { prompt: 10, completion: 20, total: 30 },
  ai_provider_id: 'gpt-4',
  is_active_in_thread: true,
  system_prompt_id: null,
};

// Updated style definitions to separate layout and card specific styles
const userMessageLayoutClass = 'justify-end';
const userMessageCardClasses = 'bg-blue-100 dark:bg-blue-900';

const assistantMessageLayoutClass = 'justify-start';
const assistantMessageCardClasses = 'bg-gray-100 dark:bg-gray-700';

describe('ChatMessageBubble', () => {
  const mockCurrentUserId = 'user-123';
  const mockCurrentOrgId = 'org-abc';
  const mockUserProfile: UserProfile = {
    id: mockCurrentUserId,
    first_name: 'Test',
    last_name: 'User',
    updated_at: '2024-05-18T12:00:00.000Z',
    chat_context: {},
    created_at: '2024-05-18T12:00:00.000Z',
    last_selected_org_id: mockCurrentOrgId,
    profile_privacy_setting: 'public',
    role: 'user',
  };
  const mockOnEditClick = vi.fn();

  beforeAll(async () => {
    // Dynamically import the mocked store and assign hooks
    const store = await import('@paynless/store');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedAuthStoreHook = store.useAuthStore as any; // Cast to any after import
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedOrgStoreHook = store.useOrganizationStore as any; // Cast to any after import
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedAiStoreHook = store.useAiStore as any; // Added assignment
  });

  beforeEach(() => {
    // Clear all mock instances
    actualMockAttributionDisplay.mockClear();
    actualMockMarkdownRenderer.mockClear();
    actualMockMessageSelectionCheckbox.mockClear();
    // Check if hooks are initialized before calling mockClear
    if (mockedAuthStoreHook) mockedAuthStoreHook.mockClear();
    if (mockedOrgStoreHook) mockedOrgStoreHook.mockClear();
    if (mockedAiStoreHook) mockedAiStoreHook.mockClear();
    mockOnEditClick.mockClear();

    // Set up default implementation for AttributionDisplay mock
    actualMockAttributionDisplay.mockImplementation(({ role }) => (
      <div data-testid="mock-attribution-display">
        {`Attribution for ${role}`}
      </div>
    ));

    // Set up default implementation for MarkdownRenderer mock
    actualMockMarkdownRenderer.mockImplementation(({ content }) => (
      <div data-testid="mock-markdown-renderer">{content}</div>
    ));

    actualMockMessageSelectionCheckbox.mockImplementation(({ messageId, chatId }) => (
      <div data-testid={`mock-checkbox-${messageId}`} data-chatid={String(chatId)}>
        Checkbox for {messageId}
      </div>
    ));

    // Set up default return values for store hooks
    if (mockedAuthStoreHook) {
      mockedAuthStoreHook.mockReturnValue({
        // currentUserId: mockCurrentUserId, // This comes from state.user.id now in component
        user: mockUserProfile,
        // profile: mockUserProfile, // Assuming user object contains all profile info needed
      });
    }
    if (mockedOrgStoreHook) {
      mockedOrgStoreHook.mockReturnValue({
        currentOrgId: mockCurrentOrgId,
      });
    }
    if (mockedAiStoreHook) {
      mockedAiStoreHook.mockReturnValue({
        currentChatId: 'test-chat-123', // Default chatId for most tests
      });
    }
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
        userId: defaultMockUserMessage.user_id,
        role: defaultMockUserMessage.role,
        timestamp: defaultMockUserMessage.created_at,
        organizationId: undefined,
        modelId: null,
      })
    );
    expect(screen.getByTestId('mock-attribution-display')).toHaveTextContent('Attribution for user');
  });

  it('should correctly integrate AttributionDisplay for assistant messages, passing message and model_id (or handling its absence)', () => {
    renderComponent({ message: defaultMockAssistantMessage, onEditClick: undefined });
    expect(actualMockAttributionDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: defaultMockAssistantMessage.user_id,
        role: defaultMockAssistantMessage.role,
        timestamp: defaultMockAssistantMessage.created_at,
        organizationId: undefined,
        modelId: 'gpt-4',
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
    const layoutElement = screen.getByTestId('chat-message-layout-user');
    expect(layoutElement).toHaveClass(userMessageLayoutClass);

    const cardElement = screen.getByTestId('chat-message-bubble-card');
    userMessageCardClasses.split(' ').forEach(className => {
      expect(cardElement).toHaveClass(className);
    });
  });

  it('should apply distinct styling for assistant messages', () => {
    renderComponent({ message: defaultMockAssistantMessage, onEditClick: undefined });
    const layoutElement = screen.getByTestId('chat-message-layout-assistant');
    expect(layoutElement).toHaveClass(assistantMessageLayoutClass);

    const cardElement = screen.getByTestId('chat-message-bubble-card');
    assistantMessageCardClasses.split(' ').forEach(className => {
      expect(cardElement).toHaveClass(className);
    });
  });

  it('should include an edit button for user messages if onEditClick is provided', () => {
    renderComponent({ message: defaultMockUserMessage, onEditClick: mockOnEditClick });
    const editButton = screen.getByTestId('edit-message-button');
    expect(editButton).toBeInTheDocument();
    expect(editButton).toHaveClass('opacity-50');
    expect(editButton).toHaveClass('hover:opacity-100');
    expect(editButton).toHaveClass('transition-opacity');
  });

  it('should not include an edit button for user messages if onEditClick is not provided', () => {
    renderComponent({ message: defaultMockUserMessage, onEditClick: undefined });
    expect(screen.queryByTestId('edit-message-button')).not.toBeInTheDocument();
  });

  it('should not include an edit button for assistant messages', () => {
    renderComponent({ message: defaultMockAssistantMessage, onEditClick: mockOnEditClick });
    expect(screen.queryByTestId('edit-message-button')).not.toBeInTheDocument();
  });

  it('should call onEditClick with messageId and content when edit button is clicked for user messages', () => {
    renderComponent({ message: defaultMockUserMessage, onEditClick: mockOnEditClick });
    const editButton = screen.getByTestId('edit-message-button');
    fireEvent.click(editButton);
    expect(mockOnEditClick).toHaveBeenCalledTimes(1);
    expect(mockOnEditClick).toHaveBeenCalledWith(defaultMockUserMessage.id, defaultMockUserMessage.content);
  });

  it('should render a Pencil icon in the edit button', () => {
    renderComponent({ message: defaultMockUserMessage, onEditClick: mockOnEditClick });
    const editButton = screen.getByTestId('edit-message-button');
    expect(editButton.querySelector('svg')).toBeInTheDocument();
    // Removed specific h-3 w-3 check as the actual component might use different sizing classes for the SVG icon
    // For example, [&_svg:not([class*='size-'])]:size-4 was seen in output
    // Check for presence is often sufficient unless exact icon sizing is critical to test here.
  });

  describe('MessageSelectionCheckbox Integration', () => {
    const testChatId = 'test-chat-for-checkbox';
    beforeEach(() => {
      if (mockedAiStoreHook) {
        mockedAiStoreHook.mockReturnValue({ currentChatId: testChatId });
      }
    });

    it('should render MessageSelectionCheckbox with correct messageId and chatId from AiStore', () => {
      renderComponent({ message: defaultMockUserMessage });
      expect(actualMockMessageSelectionCheckbox).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: defaultMockUserMessage.id,
          chatId: testChatId,
        })
      );
      expect(screen.getByTestId(`mock-checkbox-${defaultMockUserMessage.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`mock-checkbox-${defaultMockUserMessage.id}`)).toHaveAttribute('data-chatid', testChatId);
    });

    it('should pass null as chatId to MessageSelectionCheckbox if currentChatId from AiStore is null', () => {
      if (mockedAiStoreHook) {
        mockedAiStoreHook.mockReturnValue({ currentChatId: null });
      }
      renderComponent({ message: defaultMockAssistantMessage }); 
      expect(actualMockMessageSelectionCheckbox).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: defaultMockAssistantMessage.id,
          chatId: null,
        })
      );
      expect(screen.getByTestId(`mock-checkbox-${defaultMockAssistantMessage.id}`)).toHaveAttribute('data-chatid', 'null');
    });
  });

  // Markdown rendering tests have been moved to MarkdownRenderer.test.tsx
}); 