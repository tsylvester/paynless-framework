import { PostgrestError } from "npm:@supabase/supabase-js@2";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { logger } from "../_shared/logger.ts";
import { findOrCreateChat, FindOrCreateChatDeps, FindOrCreateChatParams } from './findOrCreateChat.ts';
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts";
import { ChatInsert } from "../_shared/types.ts";
import { isChatInsert } from "../_shared/utils/type_guards.ts";


Deno.test('findOrCreateChat: should return existing chat ID if found', async () => {
    // Arrange
    const existingChatId = crypto.randomUUID();
    const { client: mockSupabaseClient, spies, clearAllStubs } = createMockSupabaseClient(
        'test-user-id',
        {
            genericMockResults: {
                chats: {
                    select: { data: [{ id: existingChatId }], error: null, count: 1, status: 200, statusText: 'OK' },
                },
            },
        }
    );

    const deps: FindOrCreateChatDeps = { supabaseClient: mockSupabaseClient as unknown as SupabaseClient<Database>, logger };
    const params: FindOrCreateChatParams = {
        userId: 'test-user-id',
        existingChatId,
        organizationId: null,
        finalSystemPromptIdForDb: null,
        userMessageContent: 'Hello'
    };

    // Act
    const chatId = await findOrCreateChat(deps, params);

    // Assert
    assertEquals(chatId, existingChatId);
    const fromSpy = spies.fromSpy;
    assert(fromSpy.calls.some(c => c.args[0] === 'chats'));
    const selectSpy = spies.getLatestQueryBuilderSpies('chats')?.select;
    assertEquals(selectSpy?.calls.length, 1);

    clearAllStubs?.();
});

Deno.test('findOrCreateChat: should create new chat with provided ID if not found', async () => {
    // Arrange
    const providedChatId = crypto.randomUUID();
    const { client: mockSupabaseClient, spies, clearAllStubs } = createMockSupabaseClient(
        'test-user-id',
        {
            genericMockResults: {
                chats: {
                    // The first `select` to check for existence will return nothing
                    select: { data: [], error: null, count: 0, status: 200, statusText: 'OK' },
                    // The `insert` operation will "succeed"
                    insert: { data: [{ id: providedChatId }], error: null, count: 1, status: 201, statusText: 'Created' }
                },
            },
        }
    );

    const deps: FindOrCreateChatDeps = { supabaseClient: mockSupabaseClient as unknown as SupabaseClient<Database>, logger };
    const params: FindOrCreateChatParams = {
        userId: 'test-user-id',
        existingChatId: providedChatId,
        organizationId: null,
        finalSystemPromptIdForDb: null,
        userMessageContent: 'New chat'
    };

    // Act
    const chatId = await findOrCreateChat(deps, params);

    // Assert
    assertEquals(chatId, providedChatId);
    const historicSpies = spies.getHistoricQueryBuilderSpies('chats', 'insert');
    assertEquals(historicSpies?.callCount, 1);
    
    clearAllStubs?.();
});

Deno.test('findOrCreateChat: should create new chat with generated ID if none provided', async () => {
    // Arrange
    const originalRandomUUID = crypto.randomUUID;
    const generatedChatId = crypto.randomUUID();
    crypto.randomUUID = () => generatedChatId;

    const { client: mockSupabaseClient, spies, clearAllStubs } = createMockSupabaseClient(
        'test-user-id',
        {
            genericMockResults: {
                chats: {
                    insert: { data: [{ id: generatedChatId }], error: null, count: 1, status: 201, statusText: 'Created' }
                },
            },
        }
    );

    const deps: FindOrCreateChatDeps = { supabaseClient: mockSupabaseClient as unknown as SupabaseClient<Database>, logger };
    const params: FindOrCreateChatParams = {
        userId: 'test-user-id',
        existingChatId: null,
        organizationId: null,
        finalSystemPromptIdForDb: null,
        userMessageContent: 'Another new chat'
    };

    // Act
    const chatId = await findOrCreateChat(deps, params);

    // Assert
    assertEquals(chatId, generatedChatId);
    const insertSpy = spies.getHistoricQueryBuilderSpies('chats', 'insert');
    assertEquals(insertSpy?.callCount, 1);
    const insertPayload = insertSpy?.callsArgs[0][0];
    assert(typeof insertPayload === 'object' && insertPayload !== null && 'id' in insertPayload);
    assertEquals(insertPayload.id, generatedChatId);

    // Cleanup
    crypto.randomUUID = originalRandomUUID;
    clearAllStubs?.();
});

