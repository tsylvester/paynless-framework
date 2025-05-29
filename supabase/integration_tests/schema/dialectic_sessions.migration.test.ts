import { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
    describe, 
    it, 
    beforeAll, 
    afterAll 
} from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import {
    assertExists,
    assertEquals,
    assertNotEquals,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts'; // Using Deno standard asserts
import { Database } from '../../functions/types_db.ts'; 
// import { v4 as uuidv4 } from 'https://deno.land/std@0.208.0/uuid/mod.ts'; // Removed UUID import, will use crypto.randomUUID()
import {
    initializeSupabaseAdminClient, 
    coreCreateAndSetupTestUser 
} from '../../functions/chat/_integration.test.utils.ts';

describe('Integration Test: dialectic_sessions table and migrations', () => {
    let supabase: SupabaseClient<Database>;
    let testProjectId: string;
    let testUserId: string;
    let testSystemPromptId: string;
    let testSessionId: string;

    beforeAll(async () => {
        supabase = initializeSupabaseAdminClient(); 
        
        // 1. Create a dummy user using the utility function
        try {
            testUserId = await coreCreateAndSetupTestUser();
        } catch (error) {
            console.error('Error creating test user via utility:', error);
            throw error; // Fail fast if user creation fails
        }
        assertExists(testUserId);

        // 2. Create a dummy system_prompt
        const { data: promptData, error: promptError } = await supabase
            .from('system_prompts')
            .insert({
                name: `test-prompt-for-session-${crypto.randomUUID()}`, 
                prompt_text: 'Test prompt content',
                is_active: true,
                is_stage_default: false,
                version: 1,
            })
            .select()
            .single();
        if (promptError) console.error('Error creating test system_prompt:', promptError);
        assertEquals(promptError, null); 
        assertExists(promptData);
        testSystemPromptId = promptData!.id;

        // 3. Create a dummy dialectic_project linked to the test user
        const { data: projectData, error: projectError } = await supabase
            .from('dialectic_projects')
            .insert({
                project_name: `Test Project for Session ${crypto.randomUUID()}`, 
                initial_user_prompt: 'Test initial prompt',
                user_id: testUserId, // Use the created test user's ID
            })
            .select()
            .single();
        if (projectError) console.error('Error creating test dialectic_project:', projectError);
        assertEquals(projectError, null); 
        assertExists(projectData);
        testProjectId = projectData!.id;
    });

    it('1. Should create a new dialectic_session', async () => {
        const newSessionData = {
            project_id: testProjectId,
            session_description: 'Test session description',
            current_stage_seed_prompt: 'Test seed prompt for stage',
            iteration_count: 1,
            active_thesis_prompt_template_id: testSystemPromptId,
            active_antithesis_prompt_template_id: testSystemPromptId,
            status: 'pending_thesis',
        } as Database['public']['Tables']['dialectic_sessions']['Insert'];

        const { data, error } = await supabase
            .from('dialectic_sessions') 
            .insert(newSessionData)
            .select()
            .single();

        if (error) console.error('Create session error:', error);
        assertEquals(error, null);
        assertExists(data);
        assertEquals(data!.project_id, testProjectId);
        assertEquals(data!.session_description, 'Test session description');
        testSessionId = data!.id;
    });

    it('2. Should read a dialectic_session', async () => {
        const { data, error } = await supabase
            .from('dialectic_sessions') 
            .select('*')
            .eq('id', testSessionId)
            .single();

        assertEquals(error, null);
        assertExists(data);
        assertEquals(data!.id, testSessionId);
        assertEquals(data!.active_thesis_prompt_template_id, testSystemPromptId);
    });

    it('3. Should update a dialectic_session', async () => {
        const updatedDetails = {
            session_description: 'Updated session description',
            status: 'thesis_complete',
        };
        const { data, error } = await supabase
            .from('dialectic_sessions') 
            .update(updatedDetails)
            .eq('id', testSessionId)
            .select()
            .single();

        if (error) console.error('Update session error:', error);
        assertEquals(error, null);
        assertExists(data);
        assertEquals(data!.session_description, 'Updated session description');
        assertEquals(data!.status, 'thesis_complete');
    });

    it('4. Should delete a dialectic_session', async () => {
        const { error } = await supabase
            .from('dialectic_sessions') 
            .delete()
            .eq('id', testSessionId);

        assertEquals(error, null);

        const { data: verifyData, error: verifyError } = await supabase
            .from('dialectic_sessions') 
            .select('id')
            .eq('id', testSessionId)
            .single();
        
        assertExists(verifyError);
        assertEquals(verifyData, null);
    });

    it('5. Cascade delete from dialectic_projects should delete related dialectic_sessions', async () => {
        const { data: newProjectData, error: newProjectError } = await supabase
            .from('dialectic_projects')
            .insert({ project_name: `Project for Cascade Test ${crypto.randomUUID()}`, initial_user_prompt: 'Cascade test', user_id: testUserId }) // Using crypto.randomUUID()
            .select()
            .single();
        assertEquals(newProjectError, null);
        const newProjectId = newProjectData!.id;

        const newSessionForCascade = {
            project_id: newProjectId, 
            session_description: 'Session for cascade test'
        } as Database['public']['Tables']['dialectic_sessions']['Insert'];

        const { data: newSessionData, error: newSessionError } = await supabase
            .from('dialectic_sessions') 
            .insert(newSessionForCascade)
            .select()
            .single();
        assertEquals(newSessionError, null);
        const newSessionId = newSessionData!.id;

        const { error: deleteProjectError } = await supabase
            .from('dialectic_projects')
            .delete()
            .eq('id', newProjectId);
        assertEquals(deleteProjectError, null);

        const { data: verifySession, error: verifySessionError } = await supabase
            .from('dialectic_sessions') 
            .select('id')
            .eq('id', newSessionId)
            .single();
        assertExists(verifySessionError); 
        assertEquals(verifySession, null);
    });

    it('6. Deleting a system_prompt should set FKs in dialectic_sessions to NULL', async () => {
        const { data: newPrompt, error: newPromptErr } = await supabase
            .from('system_prompts')
            .insert({ name: `deletable-prompt-${crypto.randomUUID()}`, prompt_text: 'deletable', is_active: true, is_stage_default: false, version: 1 }) // Using crypto.randomUUID()
            .select()
            .single();
        assertEquals(newPromptErr, null);
        const deletablePromptId = newPrompt!.id;

        const sessionWithDeletablePrompt = {
            project_id: testProjectId,
            active_thesis_prompt_template_id: deletablePromptId,
            active_antithesis_prompt_template_id: deletablePromptId,
        } as Database['public']['Tables']['dialectic_sessions']['Insert'];

        const { data: sessionWithPrompt, error: sessionErr } = await supabase
            .from('dialectic_sessions') 
            .insert(sessionWithDeletablePrompt)
            .select()
            .single();
        assertEquals(sessionErr, null);
        const sessionWithPromptId = sessionWithPrompt!.id;

        const { error: deletePromptErr } = await supabase
            .from('system_prompts')
            .delete()
            .eq('id', deletablePromptId);
        assertEquals(deletePromptErr, null);

        const { data: updatedSession, error: updatedSessionErr } = await supabase
            .from('dialectic_sessions') 
            .select('active_thesis_prompt_template_id, active_antithesis_prompt_template_id')
            .eq('id', sessionWithPromptId)
            .single();
        assertEquals(updatedSessionErr, null);
        assertExists(updatedSession);
        assertEquals(updatedSession!.active_thesis_prompt_template_id, null);
        assertEquals(updatedSession!.active_antithesis_prompt_template_id, null);
        
        await supabase.from('dialectic_sessions').delete().eq('id', sessionWithPromptId);
    });

    afterAll(async () => { 
        if (testProjectId) {
            //dialect_sessions are cascade deleted by project deletion
            await supabase.from('dialectic_projects').delete().eq('id', testProjectId);
        }
        if (testSystemPromptId) {
            await supabase.from('system_prompts').delete().eq('id', testSystemPromptId);
        }
        if (testUserId) {
            // Ensure supabase client is available for cleanup, initialize if somehow not set
            if (!supabase) {
                supabase = initializeSupabaseAdminClient();
            }
            const { error: userDeleteError } = await supabase.auth.admin.deleteUser(testUserId);
            if (userDeleteError) {
                // Log common issue with user deletion if it happens
                if (userDeleteError.message.includes("User not found")) {
                    console.warn(`Test user ${testUserId} already deleted or not found during cleanup.`);
                } else {
                    console.error('Error deleting test user:', userDeleteError);
                }
            }
        }
    });
}); 