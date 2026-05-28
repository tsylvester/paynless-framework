// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AiModelExtendedConfig, ILogger } from "../../_shared/types.ts";
import type {
  CountableChatPayload,
  CountTokensDeps,
} from "../../_shared/types/tokenizer.types.ts";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";
import {
  buildChatApiRequest,
  buildCompressPromptErrorReturn,
  buildCompressPromptSuccessReturn,
  buildResourceDocument,
  createCompressPromptMock,
  DbClient,
} from "../compressPrompt/compressPrompt.mock.ts";
import type {
  GetMaxOutputTokensFn,
  TierOutputCapTokens,
  UserConfig,
} from "./calculateAffordability.interface.ts";
import { calculateAffordability } from "./calculateAffordability.ts";
import {
  isCalculateAffordabilityCompressedReturn,
  isCalculateAffordabilityDirectReturn,
  isCalculateAffordabilityErrorReturn,
} from "./calculateAffordability.guard.ts";
import {
  buildCalculateAffordabilityDeps,
  buildCalculateAffordabilityParams,
  buildCalculateAffordabilityPayload,
} from "./calculateAffordability.mock.ts";

Deno.test("Non-oversized adequate balance: direct return; maxOutputTokens matches getMaxOutputTokens", async () => {
  const logger: MockLogger = new MockLogger();
  const initialTokenCount: number = 1000;
  const walletBalance: number = 1_000_000;
  const extendedModelConfig = buildExtendedModelConfig();
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => initialTokenCount,
    }),
    compressPrompt,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance,
    extendedModelConfig,
    inputRate: 0.01,
    outputRate: 0.01,
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  const expectedMax: number = deps.getMaxOutputTokens(
    walletBalance,
    initialTokenCount,
    extendedModelConfig,
    logger,
    0,
    params.userConfig.tier_output_cap_tokens,
  );
  assertEquals(isCalculateAffordabilityDirectReturn(result), true);
  if (isCalculateAffordabilityDirectReturn(result)) {
    assertEquals(result.maxOutputTokens, expectedMax);
    assertEquals(result.resolvedInputTokenCount, initialTokenCount);
  }
  assertEquals(calls.length, 0);
});

Deno.test("Non-oversized NSF: error return; retriable false", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => 1000,
    }),
    compressPrompt,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance: 5,
    extendedModelConfig: buildExtendedModelConfig(),
    inputRate: 0.01,
    outputRate: 0.01,
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
  assertEquals(calls.length, 0);
});

Deno.test("Non-oversized allowedInput <= 0: ContextWindowError; retriable false", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => 5000,
    }),
    compressPrompt,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance: 1_000_000,
    extendedModelConfig: buildExtendedModelConfig({
      provider_max_input_tokens: 100,
      context_window_tokens: 200_000,
    }),
    inputRate: 0.01,
    outputRate: 0.01,
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
  }
  assertEquals(calls.length, 0);
});

Deno.test("Oversized: compressPrompt called with finalTargetThreshold, balanceAfterCompression, walletBalance; compressed return on success", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const resourceDocuments = [buildResourceDocument()];
  const chatApiRequest = buildChatApiRequest(resourceDocuments, "unit prompt");
  const { compressPrompt, calls } = createCompressPromptMock({
    result: buildCompressPromptSuccessReturn({
      chatApiRequest,
      resolvedInputTokenCount: 42,
      resourceDocuments,
    }),
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => 100_000,
    }),
    compressPrompt,
  });
  const walletBalance: number = 10_000_000;
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance,
    extendedModelConfig: buildExtendedModelConfig({
      context_window_tokens: 50_000,
      provider_max_input_tokens: 128000,
    }),
    inputRate: 0.01,
    outputRate: 0.01,
    inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
  });
  const payload = buildCalculateAffordabilityPayload({ resourceDocuments });
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityCompressedReturn(result), true);
  assertEquals(calls.length >= 1, true);
  if (calls.length >= 1) {
    const first = calls[0];
    assertEquals(typeof first.params.finalTargetThreshold, "number");
    assertEquals(typeof first.params.balanceAfterCompression, "number");
    assertEquals(first.params.walletBalance, walletBalance);
  }
});

