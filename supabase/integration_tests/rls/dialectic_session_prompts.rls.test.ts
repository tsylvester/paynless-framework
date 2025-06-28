import { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { Database } from '../../functions/types_db.ts';
import {
  describe,
  it,
  beforeAll,
  afterAll,
} from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { expect } from 'https://deno.land/x/expect@v0.3.0/mod.ts';
import {
  coreInitializeTestStep,
  coreCreateAndSetupTestUser,
  coreCleanupTestResources,
  registerUndoAction,
  // We might not need supabaseAdmin directly if coreInitializeTestStep provides it
} from '../../functions/_shared/_integration.test.utils.ts';

describe('RLS: dialectic_session_prompts', () => {
  let adminClient: SupabaseClient<Database>;
  let anonClient: SupabaseClient<Database>;
  let user1Client: SupabaseClient<Database>;
  let user1Id: string;
  let user2Client: SupabaseClient<Database>;
  let user2Id: string;

  let project1User1Id: string;
  let session1User1Id: string;
  let project1User2Id: string;
  let session1User2Id: string;
  
  // let systemPromptId: string | null = null; // If needed for tests

  let prompt1User1Id: string; // To store ID of a prompt created by user1
  let prompt2User2Id: string; // Declare here for wider scope

  beforeAll(async () => {
    const setupResult = await coreInitializeTestStep({
      userProfile: { role: 'user', first_name: 'RLS User One' },
    });
    adminClient = setupResult.adminClient;
    anonClient = setupResult.anonClient;
    user1Client = setupResult.primaryUserClient;
    user1Id = setupResult.primaryUserId;

    const user2Setup = await coreCreateAndSetupTestUser(
      { role: 'user', first_name: 'RLS User Two' },
      'local'
    );
    user2Id = user2Setup.userId;
    user2Client = user2Setup.userClient;

    // Create project and session for User 1
    const { data: proj1, error: proj1Err } = await adminClient
      .from('dialectic_projects')
      .insert({ user_id: user1Id, project_name: 'User1 RLS Project', initial_user_prompt: 'U1 Test' })
      .select('id')
      .single();
    expect(proj1Err).toBeNull();
    expect(proj1).toBeDefined();
    project1User1Id = proj1!.id;
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_projects', criteria: { id: project1User1Id }, scope: 'local' });

    const { data: sess1, error: sess1Err } = await adminClient
      .from('dialectic_sessions')
      .insert({ project_id: project1User1Id, session_description: 'User1 RLS Session', status: 'pending_thesis' })
      .select('id')
      .single();
    expect(sess1Err).toBeNull();
    expect(sess1).toBeDefined();
    session1User1Id = sess1!.id;
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: session1User1Id }, scope: 'local' });

    // Create project and session for User 2
    const { data: proj2, error: proj2Err } = await adminClient
      .from('dialectic_projects')
      .insert({ user_id: user2Id, project_name: 'User2 RLS Project', initial_user_prompt: 'U2 Test' })
      .select('id')
      .single();
    expect(proj2Err).toBeNull();
    expect(proj2).toBeDefined();
    project1User2Id = proj2!.id;
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_projects', criteria: { id: project1User2Id }, scope: 'local' });

    const { data: sess2, error: sess2Err } = await adminClient
      .from('dialectic_sessions')
      .insert({ project_id: project1User2Id, session_description: 'User2 RLS Session', status: 'pending_thesis' })
      .select('id')
      .single();
    expect(sess2Err).toBeNull();
    expect(sess2).toBeDefined();
    session1User2Id = sess2!.id;
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: session1User2Id }, scope: 'local' });

    // Optional: Create a shared system_prompt if FK is NOT NULL or tests depend on it
    // const { data: sysPrompt, error: sysPromptErr } = await adminClient.from('system_prompts').insert({name: 'RLS Test Prompt', prompt_text: 'Test'}).select('id').single();
    // expect(sysPromptErr).toBeNull(); systemPromptId = sysPrompt!.id;
    // registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'system_prompts', criteria: { id: systemPromptId }, scope: 'local' });
  });

  afterAll(async () => {
    await coreCleanupTestResources('local');
  });

  describe('INSERT operations', () => {
    it('User can INSERT a prompt into their own session', async () => {
      const { data, error } = await user1Client
        .from('dialectic_session_prompts')
        .insert({
          session_id: session1User1Id,
          // system_prompt_id: systemPromptId, 
          stage_association: 'thesis_rls',
          rendered_prompt_text: 'User 1 RLS thesis prompt',
          iteration_number: 1,
        })
        .select()
        .single();
      expect(error).toBeNull();
      expect(data).toBeDefined();
      prompt1User1Id = data!.id; // Save for later tests
       // No need to register undo for this, as RLS tests assume user can delete, or afterAll cleans projects/sessions which cascades.
       // However, if we want to be explicit for this specific prompt:
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_session_prompts', criteria: { id: prompt1User1Id }, scope: 'local' });
    });

    it('User cannot INSERT a prompt into another user\'s session', async () => {
      const { data, error } = await user1Client // User 1 trying
        .from('dialectic_session_prompts')
        .insert({
          session_id: session1User2Id, // User 2's session
          stage_association: 'thesis_rls_breach',
          rendered_prompt_text: 'User 1 trying to write to User 2 session',
        })
        .select()
        .single();
      expect(error).toBeDefined(); // RLS should prevent this
      expect(data).toBeNull();
      // Check for specific RLS error message if known, e.g. "permission denied for table dialectic_session_prompts"
      // expect(error?.message).toContain('permission denied'); 
    });

    it('Anonymous user cannot INSERT a prompt', async () => {
        const { data, error } = await anonClient
          .from('dialectic_session_prompts')
          .insert({
            session_id: session1User1Id,
            stage_association: 'anon_thesis',
            rendered_prompt_text: 'Anon trying to write',
          })
          .select()
          .single();
        expect(error).toBeDefined();
        expect(data).toBeNull();
      });
  });

  describe('SELECT operations', () => {
    beforeAll(async () => { // Create a prompt for user2 to test SELECT RLS
        const { data, error } = await adminClient // use admin to ensure creation
          .from('dialectic_session_prompts')
          .insert({
            session_id: session1User2Id,
            stage_association: 'select_test_u2',
            rendered_prompt_text: 'User 2 prompt for select testing',
          })
          .select('id')
          .single();
        expect(error).toBeNull();
        expect(data).toBeDefined();
        prompt2User2Id = data!.id;
        registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_session_prompts', criteria: { id: prompt2User2Id }, scope: 'local' });
    });
    
    it('User can SELECT their own session prompts', async () => {
      const { data, error } = await user1Client
        .from('dialectic_session_prompts')
        .select('*')
        .eq('id', prompt1User1Id)
        .single();
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.id).toBe(prompt1User1Id);
    });

    it('User cannot SELECT another user\'s session prompts', async () => {
      const { data, error } = await user1Client // User 1 trying
        .from('dialectic_session_prompts')
        .select('*')
        .eq('id', prompt2User2Id) // User 2's prompt
        .maybeSingle(); // Use maybeSingle as RLS might return 0 rows cleanly
      expect(error).toBeNull(); // RLS usually doesn't error on SELECT, just returns no rows
      expect(data).toBeNull();
    });

    it('Anonymous user cannot SELECT any session prompts', async () => {
        const { data, error } = await anonClient
          .from('dialectic_session_prompts')
          .select('*')
          .eq('id', prompt1User1Id)
          .maybeSingle();
        expect(error).toBeNull();
        expect(data).toBeNull();
      });
  });

  describe('UPDATE operations', () => {
    // prompt1User1Id is available from INSERT tests
    // prompt2User2Id is available from SELECT tests' beforeAll
    
    it('User can UPDATE their own session prompts', async () => {
      const newText = 'User 1 updated RLS prompt text';
      const { data, error } = await user1Client
        .from('dialectic_session_prompts')
        .update({ rendered_prompt_text: newText })
        .eq('id', prompt1User1Id)
        .select()
        .single();
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.rendered_prompt_text).toBe(newText);
    });

    it('User cannot UPDATE another user\'s session prompts', async () => {
      const newText = 'User 1 malicious update on User 2 prompt';
      const { data, error } = await user1Client // User 1 trying
        .from('dialectic_session_prompts')
        .update({ rendered_prompt_text: newText })
        .eq('id', prompt2User2Id) // User 2's prompt
        .select()
        .maybeSingle(); // If RLS USING filters rows, 0 rows updated, data is null
      expect(error).toBeNull(); // Update on 0 rows is not an error
      expect(data).toBeNull(); 
    });
  });

  describe('DELETE operations', () => {
    // prompt1User1Id is available
    // prompt2User2Id is available
    let promptToDeleteUser1Id: string;

    beforeAll(async () => { // Create a fresh prompt for user1 to delete, to not interfere with other tests if run selectively
        const { data, error } = await user1Client
            .from('dialectic_session_prompts')
            .insert({ session_id: session1User1Id, stage_association: 'delete_test_u1', rendered_prompt_text: 'Prompt to be deleted by U1'})
            .select('id').single();
        expect(error).toBeNull();
        expect(data).toBeDefined();
        promptToDeleteUser1Id = data!.id;
        // This one will be deleted by the test itself, so explicit undo might be redundant if test passes.
        // If test fails, afterAll's cleanup of session/project should cascade.
        // For safety during test dev, can add:
        registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_session_prompts', criteria: { id: promptToDeleteUser1Id }, scope: 'local' });
    });
    
    it('User can DELETE their own session prompts', async () => {
      const { count, error } = await user1Client
        .from('dialectic_session_prompts')
        .delete()
        .eq('id', promptToDeleteUser1Id);
      expect(error).toBeNull();
      expect(count).toBe(1); // Ensure one row was actually deleted

      // Verify it's gone
      const { data: verifyData, error: verifyError } = await adminClient
        .from('dialectic_session_prompts')
        .select('id')
        .eq('id', promptToDeleteUser1Id)
        .maybeSingle();
      expect(verifyError).toBeNull();
      expect(verifyData).toBeNull();
    });

    it('User cannot DELETE another user\'s session prompts', async () => {
      const { count, error } = await user1Client // User 1 trying
        .from('dialectic_session_prompts')
        .delete()
        .eq('id', prompt2User2Id); // User 2's prompt
      expect(error).toBeNull(); // Delete on 0 rows matching RLS is not an error
      expect(count).toBe(0);

      // Verify User 2's prompt still exists
      const { data: verifyData, error: verifyError } = await adminClient
        .from('dialectic_session_prompts')
        .select('id')
        .eq('id', prompt2User2Id)
        .single();
      expect(verifyError).toBeNull();
      expect(verifyData).toBeDefined();
    });
  });
}); 