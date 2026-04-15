import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Content, GenerateContentStreamResult } from '@google/generative-ai';
import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
  NodeTokenUsage,
} from '../ai-adapter.interface.ts';
import type { GoogleUsageMetadata } from './google.interface.ts';
import { isGoogleStreamChunk } from './google.guard.ts';

export function createGoogleNodeAdapter(): AiAdapter {
  const adapter: AiAdapter = {
    stream: async (params: AiAdapterParams): Promise<AiAdapterResult> => {
      const client: GoogleGenerativeAI = new GoogleGenerativeAI(params.apiKey);
      const modelApiName: string = params.modelConfig.model_identifier.replace(
        /^google-/i,
        '',
      );

      const modelInit: { model: string; systemInstruction?: string } = {
        model: modelApiName,
      };
      if (params.chatApiRequest.system !== undefined) {
        modelInit.systemInstruction = params.chatApiRequest.system;
      }
      const model = client.getGenerativeModel(modelInit);

      const contents: Content[] = [];
      for (const msg of params.chatApiRequest.messages) {
        if (msg.role === 'user') {
          const entry: Content = {
            role: 'user',
            parts: [{ text: msg.content }],
          };
          contents.push(entry);
        } else if (msg.role === 'assistant') {
          const entry: Content = {
            role: 'model',
            parts: [{ text: msg.content }],
          };
          contents.push(entry);
        }
      }

      const streamResult: GenerateContentStreamResult = await model.generateContentStream({
        contents,
        generationConfig: {
          maxOutputTokens: params.modelConfig.max_tokens,
        },
      });

      let assembled_content: string = '';
      let token_usage: NodeTokenUsage | null = null;

      for await (const raw of streamResult.stream) {
        if (!isGoogleStreamChunk(raw)) {
          continue;
        }
        const piece: string = raw.text();
        assembled_content = assembled_content + piece;
        if (raw.usageMetadata !== undefined) {
          const um: GoogleUsageMetadata = raw.usageMetadata;
          const mapped: NodeTokenUsage = {
            prompt_tokens: um.promptTokenCount,
            completion_tokens: um.candidatesTokenCount,
            total_tokens: um.totalTokenCount,
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
