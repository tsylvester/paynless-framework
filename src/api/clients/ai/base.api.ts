import { BaseApiClient } from '../../clients/base.api';
import { ApiResponse } from '../../../types/api.types';
import { 
  AIModel, 
  AIModelProvider,
  AIRequest,
  AIResponse,
} from '../../../types/ai.types';
import { logger } from '../../../utils/logger';

/**
 * Base class for AI model providers
 */
export abstract class BaseAIProvider implements AIModelProvider {
  protected baseClient: BaseApiClient;
  protected models: Map<string, AIModel>;
  
  constructor(path: string) {
    this.baseClient = new BaseApiClient(`ai/${path}`);
    this.models = new Map();
    this.loadModels();
  }
  
  /**
   * Load models from API
   */
  private async loadModels(): Promise<void> {
    try {
      const response = await this.baseClient.get<AIModel[]>('/models');
      
      if ('error' in response && response.error) {
        throw new Error(response.error.message);
      }
      
      // Clear existing models
      this.models.clear();
      
      // Add models to map
      if (response.data) {
        response.data.forEach(model => {
          this.models.set(model.id, model);
        });
      }
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
  generateImage?(): Promise<string> {
    throw new Error('Image generation not supported by this provider');
  }
  
  /**
   * Generate code from text prompt
   */
  generateCode?(): Promise<string> {
    throw new Error('Code generation not supported by this provider');
  }
  
  /**
   * Transcribe audio to text
   */
  transcribeAudio?(): Promise<string> {
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

export class AIBaseApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('ai');
  }
  
  async generateText(prompt: string): Promise<ApiResponse<string>> {
    try {
      logger.info('Generating AI text', { prompt });
      return await this.baseClient.post<string>('/generate', { prompt });
    } catch (error) {
      logger.error('Error generating AI text', {
        error: error instanceof Error ? error.message : 'Unknown error',
        prompt,
      });
      
      return {
        error: {
          code: 'ai_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}