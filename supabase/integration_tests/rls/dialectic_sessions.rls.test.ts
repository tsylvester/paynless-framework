import {
  assert,
  assertExists,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  afterAll,
  beforeEach,
  beforeAll,
  describe,
  it,
  afterEach
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Json } from "../../functions/types_db.ts";
import {
  initializeSupabaseAdminClient,
  coreCreateAndSetupTestUser,
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreTeardown,
  initializeTestDeps,
  TestSetupConfig,
  registerUndoAction,
} from "../../functions/_shared/_integration.test.utils.ts";

describe("RLS: dialectic_sessions", () => {
  let adminClient: SupabaseClient<Database>;

  let userClient1: SupabaseClient<Database>;
  let user1Id: string;
  let userClient2: SupabaseClient<Database>;
  let user2Id: string;

  let project1User1Id: string;
  let project1User2Id: string;

  // To hold clients returned by coreInitializeTestStep in beforeEach if needed by tests
  let currentAnonClient: SupabaseClient<Database>; 

  beforeAll(async () => {
    adminClient = initializeSupabaseAdminClient();
    initializeTestDeps();

    const { userId: u1Id, userClient: u1Client } = await coreCreateAndSetupTestUser(
      { first_name: 'User1 SessionsRLS' },
      'global'
    );
    user1Id = u1Id;
    userClient1 = u1Client;

    const { userId: u2Id, userClient: u2Client } = await coreCreateAndSetupTestUser(
      { first_name: 'User2 SessionsRLS' },
      'global'
    );
    user2Id = u2Id;
    userClient2 = u2Client;

    const { data: p1u1, error: p1u1Error } = await adminClient
      .from("dialectic_projects")
      .insert({ user_id: user1Id, project_name: "User1 RLS Project 1", initial_user_prompt: "Test U1P1" })
      .select("id")
      .single();
    if (p1u1Error) throw p1u1Error;
    assertExists(p1u1);
    project1User1Id = p1u1.id;
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_projects', criteria: { id: project1User1Id }, scope: 'global' });

    const { data: p1u2, error: p1u2Error } = await adminClient
      .from("dialectic_projects")
      .insert({ user_id: user2Id, project_name: "User2 RLS Project 1", initial_user_prompt: "Test U2P1" })
      .select("id")
      .single();
    if (p1u2Error) throw p1u2Error;
    assertExists(p1u2);
    project1User2Id = p1u2.id;
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_projects', criteria: { id: project1User2Id }, scope: 'global' });
  });

  afterAll(async () => {
    await coreCleanupTestResources('all');
    await coreTeardown();
  });
  
  beforeEach(async () => {
    const { anonClient } = await coreInitializeTestStep({}, 'local');
    currentAnonClient = anonClient; // Available for tests if they prefer this over manually created one
  });

  afterEach(async () => {
    await coreCleanupTestResources('local'); 
  });


  it("User can create a session for their own project", async () => {
    const { data, error } = await userClient1
      .from("dialectic_sessions")
      .insert({ project_id: project1User1Id, session_description: "User 1 Test Session" })
      .select("id, project_id")
      .single();
    assert(!error, `Insert failed: ${error?.message}`);
    assertExists(data);
    assertEquals(data.project_id, project1User1Id);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: data.id }, scope: 'local' });
  });

  it("User cannot create a session for another user's project", async () => {
    const { data, error, status } = await userClient1 
      .from("dialectic_sessions")
      .insert({ project_id: project1User2Id, session_description: "User 1 Trespass Session" });
      // .select().single(); // Removed to get raw DML result
    
    console.log("DEBUG CANNOT CREATE SESSION:", { data, error, status });
    assertExists(error, "Expected RLS error when creating session on another user's project.");
    assertEquals(status, 403, "Expected HTTP 403 Forbidden status."); // Assuming 403 for RLS insert violation
    if (error) {
      // Example: assertEquals((error as any).code, "42501");
      assert(error.message.includes("violates row-level security policy"), "Error message should indicate RLS violation.");
    }
  });

  it("User can read sessions for their own projects", async () => {
    const { data: s1, error: s1Error } = await adminClient
      .from("dialectic_sessions")
      .insert({ project_id: project1User1Id, session_description: "User 1 Read Test Session" })
      .select("id, project_id")
      .single();
    if (s1Error) throw s1Error;
    assertExists(s1);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: s1.id }, scope: 'local' });

    const { data, error } = await userClient1
      .from("dialectic_sessions")
      .select("*")
      .eq("id", s1.id);
    assert(!error, `Read failed: ${error?.message}`);
    assertEquals(data?.length, 1);
    assertEquals(data?.[0].id, s1.id);
  });

  it("User cannot read sessions for another user's projects", async () => {
    const { data: s2, error: s2Error } = await adminClient
      .from("dialectic_sessions")
      .insert({ project_id: project1User2Id, session_description: "User 2 Hidden Session" })
      .select("id, project_id")
      .single();
    if (s2Error) throw s2Error;
    assertExists(s2);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: s2.id }, scope: 'local' });

    const { data, error } = await userClient1 
      .from("dialectic_sessions")
      .select("*")
      .eq("id", s2.id);
    assert(!error, "Select should not error but return empty due to RLS");
    assertEquals(data?.length, 0);
  });

  it("User can update sessions for their own projects", async () => {
    const { data: s1, error: s1Error } = await userClient1 
      .from("dialectic_sessions")
      .insert({ project_id: project1User1Id, session_description: "User 1 Update Test Original" })
      .select("id, project_id")
      .single();
    if (s1Error) throw s1Error;
    assertExists(s1);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: s1.id }, scope: 'local' });

    const newDesc = "User 1 Update Test Updated";
    const { data: updatedData, error: updateError } = await userClient1
      .from("dialectic_sessions")
      .update({ session_description: newDesc })
      .eq("id", s1.id)
      .select().single();
    assert(!updateError, `Update failed: ${updateError?.message}`);
    assertExists(updatedData);
    assertEquals(updatedData.session_description, newDesc);
  });

  it("User cannot update sessions for another user's projects", async () => {
    const { data: s2, error: s2Error } = await adminClient 
      .from("dialectic_sessions")
      .insert({ project_id: project1User2Id, session_description: "User 2 Uneditable Session" })
      .select("id, project_id")
      .single();
    if (s2Error) throw s2Error;
    assertExists(s2);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: s2.id }, scope: 'local' });

    const { data: updateData, error: updateError, status: updateStatus } = await userClient1 
      .from("dialectic_sessions")
      .update({ session_description: "User 1 Trespass Update" })
      .eq("id", s2.id);
      // .select().single(); // Removed

    console.log("DEBUG CANNOT UPDATE SESSION:", { updateData, updateError, updateStatus });
    assertEquals(updateError, null, "Expected no explicit error for RLS-blocked update resulting in 0 rows affected.");
    assertEquals(updateStatus, 204, "Expected HTTP 204 No Content for RLS-blocked update.");

    // Verify with admin client that the update didn't happen
    const { data: verifyData, error: verifyFetchError } = await adminClient
      .from('dialectic_sessions')
      .select('session_description')
      .eq('id', s2.id)
      .single();
    assert(!verifyFetchError, `Admin client verification select failed: ${verifyFetchError?.message}`);
    assertEquals(verifyData?.session_description, "User 2 Uneditable Session", "Session description should not have been updated.");
  });

  it("User can delete sessions for their own projects", async () => {
    const { data: s1, error: s1Error } = await userClient1 
      .from("dialectic_sessions")
      .insert({ project_id: project1User1Id, session_description: "User 1 Delete Test Session" })
      .select("id, project_id")
      .single();
    if (s1Error) throw s1Error;

    const { error: deleteError } = await userClient1
      .from("dialectic_sessions")
      .delete()
      .eq("id", s1.id);
    assert(!deleteError, `Delete failed: ${deleteError?.message}`);
    
    const { data: verifyData, error: verifyErr } = await userClient1
        .from("dialectic_sessions").select("id").eq("id", s1.id).maybeSingle();
    assert(!verifyErr);
    assertEquals(verifyData, null);
  });

  it("User cannot delete sessions for another user's projects", async () => {
    const { data: s2, error: s2Error } = await adminClient 
      .from("dialectic_sessions")
      .insert({ project_id: project1User2Id, session_description: "User 2 Undeletable Session" })
      .select("id, project_id")
      .single();
    if (s2Error) throw s2Error;
    assertExists(s2);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: s2.id }, scope: 'local' });

    const { data: deleteData, error: deleteError, status: deleteStatus } = await userClient1 
      .from("dialectic_sessions")
      .delete()
      .eq("id", s2.id);
      // .select().single(); // Removed

    console.log("DEBUG CANNOT DELETE SESSION:", { deleteData, deleteError, deleteStatus });
    assertEquals(deleteError, null, "Expected no explicit error for RLS-blocked delete resulting in 0 rows affected.");
    assertEquals(deleteStatus, 204, "Expected HTTP 204 No Content for RLS-blocked delete.");

    // Verify with admin client that the delete didn't happen
    const { data: verifyData, error: verifySelectError } = await adminClient
      .from('dialectic_sessions')
      .select('id')
      .eq('id', s2.id)
      .maybeSingle();
    assert(!verifySelectError, `Admin client verification select failed: ${verifySelectError?.message}`);
    assertExists(verifyData, "Row should still exist when checked by admin after a failed delete attempt.");
  });

  it("Unauthenticated user cannot read sessions", async () => {
    const { data: s1, error: s1Error } = await adminClient
      .from("dialectic_sessions")
      .insert({ project_id: project1User1Id, session_description: "Anon Read Test Session" })
      .select("id, project_id").single();
    if (s1Error) throw s1Error;
    assertExists(s1);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: s1.id }, scope: 'local' });

    const { data, error } = await currentAnonClient
      .from("dialectic_sessions")
      .select("*")
      .eq("id", s1.id);
    assert(!error, "Anon select should not error, but return empty due to RLS");
    assertEquals(data?.length, 0);
  });
  
}); 