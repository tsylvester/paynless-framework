import React from 'react';
import { ChatMessage, TokenUsage } from '@paynless/types';
import { Card } from '@/components/ui/card';
import { AttributionDisplay } from '../common/AttributionDisplay';
import { useAiStore } from '@paynless/store';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { Pencil, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageSelectionCheckbox } from './MessageSelectionCheckbox';
import { TokenUsageDisplay } from './TokenUsageDisplay';

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  onEditClick?: (messageId: string, messageContent: string) => void;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({ message, onEditClick }) => {
  const { currentChatId } = useAiStore(state => ({ currentChatId: state.currentChatId }));
  const isUserMessage = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  
  const bubbleColorClass = isUserMessage 
    ? 'bg-blue-100 dark:bg-blue-900' 
    : isStreaming 
      ? 'bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900 dark:to-blue-900 animate-pulse' 
      : 'bg-gray-100 dark:bg-gray-700';

  return (
    <div 
      className={`flex w-full items-start mb-2 group ${isUserMessage ? 'justify-end' : 'justify-start'}`}
      data-testid={isUserMessage ? 'chat-message-layout-user' : 'chat-message-layout-assistant'}
    >
      {/* Controls for User Message (Left Side) */}
      {isUserMessage && (
        <div className="flex flex-col items-center flex-shrink-0 mr-2 space-y-1 self-center pt-1">
          <MessageSelectionCheckbox messageId={message.id} chatId={currentChatId} />
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

      {/* The Message Bubble Card - Restored max-width */}
      <Card
        className={`p-3 max-w-[85%] break-words ${bubbleColorClass}`}
        data-testid="chat-message-bubble-card"
        data-message-id={message.id}
      >
        <AttributionDisplay
            userId={message.user_id}
            role={message.role as 'user' | 'assistant'}
            timestamp={message.created_at}
            organizationId={('organization_id' in message) ? (message as ChatMessage & { organization_id?: string | null }).organization_id : undefined}
            modelId={message.ai_provider_id}
        />
        <div className="mt-1">
          <MarkdownRenderer content={message.content} />
          {isStreaming && (
            <div className="flex items-center mt-2 text-xs text-purple-600 dark:text-purple-400">
              <Zap className="w-3 h-3 mr-1 animate-pulse" />
              <span>Streaming...</span>
            </div>
          )}
        </div>
        {/* Conditionally render PER-MESSAGE TokenUsageDisplay for assistant messages */}
        {message.role === 'assistant' && message.token_usage && (
          <div className="mt-1">
            <TokenUsageDisplay tokenUsage={message.token_usage as TokenUsage} />
          </div>
        )}
      </Card>

      {/* Controls for Assistant Message (Right Side, checkbox only) */}
      {!isUserMessage && (
        <div className="flex items-center flex-shrink-0 ml-2 self-center pt-1">
          <MessageSelectionCheckbox messageId={message.id} chatId={currentChatId} />
        </div>
      )}
    </div>
  );
}; 