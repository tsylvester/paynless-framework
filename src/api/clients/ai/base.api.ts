import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { 
  AIModel, 
  AIModelType,
  AIModelProvider,
  AIRequest,
  AIResponse,
  AIMessage,
  AIFeatures,
} from '../../../types/ai.types';
import { logger } from '../../../utils/logger';
import { getSupabaseClient } from '../../../utils/supabase';

/**
 * Base class for AI model providers
 */
export abstract class BaseAIProvider implements AIModelProvider {
  protected baseClient: BaseApiClient;
  protected models: Map<string, AIModel>;
  
  constructor(path: string) {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/ai/${path}`);
    this.models = new Map();
    this.loadModels();
  }
  
  /**
   * Load models from database
   */
  private async loadModels(): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      
      const { data: modelsData, error } = await supabase
        .from('ai_models')
        .select(`
          *,
          provider:provider_id(
            name,
            type,
            config
          )
        `)
        .eq('is_enabled', true);
      
      if (error) {
        throw error;
      }
      
      // Clear existing models
      this.models.clear();
      
      // Add models to map
      modelsData.forEach(model => {
        this.models.set(model.id, {
          id: model.id,
          providerId: model.provider_id,
          modelId: model.model_id,
          name: model.name,
          capabilities: model.capabilities,
          maxTokens: model.max_tokens,
          contextWindow: model.context_window,
          isEnabled: model.is_enabled,
          config: model.config,
          createdAt: model.created_at,
          updatedAt: model.updated_at,
        });
      });
    } catch (error) {
      logger.error('Error loading AI models', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Get all available AI models
   */
  abstract getModels(): Promise<AIModel[]>;
  
  /**
   * Generate text completion
   */
  abstract generateText(request: AIRequest): Promise<AIResponse>;
  
  /**
   * Generate chat completion
   */
  abstract generateChat(request: AIRequest): Promise<AIResponse>;
  
  /**
   * Generate image from text prompt
   */
  generateImage?(prompt: string): Promise<string> {
    throw new Error('Image generation not supported by this provider');
  }
  
  /**
   * Generate code from text prompt
   */
  generateCode?(prompt: string): Promise<string> {
    throw new Error('Code generation not supported by this provider');
  }
  
  /**
   * Transcribe audio to text
   */
  transcribeAudio?(audioData: Blob): Promise<string> {
    throw new Error('Audio transcription not supported by this provider');
  }
  
  /**
   * Make API request with rate limiting and error handling
   */
  protected async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: unknown
  ): Promise<ApiResponse<T>> {
    try {
      let response;
      
      switch (method) {
        case 'GET':
          response = await this.baseClient.get<T>(endpoint);
          break;
        case 'POST':
          response = await this.baseClient.post<T>(endpoint, data);
          break;
        case 'PUT':
          response = await this.baseClient.put<T>(endpoint, data);
          break;
        case 'DELETE':
          response = await this.baseClient.delete<T>(endpoint);
          break;
      }
      
      // Handle rate limits
      if (response.rateLimit) {
        logger.info('AI API rate limit status', {
          remaining: response.rateLimit.remaining,
          reset: new Date(response.rateLimit.reset * 1000).toISOString(),
        });
        
        if (response.rateLimit.remaining === 0) {
          return {
            error: {
              code: 'rate_limit_exceeded',
              message: 'Rate limit exceeded. Please try again later.',
            },
            status: 429,
          };
        }
      }
      
      return response;
    } catch (error) {
      logger.error('AI API request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        endpoint,
        method,
      });
      
      return {
        error: {
          code: 'ai_request_failed',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}