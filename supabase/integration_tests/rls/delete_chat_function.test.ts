import {
    test,
    describe,
    beforeAll,
    afterAll,
    it,
} from "jsr:@std/testing@0.225.1/bdd";
import {
    assert,
    assertEquals,
    assertExists,
    assertFalse,
    assertNotEquals,
    assertMatch,
} from "jsr:@std/assert";
import {
    createAdminClientInstance,
    createTestUser,
    createTestOrg,
    addOrgMember,
    cleanupTestUserByEmail,
    cleanupTestOrgByName,
    type TestUserContext,
    type TestOrg,
} from "./rls_test_helpers.ts";
import type { Database } from "../../functions/types_db.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js";

// --- Read Environment Variables ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY"); // Not strictly needed for RPC calls as user, but good practice
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing required Supabase environment variables for RLS delete_chat_function tests.");
}

// --- Constants ---
const TEST_PASSWORD = "password123";
const DUMMY_SYSTEM_PROMPT_ID = '00000000-0000-0000-0000-000000000000'; // Placeholder

// --- Test Suite ---
describe("RLS and Permissions for 'delete_chat_and_messages' SQL Function", () => {
    let adminClient: SupabaseClient<Database>;
    let personalUser: TestUserContext; // User A
    let otherUser: TestUserContext;    // User B
    let orgAdmin: TestUserContext;     // User C (Admin of Org Y)
    let orgMember: TestUserContext;    // User D (Member of Org Y)
    let orgY: TestOrg;

    // To store IDs of chats created for cleanup, though the function should delete them
    const createdChatIdsForVerification: string[] = [];

    // Helper to create a chat directly with admin client for testing
    async function createChatAsAdmin(userId: string, title: string, orgId: string | null = null): Promise<string> {
        const { data, error } = await adminClient.from('chats')
            .insert({ user_id: userId, organization_id: orgId, title, system_prompt_id: DUMMY_SYSTEM_PROMPT_ID })
            .select('id')
            .single();
        if (error || !data?.id) throw new Error(`Failed to create chat "${title}": ${error?.message}`);
        // Add a dummy message to test message deletion
        const { error: msgError } = await adminClient.from('chat_messages').insert({
            chat_id: data.id,
            user_id: userId, // Message owner can be the chat owner
            role: 'user',
            content: 'Initial message for ' + title,
            ai_provider_id: null, // Set to null if no specific provider needed for test
            system_prompt_id: DUMMY_SYSTEM_PROMPT_ID // Using dummy as placeholder
        });
        if (msgError) console.warn(`Could not create dummy message for chat ${data.id}: ${msgError.message}`);
        createdChatIdsForVerification.push(data.id);
        return data.id;
    }

    beforeAll(async () => {
        console.log("--- Starting delete_chat_and_messages RLS Test Suite Setup ---");
        adminClient = createAdminClientInstance(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
        
        // Attempt to remove any OTHER system prompt that might have the conflicting name
        const { error: preDeleteError } = await adminClient
            .from('system_prompts')
            .delete()
            .eq('name', 'Dummy Test Prompt')
            .not('id', 'eq', DUMMY_SYSTEM_PROMPT_ID); 

        if (preDeleteError) {
            console.warn("Warning: Could not pre-delete conflicting dummy prompt by name:", preDeleteError.message);
        } else {
            console.log("Pre-delete check for conflicting prompt name completed.");
        }
        
        const { error: dummyPromptError } = await adminClient.from('system_prompts')
            .upsert({ 
                id: DUMMY_SYSTEM_PROMPT_ID, 
                name: 'Dummy Test Prompt', 
                prompt_text: 'Dummy prompt for testing. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.', 
            }, { onConflict: 'id' }); 
            
        if (dummyPromptError) {
            console.error("Failed to create/upsert dummy system prompt:", dummyPromptError);
            throw new Error(`Could not set up dummy system prompt for tests. DB Error: ${dummyPromptError.message}`);
        } else {
            console.log(`Dummy system prompt ${DUMMY_SYSTEM_PROMPT_ID} ensured.`);
        }

        const timeSuffix = Date.now();

        [personalUser, otherUser, orgAdmin, orgMember] = await Promise.all([
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'personal-user-del-' + timeSuffix + '@test.com', TEST_PASSWORD),
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'other-user-del-' + timeSuffix + '@test.com', TEST_PASSWORD),
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'org-admin-del-' + timeSuffix + '@test.com', TEST_PASSWORD),
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'org-member-del-' + timeSuffix + '@test.com', TEST_PASSWORD),
        ]);

        orgY = await createTestOrg(adminClient, 'Org Y Delete Func Test ' + timeSuffix);
        await addOrgMember(adminClient, orgY.id, orgAdmin.userId, 'admin');
        await addOrgMember(adminClient, orgY.id, orgMember.userId, 'member');
        // For org tests, ensure members can create chats in this org if needed by a specific test setup.
        // Not strictly necessary for delete, but good if a chat owned by a member needs to exist.
        // await setOrgMemberChatCreation(adminClient, orgY.id, true);

        console.log("--- Finished delete_chat_and_messages RLS Test Suite Setup ---");
    });

    afterAll(async () => {
        console.log("--- Starting delete_chat_and_messages RLS Teardown ---");
        // Sign out users to stop potential background timers
        await Promise.allSettled([
            personalUser?.client?.auth.signOut(),
            otherUser?.client?.auth.signOut(),
            orgAdmin?.client?.auth.signOut(),
            orgMember?.client?.auth.signOut(),
        ]).then(results => {
             results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    // Log sign-out errors but don't necessarily stop cleanup
                    console.warn(`Sign out failed for test user client ${index}:`, result.reason);
                }
            });
        });

        // Attempt to clean up any chats that might have been missed if tests failed before deletion
        if (createdChatIdsForVerification.length > 0) {
            console.log('Verifying cleanup of chats: ' + createdChatIdsForVerification.join(", "));
            for (const chatId of createdChatIdsForVerification) {
                const { data: chat } = await adminClient.from('chats').select('id').eq('id', chatId).maybeSingle();
                if (chat) {
                     console.warn(`Chat ${chatId} was not deleted by the function during tests. Forcing delete.`);
                     const { data: { user } } = await adminClient.auth.getUser();
                     // Check if user exists before trying to access id - handle potential null user
                     const adminUserId = user?.id;
                     if (!adminUserId) {
                         console.error('Admin user ID not found for forced deletion, skipping force delete for chat:', chatId);
                         // Optionally, try deleting with a known placeholder admin ID if applicable
                     } else {
                         await adminClient.rpc('delete_chat_and_messages', { p_chat_id: chatId, p_user_id: adminUserId }); 
                     }
                }
            }
        }
        
        // Cleanup dummy system prompt
        const { error: deletePromptError } = await adminClient.from('system_prompts').delete().eq('id', DUMMY_SYSTEM_PROMPT_ID);
        if (deletePromptError) {
            console.error("Error cleaning up dummy system prompt:", deletePromptError.message);
        } else {
            console.log(`Dummy system prompt ${DUMMY_SYSTEM_PROMPT_ID} cleaned up.`);
        }

        await Promise.allSettled([
            personalUser?.email ? cleanupTestUserByEmail(adminClient, personalUser.email) : Promise.resolve(),
            otherUser?.email ? cleanupTestUserByEmail(adminClient, otherUser.email) : Promise.resolve(),
            orgAdmin?.email ? cleanupTestUserByEmail(adminClient, orgAdmin.email) : Promise.resolve(),
            orgMember?.email ? cleanupTestUserByEmail(adminClient, orgMember.email) : Promise.resolve(),
            orgY?.name ? cleanupTestOrgByName(adminClient, orgY.name) : Promise.resolve(),
        ]).then(results => {
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.error(`Cleanup failed for item ${index}:`, result.reason);
                }
            });
        });
        console.log("--- Finished delete_chat_and_messages RLS Teardown ---");
    });

    // --- Test Cases for delete_chat_and_messages RPC ---
    describe("RPC delete_chat_and_messages (Debug Mode - Checking Return Status)", () => {
        it("Personal user can delete their own personal chat", async () => {
            const chatId = await createChatAsAdmin(personalUser.userId, "Personal Chat for Deletion by Owner");
            createdChatIdsForVerification.push(chatId); 

            const { data, error } = await personalUser.client.rpc('delete_chat_and_messages', {
                p_chat_id: chatId,
                p_user_id: personalUser.userId
            });
            assertEquals(error, null, "RPC call itself should not error.");
            assertEquals(data, 'DELETED', "Function should return DELETED status on success.");

            const { data: chatData } = await adminClient.from('chats').select('id').eq('id', chatId).maybeSingle();
            assertEquals(chatData, null, "Chat should be deleted from the database.");
            const { data: messagesData } = await adminClient.from('chat_messages').select('id').eq('chat_id', chatId);
            assertEquals(messagesData?.length, 0, "Messages for the chat should be deleted.");
            createdChatIdsForVerification.splice(createdChatIdsForVerification.indexOf(chatId), 1); 
        });

        it("Personal user CANNOT delete another user's personal chat", async () => {
            const chatOwnedByOtherId = await createChatAsAdmin(otherUser.userId, "Other User's Personal Chat");
            createdChatIdsForVerification.push(chatOwnedByOtherId);

            // Removed assertRejects - check returned status instead
            const { data, error } = await personalUser.client.rpc('delete_chat_and_messages', {
                p_chat_id: chatOwnedByOtherId,
                p_user_id: personalUser.userId
            });
            assertEquals(error, null, "RPC call itself should not error even on permission denied.");
            assertEquals(data, 'PERSONAL PERMISSION DENIED', "Function should return correct denial status.");
            
            const { data: chatData } = await adminClient.from('chats').select('id').eq('id', chatOwnedByOtherId).single();
            assertExists(chatData, "Chat should still exist after failed deletion attempt.");
        });

        it("Org admin can delete their own org chat", async () => {
            const orgChatByAdminId = await createChatAsAdmin(orgAdmin.userId, "Org Chat by Admin for Deletion", orgY.id);
            createdChatIdsForVerification.push(orgChatByAdminId);

            const { data, error } = await orgAdmin.client.rpc('delete_chat_and_messages', {
                p_chat_id: orgChatByAdminId,
                p_user_id: orgAdmin.userId
            });
            assertEquals(error, null, "RPC call should succeed.");
            assertEquals(data, 'DELETED', "Status should be DELETED.");

            const { data: chatData } = await adminClient.from('chats').select('id').eq('id', orgChatByAdminId).maybeSingle();
            assertEquals(chatData, null, "Admin's org chat should be deleted.");
            createdChatIdsForVerification.splice(createdChatIdsForVerification.indexOf(orgChatByAdminId), 1);
        });

        it("Org admin can delete another member's org chat", async () => {
            const orgChatByMemberId = await createChatAsAdmin(orgMember.userId, "Org Chat by Member for Admin Deletion", orgY.id);
            createdChatIdsForVerification.push(orgChatByMemberId);

            const { data, error } = await orgAdmin.client.rpc('delete_chat_and_messages', {
                p_chat_id: orgChatByMemberId,
                p_user_id: orgAdmin.userId
            });
            assertEquals(error, null, "RPC call should succeed.");
            assertEquals(data, 'DELETED', "Status should be DELETED.");

            const { data: chatData } = await adminClient.from('chats').select('id').eq('id', orgChatByMemberId).maybeSingle();
            assertEquals(chatData, null, "Member's org chat should be deleted by admin.");
            createdChatIdsForVerification.splice(createdChatIdsForVerification.indexOf(orgChatByMemberId), 1);
        });

        it("Org member can delete their own org chat", async () => {
            const orgChatByMemberId = await createChatAsAdmin(orgMember.userId, "Org Chat by Member for Self Deletion", orgY.id);
            createdChatIdsForVerification.push(orgChatByMemberId);

            const { data, error } = await orgMember.client.rpc('delete_chat_and_messages', {
                p_chat_id: orgChatByMemberId,
                p_user_id: orgMember.userId
            });
            assertEquals(error, null, "RPC call should succeed.");
            assertEquals(data, 'DELETED', "Status should be DELETED.");
            
            const { data: chatData } = await adminClient.from('chats').select('id').eq('id', orgChatByMemberId).maybeSingle();
            assertEquals(chatData, null, "Member's own org chat should be deleted.");
            createdChatIdsForVerification.splice(createdChatIdsForVerification.indexOf(orgChatByMemberId), 1);
        });

        it("Org member CANNOT delete another member's (or admin's) org chat", async () => {
            const orgChatByAdminId = await createChatAsAdmin(orgAdmin.userId, "Org Chat by Admin for Member Attempted Deletion", orgY.id);
            createdChatIdsForVerification.push(orgChatByAdminId);

            // Removed assertRejects
            const { data, error } = await orgMember.client.rpc('delete_chat_and_messages', {
                p_chat_id: orgChatByAdminId,
                p_user_id: orgMember.userId
            });
            assertEquals(error, null, "RPC call should not error.");
            assertEquals(data, 'ORG PERMISSION DENIED', "Status should indicate org permission denial.");

            const { data: chatData } = await adminClient.from('chats').select('id').eq('id', orgChatByAdminId).single();
            assertExists(chatData, "Admin's org chat should still exist.");
        });

        it("User not in an org CANNOT delete an org chat", async () => {
            const orgChatId = await createChatAsAdmin(orgAdmin.userId, "Org Chat for Non-Member Deletion Attempt", orgY.id);
            createdChatIdsForVerification.push(orgChatId);

            // Removed assertRejects
            const { data, error } = await personalUser.client.rpc('delete_chat_and_messages', { 
                p_chat_id: orgChatId,
                p_user_id: personalUser.userId
            });
            assertEquals(error, null, "RPC call should not error.");
            assertEquals(data, 'ORG PERMISSION DENIED', "Status should indicate org permission denial (as user is not found as member).");

            const { data: chatData } = await adminClient.from('chats').select('id').eq('id', orgChatId).single();
            assertExists(chatData, "Org chat should still exist.");
        });

        it("Attempting to delete a non-existent chat should return NOT FOUND status", async () => {
            const nonExistentChatId = '00000000-0000-0000-0000-111111111111';
            // Removed try/catch and assertRejects
            const { data, error } = await personalUser.client.rpc('delete_chat_and_messages', {
                p_chat_id: nonExistentChatId,
                p_user_id: personalUser.userId
            });
            assertEquals(error, null, "RPC call should not error.");
            assertEquals(data, 'NOT FOUND', "Status should be NOT FOUND for non-existent chat.");
        });

        it("Function should delete chat messages associated with the chat", async () => {
            const chatId = await createChatAsAdmin(personalUser.userId, "Chat with Messages for Deletion Test");
            createdChatIdsForVerification.push(chatId);
            await adminClient.from('chat_messages').insert({
                chat_id: chatId, user_id: personalUser.userId, role: 'assistant', content: 'Another message'
            });

            const { data: initialMessages } = await adminClient.from('chat_messages').select('id').eq('chat_id', chatId);
            assert(initialMessages && initialMessages.length > 1, "Should have multiple messages before deletion.");

            const { data, error } = await personalUser.client.rpc('delete_chat_and_messages', {
                p_chat_id: chatId,
                p_user_id: personalUser.userId
            });
            assertEquals(error, null, "RPC call should succeed.");
            assertEquals(data, 'DELETED', "Status should be DELETED.");

            const { data: remainingMessages } = await adminClient.from('chat_messages').select('id').eq('chat_id', chatId);
            assertEquals(remainingMessages?.length, 0, "All messages for the chat should be deleted.");
            createdChatIdsForVerification.splice(createdChatIdsForVerification.indexOf(chatId), 1);
        });
    });
}); 