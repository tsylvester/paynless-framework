import React from 'react';
import { ChatMessage } from '@paynless/shared-types'; // Assuming types are here
import { Card } from '@/components/ui/card'; // Assuming shadcn/ui card path
import { AttributionDisplay } from '../common/AttributionDisplay';
import { useAuthStore, useOrganizationStore } from '@paynless/store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  onEditClick?: (messageId: string, messageContent: string) => void;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({ message, onEditClick }) => {
  const { currentUserId } = useAuthStore();
  const { currentOrgId } = useOrganizationStore(); // This might be null if not in an org context

  const isUserMessage = message.role === 'user';
  // const isAssistantMessage = message.role === 'assistant';

  const userMessageStyles = 'bg-blue-100 dark:bg-blue-900 self-end';
  const assistantMessageStyles = 'bg-gray-100 dark:bg-gray-700 self-start';

  const bubbleStyles = isUserMessage ? userMessageStyles : assistantMessageStyles;

  // Basic styling for markdown elements. This can be expanded or moved to a global CSS file.
  // These are Tailwind CSS classes. Ensure they are available in your project.
  const markdownStyles = `
    prose 
    dark:prose-invert 
    prose-sm 
    max-w-none 
    prose-headings:font-semibold 
    prose-a:text-blue-600 prose-a:hover:underline
    prose-code:bg-gray-200 prose-code:dark:bg-gray-800 prose-code:p-1 prose-code:rounded prose-code:text-sm
    prose-pre:bg-gray-200 prose-pre:dark:bg-gray-800 prose-pre:p-2 prose-pre:rounded prose-pre:overflow-x-auto
    prose-blockquote:border-l-4 prose-blockquote:pl-4 prose-blockquote:italic
  `;

  return (
    <Card 
      className={`p-3 m-2 max-w-[85%] break-words ${bubbleStyles}`}
      data-testid="chat-message-bubble-card"
      data-message-id={message.id}
    >
      <div className="flex flex-col">
        <AttributionDisplay 
            message={message} 
            currentUserId={currentUserId} 
            currentOrgId={currentOrgId} 
        />
        <div className={`mt-1 ${markdownStyles}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
        {/* Placeholder for edit button for user messages */}
        {isUserMessage && onEditClick && (
          <button 
            onClick={() => onEditClick(message.id, message.content)} 
            className="text-xs text-blue-600 hover:underline mt-1 self-start"
            aria-label="Edit message"
          >
            Edit
          </button>
        )}
      </div>
    </Card>
  );
}; 