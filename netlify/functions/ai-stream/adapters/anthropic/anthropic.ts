import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
  NodeTokenUsage,
} from '../ai-adapter.interface.ts';
import {
  isAnthropicMessageDeltaEvent,
  isAnthropicMessageStartEvent,
  isAnthropicTextDeltaEvent,
} from './anthropic.guard.ts';

export function createAnthropicNodeAdapter(): AiAdapter {
  const adapter: AiAdapter = {
    stream: async (params: AiAdapterParams): Promise<AiAdapterResult> => {
      const client: Anthropic = new Anthropic({ apiKey: params.apiKey });

      const outbound: MessageParam[] = [];
      for (const msg of params.chatApiRequest.messages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          const entry: MessageParam = {
            role: msg.role,
            content: msg.content,
          };
          outbound.push(entry);
        }
      }

      const streamPayload: {
        model: string;
        max_tokens: number;
        messages: MessageParam[];
        system?: string;
      } = {
        model: params.modelConfig.model_identifier,
        max_tokens: params.modelConfig.max_tokens,
        messages: outbound,
      };
      if (params.chatApiRequest.system !== undefined) {
        streamPayload.system = params.chatApiRequest.system;
      }

      const stream = await client.messages.stream(streamPayload);

      let assembled_content: string = '';
      let inputCount: number | undefined;
      let outputCount: number | undefined;

      for await (const event of stream) {
        if (isAnthropicMessageStartEvent(event)) {
          const startUsage: number = event.message.usage.input_tokens;
          inputCount = startUsage;
          continue;
        }
        if (isAnthropicTextDeltaEvent(event)) {
          const piece: string = event.delta.text;
          assembled_content = assembled_content + piece;
          continue;
        }
        if (isAnthropicMessageDeltaEvent(event)) {
          const out: number = event.usage.output_tokens;
          outputCount = out;
          continue;
        }
      }

      let token_usage: NodeTokenUsage | null = null;
      if (inputCount !== undefined && outputCount !== undefined) {
        const usage: NodeTokenUsage = {
          prompt_tokens: inputCount,
          completion_tokens: outputCount,
          total_tokens: inputCount + outputCount,
        };
        token_usage = usage;
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
