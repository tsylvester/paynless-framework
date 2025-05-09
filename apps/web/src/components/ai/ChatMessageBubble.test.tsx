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

  describe('Markdown Rendering', () => {
    it('should render bold text correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '**bold text**' };
      renderComponent({ message: markdownMessage });
      const boldElement = screen.getByText('bold text');
      expect(boldElement.tagName).toBe('STRONG');
    });

    it('should render italic text correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '*italic text*' };
      renderComponent({ message: markdownMessage });
      const italicElement = screen.getByText('italic text');
      expect(italicElement.tagName).toBe('EM');
    });

    it('should render a link correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '[Paynless](https://paynless.io)' };
      renderComponent({ message: markdownMessage });
      const linkElement = screen.getByRole('link', { name: 'Paynless' }) as HTMLAnchorElement;
      expect(linkElement).toBeInTheDocument();
      expect(linkElement.href).toBe('https://paynless.io/'); // Browsers might add trailing slash
    });

    it('should render an unordered list correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '* Item 1\n* Item 2' };
      renderComponent({ message: markdownMessage });
      const listItem1 = screen.getByText('Item 1');
      const listItem2 = screen.getByText('Item 2');
      expect(listItem1.tagName).toBe('LI');
      expect(listItem2.tagName).toBe('LI');
      expect(listItem1.parentElement?.tagName).toBe('UL');
    });

    it('should render an ordered list correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '1. First item\n2. Second item' };
      renderComponent({ message: markdownMessage });
      const listItem1 = screen.getByText('First item');
      const listItem2 = screen.getByText('Second item');
      expect(listItem1.tagName).toBe('LI');
      expect(listItem2.tagName).toBe('LI');
      expect(listItem1.parentElement?.tagName).toBe('OL');
    });

    it('should render inline code correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '`const x = 10;`' };
      renderComponent({ message: markdownMessage });
      const codeElement = screen.getByText('const x = 10;');
      expect(codeElement.tagName).toBe('CODE');
      // Check if it's not inside a <pre> for inline
      expect(codeElement.parentElement?.tagName).not.toBe('PRE');
    });

    it('should render a GFM code block correctly', () => {
      const codeContent = 'function greet() {\n  console.log("Hello");\n}';
      const markdownMessage = { ...defaultMockAssistantMessage, content: '```javascript\n' + codeContent + '\n```' };
      renderComponent({ message: markdownMessage });
      
      // Use document.querySelector to find the <code> element within a <pre> tag with the specific class
      const codeElement = document.querySelector('pre > code.language-javascript');
      
      expect(codeElement).toBeInTheDocument(); // Check if the element was found
      // Ensure it is indeed a CODE element, within a PRE element, and has the correct class
      expect(codeElement?.tagName).toBe('CODE');
      expect(codeElement?.parentElement?.tagName).toBe('PRE');
      expect(codeElement).toHaveClass('language-javascript');
      
      // Check textContent, which normalizes spaces/newlines better for multi-line code
      // Trim both the actual text content and the expected content to handle potential leading/trailing whitespace differences.
      expect(codeElement?.textContent?.trim()).toBe(codeContent.trim());
    });

    it('should render a blockquote correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '> This is a quote.' };
      renderComponent({ message: markdownMessage });
      const quoteText = screen.getByText('This is a quote.');
      // react-markdown wraps blockquote content in a paragraph
      expect(quoteText.tagName).toBe('P');
      expect(quoteText.parentElement?.tagName).toBe('BLOCKQUOTE');
    });

    it('should render paragraphs correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: 'Hello\n\nWorld' };
      renderComponent({ message: markdownMessage });
      const p1 = screen.getByText('Hello');
      const p2 = screen.getByText('World');
      expect(p1.tagName).toBe('P');
      expect(p2.tagName).toBe('P');
    });
    
    it('should render a combination of markdown elements', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: 'This is **bold** and _italic_ with a [link](https://example.com).' };
      renderComponent({ message: markdownMessage });
      const boldElement = screen.getByText('bold');
      const italicElement = screen.getByText('italic');
      const linkElement = screen.getByRole('link', { name: 'link' }) as HTMLAnchorElement;

      expect(boldElement.tagName).toBe('STRONG');
      expect(italicElement.tagName).toBe('EM'); // remark-gfm uses <em> for _italic_
      expect(linkElement).toBeInTheDocument();
      expect(linkElement.href).toBe('https://example.com/');
    });

    it('should render H1 heading correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '# Heading 1' };
      renderComponent({ message: markdownMessage });
      const headingElement = screen.getByRole('heading', { level: 1, name: 'Heading 1' });
      expect(headingElement).toBeInTheDocument();
      expect(headingElement.tagName).toBe('H1');
    });

    it('should render H2 heading correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '## Heading 2' };
      renderComponent({ message: markdownMessage });
      const headingElement = screen.getByRole('heading', { level: 2, name: 'Heading 2' });
      expect(headingElement).toBeInTheDocument();
      expect(headingElement.tagName).toBe('H2');
    });

    it('should render H3 heading correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '### Heading 3' };
      renderComponent({ message: markdownMessage });
      const headingElement = screen.getByRole('heading', { level: 3, name: 'Heading 3' });
      expect(headingElement).toBeInTheDocument();
      expect(headingElement.tagName).toBe('H3');
    });

    it('should render strikethrough text correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '~~deleted~~' };
      renderComponent({ message: markdownMessage });
      const strikethroughElement = screen.getByText('deleted');
      expect(strikethroughElement.tagName).toBe('DEL');
    });

    it('should render a horizontal rule correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '---' };
      renderComponent({ message: markdownMessage });
      const hrElement = screen.getByRole('separator'); // <hr> has a role of separator
      expect(hrElement).toBeInTheDocument();
      expect(hrElement.tagName).toBe('HR');
    });

    it('should render task list items correctly', () => {
      const markdownMessage = { ...defaultMockAssistantMessage, content: '- [x] Completed Task\n- [ ] Open Task' };
      renderComponent({ message: markdownMessage });
      
      const completedTaskTextElement = screen.getByText('Completed Task');
      const openTaskTextElement = screen.getByText('Open Task');

      // Find the parent <li> for the completed task
      const completedListItem = completedTaskTextElement.closest('li');
      expect(completedListItem).toBeInTheDocument();
      const completedCheckbox = completedListItem?.querySelector('input[type="checkbox"]');
      expect(completedCheckbox).toBeInTheDocument();
      expect(completedCheckbox?.tagName).toBe('INPUT');
      expect(completedCheckbox).toBeChecked();
      expect(completedCheckbox).toBeDisabled();
      expect(completedListItem?.parentElement?.tagName).toBe('UL');

      // Find the parent <li> for the open task
      const openListItem = openTaskTextElement.closest('li');
      expect(openListItem).toBeInTheDocument();
      const openCheckbox = openListItem?.querySelector('input[type="checkbox"]');
      expect(openCheckbox).toBeInTheDocument();
      expect(openCheckbox?.tagName).toBe('INPUT');
      expect(openCheckbox).not.toBeChecked();
      expect(openCheckbox).toBeDisabled();
      expect(openListItem?.parentElement?.tagName).toBe('UL');
    });

    it('should render a table correctly', () => {
      const markdownTable = 
        '| Header 1 | Header 2 |\n' +
        '| -------- | -------- |\n' +
        '| Cell 1   | Cell 2   |\n' +
        '| Cell 3   | Cell 4   |';
      const markdownMessage = { ...defaultMockAssistantMessage, content: markdownTable };
      renderComponent({ message: markdownMessage });

      // Check for table
      const tableElement = screen.getByRole('table');
      expect(tableElement).toBeInTheDocument();

      // Check headers
      expect(screen.getByRole('columnheader', { name: 'Header 1' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Header 2' })).toBeInTheDocument();

      // Check cells
      expect(screen.getByRole('cell', { name: 'Cell 1' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Cell 2' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Cell 3' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Cell 4' })).toBeInTheDocument();
    });
  });
}); 