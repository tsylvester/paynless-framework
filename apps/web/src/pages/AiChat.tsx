import { useEffect, useState, useMemo } from 'react';
import { useAiStore, useAuthStore, useOrganizationStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { analytics } from '@paynless/analytics';
import { ModelSelector } from '../components/ai/ModelSelector';
import { PromptSelector } from '../components/ai/PromptSelector';
import { AiChatbox } from '../components/ai/AiChatbox';
import { ChatHistoryList } from '../components/ai/ChatHistoryList';
import { ChatContextSelector } from '../components/ai/ChatContextSelector';
// import type { Chat, Organization, AiProvider, SystemPrompt } from '@paynless/types'; // Organization, AiProvider, SystemPrompt commented out as they are not used
// import type { Chat } from '@paynless/types'; // Chat type might no longer be needed here if currentChatHistoryList is removed

export default function AiChatPage() {
  // Get user, session, and loading state from auth store
  const { user, isLoading: isAuthLoading } = useAuthStore((state) => ({ 
      user: state.user, 
      isLoading: state.isLoading
  }));
  
  const {
    loadAiConfig,
    // loadChatHistory, // No longer called directly by AiChatPage
    loadChatDetails,
    startNewChat,
    currentChatId,
    availableProviders,
    availablePrompts,
    checkAndReplayPendingChatAction,
    // chatsByContext, // No longer used to derive currentChatHistoryList
    // isLoadingHistoryByContext, // No longer used to derive currentIsHistoryLoading
  } = useAiStore((state) => ({
    loadAiConfig: state.loadAiConfig,
    // loadChatHistory: state.loadChatHistory,
    loadChatDetails: state.loadChatDetails,
    startNewChat: state.startNewChat,
    currentChatId: state.currentChatId,
    availableProviders: state.availableProviders,
    availablePrompts: state.availablePrompts,
    checkAndReplayPendingChatAction: state.checkAndReplayPendingChatAction,
    // chatsByContext: state.chatsByContext,
    // isLoadingHistoryByContext: state.isLoadingHistoryByContext,
  }));

  // Organization Store data
  const { 
    currentOrganizationId: globalCurrentOrgId, 
    userOrganizations,
  } = useOrganizationStore(state => ({
    currentOrganizationId: state.currentOrganizationId,
    userOrganizations: state.userOrganizations,
  }));

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [nextChatOrgContext, setNextChatOrgContext] = useState<string | null | undefined>(undefined);
  const [hasUserManuallySelectedContext, setHasUserManuallySelectedContext] = useState(false);

  // --- Derived display names for the header --- (Commented out as dynamicHeaderText is not currently used in h2)
  /*
  const currentContextDisplayName = useMemo(() => {
    if (typeof nextChatOrgContext === 'undefined') return ''; // Or 'Loading Context...'
    if (nextChatOrgContext === null) return 'Personal';
    const org = userOrganizations.find((o: Organization) => o.id === nextChatOrgContext);
    return org?.name || 'Context'; // Fallback if org not found
  }, [nextChatOrgContext, userOrganizations]);

  const selectedProviderName = useMemo(() => {
    if (!selectedProviderId || !availableProviders) return '';
    const provider = availableProviders.find((p: AiProvider) => p.id === selectedProviderId);
    return provider?.name || ''; // Fallback if provider not found
  }, [selectedProviderId, availableProviders]);

  const selectedPromptName = useMemo(() => {
    if (!selectedPromptId || !availablePrompts) return '';
    const prompt = availablePrompts.find((p: SystemPrompt) => p.id === selectedPromptId);
    return prompt?.name || ''; // Fallback if prompt not found
  }, [selectedPromptId, availablePrompts]);

  const dynamicHeaderText = useMemo(() => {
    let title = currentContextDisplayName ? `${currentContextDisplayName} Chat` : 'AI Chat';
    const details = [selectedProviderName, selectedPromptName].filter(Boolean).join(' / ');
    if (details) {
      title += ` (${details})`;
    }
    return title;
  }, [currentContextDisplayName, selectedProviderName, selectedPromptName]);
  */

  // Load AI config (public)
  useEffect(() => {
    logger.info('[AiChatPage] Config effect running.');
    loadAiConfig();
  }, [loadAiConfig]);

  // Initialize or update nextChatOrgContext from globalCurrentOrgId
  useEffect(() => {
    console.log(`[AiChatPage CONSOLE] Initializing/syncing nextChatOrgContext (current: ${nextChatOrgContext}, global: ${globalCurrentOrgId})`);
    setNextChatOrgContext(globalCurrentOrgId);
  }, [globalCurrentOrgId]);

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

  const handleProviderChange = (providerId: string | null) => {
    setSelectedProviderId(providerId);
    analytics.track('Chat: Provider Selected', { providerId });
  };

  const handlePromptChange = (promptId: string | null) => {
    setSelectedPromptId(promptId);
    analytics.track('Chat: Prompt Selected', { promptId });
  };

  const handleContextSelection = (newContextId: string | null) => {
    console.log(`[AiChatPage CONSOLE] User selected next chat context: ${newContextId}`);
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
          <div className="p-4 border-b border-border sticky top-0 bg-card z-10 space-y-2">
            <div>
              {/*<h2 className="text-lg font-semibold text-card-foreground">
                dynamicHeaderText
              </h2>*/}
            </div>
            
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <ChatContextSelector
                currentContextId={typeof nextChatOrgContext === 'undefined' ? null : nextChatOrgContext}
                onContextChange={handleContextSelection}
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
          </div>
           
           <div className="flex-grow overflow-y-auto p-4"> {/* Main content area with scroll */}
             <AiChatbox 
               providerId={selectedProviderId} 
               promptId={selectedPromptId}
               key={`${currentChatId}-${selectedProviderId}-${selectedPromptId}-${nextChatOrgContext}`} // Add nextChatOrgContext to key
             />
           </div>
        </div>

        {/* Chat History Sidebar */}
        <aside className="md:col-span-1 flex flex-col border border-border rounded-lg bg-card shadow-sm overflow-y-auto min-h-0 max-h-[calc(100vh-12rem)]">
          <ChatHistoryList
            activeContextId={typeof nextChatOrgContext === 'undefined' ? null : nextChatOrgContext}
            currentChatId={currentChatId}
            onLoadChat={handleLoadChat}
            contextTitle={nextChatOrgContext === null ? "Personal Chats" : (userOrganizations?.find(org => org.id === nextChatOrgContext)?.name || "Organization") + " Chats"}
          />
        </aside>
      </div>
    </div>
  );
} 