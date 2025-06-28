import { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
    describe, 
    it, 
    beforeAll, 
    afterAll,
    beforeEach
} from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import {
    assertExists,
    assertEquals,
    assertNotEquals,
    assertThrows
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { Database } from '../../functions/types_db.ts'; 
import {
    initializeSupabaseAdminClient,
    coreCreateAndSetupTestUser,
    // getTableColumns, // Placeholder for future direct schema checks if needed
    // getTableConstraints // Placeholder
} from '../../functions/chat/_integration.test.utils.ts';

describe('Integration Test: dialectic_session_models table and migrations', () => {
    let supabase: SupabaseClient<Database>;
    let testUserId: string;
    let testProjectId: string;
    let testSessionId: string;

    beforeAll(async () => {
        supabase = initializeSupabaseAdminClient();
        testUserId = await coreCreateAndSetupTestUser();

        // Create a project
        const { data: projectData, error: projectError } = await supabase
            .from('dialectic_projects')
            .insert({ project_name: 'Test Project for Session Models', initial_user_prompt: 'Test prompt', user_id: testUserId })
            .select()
            .single();
        assertEquals(projectError, null, `Project creation error: ${projectError?.message}`);
        assertExists(projectData);
        testProjectId = projectData.id;
    });

    beforeEach(async () => {
        // Create a new session for each test to ensure isolation for unique constraint tests
        const { data: sessionData, error: sessionError } = await supabase
            .from('dialectic_sessions')
            .insert({ project_id: testProjectId, session_description: 'Test Session for Models' })
            .select()
            .single();
        assertEquals(sessionError, null, `Session creation error: ${sessionError?.message}`);
        assertExists(sessionData);
        testSessionId = sessionData.id;
    });

    afterAll(async () => {
        if (testProjectId) {
            await supabase.from('dialectic_projects').delete().eq('id', testProjectId); // Sessions and session_models will cascade
        }
        if (testUserId) {
            await supabase.auth.admin.deleteUser(testUserId);
        }
    });

    it('1. Should create a dialectic_session_model linked to a session', async () => {
        const modelId = 'openai/gpt-4-test';
        const { data, error } = await supabase
            .from('dialectic_session_models')
            .insert({ session_id: testSessionId, model_id: modelId, model_role: 'test_role' })
            .select()
            .single();
        
        assertEquals(error, null, `Insert error: ${error?.message}`);
        assertExists(data);
        assertEquals(data.session_id, testSessionId);
        assertEquals(data.model_id, modelId);
        assertEquals(data.model_role, 'test_role');
        assertExists(data.created_at);
        assertExists(data.id);

        // Cleanup this specific record for other tests if needed, or rely on beforeEach new session
        await supabase.from('dialectic_session_models').delete().eq('id', data.id);
    });

    it('2. Should enforce UNIQUE constraint on (session_id, model_id)', async () => {
        const modelId = 'openai/gpt-unique-test';
        const firstInsert = await supabase
            .from('dialectic_session_models')
            .insert({ session_id: testSessionId, model_id: modelId })
            .select('id')
            .single();
        assertEquals(firstInsert.error, null, `First insert error: ${firstInsert.error?.message}`);
        assertExists(firstInsert.data);

        const { error: secondInsertError } = await supabase
            .from('dialectic_session_models')
            .insert({ session_id: testSessionId, model_id: modelId }); // Attempt duplicate

        assertExists(secondInsertError, 'Expected error on duplicate insert but got none.');
        assertEquals(secondInsertError.code, '23505'); // Standard PostgreSQL code for unique_violation

        // Cleanup
        await supabase.from('dialectic_session_models').delete().eq('id', firstInsert.data.id);
    });

    it('3. Should CASCADE DELETE when a dialectic_session is deleted', async () => {
        const modelId = 'openai/gpt-cascade-test';
        const { data: modelData, error: insertError } = await supabase
            .from('dialectic_session_models')
            .insert({ session_id: testSessionId, model_id: modelId })
            .select('id')
            .single();
        assertEquals(insertError, null, `Insert error: ${insertError?.message}`);
        assertExists(modelData);
        const sessionModelId = modelData.id;

        // Delete the parent session
        const { error: deleteSessionError } = await supabase
            .from('dialectic_sessions')
            .delete()
            .eq('id', testSessionId);
        assertEquals(deleteSessionError, null, `Session deletion error: ${deleteSessionError?.message}`);

        // Verify the session_model is also deleted
        const { data: verifyData, error: verifyError } = await supabase
            .from('dialectic_session_models')
            .select('id')
            .eq('id', sessionModelId)
            .single();
        
        assertNotEquals(verifyError, null, 'Expected an error when trying to select a cascade-deleted record, but got data.');
        // Deno Supabase client might return an error with a specific code or just null data for not found
        // For instance, if using .single() and no row is found, error is typically null and data is null.
        // A more robust check here would be if error.code is 'PGRST116' (Not Found) or simply data is null.
        assertEquals(verifyData, null, 'Expected session model to be null after cascade delete.');
        if (verifyError) {
             assertEquals(verifyError.code, 'PGRST116', 'Expected PGRST116 (Not Found) error, but got a different error.');
        }
    });

    // Placeholder for future schema validation tests using getTableColumns/getTableConstraints
    // it('4. Should have correct column definitions and types', async () => {
    //     const columns = await getTableColumns(supabase, 'dialectic_session_models');
    //     // Add assertions for column names, types, nullability, defaults
    //     const idCol = columns.find(c => c.column_name === 'id');
    //     assertEquals(idCol?.data_type, 'uuid');
    //     assertEquals(idCol?.is_nullable, 'NO');

    //     const sessionIdCol = columns.find(c => c.column_name === 'session_id');
    //     assertEquals(sessionIdCol?.data_type, 'uuid');
    //     assertEquals(sessionIdCol?.is_nullable, 'NO');

    //     const modelIdCol = columns.find(c => c.column_name === 'model_id');
    //     assertEquals(modelIdCol?.data_type, 'text');
    //     assertEquals(modelIdCol?.is_nullable, 'NO');

    //     const modelRoleCol = columns.find(c => c.column_name === 'model_role');
    //     assertEquals(modelRoleCol?.data_type, 'text');
    //     assertEquals(modelRoleCol?.is_nullable, 'YES');
        
    //     const createdAtCol = columns.find(c => c.column_name === 'created_at');
    //     assertEquals(createdAtCol?.data_type, 'timestamp with time zone');
    //     assertEquals(createdAtCol?.is_nullable, 'NO');
    // });

    // it('5. Should have correct constraints (FKs, PK, UNIQUE)', async () => {
    //     const constraints = await getTableConstraints(supabase, 'dialectic_session_models');
    //     // Add assertions for primary key, foreign keys (name, target table/column, on delete action), unique constraints
    //     const pk = constraints.find(c => c.constraint_type === 'PRIMARY KEY');
    //     assertExists(pk);
    //     assertEquals(pk.constrained_columns, ['id']);

    //     const fkSession = constraints.find(c => c.constraint_name === 'dialectic_session_models_session_id_fkey'); // Name might vary
    //     assertExists(fkSession);
    //     assertEquals(fkSession.constraint_type, 'FOREIGN KEY');
    //     assertEquals(fkSession.foreign_table_name, 'dialectic_sessions');
    //     // ON DELETE CASCADE is harder to check directly via information_schema without specific pg_constraint queries.

    //     const uniqueConstraint = constraints.find(c => c.constraint_type === 'UNIQUE' && c.constrained_columns.includes('session_id') && c.constrained_columns.includes('model_id'));
    //     assertExists(uniqueConstraint);
    // });
}); 