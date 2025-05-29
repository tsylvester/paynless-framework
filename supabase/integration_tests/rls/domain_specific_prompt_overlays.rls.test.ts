import {
  assert,
  assertExists,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  afterEach,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import {
  initializeSupabaseAdminClient,
  coreInitializeTestStep,
  setSharedAdminClient,
  initializeTestDeps,
  supabaseAdminClient,
  coreCleanupTestResources, 
  coreTeardown, 
  coreCreateAndSetupTestUser, 
  TestSetupConfig,
  registerUndoAction,
} from "../../functions/_shared/_integration.test.utils.ts";

describe("RLS policies for domain_specific_prompt_overlays", () => {
  let testUser1Client: SupabaseClient<Database>;
  let testUser2Client: SupabaseClient<Database>;
  let anonClientForTests: SupabaseClient<Database>;
  let baseSystemPromptId: string;
  let overlay1Id: string; 

  beforeAll(async () => {
    const adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient); 
    initializeTestDeps();

    const globalSetupConfig: TestSetupConfig = {
      resources: [
        {
          tableName: 'ai_providers',
          identifier: { api_identifier: 'gpt-3.5-turbo-test' },
          desiredState: {
            name: 'GPT-3.5 Turbo Test',
            api_identifier: 'gpt-3.5-turbo-test',
            is_active: true,
            is_enabled: true,
            config: { model: 'gpt-3.5-turbo' } as any,
          }
        }
      ]
    };
    await coreInitializeTestStep(globalSetupConfig, 'global'); // Specify 'global' scope

    const { data: existingPrompt, error: selectPromptError } = await supabaseAdminClient
      .from("system_prompts")
      .select("id")
      .eq("name", "base_for_overlay_rls_test")
      .maybeSingle();

    if (selectPromptError) throw selectPromptError;

    if (existingPrompt) {
      baseSystemPromptId = existingPrompt.id;
      // If it already exists, we assume it's managed outside this specific test suite's lifecycle,
      // or it should have been created by a previous global setup that is also transactional.
      // For true transactional behavior for this shared resource, it should also be in a TestSetupConfig.
      // However, to get its ID easily for now, manual creation with undo is a compromise.
      // If we want it to be part of the TestSetupConfig, we'd need a way to retrieve its ID after creation by coreInitializeTestStep.
    } else {
      const { data: newPrompt, error: insertPromptError } = await supabaseAdminClient
        .from("system_prompts")
        .insert({
          name: "base_for_overlay_rls_test",
          prompt_text: "This is a base prompt for RLS testing overlays.",
        })
        .select("id")
        .single();
      if (insertPromptError) throw insertPromptError;
      assertExists(newPrompt);
      baseSystemPromptId = newPrompt.id;
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'system_prompts',
        criteria: { id: baseSystemPromptId },
        scope: 'global' // Specify 'global' scope
      });
    }
  });

  beforeEach(async () => {
    const testUser1Config: TestSetupConfig = {
      resources: [
        {
          tableName: 'domain_specific_prompt_overlays',
          identifier: { domain_tag: "test_rls_tag_read" },
          desiredState: {
            domain_tag: "test_rls_tag_read",
            system_prompt_id: baseSystemPromptId,
            overlay_values: "Overlay for RLS read test: {{query}}",
          }
        }
      ],
      userProfile: { role: 'user', first_name: 'RLS OverlayUser1' },
    };

    const { 
      primaryUserClient, 
      anonClient 
    } = await coreInitializeTestStep(testUser1Config, 'local');
    
    testUser1Client = primaryUserClient;
    anonClientForTests = anonClient;

    const { data: overlay, error: selectOverlayError } = await supabaseAdminClient
      .from('domain_specific_prompt_overlays')
      .select('id')
      .eq('domain_tag', "test_rls_tag_read")
      .eq('system_prompt_id', baseSystemPromptId)
      .single();

    if (selectOverlayError || !overlay) {
      throw new Error(`Failed to find or confirm creation of overlay for tag 'test_rls_tag_read': ${selectOverlayError?.message}`);
    }
    overlay1Id = overlay.id;
    console.log(`[TEST DEBUG] beforeEach: overlay1Id set to: ${overlay1Id}`);

    const { userClient: createdTestUser2Client } = await coreCreateAndSetupTestUser({ role: 'user', first_name: 'RLS OverlayUser2' }, 'local');
    testUser2Client = createdTestUser2Client;
  });

  afterEach(async () => {
    await coreCleanupTestResources();
  });

  afterAll(async () => {
    // Remove manual deletions, the utility should now handle global resources.
    // if (supabaseAdminClient) { ... manual deletion code removed ... }
    
    // Clean up all remaining (i.e., global) resources
    await coreCleanupTestResources('all'); 
    await coreTeardown();
  });

  it("Authenticated 'user' role can read their own and other users' domain_specific_prompt_overlays (global read)", async () => {
    const { data, error } = await testUser1Client
      .from("domain_specific_prompt_overlays")
      .select("id, domain_tag, system_prompt_id")
      .eq("id", overlay1Id);

    assert(!error, `Read failed for user 1: ${error?.message}`);
    assertExists(data);
    assertEquals(data.length, 1);
    assertEquals(data[0].id, overlay1Id);
    assertEquals(data[0].domain_tag, "test_rls_tag_read");

    // Test if user 2 can also read it (confirming global read for authenticated users)
    const { data: dataUser2, error: errorUser2 } = await testUser2Client
      .from("domain_specific_prompt_overlays")
      .select("id")
      .eq("id", overlay1Id);
    
    assert(!errorUser2, `Read failed for user 2: ${errorUser2?.message}`);
    assertExists(dataUser2);
    assertEquals(dataUser2.length, 1, "User 2 should also be able to read the overlay.");
  });

  it("Authenticated 'user' role CANNOT insert into domain_specific_prompt_overlays", async () => {
    const { data, error, count, status, statusText } = await testUser1Client
      .from("domain_specific_prompt_overlays")
      .insert({
        domain_tag: "test_rls_tag_insert_fail",
        system_prompt_id: baseSystemPromptId,
        overlay_values: "User attempting to insert.",
      });

    console.log("DEBUG INSERT ATTEMPT:", { data, error, count, status, statusText });

    // RLS should block this. We expect an error object from Supabase.
    assertExists(error, "Expected an error object from Supabase due to RLS violation.");
    assertEquals(error?.message, 'new row violates row-level security policy for table "domain_specific_prompt_overlays"');
    assertEquals(status, 403);
    assertEquals((error as any)?.code, "42501");

    // Diagnostic: Explicitly delete the row with admin client before verification
    // This is to check if the row is somehow persisting despite the user's RLS block.
    // const { error: adminDeleteError } = await supabaseAdminClient
    //   .from("domain_specific_prompt_overlays")
    //   .delete()
    //   .eq("domain_tag", "test_rls_tag_insert_fail");
    // if (adminDeleteError) {
    //   console.warn("DEBUG: Admin client failed to delete the potentially phantom row:", adminDeleteError);
    // }

    // Re-enable admin client verification
    const { data: verifyData, error: verifyError } = await supabaseAdminClient
      .from("domain_specific_prompt_overlays")
      .select("id")
      .eq("domain_tag", "test_rls_tag_insert_fail");
    
    assert(!verifyError, `Admin client verification select failed: ${verifyError?.message}`);
    assertEquals(verifyData?.length, 0, "Row should NOT have been inserted when checked by admin.");
  });

  it("Authenticated 'user' role CANNOT update domain_specific_prompt_overlays", async () => {
    // Store original value before attempting update
    const { data: originalData, error: fetchError } = await supabaseAdminClient
      .from('domain_specific_prompt_overlays')
      .select('overlay_values')
      .eq('id', overlay1Id)
      .single();
    assert(!fetchError, `Failed to fetch original overlay value: ${fetchError?.message}`);
    assertExists(originalData, "Original overlay data for update test not found.");
    const originalOverlayValues = originalData.overlay_values;

    const { data, error, count, status, statusText } = await testUser1Client
      .from("domain_specific_prompt_overlays")
      .update({ overlay_values: "User attempting to update." })
      .eq("id", overlay1Id);

    console.log("DEBUG UPDATE ATTEMPT:", { data, error, count, status, statusText });

    assertEquals(error, null, "Expected no explicit error object from Supabase for a blocked update that affects 0 rows.");
    assertEquals(status, 204, "Expected HTTP 204 No Content status.");
    // count might be 0 or null depending on Supabase client version for 0 affected rows, so we might not assert on it directly unless behavior is known.

    // Verify with admin client that the update didn't happen
    const { data: verifyData, error: verifyError } = await supabaseAdminClient
      .from('domain_specific_prompt_overlays')
      .select('overlay_values')
      .eq('id', overlay1Id)
      .single();
    assert(!verifyError, `Admin client verification select failed post-update-attempt: ${verifyError?.message}`);
    assertEquals(verifyData?.overlay_values, originalOverlayValues, "Overlay values should NOT have been updated.");
  });

  it("Authenticated 'user' role CANNOT delete domain_specific_prompt_overlays", async () => {
    const { data, error, count, status, statusText } = await testUser1Client
      .from("domain_specific_prompt_overlays")
      .delete()
      .eq("id", overlay1Id);

    console.log("DEBUG DELETE ATTEMPT:", { data, error, count, status, statusText });

    assertEquals(error, null, "Expected no explicit error object from Supabase for a blocked delete that affects 0 rows.");
    assertEquals(status, 204, "Expected HTTP 204 No Content status.");

    // Verify with admin client that the delete didn't happen
    const { data: verifyData, error: verifySelectError } = await supabaseAdminClient
      .from('domain_specific_prompt_overlays')
      .select('id')
      .eq('id', overlay1Id)
      .maybeSingle();
    assert(!verifySelectError, `Admin client verification select failed post-delete-attempt: ${verifySelectError?.message}`);
    assertExists(verifyData, "Row should still exist when checked by admin after a failed delete attempt.");
  });

  it("Anon role CANNOT read domain_specific_prompt_overlays", async () => {
    const { data, error } = await anonClientForTests
      .from("domain_specific_prompt_overlays")
      .select("id")
      .eq("id", overlay1Id);
    
    // For anon, we expect RLS to deny, leading to an error or empty data.
    // If RLS is not hit (e.g. table is fully public), this would fail.
    // Based on typical RLS, anon should be blocked.
    assert(error || data?.length === 0, "Anon role should not be able to read overlays, or data should be empty.");
    if (error) {
        // Check for common RLS or auth error messages
        const msg = error.message.toLowerCase();
        assert(msg.includes("permission denied") || msg.includes("jwt") || msg.includes("rls") || msg.includes("security policy"), `Unexpected error for anon read: ${error.message}`);
    } else {
        assertEquals(data?.length, 0, "Anon read should return no data if no error occurs (RLS applied silently).");
    }
  });

}); 