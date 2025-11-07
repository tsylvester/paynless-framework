import { assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { Tables, Json } from "../../../types_db.ts";
import { 
    isSelectedAiProvider,
    isUserRole,
    isAiModelExtendedConfig,
    isTokenUsage,
    isChatMessageRole,
    isChatMessageRow,
    isChatInsert,
    isKnownTiktokenEncoding,
    isChatApiRequest,
    isApiChatMessage,
    isFinishReason,
    isContinueReason,
} from './type_guards.chat.ts';
import type { 
    AiModelExtendedConfig, 
    TokenUsage, 
    ChatInsert, 
    ChatApiRequest, 
    FinishReason 
} from '../../types.ts';

Deno.test('Type Guard: isAiModelExtendedConfig', async (t) => {
    await t.step('should return true for a valid config with tiktoken strategy', () => {
        const config: AiModelExtendedConfig = {
            api_identifier: 'gpt-4',
            input_token_cost_rate: 0.01,
            output_token_cost_rate: 0.03,
            tokenization_strategy: {
                type: 'tiktoken',
                tiktoken_encoding_name: 'cl100k_base',
            },
        };
        assert(isAiModelExtendedConfig(config));
    });

    await t.step('should return true for a valid config with rough_char_count strategy', () => {
        const config: AiModelExtendedConfig = {
            api_identifier: 'claude-3',
            input_token_cost_rate: 0.005,
            output_token_cost_rate: 0.015,
            tokenization_strategy: {
                type: 'rough_char_count',
                chars_per_token_ratio: 3.5,
            },
        };
        assert(isAiModelExtendedConfig(config));
    });

    await t.step('should return false if tokenization_strategy is missing', () => {
        const config = {
            api_identifier: 'gpt-4',
            input_token_cost_rate: 0.01,
        };
        assert(!isAiModelExtendedConfig(config));
    });

    await t.step('should return false if tokenization_strategy is not an object', () => {
        const config = {
            api_identifier: 'gpt-4',
            tokenization_strategy: 'tiktoken',
        };
        assert(!isAiModelExtendedConfig(config));
    });

    await t.step('should return false if tiktoken_encoding_name is missing for tiktoken strategy', () => {
        const config = {
            api_identifier: 'gpt-4',
            tokenization_strategy: {
                type: 'tiktoken',
            },
        };
        assert(!isAiModelExtendedConfig(config));
    });

    await t.step('should return false if chars_per_token_ratio is not a number', () => {
        const config = {
            api_identifier: 'claude-3',
            tokenization_strategy: {
                type: 'rough_char_count',
                chars_per_token_ratio: 'four',
            },
        };
        assert(!isAiModelExtendedConfig(config));
    });

    await t.step('should return false for null or non-object input', () => {
        assert(!isAiModelExtendedConfig(null));
        assert(!isAiModelExtendedConfig('a string'));
        assert(!isAiModelExtendedConfig(123));
        assert(!isAiModelExtendedConfig([]));
    });
});

Deno.test('Type Guard: isChatApiRequest', async (t) => {
    await t.step('accepts minimal valid request', () => {
        const req: ChatApiRequest = {
            message: 'Hello',
            providerId: 'provider-1',
            promptId: '__none__',
        };
        assert(isChatApiRequest(req));
    });

    await t.step('accepts extended fields: systemInstruction, messages, resourceDocuments, walletId', () => {
        const req: ChatApiRequest = {
            message: 'Hi there',
            providerId: 'prov-123',
            promptId: '__none__',
            walletId: 'wallet-1',
            systemInstruction: 'Be concise',
            messages: [
                { role: 'user', content: 'Earlier' },
                { role: 'assistant', content: 'Reply' },
            ],
            resourceDocuments: [
                { id: 'doc-1', content: 'Context A' },
            ],
        };
        assert(isChatApiRequest(req));
        // Ensure messages elements pass the narrower guard as well
        assert(req.messages?.every(m => isApiChatMessage({ role: m.role, content: m.content })) === true);
    });

    await t.step('rejects missing required fields', () => {
        const bad1 = { providerId: 'p', promptId: '__none__' };
        const bad2 = { message: 'x', promptId: '__none__' };
        const bad3 = { message: 'x', providerId: 'p' };
        assert(!isChatApiRequest(bad1));
        assert(!isChatApiRequest(bad2));
        assert(!isChatApiRequest(bad3));
    });

    await t.step('rejects wrong-typed required fields', () => {
        const bad = { message: 123, providerId: 'p', promptId: '__none__' };
        assert(!isChatApiRequest(bad));
    });

    await t.step('rejects non-object', () => {
        assert(!isChatApiRequest(null));
        assert(!isChatApiRequest('string'));
        assert(!isChatApiRequest(123));
        assert(!isChatApiRequest([]));
    });
});

Deno.test('Type Guard: isChatInsert', async (t) => {
    await t.step('should return true for a valid minimal ChatInsert object', () => {
        const insert: ChatInsert = {
            user_id: 'user1',
            created_at: new Date().toISOString(),
            id: 'chat1',
            organization_id: 'org1',
            system_prompt_id: 'prompt1',
            title: 'Test Chat',
            updated_at: new Date().toISOString(),
        };
        assert(isChatInsert(insert));
    });

    await t.step('should return true for a full ChatInsert object', () => {
        const insert: ChatInsert = {
            id: 'chat1',
            user_id: 'user1',
            organization_id: 'org1',
            system_prompt_id: 'prompt1',
            title: 'Test Chat',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        assert(isChatInsert(insert));
    });

    await t.step('should return false if user_id is missing', () => {
        const insert = { title: 'Test Chat' };
        assert(!isChatInsert(insert));
    });

    await t.step('should return false if an optional field has the wrong type', () => {
        const insert = { user_id: 'user1', title: 123 };
        assert(!isChatInsert(insert));
    });

    await t.step('should return false for non-object inputs', () => {
        assert(!isChatInsert(null));
        assert(!isChatInsert('a string'));
    });
});

Deno.test('Type Guard: isChatMessageRole', async (t) => {
    await t.step('should return true for valid roles', () => {
        assert(isChatMessageRole('system'));
        assert(isChatMessageRole('user'));
        assert(isChatMessageRole('assistant'));
    });

    await t.step('should return false for invalid roles', () => {
        assert(!isChatMessageRole('admin'));
        assert(!isChatMessageRole(''));
        assert(!isChatMessageRole(' user'));
    });

    await t.step('should return false for non-string values', () => {
        assert(!isChatMessageRole(null as unknown as string));
        assert(!isChatMessageRole(123 as unknown as string));
        assert(!isChatMessageRole({} as unknown as string));
    });
});

Deno.test('Type Guard: isChatMessageRow', async (t) => {
    const baseMessage: Tables<'chat_messages'> = {
        id: 'msg1',
        chat_id: 'chat1',
        user_id: 'user1',
        role: 'user',
        content: 'Hello, world!',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active_in_thread: true,
        token_usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
        ai_provider_id: null,
        system_prompt_id: null,
        error_type: null,
        response_to_message_id: null,
    };

    await t.step('should return true for a valid chat message row', () => {
        assert(isChatMessageRow(baseMessage));
    });

    await t.step('should return true for a message with all nullable fields as null', () => {
        const message = { ...baseMessage };
        assert(isChatMessageRow(message));
    });

    await t.step('should return false if a required field is missing (e.g., chat_id)', () => {
        const { chat_id, ...invalidMessage } = baseMessage;
        assert(!isChatMessageRow(invalidMessage));
    });

    await t.step('should return false if a field has the wrong type (e.g., is_active_in_thread)', () => {
        const invalidMessage = { ...baseMessage, is_active_in_thread: 'yes' };
        assert(!isChatMessageRow(invalidMessage));
    });

    await t.step('should return false if a nullable field has the wrong type (e.g., user_id)', () => {
        const invalidMessage = { ...baseMessage, user_id: 123 };
        assert(!isChatMessageRow(invalidMessage));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isChatMessageRow(null));
        assert(!isChatMessageRow('a string'));
    });
});

// New tests for FinishReason guards
Deno.test('Type Guard: isFinishReason and isContinueReason', async (t) => {
    await t.step('isFinishReason accepts full set and null; isContinueReason only accepts continuation subset', () => {
        const all: (FinishReason)[] = [
            'stop','length','tool_calls','content_filter','function_call','error','unknown','max_tokens','content_truncated',null
        ];
        for (const r of all) {
            // unknown → FinishReason
            const val = r;
            assert(isFinishReason(val));
        }

        // Continuation subset
        const contTrue: FinishReason[] = ['max_tokens','length','content_truncated','unknown'];
        const contFalse: FinishReason[] = ['stop','tool_calls','content_filter','function_call','error', null];

        for (const r of contTrue) {
            assert(isContinueReason(r));
        }
        for (const r of contFalse) {
            assert(!isContinueReason(r));
        }
    });
});

Deno.test('Type Guard: isKnownTiktokenEncoding', async (t) => {
    await t.step('should return true for supported encoding names', () => {
        assert(isKnownTiktokenEncoding('cl100k_base'));
        assert(isKnownTiktokenEncoding('p50k_base'));
        assert(isKnownTiktokenEncoding('r50k_base'));
        assert(isKnownTiktokenEncoding('gpt2'));
    });

    await t.step('should return false for unsupported encoding names', () => {
        assert(!isKnownTiktokenEncoding('o200k_base'));
        assert(!isKnownTiktokenEncoding('unknown_encoding'));
        assert(!isKnownTiktokenEncoding(''));
    });

    await t.step('should return false for non-string values', () => {
        assert(!isKnownTiktokenEncoding(null));
        assert(!isKnownTiktokenEncoding(undefined));
        assert(!isKnownTiktokenEncoding(123));
        assert(!isKnownTiktokenEncoding({}));
        assert(!isKnownTiktokenEncoding([]));
    });
});

Deno.test('Type Guard: isSelectedAiProvider', async (t) => {
    await t.step('should return true for a valid provider object', () => {
        const provider: Tables<'ai_providers'> = {
            id: 'p1',
            created_at: new Date().toISOString(),
            provider: 'openai',
            name: 'GPT-4',
            api_identifier: 'gpt-4',
            config: null,
            description: 'Test provider',
            is_active: true,
            is_enabled: true,
            updated_at: new Date().toISOString(),
            is_default_embedding: false
        };
        assert(isSelectedAiProvider(provider));
    });

    await t.step('should return false if required field is missing (api_identifier)', () => {
        const invalidProvider = {
            id: 'p2',
            provider: 'anthropic',
            name: 'Claude 3'
        };
        assert(!isSelectedAiProvider(invalidProvider));
    });
    
    await t.step('should return false if required string is empty (name)', () => {
        const invalidProvider = {
            id: 'p3',
            provider: 'google',
            name: '',
            api_identifier: 'gemini-pro'
        };
        assert(!isSelectedAiProvider(invalidProvider));
    });

    await t.step('should return false for a plain object', () => {
        const obj = { foo: 'bar' };
        assert(!isSelectedAiProvider(obj));
    });

    await t.step('should return false for null', () => {
        assert(!isSelectedAiProvider(null));
    });
});

Deno.test('Type Guard: isTokenUsage', async (t) => {
    await t.step('should return true for a valid TokenUsage object', () => {
        const usage: TokenUsage = {
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300,
        };
        assert(isTokenUsage(usage));
    });

    await t.step('should return false if prompt_tokens is missing', () => {
        const usage = { completion_tokens: 200, total_tokens: 300 };
        assert(!isTokenUsage(usage));
    });

    await t.step('should return false if completion_tokens is missing', () => {
        const usage = { prompt_tokens: 100, total_tokens: 300 };
        assert(!isTokenUsage(usage));
    });

    await t.step('should return false if total_tokens is missing', () => {
        const usage = { prompt_tokens: 100, completion_tokens: 200 };
        assert(!isTokenUsage(usage));
    });

    await t.step('should return false if a property has the wrong type', () => {
        const usage = {
            prompt_tokens: '100',
            completion_tokens: 200,
            total_tokens: 300,
        };
        assert(!isTokenUsage(usage));
    });

    await t.step('should return false for non-object inputs', () => {
        assert(!isTokenUsage(null));
        assert(!isTokenUsage('a string'));
        assert(!isTokenUsage(123));
        assert(!isTokenUsage([]));
    });
});

Deno.test('Type Guard: isUserRole', async (t) => {
    await t.step('should return true for valid user roles', () => {
        assert(isUserRole('user'));
        assert(isUserRole('admin'));
    });

    await t.step('should return false for invalid string roles', () => {
        assert(!isUserRole('guest'));
        assert(!isUserRole('superadmin'));
        assert(!isUserRole(''));
        assert(!isUserRole(' authenticated ')); // Check for spaces
        assert(!isUserRole('Authenticated')); // Check for case sensitivity
        assert(!isUserRole('user '));
    });

    await t.step('should return false for non-string values', () => {
        assert(!isUserRole(null));
        assert(!isUserRole(undefined));
        assert(!isUserRole(123));
        assert(!isUserRole({ role: 'user' }));
        assert(!isUserRole(['user']));
    });
});

