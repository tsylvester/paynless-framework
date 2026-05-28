import OpenAI from 'openai';
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeModelConfig,
  NodeOutboundDocument,
  NodeUserConfig,
} from '../ai-adapter.interface.ts';
import { isNodeTokenUsage, isPlainRecord } from '../getNodeAiAdapter.guard.ts';
import { resolveOutputCap } from '../../resolveOutputCap/resolveOutputCap.provides.ts';

function resourceDocumentLine(doc: NodeOutboundDocument): string {
  if (doc.document_key !== undefined && doc.stage_slug !== undefined) {
    const document_key: string = doc.document_key;
    const stage_slug: string = doc.stage_slug;
    if (document_key.length === 0) {
      throw new Error('[OpenAiAdapter] ResourceDocument has empty document_key');
    }
    if (stage_slug.length === 0) {
      throw new Error('[OpenAiAdapter] ResourceDocument has empty stage_slug');
    }
    return `[Document: ${document_key} from ${stage_slug}]\n${doc.content}`;
  }
  return `[Document: ${doc.id}]\n${doc.content}`;
}

function prepareOpenAiStreamingRequest(
  request: NodeChatApiRequest,
  modelIdentifier: string,
  modelConfig: NodeModelConfig,
  userConfig: NodeUserConfig,
): {
  payload: ChatCompletionCreateParamsStreaming;
} {
  const modelApiName: string = modelIdentifier.replace(/^openai-/i, '');

  const configApiName: string = modelConfig.api_identifier.replace(/^openai-/i, '');
  if (modelApiName !== configApiName) {
    throw new Error(
      `[OpenAiAdapter] Model mismatch: requested '${modelApiName}' but adapter is configured for '${configApiName}'.`,
    );
  }

  const openaiMessages: ChatCompletionMessageParam[] = (request.messages ?? [])
    .map((msg): ChatCompletionMessageParam => {
      return {
        role: msg.role,
        content: msg.content,
      };
    })
    .filter((msg) => {
      return Boolean(msg.content);
    });

  if (request.resourceDocuments !== undefined && request.resourceDocuments.length > 0) {
    const docParts: string[] = request.resourceDocuments.map((doc: NodeOutboundDocument) => {
      return resourceDocumentLine(doc);
    });
    openaiMessages.push({ role: 'user', content: docParts.join('\n\n') });
  }

  if (request.message) {
    openaiMessages.push({ role: 'user', content: request.message });
  }

  const payload: ChatCompletionCreateParamsStreaming = {
    model: modelApiName,
    messages: openaiMessages,
    stream: true,
    stream_options: { include_usage: true },
  };

  const usesLegacyMaxTokens: boolean =
    modelApiName.startsWith('gpt-3.5-turbo') ||
    modelApiName.startsWith('gpt-4-turbo') ||
    modelApiName === 'gpt-4';

  const applyCap = (cap: number): void => {
    if (!(cap > 0)) {
      return;
    }
    if (usesLegacyMaxTokens) {
      payload.max_tokens = cap;
    } else {
      payload.max_completion_tokens = cap;
    }
  };

  const cap: number | undefined = resolveOutputCap({
    requestMax: request.max_tokens_to_generate,
    hardCap: modelConfig.hard_cap_output_tokens,
    providerMax: modelConfig.provider_max_output_tokens,
    tierCap: userConfig.tier_output_cap_tokens,
  });
  if (cap !== undefined) {
    applyCap(cap);
  }

  return { payload };
}

export function createOpenAINodeAdapter(
  params: NodeAdapterConstructorParams,
): AiAdapter {
  const modelConfig: NodeModelConfig = params.modelConfig;
  const userConfig: NodeUserConfig = params.userConfig;
  const client: OpenAI = new OpenAI({ apiKey: params.apiKey });

  return {
    async *sendMessageStream(
      request: NodeChatApiRequest,
      apiIdentifier: string,
    ): AsyncGenerator<NodeAdapterStreamChunk> {
      const prepared: { payload: ChatCompletionCreateParamsStreaming } =
        prepareOpenAiStreamingRequest(request, apiIdentifier, modelConfig, userConfig);

      try {
        const stream: AsyncIterable<unknown> = await client.chat.completions.create(
          prepared.payload,
        );

        let assembled: string = '';
        let finishReasonFromStream: string | undefined = undefined;
        let tokenUsageFromStream: unknown = undefined;

        for await (const rawChunk of stream) {
          if (!isPlainRecord(rawChunk)) {
            continue;
          }

          const choicesUnknown: unknown = rawChunk['choices'];
          if (Array.isArray(choicesUnknown)) {
            const firstChoiceUnknown: unknown = choicesUnknown[0];
            if (isPlainRecord(firstChoiceUnknown)) {
              const deltaUnknown: unknown = firstChoiceUnknown['delta'];
              if (isPlainRecord(deltaUnknown)) {
                const contentUnknown: unknown = deltaUnknown['content'];
                if (typeof contentUnknown === 'string') {
                  assembled += contentUnknown;
                  const textDelta: NodeAdapterStreamChunk = {
                    type: 'text_delta',
                    text: contentUnknown,
                  };
                  yield textDelta;
                }
              }
              const finishUnknown: unknown = firstChoiceUnknown['finish_reason'];
              if (finishUnknown != null && typeof finishUnknown === 'string') {
                finishReasonFromStream = finishUnknown;
              }
            }
          }

          const usageUnknown: unknown = rawChunk['usage'];
          if (usageUnknown != null) {
            tokenUsageFromStream = usageUnknown;
          }
        }

        const trimmed: string = assembled.trim();
        if (trimmed.length === 0) {
          throw new Error('OpenAI response content is empty or missing.');
        }

        if (!isNodeTokenUsage(tokenUsageFromStream)) {
          throw new Error('OpenAI response did not include usage data.');
        }

        const promptTokens: number = tokenUsageFromStream.prompt_tokens;
        const completionTokens: number = tokenUsageFromStream.completion_tokens;
        const totalTokens: number = tokenUsageFromStream.total_tokens;

        const usageChunk: NodeAdapterStreamChunk = {
          type: 'usage',
          tokenUsage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
          },
        };
        yield usageChunk;

        const doneChunk: NodeAdapterStreamChunk = {
          type: 'done',
          finish_reason: finishReasonFromStream ?? 'unknown',
        };
        yield doneChunk;
      } catch (error) {
        if (error instanceof OpenAI.APIError) {
          const statusPart: string =
            error.status === undefined ? 'unknown' : String(error.status);
          throw new Error(
            `OpenAI API request failed: ${statusPart} ${error.name}`,
          );
        }
        throw error;
      }
    },
  };
}
