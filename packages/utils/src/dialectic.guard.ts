import {
    Json,
    DialecticDomainRow,
    DomainProcessAssociationRow,
    StageExpectedCount,
    GetStageExpectedCountsResponse,
    AiModelExtendedConfig,
} from '@paynless/types';


export function isJson(value: unknown, isObjectProperty = false): value is Json {
    const typeOfValue = typeof value;

    if (typeOfValue === 'undefined') {
        return isObjectProperty;
    }

    if (value === null || typeOfValue === 'boolean' || typeOfValue === 'number' || typeOfValue === 'string') {
        return true;
    }

    if (typeOfValue === 'object') {
        if (Array.isArray(value)) {
            return value.every((item) => isJson(item, false));
        }
        
        if (isPlainObject(value)) {
            return Object.values(value).every((v) => isJson(v, true));
        }
    }

    return false;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    // It's a plain object if its prototype is Object.prototype or it has no prototype (e.g., Object.create(null)).
    return proto === Object.prototype || proto === null;
}

export function isRecord(item: unknown): item is Record<PropertyKey, unknown> {
    return (item !== null && typeof item === 'object' && !Array.isArray(item));
}

export function isDialecticDomainRow(value: unknown): value is DialecticDomainRow {
    if (!isRecord(value)) {
        return false;
    }
    const id: unknown = value['id'];
    if (typeof id !== 'string' || id.length === 0) {
        return false;
    }
    const name: unknown = value['name'];
    if (typeof name !== 'string' || name.length === 0) {
        return false;
    }
    const description: unknown = value['description'];
    if (description !== null && typeof description !== 'string') {
        return false;
    }
    const parentDomainId: unknown = value['parent_domain_id'];
    if (parentDomainId !== null && typeof parentDomainId !== 'string') {
        return false;
    }
    const isEnabled: unknown = value['is_enabled'];
    if (typeof isEnabled !== 'boolean') {
        return false;
    }
    const createdAt: unknown = value['created_at'];
    if (typeof createdAt !== 'string' || createdAt.length === 0) {
        return false;
    }
    const updatedAt: unknown = value['updated_at'];
    if (typeof updatedAt !== 'string' || updatedAt.length === 0) {
        return false;
    }
    return true;
}

export function isDomainProcessAssociationRow(value: unknown): value is DomainProcessAssociationRow {
    if (!isRecord(value)) {
        return false;
    }
    const id: unknown = value['id'];
    if (typeof id !== 'string' || id.length === 0) {
        return false;
    }
    const domainId: unknown = value['domain_id'];
    if (typeof domainId !== 'string' || domainId.length === 0) {
        return false;
    }
    const processTemplateId: unknown = value['process_template_id'];
    if (typeof processTemplateId !== 'string' || processTemplateId.length === 0) {
        return false;
    }
    const isDefaultForDomain: unknown = value['is_default_for_domain'];
    if (isDefaultForDomain !== true) {
        return false;
    }
    const createdAt: unknown = value['created_at'];
    if (typeof createdAt !== 'string' || createdAt.length === 0) {
        return false;
    }
    const updatedAt: unknown = value['updated_at'];
    if (typeof updatedAt !== 'string' || updatedAt.length === 0) {
        return false;
    }
    return true;
}

export function isStageExpectedCount(value: unknown): value is StageExpectedCount {
    if (!isRecord(value)) {
        return false;
    }
    const stageSlug: unknown = value['stageSlug'];
    if (typeof stageSlug !== 'string' || stageSlug.length === 0) {
        return false;
    }
    const expectedCount: unknown = value['expectedCount'];
    if (
        typeof expectedCount !== 'number'
        || !Number.isInteger(expectedCount)
        || !Number.isFinite(expectedCount)
        || expectedCount < 0
    ) {
        return false;
    }
    return true;
}

