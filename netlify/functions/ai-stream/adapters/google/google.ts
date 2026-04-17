import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeChatMessage,
  NodeModelConfig,
  NodeOutboundDocument,
} from '../ai-adapter.interface.ts';

type GoogleHistoryEntry = {
  role: string;
  parts: Array<{ text: string }>;
};

function googleResourceDocumentLabel(doc: NodeOutboundDocument): string {
  const document_key: string | undefined = doc.document_key;
  const stage_slug: string | undefined = doc.stage_slug;
  if (
    typeof document_key === 'string' &&
    typeof stage_slug === 'string' &&
    document_key.length > 0 &&
    stage_slug.length > 0
  ) {
    return `[Document: ${document_key} from ${stage_slug}]`;
  }
  return `[Document: ${doc.id}]`;
}

function prepareGoogleChatAndParts(
  request: NodeChatApiRequest,
  apiIdentifier: string,
  modelConfig: NodeModelConfig,
): {
  modelApiName: string;
  history: GoogleHistoryEntry[];
  finalParts: Array<{ text: string }>;
  generationConfig: { maxOutputTokens: number } | undefined;
} {
  const modelApiName: string = apiIdentifier.replace(/^google-/i, '');

  const history: GoogleHistoryEntry[] = [];
  const combinedMessages: NodeChatMessage[] = [...(request.messages ?? [])];
  if (request.message.length > 0) {
    combinedMessages.push({ role: 'user', content: request.message });
  }

  for (const message of combinedMessages) {
    if (message.role === 'system' && message.content) {
      continue;
    }
    if (message.role === 'user' && message.content) {
      history.push({ role: 'user', parts: [{ text: message.content }] });
    } else if (message.role === 'assistant' && message.content) {
      history.push({ role: 'model', parts: [{ text: message.content }] });
    }
  }

  const lastEntry: GoogleHistoryEntry | undefined = history.pop();
  if (lastEntry === undefined || lastEntry.role !== 'user') {
    throw new Error('Cannot send request to Google Gemini: message history format invalid.');
  }

  const clientCap: number | undefined =
    typeof request.max_tokens_to_generate === 'number'
      ? request.max_tokens_to_generate
      : undefined;
  const modelHardCap: number | undefined =
    typeof modelConfig.hard_cap_output_tokens === 'number'
      ? modelConfig.hard_cap_output_tokens
      : undefined;
  const cap: number | undefined =
    typeof clientCap === 'number' ? clientCap : modelHardCap;
  const generationConfig: { maxOutputTokens: number } | undefined =
    typeof cap === 'number' ? { maxOutputTokens: cap } : undefined;

  let finalParts: Array<{ text: string }> = [...lastEntry.parts];
  if (request.resourceDocuments !== undefined && request.resourceDocuments.length > 0) {
    const documentParts: Array<{ text: string }> = [];
    for (const doc of request.resourceDocuments) {
      const label: string = googleResourceDocumentLabel(doc);
      documentParts.push({ text: label });
      documentParts.push({ text: doc.content });
    }
    finalParts = [...documentParts, ...lastEntry.parts];
  }

  return {
    modelApiName,
    history,
    finalParts,
    generationConfig,
  };
}

function mapGoogleFinishReason(finishReason: string | undefined): string {
  if (finishReason === undefined) {
    return 'unknown';
  }
  if (finishReason === 'STOP') {
    return 'stop';
  }
  if (finishReason === 'MAX_TOKENS') {
    return 'length';
  }
  if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
    return 'content_filter';
  }
  return 'unknown';
}

export function createGoogleNodeAdapter(
  params: NodeAdapterConstructorParams,
): AiAdapter {
  const modelConfig: NodeModelConfig = params.modelConfig;
  const apiKey: string = params.apiKey;
  const client: GoogleGenerativeAI = new GoogleGenerativeAI(apiKey);

  return {
    async *sendMessageStream(
      request: NodeChatApiRequest,
      apiIdentifier: string,
    ): AsyncGenerator<NodeAdapterStreamChunk> {
      const prepared: {
        modelApiName: string;
        history: GoogleHistoryEntry[];
        finalParts: Array<{ text: string }>;
        generationConfig: { maxOutputTokens: number } | undefined;
      } = prepareGoogleChatAndParts(request, apiIdentifier, modelConfig);

      const model = client.getGenerativeModel({ model: prepared.modelApiName });
      const chat = model.startChat({
        history: prepared.history,
        generationConfig: prepared.generationConfig,
      });

      const streamResult = await chat.sendMessageStream(prepared.finalParts);

      let assembled: string = '';
      try {
        for await (const chunk of streamResult.stream) {
          const parts = chunk.candidates?.[0]?.content?.parts;
          if (parts === undefined) {
            continue;
          }
          for (const part of parts) {
            const text: string | undefined = part.text;
            if (typeof text === 'string' && text.length > 0) {
              assembled += text;
              const textDelta: NodeAdapterStreamChunk = {
                type: 'text_delta',
                text,
              };
              yield textDelta;
            }
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
        throw new Error(String(error));
      }

      if (assembled.trim().length === 0) {
        throw new Error('Google Gemini stream completed with no assistant text.');
      }

      const response = await streamResult.response;
      const candidate = response.candidates?.[0];

      if (response.usageMetadata === undefined || response.usageMetadata === null) {
        throw new Error('Google Gemini response did not include usageMetadata.');
      }
      const usageMeta = response.usageMetadata;
      const ptRaw: unknown = usageMeta.promptTokenCount;
      const ctRaw: unknown = usageMeta.candidatesTokenCount;
      const ttRaw: unknown = usageMeta.totalTokenCount;
      if (typeof ptRaw !== 'number' || typeof ctRaw !== 'number' || typeof ttRaw !== 'number') {
        throw new Error('Google Gemini response usageMetadata is incomplete.');
      }
      const promptTokens: number = ptRaw;
      const completionTokens: number = ctRaw;
      const totalTokens: number = ttRaw;

      const usageChunk: NodeAdapterStreamChunk = {
        type: 'usage',
        tokenUsage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
        },
      };
      yield usageChunk;

      const finishReasonRaw: unknown = candidate?.finishReason;
      let finishReasonStr: string | undefined;
      if (typeof finishReasonRaw === 'string') {
        finishReasonStr = finishReasonRaw;
      } else {
        finishReasonStr = undefined;
      }
      const mappedFinish: string = mapGoogleFinishReason(finishReasonStr);
      const doneChunk: NodeAdapterStreamChunk = {
        type: 'done',
        finish_reason: mappedFinish,
      };
      yield doneChunk;
    },
  };
}
