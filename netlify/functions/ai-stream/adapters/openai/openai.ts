import OpenAI from 'openai';
import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
  NodeTokenUsage,
} from '../ai-adapter.interface.ts';

export function createOpenAINodeAdapter(): AiAdapter {
  const adapter: AiAdapter = {
    stream: async (params: AiAdapterParams): Promise<AiAdapterResult> => {
      const client: OpenAI = new OpenAI({ apiKey: params.apiKey });
      const stream = await client.chat.completions.create({
        stream: true,
        model: params.modelConfig.model_identifier,
        max_tokens: params.modelConfig.max_tokens,
        messages: params.chatApiRequest.messages,
      });

      let assembled_content: string = '';
      let token_usage: NodeTokenUsage | null = null;

      for await (const chunk of stream) {
        const content: string | null | undefined = chunk.choices[0]?.delta?.content;
        if (typeof content === 'string') {
          assembled_content = assembled_content + content;
        }
        if (chunk.usage !== undefined && chunk.usage !== null) {
          const usage = chunk.usage;
          const mapped: NodeTokenUsage = {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          };
          token_usage = mapped;
        }
      }

      const result: AiAdapterResult = {
        assembled_content,
        token_usage,
      };
      return result;
    },
  };
  return adapter;
}
