import { describe, it, expect } from 'vitest';
import {
    isJson,
    isPlainObject,
    isRecord,
    isDialecticDomainRow,
    isDomainProcessAssociationRow,
    isStageExpectedCount,
    isGetStageExpectedCountsResponse,
    isAiModelExtendedConfig,
} from './dialectic.guard';
import type {
    DialecticDomainRow,
    DomainProcessAssociationRow,
    StageExpectedCount,
    GetStageExpectedCountsResponse,
    AiModelExtendedConfig,
} from '@paynless/types';

describe('isJson', () => {
    it('returns true for primitive JSON types', () => {
        expect(isJson('a string')).toBe(true);
        expect(isJson(123.45)).toBe(true);
        expect(isJson(true)).toBe(true);
        expect(isJson(false)).toBe(true);
        expect(isJson(null)).toBe(true);
    });

    it('returns true for valid JSON objects', () => {
        expect(isJson({})).toBe(true);
        expect(isJson({ key: 'value', number: 1, bool: true, nullable: null })).toBe(true);
        expect(isJson({ nested: { a: 1 } })).toBe(true);
    });

    it('returns true for valid JSON arrays', () => {
        expect(isJson([])).toBe(true);
        expect(isJson([1, 'two', false, null])).toBe(true);
        expect(isJson([{ a: 1 }, { b: 2 }])).toBe(true);
        expect(isJson([1, [2, [3]]])).toBe(true);
    });

    it('returns true for complex nested structures', () => {
        const complex = {
            a: 'string',
            b: [1, { c: true, d: [null] }],
            e: { f: { g: 'nested' } },
        };
        expect(isJson(complex)).toBe(true);
    });

    it('returns false for non-JSON primitives', () => {
        expect(isJson(undefined)).toBe(false);
        expect(isJson(Symbol('s'))).toBe(false);
        expect(isJson(BigInt(9007199254740991))).toBe(false);
    });

    it('returns false for objects containing non-JSON values', () => {
        expect(isJson({ key: undefined })).toBe(true);
        expect(isJson({ key: () => 'function' })).toBe(false);
        expect(isJson({ key: new Date() })).toBe(false);
        expect(isJson({ key: new Map() })).toBe(false);
    });

    it('returns false for arrays containing non-JSON values', () => {
        expect(isJson([1, undefined, 3])).toBe(false);
        expect(isJson([new Set()])).toBe(false);
    });

    it('returns false for class instances', () => {
        class MyClass {
            constructor(public prop: string) {}
        }
        const instance = new MyClass('test');
        expect(isJson(instance)).toBe(false);
    });
});

describe('isPlainObject', () => {
    it('returns true for a plain object', () => {
        expect(isPlainObject({ a: 1 })).toBe(true);
    });

    it('returns false for a non-object', () => {
        expect(isPlainObject(null)).toBe(false);
        expect(isPlainObject('a string')).toBe(false);
        expect(isPlainObject(['a', 'b'])).toBe(false);
    });
});

describe('isRecord', () => {
    it('returns true for a standard object', () => {
        expect(isRecord({ a: 1, b: 'test' })).toBe(true);
    });

    it('returns true for an empty object', () => {
        expect(isRecord({})).toBe(true);
    });

    it('returns false for null', () => {
        expect(isRecord(null)).toBe(false);
    });

    it('returns false for an array', () => {
        expect(isRecord([1, 2, 3])).toBe(false);
    });

    it('returns false for a string', () => {
        expect(isRecord('this is a string')).toBe(false);
    });

    it('returns false for a number', () => {
        expect(isRecord(123)).toBe(false);
    });
});

