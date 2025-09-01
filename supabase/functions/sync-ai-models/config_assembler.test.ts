// supabase/functions/sync-ai-models/config_assembler.test.ts
import {
  assertEquals,
  assertExists,
  assert,
  assertRejects,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ConfigAssembler,
  type ConfigDataSource,
} from "./config_assembler.ts";
import type {
  ProviderModelInfo,
  AiModelExtendedConfig,
  FinalAppModelConfig,
} from "../_shared/types.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import { AiModelExtendedConfigSchema } from "../chat/zodSchema.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

// --- Mock Data ---

const mockLogger = new MockLogger();

const MOCK_API_MODELS: ProviderModelInfo[] = [
    // Model 1: Almost fully configured by API, needs one value from internal map
    {
        api_identifier: 'provider-model-a-20240101',
        name: 'Model A',
        description: 'Latest and greatest',
        config: {
            input_token_cost_rate: 0.00001,
            output_token_cost_rate: 0.00003,
            context_window_tokens: 128000,
            provider_max_input_tokens: 128000,
            tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
            hard_cap_output_tokens: 4096, // Initially missing provider_max_output_tokens
        }
    },
    // Model 2: Only has a name from API, gets full config from internal map
    {
        api_identifier: 'provider-model-b-20230101',
        name: 'Model B',
        description: 'Old reliable',
    },
    // Model 3: A completely unknown model, will get dynamic defaults
    {
        api_identifier: 'provider-model-z-new',
        name: 'Model Z',
        description: 'Brand new, unknown to our system',
    }
];

const MOCK_INTERNAL_MAP = new Map<string, Partial<AiModelExtendedConfig>>([
    // Provides the missing piece for Model A
    ['provider-model-a-20240101', { provider_max_output_tokens: 4096 }],
    // Provides full config for Model B
    ['provider-model-b-20230101', { 
        input_token_cost_rate: 0.000005,
        output_token_cost_rate: 0.000015,
        context_window_tokens: 32000,
        hard_cap_output_tokens: 2048,
        provider_max_input_tokens: 32000,
        provider_max_output_tokens: 2048,
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' }
    }]
]);

// --- Test Suite ---

Deno.test({
    name: "ConfigAssembler - should correctly merge nested objects to produce a Zod-valid configuration",
    fn: async () => {
        // This test prevents bugs that cause the Zod validation failure.
        // The assembler receives two partial configs. One from the "API" and one from an "internal map".
        // The `tokenization_strategy` object is split across these two sources.
        const API_MODEL_WITH_PARTIAL_STRATEGY: ProviderModelInfo[] = [{
            api_identifier: 'anthropic-claude-bug-repro',
            name: 'Test Model',
            config: {
                // This source only defines the `type`.
                tokenization_strategy: { type: "anthropic_tokenizer" }
            }
        }] as ProviderModelInfo[];
        
        const INTERNAL_MAP_WITH_OTHER_PARTIAL_STRATEGY = new Map<string, Partial<AiModelExtendedConfig>>([
             ['anthropic-claude-bug-repro', { 
                // This source defines the rest of the required properties for the strategy.
                input_token_cost_rate: 0.1,
                output_token_cost_rate: 0.2,
                context_window_tokens: 4096,
                hard_cap_output_tokens: 1024,
                provider_max_input_tokens: 4096,
                provider_max_output_tokens: 1024,
                // The internal map provides the rest of the strategy object
                tokenization_strategy: { type: "anthropic_tokenizer", model: "claude-2.1" }
             }]
        ]);

        const sources: ConfigDataSource = {
            apiModels: API_MODEL_WITH_PARTIAL_STRATEGY,
            internalModelMap: INTERNAL_MAP_WITH_OTHER_PARTIAL_STRATEGY,
            logger: new MockLogger(),
        };

        const assembler = new ConfigAssembler(sources);
        const assembledConfigs = await assembler.assemble();
        const result = AiModelExtendedConfigSchema.safeParse(assembledConfigs[0].config);

        // This test will fail because the assembler's current shallow-merge logic will
        // cause the first `tokenization_strategy` object to be completely overwritten by the second,
        // resulting in `{ model: "claude-2.1" }`, which is invalid because it's missing the `type`.
        // A correct implementation must deep-merge the nested objects.
        // This failure establishes the RED state for TDD.
        assertEquals(result.success, true, `Zod validation failed. The assembler did not correctly merge nested config objects. Errors: ${JSON.stringify(result.error?.format(), null, 2)}`);
    },
});

