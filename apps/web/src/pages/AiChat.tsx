import { useEffect, useState, useMemo } from 'react';
import { useAiStore, useAuthStore, useOrganizationStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { analytics } from '@paynless/analytics';
import { ModelSelector } from '../components/ai/ModelSelector';
import { PromptSelector } from '../components/ai/PromptSelector';
import { AiChatbox } from '../components/ai/AiChatbox';
import { ChatHistoryList } from '../components/ai/ChatHistoryList';
import { ChatContextSelector } from '../components/ai/ChatContextSelector';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Chat } from '@paynless/types'; // Import Chat type
// import type { Organization, AiProvider, SystemPrompt } from '@paynless/types'; // Organization, AiProvider, SystemPrompt commented out as they are not used
// import type { Chat } from '@paynless/types'; // Chat type might no longer be needed here if currentChatHistoryList is removed

export default function AiChatPage() {
  // Get user, session, and loading state from auth store
  const { user } = useAuthStore((state) => ({ 
      user: state.user, 
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
    chatsByContext, // Added to destructure from useAiStore
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
    chatsByContext: state.chatsByContext, // Get chatsByContext
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

  // Set default selections for provider when they load
  useEffect(() => {
    if (!selectedProviderId && availableProviders && availableProviders.length > 0) {
      setSelectedProviderId(availableProviders[0].id);
    }
  }, [availableProviders, selectedProviderId]);

  // Set default selections for prompt initially, or when currentChatDetails changes
  useEffect(() => {
    if (currentChatDetails && currentChatDetails.system_prompt_id) {
      setSelectedPromptId(currentChatDetails.system_prompt_id);
    } else if (currentChatId) { // A chat is loaded, but no specific system_prompt_id or no details yet
      // Fallback to first available if no specific prompt from chat OR if chat details are not yet loaded but a chat is selected
      // This ensures that if a chat is selected, we try to set a prompt, even if it means default.
      if (!selectedPromptId && availablePrompts && availablePrompts.length > 0) {
         setSelectedPromptId(availablePrompts[0].id);
      }
    } else if (!currentChatId && !selectedPromptId && availablePrompts && availablePrompts.length > 0) {
      // No chat selected (e.g. initial load before any interaction, or after new chat that hasn't set one), set to default
      setSelectedPromptId(availablePrompts[0].id);
    }
  }, [currentChatId, currentChatDetails, availablePrompts, selectedPromptId]); // Added selectedPromptId to dependencies to avoid stale closures if logic becomes more complex

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
    // setHasUserManuallySelectedContext(true); // Seems unused
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
    // For a new chat, selectedPromptId should also reset to the default/first available, or handled by the useEffect if currentChatId becomes null then.
    setSelectedPromptId(availablePrompts && availablePrompts.length > 0 ? availablePrompts[0].id : null);
  };

  const handleLoadChat = (chat: Chat) => {
    if (chat.id === currentChatId) return;
    logger.info(`[AiChatPage] Loading chat:`, { chatId: chat.id, chatTitle: chat.title });
    analytics.track('Chat: History Item Selected', { chatId: chat.id });

    // Update chatsByContext in the store with the selected chat details
    // This ensures currentChatDetails in AiChatPage will be up-to-date
    useAiStore.setState(state => {
      const orgId = chat.organization_id;
      // const contextKey = orgId || 'personal'; // 'personal' if orgId is null - Removed as unused

      let updatedChatsByContext = { ...state.chatsByContext };

      if (orgId) {
        const orgChats = [...(state.chatsByContext.orgs[orgId] || [])];
        const existingChatIndex = orgChats.findIndex(c => c.id === chat.id);
        if (existingChatIndex !== -1) {
          orgChats[existingChatIndex] = chat; // Update existing chat
        } else {
          orgChats.push(chat); // Add new chat
        }
        updatedChatsByContext = {
          ...updatedChatsByContext,
          orgs: { ...updatedChatsByContext.orgs, [orgId]: orgChats }
        };
      } else {
        const personalChats = [...(state.chatsByContext.personal || [])];
        const existingChatIndex = personalChats.findIndex(c => c.id === chat.id);
        if (existingChatIndex !== -1) {
          personalChats[existingChatIndex] = chat; // Update existing chat
        } else {
          personalChats.push(chat); // Add new chat
        }
        updatedChatsByContext = {
          ...updatedChatsByContext,
          personal: personalChats
        };
      }
      return { chatsByContext: updatedChatsByContext };
    });

    loadChatDetails(chat.id); // This action in store remains focused on loading messages and setting currentChatId

    // Provider still resets to default or first available.
    setSelectedProviderId(availableProviders && availableProviders.length > 0 ? availableProviders[0].id : null);
    // DO NOT reset selectedPromptId here; the useEffect listening to currentChatDetails will handle it.
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
              <Button variant="default" onClick={handleNewChat} className="ml-auto" data-testid="new-chat-button">
                <Plus className="mr-2 h-4 w-4" /> New Chat
              </Button>
            </div>
          </div>
           
           <div className="flex-grow overflow-y-auto p-4"> {/* Main content area with scroll */}
             <AiChatbox 
               isAnonymous={isAnonymous}
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