describe('isDialecticDomainRow', () => {
    it('accepts a full domain row with every dialectic_domains column populated', () => {
        const validDomainRow: DialecticDomainRow = {
            id: 'domain-uuid-software',
            name: 'Software Engineering',
            description: 'The application of engineering principles to software development.',
            parent_domain_id: null,
            is_enabled: true,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };
        expect(isDialecticDomainRow(validDomainRow)).toBe(true);
    });

    it('rejects a partial row missing created_at', () => {
        const validDomainRow: DialecticDomainRow = {
            id: 'domain-uuid-software',
            name: 'Software Engineering',
            description: 'The application of engineering principles to software development.',
            parent_domain_id: null,
            is_enabled: true,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };
        const { created_at: _createdAt, ...partialMissingCreatedAt } = validDomainRow;
        expect(isDialecticDomainRow(partialMissingCreatedAt)).toBe(false);
    });

    it('rejects empty id from factory override', () => {
        const validDomainRow: DialecticDomainRow = {
            id: 'domain-uuid-software',
            name: 'Software Engineering',
            description: 'The application of engineering principles to software development.',
            parent_domain_id: null,
            is_enabled: true,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };
        const withEmptyId: DialecticDomainRow = { ...validDomainRow, id: '' };
        expect(isDialecticDomainRow(withEmptyId)).toBe(false);
    });

    it('rejects wrong is_enabled type from factory override', () => {
        const validDomainRow: DialecticDomainRow = {
            id: 'domain-uuid-software',
            name: 'Software Engineering',
            description: 'The application of engineering principles to software development.',
            parent_domain_id: null,
            is_enabled: true,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };
        expect(isDialecticDomainRow({ ...validDomainRow, is_enabled: 'true' })).toBe(false);
    });
});

describe('isDomainProcessAssociationRow', () => {
    it('accepts a full association row with is_default_for_domain true', () => {
        const validAssociationRow: DomainProcessAssociationRow = {
            id: 'association-uuid-default',
            domain_id: 'domain-uuid-software',
            process_template_id: 'pt-thesis',
            is_default_for_domain: true,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };
        expect(isDomainProcessAssociationRow(validAssociationRow)).toBe(true);
    });

    it('rejects is_default_for_domain false from factory override', () => {
        const validAssociationRow: DomainProcessAssociationRow = {
            id: 'association-uuid-default',
            domain_id: 'domain-uuid-software',
            process_template_id: 'pt-thesis',
            is_default_for_domain: true,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };
        const notDefault: DomainProcessAssociationRow = {
            ...validAssociationRow,
            is_default_for_domain: false,
        };
        expect(isDomainProcessAssociationRow(notDefault)).toBe(false);
    });

    it('rejects a partial row missing process_template_id', () => {
        const validAssociationRow: DomainProcessAssociationRow = {
            id: 'association-uuid-default',
            domain_id: 'domain-uuid-software',
            process_template_id: 'pt-thesis',
            is_default_for_domain: true,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };
        const { process_template_id: _processTemplateId, ...missingProcessTemplateId } = validAssociationRow;
        expect(isDomainProcessAssociationRow(missingProcessTemplateId)).toBe(false);
    });

    it('rejects empty domain_id from factory override', () => {
        const validAssociationRow: DomainProcessAssociationRow = {
            id: 'association-uuid-default',
            domain_id: 'domain-uuid-software',
            process_template_id: 'pt-thesis',
            is_default_for_domain: true,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };
        const withEmptyDomainId: DomainProcessAssociationRow = {
            ...validAssociationRow,
            domain_id: '',
        };
        expect(isDomainProcessAssociationRow(withEmptyDomainId)).toBe(false);
    });
});

describe('isStageExpectedCount', () => {
    it('accepts a valid stage expected count entry', () => {
        const validStageExpectedCount: StageExpectedCount = {
            stageSlug: 'thesis',
            expectedCount: 3,
        };
        expect(isStageExpectedCount(validStageExpectedCount)).toBe(true);
    });

    it('rejects empty stageSlug from factory override', () => {
        const validStageExpectedCount: StageExpectedCount = {
            stageSlug: 'thesis',
            expectedCount: 3,
        };
        const withEmptySlug: StageExpectedCount = { ...validStageExpectedCount, stageSlug: '' };
        expect(isStageExpectedCount(withEmptySlug)).toBe(false);
    });

    it('rejects negative expectedCount from factory override', () => {
        const validStageExpectedCount: StageExpectedCount = {
            stageSlug: 'thesis',
            expectedCount: 3,
        };
        const withNegativeCount: StageExpectedCount = {
            ...validStageExpectedCount,
            expectedCount: -1,
        };
        expect(isStageExpectedCount(withNegativeCount)).toBe(false);
    });

    it('rejects non-integer expectedCount from factory override', () => {
        const validStageExpectedCount: StageExpectedCount = {
            stageSlug: 'thesis',
            expectedCount: 3,
        };
        const withFractionCount: StageExpectedCount = {
            ...validStageExpectedCount,
            expectedCount: 1.5,
        };
        expect(isStageExpectedCount(withFractionCount)).toBe(false);
    });
});

