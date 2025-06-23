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

describe("RLS: dialectic_contributions", () => {
  let adminClient: SupabaseClient<Database>;

  let userClient1: SupabaseClient<Database>;
  let user1Id: string;
  let userClient2: SupabaseClient<Database>;
  let user2Id: string;

  let project1User1Id: string;
  let session1Project1User1Id: string;
  let project1User2Id: string;
  let session1Project1User2Id: string;

  let dummySessionModelId: string;

  let currentAnonClient: SupabaseClient<Database>;

  beforeAll(async () => {
    adminClient = initializeSupabaseAdminClient();
    initializeTestDeps();

    const { userId: u1Id, userClient: u1Client } = await coreCreateAndSetupTestUser(
      { first_name: 'User1 ContribRLS' }, 'global'
    );
    user1Id = u1Id;
    userClient1 = u1Client;

    const { userId: u2Id, userClient: u2Client } = await coreCreateAndSetupTestUser(
      { first_name: 'User2 ContribRLS' }, 'global'
    );
    user2Id = u2Id;
    userClient2 = u2Client;

    const { data: p1u1, error: p1u1Error } = await adminClient
      .from("dialectic_projects")
      .insert({ user_id: user1Id, project_name: "U1 RLSContribP", initial_user_prompt: "Test U1P1 for Contrib" })
      .select("id").single();
    if (p1u1Error) throw p1u1Error;
    assertExists(p1u1);
    project1User1Id = p1u1.id;
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_projects', criteria: { id: project1User1Id }, scope: 'global' });

    const { data: s1p1u1, error: s1p1u1Error } = await adminClient
      .from("dialectic_sessions")
      .insert({ project_id: project1User1Id, session_description: "U1S1 RLSContribS" })
      .select("id").single();
    if (s1p1u1Error) throw s1p1u1Error;
    assertExists(s1p1u1);
    session1Project1User1Id = s1p1u1.id;
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: session1Project1User1Id }, scope: 'global' });

    const { data: p1u2, error: p1u2Error } = await adminClient
      .from("dialectic_projects")
      .insert({ user_id: user2Id, project_name: "U2 RLSContribP", initial_user_prompt: "Test U2P1 for Contrib" })
      .select("id").single();
    if (p1u2Error) throw p1u2Error;
    assertExists(p1u2);
    project1User2Id = p1u2.id;
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_projects', criteria: { id: project1User2Id }, scope: 'global' });

    const { data: s1p1u2, error: s1p1u2Error } = await adminClient
      .from("dialectic_sessions")
      .insert({ project_id: project1User2Id, session_description: "U2S1 RLSContribS" })
      .select("id").single();
    if (s1p1u2Error) throw s1p1u2Error;
    assertExists(s1p1u2);
    session1Project1User2Id = s1p1u2.id;
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: session1Project1User2Id }, scope: 'global' });

  afterAll(async () => {
    await coreCleanupTestResources('all');
    await coreTeardown();
  });

  beforeEach(async () => {
    const { anonClient } = await coreInitializeTestStep({}, 'local');
    currentAnonClient = anonClient;
  });

  afterEach(async () => { 
    await coreCleanupTestResources('local');
  });
  
  type ContributionPayload = Database["public"]["Tables"]["dialectic_contributions"]["Insert"];

  const getDummyContributionPayload = (sessionId: string): Omit<ContributionPayload, 'id' | 'created_at' | 'updated_at'> => ({
      session_id: sessionId,
      stage: "thesis",
      storage_path: `test/contributions/${crypto.randomUUID()}.md`,
  });

  it("User can create a contribution for a session in their own project", async () => {
    const payload = getDummyContributionPayload(session1Project1User1Id);
    const { data, error } = await userClient1
      .from("dialectic_contributions")
      .insert(payload)
      .select("id, session_id")
      .single();
    assert(!error, `Insert failed: ${error?.message}`);
    assertExists(data);
    assertEquals(data.session_id, session1Project1User1Id);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_contributions', criteria: { id: data.id }, scope: 'local' });
  });

  it("User cannot create a contribution for a session in another user's project", async () => {
    const payload = getDummyContributionPayload(session1Project1User2Id);
    const { data, error, status } = await userClient1 
      .from("dialectic_contributions")
      .insert(payload);
    
    console.log("DEBUG CANNOT CREATE CONTRIBUTION:", { data, error, status });
    assertExists(error, "Expected RLS error when creating contribution on another user's session.");
    assertEquals(status, 403, "Expected HTTP 403 Forbidden for RLS insert violation.");
    if (error) {
      assert(error.message.includes("violates row-level security policy"), "Error message should indicate RLS violation.");
    }
  });

  it("User can read contributions for sessions in their own projects", async () => {
    const payload = getDummyContributionPayload(session1Project1User1Id, dummySessionModelId);
    const { data: c1, error: c1Error } = await adminClient
      .from("dialectic_contributions")
      .insert(payload)
      .select("id, session_id")
      .single();
    if (c1Error) throw c1Error;
    assertExists(c1);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_contributions', criteria: { id: c1.id }, scope: 'local' });

    const { data, error } = await userClient1
      .from("dialectic_contributions")
      .select("*")
      .eq("id", c1.id);
    assert(!error, `Read failed: ${error?.message}`);
    assertEquals(data?.length, 1);
    assertEquals(data?.[0].id, c1.id);
  });

  it("User cannot read contributions for sessions in another user's projects", async () => {
    const payload = getDummyContributionPayload(session1Project1User2Id, dummySessionModelId);
    const { data: c2, error: c2Error } = await adminClient
      .from("dialectic_contributions")
      .insert(payload)
      .select("id, session_id")
      .single();
    if (c2Error) throw c2Error;
    assertExists(c2);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_contributions', criteria: { id: c2.id }, scope: 'local' });

    const { data, error } = await userClient1 
      .from("dialectic_contributions")
      .select("*")
      .eq("id", c2.id);
    assert(!error, "Select should not error but return empty due to RLS");
    assertEquals(data?.length, 0);
  });

  it("User can update contributions for sessions in their own projects", async () => {
    const payload = getDummyContributionPayload(session1Project1User1Id, dummySessionModelId);
    const { data: c1, error: c1Error } = await userClient1 
      .from("dialectic_contributions")
      .insert(payload)
      .select("id, session_id, content_storage_path")
      .single();
    if (c1Error) throw c1Error;
    assertExists(c1);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_contributions', criteria: { id: c1.id }, scope: 'local' });

    const newPath = `test/path/updated_${crypto.randomUUID()}.md`;
    const { data: updatedData, error: updateError } = await userClient1
      .from("dialectic_contributions")
      .update({ content_storage_path: newPath })
      .eq("id", c1.id)
      .select().single();
    assert(!updateError, `Update failed: ${updateError?.message}`);
    assertExists(updatedData);
    assertEquals(updatedData.content_storage_path, newPath);
  });

  it("User cannot update contributions for sessions in another user's projects", async () => {
    const payload = getDummyContributionPayload(session1Project1User2Id, dummySessionModelId);
    const { data: c2, error: c2Error } = await adminClient 
      .from("dialectic_contributions")
      .insert(payload)
      .select("id, session_id, content_storage_path")
      .single();
    if (c2Error) throw c2Error;
    assertExists(c2);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_contributions', criteria: { id: c2.id }, scope: 'local' });

    const originalContentPath = c2.content_storage_path;

    const { data: updateAttemptData, error: updateAttemptError, status: updateAttemptStatus } = await userClient1 
      .from("dialectic_contributions")
      .update({ content_storage_path: "trespass.md" })
      .eq("id", c2.id);
    
    console.log("DEBUG CANNOT UPDATE CONTRIBUTION:", { updateAttemptData, updateAttemptError, updateAttemptStatus });
    assertEquals(updateAttemptError, null, "Expected no explicit error for RLS-blocked update resulting in 0 rows affected.");
    assertEquals(updateAttemptStatus, 204, "Expected HTTP 204 No Content for RLS-blocked update.");

    const { data: verifyData, error: verifyError } = await adminClient
      .from("dialectic_contributions")
      .select("content_storage_path")
      .eq("id", c2.id)
      .single();
    assert(!verifyError, `Admin client verification select failed: ${verifyError?.message}`);
    assertEquals(verifyData?.content_storage_path, originalContentPath, "Content path should not have changed.");
  });

  it("User can delete contributions for sessions in their own projects", async () => {
    const payload = getDummyContributionPayload(session1Project1User1Id, dummySessionModelId);
    const { data: c1, error: c1Error } = await userClient1 
      .from("dialectic_contributions")
      .insert(payload)
      .select("id, session_id")
      .single();
    if (c1Error) throw c1Error;

    const { error: deleteError } = await userClient1
      .from("dialectic_contributions")
      .delete()
      .eq("id", c1.id);
    assert(!deleteError, `Delete failed: ${deleteError?.message}`);
    
    const { data: verifyData, error: verifyErr } = await userClient1
        .from("dialectic_contributions").select("id").eq("id", c1.id).maybeSingle();
    assert(!verifyErr);
    assertEquals(verifyData, null);
  });

  it("User cannot delete contributions for sessions in another user's projects", async () => {
    const payload = getDummyContributionPayload(session1Project1User2Id, dummySessionModelId);
    const { data: c2, error: c2Error } = await adminClient 
      .from("dialectic_contributions")
      .insert(payload)
      .select("id, session_id")
      .single();
    if (c2Error) throw c2Error;
    assertExists(c2);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_contributions', criteria: { id: c2.id }, scope: 'local' });

    const { data: deleteAttemptData, error: deleteAttemptError, status: deleteAttemptStatus } = await userClient1
        .from("dialectic_contributions")
        .delete()
        .eq("id", c2.id);
    console.log("DEBUG CANNOT DELETE CONTRIBUTION:", { deleteAttemptData, deleteAttemptError, deleteAttemptStatus });
    assertEquals(deleteAttemptError, null, "Expected no explicit error for RLS-blocked delete resulting in 0 rows affected.");
    assertEquals(deleteAttemptStatus, 204, "Expected HTTP 204 No Content for RLS-blocked delete.");

    // Admin client verification
    const { data: verifyData, error: verifyError } = await adminClient
      .from("dialectic_contributions")
      .select("id")
      .eq("id", c2.id)
      .maybeSingle(); // Use maybeSingle as the row should exist
    assert(!verifyError, `Admin client verification select failed: ${verifyError?.message}`);
    assertExists(verifyData, "Row should still exist when checked by admin after RLS-blocked delete.");
  });

  it("Unauthenticated user cannot read contributions", async () => {
    const payload = getDummyContributionPayload(session1Project1User1Id, dummySessionModelId);
    const { data: c1, error: c1Error } = await adminClient
      .from("dialectic_contributions")
      .insert(payload)
      .select("id, session_id").single();
    if (c1Error) throw c1Error;
    assertExists(c1);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_contributions', criteria: { id: c1.id }, scope: 'local' });

    const unauthedClient = currentAnonClient;
    const { data, error } = await unauthedClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", c1.id);
    assert(!error, "Anon select should not error, but return empty due to RLS");
    assertEquals(data?.length, 0);
  });
}); 