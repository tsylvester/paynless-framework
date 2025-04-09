import { useEffect, useState } from 'react';
import { useAiStore, useAuthStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { ModelSelector } from '../components/ai/ModelSelector';
import { PromptSelector } from '../components/ai/PromptSelector';
import { AiChatbox } from '../components/ai/AiChatbox';
import { Layout } from '../components/layout/Layout';
import { Chat } from '@paynless/types';

// Chat History component using plain elements and Tailwind
function ChatHistoryList({ history, onLoadChat, isLoading }: { history: Chat[], onLoadChat: (chatId: string) => void, isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading chat history...
      </div>
    );
  }
  
  if (!history || history.length === 0) {
      return (
          <div className="p-4 text-center text-muted-foreground">
              No chat history found.
          </div>
      );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto space-y-2 p-1">
      {history.map((chat) => (
        <div 
          key={chat.id} 
          className="p-3 border border-border rounded-md hover:bg-muted cursor-pointer transition-colors duration-150"
          onClick={() => onLoadChat(chat.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onLoadChat(chat.id); }}
        >
          <p className="font-medium text-sm text-foreground truncate">{chat.title || `Chat ${chat.id.substring(0, 8)}`}</p>
          <p className="text-xs text-muted-foreground mt-1">{new Date(chat.updated_at).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}

export function AiChatPage() {
  // Get user, session, and loading state from auth store
  const { user, session, isLoading: isAuthLoading } = useAuthStore((state) => ({ 
      user: state.user, 
      session: state.session,
      isLoading: state.isLoading // Get the auth loading state
  }));
  
  const {
    loadAiConfig,
    loadChatHistory,
    loadChatDetails,
    startNewChat,
    chatHistoryList,
    isHistoryLoading,
    currentChatId,
    availableProviders,
    availablePrompts
  } = useAiStore((state) => ({
    loadAiConfig: state.loadAiConfig,
    loadChatHistory: state.loadChatHistory,
    loadChatDetails: state.loadChatDetails,
    startNewChat: state.startNewChat,
    chatHistoryList: state.chatHistoryList,
    isHistoryLoading: state.isHistoryLoading,
    currentChatId: state.currentChatId,
    availableProviders: state.availableProviders,
    availablePrompts: state.availablePrompts
  }));

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);

  // Load config (public) and history (auth-required)
  useEffect(() => {
    logger.info('[AiChatPage] Config effect running.');
    loadAiConfig(); // Always load config
  }, [loadAiConfig]); // Separate effect for config

  useEffect(() => {
    logger.info('[AiChatPage] History effect running.', { isAuthLoading, hasUser: !!user });
    // Only load history if auth is finished AND the user is logged in
    if (!isAuthLoading && user) {
        logger.info('[AiChatPage] Auth finished and user found, loading history...');
        loadChatHistory();
    } else if (isAuthLoading) {
        logger.info('[AiChatPage] Auth still loading, waiting to load history...');
    } else {
        logger.warn('[AiChatPage] Auth finished but no user found, skipping chat history load.');
    }
    // Depend on auth loading state and user state
  }, [loadChatHistory, user, isAuthLoading]);

  // Set default selections when providers/prompts load
  useEffect(() => {
    if (!selectedProviderId && availableProviders && availableProviders.length > 0) {
      setSelectedProviderId(availableProviders[0].id);
    }
  }, [availableProviders, selectedProviderId]);

  useEffect(() => {
    if (!selectedPromptId && availablePrompts && availablePrompts.length > 0) {
      setSelectedPromptId(availablePrompts[0].id);
    }
  }, [availablePrompts, selectedPromptId]);

  const handleNewChat = () => {
    logger.info('[AiChatPage] Starting new chat...');
    startNewChat();
    // Reset selections to defaults
    setSelectedProviderId(availableProviders && availableProviders.length > 0 ? availableProviders[0].id : null);
    setSelectedPromptId(availablePrompts && availablePrompts.length > 0 ? availablePrompts[0].id : null);
  };

  const handleLoadChat = (chatId: string) => {
    if (chatId === currentChatId) return; // Avoid reloading the same chat
    logger.info(`[AiChatPage] Loading chat details for: ${chatId}`);
    loadChatDetails(chatId);
    // TODO: Determine how to set provider/prompt when loading history.
    // Maybe store last used provider/prompt with the chat?
    // For now, reset to default.
    setSelectedProviderId(availableProviders && availableProviders.length > 0 ? availableProviders[0].id : null);
    setSelectedPromptId(availablePrompts && availablePrompts.length > 0 ? availablePrompts[0].id : null);
  };

  return (
    <Layout>
      <div className="container mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Chat Interface */}
        <div className="md:col-span-2 flex flex-col h-[calc(100vh-10rem)] border border-border rounded-lg bg-card shadow-sm">
          {/* Header Area */}
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h2 className="text-lg font-semibold text-card-foreground">AI Chat</h2>
            <button 
              onClick={handleNewChat} 
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              New Chat
            </button>
          </div>
          
          {/* Selectors Area */}
          <div className="flex items-center space-x-4 p-4 border-b border-border">
             <ModelSelector 
               selectedProviderId={selectedProviderId} 
               onSelectProvider={setSelectedProviderId} 
             />
             <PromptSelector 
               selectedPromptId={selectedPromptId} 
               onSelectPrompt={setSelectedPromptId} 
             />
           </div>
           
           {/* Chatbox Area - Takes remaining space */}
           <div className="flex-grow overflow-hidden p-4">
             <AiChatbox 
               isAnonymous={false} 
               selectedProviderId={selectedProviderId}
               selectedPromptId={selectedPromptId}
               key={currentChatId || 'new'} 
               onLimitReached={() => { /* Not applicable for authenticated */ }}
             />
           </div>
        </div>

        {/* Right Column: Chat History */}
        <div className="md:col-span-1 border border-border rounded-lg bg-card shadow-sm">
          <div className="p-4 border-b border-border">
             <h2 className="text-lg font-semibold text-card-foreground">Chat History</h2>
           </div>
           {/* Pass auth loading state to history list */}
          <ChatHistoryList 
            history={chatHistoryList}
            onLoadChat={handleLoadChat}
            isLoading={isAuthLoading || isHistoryLoading} // Show loading if auth OR history is loading
          />
        </div>
      </div>
    </Layout>
  );
} 