Deno.test({
    name: "ConfigAssembler - should polyfill config, prioritizing valid API data but falling back to defaults for invalid partials",
    fn: async () => {
        // This test ensures the assembler correctly "polyfills" a configuration.
        // It must prioritize valid fields from the API over internal defaults,
        // but it must also be smart enough to reject an invalid partial object
        // from the API and use the complete, valid default object instead.
        const API_MODELS: ProviderModelInfo[] = [{
            api_identifier: 'polyfill-model-1',
            name: 'Polyfill Model',
            config: {
                // This partial config from the API is INVALID because it's missing 'model'
                tokenization_strategy: { type: "anthropic_tokenizer" }, 
                // However, this field from the API is VALID and should be prioritized
                input_token_cost_rate: 9.99, 
            }
        }] as ProviderModelInfo[];
        
        const INTERNAL_MAP = new Map<string, Partial<AiModelExtendedConfig>>([
             ['polyfill-model-1', { 
                input_token_cost_rate: 0.00001, // This should be OVERWRITTEN by the API value
                output_token_cost_rate: 0.00002,
                context_window_tokens: 8000,
                hard_cap_output_tokens: 2000,
                provider_max_input_tokens: 8000,
                provider_max_output_tokens: 2000,
                // This is a complete, valid object that should be used as the fallback
                tokenization_strategy: { type: "anthropic_tokenizer", model: "claude-3-haiku-20240307" }
             }]
        ]);

        const sources: ConfigDataSource = {
            apiModels: API_MODELS,
            internalModelMap: INTERNAL_MAP,
            logger: new MockLogger(),
        };

        const assembler = new ConfigAssembler(sources);
        const [assembledConfig] = await assembler.assemble();
        const result = AiModelExtendedConfigSchema.safeParse(assembledConfig.config);

        assertEquals(result.success, true, `Zod validation failed. Errors: ${JSON.stringify(result.error?.format(), null, 2)}`);
        
        // Assert that the valid API value was prioritized
        assertEquals(assembledConfig.config.input_token_cost_rate, 9.99);

        // Assert that the assembler fell back to the valid default for the invalid partial object
        const strategy = assembledConfig.config.tokenization_strategy;
        assert(strategy?.type === 'anthropic_tokenizer', "The strategy should have been polyfilled to the 'anthropic_tokenizer' type.");
        assertEquals(strategy.model, "claude-3-haiku-20240307");
    },
});


