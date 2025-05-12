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

// --- Environment Variables ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing required Supabase environment variables for RLS chat_messages tests.");
}

// --- Constants ---
const TEST_PASSWORD = "password123";
const DUMMY_SYSTEM_PROMPT_ID = '00000000-0000-0000-0000-000000000000'; // Use the same dummy prompt ID

// --- Test Suite ---
describe("RLS Policies for 'chat_messages' Table", () => {
    let adminClient: SupabaseClient<Database>;
    let personalUser: TestUserContext; // User A
    let otherUser: TestUserContext;    // User B
    let orgAdmin: TestUserContext;     // User C (Admin of Org Z)
    let orgMember: TestUserContext;    // User D (Member of Org Z)
    let orgZ: TestOrg;

    let personalChatId: string;
    let orgAdminChatId: string;
    let orgMemberChatId: string;

    let msgPersonalUserId: string; // Message by personalUser in personalChatId
    let msgOrgAdminId: string;     // Message by orgAdmin in orgAdminChatId
    let msgOrgMemberId: string;    // Message by orgMember in orgMemberChatId
    let msgOrgAssistantId: string; // Assistant message in orgAdminChatId

    // Keep track of created resources for cleanup
    const createdChatIds: string[] = [];
    const createdMessageIds: string[] = [];

    // Helper to create chat and message
    async function createChatAndMessage(userId: string | null, chatId: string, role: string, content: string): Promise<string> {
        const { data, error } = await adminClient.from('chat_messages').insert({
            chat_id: chatId,
            user_id: userId, // Can be null for assistant
            role: role,
            content: content,
            system_prompt_id: DUMMY_SYSTEM_PROMPT_ID
        }).select('id').single();
        if (error || !data?.id) throw new Error(`Failed to create message "${content}": ${error?.message}`);
        createdMessageIds.push(data.id);
        return data.id;
    }

    beforeAll(async () => {
        console.log("--- Starting Chat Messages RLS Test Suite Setup ---");
        adminClient = createAdminClientInstance(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
        
        // Ensure dummy system prompt exists (copied from delete test)
        const { error: preDeleteError } = await adminClient.from('system_prompts').delete().eq('name', 'Dummy Test Prompt').not('id', 'eq', DUMMY_SYSTEM_PROMPT_ID); 
        if (preDeleteError) console.warn("Warning: Could not pre-delete conflicting dummy prompt by name:", preDeleteError.message);
        else console.log("Pre-delete check for conflicting prompt name completed.");
        const { error: dummyPromptError } = await adminClient.from('system_prompts').upsert({ id: DUMMY_SYSTEM_PROMPT_ID, name: 'Dummy Test Prompt', prompt_text: 'Dummy prompt...' }, { onConflict: 'id' }); 
        if (dummyPromptError) throw new Error(`Could not set up dummy system prompt: ${dummyPromptError.message}`);
        else console.log(`Dummy system prompt ${DUMMY_SYSTEM_PROMPT_ID} ensured.`);

        const timeSuffix = Date.now();
        [personalUser, otherUser, orgAdmin, orgMember] = await Promise.all([
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'personal-user-msg-' + timeSuffix + '@test.com', TEST_PASSWORD),
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'other-user-msg-' + timeSuffix + '@test.com', TEST_PASSWORD),
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'org-admin-msg-' + timeSuffix + '@test.com', TEST_PASSWORD),
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'org-member-msg-' + timeSuffix + '@test.com', TEST_PASSWORD),
        ]);

        orgZ = await createTestOrg(adminClient, 'Org Z Messages Test ' + timeSuffix);
        await addOrgMember(adminClient, orgZ.id, orgAdmin.userId, 'admin');
        await addOrgMember(adminClient, orgZ.id, orgMember.userId, 'member');

        // Create Chats using Admin Client
        const chatPromises = [
             adminClient.from('chats').insert({ user_id: personalUser.userId, title: "Personal Chat Msg Test", system_prompt_id: DUMMY_SYSTEM_PROMPT_ID }).select('id').single(),
             adminClient.from('chats').insert({ user_id: orgAdmin.userId, organization_id: orgZ.id, title: "Org Admin Chat Msg Test", system_prompt_id: DUMMY_SYSTEM_PROMPT_ID }).select('id').single(),
             adminClient.from('chats').insert({ user_id: orgMember.userId, organization_id: orgZ.id, title: "Org Member Chat Msg Test", system_prompt_id: DUMMY_SYSTEM_PROMPT_ID }).select('id').single(),
        ];
        const chatResults = await Promise.all(chatPromises);
        personalChatId = chatResults[0].data!.id; if (personalChatId) createdChatIds.push(personalChatId);
        orgAdminChatId = chatResults[1].data!.id; if (orgAdminChatId) createdChatIds.push(orgAdminChatId);
        orgMemberChatId = chatResults[2].data!.id; if (orgMemberChatId) createdChatIds.push(orgMemberChatId);
        if (!personalChatId || !orgAdminChatId || !orgMemberChatId) throw new Error("Failed to create one or more test chats.");

        // Create Initial Messages using Admin Client
        const msgPromises = [
            createChatAndMessage(personalUser.userId, personalChatId, 'user', 'Message from Personal User'),
            createChatAndMessage(orgAdmin.userId, orgAdminChatId, 'user', 'Message from Org Admin'),
            createChatAndMessage(orgMember.userId, orgMemberChatId, 'user', 'Message from Org Member'),
            createChatAndMessage(null, orgAdminChatId, 'assistant', 'Assistant message in Org Admin chat'),
        ];
        const msgResults = await Promise.all(msgPromises);
        msgPersonalUserId = msgResults[0];
        msgOrgAdminId = msgResults[1];
        msgOrgMemberId = msgResults[2];
        msgOrgAssistantId = msgResults[3];

        console.log("--- Finished Chat Messages RLS Test Suite Setup ---");
    });

    afterAll(async () => {
        console.log("--- Starting Chat Messages RLS Teardown ---");
        await Promise.allSettled([
            personalUser?.client?.auth.signOut(),
            otherUser?.client?.auth.signOut(),
            orgAdmin?.client?.auth.signOut(),
            orgMember?.client?.auth.signOut(),
        ]);

        if (createdMessageIds.length > 0) {
            console.log('Cleaning up messages: ' + createdMessageIds.join(", "));
            await adminClient.from('chat_messages').delete().in('id', createdMessageIds);
        }
        if (createdChatIds.length > 0) {
            console.log('Cleaning up chats: ' + createdChatIds.join(", "));
            await adminClient.from('chats').delete().in('id', createdChatIds);
        }
        
        await adminClient.from('system_prompts').delete().eq('id', DUMMY_SYSTEM_PROMPT_ID);
        
        await Promise.allSettled([
            personalUser?.email ? cleanupTestUserByEmail(adminClient, personalUser.email) : Promise.resolve(),
            otherUser?.email ? cleanupTestUserByEmail(adminClient, otherUser.email) : Promise.resolve(),
            orgAdmin?.email ? cleanupTestUserByEmail(adminClient, orgAdmin.email) : Promise.resolve(),
            orgMember?.email ? cleanupTestUserByEmail(adminClient, orgMember.email) : Promise.resolve(),
            orgZ?.name ? cleanupTestOrgByName(adminClient, orgZ.name) : Promise.resolve(),
        ]).then(results => {
            results.forEach((result, index) => {
                if (result.status === 'rejected') console.error(`Cleanup failed for item ${index}:`, result.reason);
            });
        });
        console.log("--- Finished Chat Messages RLS Teardown ---");
    });

    // --- SELECT Tests ---
    describe("SELECT operations", () => {
        it("User can select messages in accessible chats", async () => {
            const { data: personalData, error: personalError } = await personalUser.client.from('chat_messages').select('id').eq('chat_id', personalChatId);
            assertEquals(personalError, null);
            assert(personalData?.some(m => m.id === msgPersonalUserId), "Personal user should see their message.");

            const { data: orgAdminData, error: orgAdminError } = await orgAdmin.client.from('chat_messages').select('id').eq('chat_id', orgAdminChatId);
            assertEquals(orgAdminError, null);
            assert(orgAdminData?.some(m => m.id === msgOrgAdminId), "Org admin should see their message.");
            assert(orgAdminData?.some(m => m.id === msgOrgAssistantId), "Org admin should see assistant message.");
            
            const { data: orgMemberData, error: orgMemberError } = await orgMember.client.from('chat_messages').select('id').in('chat_id', [orgAdminChatId, orgMemberChatId]);
            assertEquals(orgMemberError, null);
            assert(orgMemberData?.some(m => m.id === msgOrgAdminId), "Org member should see admin message in org chat.");
            assert(orgMemberData?.some(m => m.id === msgOrgMemberId), "Org member should see their message in org chat.");
            assert(orgMemberData?.some(m => m.id === msgOrgAssistantId), "Org member should see assistant message in org chat.");
        });

        it("User cannot select messages in inaccessible chats", async () => {
            const { data: personalForOther, error: personalForOtherErr } = await otherUser.client.from('chat_messages').select('id').eq('chat_id', personalChatId);
            assertEquals(personalForOtherErr, null); // RLS usually returns empty, not error
            assertEquals(personalForOther?.length, 0, "Other user cannot see personal user's messages.");

            const { data: orgForPersonal, error: orgForPersonalErr } = await personalUser.client.from('chat_messages').select('id').eq('chat_id', orgAdminChatId);
            assertEquals(orgForPersonalErr, null);
            assertEquals(orgForPersonal?.length, 0, "Personal user cannot see org messages.");

            const { data: orgForOther, error: orgForOtherErr } = await otherUser.client.from('chat_messages').select('id').eq('chat_id', orgAdminChatId);
            assertEquals(orgForOtherErr, null);
            assertEquals(orgForOther?.length, 0, "Other user cannot see org messages.");
        });
    });

    // --- INSERT Tests ---
    describe("INSERT operations", () => {
        it("User can insert messages into accessible chats (as themselves)", async () => {
            const { error: personalInsertErr } = await personalUser.client.from('chat_messages').insert({ chat_id: personalChatId, user_id: personalUser.userId, role: 'user', content: 'Another personal msg' });
            assertEquals(personalInsertErr, null, "Personal user insert failed.");

            const { error: orgAdminInsertErr } = await orgAdmin.client.from('chat_messages').insert({ chat_id: orgAdminChatId, user_id: orgAdmin.userId, role: 'user', content: 'Another org admin msg' });
            assertEquals(orgAdminInsertErr, null, "Org admin insert failed.");

            const { error: orgMemberInsertErr } = await orgMember.client.from('chat_messages').insert({ chat_id: orgMemberChatId, user_id: orgMember.userId, role: 'user', content: 'Another org member msg' });
            assertEquals(orgMemberInsertErr, null, "Org member insert failed.");

            // Verify member can insert into chat owned by admin (but still in same org)
             const { error: orgMemberInsertOtherErr } = await orgMember.client.from('chat_messages').insert({ chat_id: orgAdminChatId, user_id: orgMember.userId, role: 'user', content: 'Org member msg in admin chat' });
            assertEquals(orgMemberInsertOtherErr, null, "Org member insert into admin chat failed.");
        });
        
        it("User cannot insert messages into inaccessible chats", async () => {
            const { error } = await personalUser.client.from('chat_messages').insert({ chat_id: orgAdminChatId, user_id: personalUser.userId, role: 'user', content: 'Personal trying org msg' });
            assertNotEquals(error, null, "Personal user should not insert into org chat.");
            assertMatch(error?.message ?? '', /permission denied for table chat_messages|violates row-level security policy/i);
        });

        it("User cannot insert messages 'as' another user", async () => {
            const { error } = await personalUser.client.from('chat_messages').insert({ chat_id: personalChatId, user_id: otherUser.userId, role: 'user', content: 'Personal trying as Other' });
            assertNotEquals(error, null, "Personal user should not insert as other user.");
            assertMatch(error?.message ?? '', /permission denied for table chat_messages|violates row-level security policy/i); // Assumes RLS checks auth.uid() == user_id
        });
    });

    // --- UPDATE Tests (Policy: can_select_chat) ---
    describe("UPDATE operations", () => {
        it("User can update messages in accessible chats", async () => {
            const { error: personalUpdateErr } = await personalUser.client.from('chat_messages').update({ content: "Updated personal msg" }).eq('id', msgPersonalUserId);
            assertEquals(personalUpdateErr, null, "Personal user update failed.");

            // Org admin updates own message
            const { error: orgAdminUpdateOwnErr } = await orgAdmin.client.from('chat_messages').update({ content: "Updated org admin msg" }).eq('id', msgOrgAdminId);
            assertEquals(orgAdminUpdateOwnErr, null, "Org admin update own failed.");

            // Org admin updates member's message
            const { error: orgAdminUpdateOtherErr } = await orgAdmin.client.from('chat_messages').update({ content: "Updated by admin" }).eq('id', msgOrgMemberId);
            assertEquals(orgAdminUpdateOtherErr, null, "Org admin update member failed.");

            // Org member updates own message
            const { error: orgMemberUpdateOwnErr } = await orgMember.client.from('chat_messages').update({ content: "Updated org member msg" }).eq('id', msgOrgMemberId);
            assertEquals(orgMemberUpdateOwnErr, null, "Org member update own failed.");
            
            // Org member updates admin's message
            const { error: orgMemberUpdateOtherErr } = await orgMember.client.from('chat_messages').update({ content: "Updated by member" }).eq('id', msgOrgAdminId);
            assertEquals(orgMemberUpdateOtherErr, null, "Org member update admin failed.");
        });

        it("User cannot update messages in inaccessible chats", async () => {
            const { error: personalUpdateOrgErr } = await personalUser.client.from('chat_messages').update({ content: "Personal trying update org" }).eq('id', msgOrgAdminId);
            // Check count or verify data didn't change, as RLS might return success with 0 rows updated
            const { count: personalCount } = await personalUser.client.from('chat_messages').update({ content: "..." }, { count: 'exact' }).eq('id', msgOrgAdminId);
            assertEquals(personalCount, 0, "Personal user update count should be 0 for org message.");

            const { error: otherUpdatePersonalErr } = await otherUser.client.from('chat_messages').update({ content: "Other trying update personal" }).eq('id', msgPersonalUserId);
            const { count: otherCount } = await otherUser.client.from('chat_messages').update({ content: "..." }, { count: 'exact' }).eq('id', msgPersonalUserId);
            assertEquals(otherCount, 0, "Other user update count should be 0 for personal message.");
        });
    });

    // --- DELETE Tests (Policy: can_select_chat) ---
    describe("DELETE operations", () => {
        it("User can delete messages in accessible chats", async () => {
            // Create messages specifically for deletion tests
            const msgPersonalDelId = await createChatAndMessage(personalUser.userId, personalChatId, 'user', 'Personal to delete');
            const msgOrgAdminDelId = await createChatAndMessage(orgAdmin.userId, orgAdminChatId, 'user', 'Org Admin to delete');
            const msgOrgMemberDelId = await createChatAndMessage(orgMember.userId, orgMemberChatId, 'user', 'Org Member to delete');
            const msgInAdminChatToDelByMember = await createChatAndMessage(orgAdmin.userId, orgAdminChatId, 'user', 'Admin msg to be deleted by member');
            const msgInMemberChatToDelByAdmin = await createChatAndMessage(orgMember.userId, orgMemberChatId, 'user', 'Member msg to be deleted by admin');

            // Perform deletions
            const { error: personalDelErr } = await personalUser.client.from('chat_messages').delete().eq('id', msgPersonalDelId);
            assertEquals(personalDelErr, null, "Personal user delete failed.");

            const { error: orgAdminDelOwnErr } = await orgAdmin.client.from('chat_messages').delete().eq('id', msgOrgAdminDelId);
            assertEquals(orgAdminDelOwnErr, null, "Org admin delete own failed.");

            const { error: orgMemberDelOwnErr } = await orgMember.client.from('chat_messages').delete().eq('id', msgOrgMemberDelId);
            assertEquals(orgMemberDelOwnErr, null, "Org member delete own failed.");
            
            const { error: orgMemberDelOtherErr } = await orgMember.client.from('chat_messages').delete().eq('id', msgInAdminChatToDelByMember);
            assertEquals(orgMemberDelOtherErr, null, "Org member delete other in org failed.");
            
            const { error: orgAdminDelOtherErr } = await orgAdmin.client.from('chat_messages').delete().eq('id', msgInMemberChatToDelByAdmin);
            assertEquals(orgAdminDelOtherErr, null, "Org admin delete other in org failed.");
        });

        it("User cannot delete messages in inaccessible chats", async () => {
            // Create messages specifically for these tests
             const msgPersonalForOtherDel = await createChatAndMessage(personalUser.userId, personalChatId, 'user', 'Personal cannot be deleted by Other');
             const msgOrgForPersonalDel = await createChatAndMessage(orgAdmin.userId, orgAdminChatId, 'user', 'Org cannot be deleted by Personal');

            // Perform deletion attempts
            const { error: otherDelErr } = await otherUser.client.from('chat_messages').delete().eq('id', msgPersonalForOtherDel);
            const { count: otherCount } = await otherUser.client.from('chat_messages').delete({ count: 'exact' }).eq('id', msgPersonalForOtherDel);
            assertEquals(otherCount, 0, "Other user delete count should be 0 for personal message.");
            assertExists(await adminClient.from('chat_messages').select().eq('id', msgPersonalForOtherDel).single(), "Message should still exist after failed delete by Other");

            const { error: personalDelErr } = await personalUser.client.from('chat_messages').delete().eq('id', msgOrgForPersonalDel);
            const { count: personalCount } = await personalUser.client.from('chat_messages').delete({ count: 'exact' }).eq('id', msgOrgForPersonalDel);
            assertEquals(personalCount, 0, "Personal user delete count should be 0 for org message.");
            assertExists(await adminClient.from('chat_messages').select().eq('id', msgOrgForPersonalDel).single(), "Message should still exist after failed delete by Personal");
        });
    });
}); 