import { logger } from './logger';

/**
 * Parses the assistant's message content from raw API response data.
 * 
 * @param responseData The raw data object from the AI API response.
 * @param apiIdentifier The identifier string for the AI provider (e.g., 'openai-gpt-4o', 'anthropic-claude-3-sonnet').
 * @returns The extracted assistant message content as a string, or null if parsing fails.
 */
export function parseAssistantContent(responseData: any, apiIdentifier: string): string | null {
    try {
        if (!responseData) {
            logger.warn('[parseAssistantContent] Response data is null or undefined.');
            return null;
        }

        if (apiIdentifier?.startsWith('openai-')) {
            const content = responseData?.choices?.[0]?.message?.content;
            if (typeof content === 'string') {
                return content.trim();
            } else {
                 logger.warn('[parseAssistantContent] Could not find content in expected OpenAI structure.', { responseData });
                 return null;
            }
        } else if (apiIdentifier?.startsWith('anthropic-')) {
             // Anthropic often returns content in a list, find the first text block
            const textContent = responseData?.content?.find((block: any) => block.type === 'text')?.text;
             if (typeof textContent === 'string') {
                 return textContent.trim();
             } else {
                 logger.warn('[parseAssistantContent] Could not find text content in expected Anthropic structure.', { responseData });
                 return null;
             }
        } else {
             logger.warn('[parseAssistantContent] Unknown or unsupported apiIdentifier:', { apiIdentifier });
             return null;
        }
    } catch (error: any) {
         logger.error('[parseAssistantContent] Error during parsing:', { error: error?.message, apiIdentifier, responseData });
         return null;
    }
}

// Potential future addition: A function to parse token usage
// export function parseTokenUsage(responseData: any, apiIdentifier: string): Record<string, number> | null { ... } 