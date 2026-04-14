import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
  NodeAdapterFactory,
  NodeTokenUsage,
} from './ai-adapter.interface.ts';
import { createValidAiAdapterParams } from './ai-adapter.mock.ts';

export async function runAdapterConformanceTests(
  factory: NodeAdapterFactory,
): Promise<void> {
  const adapter: AiAdapter = factory('test-key');
  if (typeof adapter !== 'object' || adapter === null) {
    throw new Error(
      'Adapter conformance: factory("test-key") must return an object satisfying AiAdapter',
    );
  }
  if (typeof adapter.stream !== 'function') {
    throw new Error(
      'Adapter conformance: AiAdapter must expose stream as a function',
    );
  }

  const params: AiAdapterParams = createValidAiAdapterParams();

  const resolved: AiAdapterResult = await adapter.stream(params);
  if (typeof resolved.assembled_content !== 'string') {
    throw new Error(
      'Adapter conformance: AiAdapterResult.assembled_content must be a string',
    );
  }
  if (resolved.token_usage !== null) {
    const usage: NodeTokenUsage = resolved.token_usage;
    if (typeof usage !== 'object') {
      throw new Error(
        'Adapter conformance: token_usage must be NodeTokenUsage or null',
      );
    }
    if (
      !Number.isInteger(usage.prompt_tokens) ||
      usage.prompt_tokens < 0 ||
      !Number.isInteger(usage.completion_tokens) ||
      usage.completion_tokens < 0 ||
      !Number.isInteger(usage.total_tokens) ||
      usage.total_tokens < 0
    ) {
      throw new Error(
        'Adapter conformance: NodeTokenUsage fields must be non-negative integers',
      );
    }
  }

  let propagated: boolean = false;
  try {
    await adapter.stream(params);
  } catch {
    propagated = true;
  }
  if (!propagated) {
    throw new Error(
      'Adapter conformance: stream must propagate provider SDK errors (must not swallow)',
    );
  }

  const noUsage: AiAdapterResult = await adapter.stream(params);
  if (typeof noUsage.assembled_content !== 'string') {
    throw new Error(
      'Adapter conformance: AiAdapterResult.assembled_content must be a string',
    );
  }
  if (noUsage.token_usage !== null) {
    throw new Error(
      'Adapter conformance: token_usage must be null when provider returns no usage data',
    );
  }
}
