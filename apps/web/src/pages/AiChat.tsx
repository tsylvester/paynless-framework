import { useEffect, useState } from 'react';
import { useAiStore, useAuthStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { analytics } from '@paynless/analytics-client';
import { ModelSelector } from '../components/ai/ModelSelector';
import { PromptSelector } from '../components/ai/PromptSelector';
import { AiChatbox } from '../components/ai/AiChatbox';
import { Layout } from '../components/layout/Layout';
import { ChatHistoryList } from '../components/ai/ChatHistoryList';

export function AiChatPage() {
  // Get user, session, and loading state from auth store
  const { user, isLoading: isAuthLoading } = useAuthStore((state) => ({ 
      user: state.user, 
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

  // ---> START MODIFICATION: Check for redirect ID on mount <---
  useEffect(() => {
    const chatIdToLoad = localStorage.getItem('loadChatIdOnRedirect');
    if (chatIdToLoad) {
      // If an ID is found, remove it and load that specific chat
      localStorage.removeItem('loadChatIdOnRedirect');
      logger.info(`[AiChatPage] Found chatId ${chatIdToLoad} in localStorage, loading details...`);
      loadChatDetails(chatIdToLoad);
    } 
    // Run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, []); 
  // ---> END MODIFICATION <---

  const handleProviderChange = (providerId: string | null) => {
    setSelectedProviderId(providerId);
    analytics.track('Chat: Provider Selected', { providerId }); // Track provider change
  };

  const handlePromptChange = (promptId: string | null) => {
    setSelectedPromptId(promptId);
    analytics.track('Chat: Prompt Selected', { promptId }); // Track prompt change
  };

  const handleNewChat = () => {
    logger.info('[AiChat] Starting new chat...');
    analytics.track('Chat: Clicked New Chat');
    startNewChat();
    // Reset selections to defaults
    setSelectedProviderId(availableProviders && availableProviders.length > 0 ? availableProviders[0].id : null);
    setSelectedPromptId(availablePrompts && availablePrompts.length > 0 ? availablePrompts[0].id : null);
  };

  const handleLoadChat = (chatId: string) => {
    if (chatId === currentChatId) return; // Avoid reloading the same chat
    logger.info(`[AiChatPage] Loading chat details for: ${chatId}`);
    analytics.track('Chat: History Item Selected', { chatId });
    loadChatDetails(chatId);
    // TODO: Determine how to set provider/prompt when loading history.
    // Maybe store last used provider/prompt with the chat?
    // For now, reset to default.
    setSelectedProviderId(availableProviders && availableProviders.length > 0 ? availableProviders[0].id : null);
    setSelectedPromptId(availablePrompts && availablePrompts.length > 0 ? availablePrompts[0].id : null);
  };

  return (
    <Layout>
      {/* Make grid container grow vertically and respect parent height */}
      <div className="container mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6"> 
        {/* Left Column: Make COLUMN scrollable */}
        <div className="md:col-span-2 flex flex-col border border-border rounded-lg bg-card shadow-sm overflow-y-auto min-h-0 max-h-[calc(100vh-12rem)]"> 
          {/* Header is sticky within the column */} 
          <div className="p-4 border-b border-border flex flex-wrap items-center gap-4 sticky top-0 bg-card z-10"> 
            <h2 className="text-lg font-semibold text-card-foreground mr-auto">AI Chat</h2> 
            
            {/* Controls */}
            <ModelSelector 
              selectedProviderId={selectedProviderId} 
              onProviderChange={handleProviderChange}
            />
            <PromptSelector 
              selectedPromptId={selectedPromptId} 
              onPromptChange={handlePromptChange}
            />
            <button 
              onClick={handleNewChat} 
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap"
            >
              New Chat
            </button>
          </div>
           
           {/* Chatbox Container - Grows but relies on column scroll */} 
           <div className="flex-grow min-h-0"> 
             <AiChatbox 
               isAnonymous={false} 
               providerId={selectedProviderId}
               promptId={selectedPromptId}
               key={currentChatId || 'new'} 
             />
           </div>
        </div>

        {/* Right Column: Make COLUMN scrollable */} 
        <div className="md:col-span-1 border border-border rounded-lg bg-card shadow-sm flex flex-col overflow-y-auto min-h-0 max-h-[calc(100vh-12rem)]"> 
           {/* Header is sticky within the column */} 
           <div className="p-4 border-b border-border sticky top-0 bg-card/80 backdrop-blur-md z-10">
 
             <h2 className="text-lg font-semibold text-card-foreground">Chat History</h2>
           </div>
           {/* History List - Grows but relies on column scroll */} 
          <ChatHistoryList 
             history={chatHistoryList}
             onLoadChat={handleLoadChat}
             isLoading={isAuthLoading || isHistoryLoading} 
          />
        </div>
      </div>
    </Layout>
  );
} 