import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeChatMessage,
  NodeModelConfig,
  NodeOutboundDocument,
} from '../ai-adapter.interface.ts';

function prepareAnthropicRequest(
  request: NodeChatApiRequest,
  modelIdentifier: string,
  modelConfig: NodeModelConfig,
): {
  modelApiName: string;
  systemPrompt: string;
  anthropicMessages: MessageParam[];
  maxTokensForPayload: number | undefined;
} {
  const modelApiName: string = modelIdentifier.replace(/^anthropic-/i, '');

  let systemPrompt: string = '';
  const anthropicMessages: MessageParam[] = [];
  const combinedMessages: NodeChatMessage[] = [...(request.messages ?? [])];
  combinedMessages.push({ role: 'user', content: request.message });

  const preliminaryMessages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of combinedMessages) {
    if (message.role === 'system' && message.content) {
      systemPrompt = message.content;
    } else if (
      (message.role === 'user' || message.role === 'assistant') &&
      message.content
    ) {
      const lastMessage: { role: 'user' | 'assistant'; content: string } | undefined =
        preliminaryMessages[preliminaryMessages.length - 1];
      if (lastMessage !== undefined && lastMessage.role === message.role) {
        lastMessage.content += `\n\n${message.content}`;
      } else {
        preliminaryMessages.push({ role: message.role, content: message.content });
      }
    }
  }

  let expectedRole: 'user' | 'assistant' = 'user';
  for (const message of preliminaryMessages) {
    if (message.role === expectedRole) {
      anthropicMessages.push({
        role: message.role,
        content: [{ type: 'text', text: message.content }],
      });
      expectedRole = expectedRole === 'user' ? 'assistant' : 'user';
    }
  }

  if (request.resourceDocuments !== undefined && request.resourceDocuments.length > 0) {
    for (const doc of request.resourceDocuments) {
      if (typeof doc.document_key === 'string' && typeof doc.stage_slug === 'string') {
        const document_key: string = doc.document_key;
        const stage_slug: string = doc.stage_slug;
        if (document_key.length === 0 || stage_slug.length === 0) {
          throw new Error(
            `Invalid resource document: document_key and stage_slug must be non-empty strings (id=${doc.id})`,
          );
        }
      }
    }
    const documentBlocks: MessageParam['content'] = request.resourceDocuments.map(
      (doc: NodeOutboundDocument) => {
        if (
          typeof doc.document_key === 'string' &&
          typeof doc.stage_slug === 'string' &&
          doc.document_key.length > 0 &&
          doc.stage_slug.length > 0
        ) {
          const document_key: string = doc.document_key;
          const stage_slug: string = doc.stage_slug;
          return {
            type: 'document',
            source: { type: 'text', media_type: 'text/plain', data: doc.content },
            title: document_key,
            context: stage_slug,
          };
        }
        return {
          type: 'document',
          source: { type: 'text', media_type: 'text/plain', data: doc.content },
          title: doc.id,
        };
      },
    );
    const firstUserIndex: number = anthropicMessages.findIndex((m) => {
      return m.role === 'user';
    });
    if (firstUserIndex >= 0) {
      const first: MessageParam = anthropicMessages[firstUserIndex];
      const existingContent: MessageParam['content'] = Array.isArray(first.content)
        ? first.content
        : [{ type: 'text', text: typeof first.content === 'string' ? first.content : '' }];
      anthropicMessages[firstUserIndex] = {
        ...first,
        content: [...documentBlocks, ...existingContent],
      };
    }
  }

  if (anthropicMessages.length === 0) {
    throw new Error('Cannot send request to Anthropic: No valid messages to send.');
  }

  const lastRole: MessageParam['role'] = anthropicMessages[anthropicMessages.length - 1].role;
  if (lastRole !== 'user') {
    throw new Error('Cannot send request to Anthropic: message history format invalid.');
  }

  const maxTokensForPayload: number | undefined =
    typeof request.max_tokens_to_generate === 'number'
      ? request.max_tokens_to_generate
      : typeof modelConfig.hard_cap_output_tokens === 'number'
        ? modelConfig.hard_cap_output_tokens
        : undefined;

  return {
    modelApiName,
    systemPrompt,
    anthropicMessages,
    maxTokensForPayload,
  };
}

function mapAnthropicStreamStopReason(
  stopReason: string | null | undefined,
): string {
  if (stopReason === null || stopReason === undefined) {
    return 'unknown';
  }
  if (stopReason === 'end_turn' || stopReason === 'stop_sequence') {
    return 'stop';
  }
  if (stopReason === 'max_tokens') {
    return 'max_tokens';
  }
  if (stopReason === 'tool_use') {
    return 'tool_use';
  }
  return 'unknown';
}

export function createAnthropicNodeAdapter(
  params: NodeAdapterConstructorParams,
): AiAdapter {
  const modelConfig: NodeModelConfig = params.modelConfig;
  const client: Anthropic = new Anthropic({ apiKey: params.apiKey });

  return {
    async *sendMessageStream(
      request: NodeChatApiRequest,
      apiIdentifier: string,
    ): AsyncGenerator<NodeAdapterStreamChunk> {
      const prepared: {
        modelApiName: string;
        systemPrompt: string;
        anthropicMessages: MessageParam[];
        maxTokensForPayload: number | undefined;
      } = prepareAnthropicRequest(request, apiIdentifier, modelConfig);

      const modelApiName: string = prepared.modelApiName;
      const systemPrompt: string = prepared.systemPrompt;
      const anthropicMessages: MessageParam[] = prepared.anthropicMessages;
      const maxTokensForPayload: number | undefined = prepared.maxTokensForPayload;

      try {
        if (maxTokensForPayload === undefined) {
          throw new Error('AnthropicAdapter: No max tokens for payload');
        }

        const stream = client.messages.stream({
          model: modelApiName,
          system: systemPrompt,
          messages: anthropicMessages,
          max_tokens: maxTokensForPayload,
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const textDelta: NodeAdapterStreamChunk = {
              type: 'text_delta',
              text: event.delta.text,
            };
            yield textDelta;
          }
        }

        const response = await stream.finalMessage();
        const inputTokens: number = response.usage.input_tokens;
        const outputTokens: number = response.usage.output_tokens;
        const usageChunk: NodeAdapterStreamChunk = {
          type: 'usage',
          tokenUsage: {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
          },
        };
        yield usageChunk;

        const finishReason: string = mapAnthropicStreamStopReason(response.stop_reason);
        const doneChunk: NodeAdapterStreamChunk = {
          type: 'done',
          finish_reason: finishReason,
        };
        yield doneChunk;
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          const statusPart: string =
            error.status === undefined ? 'unknown' : String(error.status);
          throw new Error(
            `Anthropic API request failed: ${statusPart} ${error.name}`,
          );
        }
        throw error;
      }
    },
  };
}
