import React from 'react';
import { ChatMessage } from '@paynless/shared-types'; // Assuming types are here
import { Card } from '@/components/ui/card'; // Assuming shadcn/ui card path
import { AttributionDisplay } from '../common/AttributionDisplay';
import { useAuthStore, useOrganizationStore } from '@paynless/store';
import { MarkdownRenderer } from '../common/MarkdownRenderer';

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

  return (
    <Card 
      className={`p-3 m-2 max-w-[85%] break-words ${bubbleStyles}`}
      data-testid="chat-message-bubble-card"
      data-message-id={message.id}
    >
      <div className="flex flex-col">
        <AttributionDisplay 
            userId={message.user_id}
            role={message.role as 'user' | 'assistant'}
            timestamp={message.created_at}
            organizationId={('organization_id' in message) ? (message as any).organization_id : undefined}
            modelId={message.ai_provider_id}
        />
        <div className="mt-1">
          <MarkdownRenderer content={message.content} />
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