Deno.test('findOrCreateChat: should handle race condition on create', async () => {
    // Arrange
    const providedChatId = crypto.randomUUID();
    const mockPostgrestError: PostgrestError = {
        name: 'PostgrestError',
        code: '23505',
        message: 'duplicate key',
        details: 'Key (id)=(...) already exists.',
        hint: 'There is a transaction in progress that has already inserted this key.'
    };
    const { client: mockSupabaseClient, spies, clearAllStubs } = createMockSupabaseClient(
        'test-user-id',
        {
            genericMockResults: {
                chats: {
                    select: { data: [], error: null, count: 0, status: 200, statusText: 'OK' },
                    insert: { data: null, error: mockPostgrestError, count: 0, status: 409, statusText: 'Conflict' }
                },
            },
        }
    );

    const deps: FindOrCreateChatDeps = { supabaseClient: mockSupabaseClient as unknown as SupabaseClient<Database>, logger };
    const params: FindOrCreateChatParams = {
        userId: 'test-user-id',
        existingChatId: providedChatId,
        organizationId: null,
        finalSystemPromptIdForDb: null,
        userMessageContent: 'Race condition test'
    };

    // Act
    const chatId = await findOrCreateChat(deps, params);

    // Assert
    assertEquals(chatId, providedChatId);
    const insertSpy = spies.getHistoricQueryBuilderSpies('chats', 'insert');
    assertEquals(insertSpy?.callCount, 1);

    clearAllStubs?.();
});

Deno.test('findOrCreateChat: should create new chat with organizationId', async () => {
    // Arrange
    const orgId = crypto.randomUUID();
    const expectedChatTitle = "Org Chat Test Message";
    const newChatId = crypto.randomUUID();

    const { client: mockSupabaseClient, spies, clearAllStubs } = createMockSupabaseClient(
        'test-user-id',
        {
            genericMockResults: {
                chats: {
                    insert: { data: [{ id: newChatId, organization_id: orgId }], error: null, count: 1, status: 201, statusText: 'Created' }
                },
            },
        }
    );

    const deps: FindOrCreateChatDeps = { supabaseClient: mockSupabaseClient as unknown as SupabaseClient<Database>, logger };
    const params: FindOrCreateChatParams = {
        userId: 'test-user-id',
        existingChatId: null,
        organizationId: orgId,
        finalSystemPromptIdForDb: 'prompt-id-for-org-chat',
        userMessageContent: expectedChatTitle
    };

    // Act
    const chatId = await findOrCreateChat(deps, params);

    // Assert
    assertEquals(chatId, newChatId);
    const insertSpy = spies.getHistoricQueryBuilderSpies('chats', 'insert');
    assertEquals(insertSpy?.callCount, 1);
    
    const insertPayload = insertSpy?.callsArgs[0][0];
    assert(isChatInsert(insertPayload), "Insert payload should be a valid ChatInsert object");
    assert(typeof insertPayload === 'object' && insertPayload !== null, "Insert payload should be an object");
    assertEquals(insertPayload.organization_id, orgId);
    assertEquals(insertPayload.title, expectedChatTitle);
    assertEquals(insertPayload.user_id, 'test-user-id');
    assertEquals(insertPayload.system_prompt_id, 'prompt-id-for-org-chat');

    clearAllStubs?.();
});