Deno.test("Oversized: compressPrompt error propagated; error return", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const compressErr: Error = new Error("compress unit failure");
  const { compressPrompt } = createCompressPromptMock({
    result: buildCompressPromptErrorReturn(compressErr, false),
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => 100_000,
    }),
    compressPrompt,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance: 10_000_000,
    extendedModelConfig: buildExtendedModelConfig({
      context_window_tokens: 50_000,
      provider_max_input_tokens: 128000,
    }),
    inputRate: 0.01,
    outputRate: 0.01,
    inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.error, compressErr);
    assertEquals(result.retriable, false);
  }
});

Deno.test("Oversized NSF for entire operation including embeddings: error return; retriable false", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => 100_000,
    }),
    compressPrompt,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance: 100_000,
    extendedModelConfig: buildExtendedModelConfig({
      context_window_tokens: 50_000,
      provider_max_input_tokens: 128000,
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
    }),
    inputRate: 1,
    outputRate: 1,
    inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
  assertEquals(calls.length, 0);
});

Deno.test("Oversized estimated embedding cost exceeds 80% rationality: error return; retriable false", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => 100_000,
    }),
    compressPrompt,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance: 100_000,
    extendedModelConfig: buildExtendedModelConfig({
      context_window_tokens: 50_000,
      provider_max_input_tokens: 128000,
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
    }),
    inputRate: 1,
    outputRate: 1,
    inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
  assertEquals(calls.length, 0);
});

Deno.test("Oversized balanceAfterCompression <= 0: error return; retriable false", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => 100_000,
    }),
    compressPrompt,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance: 100,
    extendedModelConfig: buildExtendedModelConfig({
      context_window_tokens: 50_000,
      provider_max_input_tokens: 128000,
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
    }),
    inputRate: 1,
    outputRate: 1,
    inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
  assertEquals(calls.length, 0);
});

Deno.test("Oversized infeasible solver target: ContextWindowError; retriable false", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => 100_000,
    }),
    compressPrompt,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance: 10_000_000,
    extendedModelConfig: buildExtendedModelConfig({
      context_window_tokens: 50_000,
      provider_max_input_tokens: 128000,
      input_token_cost_rate: 0.01,
      output_token_cost_rate: Number.NaN,
    }),
    inputRate: 0.01,
    outputRate: 0.01,
    inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
  }
  assertEquals(calls.length, 0);
});

Deno.test("Oversized total estimated cost exceeds balance: error return; retriable false", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => 100_000,
    }),
    compressPrompt,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance: 200_000,
    extendedModelConfig: buildExtendedModelConfig({
      context_window_tokens: 80_000,
      provider_max_input_tokens: 50_000,
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
    }),
    inputRate: 1,
    outputRate: 80_000,
    inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
  assertEquals(calls.length, 0);
});

