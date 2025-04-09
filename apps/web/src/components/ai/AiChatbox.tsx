'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAiStore } from '@paynless/store';
import type { ChatMessage } from '@paynless/types';
import { logger } from '@paynless/utils';
import { cn } from '@/lib/utils'; // Assuming existing cn utility
// import { Textarea } from '@/components/ui/textarea';
// import { Button } from '@/components/ui/button';
// import { ScrollArea } from '@/components/ui/scroll-area';
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
// import { Terminal, Loader2 } from "lucide-react"
import { Terminal, Loader2 } from 'lucide-react'; // Keep lucide icons

interface AiChatboxProps {
  providerId: string | null;
  promptId: string | null;
  isAnonymous: boolean;
  // Optional callback for when limit is reached, handled by parent
  onLimitReached?: () => void;
}

export const AiChatbox: React.FC<AiChatboxProps> = ({
  providerId,
  promptId,
  isAnonymous,
  onLimitReached,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Fetch state and actions from the store
  const {
    currentChatMessages,
    currentChatId,
    isLoadingAiResponse,
    aiError,
    sendMessage,
    clearAiError,
  } = useAiStore();

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
        // TODO: Fix this type error
        // Property 'scrollViewport' does not exist on type 'HTMLDivElement'.ts(2339)
        // const viewport = scrollAreaRef.current.scrollViewport; 
        // if (viewport) {
            // viewport.scrollTop = viewport.scrollHeight;
        // }
    }
  }, [currentChatMessages]);

  const handleSend = async () => {
    if (!inputMessage.trim() || isLoadingAiResponse) return;
    if (!providerId) {
        logger.error('[AiChatbox] Cannot send message: Provider ID is missing.');
        // TODO: Potentially set an error state or show a toast
        return;
    }
     if (!promptId) {
        logger.error('[AiChatbox] Cannot send message: Prompt ID is missing.');
        // TODO: Potentially set an error state or show a toast
        return;
    }

    clearAiError(); // Clear previous errors
    const messageToSend = inputMessage;
    setInputMessage(''); // Clear input immediately

    try {
        const result = await sendMessage({
            message: messageToSend,
            providerId,
            promptId,
            chatId: currentChatId ?? undefined,
            isAnonymous,
        });

        if (result && typeof result === 'object' && 'error' in result && result.error === 'limit_reached') {
            logger.warn('[AiChatbox] Anonymous limit reached.');
            // Optionally call parent handler
            onLimitReached?.();
             // TODO: Restore input message if needed, or handle in parent
            // setInputMessage(messageToSend);
        }

    } catch (error: unknown) {
         // Errors should ideally be caught and set in the store's aiError state
         // by the sendMessage action itself.
         const errorMessage = error instanceof Error ? error.message : String(error);
         logger.error('[AiChatbox] Unexpected error calling sendMessage:', { error: errorMessage });
          // Restore input message on unexpected error?
          // setInputMessage(messageToSend);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(event.target.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Prevent newline
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[500px] border rounded-md p-4 space-y-4">
      {/* Message Display Area */}
      <div className="flex-grow pr-4 overflow-y-auto" ref={scrollAreaRef}>
        <div className="space-y-4">
          {currentChatMessages.map((msg: ChatMessage) => (
            <div
              key={msg.id}
              className={cn(
                'flex w-max max-w-[75%] flex-col gap-2 rounded-lg px-3 py-2 text-sm',
                msg.role === 'user'
                  ? 'ml-auto bg-[rgb(var(--color-primary))] text-white'
                  : 'bg-[rgb(var(--color-surface))] text-textPrimary'
              )}
            >
              {msg.content}
            </div>
          ))}
          {isLoadingAiResponse && (
             <div className="flex items-center space-x-2 justify-start">
                <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--color-textSecondary))]" />
                <span className="text-sm text-[rgb(var(--color-textSecondary))]">Assistant is thinking...</span>
             </div>
          )}
        </div>
      </div>

       {/* Error Display - Use standard div */}
       {aiError && (
         <div className="p-4 rounded-md bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700">
            <div className="flex items-center space-x-2">
                 <Terminal className="h-4 w-4" />
                 <h3 className="font-semibold">Error</h3>
             </div>
            <p className="text-sm mt-1">
               {aiError}
            </p>
         </div>
       )}

      {/* Input Area */}
      <div className="flex items-center space-x-2 border-t pt-4 border-[rgb(var(--color-border))]">
        {/* Standard textarea */}
        <textarea
          placeholder="Type your message here..."
          value={inputMessage}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          rows={1} 
          className="input flex-grow resize-none min-h-[40px] max-h-[150px] overflow-y-auto"
          disabled={isLoadingAiResponse}
        />
        {/* Standard button */}
        <button 
            onClick={handleSend} 
            disabled={isLoadingAiResponse || !inputMessage.trim()}
            className="btn-primary inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 disabled:pointer-events-none disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}; 