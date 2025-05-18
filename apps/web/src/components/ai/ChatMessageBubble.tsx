import React from 'react';
import { ChatMessage, TokenUsage } from '@paynless/types'; // Corrected import path & Added TokenUsage
import { Card } from '@/components/ui/card';
import { AttributionDisplay } from '../common/AttributionDisplay';
import { 
  //useAuthStore, 
  useAiStore } from '@paynless/store'; // Removed useOrganizationStore as currentOrgId is not used
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageSelectionCheckbox } from './MessageSelectionCheckbox';
import { TokenUsageDisplay } from './TokenUsageDisplay';

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  onEditClick?: (messageId: string, messageContent: string) => void;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({ message, onEditClick }) => {
  //const currentUser = useAuthStore(state => state.user); // Correctly get the user object
  //const _currentUserId = currentUser?.id; // Prefixed with underscore as it's unused

  const { currentChatId } = useAiStore(state => ({ currentChatId: state.currentChatId }));

  const isUserMessage = message.role === 'user';

  const bubbleColorClass = isUserMessage 
    ? 'bg-blue-100 dark:bg-blue-900' 
    : 'bg-gray-100 dark:bg-gray-700';

  return (
    <div 
      className={`flex w-full items-start mb-2 group ${isUserMessage ? 'justify-end' : 'justify-start'}`}
      data-testid={isUserMessage ? 'chat-message-layout-user' : 'chat-message-layout-assistant'}
    >
      {/* Controls for User Message (Left Side) */}
      {isUserMessage && (
        <div className="flex flex-col items-center flex-shrink-0 mr-2 space-y-1 self-center pt-1">
          <MessageSelectionCheckbox
            messageId={message.id}
            chatId={currentChatId}
          />
          {onEditClick && (
            <Button
              variant="ghost"
              size="icon"
              className="opacity-50 hover:opacity-100 transition-opacity h-6 w-6"
              onClick={() => onEditClick(message.id, message.content)}
              aria-label="Edit message"
              data-testid="edit-message-button"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      {/* The Message Bubble Card */}
      <Card
        className={`p-3 max-w-[85%] break-words ${bubbleColorClass}`}
        data-testid="chat-message-bubble-card"
        data-message-id={message.id}
      >
        <AttributionDisplay
            userId={message.user_id} // This refers to the message's author, not necessarily the current user
            role={message.role as 'user' | 'assistant'}
            timestamp={message.created_at}
            organizationId={('organization_id' in message) ? (message as ChatMessage & { organization_id?: string | null }).organization_id : undefined}
            modelId={message.ai_provider_id}
        />
        <div className="mt-1">
          <MarkdownRenderer content={message.content} />
        </div>
        {/* Conditionally render TokenUsageDisplay for assistant messages */}
        {message.role === 'assistant' && message.token_usage && (
          <div className="mt-1">
            <TokenUsageDisplay tokenUsage={message.token_usage as unknown as TokenUsage | null} />
          </div>
        )}
      </Card>

      {/* Controls for Assistant Message (Right Side) */}
      {!isUserMessage && (
        <div className="flex items-center flex-shrink-0 ml-2 self-center pt-1">
          <MessageSelectionCheckbox
            messageId={message.id}
            chatId={currentChatId}
          />
        </div>
      )}
    </div>
  );
}; 