Deno.test(
  "Non-oversized: maxOutputTokens is SSOT cap 400",
  async () => {
    const logger: MockLogger = new MockLogger();
    const initialTokenCount: number = 100;
    const walletBalance: number = 1000;
    const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
      input_token_cost_rate: 1,
      output_token_cost_rate: 2,
      context_window_tokens: 10000,
      provider_max_input_tokens: 128000,
    });
    const { client } = createMockSupabaseClient();
    const { compressPrompt, calls } = createCompressPromptMock({});
    const deps = buildCalculateAffordabilityDeps({
      logger,
      countTokens: createMockCountTokens({
        countTokens: (
          _deps: CountTokensDeps,
          _payload: CountableChatPayload,
          _modelConfig: AiModelExtendedConfig,
        ): number => initialTokenCount,
      }),
      compressPrompt,
    });
    const params = buildCalculateAffordabilityParams(DbClient(client), {
      userConfig: { tier_output_cap_tokens: null },
      walletBalance,
      extendedModelConfig,
      inputRate: 1,
      outputRate: 2,
    });
    const payload = buildCalculateAffordabilityPayload({
      resourceDocuments: [],
      conversationHistory: [{ role: "user", content: "hello" }],
      currentUserPrompt: "current",
      systemInstruction: "SYS",
      chatApiRequest: buildChatApiRequest([], "current", {
        systemInstruction: "SYS",
        messages: [{ role: "user", content: "hello" }],
      }),
    });
    const result = await calculateAffordability(deps, params, payload);
    const expectedMax: number = deps.getMaxOutputTokens(
      walletBalance,
      initialTokenCount,
      extendedModelConfig,
      logger,
      0,
      params.userConfig.tier_output_cap_tokens,
    );
    assertEquals(isCalculateAffordabilityDirectReturn(result), true);
    if (isCalculateAffordabilityDirectReturn(result)) {
      assertEquals(result.maxOutputTokens, 400);
      assertEquals(result.maxOutputTokens, expectedMax);
      assertEquals(result.resolvedInputTokenCount, initialTokenCount);
    }
    assertEquals(calls.length, 0);
  },
);

Deno.test("Oversized total estimated cost exceeds 80% rationality threshold: error return; retriable false", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => 100_000,
    }),
    compressPrompt,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance: 250_000,
    extendedModelConfig: buildExtendedModelConfig({
      context_window_tokens: 80_000,
      provider_max_input_tokens: 50_000,
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
    }),
    inputRate: 1,
    outputRate: 6_000,
    inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
  assertEquals(calls.length, 0);
});

Deno.test(
  "non-oversized NSF when estimated cost exceeds wallet (inputRate 1, outputRate 10, balance 5, count 10)",
  async () => {
    const logger: MockLogger = new MockLogger();
    const initialTokenCount: number = 10;
    const walletBalance: number = 5;
    const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
      input_token_cost_rate: 1,
      output_token_cost_rate: 10,
    });
    const { client } = createMockSupabaseClient();
    const { compressPrompt, calls } = createCompressPromptMock({});
    const deps = buildCalculateAffordabilityDeps({
      logger,
      countTokens: createMockCountTokens({
        countTokens: (
          _deps: CountTokensDeps,
          _payload: CountableChatPayload,
          _modelConfig: AiModelExtendedConfig,
        ): number => initialTokenCount,
      }),
      compressPrompt,
    });
    const params = buildCalculateAffordabilityParams(DbClient(client), {
      userConfig: { tier_output_cap_tokens: null },
      walletBalance,
      extendedModelConfig,
      inputRate: 1,
      outputRate: 10,
    });
    const payload = buildCalculateAffordabilityPayload({
      resourceDocuments: [],
      conversationHistory: [],
      currentUserPrompt: "hello",
      systemInstruction: "",
      chatApiRequest: buildChatApiRequest([], "hello", {
        systemInstruction: "",
        messages: [{ role: "user", content: "hello" }],
      }),
    });
    const result = await calculateAffordability(deps, params, payload);
    assertEquals(isCalculateAffordabilityErrorReturn(result), true);
    if (isCalculateAffordabilityErrorReturn(result)) {
      assertStringIncludes(result.error.message, "Insufficient funds");
      assertEquals(result.retriable, false);
    }
    assertEquals(calls.length, 0);
  },
);

