import { useEffect, useState, useMemo } from 'react';
import { useAiStore, useAuthStore, useOrganizationStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { analytics } from '@paynless/analytics';
import { ModelSelector } from '../components/ai/ModelSelector';
import { PromptSelector } from '../components/ai/PromptSelector';
import { AiChatbox } from '../components/ai/AiChatbox';
import { ChatHistoryList } from '../components/ai/ChatHistoryList';
import { ChatContextSelector } from '../components/ai/ChatContextSelector';
import type { Chat } from '@paynless/types';

export default function AiChatPage() {
  // Get user, session, and loading state from auth store
  const { user, isLoading: isAuthLoading } = useAuthStore((state) => ({ 
      user: state.user, 
      isLoading: state.isLoading
  }));
  
  const {
    loadAiConfig,
    loadChatHistory,
    loadChatDetails,
    startNewChat,
    currentChatId,
    availableProviders,
    availablePrompts,
    checkAndReplayPendingChatAction,
    chatsByContext,
    isLoadingHistoryByContext,
  } = useAiStore((state) => ({
    loadAiConfig: state.loadAiConfig,
    loadChatHistory: state.loadChatHistory,
    loadChatDetails: state.loadChatDetails,
    startNewChat: state.startNewChat,
    currentChatId: state.currentChatId,
    availableProviders: state.availableProviders,
    availablePrompts: state.availablePrompts,
    checkAndReplayPendingChatAction: state.checkAndReplayPendingChatAction,
    chatsByContext: state.chatsByContext,
    isLoadingHistoryByContext: state.isLoadingHistoryByContext,
  }));

  // Organization Store data
  const { 
    userOrganizations, 
    currentOrganizationId: globalCurrentOrgId, 
    isOrgLoading,
  } = useOrganizationStore(state => ({
    userOrganizations: state.userOrganizations,
    currentOrganizationId: state.currentOrganizationId,
    isOrgLoading: state.isLoading, 
  }));

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [nextChatOrgContext, setNextChatOrgContext] = useState<string | null | undefined>(undefined);
  const [hasUserManuallySelectedContext, setHasUserManuallySelectedContext] = useState(false);

  // Load AI config (public)
  useEffect(() => {
    logger.info('[AiChatPage] Config effect running.');
    loadAiConfig();
  }, [loadAiConfig]);

  // Initialize or update nextChatOrgContext from globalCurrentOrgId
  useEffect(() => {
    if (!hasUserManuallySelectedContext && typeof globalCurrentOrgId !== 'undefined') {
      if (nextChatOrgContext === undefined || nextChatOrgContext !== globalCurrentOrgId) {
        logger.info(`[AiChatPage] Initializing/syncing nextChatOrgContext from globalCurrentOrgId: ${globalCurrentOrgId}`);
        setNextChatOrgContext(globalCurrentOrgId);
      }
    }
  }, [globalCurrentOrgId, hasUserManuallySelectedContext, nextChatOrgContext]);

  // Load chat history based on user, auth status, and selected context
  useEffect(() => {
    logger.info('[AiChatPage] History effect running.', { isAuthLoading, hasUser: !!user, context: nextChatOrgContext });
    if (!isAuthLoading && user && typeof nextChatOrgContext !== 'undefined') {
        logger.info(`[AiChatPage] Auth finished, user found, context defined. Loading history for context: ${nextChatOrgContext === null ? 'Personal' : nextChatOrgContext}`);
        loadChatHistory(nextChatOrgContext);
    } else if (isAuthLoading) {
        logger.info('[AiChatPage] Auth still loading, waiting to load history...');
    } else if (!user) {
        logger.warn('[AiChatPage] Auth finished but no user found, skipping chat history load.');
    } else if (typeof nextChatOrgContext === 'undefined') {
        logger.info('[AiChatPage] Context not yet defined, waiting to load history...');
    }
  }, [loadChatHistory, user, isAuthLoading, nextChatOrgContext]);

  // Check for pending chat action on mount
  useEffect(() => {
    logger.info('[AiChatPage] Checking for pending chat action on mount...');
    if (checkAndReplayPendingChatAction) { 
      checkAndReplayPendingChatAction();
    } else {
      logger.warn('[AiChatPage] checkAndReplayPendingChatAction function not found in aiStore yet.')
    }
  }, [checkAndReplayPendingChatAction]);

  // Set default selections for provider/prompt when they load
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

  // Load chat ID from localStorage on redirect
  useEffect(() => {
    const chatIdToLoad = localStorage.getItem('loadChatIdOnRedirect');
    if (chatIdToLoad) {
      localStorage.removeItem('loadChatIdOnRedirect');
      logger.info(`[AiChatPage] Found chatId ${chatIdToLoad} in localStorage, loading details...`);
      loadChatDetails(chatIdToLoad);
    } 
  }, [loadChatDetails]);

  // Derive chatHistoryList and isHistoryLoading based on nextChatOrgContext
  const currentChatHistoryList: Chat[] = useMemo(() => {
    if (typeof nextChatOrgContext === 'undefined' || !chatsByContext) return [];
    if (nextChatOrgContext === null) { // Personal context
      return chatsByContext.personal || [];
    }
    // Org context
    return chatsByContext.orgs?.[nextChatOrgContext] || [];
  }, [nextChatOrgContext, chatsByContext]);

  const currentIsHistoryLoading: boolean = useMemo(() => {
    if (typeof nextChatOrgContext === 'undefined' || !isLoadingHistoryByContext) return false;
    if (nextChatOrgContext === null) { // Personal context
      return isLoadingHistoryByContext.personal || false;
    }
    // Org context
    return isLoadingHistoryByContext.orgs?.[nextChatOrgContext] || false;
  }, [nextChatOrgContext, isLoadingHistoryByContext]);

  const handleProviderChange = (providerId: string | null) => {
    setSelectedProviderId(providerId);
    analytics.track('Chat: Provider Selected', { providerId });
  };

  const handlePromptChange = (promptId: string | null) => {
    setSelectedPromptId(promptId);
    analytics.track('Chat: Prompt Selected', { promptId });
  };

  const handleContextSelection = (newContextId: string | null) => {
    setHasUserManuallySelectedContext(true);
    setNextChatOrgContext(newContextId);
    analytics.track('Chat: Context Selected For New Chat', {
      contextId: newContextId === null ? 'personal' : newContextId,
    });
    logger.info(`[AiChatPage] User selected next chat context: ${newContextId}`);
  };

  const handleNewChat = () => {
    logger.info(`[AiChatPage] Starting new chat with context: ${nextChatOrgContext}`);
    const contextIdForAnalytics = typeof nextChatOrgContext === 'undefined' 
        ? (globalCurrentOrgId === null ? 'personal' : globalCurrentOrgId || 'unknown') 
        : (nextChatOrgContext === null ? 'personal' : nextChatOrgContext);

    analytics.track('Chat: Clicked New Chat', {
       contextId: contextIdForAnalytics
    });
    
    const contextForNewChat = typeof nextChatOrgContext === 'undefined' ? globalCurrentOrgId : nextChatOrgContext;
    startNewChat(contextForNewChat); 

    setSelectedProviderId(availableProviders && availableProviders.length > 0 ? availableProviders[0].id : null);
    setSelectedPromptId(availablePrompts && availablePrompts.length > 0 ? availablePrompts[0].id : null);
  };

  const handleLoadChat = (chatId: string) => {
    if (chatId === currentChatId) return;
    logger.info(`[AiChatPage] Loading chat details for: ${chatId}`);
    analytics.track('Chat: History Item Selected', { chatId });
    loadChatDetails(chatId); 
    setSelectedProviderId(availableProviders && availableProviders.length > 0 ? availableProviders[0].id : null);
    setSelectedPromptId(availablePrompts && availablePrompts.length > 0 ? availablePrompts[0].id : null);
  };

  return (
    <div>
      <div className="container mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6"> 
        <div className="md:col-span-2 flex flex-col border border-border rounded-lg bg-card shadow-sm overflow-y-auto min-h-0 max-h-[calc(100vh-12rem)]"> 
          <div className="p-4 border-b border-border flex flex-wrap items-center gap-4 sticky top-0 bg-card z-10"> 
            <h2 className="text-lg font-semibold text-card-foreground mr-auto whitespace-nowrap">AI Chat</h2>
            
            <ChatContextSelector
              organizations={userOrganizations}
              currentContextId={typeof nextChatOrgContext === 'undefined' ? null : nextChatOrgContext}
              onContextChange={handleContextSelection}
              isLoading={isOrgLoading || isAuthLoading} 
            />

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
              data-testid="new-chat-button"
            >
              New Chat
            </button>
          </div>
           
           <div className="flex-grow min-h-0"> 
             <AiChatbox 
               isAnonymous={false} 
               providerId={selectedProviderId}
               promptId={selectedPromptId}
               key={currentChatId || 'new'} 
             />
           </div>
        </div>

        <div className="md:col-span-1 border border-border rounded-lg bg-card shadow-sm flex flex-col overflow-y-auto min-h-0 max-h-[calc(100vh-12rem)]"> 
           <div className="p-4 border-b border-border sticky top-0 bg-card/80 backdrop-blur-md z-10">
             <h2 className="text-lg font-semibold text-card-foreground">Chat History</h2>
           </div>
          <ChatHistoryList 
             history={currentChatHistoryList}
             onLoadChat={handleLoadChat}
             isLoading={isAuthLoading || currentIsHistoryLoading} 
             currentChatId={currentChatId}
          />
        </div>
      </div>
    </div>
  );
} 