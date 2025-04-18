import type { AiProviderAdapter } from '../types.ts';
import { openAiAdapter } from './openai_adapter.ts';
import { anthropicAdapter } from './anthropic_adapter.ts';
import { googleAdapter } from './google_adapter.ts';

/**
 * Factory function to get the appropriate AI provider adapter based on the provider identifier.
 *
 * @param provider - The provider identifier string (e.g., 'openai', 'anthropic', 'google').
 * @returns The corresponding AiProviderAdapter instance, or null if the provider is unknown or unsupported.
 */
export function getAiProviderAdapter(provider: string): AiProviderAdapter | null {
  switch (provider.toLowerCase()) {
    case 'openai':
      console.log('Using OpenAI Adapter');
      return openAiAdapter;
    case 'anthropic':
      console.log('Using Anthropic Adapter');
      return anthropicAdapter;
    case 'google':
      console.log('Using Google Adapter');
      return googleAdapter;
    // Add cases for other providers here as they are implemented
    // case 'perplexity':
    //   return perplexityAdapter;
    default:
      console.warn(`Unknown or unsupported AI provider requested: ${provider}`);
      return null;
  }
} 