Deno.test(
  "oversized estimated cost exceeds 80% rationality; compressPrompt not called",
  async () => {
    const logger: MockLogger = new MockLogger();
    const initialTokenCount: number = 500;
    const walletBalance: number = 1000;
    const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
      context_window_tokens: 100,
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      provider_max_output_tokens: 50,
      provider_max_input_tokens: 200,
    });
    const { client } = createMockSupabaseClient();
    const { compressPrompt, calls } = createCompressPromptMock({});
    const deps = buildCalculateAffordabilityDeps({
      logger,
      countTokens: createMockCountTokens({
        countTokens: (
          _deps: CountTokensDeps,
          _payload: CountableChatPayload,
          _modelConfig: AiModelExtendedConfig,
        ): number => initialTokenCount,
      }),
      compressPrompt,
    });
    const resourceDocuments = [buildResourceDocument()];
    const params = buildCalculateAffordabilityParams(DbClient(client), {
      userConfig: { tier_output_cap_tokens: null },
      walletBalance,
      extendedModelConfig,
      inputRate: 1,
      outputRate: 1,
      inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
    });
    const payload = buildCalculateAffordabilityPayload({
      resourceDocuments,
      conversationHistory: [],
      currentUserPrompt: "",
      systemInstruction: "",
      chatApiRequest: buildChatApiRequest(resourceDocuments, "", {
        systemInstruction: "",
        messages: [],
      }),
    });
    const result = await calculateAffordability(deps, params, payload);
    assertEquals(isCalculateAffordabilityErrorReturn(result), true);
    if (isCalculateAffordabilityErrorReturn(result)) {
      assertStringIncludes(result.error.message, "exceeds 80% of the user's balance");
      assertEquals(result.retriable, false);
    }
    assertEquals(calls.length, 0);
  },
);

Deno.test(
  "oversized absolute NSF (including embeddings); compressPrompt not called",
  async () => {
    const logger: MockLogger = new MockLogger();
    const initialTokenCount: number = 251;
    const walletBalance: number = 250;
    const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
      context_window_tokens: 100,
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      provider_max_output_tokens: 50,
      provider_max_input_tokens: 200,
    });
    const { client } = createMockSupabaseClient();
    const { compressPrompt, calls } = createCompressPromptMock({});
    const deps = buildCalculateAffordabilityDeps({
      logger,
      countTokens: createMockCountTokens({
        countTokens: (
          _deps: CountTokensDeps,
          _payload: CountableChatPayload,
          _modelConfig: AiModelExtendedConfig,
        ): number => initialTokenCount,
      }),
      compressPrompt,
    });
    const resourceDocuments = [buildResourceDocument()];
    const params = buildCalculateAffordabilityParams(DbClient(client), {
      userConfig: { tier_output_cap_tokens: null },
      walletBalance,
      extendedModelConfig,
      inputRate: 1,
      outputRate: 1,
      inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
    });
    const payload = buildCalculateAffordabilityPayload({
      resourceDocuments,
      conversationHistory: [],
      currentUserPrompt: "",
      systemInstruction: "",
      chatApiRequest: buildChatApiRequest(resourceDocuments, "", {
        systemInstruction: "",
        messages: [],
      }),
    });
    const result = await calculateAffordability(deps, params, payload);
    assertEquals(isCalculateAffordabilityErrorReturn(result), true);
    if (isCalculateAffordabilityErrorReturn(result)) {
      assertStringIncludes(result.error.message, "Insufficient funds for the entire operation");
      assertEquals(result.retriable, false);
    }
    assertEquals(calls.length, 0);
  },
);

