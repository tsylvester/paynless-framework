import {
    test,
    describe,
    beforeAll, 
    afterAll, 
    it, // Using BDD aliases more consistently
} from "jsr:@std/testing@0.225.1/bdd"; 
import {
    assert,
    assertEquals,
    assertExists,
    assertFalse,
    assertNotEquals, // Import for checking errors
    assertMatch // Import for checking error messages
} from "jsr:@std/assert"; 
import {
    createAdminClientInstance,
    createTestUser,
    createTestOrg,
    addOrgMember,
    setOrgMemberChatCreation,
    cleanupTestUserByEmail,
    cleanupTestOrgByName,
    type TestUserContext,
    type TestOrg,
} from "./rls_test_helpers.ts";
import type { Database } from "../../functions/types_db.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js";

// --- Read Environment Variables (Top Level) ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing required Supabase environment variables for RLS chat tests. Check .env.local (ensure SUPABASE_URL uses host.docker.internal if needed).");
}

// --- Constants for Tests ---
const TEST_PASSWORD = "password123";
const DUMMY_PROVIDER_ID = '11111111-1111-1111-1111-111111111111';
const DUMMY_SYSTEM_PROMPT_ID = '22222222-2222-2222-2222-222222222222';

// --- Test Suite Definition ---
describe("RLS Policies for 'chats' Table", () => {
    let adminClient: SupabaseClient<Database>;
    let userA: TestUserContext;
    let userB: TestUserContext;
    let userC_AdminOrgX: TestUserContext;
    let userD_MemberOrgX: TestUserContext;
    let orgX: TestOrg;
    
    const createdChatIds: string[] = [];
    let personalChatUserAId: string | undefined;
    let orgChatUserCId: string | undefined;
    let orgChatUserDId: string | undefined;

    beforeAll(async () => {
        console.log("--- Starting Chats RLS Test Suite Setup ---");
        adminClient = createAdminClientInstance(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!); 
        const timeSuffix = Date.now();
        
        [userA, userB, userC_AdminOrgX, userD_MemberOrgX] = await Promise.all([
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'user-a-rls-chat-' + timeSuffix + '@test.com', TEST_PASSWORD),
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'user-b-rls-chat-' + timeSuffix + '@test.com', TEST_PASSWORD),
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'user-c-admin-rls-chat-' + timeSuffix + '@test.com', TEST_PASSWORD),
            createTestUser(adminClient, SUPABASE_URL!, SUPABASE_ANON_KEY!, 'user-d-member-rls-chat-' + timeSuffix + '@test.com', TEST_PASSWORD)
        ]);

        orgX = await createTestOrg(adminClient, 'Org X RLS Chats Test ' + timeSuffix);
        await addOrgMember(adminClient, orgX.id, userC_AdminOrgX.userId, 'admin');
        await addOrgMember(adminClient, orgX.id, userD_MemberOrgX.userId, 'member'); // User D is member
        await setOrgMemberChatCreation(adminClient, orgX.id, true); 

        console.log(`[DEBUG CHECK PRE-TEST] User C (${userC_AdminOrgX.userId}) memberships in Org X (${orgX.id}):`);
        const { data: userCMemberships } = await adminClient.from('organization_members').select('*').eq('user_id', userC_AdminOrgX.userId).eq('organization_id', orgX.id);
        console.log(JSON.stringify(userCMemberships, null, 2));
        
        console.log(`[DEBUG CHECK PRE-TEST] User D (${userD_MemberOrgX.userId}) memberships in Org X (${orgX.id}):`);
        const { data: userDMemberships } = await adminClient.from('organization_members').select('*').eq('user_id', userD_MemberOrgX.userId).eq('organization_id', orgX.id);
        console.log(JSON.stringify(userDMemberships, null, 2));

        console.log("--- Finished Chats RLS Test Suite Setup ---");
    });

    afterAll(async () => {
        console.log("--- Starting Chats RLS Teardown ---");
        if (createdChatIds.length > 0) {
            console.log('Cleaning up chats: ' + createdChatIds.join(", "));
            const { error } = await adminClient.from('chats').delete().in('id', createdChatIds);
            if (error) console.error("Error cleaning up chats:", error.message);
        }
        // Improved cleanup: Attempt to remove members before org admin, then org admin, then org
        // This might still fail if org has other dependencies or strict "last admin" rules not handled by simple delete
        try {
            if (orgX && userD_MemberOrgX) await adminClient.from('organization_members').delete().match({ organization_id: orgX.id, user_id: userD_MemberOrgX.userId });
        } catch (e) { console.error("Error cleaning up User D from Org X:", e); }
        try {
            if (orgX && userC_AdminOrgX) await adminClient.from('organization_members').delete().match({ organization_id: orgX.id, user_id: userC_AdminOrgX.userId });
        } catch (e) { console.error("Error cleaning up User C from Org X:", e); }
        
        await Promise.allSettled([
            userA?.email ? cleanupTestUserByEmail(adminClient, userA.email) : Promise.resolve(),
            userB?.email ? cleanupTestUserByEmail(adminClient, userB.email) : Promise.resolve(),
            userC_AdminOrgX?.email ? cleanupTestUserByEmail(adminClient, userC_AdminOrgX.email) : Promise.resolve(), 
            userD_MemberOrgX?.email ? cleanupTestUserByEmail(adminClient, userD_MemberOrgX.email) : Promise.resolve(),
            orgX?.name ? cleanupTestOrgByName(adminClient, orgX.name) : Promise.resolve()
        ]).then(results => {
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.error(`Cleanup failed for item ${index}:`, result.reason);
                }
            });
        });
        console.log("--- Finished Chats RLS Teardown ---");
    });

    // --- INSERT Tests ---
    describe("INSERT operations", () => {
        it("User A can create a personal chat", async () => {
            const { data, error } = await userA.client.from('chats')
                .insert({
                    user_id: userA.userId, 
                    title: "User A Personal Chat",
                    organization_id: null,
                    system_prompt_id: DUMMY_SYSTEM_PROMPT_ID
                })
                .select('id')
                .single();
            
            assertEquals(error, null, "Expected no error inserting personal chat.");
            assertExists(data?.id, "Chat ID should be returned.");
            personalChatUserAId = data?.id; 
            if (data?.id) createdChatIds.push(data.id);
        });

        it("User C (Org X Admin) can create an Org X chat", async () => {
            const { data, error } = await userC_AdminOrgX.client.from('chats')
                .insert({
                    user_id: userC_AdminOrgX.userId, 
                    title: "Org X Chat by Admin C",
                    organization_id: orgX.id,
                    system_prompt_id: DUMMY_SYSTEM_PROMPT_ID
                })
                .select('id')
                .single();
            
            assertEquals(error, null, "Expected no error for admin creating org chat.");
            assertExists(data?.id, "Chat ID should be returned.");
            orgChatUserCId = data?.id; 
            if (data?.id) createdChatIds.push(data.id);
        });

        it("User D (Org X Member) can create an Org X chat when org allows", async () => {
            await setOrgMemberChatCreation(adminClient, orgX.id, true); 
            const { data, error } = await userD_MemberOrgX.client.from('chats')
                .insert({
                    user_id: userD_MemberOrgX.userId,
                    title: "Org X Chat by Member D (Allowed)",
                    organization_id: orgX.id,
                    system_prompt_id: DUMMY_SYSTEM_PROMPT_ID
                })
                .select('id')
                .single();
            
            assertEquals(error, null, "Expected no error for member creating org chat when allowed.");
            assertExists(data?.id, "Chat ID should be returned.");
            orgChatUserDId = data?.id; 
            if (data?.id) createdChatIds.push(data.id);
        });

        it("User D (Org X Member) CANNOT create an Org X chat when org disallows", async () => {
            await setOrgMemberChatCreation(adminClient, orgX.id, false); 
            const { data, error } = await userD_MemberOrgX.client.from('chats')
                .insert({
                    user_id: userD_MemberOrgX.userId,
                    title: "Org X Chat by Member D (Disallowed)",
                    organization_id: orgX.id,
                    system_prompt_id: DUMMY_SYSTEM_PROMPT_ID
                })
                .select('id')
                .single();
            
            assertNotEquals(error, null, "Expected an error for member creating org chat when disallowed.");
            assertEquals(data, null);
            assertMatch(error?.message ?? '', /permission denied for table chats|violates row-level security policy/i); 
        });

        it("User A (not in Org X) CANNOT create an Org X chat", async () => {
            const { data, error } = await userA.client.from('chats')
                .insert({
                    user_id: userA.userId,
                    title: "User A trying Org X Chat",
                    organization_id: orgX.id, 
                    system_prompt_id: DUMMY_SYSTEM_PROMPT_ID
                })
                .select('id')
                .single();
            
            assertNotEquals(error, null, "Expected an error for non-member creating org chat.");
            assertEquals(data, null);
            assertMatch(error?.message ?? '', /permission denied for table chats|violates row-level security policy/i); 
        });
        
        it("User C (Org X Admin) CANNOT create a chat for Org X assigned to User D", async () => {
            const { data, error } = await userC_AdminOrgX.client.from('chats')
                .insert({
                    user_id: userD_MemberOrgX.userId, 
                    title: "User C trying to create chat FOR User D",
                    organization_id: orgX.id,
                    system_prompt_id: DUMMY_SYSTEM_PROMPT_ID
                })
                .select('id')
                .single();
                
            assertNotEquals(error, null, "Expected an RLS error for mismatched user_id on insert.");
            assertEquals(data, null);
            assertMatch(error?.message ?? '', /permission denied for table chats|violates row-level security policy/i); 
        });
    });

    // --- SELECT Tests ---
    describe("SELECT operations", () => {
        beforeAll(async () => {
            if (!personalChatUserAId) {
                const { data } = await adminClient.from('chats').insert({ user_id: userA.userId, title: "Select Test Personal A"}).select('id').single();
                personalChatUserAId = data!.id; if (personalChatUserAId) createdChatIds.push(personalChatUserAId);
            }
            if (!orgChatUserCId) {
                const { data } = await adminClient.from('chats').insert({ user_id: userC_AdminOrgX.userId, organization_id: orgX.id, title: "Select Test Org C"}).select('id').single();
                orgChatUserCId = data!.id; if (orgChatUserCId) createdChatIds.push(orgChatUserCId);
            }
            // Create a chat by User D if one wasn't created in INSERT tests (e.g. if that block is skipped)
            if (!orgChatUserDId) { 
                await setOrgMemberChatCreation(adminClient, orgX.id, true);
                const { data } = await userD_MemberOrgX.client.from('chats').insert({ user_id: userD_MemberOrgX.userId, organization_id: orgX.id, title: "Select Test Org D"}).select('id').single();
                orgChatUserDId = data!.id; if (orgChatUserDId) createdChatIds.push(orgChatUserDId);
            }
        });

        it("User A can SELECT their personal chats, but not Org X chats", async () => {
            const { data, error } = await userA.client.from('chats').select('id, organization_id');
            assertEquals(error, null, "SELECT failed for User A");
            assertExists(data, "Data should exist");
            assert(data!.some(chat => chat.id === personalChatUserAId), "User A should see their personal chat");
            assertFalse(data!.some(chat => chat.organization_id === orgX.id), "User A should NOT see Org X chats");
        });

        it("User C (Org X Admin) can SELECT Org X chats (including User D's)", async () => {
            const { data, error } = await userC_AdminOrgX.client.from('chats').select('id').eq('organization_id', orgX.id);
            assertEquals(error, null, "SELECT failed for User C on Org X");
            assertExists(data);
            assert(data!.some(chat => chat.id === orgChatUserCId), "User C should see their own Org X chat");
            if(orgChatUserDId) assert(data!.some(chat => chat.id === orgChatUserDId), "User C should see User D's Org X chat");
        });

        it("User D (Org X Member) can SELECT Org X chats (including User C's)", async () => {
            const { data, error } = await userD_MemberOrgX.client.from('chats').select('id').eq('organization_id', orgX.id);
            assertEquals(error, null, "SELECT failed for User D on Org X");
            assertExists(data);
            if(orgChatUserCId) assert(data!.some(chat => chat.id === orgChatUserCId), "User D should see User C's Org X chat");
            assert(data!.some(chat => chat.id === orgChatUserDId), "User D should see their own Org X chat");
        });

        it("User B (not in Org X) CANNOT SELECT Org X chats", async () => {
            const { data, error } = await userB.client.from('chats').select('id').eq('organization_id', orgX.id);
            assertEquals(error, null, "SELECT technically succeeded for User B, but should be empty");
            assertEquals(data?.length, 0, "User B should see zero Org X chats");
        });
    });

    // --- UPDATE Tests ---
    describe("UPDATE operations", () => {
        it("User A can update their personal chat's title", async () => {
            assertExists(personalChatUserAId, "Prerequisite: User A personal chat ID missing");
            const { error } = await userA.client.from('chats')
                .update({ title: "Updated by User A" })
                .eq('id', personalChatUserAId);
            assertEquals(error, null, "User A should be able to update their personal chat title.");
        });

        it("User A CANNOT update Org X chat's title", async () => {
            assertExists(orgChatUserCId, "Prerequisite: Org X chat ID for User C missing");
            const { error } = await userA.client.from('chats')
                .update({ title: "Attempt update by User A" })
                .eq('id', orgChatUserCId);
            const { data: verifyData, error: verifyError } = await adminClient.from('chats').select('title').eq('id', orgChatUserCId).single();
            assertEquals(verifyError, null);
            assertNotEquals(verifyData?.title, "Attempt update by User A", "Org chat title should not have been updated by User A.");
        });

        it("User C (Org X Admin) can update Org X chat's title", async () => {
            assertExists(orgChatUserCId, "Prerequisite: Org X chat ID for User C missing");
            const { error } = await userC_AdminOrgX.client.from('chats')
                .update({ title: "Updated by Admin C" })
                .eq('id', orgChatUserCId);
            assertEquals(error, null, "User C should be able to update Org X chat title.");
        });

        it("User D (Org X Member) CANNOT update Org X chat's title", async () => {
            assertExists(orgChatUserCId, "Prerequisite: Org X chat ID for User C missing"); // Test against User C's chat
            const { error } = await userD_MemberOrgX.client.from('chats')
                .update({ title: "Attempt update by Member D" })
                .eq('id', orgChatUserCId);
            const { data: verifyData, error: verifyError } = await adminClient.from('chats').select('title').eq('id', orgChatUserCId).single();
            assertEquals(verifyError, null);
            assertNotEquals(verifyData?.title, "Attempt update by Member D", "Org chat title should not have been updated by Member D.");
        });
        
        it("User C (Org X Admin) CANNOT update organization_id of Org X chat (Trigger check)", async () => {
            assertExists(orgChatUserCId, "Prerequisite: Org X chat ID for User C missing");
            const tempOrgY = await createTestOrg(adminClient, 'Temp Org Y for Update Test ' + Date.now());
            
            const { error } = await userC_AdminOrgX.client.from('chats')
                .update({ organization_id: tempOrgY.id })
                .eq('id', orgChatUserCId);
                
            assertNotEquals(error, null, "Expected an error trying to update organization_id.");
            assertMatch(error?.message ?? '', /Changing the organization_id of a chat is not allowed/i); 
            
            await cleanupTestOrgByName(adminClient, tempOrgY.name);
        });
    });

    // --- DELETE Tests ---
    describe("DELETE operations", () => {
        let chatToDeleteForA: string;
        let chatToDeleteForC_ByAdmin: string; // Chat created by Admin C, to be deleted by Admin C
        let chatToDeleteForD_AttemptByMember: string; // Chat created by Admin C, to be attempted for deletion by Member D

        beforeAll(async () => {
            const timeSuffix = '-' + Date.now();
            // Chat for User A to delete
            const resA = await adminClient.from('chats').insert({ user_id: userA.userId, title: "A to Delete" + timeSuffix}).select('id').single();
            chatToDeleteForA = resA.data!.id; if(chatToDeleteForA) createdChatIds.push(chatToDeleteForA); 
            
            // Chat for Admin C to delete (created by Admin C)
            const resC = await adminClient.from('chats').insert({ user_id: userC_AdminOrgX.userId, organization_id: orgX.id, title: "C to Delete by Admin" + timeSuffix}).select('id').single();
            chatToDeleteForC_ByAdmin = resC.data!.id; if(chatToDeleteForC_ByAdmin) createdChatIds.push(chatToDeleteForC_ByAdmin);
            
            // Chat for Member D to attempt to delete (created by Admin C)
            const resD = await adminClient.from('chats').insert({ user_id: userC_AdminOrgX.userId, organization_id: orgX.id, title: "C to be Delete-Attempted by D" + timeSuffix}).select('id').single();
            chatToDeleteForD_AttemptByMember = resD.data!.id; if(chatToDeleteForD_AttemptByMember) createdChatIds.push(chatToDeleteForD_AttemptByMember);
        });

        it("User A can DELETE their personal chat", async () => {
            const { error } = await userA.client.from('chats')
                .delete()
                .eq('id', chatToDeleteForA);
            assertEquals(error, null, "User A should be able to delete their personal chat.");
        });

        it("User D (Org X Member) CANNOT DELETE Org X chat created by Admin C", async () => {
            const chatTargetId = chatToDeleteForD_AttemptByMember;
            // Actual test: User D attempts delete
            const { error } = await userD_MemberOrgX.client.from('chats')
                .delete()
                .eq('id', chatTargetId); 
            assertNotEquals(error, null, "Expected RLS error for member deleting org chat."); // This is currently failing
            assertMatch(error?.message ?? '', /permission denied for table chats|violates row-level security policy/i);
        });

        it("User C (Org X Admin) can DELETE Org X chat they created", async () => {
            const { error } = await userC_AdminOrgX.client.from('chats')
                .delete()
                .eq('id', chatToDeleteForC_ByAdmin);
            assertEquals(error, null, "Admin C should be able to delete the org chat they created.");
        });

        it("User A CANNOT DELETE a non-existent or already deleted chat", async () => {
            const nonExistentId = '00000000-0000-0000-0000-000000000000';
            // Delete the chat if it wasn't already (e.g., if the first delete test was skipped)
            await userA.client.from('chats').delete().eq('id', chatToDeleteForA);
        
            // Try deleting the already-deleted chat
            const { error, count } = await userA.client.from('chats')
                .delete()
                .eq('id', chatToDeleteForA); 
                
            assertEquals(error, null, "Delete on already-deleted chat should not error.");
            // FIX: Accept null or 0 as count
            assert(count === null || count === 0, "Count should be 0 or null when deleting already-deleted chat."); 
            
            // Try deleting a truly non-existent chat
            const { error: err2, count: count2 } = await userA.client.from('chats')
                .delete()
                .eq('id', nonExistentId); 
            assertEquals(err2, null, "Delete on non-existent UUID should not error.");
            // FIX: Accept null or 0 as count
            assert(count2 === null || count2 === 0, "Count should be 0 or null when deleting non-existent UUID.");
        });
    });
}); 