describe('isGetStageExpectedCountsResponse', () => {
    it('accepts a valid getStageExpectedCounts response', () => {
        const validStageExpectedCount: StageExpectedCount = {
            stageSlug: 'thesis',
            expectedCount: 3,
        };
        const validResponse: GetStageExpectedCountsResponse = {
            stages: [validStageExpectedCount],
            totalStages: 1,
        };
        expect(isGetStageExpectedCountsResponse(validResponse)).toBe(true);
    });

    it('rejects null', () => {
        expect(isGetStageExpectedCountsResponse(null)).toBe(false);
    });

    it('rejects undefined', () => {
        expect(isGetStageExpectedCountsResponse(undefined)).toBe(false);
    });

    it('rejects an empty record', () => {
        expect(isGetStageExpectedCountsResponse({})).toBe(false);
    });

    it('rejects non-array stages from factory override', () => {
        const validStageExpectedCount: StageExpectedCount = {
            stageSlug: 'thesis',
            expectedCount: 3,
        };
        const validResponse: GetStageExpectedCountsResponse = {
            stages: [validStageExpectedCount],
            totalStages: 1,
        };
        expect(
            isGetStageExpectedCountsResponse({
                ...validResponse,
                stages: 'not-array',
            }),
        ).toBe(false);
    });

    it('rejects invalid stage element from factory override', () => {
        const validStageExpectedCount: StageExpectedCount = {
            stageSlug: 'thesis',
            expectedCount: 3,
        };
        const validResponse: GetStageExpectedCountsResponse = {
            stages: [validStageExpectedCount],
            totalStages: 1,
        };
        expect(
            isGetStageExpectedCountsResponse({
                ...validResponse,
                stages: [{ ...validStageExpectedCount, stageSlug: '' }],
            }),
        ).toBe(false);
    });

    it('rejects negative totalStages from factory override', () => {
        const validStageExpectedCount: StageExpectedCount = {
            stageSlug: 'thesis',
            expectedCount: 3,
        };
        const validResponse: GetStageExpectedCountsResponse = {
            stages: [validStageExpectedCount],
            totalStages: 1,
        };
        const withNegativeTotal: GetStageExpectedCountsResponse = {
            ...validResponse,
            totalStages: -1,
        };
        expect(isGetStageExpectedCountsResponse(withNegativeTotal)).toBe(false);
    });

    it('rejects non-integer totalStages from factory override', () => {
        const validStageExpectedCount: StageExpectedCount = {
            stageSlug: 'thesis',
            expectedCount: 3,
        };
        const validResponse: GetStageExpectedCountsResponse = {
            stages: [validStageExpectedCount],
            totalStages: 1,
        };
        const withFractionTotal: GetStageExpectedCountsResponse = {
            ...validResponse,
            totalStages: 1.5,
        };
        expect(isGetStageExpectedCountsResponse(withFractionTotal)).toBe(false);
    });
});