Deno.test({
  name: `'assemble' happy path should correctly merge valid partial configs into a FinalAppModelConfig`,
  fn: async () => {
    // This test ensures the refactored "top-down" assembler correctly
    // merges multiple valid partial sources into a final, valid object.
    const API_MODELS: ProviderModelInfo[] = [{
      api_identifier: "valid-merge-model",
      name: "Valid Merge",
      description: "A model for testing.",
      config: {
        input_token_cost_rate: 9.99, // API data has highest priority
        tokenization_strategy: { type: "anthropic_tokenizer", model: "claude-3-opus-20240229" },
      },
    }];

    const INTERNAL_MAP = new Map<string, Partial<AiModelExtendedConfig>>([
      ["valid-merge-model", {
        input_token_cost_rate: 0.001, // Should be overwritten by API data
        output_token_cost_rate: 0.005, // This value should persist
      }],
    ]);

    const sources: ConfigDataSource = {
      apiModels: API_MODELS,
      internalModelMap: INTERNAL_MAP,
      logger: new MockLogger(),
    };

    const assembler = new ConfigAssembler(sources);
    const result = await assembler.assemble();

    // Assert that one valid model was produced
    assertEquals(result.length, 1);
    const finalConfig = result[0];
    
    // Assert the final object has the correct shape
    assertEquals(finalConfig.api_identifier, "valid-merge-model");
    assertEquals(finalConfig.name, "Valid Merge");
    assertEquals(finalConfig.description, "A model for testing.");

    // Assert that the config values were merged correctly
    assertEquals(finalConfig.config.input_token_cost_rate, 9.99, "API data should overwrite internal map data.");
    assertEquals(finalConfig.config.output_token_cost_rate, 0.005, "Internal map data should persist when not overwritten.");
    assert(finalConfig.config.tokenization_strategy.type === "anthropic_tokenizer");
    assertEquals(finalConfig.config.tokenization_strategy.model, "claude-3-opus-20240229");
    
    // Assert that a value from the base defaults persisted
    assertEquals(finalConfig.config.hard_cap_output_tokens, 4096, "Default data should persist for unprovided fields.");
  },
});

Deno.test({
  name: "should successfully assemble a model using only defaults",
  fn: async () => {
    // 1. Setup: A model with NO config, which should force a complete fallback to defaults.
    const API_MODELS: ProviderModelInfo[] = [{
      api_identifier: "default-only-model",
      name: "Default Model",
      description: "This model has no config provided.",
      // .config is deliberately undefined
    }];

    const sources: ConfigDataSource = {
      apiModels: API_MODELS,
      internalModelMap: new Map(), // No other sources
      logger: new MockLogger(),
    };
    const assembler = new ConfigAssembler(sources);

    // 2. Action: Call the now-fixed assembler
    const result = await assembler.assemble();

    // 3. Assertion: We now expect this to succeed.
    assertEquals(result.length, 1, "Should have produced one valid model.");
    const finalConfig = result[0].config;

    // Check that properties from the defaults were correctly applied.
    assertEquals(finalConfig.api_identifier, "default-only-model");
    assertEquals(finalConfig.input_token_cost_rate, 0.000075);
    assertEquals(finalConfig.tokenization_strategy.type, 'rough_char_count');
  },
});

Deno.test({
    name: "ConfigAssembler - should NOT crash and should return a valid failsafe config even with invalid input",
    fn: async () => {
        // 1. Setup: Provide an API model with an incomplete, and therefore invalid, config.
        // The assembler's job is to fix this, not crash.
        const API_MODELS_WITH_INVALID_CONFIG: ProviderModelInfo[] = [{
            api_identifier: "resilience-test-model-1",
            name: "Resilience Test",
            config: {
                // This is INVALID because it's missing the `model` property required by the Zod schema.
                tokenization_strategy: { type: "anthropic_tokenizer" }, 
            },
        }] as ProviderModelInfo[];

        const sources: ConfigDataSource = {
            apiModels: API_MODELS_WITH_INVALID_CONFIG,
            internalModelMap: new Map(),
            logger: new MockLogger(),
        };

        const assembler = new ConfigAssembler(sources);

        // 2. Action & Assertion: In the current faulty implementation, this will throw a ZodError and fail the test.
        // A correct implementation will handle the error and return a valid, failsafe config.
        const assembledConfigs = await assembler.assemble();

        // If we get here, the assembler didn't crash, which is the first part of the fix.
        // Now, we assert that it produced a valid failsafe configuration.
        assertEquals(assembledConfigs.length, 1);
        const finalConfig = assembledConfigs[0].config;

        const result = AiModelExtendedConfigSchema.safeParse(finalConfig);

        assertEquals(result.success, true, `Assembler was supposed to create a valid failsafe config, but it's still invalid. Errors: ${JSON.stringify(result.error?.format(), null, 2)}`);

        // And assert that a default value was used for the strategy.
        assertEquals(finalConfig.tokenization_strategy.type, 'rough_char_count', 'The invalid strategy should have been replaced by a default.');
    },
});

