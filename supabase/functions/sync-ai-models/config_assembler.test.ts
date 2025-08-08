// supabase/functions/sync-ai-models/config_assembler.test.ts
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ConfigAssembler, type ConfigDataSource, type AssembledModelConfig } from "./config_assembler.ts";
import type { ProviderModelInfo, AiModelExtendedConfig } from "../_shared/types.ts";
import { MockLogger } from "../_shared/logger.mock.ts";

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

Deno.test("ConfigAssembler - Granular and E2E Tests", async (t) => {
    // We make the private methods public for testing purposes
    class TestableConfigAssembler extends ConfigAssembler {
        public override performPassOne() { return super.performPassOne(); }
        public override calculateDynamicDefaults(c: AssembledModelConfig[], n: number) { return super.calculateDynamicDefaults(c, n); }
        public override performPassTwo(f: AssembledModelConfig[], n: ProviderModelInfo[], d: Partial<AiModelExtendedConfig>) { return super.performPassTwo(f, n, d); }
    }

    const sources: ConfigDataSource = {
        apiModels: structuredClone(MOCK_API_MODELS), // Use clone to prevent mutation across tests
        internalModelMap: MOCK_INTERNAL_MAP,
        logger: mockLogger,
    };
    const assembler = new TestableConfigAssembler(sources);
    
    // --- Granular Tests ---

    let passOneResult: { fullyConfiguredModels: AssembledModelConfig[]; modelsNeedingDefaults: ProviderModelInfo[]; };
    await t.step("Pass 1: should correctly categorize models", async () => {
        passOneResult = await assembler.performPassOne();
        assertEquals(passOneResult.fullyConfiguredModels.length, 2, "Models A and B should be fully configured in Pass 1");
        assertEquals(passOneResult.modelsNeedingDefaults.length, 1, "Only Model Z should need defaults after Pass 1");
    });

    let dynamicDefaultsResult: Partial<AiModelExtendedConfig>;
    await t.step("Dynamic Defaults: should calculate correct defaults", () => {
        dynamicDefaultsResult = assembler.calculateDynamicDefaults(passOneResult.fullyConfiguredModels, passOneResult.modelsNeedingDefaults.length);
        assertEquals(dynamicDefaultsResult.input_token_cost_rate, 0.00001); // High-water mark from Model A
        assertEquals(dynamicDefaultsResult.output_token_cost_rate, 0.00003); // High-water mark from Model A
    });

    let passTwoResult: AssembledModelConfig[];
    await t.step("Pass 2: should correctly apply defaults", () => {
        passTwoResult = assembler.performPassTwo(
            passOneResult.fullyConfiguredModels,
            passOneResult.modelsNeedingDefaults,
            dynamicDefaultsResult
        );
        assertEquals(passTwoResult.length, 3, "All 3 models should be configured after Pass 2");
    });
    
    // --- End-to-End Test ---
    await t.step("E2E: should assemble configurations using the full two-pass system", async () => {
        const e2eAssembler = new ConfigAssembler(sources);
        const assembledConfigs = await e2eAssembler.assemble();

        assertEquals(assembledConfigs.length, 3, "Should configure all 3 models");

        const modelA = assembledConfigs.find(m => m.api_identifier === 'provider-model-a-20240101');
        const modelB = assembledConfigs.find(m => m.api_identifier === 'provider-model-b-20230101');
        const modelZ = assembledConfigs.find(m => m.api_identifier === 'provider-model-z-new');

        assertExists(modelA);
        assertExists(modelB);
        assertExists(modelZ);

        assertEquals(modelA.config.provider_max_output_tokens, 4096);
        assertEquals(modelB.config.context_window_tokens, 32000);
        assertEquals(modelZ.config.input_token_cost_rate, 0.00001);
    });

    // --- Edge Case Test ---
    await t.step("Panic Failsafe: should use panic defaults when no models can be configured", async () => {
        const emptySources: ConfigDataSource = {
            apiModels: [{ api_identifier: 'unconfigurable-model', name: 'Test', description: '' }],
            internalModelMap: new Map(),
            logger: mockLogger,
        };
        const panicAssembler = new ConfigAssembler(emptySources);
        const assembledConfigs = await panicAssembler.assemble();

        assertEquals(assembledConfigs.length, 1, "Should still configure the one model using panic defaults");
        const panicModel = assembledConfigs[0];
        assertEquals(panicModel.config.input_token_cost_rate, 0.000075); // Check against the hardcoded panic value
        assertEquals(panicModel.config.context_window_tokens, 8192); // Check against the hardcoded panic value
    });
});
