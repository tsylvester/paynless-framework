import type {
    AiModelExtendedConfig,
    ChatMessage,
    ApiResponse,
    MessageForTokenCounting,
    ILogger, // Assuming ILogger is in @paynless/types
    ChatHandlerSuccessResponse,
    FetchOptions,
    ChatApiRequest,
    User,
    Session,
    ActiveChatWalletInfo,
    AiState
} from './index';

// --- Service Interfaces for Dependency Injection ---
export interface IAuthService {
  getCurrentUser: () => User | null | undefined;
  getSession: () => Session | null | undefined;
  requestLoginNavigation: () => void; // Abstracting navigation
}

export interface IWalletService {
  getActiveWalletInfo: () => ActiveChatWalletInfo; // Assumes ActiveChatWalletInfo is the correct detailed type
  // Add triggerWalletRefresh: () => void; if handleSendMessage should manage this.
}

export interface IAiStateService {
  getAiState: () => AiState;
  setAiState: (partial: AiState | Partial<AiState> | ((state: AiState) => AiState | Partial<AiState>), replace?: boolean | undefined) => void;
  addOptimisticUserMessage: (msgContent: string, explicitChatId?: string | null) => { tempId: string, chatIdUsed: string, createdTimestamp: string };
}

// --- Main Service Parameter Interface ---
export interface HandleSendMessageServiceParams {
  data: { message: string; chatId?: string | null; contextMessages?: MessageForTokenCounting[] };
  aiStateService: IAiStateService;
  authService: IAuthService;
  walletService: IWalletService;
  // Utility functions remain directly injected as they are stateless helpers
  estimateInputTokensFn: (input: string | MessageForTokenCounting[], modelConfig: AiModelExtendedConfig) => number;
  getMaxOutputTokensFn: (walletBalance: number, inputTokens: number, modelConfig: AiModelExtendedConfig, deficitAllowed: number) => number;
  callChatApi: (request: ChatApiRequest, options: RequestInit) => Promise<ApiResponse<ChatHandlerSuccessResponse>>;
  logger: ILogger;
}

// --- Internal Processing Types (remain the same) ---
export interface InternalProcessResult {
  success: boolean;
  finalUserMessage?: ChatMessage;
  assistantMessage?: ChatMessage;
  newlyCreatedChatId?: string;
  actualCostWalletTokens?: number;
  wasRewind?: boolean;
  error?: string;
  errorCode?: string;
}

// Define AiMessageSenderChatApiRequest by taking all properties from OriginalChatApiRequest
// EXCEPT contextMessages, and then adding our own contextMessages definition.
// This avoids the type compatibility issue when extending.

export interface SendMessageParams {
  // Input data
  messageContent: string;
  targetProviderId: string; // DB ID of the AiProvider
  targetPromptId: string | null;
  targetChatId?: string | null; // Can be null for a new chat
  selectedContextMessages?: MessageForTokenCounting[]; // This is the source for apiRequest.contextMessages
  effectiveOrganizationId?: string | null; // Determined by wallet logic

  // Current state values / resolved data
  walletBalanceInTokens: number;
  deficitTokensAllowed: number; 
  modelConfig: AiModelExtendedConfig;
  currentUserId?: string | null; // For logging context primarily
  token: string; // Auth token, added
  rewindTargetMessageId?: string | null; // For apiRequest.rewindFromMessageId, added

  // Core utility functions (dependency injection)
  estimateInputTokensFn: (
    textOrMessages: string | MessageForTokenCounting[],
    modelConfig: AiModelExtendedConfig
  ) => number;
  getMaxOutputTokensFn: (
    user_balance_tokens: number,
    prompt_input_tokens: number,
    modelConfig: AiModelExtendedConfig,
    deficit_tokens_allowed: number
  ) => number;
  
  // API interaction (dependency injection)
  callChatApi: ( 
    request: ChatApiRequest, // Correctly uses the new type
    options: FetchOptions    // Expects options for token
  ) => Promise<ApiResponse<ChatHandlerSuccessResponse>>;

  // Logger (dependency injection)
  logger: ILogger;
}

export interface SendMessageResult {
  success: boolean;
  finalUserMessage?: ChatMessage;      // User message after backend confirmation (e.g. w/ real ID)
  assistantMessage?: ChatMessage;  // Assistant's response
  error?: string;                    // Error message if something went wrong
  errorCode?: string;                // Optional error code
  actualCostWalletTokens?: number;   // If calculable from response
  newlyCreatedChatId?: string | null;       // If a new chat was created by the backend
  wasRewind?: boolean; // Added to capture backend response
} 