Deno.test({
    name: "ConfigAssembler - should validate every model in a batch, repairing invalid ones without crashing",
    fn: async () => {
        // 1. Setup: Provide a batch of models, with one known invalid config in the middle.
        const BATCH_API_MODELS: ProviderModelInfo[] = [
            { api_identifier: "valid-model-1", name: "Valid Model 1" },
            {
                api_identifier: "invalid-model-2",
                name: "Invalid Model 2",
                config: {
                    // This config is invalid because it's missing the 'model' property.
                    tokenization_strategy: { type: "anthropic_tokenizer" },
                },
            },
            { api_identifier: "valid-model-3", name: "Valid Model 3" },
        ] as ProviderModelInfo[];

        const sources: ConfigDataSource = {
            apiModels: BATCH_API_MODELS,
            logger: new MockLogger(),
        };

        const assembler = new ConfigAssembler(sources);

        // 2. Action: Assemble the batch. This must not crash.
        const assembledConfigs = await assembler.assemble();

        // 3. Assertions
        // It must process all models, resulting in an array of the same length.
        assertEquals(assembledConfigs.length, 3, "Should have processed all three models in the batch.");

        // Every single config in the output array MUST be valid.
        for (const finalConfig of assembledConfigs) {
            const result = AiModelExtendedConfigSchema.safeParse(finalConfig.config);
            assertEquals(result.success, true, `Validation failed for model '${finalConfig.api_identifier}'. The assembler failed to repair it. Errors: ${JSON.stringify(result.error?.format(), null, 2)}`);
        }

        // Specifically check that the invalid model was repaired with a failsafe default.
        const repairedModel = assembledConfigs.find(c => c.api_identifier === 'invalid-model-2');
        assertExists(repairedModel, "The invalid model should exist in the final output.");
        assertEquals(repairedModel.config.tokenization_strategy.type, 'rough_char_count', "The invalid model's strategy should have been replaced by a failsafe default.");
    },
});

