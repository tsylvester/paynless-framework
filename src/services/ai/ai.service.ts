import { BaseApiClient } from '../../api/clients/base.api';
import { ApiResponse } from '../../types/api.types';
import { logger } from '../../utils/logger';

/**
 * Service for AI-related functionality
 */
export class AIService {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('ai');
  }
  
  async generateResponse(prompt: string): Promise<ApiResponse<string>> {
    try {
      logger.info('Generating AI response', { prompt });
      return await this.baseClient.post<string>('/generate', { prompt });
    } catch (error) {
      logger.error('Error generating AI response', {
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

// Export singleton instance
export const aiService = new AIService();