describe('isAiModelExtendedConfig', () => {
    it('accepts a full valid AiModelExtendedConfig with required and optional fields', () => {
        const fullValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            hard_cap_output_tokens: 4096,
            context_window_tokens: 128000,
            provider_max_input_tokens: 100000,
            provider_max_output_tokens: 4096,
            default_temperature: 0.7,
            default_top_p: 1.0,
            tokenization_strategy: {
                type: 'tiktoken',
                tiktoken_encoding_name: 'cl100k_base',
                is_chatml_model: true,
                api_identifier_for_tokenization: 'gpt-4o',
            },
        };
        expect(isAiModelExtendedConfig(fullValidConfig)).toBe(true);
    });

    it('accepts a minimal valid config with only required fields', () => {
        const minimalValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            tokenization_strategy: { type: 'tiktoken' },
        };
        expect(isAiModelExtendedConfig(minimalValidConfig)).toBe(true);
    });

    it('accepts context_window_tokens null from factory override', () => {
        const minimalValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            tokenization_strategy: { type: 'tiktoken' },
        };
        const withNullContextWindow: AiModelExtendedConfig = {
            ...minimalValidConfig,
            context_window_tokens: null,
        };
        expect(isAiModelExtendedConfig(withNullContextWindow)).toBe(true);
    });

    it('rejects a partial config missing input_token_cost_rate', () => {
        const minimalValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            tokenization_strategy: { type: 'tiktoken' },
        };
        const { input_token_cost_rate: _inputTokenCostRate, ...missingInputRate } = minimalValidConfig;
        expect(isAiModelExtendedConfig(missingInputRate)).toBe(false);
    });

    it('rejects a partial config missing output_token_cost_rate', () => {
        const minimalValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            tokenization_strategy: { type: 'tiktoken' },
        };
        const { output_token_cost_rate: _outputTokenCostRate, ...missingOutputRate } = minimalValidConfig;
        expect(isAiModelExtendedConfig(missingOutputRate)).toBe(false);
    });

    it('rejects non-number input_token_cost_rate from factory override', () => {
        const minimalValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            tokenization_strategy: { type: 'tiktoken' },
        };
        expect(isAiModelExtendedConfig({ ...minimalValidConfig, input_token_cost_rate: '1' })).toBe(false);
    });

    it('rejects non-finite input_token_cost_rate from factory override', () => {
        const minimalValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            tokenization_strategy: { type: 'tiktoken' },
        };
        expect(isAiModelExtendedConfig({ ...minimalValidConfig, input_token_cost_rate: NaN })).toBe(false);
    });

    it('rejects non-number output_token_cost_rate from factory override', () => {
        const minimalValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            tokenization_strategy: { type: 'tiktoken' },
        };
        expect(isAiModelExtendedConfig({ ...minimalValidConfig, output_token_cost_rate: '3' })).toBe(false);
    });

    it('rejects non-finite output_token_cost_rate from factory override', () => {
        const minimalValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            tokenization_strategy: { type: 'tiktoken' },
        };
        expect(isAiModelExtendedConfig({ ...minimalValidConfig, output_token_cost_rate: NaN })).toBe(false);
    });

    it('rejects a partial config missing tokenization_strategy', () => {
        const minimalValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            tokenization_strategy: { type: 'tiktoken' },
        };
        const { tokenization_strategy: _tokenizationStrategy, ...missingTokenizationStrategy } = minimalValidConfig;
        expect(isAiModelExtendedConfig(missingTokenizationStrategy)).toBe(false);
    });

    it('rejects tokenization_strategy.type not in the literal set from factory override', () => {
        const minimalValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            tokenization_strategy: { type: 'tiktoken' },
        };
        expect(
            isAiModelExtendedConfig({
                ...minimalValidConfig,
                tokenization_strategy: { type: 'not-a-valid-strategy-type' },
            }),
        ).toBe(false);
    });

    it('rejects optional numeric hard_cap_output_tokens when present but non-number from factory override', () => {
        const minimalValidConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1.0,
            output_token_cost_rate: 3.0,
            tokenization_strategy: { type: 'tiktoken' },
        };
        expect(isAiModelExtendedConfig({ ...minimalValidConfig, hard_cap_output_tokens: 'x' })).toBe(false);
    });

    it('rejects null', () => {
        expect(isAiModelExtendedConfig(null)).toBe(false);
    });

    it('rejects an array', () => {
        expect(isAiModelExtendedConfig([])).toBe(false);
    });

    it('rejects a string', () => {
        expect(isAiModelExtendedConfig('not-a-config')).toBe(false);
    });

    it('rejects a number', () => {
        expect(isAiModelExtendedConfig(42)).toBe(false);
    });
});
