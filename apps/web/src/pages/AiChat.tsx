import { useEffect, useMemo } from 'react';
import { useAiStore, useAuthStore, useOrganizationStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { analytics } from '@paynless/analytics';
import { ModelSelector } from '../components/ai/ModelSelector';
import { PromptSelector } from '../components/ai/PromptSelector';
import { AiChatbox } from '../components/ai/AiChatbox';
import { ChatHistoryList } from '../components/ai/ChatHistoryList';
import { ChatContextSelector } from '../components/ai/ChatContextSelector';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import type { Chat } from '@paynless/types'; // Import Chat type
import ErrorBoundary from '../components/common/ErrorBoundary'; // Added ErrorBoundary
// import type { Organization, AiProvider, SystemPrompt } from '@paynless/types'; // Organization, AiProvider, SystemPrompt commented out as they are not used
// import type { Chat } from '@paynless/types'; // Chat type might no longer be needed here if currentChatHistoryList is removed

export default function AiChatPage() {
  // Get user, session, and loading state from auth store
  const { user } = useAuthStore((state) => ({ 
      user: state.user, 
  }));
  
  const {
    loadAiConfig,
    loadChatDetails,
    startNewChat,
    currentChatId,
    availablePrompts,
    checkAndReplayPendingChatAction,
    chatsByContext, 
    isDetailsLoading, 
    selectedProviderId,
    selectedPromptId,
    setSelectedPrompt,
    selectedChatContextForNewChat,
  } = useAiStore((state) => ({
    loadAiConfig: state.loadAiConfig,
    loadChatDetails: state.loadChatDetails,
    startNewChat: state.startNewChat,
    currentChatId: state.currentChatId,
    availableProviders: state.availableProviders,
    availablePrompts: state.availablePrompts,
    checkAndReplayPendingChatAction: state.checkAndReplayPendingChatAction,
    chatsByContext: state.chatsByContext,
    isDetailsLoading: state.isDetailsLoading,
    selectedProviderId: state.selectedProviderId,
    selectedPromptId: state.selectedPromptId,
    setSelectedPrompt: state.setSelectedPrompt,
    selectedChatContextForNewChat: state.selectedChatContextForNewChat,
  }));

  // Organization Store data
  const { 
    currentOrganizationId: globalCurrentOrgId, 
    userOrganizations,
  } = useOrganizationStore(state => ({
    currentOrganizationId: state.currentOrganizationId,
    userOrganizations: state.userOrganizations,
  }));

  const [nextChatOrgContext, setNextChatOrgContext] = useState<string | null | undefined>(undefined);
  // const [hasUserManuallySelectedContext, setHasUserManuallySelectedContext] = useState(false); // This state seems unused, consider removing if not needed for other logic.

  const isAnonymous = !user; // Derive isAnonymous

  // --- Selector for current chat details (conceptual) ---
  const currentChatDetails: Chat | null | undefined = useMemo(() => {
    if (!currentChatId || !chatsByContext) return null;
    // Check personal chats
    const personalChat = chatsByContext.personal?.find(c => c.id === currentChatId);
    if (personalChat) return personalChat;
    // Check org chats
    if (chatsByContext.orgs) {
      for (const orgId in chatsByContext.orgs) {
        const orgChats = chatsByContext.orgs[orgId];
        const orgChat = orgChats?.find(c => c.id === currentChatId);
        if (orgChat) return orgChat;
      }
    }
    return null;
  }, [currentChatId, chatsByContext]);

  // Load AI config (public)
  useEffect(() => {
    logger.info('[AiChatPage] Config effect running.');
    loadAiConfig();
  }, [loadAiConfig]);

  // Check for pending chat action on mount
  useEffect(() => {
    logger.info('[AiChatPage] Checking for pending chat action on mount...');
    if (checkAndReplayPendingChatAction) { 
      checkAndReplayPendingChatAction();
    } else {
      logger.warn('[AiChatPage] checkAndReplayPendingChatAction function not found in aiStore yet.')
    }
  }, [checkAndReplayPendingChatAction]);

  // Effect to handle selectedPromptId based on loaded chat or initial default.
  // Default provider selection is handled by loadAiConfig and startNewChat in the store.
  useEffect(() => {
    if (currentChatDetails && currentChatDetails.system_prompt_id) {
      // If a chat is loaded and has a specific system_prompt_id, set it as the selectedPromptId
      // Only update if it's different from the current selectedPromptId to avoid unnecessary calls/renders
      if (selectedPromptId !== currentChatDetails.system_prompt_id) {
        setSelectedPrompt(currentChatDetails.system_prompt_id);
        logger.info(`[AiChatPage] Prompt set from loaded chat details: ${currentChatDetails.system_prompt_id}`);
      }
    } else if (!currentChatId && availablePrompts && availablePrompts.length > 0) {
      // If no chat is currently active (e.g., initial page load before any chat selection or new chat)
      // and no prompt is selected yet, default to the first available prompt.
      if (!selectedPromptId) {
        setSelectedPrompt(availablePrompts[0].id);
        logger.info(`[AiChatPage] Default prompt set (no active chat): ${availablePrompts[0].id}`);
      }
    }
    // Note: The store's startNewChat action now handles setting a default prompt for brand new chats.
    // This useEffect primarily syncs the prompt when an existing chat is loaded or sets an initial page default.
  }, [currentChatId, currentChatDetails, availablePrompts, selectedPromptId, setSelectedPrompt]);

  // Load chat ID from localStorage on redirect
  useEffect(() => {
    const chatIdToLoad = localStorage.getItem('loadChatIdOnRedirect');
    if (chatIdToLoad) {
      localStorage.removeItem('loadChatIdOnRedirect');
      logger.info(`[AiChatPage] Found chatId ${chatIdToLoad} in localStorage, loading details...`);
      loadChatDetails(chatIdToLoad);
    } 
  }, [loadChatDetails]);

  // const handlePromptChange = (promptId: string | null) => { // Removed as PromptSelector handles its own state via store
  //   setSelectedPrompt(promptId); 
  //   analytics.track('Chat: Prompt Selected', { promptId });
  // };

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

    // Reset selected provider and prompt in the store to defaults
    if (availableProviders && availableProviders.length > 0) {
        // Prioritize dummy provider in dev for new chats as well
        if ((import.meta as any).env.MODE === 'development') {
            const dummy = availableProviders.find(p => p.id === 'dummy-test-provider');
            if (dummy) {
                setSelectedProvider(dummy.id);
            } else {
                setSelectedProvider(availableProviders[0].id);
            }
        } else {
            setSelectedProvider(availableProviders[0].id);
        }
    } else {
        setSelectedProvider(null);
    }

    if (availablePrompts && availablePrompts.length > 0) {
        setSelectedPrompt(availablePrompts[0].id);
    } else {
        setSelectedPrompt(null);
    }
  };

  const activeContextIdForHistory = typeof nextChatOrgContext === 'undefined' ? globalCurrentOrgId : nextChatOrgContext;
  
  const contextTitleForHistory = useMemo(() => {
    if (typeof activeContextIdForHistory === 'undefined') return 'Loading History...'; // Should ideally not happen if nextChatOrgContext defaults properly
    if (activeContextIdForHistory === null) return 'Personal Chat History';
    const org = userOrganizations.find(o => o.id === activeContextIdForHistory);
    return org ? `${org.name} Chat History` : 'Organization Chat History';
  }, [activeContextIdForHistory, userOrganizations]);

  return (
    <ErrorBoundary>
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
                <Button variant="default" onClick={handleNewChat} className="ml-auto" data-testid="new-chat-button">
                  <Plus className="mr-2 h-4 w-4" /> New Chat
                </Button>
              </div>
            </div>
            
            <div className="flex-grow overflow-y-auto p-4"> {/* Main content area with scroll */}
              {isDetailsLoading ? (
                <div className="space-y-4 p-4">
                  <Skeleton className="h-16 w-3/4" />
                  <Skeleton className="h-12 w-1/2 self-end ml-auto" />
                  <Skeleton className="h-20 w-3/4" />
                  <Skeleton className="h-10 w-2/5 self-end ml-auto" />
                </div>
              ) : (
                <AiChatbox 
                  isAnonymous={isAnonymous}
                  key={`${currentChatId}-${selectedProviderId}-${selectedPromptId}-${nextChatOrgContext}`} 
                />
              )}
            </div>
          </div>

          <div className="md:col-span-1 flex flex-col space-y-4 min-h-0 max-h-[calc(100vh-12rem)]">
            <ChatHistoryList 
              activeContextId={activeContextIdForHistory} 
              currentChatId={currentChatId} 
              contextTitle={contextTitleForHistory} 
            />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
} 