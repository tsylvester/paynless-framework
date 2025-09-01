import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.43.4';
import { 
    handleCorsPreflightRequest, 
    createErrorResponse, 
    createSuccessResponse, 
} from '../_shared/cors-headers.ts';
import { createSupabaseClient } from '../_shared/auth.ts';
import { logger } from '../_shared/logger.ts';
import type { ILogger } from '../_shared/types.ts';
import type { AiModelExtendedConfig, Messages } from '../_shared/types.ts';
import { countTokens } from 'npm:@anthropic-ai/tokenizer@0.0.4';

// Import tiktoken types and functions
import { 
    encodingForModel, 
    getEncoding, 
    type TiktokenModel,
    type TiktokenEncoding,
    type Tiktoken 
} from 'npm:js-tiktoken@1.0.7';

const DEFAULT_CHARS_PER_TOKEN = 4;
const APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN = (text: string) => Math.ceil(text.length / DEFAULT_CHARS_PER_TOKEN);

// Type-safe encoding result interface
interface EncodingResult {
  encode: (text: string) => { length: number };
}

// Type predicate for proper type narrowing - only supporting encodings that js-tiktoken actually has
function isValidTiktokenEncoding(encodingName: string): encodingName is TiktokenEncoding {
  switch (encodingName) {
    case 'cl100k_base':
    case 'p50k_base':
    case 'r50k_base':
    case 'gpt2':
      return true;
    default:
      return false;
  }
}

// Type-safe wrapper function that validates encoding names
function createEncoding(encodingName: string): EncodingResult {
  if (!isValidTiktokenEncoding(encodingName)) {
    throw new Error(`Invalid encoding name for tiktoken: ${encodingName}`);
  }
  
  // encodingName is now properly typed as TiktokenEncoding
  const encoding = getEncoding(encodingName);
  return {
    encode: (text: string) => ({ length: encoding.encode(text).length })
  };
}

// Dependency injection interface for token estimation
interface TokenEstimationDeps {
  createEncoding: typeof createEncoding;
  logger: ILogger;
}

/**
 * Server-side implementation of token estimation (moved from packages/utils/src/tokenCostUtils.ts)
 */
function estimateInputTokens(
  textOrMessages: string | Messages[],
  modelConfig: AiModelExtendedConfig,
  deps: TokenEstimationDeps
): number {
  const { tokenization_strategy } = modelConfig;

  if (!tokenization_strategy) {
    logger.warn('Tokenization strategy missing in modelConfig. Falling back to rough character count.', { modelConfig });
    const textToEstimate = typeof textOrMessages === 'string' ? textOrMessages : textOrMessages.map(m => m.content || '').join('\n');
    return APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN(textToEstimate);
  }

  switch (tokenization_strategy.type) {
    case 'tiktoken': {
      if (typeof textOrMessages === 'string') {
        // Validate config first
        if (!tokenization_strategy.api_identifier_for_tokenization && !tokenization_strategy.tiktoken_encoding_name) {
            throw new Error('Tiktoken strategy selected but no encoding name or model identifier provided.');
        }
        
        try {
          if (!tokenization_strategy.tiktoken_encoding_name) {
            throw new Error('Tiktoken encoding name is required for token estimation');
          }
          
          const encoding = deps.createEncoding(tokenization_strategy.tiktoken_encoding_name);
          const tokens = encoding.encode(textOrMessages).length;
          return tokens;
        } catch (e) {
          logger.error('Tiktoken encoding failed for string. Falling back to rough estimate.', { error: e, modelConfig });
          return APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN(textOrMessages);
        }
      }
      
      // Handle MessageForTokenCounting[]
      if (!tokenization_strategy.is_chatml_model) {
        // Validate config first
        if (!tokenization_strategy.api_identifier_for_tokenization && !tokenization_strategy.tiktoken_encoding_name) {
            throw new Error('Tiktoken strategy (non-ChatML messages) but no encoding name or model ID.');
        }

        const combinedContent = textOrMessages.map(m => m.content || '').join('\n');
        try {
            if (!tokenization_strategy.tiktoken_encoding_name) {
                throw new Error('Tiktoken encoding name is required for token estimation');
            }
            
            const encoding = deps.createEncoding(tokenization_strategy.tiktoken_encoding_name);
            const tokens = encoding.encode(combinedContent).length;
            return tokens;
        } catch (e) {
            logger.error('Tiktoken encoding failed for non-ChatML messages. Falling back to rough estimate.', { error: e, modelConfig });
            return APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN(combinedContent);
        }
      }

      // Handle ChatML messages
      const modelNameForTiktoken = tokenization_strategy.api_identifier_for_tokenization || tokenization_strategy.tiktoken_encoding_name;

      if (!modelNameForTiktoken) {
        throw new Error('Tiktoken ChatML strategy selected but no model identifier or encoding name for tokenization.');
      }
      
      try {
        if (!tokenization_strategy.tiktoken_encoding_name) {
          throw new Error('Tiktoken encoding name is required for token estimation');
        }
        
        const encoding = deps.createEncoding(tokenization_strategy.tiktoken_encoding_name);

        let tokensPerMessage: number;
        let tokensPerName: number;
        const effectiveModelName = tokenization_strategy.api_identifier_for_tokenization || 'generic_chatml';

        // ChatML rules based on OpenAI's gpt-4/gpt-3.5-turbo
        if (effectiveModelName.startsWith("gpt-4o") || effectiveModelName.startsWith("gpt-4") || effectiveModelName.startsWith("gpt-3.5-turbo")) {
          tokensPerMessage = 3;
          tokensPerName = 1;
          if (effectiveModelName === "gpt-3.5-turbo-0301") {
              tokensPerMessage = 4;
              tokensPerName = -1; 
          }
        } else {
          logger.warn(`[estimateInputTokens] Using generic ChatML rules for "${effectiveModelName}". May not be perfectly accurate.`);
          tokensPerMessage = 3;
          tokensPerName = 1;
        }
        
        let numTokens = 0;
        for (const message of textOrMessages) {
          numTokens += tokensPerMessage;
          if (message.role) {
            numTokens += encoding.encode(message.role).length;
          }
          if (message.content !== null && message.content !== undefined) {
            numTokens += encoding.encode(message.content).length;
          }
          if (message.name) {
            numTokens += encoding.encode(message.name).length;
            numTokens += tokensPerName;
          }
        }
        numTokens += 3; // Every reply is primed with <|start|>assistant<|message|>
        
        return numTokens;
      } catch (e: unknown) {
        const typedError = e instanceof Error ? e : new Error(String(e));
        logger.error(`[estimateInputTokens] Failed to get encoding for model/encoding name: "${modelNameForTiktoken}". Falling back.`, { error: typedError.message });
        const combinedContentForFallback = textOrMessages.map(m => m.content || '').join('\n');
        return APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN(combinedContentForFallback);
      }
    }

    case 'anthropic_tokenizer': {
      const textToEstimate = typeof textOrMessages === 'string'
        ? textOrMessages
        : textOrMessages.map(m => m.content || '').join('\n');
      try {
        return countTokens(textToEstimate);
      } catch (e) {
        logger.warn('Anthropic tokenizer failed in estimator. Falling back to rough character count.', { error: e });
        return APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN(textToEstimate);
      }
    }

    case 'rough_char_count': {
      const ratio = tokenization_strategy.chars_per_token_ratio || DEFAULT_CHARS_PER_TOKEN;
      if (ratio <= 0) {
        throw new Error('Invalid chars_per_token_ratio for rough_char_count strategy.');
      }
      const textToEstimate = typeof textOrMessages === 'string' ? textOrMessages : textOrMessages.map(m => m.content || '').join('\n');
      return Math.ceil(textToEstimate.length / ratio);
    }

    case 'google_gemini_tokenizer':
    case 'none':
    default: {
      logger.warn(`Tokenization strategy "${tokenization_strategy.type}" does not support server-side estimation. Falling back to rough character count.`);
      const textToEstimate = typeof textOrMessages === 'string' ? textOrMessages : textOrMessages.map(m => m.content || '').join('\n');
      return APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN(textToEstimate);
    }
  }
}

