import { getSupabaseClient } from '../../utils/supabase';
import { logger } from '../../utils/logger';
import { AIResponse } from '../../types/ai.types';

/**
 * Service for AI-related functionality
 */
export class AIService {
  /**
   * Generate text using AI
   */
  async generateText(
    content: string,
    modelId: string,
    promptId: string
  ): Promise<AIResponse> {
    try {
      const supabase = getSupabaseClient();
      
      // Call the AI Edge Function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabase.auth.session()?.access_token}`,
          },
          body: JSON.stringify({
            content,
            modelId,
            promptId,
          }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate AI response');
      }
      
      return await response.json();
    } catch (error) {
      logger.error('Error generating AI text', {
        error: error instanceof Error ? error.message : 'Unknown error',
        modelId,
        promptId,
      });
      
      return {
        content: '',
        error: {
          code: 'ai_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
      };
    }
  }
}

// Export singleton instance
export const aiService = new AIService();