Deno.test(
  "final ChatApiRequest.max_tokens_to_generate equals SSOT(final input)",
  async () => {
    const logger: MockLogger = new MockLogger();
    const initialTokenCount: number = 50;
    const walletBalance: number = 1000;
    const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
      context_window_tokens: 1000,
      provider_max_input_tokens: 10000,
      provider_max_output_tokens: 500,
      input_token_cost_rate: 1,
      output_token_cost_rate: 2,
    });
    const { client } = createMockSupabaseClient();
    const { compressPrompt, calls } = createCompressPromptMock({});
    const deps = buildCalculateAffordabilityDeps({
      logger,
      countTokens: createMockCountTokens({
        countTokens: (
          _deps: CountTokensDeps,
          _payload: CountableChatPayload,
          _modelConfig: AiModelExtendedConfig,
        ): number => initialTokenCount,
      }),
      compressPrompt,
    });
    const params = buildCalculateAffordabilityParams(DbClient(client), {
      userConfig: { tier_output_cap_tokens: null },
      walletBalance,
      extendedModelConfig,
      inputRate: 1,
      outputRate: 2,
    });
    const payload = buildCalculateAffordabilityPayload({
      resourceDocuments: [],
      conversationHistory: [{ role: "user", content: "hello" }],
      currentUserPrompt: "CURR",
      systemInstruction: "SYS",
      chatApiRequest: buildChatApiRequest([], "CURR", {
        systemInstruction: "SYS",
        messages: [{ role: "user", content: "hello" }],
      }),
    });
    const result = await calculateAffordability(deps, params, payload);
    const expectedMax: number = deps.getMaxOutputTokens(
      walletBalance,
      initialTokenCount,
      extendedModelConfig,
      logger,
      0,
      params.userConfig.tier_output_cap_tokens,
    );
    assertEquals(isCalculateAffordabilityDirectReturn(result), true);
    if (isCalculateAffordabilityDirectReturn(result)) {
      assertEquals(result.maxOutputTokens, 400);
      assertEquals(result.maxOutputTokens, expectedMax);
      assertEquals(result.resolvedInputTokenCount, initialTokenCount);
    }
    assertEquals(calls.length, 0);
  },
);

Deno.test(
  "preflight rejects when total planned spend (compression + embeddings + final) exceeds 80% budget",
  async () => {
    const logger: MockLogger = new MockLogger();
    const initialTokenCount: number = 300;
    const walletBalance: number = 450;
    const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
      context_window_tokens: 200,
      provider_max_input_tokens: 10000,
      provider_max_output_tokens: 1000,
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
    });
    const { client } = createMockSupabaseClient();
    const { compressPrompt, calls } = createCompressPromptMock({});
    const deps = buildCalculateAffordabilityDeps({
      logger,
      countTokens: createMockCountTokens({
        countTokens: (
          _deps: CountTokensDeps,
          _payload: CountableChatPayload,
          _modelConfig: AiModelExtendedConfig,
        ): number => initialTokenCount,
      }),
      compressPrompt,
    });
    const params = buildCalculateAffordabilityParams(DbClient(client), {
      userConfig: { tier_output_cap_tokens: null },
      walletBalance,
      extendedModelConfig,
      inputRate: 1,
      outputRate: 1,
      inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
    });
    const payload = buildCalculateAffordabilityPayload({
      resourceDocuments: [],
      conversationHistory: [{ role: "user", content: "hello" }],
      currentUserPrompt: "current",
      systemInstruction: "SYS",
      chatApiRequest: buildChatApiRequest([], "current", {
        systemInstruction: "SYS",
        messages: [{ role: "user", content: "hello" }],
      }),
    });
    const result = await calculateAffordability(deps, params, payload);
    assertEquals(isCalculateAffordabilityErrorReturn(result), true);
    if (isCalculateAffordabilityErrorReturn(result)) {
      assertStringIncludes(result.error.message, "80%");
      assertEquals(result.retriable, false);
    }
    assertEquals(calls.length, 0);
  },
);