interface EstimateTokensRequest {
  textOrMessages: string | Messages[];
  modelConfig: AiModelExtendedConfig;
}

interface EstimateTokensResponse {
  estimatedTokens: number;
}

export interface TokenEstimatorHandlerDeps {
  createSupabaseClient: (req: Request) => SupabaseClient;
  handleCorsPreflightRequest: (req: Request) => Response | null;
  createErrorResponse: (message: string, status: number, req: Request) => Response;
  createSuccessResponse: (data: unknown, status: number, req: Request) => Response;
  tokenEstimationDeps: TokenEstimationDeps;
}

// Default dependencies
const defaultDeps: TokenEstimatorHandlerDeps = {
  createSupabaseClient,
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
  tokenEstimationDeps: {
    createEncoding,
    logger
  }
};

// Extracted handler function for testing
export async function handleTokenEstimatorRequest(
  req: Request,
  deps: TokenEstimatorHandlerDeps = defaultDeps
): Promise<Response> {
  // Handle CORS preflight requests
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  try {
    // Validate authentication
    const supabaseClient = deps.createSupabaseClient(req);
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      logger.error('Authentication failed in tokenEstimator', { error: userError });
      return deps.createErrorResponse('Authentication required', 401, req);
    }

    if (req.method !== 'POST') {
      return deps.createErrorResponse('Method not allowed', 405, req);
    }

    // Parse request body
    const body: EstimateTokensRequest = await req.json();
    
    if (!body.textOrMessages || !body.modelConfig) {
      return deps.createErrorResponse('Missing required fields: textOrMessages and modelConfig', 400, req);
    }

    // Estimate tokens using the migrated logic
    const estimatedTokens = estimateInputTokens(body.textOrMessages, body.modelConfig, deps.tokenEstimationDeps);
    
    const response: EstimateTokensResponse = {
      estimatedTokens
    };

    logger.info('Token estimation completed', { 
      estimatedTokens, 
      inputType: typeof body.textOrMessages,
      modelStrategy: body.modelConfig.tokenization_strategy?.type,
      userId: user.id
    });

    return deps.createSuccessResponse(response, 200, req);

  } catch (error) {
    logger.error('Token estimation failed', { error: error instanceof Error ? error.message : String(error) });
    
    return deps.createErrorResponse(
      error instanceof Error ? error.message : 'Token estimation failed', 
      500, 
      req
    );
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
  serve((req) => handleTokenEstimatorRequest(req, defaultDeps));
}
