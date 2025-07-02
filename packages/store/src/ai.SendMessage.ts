import type { 
  ChatMessage, 
  MessageForTokenCounting, 
  ChatApiRequest,
  ILogger,
  AiState,
  PendingAction,
  Chat,
  HandleSendMessageServiceParams,
  InternalProcessResult
} from '@paynless/types';


// --- Core Message Processing (adapts to take logger and token directly) ---
async function coreMessageProcessing(
  params: {
    messageContent: string;
    targetProviderId: string;
    targetPromptId: string | null;
    targetChatId?: string | null;
    selectedContextMessages?: MessageForTokenCounting[];
    effectiveOrganizationId?: string | null;
    token: string; // Auth token is now passed directly
    rewindTargetMessageId?: string | null;
    callChatApi: HandleSendMessageServiceParams['callChatApi'];
    logger: ILogger;
  }
): Promise<InternalProcessResult> {
  const {
    messageContent, targetProviderId, targetPromptId, targetChatId, selectedContextMessages,
    effectiveOrganizationId, token, rewindTargetMessageId, callChatApi, logger,
  } = params;

  logger.info('[coreMessageProcessing] Starting...', { targetProviderId, targetChatId });
  try {
    const apiRequest: ChatApiRequest = {
      message: messageContent, 
      providerId: targetProviderId, 
      promptId: targetPromptId || '__none__',
      ...(targetChatId && { chatId: targetChatId }),
      ...(effectiveOrganizationId && { organizationId: effectiveOrganizationId }),
      ...(rewindTargetMessageId && { rewindFromMessageId: rewindTargetMessageId }),
      contextMessages: selectedContextMessages,
    };
    // Use RequestInit for fetch options, token is passed in headers
    const response = await callChatApi(apiRequest, { headers: { Authorization: `Bearer ${token}` } });

    logger.info('[coreMessageProcessing] API response:', { 
      hasError: !!response.error, 
      hasData: !!response.data,
      errorMessage: response.error?.message,
      responseData: response.data ? {
        hasUserMessage: !!response.data.userMessage,
        hasAssistantMessage: !!response.data.assistantMessage,
        chatId: response.data.chatId,
        isRewind: response.data.isRewind,
        userMessageId: response.data.userMessage?.id,
        assistantMessageId: response.data.assistantMessage?.id
      } : null
    });

    if (response.error || !response.data) {
      return { success: false, error: response.error?.message || 'API error', errorCode: response.error?.code || 'API_ERROR' };
    }
    const { 
      userMessage: finalUserMessage, 
      assistantMessage,
      chatId: newlyCreatedChatId, 
      isRewind 
    } = response.data;
    
    let actualCostWalletTokens: number | undefined = undefined;
    // Assuming token_usage is a valid, if optional, field on assistantMessage (ChatMessageRow)
    if (assistantMessage?.token_usage && typeof assistantMessage.token_usage === 'object') {
        // The type of assistantMessage.token_usage should be inferred from ChatMessageRow (DB schema)
        const usage = assistantMessage.token_usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number, cost?: number }; // Keep cast for specific shape if DB type is JsonValue
        if (usage.cost) {
          actualCostWalletTokens = usage.cost;
        }
    }

    return {
      success: true, 
      finalUserMessage: finalUserMessage as ChatMessage | undefined, 
      assistantMessage: assistantMessage as ChatMessage,
      newlyCreatedChatId, 
      actualCostWalletTokens, 
      wasRewind: isRewind,
    };
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('[coreMessageProcessing] Exception:', { err });
    return { success: false, error: err.message, errorCode: 'UNEXPECTED_PROCESSING_ERROR' };
  }
}

