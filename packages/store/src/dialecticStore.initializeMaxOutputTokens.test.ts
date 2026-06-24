import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDialecticStore } from './dialecticStore';
import { useAuthStore } from './authStore';
import type {
    AiModelExtendedConfig,
    InitializeMaxOutputTokensResult,
    SelectedModels,
    UserTier,
} from '@paynless/types';
import {
    mockAiModelConfig,
    mockAiProvidersRow,
    mockCatalogConfigMissingOutputCap,
} from '../../../apps/web/src/mocks/dialecticStore.mock';
import { isAiModelExtendedConfig, isJson } from '@paynless/utils';

vi.mock('@paynless/api', async () => {
    const { api, resetApiMock } = await import('@paynless/api/mocks');
    return {
        api,
        initializeApiClient: vi.fn(),
        resetApiMock,
    };
});

import { resetApiMock } from '@paynless/api/mocks';

describe('initializeMaxOutputTokens', () => {
    const tierWithOutputCap: UserTier = {
        level: 1,
        name: 'Pro',
        output_cap_tokens: 8192,
        max_models_per_project: 4,
    };

    const ultraTier: UserTier = {
        level: 3,
        name: 'Ultra',
        output_cap_tokens: null,
        max_models_per_project: null,
    };

    beforeEach(() => {
        resetApiMock();
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks();
        useAuthStore.setState({ isLoading: false, userTier: null, error: null });
    });

    it('returns { ok: true, skipped: true } and leaves maxOutputTokens unchanged when auth isLoading is true', () => {
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ provider_max_output_tokens: 4096 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        useDialecticStore.setState({
            maxOutputTokens: null,
            isLoadingModelCatalog: false,
            modelCatalog: [
                mockAiProvidersRow({
                    is_default_generation: true,
                    is_active: true,
                    config: modelConfig,
                }),
            ],
        });
        useAuthStore.setState({ isLoading: true, userTier: tierWithOutputCap });

        const { initializeMaxOutputTokens } = useDialecticStore.getState();
        const result: InitializeMaxOutputTokensResult = initializeMaxOutputTokens();

        expect(result).toEqual({ ok: true, skipped: true });
        expect(useDialecticStore.getState().maxOutputTokens).toBeNull();
    });

    it('returns { ok: true, skipped: true } and leaves maxOutputTokens unchanged when isLoadingModelCatalog is true', () => {
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ provider_max_output_tokens: 4096 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        useAuthStore.setState({ isLoading: false, userTier: tierWithOutputCap });
        useDialecticStore.setState({
            maxOutputTokens: null,
            isLoadingModelCatalog: true,
            modelCatalog: [
                mockAiProvidersRow({
                    is_default_generation: true,
                    is_active: true,
                    config: modelConfig,
                }),
            ],
        });

        const { initializeMaxOutputTokens } = useDialecticStore.getState();
        const result: InitializeMaxOutputTokensResult = initializeMaxOutputTokens();

        expect(result).toEqual({ ok: true, skipped: true });
        expect(useDialecticStore.getState().maxOutputTokens).toBeNull();
    });

    it('applies default generation model, sets maxOutputTokens to 4096, and returns { ok: true } when selection is empty', () => {
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({
            provider_max_output_tokens: 4096,
            hard_cap_output_tokens: 4096,
        });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const defaultGenerationModel = mockAiProvidersRow({
            id: 'default-gen-model',
            name: 'Default Generation',
            is_default_generation: true,
            is_active: true,
            config: modelConfig,
        });

        useAuthStore.setState({ isLoading: false, userTier: tierWithOutputCap });
        useDialecticStore.setState({
            outputCapUserCustomized: false,
            maxOutputTokens: null,
            selectedModels: [],
            isLoadingModelCatalog: false,
            modelCatalog: [defaultGenerationModel],
        });

        const { initializeMaxOutputTokens } = useDialecticStore.getState();
        const result: InitializeMaxOutputTokensResult = initializeMaxOutputTokens();

        expect(result).toEqual({ ok: true });
        const state = useDialecticStore.getState();
        expect(state.maxOutputTokens).toBe(4096);
        expect(state.selectedModels).toEqual([
            { id: 'default-gen-model', displayName: 'Default Generation' },
        ]);
    });

    it('sets maxOutputTokens to 8192 and returns { ok: true } for pre-selected models', () => {
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({
            provider_max_output_tokens: 8192,
            hard_cap_output_tokens: 8192,
        });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const selectedModel = mockAiProvidersRow({
            id: 'selected-model-8192',
            name: 'Selected Model',
            config: modelConfig,
        });
        const existingSelection: SelectedModels[] = [
            { id: 'selected-model-8192', displayName: 'Selected Model' },
        ];

        useAuthStore.setState({ isLoading: false, userTier: tierWithOutputCap });
        useDialecticStore.setState({
            outputCapUserCustomized: false,
            maxOutputTokens: null,
            selectedModels: existingSelection,
            isLoadingModelCatalog: false,
            modelCatalog: [selectedModel],
        });

        const { initializeMaxOutputTokens } = useDialecticStore.getState();
        const result: InitializeMaxOutputTokensResult = initializeMaxOutputTokens();

        expect(result).toEqual({ ok: true });
        const state = useDialecticStore.getState();
        expect(state.maxOutputTokens).toBe(8192);
        expect(state.selectedModels).toEqual(existingSelection);
    });

    it('sets maxOutputTokens to 4096 across selected models under Ultra tier and returns { ok: true }', () => {
        const lowerCapModelConfig: AiModelExtendedConfig = mockAiModelConfig({
            provider_max_output_tokens: 4096,
            hard_cap_output_tokens: 4096,
        });
        if (!isJson(lowerCapModelConfig)) {
            throw new Error('lowerCapModelConfig is not a valid Json');
        }
        const higherCapModelConfig: AiModelExtendedConfig = mockAiModelConfig({
            provider_max_output_tokens: 65536,
            hard_cap_output_tokens: 65536,
        });
        if (!isJson(higherCapModelConfig)) {
            throw new Error('higherCapModelConfig is not a valid Json');
        }
        const lowerCapModel = mockAiProvidersRow({
            id: 'model-4096',
            name: 'Model 4096',
            config: lowerCapModelConfig,
        });
        const higherCapModel = mockAiProvidersRow({
            id: 'model-65536',
            name: 'Model 65536',
            config: higherCapModelConfig,
        });

        useAuthStore.setState({ isLoading: false, userTier: ultraTier });
        useDialecticStore.setState({
            outputCapUserCustomized: false,
            maxOutputTokens: null,
            selectedModels: [
                { id: 'model-4096', displayName: 'Model 4096' },
                { id: 'model-65536', displayName: 'Model 65536' },
            ],
            isLoadingModelCatalog: false,
            modelCatalog: [lowerCapModel, higherCapModel],
        });

        const { initializeMaxOutputTokens } = useDialecticStore.getState();
        const result: InitializeMaxOutputTokensResult = initializeMaxOutputTokens();

        expect(result).toEqual({ ok: true });
        expect(useDialecticStore.getState().maxOutputTokens).toBe(4096);
    });

    it('returns { ok: false, error } with code NO_DEFAULT_GENERATION_MODELS when default models are empty and selection is empty', () => {
        const nonDefaultModel = mockAiProvidersRow({
            is_default_generation: false,
            is_active: true,
        });

        useAuthStore.setState({ isLoading: false, userTier: tierWithOutputCap });
        useDialecticStore.setState({
            outputCapUserCustomized: false,
            maxOutputTokens: null,
            selectedModels: [],
            isLoadingModelCatalog: false,
            modelCatalog: [nonDefaultModel],
        });

        const setMaxOutputTokensSpy = vi.spyOn(useDialecticStore.getState(), 'setMaxOutputTokens');
        const { initializeMaxOutputTokens } = useDialecticStore.getState();
        const result: InitializeMaxOutputTokensResult = initializeMaxOutputTokens();

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('NO_DEFAULT_GENERATION_MODELS');
        }
        expect(setMaxOutputTokensSpy).not.toHaveBeenCalled();
        setMaxOutputTokensSpy.mockRestore();
    });

    it('returns { ok: false, error } with code MODEL_CATALOG_INVALID_CONFIG when model config has no finite output cap fields', () => {
        const modelWithoutOutputCap = mockAiProvidersRow({
            id: 'no-cap-model',
            name: 'No Cap Model',
            config: mockCatalogConfigMissingOutputCap(),
        });

        useAuthStore.setState({ isLoading: false, userTier: tierWithOutputCap });
        useDialecticStore.setState({
            outputCapUserCustomized: false,
            maxOutputTokens: 2048,
            selectedModels: [{ id: 'no-cap-model', displayName: 'No Cap Model' }],
            isLoadingModelCatalog: false,
            modelCatalog: [modelWithoutOutputCap],
        });

        const { initializeMaxOutputTokens } = useDialecticStore.getState();
        const result: InitializeMaxOutputTokensResult = initializeMaxOutputTokens();

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('MODEL_CATALOG_INVALID_CONFIG');
            expect(result.error.details).toEqual({ modelId: 'no-cap-model' });
        }
        expect(useDialecticStore.getState().maxOutputTokens).toBe(2048);
        expect(isAiModelExtendedConfig(modelWithoutOutputCap.config)).toBe(false);
    });

    it('returns { ok: false, error } with code MODEL_CATALOG_ENTRY_MISSING when selected model id is absent from catalog', () => {
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ provider_max_output_tokens: 4096 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const catalogModel = mockAiProvidersRow({
            id: 'catalog-model-only',
            name: 'Catalog Model',
            config: modelConfig,
        });

        useAuthStore.setState({ isLoading: false, userTier: tierWithOutputCap });
        useDialecticStore.setState({
            outputCapUserCustomized: false,
            maxOutputTokens: null,
            selectedModels: [{ id: 'missing-model-id', displayName: 'Missing Model' }],
            isLoadingModelCatalog: false,
            modelCatalog: [catalogModel],
        });

        const { initializeMaxOutputTokens } = useDialecticStore.getState();
        const result: InitializeMaxOutputTokensResult = initializeMaxOutputTokens();

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('MODEL_CATALOG_ENTRY_MISSING');
            expect(result.error.details).toEqual({ modelId: 'missing-model-id' });
        }
    });

    it('returns { ok: false, error } with code MODEL_CATALOG_INVALID_CONFIG when isAiModelExtendedConfig fails before cap read', () => {
        const invalidGuardConfigModel = mockAiProvidersRow({
            id: 'invalid-guard-model',
            name: 'Invalid Guard Model',
            config: {
                input_token_cost_rate: 1,
                output_token_cost_rate: 1,
                tokenization_strategy: { type: 'anthropic_tokenizer' },
                provider_max_output_tokens: 4096,
                hard_cap_output_tokens: 4096,
            },
        });

        useAuthStore.setState({ isLoading: false, userTier: tierWithOutputCap });
        useDialecticStore.setState({
            outputCapUserCustomized: false,
            maxOutputTokens: null,
            selectedModels: [{ id: 'invalid-guard-model', displayName: 'Invalid Guard Model' }],
            isLoadingModelCatalog: false,
            modelCatalog: [invalidGuardConfigModel],
        });

        const { initializeMaxOutputTokens } = useDialecticStore.getState();
        const result: InitializeMaxOutputTokensResult = initializeMaxOutputTokens();

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('MODEL_CATALOG_INVALID_CONFIG');
            expect(result.error.code).not.toBe('MODEL_OUTPUT_CAP_UNAVAILABLE');
            expect(result.error.details).toEqual({ modelId: 'invalid-guard-model' });
        }
    });

    it('never invokes setMaxOutputTokens when initialization succeeds', () => {
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({
            provider_max_output_tokens: 4096,
            hard_cap_output_tokens: 4096,
        });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const defaultGenerationModel = mockAiProvidersRow({
            id: 'spy-default-model',
            name: 'Spy Default',
            is_default_generation: true,
            is_active: true,
            config: modelConfig,
        });

        useAuthStore.setState({ isLoading: false, userTier: tierWithOutputCap });
        useDialecticStore.setState({
            outputCapUserCustomized: false,
            maxOutputTokens: null,
            selectedModels: [],
            isLoadingModelCatalog: false,
            modelCatalog: [defaultGenerationModel],
        });

        const setMaxOutputTokensSpy = vi.spyOn(useDialecticStore.getState(), 'setMaxOutputTokens');
        const { initializeMaxOutputTokens } = useDialecticStore.getState();
        const result: InitializeMaxOutputTokensResult = initializeMaxOutputTokens();

        expect(result).toEqual({ ok: true });
        expect(setMaxOutputTokensSpy).not.toHaveBeenCalled();
        expect(useDialecticStore.getState().maxOutputTokens).toBe(4096);
        setMaxOutputTokensSpy.mockRestore();
    });

    it('returns { ok: true, skipped: true } and leaves maxOutputTokens unchanged when outputCapUserCustomized is true', () => {
        const modelConfig: AiModelExtendedConfig = mockAiModelConfig({ provider_max_output_tokens: 8192 });
        if (!isJson(modelConfig)) {
            throw new Error('modelConfig is not a valid Json');
        }
        const defaultGenerationModel = mockAiProvidersRow({
            is_default_generation: true,
            is_active: true,
            config: modelConfig,
        });

        useAuthStore.setState({ isLoading: false, userTier: tierWithOutputCap });
        useDialecticStore.setState({
            outputCapUserCustomized: true,
            maxOutputTokens: 4096,
            selectedModels: [],
            isLoadingModelCatalog: false,
            modelCatalog: [defaultGenerationModel],
        });

        const { initializeMaxOutputTokens } = useDialecticStore.getState();
        const result: InitializeMaxOutputTokensResult = initializeMaxOutputTokens();

        expect(result).toEqual({ ok: true, skipped: true });
        const state = useDialecticStore.getState();
        expect(state.maxOutputTokens).toBe(4096);
        expect(state.outputCapUserCustomized).toBe(true);
    });
});

describe('setMaxOutputTokens', () => {
    beforeEach(() => {
        resetApiMock();
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks();
    });

    it('sets maxOutputTokens to 5000 and outputCapUserCustomized to true', () => {
        useDialecticStore.setState({
            maxOutputTokens: null,
            outputCapUserCustomized: false,
        });

        const { setMaxOutputTokens } = useDialecticStore.getState();
        setMaxOutputTokens(5000);

        const state = useDialecticStore.getState();
        expect(state.maxOutputTokens).toBe(5000);
        expect(state.outputCapUserCustomized).toBe(true);
    });
});
