import { ChatMessage } from "../_shared/types.ts"; 

export interface DialecticServiceRequest {
    action: string;
    payload?: Record<string, unknown>;
  }
  
  export interface CreateProjectPayload {
    projectName: string;
    initialUserPrompt: string;
    selected_domain_tag?: string | null;
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
      sessionId: string;
      status: string;
      contributions: unknown[]; // Placeholder for actual contributions
      errors?: { modelId: string; message: string; details?: string }[]; // Optional errors array
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

// --- Generate Antithesis Contributions ---
export interface GenerateAntithesisContributionsPayload {
  sessionId: string;
  // Potentially add options like specific thesis contributions to target if not all
}

export interface GenerateAntithesisContributionsSuccessResponse {
  message: string;
  sessionId: string;
  status: string; // e.g., 'antithesis_generation_complete', 'antithesis_generation_partial'
  contributions: unknown[]; // Array of newly created antithesis contributions
  errors?: { modelId: string; thesisContributionId: string; message: string; details?: string }[];
}
// --- End Generate Antithesis Contributions ---

    // Define the expected shape of the selected AI provider details
export interface SelectedAiProvider {
  id: string;                 // PK of ai_providers table
  provider_name: string;    // Aliased from 'provider' column in ai_providers
  model_name: string;       // Aliased from 'name' column in ai_providers
  api_identifier: string;   // Actual 'api_identifier' column from ai_providers
  // Removed api_key_name, supports_json_response, supports_system_prompt as they don't exist on ai_providers table
}

  // Check ownership: contributionData.dialectic_sessions.dialectic_projects.user_id must match user.id
  // Type acrobatics because of Supabase joins
  // Define an interim type for the expected structure
  export interface ContributionWithNestedOwner {
    content_storage_bucket: string | null;
    content_storage_path: string | null;
    content_mime_type: string | null;
    content_size_bytes: number | null;
    dialectic_sessions: {
      project_id: string | null;
      dialectic_projects: {
        user_id: string | null;
      } | null;
    } | null;
  }