Deno.test("non-oversized: deps.getMaxOutputTokens receives params.userConfig.tier_output_cap_tokens value", async () => {
  const logger: MockLogger = new MockLogger();
  const initialTokenCount: number = 100;
  const walletBalance: number = 1_000_000;
  const tierCap: number = 16384;
  const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 50_000,
    provider_max_input_tokens: 128_000,
  });
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  const returnedMax: number = 555;
  let depsMaxCalls: number = 0;
  const getMaxOutputTokensDep: GetMaxOutputTokensFn = (
    _user_balance_tokens: number,
    _prompt_input_tokens: number,
    _modelConfig: AiModelExtendedConfig,
    _logger: ILogger,
    _deficit_tokens_allowed: number,
    passedTierOutputCapTokens: TierOutputCapTokens | null,
  ): number => {
    depsMaxCalls += 1;
    assertEquals(passedTierOutputCapTokens, tierCap);
    return returnedMax;
  };
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => initialTokenCount,
    }),
    compressPrompt,
    getMaxOutputTokens: getMaxOutputTokensDep,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: tierCap },
    walletBalance,
    extendedModelConfig,
    inputRate: 0.01,
    outputRate: 0.01,
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityDirectReturn(result), true);
  if (isCalculateAffordabilityDirectReturn(result)) {
    assertEquals(result.maxOutputTokens, returnedMax);
  }
  assertEquals(depsMaxCalls >= 1, true);
  assertEquals(calls.length, 0);
});

Deno.test("non-oversized: deps.getMaxOutputTokens receives null tier_output_cap_tokens via params.userConfig", async () => {
  const logger: MockLogger = new MockLogger();
  const initialTokenCount: number = 100;
  const walletBalance: number = 1_000_000;
  const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 50_000,
    provider_max_input_tokens: 128_000,
  });
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  const returnedMax: number = 777;
  let depsMaxCalls: number = 0;
  const getMaxOutputTokensDep: GetMaxOutputTokensFn = (
    _user_balance_tokens: number,
    _prompt_input_tokens: number,
    _modelConfig: AiModelExtendedConfig,
    _logger: ILogger,
    _deficit_tokens_allowed: number,
    passedTierOutputCapTokens: TierOutputCapTokens | null,
  ): number => {
    depsMaxCalls += 1;
    assertEquals(passedTierOutputCapTokens, null);
    return returnedMax;
  };
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => initialTokenCount,
    }),
    compressPrompt,
    getMaxOutputTokens: getMaxOutputTokensDep,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance,
    extendedModelConfig,
    inputRate: 0.01,
    outputRate: 0.01,
  });
  const payload = buildCalculateAffordabilityPayload();
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityDirectReturn(result), true);
  if (isCalculateAffordabilityDirectReturn(result)) {
    assertEquals(result.maxOutputTokens, returnedMax);
  }
  assertEquals(depsMaxCalls >= 1, true);
  assertEquals(calls.length, 0);
});

Deno.test("non-oversized: calculateAffordability invokes deps.getMaxOutputTokens at least once", async () => {
  const logger: MockLogger = new MockLogger();
  const initialTokenCount: number = 100;
  const walletBalance: number = 1_000_000;
  const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 50_000,
    provider_max_input_tokens: 128_000,
  });
  const { client } = createMockSupabaseClient();
  const { compressPrompt, calls } = createCompressPromptMock({});
  let depsMaxCalls: number = 0;
  const recordingGetMax: GetMaxOutputTokensFn = (
    user_balance_tokens: number,
    prompt_input_tokens: number,
    modelConfig: AiModelExtendedConfig,
    log: ILogger,
    deficit_tokens_allowed: number,
    tierOutputCapTokens: TierOutputCapTokens | null,
  ): number => {
    depsMaxCalls += 1;
    return getMaxOutputTokens(
      user_balance_tokens,
      prompt_input_tokens,
      modelConfig,
      log,
      deficit_tokens_allowed,
      tierOutputCapTokens,
    );
  };
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _modelConfig: AiModelExtendedConfig,
      ): number => initialTokenCount,
    }),
    compressPrompt,
    getMaxOutputTokens: recordingGetMax,
  });
  const params = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
    walletBalance,
    extendedModelConfig,
    inputRate: 0.01,
    outputRate: 0.01,
  });
  const payload = buildCalculateAffordabilityPayload();
  await calculateAffordability(deps, params, payload);
  assertEquals(depsMaxCalls >= 1, true);
  assertEquals(calls.length, 0);
});
