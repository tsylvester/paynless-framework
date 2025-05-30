import { ChatMessage } from "../_shared/types.ts"; 

export interface DialecticServiceRequest {
    action: string;
    payload?: Record<string, unknown>;
  }
  
  export interface CreateProjectPayload {
    projectName: string;
    initialUserPrompt: string;
    selectedDomainTag?: string | null;
  }
  
export interface UpdateProjectDomainTagPayload {
    projectId: string;
    domainTag: string | null;
  }

  
export interface StartSessionPayload {
    projectId: string;
    selectedModelCatalogIds: string[]; // These are ai_providers.id
    sessionDescription?: string | null;
    thesisPromptTemplateName?: string;
    antithesisPromptTemplateName?: string;
    // associatedChatId could be passed if dialectic originates from existing chat
    originatingChatId?: string | null;
  }
  
  export interface StartSessionSuccessResponse {
      message: string;
      sessionId: string;
      initialStatus: string;
      associatedChatId: string; // The chat ID to be used for /chat interactions
  }
  
  export interface GenerateThesisContributionsPayload {
    sessionId: string;
    // authToken: string; // authToken will be extracted from the main request by the calling handler
  }
  
  export interface GenerateThesisContributionsSuccessResponse {
      message: string;
      contributions: unknown[]; // Placeholder for actual contributions
      // Other relevant details
  }

  export interface CallUnifiedAIModelOptions {
    customParameters?: {
      historyMessages?: ChatMessage[]; // For conversational history
      max_tokens_to_generate?: number;
      // Other custom params the /chat function might accept
    };
    currentStageSystemPromptId?: string | null; // For system_prompts.id, passed as promptId to /chat
  }
  
  export interface UnifiedAIResponse {
    content: string | null;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    rawProviderResponse?: unknown; // This will be the assistantMessage object from /chat
    processingTimeMs?: number;
    error: string | null;
    errorCode: string | null; // e.g., 'CHAT_API_ERROR', 'NETWORK_ERROR'
  }