// --- Main Exported Service Function ---
export async function handleSendMessage(
  serviceParams: HandleSendMessageServiceParams
): Promise<ChatMessage | null> {
  const {
    data,
    aiStateService, // Use the service interface
    authService,    // Use the service interface
    walletService,  // Use the service interface
    callChatApi,
    logger,
  } = serviceParams;

  const { message, chatId: inputChatId, contextMessages: providedContextMessages } = data;
  const {
      currentChatId: existingChatIdFromState,
      rewindTargetMessageId: currentRewindTargetId,
      newChatContext,
      selectedProviderId,
      selectedPromptId,
      messagesByChatId,
      selectedMessagesMap,
  } = aiStateService.getAiState(); // Get AiState via the service

  const activeWalletInfo = walletService.getActiveWalletInfo(); // Get wallet info via the service
  const currentUser = authService.getCurrentUser();
  const session = authService.getSession();
  logger.info('[handleSendMessage] Wallet Info:', { activeWalletInfo });

  // --- Wallet Status Check ---
  switch (activeWalletInfo.status) {
      case 'ok': break;
      case 'loading':
          aiStateService.setAiState({ 
            isLoadingAiResponse: false, aiError: currentUser ? (activeWalletInfo.message || 'Wallet loading.') : 'Auth required.', pendingAction: currentUser ? undefined : 'SEND_MESSAGE' });
          if (!currentUser) authService.requestLoginNavigation();
          return null;
      case 'error':
          aiStateService.setAiState({ isLoadingAiResponse: false, aiError: `Wallet Error: ${activeWalletInfo.message || 'Unknown'}` });
          return null;
      case 'consent_required':
          aiStateService.setAiState({ isLoadingAiResponse: false, aiError: activeWalletInfo.message || 'Please accept or decline the use of personal tokens for this organization chat.' });
          return null;
      case 'consent_refused':
          aiStateService.setAiState({ isLoadingAiResponse: false, aiError: activeWalletInfo.message || 'Chat disabled. Consent to use personal tokens was refused.' });
          return null;
      case 'policy_org_wallet_unavailable':
          aiStateService.setAiState({ isLoadingAiResponse: false, aiError: activeWalletInfo.message || 'Organization wallet is selected by policy, but not yet available.' });
          return null;
      default:
          aiStateService.setAiState({ isLoadingAiResponse: false, aiError: activeWalletInfo.message || 'Wallet issue.' });
          return null;
  }

  const token = session?.access_token;
  if (!token) {
      aiStateService.setAiState({ aiError: 'Auth required.', isLoadingAiResponse: false, pendingAction: 'SEND_MESSAGE' });
      authService.requestLoginNavigation();
      return null;
  }

  if (!selectedProviderId) {
      aiStateService.setAiState({ isLoadingAiResponse: false, aiError: 'No AI provider selected.' });
      return null;
  }

  // Use addOptimisticUserMessage from the aiStateService
  const { tempId: tempUserMessageId, chatIdUsed: optimisticMessageChatId } = aiStateService.addOptimisticUserMessage(message, inputChatId);
  
  const effectiveChatIdForApi = inputChatId ?? existingChatIdFromState ?? null;
  let organizationIdForApi: string | undefined | null = undefined;
  if (!effectiveChatIdForApi) {
      organizationIdForApi = newChatContext;
  } else if (activeWalletInfo.type === 'organization' && activeWalletInfo.orgId) {
      organizationIdForApi = activeWalletInfo.orgId;
  }
  const apiPromptId = selectedPromptId === null || selectedPromptId === '__none__' ? '__none__' : selectedPromptId;

  let finalContextMessages: MessageForTokenCounting[] = [];
  if (providedContextMessages && providedContextMessages.length > 0) {
      finalContextMessages = providedContextMessages;
  } else if (optimisticMessageChatId && messagesByChatId[optimisticMessageChatId] && messagesByChatId[optimisticMessageChatId].length > 0) {
      // This is for an existing chat or a chat that was just created optimistically 
      // (e.g. after addOptimisticUserMessage or from a rewind that maintains the same chatId)
      const currentMessages = messagesByChatId[optimisticMessageChatId] || [];
      const currentSelections = selectedMessagesMap[optimisticMessageChatId] || {};
      finalContextMessages = currentMessages
          .filter(m => m.id !== tempUserMessageId && currentSelections[m.id]) // Exclude the current user message being sent, include selected history
          .map((m: ChatMessage) => ({ 
            role: m.role as MessageForTokenCounting['role'], 
            content: m.content 
            // Note: 'name' is omitted as ChatMessage type does not have it, and it's optional in MessageForTokenCounting
          }));
  }
  // If none of the above, finalContextMessages remains an empty array. 
  // This covers new chats where no contextMessages are explicitly provided, 
  // and the types do not currently support deriving context from newChatContext object properties or modelConfig.systemPrompt.

  aiStateService.setAiState({ isLoadingAiResponse: true, aiError: null });

  logger.info('[handleSendMessage] About to call coreMessageProcessing', { 
    messageContent: message, 
    effectiveChatIdForApi, 
    optimisticMessageChatId,
    tempUserMessageId 
  });

  const processingResult = await coreMessageProcessing({
      messageContent: message, targetProviderId: selectedProviderId, targetPromptId: apiPromptId,
      targetChatId: effectiveChatIdForApi, selectedContextMessages: finalContextMessages,
      effectiveOrganizationId: organizationIdForApi, token: token, rewindTargetMessageId: currentRewindTargetId,
      callChatApi, logger,
  });

  logger.info('[handleSendMessage] coreMessageProcessing result:', { 
    success: processingResult.success, 
    hasAssistantMessage: !!processingResult.assistantMessage,
    assistantMessageId: processingResult.assistantMessage?.id,
    finalUserMessageId: processingResult.finalUserMessage?.id,
    newlyCreatedChatId: processingResult.newlyCreatedChatId,
    wasRewind: processingResult.wasRewind,
    error: processingResult.error
  });

  if (!processingResult.success || !processingResult.assistantMessage) {
      if (processingResult.errorCode === 'AUTH_REQUIRED' || processingResult.errorCode === 'TOKEN_EXPIRED') {
          aiStateService.setAiState(state => {
              const newMsgsByChatId = { ...state.messagesByChatId };
              const chatMsgs = newMsgsByChatId[optimisticMessageChatId] || [];
              newMsgsByChatId[optimisticMessageChatId] = chatMsgs.filter(msg => msg.id !== tempUserMessageId);
              return { aiError: processingResult.error || 'Authentication required.', isLoadingAiResponse: false, pendingAction: 'SEND_MESSAGE', messagesByChatId: newMsgsByChatId };
          });
          try {
              const pendingActionDetails: PendingAction<ChatApiRequest> = {
                  endpoint: 'chat', method: 'POST',
                  body: { message, chatId: effectiveChatIdForApi ?? null, organizationId: newChatContext || null, providerId: selectedProviderId, promptId: apiPromptId, contextMessages: finalContextMessages },
                  returnPath: 'chat'
              };
              localStorage.setItem('pendingActionDetails', JSON.stringify(pendingActionDetails));
          } catch (storageError) { logger.error('Failed to store pendingActionDetails:', { storageError }); }
          authService.requestLoginNavigation();
      } else {
          aiStateService.setAiState(state => {
              const newMsgsByChatId = { ...state.messagesByChatId };
              const chatMsgs = newMsgsByChatId[optimisticMessageChatId] || [];
              newMsgsByChatId[optimisticMessageChatId] = chatMsgs.filter(msg => msg.id !== tempUserMessageId);
              return { aiError: processingResult.error || 'Failed to send message.', isLoadingAiResponse: false, messagesByChatId: newMsgsByChatId };
          });
      }
      return null;
  }
  
  const { finalUserMessage, assistantMessage, newlyCreatedChatId, wasRewind } = processingResult;
  let finalChatIdForLog: string | null | undefined = null;

  // The complex state update logic using aiStateService.setAiState
  aiStateService.setAiState((state: AiState) => {
      const isActualRewind = wasRewind ?? !!(inputChatId && currentRewindTargetId);
      const actualNewChatId = newlyCreatedChatId || assistantMessage.chat_id;
      finalChatIdForLog = actualNewChatId;

      if (!actualNewChatId) {
          return { ...state, isLoadingAiResponse: false, aiError: 'Internal error: Chat ID missing.'};
      }
      let messagesForChatProcessing = [...(state.messagesByChatId[optimisticMessageChatId] || [])];
      if (finalUserMessage) {
          messagesForChatProcessing = messagesForChatProcessing.map(msg => msg.id === tempUserMessageId ? { ...finalUserMessage, status: 'sent' as const } as ChatMessage : msg );
      } else {
           messagesForChatProcessing = messagesForChatProcessing.map(msg => msg.id === tempUserMessageId ? { ...msg, chat_id: actualNewChatId, status: 'sent' as const } as ChatMessage : msg );
      }
      if (isActualRewind) {
          const processedUserMsgForRewind = messagesForChatProcessing.find(m => m.role === 'user' && (m.id === finalUserMessage?.id || m.id === tempUserMessageId));
          const newBranchMessages: ChatMessage[] = [];
          if (processedUserMsgForRewind) newBranchMessages.push(processedUserMsgForRewind);
          newBranchMessages.push(assistantMessage);
          let baseHistory: ChatMessage[] = [];
          const rewindPointIdx = (state.messagesByChatId[actualNewChatId] || []).findIndex(m => m.id === currentRewindTargetId);
          if (rewindPointIdx !== -1) {
              baseHistory = (state.messagesByChatId[actualNewChatId] || []).slice(0, rewindPointIdx);
          } else {
              baseHistory = (state.messagesByChatId[optimisticMessageChatId] || []).filter(m => m.id !== tempUserMessageId);
          }
          baseHistory = baseHistory.filter(m => m.id !== tempUserMessageId && m.id !== finalUserMessage?.id);
          messagesForChatProcessing = [...baseHistory, ...newBranchMessages];
      } else {
          if (!messagesForChatProcessing.some(msg => msg.id === assistantMessage.id)) {
              messagesForChatProcessing.push(assistantMessage);
          }
      }
       const newMessagesByChatId = { ...state.messagesByChatId };
       if (optimisticMessageChatId !== actualNewChatId && newMessagesByChatId[optimisticMessageChatId]) {
           newMessagesByChatId[actualNewChatId] = messagesForChatProcessing;
           delete newMessagesByChatId[optimisticMessageChatId];
       } else {
           newMessagesByChatId[actualNewChatId] = messagesForChatProcessing;
       }

       const newSelectedMessagesMap = { ...state.selectedMessagesMap };
       if (optimisticMessageChatId !== actualNewChatId && newSelectedMessagesMap[optimisticMessageChatId]) {
           delete newSelectedMessagesMap[optimisticMessageChatId];
       }

       if (isActualRewind) {
           const selectionsForRewoundChat: { [messageId: string]: boolean } = {};
           messagesForChatProcessing.forEach(msg => {
               selectionsForRewoundChat[msg.id] = true;
           });
           newSelectedMessagesMap[actualNewChatId] = selectionsForRewoundChat;
       } else {
           const selectionsForActualChat = { ...(newSelectedMessagesMap[actualNewChatId] || {}) };
           let finalUserMessageIdToSelect: string | undefined = finalUserMessage?.id;
           if (!finalUserMessageIdToSelect) {
               const processedUserMessage = messagesForChatProcessing.find((msg: ChatMessage) => msg.role === 'user' && msg.id === tempUserMessageId);
               if (processedUserMessage) finalUserMessageIdToSelect = processedUserMessage.id;
           }
           
           logger.info('[handleSendMessage] Setting message selections:', {
               actualNewChatId,
               finalUserMessageIdToSelect,
               assistantMessageId: assistantMessage.id,
               previousSelections: selectionsForActualChat,
               tempUserMessageId,
               finalUserMessageFromApi: finalUserMessage?.id
           });
           
           if (finalUserMessageIdToSelect) selectionsForActualChat[finalUserMessageIdToSelect] = true;
           selectionsForActualChat[assistantMessage.id] = true;
           newSelectedMessagesMap[actualNewChatId] = selectionsForActualChat;
           
           logger.info('[handleSendMessage] Final selections for chat:', {
               chatId: actualNewChatId,
               selections: selectionsForActualChat
           });
       }

       let updatedChatsByContext = { ...state.chatsByContext };
       if (optimisticMessageChatId !== actualNewChatId) {
           const newChatEntry: Chat = { 
               id: actualNewChatId, title: message.substring(0, 50) + (message.length > 50 ? '...' : ''), 
               user_id: currentUser?.id || null, 
               organization_id: organizationIdForApi ?? null,
               created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
               system_prompt_id: apiPromptId === '__none__' ? null : apiPromptId,
           };

           if (organizationIdForApi && typeof organizationIdForApi === 'string' && organizationIdForApi !== 'personal') {
               const currentOrgChats = updatedChatsByContext.orgs?.[organizationIdForApi] || [];
               const newOrgChats = [...currentOrgChats, newChatEntry];
               updatedChatsByContext = {
                   ...updatedChatsByContext,
                   orgs: {
                       ...updatedChatsByContext.orgs,
                       [organizationIdForApi]: newOrgChats,
                   }
               };
           } else {
               const currentPersonalChats = state.chatsByContext.personal || []; // Explicitly use state here for base
               const newPersonalChats = [...currentPersonalChats, newChatEntry];
               updatedChatsByContext = {
                   ...updatedChatsByContext, // Spread the existing updatedChatsByContext (which is a copy of state.chatsByContext)
                   personal: newPersonalChats, // Assign the new array to personal
               };
           }
       }
       const shouldClearNewChatContext = optimisticMessageChatId !== actualNewChatId;
      return { 
          ...state,
          messagesByChatId: newMessagesByChatId,
          chatsByContext: updatedChatsByContext,
          currentChatId: actualNewChatId,
          isLoadingAiResponse: false,
          aiError: null,
          rewindTargetMessageId: isActualRewind ? null : state.rewindTargetMessageId, 
          selectedMessagesMap: newSelectedMessagesMap,
          newChatContext: shouldClearNewChatContext ? null : state.newChatContext,
      };
  });
  
  logger.info('Message processed via handleSendMessage:', { assistantMessageId: assistantMessage.id, chatId: finalChatIdForLog, rewound: wasRewind });
  // Wallet refresh should be handled by the caller (aiStore) after this function returns.
  return assistantMessage;
}