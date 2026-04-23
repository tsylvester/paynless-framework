import { describe, expect, it } from 'vitest';
import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeAdapterFactory,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeModelConfig,
} from './ai-adapter.interface.ts';
import {
  isAiAdapter,
  isNodeAdapterStreamChunk,
  isNodeTokenUsage,
} from './getNodeAiAdapter.guard.ts';

const conformanceModelConfig: NodeModelConfig = {
  api_identifier: 'openai-gpt-4o',
  input_token_cost_rate: 0.001,
  output_token_cost_rate: 0.002,
};

const conformanceParams: NodeAdapterConstructorParams = {
  modelConfig: conformanceModelConfig,
  apiKey: 'sk-conformance-test',
};

const conformanceChatRequest: NodeChatApiRequest = {
  message: 'conformance prompt',
  providerId: 'prov-conformance',
  promptId: 'prompt-conformance',
};

const conformanceApiIdentifier: string = 'openai-gpt-4o';

export function runAdapterConformanceTests(factory: NodeAdapterFactory): void {
  describe('NodeAdapterFactory conformance', () => {
    it('factory({ modelConfig, apiKey }) returns object satisfying isAiAdapter', () => {
      const adapter: AiAdapter = factory(conformanceParams);
      expect(isAiAdapter(adapter)).toBe(true);
    });

    it('sendMessageStream called with valid NodeChatApiRequest and apiIdentifier yields NodeAdapterStreamChunk values', async () => {
      const adapter: AiAdapter = factory(conformanceParams);
      const stream: AsyncGenerator<NodeAdapterStreamChunk> = adapter.sendMessageStream(
        conformanceChatRequest,
        conformanceApiIdentifier,
      );
      for await (const chunk of stream) {
        expect(isNodeAdapterStreamChunk(chunk)).toBe(true);
      }
    });

    it('sendMessageStream yields at least one text_delta, one usage, and one done chunk in happy path', async () => {
      const adapter: AiAdapter = factory(conformanceParams);
      const stream: AsyncGenerator<NodeAdapterStreamChunk> = adapter.sendMessageStream(
        conformanceChatRequest,
        conformanceApiIdentifier,
      );
      const kindsSeen: Set<string> = new Set();
      for await (const chunk of stream) {
        kindsSeen.add(chunk.type);
      }
      expect(kindsSeen.has('text_delta')).toBe(true);
      expect(kindsSeen.has('usage')).toBe(true);
      expect(kindsSeen.has('done')).toBe(true);
    });

    it('usage chunk tokenUsage has correct NodeTokenUsage shape', async () => {
      const adapter: AiAdapter = factory(conformanceParams);
      const stream: AsyncGenerator<NodeAdapterStreamChunk> = adapter.sendMessageStream(
        conformanceChatRequest,
        conformanceApiIdentifier,
      );
      let sawUsage: boolean = false;
      for await (const chunk of stream) {
        if (chunk.type === 'usage') {
          sawUsage = true;
          expect(isNodeTokenUsage(chunk.tokenUsage)).toBe(true);
        }
      }
      expect(sawUsage).toBe(true);
    });

    it('done chunk finish_reason is a non-empty string', async () => {
      const adapter: AiAdapter = factory(conformanceParams);
      const stream: AsyncGenerator<NodeAdapterStreamChunk> = adapter.sendMessageStream(
        conformanceChatRequest,
        conformanceApiIdentifier,
      );
      let sawDone: boolean = false;
      for await (const chunk of stream) {
        if (chunk.type === 'done') {
          sawDone = true;
          expect(typeof chunk.finish_reason).toBe('string');
          expect(chunk.finish_reason.length >= 1).toBe(true);
        }
      }
      expect(sawDone).toBe(true);
    });

    it('sendMessageStream with provider SDK error propagates throw (does not swallow)', async () => {
      const referenceThrowingFactory: NodeAdapterFactory = () => ({
        async *sendMessageStream(
          _request: NodeChatApiRequest,
          _apiIdentifier: string,
        ): AsyncGenerator<NodeAdapterStreamChunk> {
          const first: NodeAdapterStreamChunk = {
            type: 'text_delta',
            text: '',
          };
          yield first;
          throw new Error('simulated provider SDK failure');
        },
      });
      const adapter: AiAdapter = referenceThrowingFactory(conformanceParams);
      await expect(async () => {
        const stream: AsyncGenerator<NodeAdapterStreamChunk> =
          adapter.sendMessageStream(
            conformanceChatRequest,
            conformanceApiIdentifier,
          );
        await stream.next();
        await stream.next();
      }).rejects.toThrow('simulated provider SDK failure');
    });
  });
}
