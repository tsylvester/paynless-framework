import { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { expect } from 'https://deno.land/x/expect@v0.3.0/mod.ts';
import {
  coreInitializeTestStep,
  coreCleanupTestResources,
  registerUndoAction, // Import for manual cleanup registration
  // We will get adminClient, primaryUserClient, primaryUserId from coreInitializeTestStep
  // supabaseAdminClient as adminClientFromUtil, // if we need it directly before init for some reason
  // testLogger, // if needed
} from '../_shared/_integration.test.utils.ts';
import type { Database } from '../types_db.ts';
// DialecticContribution is needed for casting the response
import type { DialecticContribution, SaveContributionEditPayload } from './dialectic.interface.ts';

// Define a local type for the test data we'll manage if not using TestProject etc.
interface TestSetupData {
  projectId: string;
  sessionId: string;
  aiContributionId: string;
  initialAiContribution: DialecticContributionSql; // Store the full initial record for assertions
}
// Helper type from Database for direct DB row manipulation
type DialecticContributionSql = Database['public']['Tables']['dialectic_contributions']['Row'];
type DialecticContributionInsert = Database['public']['Tables']['dialectic_contributions']['Insert'];

const SUPABASE_FUNCTION_URL = Deno.env.get('SUPABASE_URL') 
  ? `${Deno.env.get('SUPABASE_URL')}/functions/v1/dialectic-service` 
  : 'http://localhost:54321/functions/v1/dialectic-service'; // Fallback for local dev

describe('Dialectic Service Action: saveContributionEdit', () => {
  let adminClient: SupabaseClient<Database>;
  let primaryUserClient: SupabaseClient<Database>;
  let primaryUserId: string;
  let primaryUserJwt: string; // To store the JWT
  let secondaryUserClient: SupabaseClient<Database>;
  let secondaryUserId: string;
  let secondaryUserJwt: string;
  let testData: TestSetupData;

  beforeAll(async () => {
    // Setup global user, scope 'global' ensures it's cleaned by afterAll with 'all'
    const setupResult = await coreInitializeTestStep({}, 'global'); 
    adminClient = setupResult.adminClient;
    primaryUserClient = setupResult.primaryUserClient;
    primaryUserId = setupResult.primaryUserId;
    primaryUserJwt = setupResult.primaryUserJwt; // Store the JWT

    // Create a secondary user for auth tests
    const secondaryUserSetup = await coreInitializeTestStep(
        {},
        'global'
    );
    secondaryUserClient = secondaryUserSetup.primaryUserClient; // It's 'primary' from its own setup context
    secondaryUserId = secondaryUserSetup.primaryUserId;
    secondaryUserJwt = secondaryUserSetup.primaryUserJwt;
    // We register its cleanup with the main 'global' scope as well.
    // coreInitializeTestStep should handle registering the user for cleanup.
  });

  afterAll(async () => {
    await coreCleanupTestResources('all'); // Cleans up global and any remaining local resources
  });

  beforeEach(async () => {
    // 1. Create a project for the current test user
    const { data: project, error: projectError } = await adminClient
      .from('dialectic_projects')
      .insert({
        user_id: primaryUserId,
        project_name: 'Test Project for Edit',
        initial_user_prompt: 'Initial prompt for edit test',
        status: 'active',
      })
      .select()
      .single();
    if (projectError || !project) throw new Error(`Failed to create project: ${projectError?.message}`);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_projects', criteria: { id: project.id }, scope: 'local' });

    // 2. Create a session for that project
    const { data: session, error: sessionError } = await adminClient
      .from('dialectic_sessions')
      .insert({
        project_id: project.id,
        session_description: 'Test Session for Edit',
        stage: 'THESIS', // Corrected case
        status: 'active',
      })
      .select()
      .single();
    if (sessionError || !session) throw new Error(`Failed to create session: ${sessionError?.message}`);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: session.id }, scope: 'local' });

    // 3. Create an initial AI contribution in that session
    // @ts-ignore - Linter incorrectly flags user_id despite it being in DialecticContributionInsert
    const initialContributionData: DialecticContributionInsert = {
      session_id: session.id,
      stage: 'thesis',
      content_storage_path: `projects/${project.id}/sessions/${session.id}/it1/thesis/ai_initial.md`,
      user_id: null,
      model_id: null,
      model_name: 'TestGPT-Mock',
      iteration_number: 1,
      content_storage_bucket: 'dialectic_contributions_content',
      content_mime_type: 'text/markdown',
      content_size_bytes: 20,
      raw_response_storage_path: null,
      tokens_used_input: null,
      tokens_used_output: null,
      processing_time_ms: null,
      citations: null,
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      original_model_contribution_id: null,
      error: null,
      prompt_template_id_used: null,
      seed_prompt_url: null
    };
    const { data: aiContribution, error: contributionError } = await adminClient
      .from('dialectic_contributions')
      .insert(initialContributionData as any) // Cast to any to bypass persistent linter issue
      .select()
      .single();
    if (contributionError || !aiContribution) throw new Error(`Failed to create AI contribution: ${contributionError?.message}`);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_contributions', criteria: { id: aiContribution.id }, scope: 'local' });

    testData = {
      projectId: project.id,
      sessionId: session.id,
      aiContributionId: aiContribution.id,
      initialAiContribution: aiContribution as DialecticContributionSql,
    };
  });

  afterEach(async () => {
    await coreCleanupTestResources('local'); // Cleans up resources created in beforeEach with 'local' scope
  });

  it('should allow a user to edit their own AI contribution, creating a new version', async () => {
    const originalAIContributionId = testData.aiContributionId;
    const editedContent = 'This is the edited version of the AI content.';
    
    // Use the stored primaryUserJwt directly
    if (!primaryUserJwt) throw new Error("Test user JWT not available.");

    const requestPayload: { action: string; payload: SaveContributionEditPayload } = {
      action: 'saveContributionEdit',
      payload: {
        originalContributionIdToEdit: originalAIContributionId,
        editedContentText: editedContent,
      },
    };

    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${primaryUserJwt}`,
      },
      body: JSON.stringify(requestPayload),
    });

    const responseBody = await response.json();

    expect(response.status).toBe(201); // Expecting CREATED status
    expect(responseBody.error).toBeUndefined();
    expect(responseBody.data).toBeDefined();
    const editedContribution = responseBody.data as DialecticContribution;

    // 1. Verify new contribution record
    expect(editedContribution.id).not.toBe(originalAIContributionId);
    expect(editedContribution.stage).toBe(testData.initialAiContribution.stage);
    // @ts-ignore - Linter incorrectly flags edit_version if DialecticContribution interface is correct
    expect(editedContribution.edit_version).toBe(testData.initialAiContribution.edit_version + 1);
    expect(editedContribution.is_latest_edit).toBe(true);
    // original_model_contribution_id for an edit of a direct AI contribution should be the AI contribution's ID
    expect(editedContribution.original_model_contribution_id).toBe(originalAIContributionId);
    expect(editedContribution.user_id).toBe(primaryUserId);
    expect(editedContribution.content_storage_path).toMatch(/edits\/.+\/\d+_edit.md/); // Matches placeholder path structure

    // 2. Verify old (original AI) contribution record is updated
    const { data: originalAfterEditData, error: fetchOriginalError } = await adminClient
      .from('dialectic_contributions')
      .select('*') // Select all fields
      .eq('id', originalAIContributionId)
      .single();
    
    expect(fetchOriginalError).toBeNull();
    expect(originalAfterEditData).toBeDefined();
    // Cast to DialecticContributionSql to help TS understand the shape of originalAfterEditData
    const originalAfterEdit = originalAfterEditData as DialecticContributionSql;
    // @ts-ignore - Linter incorrectly flags is_latest_edit if DialecticContributionSql is correct
    expect(originalAfterEdit.is_latest_edit).toBe(false);
  });

  it('should return 403 when user tries to edit a contribution in a project not owned by them', async () => {
    const originalAIContributionId = testData.aiContributionId; // This contribution belongs to the primaryUser
    const editedContent = 'Attempting to edit content as a different user.';

    if (!secondaryUserJwt) throw new Error("Secondary user JWT not available.");

    const requestPayload: { action: string; payload: SaveContributionEditPayload } = {
      action: 'saveContributionEdit',
      payload: {
        originalContributionIdToEdit: originalAIContributionId,
        editedContentText: editedContent,
      },
    };

    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secondaryUserJwt}`, // Use secondary user's JWT
      },
      body: JSON.stringify(requestPayload),
    });

    const responseBody = await response.json();

    expect(response.status).toBe(403);
    expect(responseBody.error).toBe('Not authorized to edit this contribution.');
  });

  it('should return 404 when trying to edit a non-existent contribution', async () => {
    const nonExistentContributionId = crypto.randomUUID(); // Generate a random UUID
    const editedContent = 'Attempting to edit content of a non-existent contribution.';

    if (!primaryUserJwt) throw new Error("Primary user JWT not available.");

    const requestPayload: { action: string; payload: SaveContributionEditPayload } = {
      action: 'saveContributionEdit',
      payload: {
        originalContributionIdToEdit: nonExistentContributionId,
        editedContentText: editedContent,
      },
    };

    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${primaryUserJwt}`,
      },
      body: JSON.stringify(requestPayload),
    });

    const responseBody = await response.json();

    expect(response.status).toBe(404);
    expect(responseBody.error).toBe('Original contribution not found.');
  });

  it('should return 400 if originalContributionIdToEdit is missing', async () => {
    if (!primaryUserJwt) throw new Error("Primary user JWT not available.");

    const requestPayload: { action: string; payload: Partial<SaveContributionEditPayload> } = { // Use Partial to allow missing fields
      action: 'saveContributionEdit',
      payload: {
        // originalContributionIdToEdit is deliberately omitted
        editedContentText: 'Some content',
      },
    };

    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${primaryUserJwt}`,
      },
      body: JSON.stringify(requestPayload),
    });

    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe('originalContributionIdToEdit is required.');
  });

  it('should return 400 if editedContentText is missing', async () => {
    if (!primaryUserJwt) throw new Error("Primary user JWT not available.");

    const requestPayload: { action: string; payload: Partial<SaveContributionEditPayload> } = { // Use Partial to allow missing fields
      action: 'saveContributionEdit',
      payload: {
        originalContributionIdToEdit: testData.aiContributionId,
        // editedContentText is deliberately omitted
      },
    };

    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${primaryUserJwt}`,
      },
      body: JSON.stringify(requestPayload),
    });

    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe('editedContentText is required.');
  });

  it('should return 401 for an unauthenticated request', async () => {
    const requestPayload: { action: string; payload: SaveContributionEditPayload } = {
      action: 'saveContributionEdit',
      payload: {
        originalContributionIdToEdit: testData.aiContributionId, 
        editedContentText: 'Attempting an unauthenticated edit.',
      },
    };

    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Authorization header is deliberately omitted
      },
      body: JSON.stringify(requestPayload),
    });

    const responseBody = await response.json(); // Consume the response body

    // Note: The exact error body for a 401 might be generic from the Functions Gateway
    // So we primarily check the status code.
    expect(response.status).toBe(401);
  });

  it('should allow editing a previous user edit, correctly updating versions', async () => {
    const originalAIContributionId = testData.aiContributionId;
    if (!primaryUserJwt) throw new Error("Primary user JWT not available.");

    // 1. First User Edit (creates Version 2)
    const firstEditContent = "This is the first user edit (Version 2).";
    const firstEditPayload: { action: string; payload: SaveContributionEditPayload } = {
      action: 'saveContributionEdit',
      payload: {
        originalContributionIdToEdit: originalAIContributionId,
        editedContentText: firstEditContent,
      },
    };

    const firstEditResponse = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${primaryUserJwt}` },
      body: JSON.stringify(firstEditPayload),
    });
    const firstEditResponseBody = await firstEditResponse.json();

    expect(firstEditResponse.status).toBe(201);
    expect(firstEditResponseBody.error).toBeUndefined();
    const version2Contribution = firstEditResponseBody.data as DialecticContribution;
    expect(version2Contribution.id).not.toBe(originalAIContributionId);
    // @ts-ignore - Linter incorrectly flags edit_version if DialecticContribution interface is correct
    expect(version2Contribution.edit_version).toBe(testData.initialAiContribution.edit_version + 1);
    expect(version2Contribution.is_latest_edit).toBe(true);
    expect(version2Contribution.original_model_contribution_id).toBe(originalAIContributionId);
    expect(version2Contribution.parent_contribution_id).toBe(originalAIContributionId); // Target of edit was original AI

    // 2. Second User Edit (creates Version 3, editing Version 2)
    const secondEditContent = "This is the second user edit (Version 3), editing Version 2.";
    const secondEditPayload: { action: string; payload: SaveContributionEditPayload } = {
      action: 'saveContributionEdit',
      payload: {
        originalContributionIdToEdit: version2Contribution.id, // Editing the first user edit
        editedContentText: secondEditContent,
      },
    };

    const secondEditResponse = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${primaryUserJwt}` },
      body: JSON.stringify(secondEditPayload),
    });
    const secondEditResponseBody = await secondEditResponse.json();
    
    expect(secondEditResponse.status).toBe(201);
    expect(secondEditResponseBody.error).toBeUndefined();
    const version3Contribution = secondEditResponseBody.data as DialecticContribution;

    // 3. Verify Version 3 properties
    expect(version3Contribution.id).not.toBe(version2Contribution.id);
    expect(version3Contribution.stage).toBe(testData.initialAiContribution.stage);
    // @ts-ignore - Linter incorrectly flags edit_version if DialecticContribution interface is correct
    expect(version3Contribution.edit_version).toBe(version2Contribution.edit_version + 1); // Which is initial.edit_version + 2
    expect(version3Contribution.is_latest_edit).toBe(true);
    // Crucially, original_model_contribution_id should still point to the very first AI contribution
    expect(version3Contribution.original_model_contribution_id).toBe(originalAIContributionId);
    expect(version3Contribution.user_id).toBe(primaryUserId);
    expect(version3Contribution.parent_contribution_id).toBe(version2Contribution.id); // Target of edit was Version 2

    // 4. Verify Version 2 (first user edit) is_latest_edit is now false
    const { data: version2AfterEditData, error: fetchV2Error } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('id', version2Contribution.id)
      .single();
    expect(fetchV2Error).toBeNull();
    const version2AfterEdit = version2AfterEditData as DialecticContributionSql;
    // @ts-ignore - Linter incorrectly flags is_latest_edit if DialecticContributionSql is correct
    expect(version2AfterEdit.is_latest_edit).toBe(false);

    // 5. Verify Version 1 (original AI contribution) is_latest_edit is also false
    const { data: version1AfterEditData, error: fetchV1Error } = await adminClient
      .from('dialectic_contributions')
      .select('is_latest_edit')
      .eq('id', originalAIContributionId)
      .single();
    expect(fetchV1Error).toBeNull();
    // @ts-ignore - Linter incorrectly flags is_latest_edit if DialecticContributionSql is correct
    expect(version1AfterEditData!.is_latest_edit).toBe(false); // Added non-null assertion as select is specific
  });

  // TODO: Consider adding concurrency tests if important for multi-user scenarios.
}); 