export function isGetStageExpectedCountsResponse(value: unknown): value is GetStageExpectedCountsResponse {
    if (!isRecord(value)) {
        return false;
    }
    const stages: unknown = value['stages'];
    if (!Array.isArray(stages)) {
        return false;
    }
    for (const stage of stages) {
        if (!isStageExpectedCount(stage)) {
            return false;
        }
    }
    const totalStages: unknown = value['totalStages'];
    if (
        typeof totalStages !== 'number'
        || !Number.isInteger(totalStages)
        || !Number.isFinite(totalStages)
        || totalStages < 0
    ) {
        return false;
    }
    return true;
}

export function isAiModelExtendedConfig(value: unknown): value is AiModelExtendedConfig {
    if (!isRecord(value)) {
        return false;
    }
    const inputTokenCostRate: unknown = value['input_token_cost_rate'];
    if (typeof inputTokenCostRate !== 'number' || !Number.isFinite(inputTokenCostRate)) {
        return false;
    }
    const outputTokenCostRate: unknown = value['output_token_cost_rate'];
    if (typeof outputTokenCostRate !== 'number' || !Number.isFinite(outputTokenCostRate)) {
        return false;
    }
    const tokenizationStrategy: unknown = value['tokenization_strategy'];
    if (!isRecord(tokenizationStrategy)) {
        return false;
    }
    const strategyType: unknown = tokenizationStrategy['type'];
    if (
        strategyType !== 'tiktoken'
        && strategyType !== 'rough_char_count'
        && strategyType !== 'anthropic_tokenizer'
        && strategyType !== 'google_gemini_tokenizer'
        && strategyType !== 'none'
    ) {
        return false;
    }
    if (strategyType === 'anthropic_tokenizer') {
        const anthropicModel: unknown = tokenizationStrategy['model'];
        if (typeof anthropicModel !== 'string' || anthropicModel.length === 0) {
            return false;
        }
    }
    if ('hard_cap_output_tokens' in value) {
        const hardCapOutputTokens: unknown = value['hard_cap_output_tokens'];
        if (typeof hardCapOutputTokens !== 'number' || !Number.isFinite(hardCapOutputTokens)) {
            return false;
        }
    }
    if ('provider_max_output_tokens' in value) {
        const providerMaxOutputTokens: unknown = value['provider_max_output_tokens'];
        if (typeof providerMaxOutputTokens !== 'number' || !Number.isFinite(providerMaxOutputTokens)) {
            return false;
        }
    }
    if ('provider_max_input_tokens' in value) {
        const providerMaxInputTokens: unknown = value['provider_max_input_tokens'];
        if (typeof providerMaxInputTokens !== 'number' || !Number.isFinite(providerMaxInputTokens)) {
            return false;
        }
    }
    if ('default_temperature' in value) {
        const defaultTemperature: unknown = value['default_temperature'];
        if (typeof defaultTemperature !== 'number' || !Number.isFinite(defaultTemperature)) {
            return false;
        }
    }
    if ('default_top_p' in value) {
        const defaultTopP: unknown = value['default_top_p'];
        if (typeof defaultTopP !== 'number' || !Number.isFinite(defaultTopP)) {
            return false;
        }
    }
    if ('context_window_tokens' in value) {
        const contextWindowTokens: unknown = value['context_window_tokens'];
        if (contextWindowTokens !== null) {
            if (typeof contextWindowTokens !== 'number' || !Number.isFinite(contextWindowTokens)) {
                return false;
            }
        }
    }
    const hardCapOutputTokens: unknown = value['hard_cap_output_tokens'];
    const providerMaxOutputTokens: unknown = value['provider_max_output_tokens'];
    const hasFiniteHardCapOutputTokens: boolean =
        typeof hardCapOutputTokens === 'number' && Number.isFinite(hardCapOutputTokens);
    const hasFiniteProviderMaxOutputTokens: boolean =
        typeof providerMaxOutputTokens === 'number' && Number.isFinite(providerMaxOutputTokens);
    if (!hasFiniteHardCapOutputTokens && !hasFiniteProviderMaxOutputTokens) {
        return false;
    }
    return true;
}