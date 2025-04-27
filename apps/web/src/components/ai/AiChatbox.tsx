'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useAiStore } from '@paynless/store'
import type { ChatMessage } from '@paynless/types'
import { logger } from '@paynless/utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { okaidia } from 'react-syntax-highlighter/dist/esm/styles/prism'; // Adjust path as needed
import rehypeSanitize from 'rehype-sanitize';

// Assuming existing cn utility
// import { Textarea } from '@/components/ui/textarea';
// import { Button } from '@/components/ui/button';
// import { ScrollArea } from '@/components/ui/scroll-area';
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
// import { Terminal, Loader2 } from "lucide-react"
import { Terminal, Loader2 } from 'lucide-react' // Keep lucide icons

interface AiChatboxProps {
  providerId: string | null
  promptId: string | null
  isAnonymous: boolean
  // Optional callback for when limit is reached, handled by parent
}

export const AiChatbox: React.FC<AiChatboxProps> = ({
  providerId,
  promptId,
}) => {
  const [inputMessage, setInputMessage] = useState('')
  const scrollContainerRef = useRef<HTMLDivElement>(null); // Ref for the scrollable container

  // Fetch state and actions from the store
  const {
    currentChatMessages,
    currentChatId,
    isLoadingAiResponse,
    aiError,
    sendMessage,
    clearAiError,
  } = useAiStore()

  // Scroll to new messages
  useEffect(() => {
    const latestMessage = currentChatMessages[currentChatMessages.length - 1];
    if (latestMessage && latestMessage.role === 'assistant') { 
      const container = scrollContainerRef.current;
      if (!container) {
        return;
      }

      const messageElements = container.querySelectorAll('[data-message-id]');
      const lastMessageElement = messageElements?.[messageElements.length - 1] as HTMLElement | undefined;

      if (lastMessageElement) {
        const targetScrollTop = lastMessageElement.offsetTop - container.offsetTop; 
        requestAnimationFrame(() => {
           container.scrollTop = targetScrollTop;
        });
      }
    }
  }, [currentChatMessages]); 

  const handleSend = async () => {
    if (!inputMessage.trim() || isLoadingAiResponse) return
    if (!providerId) {
      logger.error('[AiChatbox] Cannot send message: Provider ID is missing.')
      return
    }
    if (!promptId) {
      logger.error('[AiChatbox] Cannot send message: Prompt ID is missing.')
      return
    }

    clearAiError() // Clear previous errors
    const messageToSend = inputMessage
    setInputMessage('') // Clear input immediately

    try {
      const result = await sendMessage({
        message: messageToSend,
        providerId,
        promptId,
        chatId: currentChatId ?? undefined,
      })

      if (
        result &&
        typeof result === 'object' &&
        'error' in result &&
        result.error === 'limit_reached'
      ) {
        logger.warn('[AiChatbox] Anonymous limit reached.')
        // Optionally call parent handler
        // TODO: Restore input message if needed, or handle in parent
        // setInputMessage(messageToSend);
      } else if (result && typeof result === 'object' && 'error' in result) {
        // Handle other potential errors returned from sendMessage
      }
    } catch (error: unknown) {
      // Errors should ideally be caught and set in the store's aiError state
      // by the sendMessage action itself.
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error('[AiChatbox] Unexpected error calling sendMessage:', {
        error: errorMessage,
      })
      // Restore input message on unexpected error?
      // setInputMessage(messageToSend);
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(event.target.value)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault() // Prevent newline
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full border rounded-md p-4 space-y-4">
      {/* Message Display Area */}
      <div 
        className="flex-grow pr-4 overflow-y-auto min-h-[200px]"
        ref={scrollContainerRef}
      >
        <div className="space-y-4">
          {currentChatMessages.map((msg: ChatMessage) => (
            <div
              key={msg.id}
              data-message-id={msg.id}
              className={cn(
                'flex w-max max-w-[75%] flex-col gap-2 rounded-lg px-3 py-2 text-sm',
                msg.role === 'user'
                  ? 'ml-auto bg-[rgb(var(--color-primary))] text-white'
                  : 'bg-[rgb(var(--color-surface))] text-textPrimary'
              )}
            >
              <div className="markdown-content w-full">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                  components={{
                    code(props) {
                      const {children, className, node, ...rest} = props
                      const match = /language-(\\w+)/.exec(className || '')
                      return match ? (
                        <SyntaxHighlighter
                          {...rest}
                          PreTag="div"
                          children={String(children).replace(/\\n$/, '')}
                          language={match[1]}
                          style={okaidia} // Choose your style
                          className="whitespace-pre-wrap break-words"
                        />
                      ) : (
                        <code {...rest} className={cn(className, "whitespace-pre-wrap break-words")}>
                          {children}
                        </code>
                      )
                    }
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
              {/* Add timestamp below the message content */}
              {msg.created_at && (
                <div className={cn(
                  "text-xs mt-1",
                  msg.role === 'user' 
                    ? "text-gray-200/80" /* Lighter text on dark user bubble */
                    : "text-[rgb(var(--color-textSecondary))]" /* Muted text on light assistant bubble */
                )}>
                  {/* Format date and time using toLocaleString */}
                  {new Date(msg.created_at).toLocaleString([], {
                    year: 'numeric', month: 'numeric', day: 'numeric', 
                    hour: 'numeric', minute: '2-digit' 
                  })}
                </div>
              )}
            </div>
          ))}
          {isLoadingAiResponse && (
            <div className="flex items-center space-x-2 justify-start">
              <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--color-textSecondary))]" />
              <span className="text-sm text-[rgb(var(--color-textSecondary))]">
                Assistant is thinking...
              </span>
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
          <p className="text-sm mt-1">{aiError}</p>
        </div>
      )}

      {/* Input Area */}
      <div className="flex items-center space-x-2 border-t pt-4 border-[rgb(var(--color-border))]">
        {/* Standard textarea */}
        <Textarea
          placeholder="Type your message here..."
          value={inputMessage}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          rows={1}
          className="flex-grow resize-none min-h-[40px] max-h-[150px] overflow-y-auto"
          disabled={isLoadingAiResponse}
        />
        {/* Standard button */}
        <Button
          onClick={handleSend}
          disabled={isLoadingAiResponse || !inputMessage.trim()}
        >
          Send
        </Button>
      </div>
    </div>
  )
}
