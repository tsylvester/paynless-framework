import {
    assert,
    assertEquals,
    assertExists
    // Add other specific assert functions if they are actually used in this file,
    // e.g., assertRejects, assertMatch, etc.
    // For now, only listing those currently identified as used or previously attempted.
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
    spy,
    assertSpyCalls
    // Add other specific mock functions if used, e.g. stub
} from "jsr:@std/testing@0.225.1/mock";

// Imports from the local/shared test utility file
import {
    handler,
    createTestDeps,
    envGetStub,
    mockSupaConfigBase,
    mockAdapterSuccessResponse,
    ChatTestConstants,
    type ChatMessageRow,
    mockSupabaseUrl,
    mockAdapterTokenData
    // Removed assertion and spy functions from here, as they are now imported directly.
    // Keep other necessary shared utilities.
} from "./index.test.ts";
import type {
    Database,
    Json
} from "../types_db.ts";
import type {
    AdapterResponsePayload,
    ChatApiRequest,
    ChatHandlerDeps,
    ChatHandlerSuccessResponse,
} from '../_shared/types.ts';
import type { MockSupabaseDataConfig } from '../_shared/supabase.mock.ts';

// --- Test Suite ---
Deno.test("Chat Function Tests (Adapter Refactor)", async (t) => {
    
    // REMOVED: beforeEach/afterEach for Deno.env.set/delete

    // INSERT TestCase interface definition HERE
    interface TestCase {
        testName: string;
        method: "POST"; 
        path: string; 
        body: ChatApiRequest; // Uses ChatApiRequest from ../_shared/types.ts
        mockUser: { id: string } | null; 
        mockSupaConfig: MockSupabaseDataConfig; // Uses MockSupabaseDataConfig from index.test.ts
        mockAdapterConfig?: { 
            providerString: string; 
            response: AdapterResponsePayload | Error; // Uses AdapterResponsePayload from index.test.ts
        };
        expectedStatus: number;
        expectedBody?: Record<string, any>; 
        expectedErrorMessage?: string; 
        extraAssertions?: (responseJson: any, tc: TestCase, deps: ChatHandlerDeps) => void; // Uses ChatHandlerDeps from index.test.ts
        expectedAdapterHistoryLength?: number;
    }

    // --- Shared Mock Configurations (Refactored for genericMockResults) ---
    // Use ChatTestConstants from shared import
    const { 
        testProviderId, testApiIdentifier, testProviderString, testPromptId, 
        testUserId, testChatId, testUserMsgId, testAsstMsgId, testAiContent, 
        nowISO // Changed from now to nowISO to match index.test.ts
    } = ChatTestConstants;

    // REMOVED: Local definition of mockAdapterTokenData, will use imported one
    // const mockAdapterTokenData: MockAdapterTokenUsage = { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 };

    // REMOVED: Local definition of mockAdapterSuccessResponse, will use imported one
    // const mockAdapterSuccessResponse: AdapterResponsePayload = { ... };

    // Define mock DB row for the assistant message *after* insertion
    const mockAssistantDbRow: ChatMessageRow = {
        id: testAsstMsgId,
        chat_id: testChatId,
        role: 'assistant',
        content: testAiContent,
        created_at: nowISO, // Use nowISO
        updated_at: nowISO, // Use nowISO
        user_id: null,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
        token_usage: { 
            prompt_tokens: mockAdapterTokenData.prompt_tokens, // Uses imported mockAdapterTokenData
            completion_tokens: mockAdapterTokenData.completion_tokens, // Uses imported mockAdapterTokenData
            total_tokens: mockAdapterTokenData.total_tokens, // Uses imported mockAdapterTokenData
        },
        is_active_in_thread: true,
        error_type: null,
        response_to_message_id: null
    };
    // Define mock DB row for the user message *after* insertion
    const mockUserDbRow: ChatMessageRow = {
        id: testUserMsgId,
        chat_id: testChatId,
        role: 'user',
        content: "Hello there AI!", 
        created_at: nowISO, // Use nowISO
        updated_at: nowISO, // Use nowISO
        user_id: testUserId,
        ai_provider_id: testProviderId, // This was 'null', changed to testProviderId for consistency if needed, or can be null
        system_prompt_id: testPromptId, // This was 'null', changed to testPromptId for consistency if needed, or can be null
        token_usage: null,
        is_active_in_thread: true,
        error_type: null,
        response_to_message_id: null
    };

    // Refactored Supabase mock config using genericMockResults
    // mockSupaConfigBase is already imported from index.test.ts, so this local one can be removed or aliased
    // For clarity, let's assume index.orgs.test.ts might have specific overrides later,
    // so we keep a local version that spreads the imported one.
    const localMockSupaConfigBase: MockSupabaseDataConfig = { // Uses MockSupabaseDataConfig from index.test.ts
        ...mockSupaConfigBase, // Spread the imported base
        // Example of overriding or adding specific generic results for orgs tests if needed:
        // genericMockResults: {
        //     ...mockSupaConfigBase.genericMockResults,
        //     'organizations': { 
        //         select: { data: [{ id: "org-rand-uuid-for-testing", name: "Test Org" }], error: null, count: 1, status: 200 }
        //     }
        // }
    };

    // --- Individual Tests (Should now use refactored mockSupaConfig) ---
    try { 

        await t.step("POST request for New ORG Chat should include organizationId in insert", async () => {
            console.log("--- Running POST test (New ORG Chat) ---");
            const orgId = crypto.randomUUID();
            const expectedChatTitle = "Org Chat Test Message";

            const chatInsertSpy = spy((state: import('../_shared/supabase.mock.ts').MockQueryBuilderState) => {
                const insertData = state.insertData as Database['public']['Tables']['chats']['Insert'];
                assertExists(insertData.organization_id, "organization_id should be in chats.insert data");
                assertEquals(insertData.organization_id, orgId);
                assertEquals(insertData.title, expectedChatTitle);
                assertExists(insertData.id, "A chat ID should be provided by the handler during insert");
                return { data: [{ 
                    id: insertData.id,
                    user_id: testUserId, 
                    organization_id: orgId, 
                    title: expectedChatTitle, 
                    system_prompt_id:testPromptId, 
                    created_at: new Date().toISOString(), 
                    updated_at: new Date().toISOString(), 
                    metadata: null, 
                    ai_provider_id: null 
                }], error: null, count: 1, status: 201 };
            });

            const chatMessagesInsertSpy = spy((state: import('../_shared/supabase.mock.ts').MockQueryBuilderState) => {
                const insertData = state.insertData as Database['public']['Tables']['chat_messages']['Insert'];
                assertEquals((insertData as Record<string, any>).organization_id, undefined, "organization_id should NOT be in chat_messages.insert data");
                
                const baseReturn = { 
                    ...insertData, 
                    id: `msg-${Math.random().toString(36).substring(2, 9)}`, 
                    created_at: new Date().toISOString(), 
                    updated_at: new Date().toISOString(), 
                    is_active_in_thread: true,
                };
                delete (baseReturn as Record<string, any>).organization_id;
                return { data: [baseReturn], error: null, count: 1, status: 201 };
            });

            const perTestOrgChatConfig: MockSupabaseDataConfig = { // Uses MockSupabaseDataConfig
                ...localMockSupaConfigBase, // Use the locally adjusted base config
                genericMockResults: {
                    ...localMockSupaConfigBase.genericMockResults,
                    'ai_providers': { // Override ai_providers mock for this test
                        select: { 
                            data: [{
                                id: testProviderId, 
                                name: "Test Org Provider", 
                                api_identifier: testApiIdentifier, 
                                provider: testProviderString, 
                                is_active: true, 
                                config: { 
                                    api_identifier: testApiIdentifier, 
                                    input_token_cost_rate: 1,
                                    output_token_cost_rate: 2,
                                    tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } 
                                }
                            }], 
                            error: null, 
                            status: 200, 
                            count: 1 
                        }
                    },
                    'chats': {
                        insert: chatInsertSpy as any,
                        select: localMockSupaConfigBase.genericMockResults?.chats?.select
                    },
                    'chat_messages': {
                        insert: chatMessagesInsertSpy as any,
                        select: localMockSupaConfigBase.genericMockResults?.chat_messages?.select
                    }
                }
            };

            const { deps } = createTestDeps(perTestOrgChatConfig, mockAdapterSuccessResponse); // Uses imported mockAdapterSuccessResponse
            const body: ChatApiRequest = { // Uses ChatApiRequest from ../_shared/types.ts
                message: expectedChatTitle, 
                providerId: testProviderId, 
                promptId: testPromptId,
                organizationId: orgId 
            };
            const req = new Request(mockSupabaseUrl + '/chat', { // Uses imported mockSupabaseUrl
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token', 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const response = await handler(req, deps);
            assertEquals(response.status, 200);
            assertSpyCalls(chatInsertSpy, 1);
            
            const chatResponse = await response.json() as ChatHandlerSuccessResponse; // Uses ChatHandlerSuccessResponse
            assert(typeof chatResponse.chatId === 'string' && chatResponse.chatId.length > 0, "chatResponse.chatId should be a valid string ID");
            
            const insertedChatData = chatInsertSpy.calls[0].args[0].insertData as Database['public']['Tables']['chats']['Insert'];
            assertEquals(chatResponse.chatId, insertedChatData.id, "chatId in response should match the id provided during chat insert");

            assertExists(chatResponse.userMessage);
            assertEquals((chatResponse.userMessage as Record<string, any>)?.organization_id, undefined, "organization_id should NOT be present on userMessage object"); 
            assertEquals(chatResponse.userMessage?.content, expectedChatTitle);
        });

        // await t.step("POST request with existing chatId and history should add messages and return assistant message", async () => {
        //     // This test seems to be a copy from sendMessage or another file.
        //     // It needs to be reviewed and adapted for org-specific behavior if kept.
        //     // For now, it's commented out to focus on the orgId insertion test.
        // });

        
    } finally {
        // Restore Deno.env.get
        if (envGetStub.restored === false) { // Check if the stub is active before restoring
            envGetStub.restore();
        }
        // globalThis.Deno.env.get = originalDenoEnvGet; // This is now handled by restoring the stub
    }
}); // End Test Suite