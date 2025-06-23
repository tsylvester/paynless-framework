import {
  describe,
  it,
  beforeAll,
  afterAll,
} from "jsr:@std/testing@0.225.1/bdd";
import {
  assertEquals,
  assertExists,
  assertNotEquals,
  fail,
} from "jsr:@std/assert@0.225.3";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../../functions/types_db.ts";
import { createSupabaseAdminClient, createSupabaseClient } from "../../functions/_shared/auth.ts";

const testRunId = `test-${Date.now()}`;
const BUCKET_NAME = 'dialectic-contributions';

let adminClient: SupabaseClient<Database>;
let userClient: SupabaseClient<Database>;
let createdUserId: string | null = null;
let createdUserEmail: string;

// Variables to hold created resource IDs for cleanup
let createdProjectId: string | null = null;
let createdSessionId: string | null = null;
const createdAiProviderId: string = crypto.randomUUID(); // Changed to const
let createdSessionModelId: string | null = null;
let rawFilePath: string | null = null;
let structuredFilePath: string | null = null;
let contributionId: string | null = null; // This might be set within the test

describe("Contribution Storage Cleanup Trigger Integration Tests (Direct Supabase)", () => {

  beforeAll(async () => {

    adminClient = createSupabaseAdminClient();
    console.log("Admin client initialized.");

    // 1. Manually create a test user
    createdUserEmail = `test-user-${testRunId}@example.com`;
    const userPassword = "password123";
    const { data: userAuthData, error: userAuthError } = await adminClient.auth.admin.createUser({
      email: createdUserEmail,
      password: userPassword,
      email_confirm: true, // Auto-confirm email
    });

    if (userAuthError) fail(`Failed to create test user: ${userAuthError.message}`);
    assertExists(userAuthData?.user, "User data should exist after creation.");
    createdUserId = userAuthData.user.id;
    console.log(`Test user created successfully. User ID: ${createdUserId}`);
    
    // Manually ensure user profile exists (optional, but good practice if RLS depends on it for other tables)
    // For this test, it might not be strictly needed if we only interact with dialectic_* tables
    // via policies that just check auth.uid() against user_id fields we set.
    // However, if user_profiles.role was key, we'd do this:
    const { error: profileInsertError } = await adminClient.from('user_profiles').upsert({
        id: createdUserId,
        first_name: 'DirectTest',
        role: 'user' // Default role for user_profiles
    }, { onConflict: 'id' });
    if (profileInsertError) fail(`Failed to insert user profile: ${profileInsertError.message}`);
    console.log(`User profile for ${createdUserId} ensured.`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      fail("SUPABASE_URL and SUPABASE_ANON_KEY must be set for tests");
    }
    // Replace the problematic userClient initialization:
    // userClient = createSupabaseClient(); 
    // With direct initialization:
    userClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false // Recommended for non-browser environments
      }
    });

    // userPassword was defined earlier during user creation
    const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
      email: createdUserEmail,
      password: userPassword, 
    });

    if (signInError) {
        console.error("Full error signing in userClient:", JSON.stringify(signInError, null, 2));
        fail(`Failed to sign in userClient: ${signInError.message}`);
    }
    assertExists(signInData?.session, "User session should exist after sign-in.");
    assertExists(signInData?.user, "User data should exist after sign-in.");
    assertEquals(signInData?.user?.id, createdUserId, "Signed-in user ID should match created user ID.");
    console.log(`User client initialized and signed in as ${createdUserEmail} (ID: ${signInData?.user?.id}).`);

    // Diagnostic: Select user profile with the new userClient
    console.log(`Attempting to select own profile for user ID: ${createdUserId} using new userClient`);
    const { data: profileData, error: profileError } = await userClient
      .from('user_profiles')
      .select('*')
      .eq('id', createdUserId)
      .single();

    if (profileError) {
      console.error("Error selecting user profile with new userClient:", JSON.stringify(profileError, null, 2));
      fail(`Failed to select own user profile with new userClient: ${profileError.message}.`);
    }
    assertExists(profileData, "User profile data selected by new userClient should exist.");
    console.log(`Successfully selected own profile with new userClient. Profile role: ${profileData.role}`);


    // 4. Seed an AI Provider (using admin client)
    const { data: providerData, error: providerErr } = await adminClient.from('ai_providers').upsert({
      id: createdAiProviderId,
      api_identifier: 'test-provider-' + testRunId,
      name: 'Test Cleanup Provider-' + testRunId,
      provider: 'openai',
      is_active: true,
      is_enabled: true,
      config: {},
    }, { onConflict: 'id' }).select().single();
    if (providerErr) fail(`Failed to seed AI Provider: ${providerErr.message}`);
    assertExists(providerData, "AI Provider data should exist after upsert.");
    console.log(`AI Provider ${createdAiProviderId} seeded.`);

    // 5. Create a project (using adminClient, associated with our manually created user)
    const { data: projectData, error: projectErr } = await adminClient
      .from('dialectic_projects')
      .insert({ project_name: `Test Project Direct ${testRunId}`, initial_user_prompt: "Test prompt", user_id: createdUserId! })
      .select()
      .single();
    if (projectErr) fail(`Failed to create project: ${projectErr.message}`);
    createdProjectId = projectData.id;
    console.log(`Project ${createdProjectId} created for user ${createdUserId}.`);

    // 6. Create a session (using our new userClient)
    const { data: sessionData, error: sessionErr } = await userClient
      .from('dialectic_sessions')
      .insert({ project_id: createdProjectId!, status: 'test_pending', current_stage_seed_prompt: "Test seed" })
      .select()
      .single();
    if (sessionErr) {
        console.error("Full error creating session with userClient:", JSON.stringify(sessionErr, null, 2));
        fail(`Failed to create session: ${sessionErr.message}`);
    }
    createdSessionId = sessionData.id;
    console.log(`Session ${createdSessionId} created.`);

    // 7. Create a dialectic_session_model linking the session and AI provider (as admin client)
    const { data: sessionModelData, error: sessionModelErr } = await adminClient
      .from('dialectic_session_models')
      .insert({ session_id: createdSessionId!, model_id: createdAiProviderId, model_role: 'test_role' })
      .select()
      .single();
    if (sessionModelErr) fail(`Failed to create session model link: ${sessionModelErr.message}`);
    createdSessionModelId = sessionModelData.id;
    console.log(`SessionModel ${createdSessionModelId} created.`);
  });

  afterAll(async () => {
    if (!adminClient) {
      console.warn("Admin client not initialized, skipping cleanup.");
      return;
    }
    console.log("Starting manual cleanup...");

    // Manually delete any storage objects if paths were set and not cleared by trigger
    if (rawFilePath) {
      console.log(`Attempting to delete raw file: ${rawFilePath}`);
      await adminClient.storage.from(BUCKET_NAME).remove([rawFilePath]);
    }
    if (structuredFilePath) {
      console.log(`Attempting to delete structured file: ${structuredFilePath}`);
      await adminClient.storage.from(BUCKET_NAME).remove([structuredFilePath]);
    }
    
    // Delete DB records in reverse order of creation or dependency
    if (contributionId) { // If a contribution was created in the test
      console.log(`Deleting contribution: ${contributionId}`);
      await adminClient.from('dialectic_contributions').delete().match({ id: contributionId });
    }
    if (createdSessionModelId) {
      console.log(`Deleting session model: ${createdSessionModelId}`);
      await adminClient.from('dialectic_session_models').delete().match({ id: createdSessionModelId });
    }
    if (createdSessionId) {
      console.log(`Deleting session: ${createdSessionId}`);
      await adminClient.from('dialectic_sessions').delete().match({ id: createdSessionId });
    }
    if (createdProjectId) {
      console.log(`Deleting project: ${createdProjectId}`);
      await adminClient.from('dialectic_projects').delete().match({ id: createdProjectId });
    }
    if (createdAiProviderId) { // This ID is always set
      console.log(`Deleting AI provider: ${createdAiProviderId}`);
      await adminClient.from('ai_providers').delete().match({ id: createdAiProviderId });
    }
    if (createdUserId) {
      console.log(`Deleting user: ${createdUserId}`);
      const { error: deleteUserErr } = await adminClient.auth.admin.deleteUser(createdUserId);
      if (deleteUserErr) console.error(`Error deleting user ${createdUserId}: ${deleteUserErr.message}`);
      else console.log(`User ${createdUserId} deleted.`);
    }
    console.log("Manual cleanup finished.");
  });

  // Placeholder for isUndoActionRegisteredForStoragePath if needed by remaining test logic,
  // though with manual cleanup, it might be less relevant.
  // For now, it's not used in the rewritten 'it' block below.
  // function isUndoActionRegisteredForStoragePath(path: string): boolean {
  //   console.warn(`isUndoActionRegisteredForStoragePath is a placeholder and returning false for ${path}.`);
  //   return false;
  // }

  it("should delete files from storage when a dialectic_contribution is deleted (Direct Supabase)", async () => {
    assertExists(createdSessionId, "Session ID must exist for the test.");
    assertExists(createdSessionModelId, "Session Model ID must exist for the test.");
    assertExists(userClient, "User client must be initialized for the test."); // Added assertion
    assertExists(adminClient, "Admin client must be initialized for the test."); // Added assertion


    const rawFileName = `test_raw_direct_${testRunId}.txt`;
    const structuredFileName = `test_structured_direct_${testRunId}.txt`;
    const fileContent = "dummy content for direct test";

    // 1. Upload dummy files to storage (using admin client)
    const { data: rawUpload, error: rawUploadError } = await adminClient.storage
      .from(BUCKET_NAME)
      .upload(rawFileName, new Blob([fileContent]), { contentType: 'text/plain', upsert: true });
    if (rawUploadError) fail(`Failed to upload raw file: ${rawUploadError.message}`);
    rawFilePath = rawUpload.path; // Store for cleanup
    console.log(`Raw file uploaded to: ${rawFilePath}`);

    const { data: structuredUpload, error: structuredUploadError } = await adminClient.storage
      .from(BUCKET_NAME)
      .upload(structuredFileName, new Blob([fileContent]), { contentType: 'text/plain', upsert: true });
    if (structuredUploadError) fail(`Failed to upload structured file: ${structuredUploadError.message}`);
    structuredFilePath = structuredUpload.path; // Store for cleanup
    console.log(`Structured file uploaded to: ${structuredFilePath}`);

    // 2. Insert a dialectic_contributions record (as the test user, using manually configured userClient)
    const { data: contribData, error: contribError } = await userClient
      .from('dialectic_contributions')
      .insert({
        session_id: createdSessionId!,
        session_model_id: createdSessionModelId!,
        storage_path: rawFilePath!,
        raw_response_storage_path: structuredFilePath!,
        mime_type: 'text/plain',
        storage_bucket: BUCKET_NAME,
        stage: 'test_stage_direct',
      })
      .select()
      .single();
    if (contribError) {
      console.error("Full error inserting contribution (Direct Supabase):", JSON.stringify(contribError, null, 2));
      fail(`Failed to insert contribution (Direct Supabase): ${contribError.message}`);
    }
    assertExists(contribData, "Contribution data should exist after insert (Direct Supabase).");
    contributionId = contribData.id; // Store for potential cleanup
    console.log(`Contribution ${contributionId} inserted (Direct Supabase).`);

    // 3. Delete the dialectic_contributions record (as the test user) - THIS IS THE ACTION UNDER TEST
    const { error: deleteError } = await userClient
      .from('dialectic_contributions')
      .delete()
      .match({ id: contributionId! }); // Assert non-null for id
    if (deleteError) fail(`Failed to delete contribution (Direct Supabase): ${deleteError.message}`);
    console.log(`Contribution ${contributionId} deleted, trigger should have fired (Direct Supabase).`);

    // 4. Verify files are deleted from storage (using admin client)
    await new Promise(resolve => setTimeout(resolve, 1000)); // Delay for trigger

    console.log(`Verifying deletion of: ${rawFilePath}`);
    const { data: rawListData, error: rawListError } = await adminClient.storage
      .from(BUCKET_NAME)
      .list(undefined, { search: rawFileName });
    if (rawListError) console.warn(`(Test may be noisy) Error listing raw file post-delete (Direct Supabase): ${rawListError.message}`);
    assertEquals(rawListData?.length, 0, `Raw file ${rawFileName} (path: ${rawFilePath}) should be deleted (Direct Supabase).`);

    console.log(`Verifying deletion of: ${structuredFilePath}`);
    const { data: structuredListData, error: structuredListError } = await adminClient.storage
      .from(BUCKET_NAME)
      .list(undefined, { search: structuredFileName });
    if (structuredListError) console.warn(`(Test may be noisy) Error listing structured file post-delete (Direct Supabase): ${structuredListError.message}`);
    assertEquals(structuredListData?.length, 0, `Structured file ${structuredFileName} (path: ${structuredFilePath}) should be deleted (Direct Supabase).`);
    
    // Nullify paths so afterAll doesn't try to delete them again if trigger worked
    rawFilePath = null;
    structuredFilePath = null; 
    console.log("Storage cleanup verification successful (Direct Supabase).");
  });
}); 