// RED: Adaptive provider floors for unknown/newer models
Deno.test({
  name: "ConfigAssembler - applies adaptive provider floors for unknown/newer models (provider high-water monotonicity)",
  fn: async () => {
    const logger = new MockLogger();

    // Arrange minimal cohorts per provider (represent recent known high-water marks)
    const anthropicCohort: ProviderModelInfo[] = [
      {
        api_identifier: "anthropic-claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        config: {
          context_window_tokens: 200_000,
          provider_max_input_tokens: 200_000,
          input_token_cost_rate: 3,
          output_token_cost_rate: 15,
          tokenization_strategy: { type: "anthropic_tokenizer", model: "claude-3.5-sonnet-20241022" },
          hard_cap_output_tokens: 8192,
          provider_max_output_tokens: 8192,
        },
      },
    ];
    const unknownAnthropic: ProviderModelInfo = {
      api_identifier: "anthropic-claude-4-foo-20260101",
      name: "Unknown Anthropic",
    };

    const googleCohort: ProviderModelInfo[] = [
      {
        api_identifier: "google-gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        config: {
          context_window_tokens: 1_048_576,
          provider_max_input_tokens: 1_048_576,
          input_token_cost_rate: 2.5,
          output_token_cost_rate: 15,
          tokenization_strategy: { type: "google_gemini_tokenizer", chars_per_token_ratio: 4 },
          hard_cap_output_tokens: 65_536,
          provider_max_output_tokens: 65_536,
        },
      },
    ];
    const unknownGoogle: ProviderModelInfo = {
      api_identifier: "google-gemini-3-foo",
      name: "Unknown Gemini",
    };

    const openaiCohort: ProviderModelInfo[] = [
      {
        api_identifier: "openai-gpt-4.1",
        name: "GPT-4.1",
        config: {
          context_window_tokens: 1_047_576,
          provider_max_input_tokens: 1_047_576,
          input_token_cost_rate: 2000,
          output_token_cost_rate: 8000,
          tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "o200k_base", is_chatml_model: true, api_identifier_for_tokenization: "gpt-4.1" },
          hard_cap_output_tokens: 4096,
          provider_max_output_tokens: 4096,
        },
      },
      {
        api_identifier: "openai-gpt-4o",
        name: "GPT-4o",
        config: {
          context_window_tokens: 128_000,
          provider_max_input_tokens: 128_000,
          input_token_cost_rate: 5,
          output_token_cost_rate: 15,
          tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base", is_chatml_model: true, api_identifier_for_tokenization: "gpt-4o" },
          hard_cap_output_tokens: 4096,
          provider_max_output_tokens: 4096,
        },
      },
    ];
    const unknownOpenAI41: ProviderModelInfo = { api_identifier: "openai-gpt-4.1-foo", name: "Unknown 4.1" };
    const unknownOpenAI4o: ProviderModelInfo = { api_identifier: "openai-gpt-4o-foo", name: "Unknown 4o" };

    // Anthropic unknown
    {
      const sources: ConfigDataSource = {
        apiModels: [...anthropicCohort, unknownAnthropic],
        logger,
      };
      const assembler = new ConfigAssembler(sources);
      const configs = await assembler.assemble();
      const unknownCfg = configs.find(c => c.api_identifier === unknownAnthropic.api_identifier)?.config;
      assertExists(unknownCfg, "Unknown Anthropic config should exist");
      assert(unknownCfg.context_window_tokens !== undefined && unknownCfg.provider_max_input_tokens !== undefined);
      assert(
        (unknownCfg.context_window_tokens as number) >= 200_000 && (unknownCfg.provider_max_input_tokens as number) >= 200_000,
        "Anthropic unknown/newer model should not be floored below recent high-water mark (200k)"
      );
    }

    // Google unknown
    {
      const sources: ConfigDataSource = {
        apiModels: [...googleCohort, unknownGoogle],
        logger,
      };
      const assembler = new ConfigAssembler(sources);
      const configs = await assembler.assemble();
      const unknownCfg = configs.find(c => c.api_identifier === unknownGoogle.api_identifier)?.config;
      assertExists(unknownCfg, "Unknown Google config should exist");
      assert(
        (unknownCfg.context_window_tokens as number) >= 1_048_576 && (unknownCfg.provider_max_input_tokens as number) >= 1_048_576,
        "Google unknown/newer model should not be floored below recent high-water mark (1,048,576)"
      );
    }

    // OpenAI unknowns
    {
      const sources: ConfigDataSource = {
        apiModels: [...openaiCohort, unknownOpenAI41, unknownOpenAI4o],
        logger,
      };
      const assembler = new ConfigAssembler(sources);
      const configs = await assembler.assemble();
      const cfg41 = configs.find(c => c.api_identifier === unknownOpenAI41.api_identifier)?.config;
      const cfg4o = configs.find(c => c.api_identifier === unknownOpenAI4o.api_identifier)?.config;
      assertExists(cfg41, "Unknown OpenAI 4.1 config should exist");
      assertExists(cfg4o, "Unknown OpenAI 4o config should exist");
      assert(
        (cfg41.context_window_tokens as number) >= 1_047_576 && (cfg41.provider_max_input_tokens as number) >= 1_047_576,
        "OpenAI 4.1 unknown/newer model should not be below 1,047,576"
      );
      assert(
        (cfg4o.context_window_tokens as number) >= 128_000 && (cfg4o.provider_max_input_tokens as number) >= 128_000,
        "OpenAI 4o unknown/newer model should not be below 128,000"
      );
    }
  },
});