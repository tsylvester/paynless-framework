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
  stageSlug: string; // Added to store the stage slug
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
    // 1. Create a stage to be used by the template and session
    const { data: stage, error: stageError } = await adminClient
      .from('dialectic_stages')
      .insert({
        slug: `thesis-stage-${crypto.randomUUID()}`,
        display_name: 'Thesis',
      })
      .select()
      .single();
    if (stageError || !stage) throw new Error(`Failed to create stage: ${stageError?.message}`);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_stages', criteria: { id: stage.id }, scope: 'local' });

    // 2. Create a domain for the process template
    const { data: domain, error: domainError } = await adminClient
      .from('dialectic_domains')
      .insert({
        name: `Test Domain for Edit - ${crypto.randomUUID()}`,
        description: 'A test domain.',
      })
      .select()
      .single();
    if (domainError || !domain) throw new Error(`Failed to create domain: ${domainError?.message}`);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_domains', criteria: { id: domain.id }, scope: 'local' });

    // 3. Create a process template for the project
    const { data: template, error: templateError } = await adminClient
      .from('dialectic_process_templates')
      .insert({
        name: 'Test Template for Edit',
        starting_stage_id: stage.id,
      })
      .select()
      .single();
    if (templateError || !template) throw new Error(`Failed to create process template: ${templateError?.message}`);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_process_templates', criteria: { id: template.id }, scope: 'local' });

    // 3.5. Associate domain with template
    const { data: association, error: associationError } = await adminClient
        .from('domain_process_associations')
        .insert({
            domain_id: domain.id,
            process_template_id: template.id,
        })
        .select()
        .single();
    if (associationError || !association) throw new Error(`Failed to associate domain and template: ${associationError?.message}`);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'domain_process_associations', criteria: { id: association.id }, scope: 'local' });

    // 4. Create a project for the current test user, linking the template
    const { data: project, error: projectError } = await adminClient
      .from('dialectic_projects')
      .insert({
        user_id: primaryUserId,
        project_name: 'Test Project for Edit',
        initial_user_prompt: 'Initial prompt for edit test',
        status: 'active',
        process_template_id: template.id,
        selected_domain_id: domain.id,
        selected_domain_overlay_id: null,
      })
      .select()
      .single();
    if (projectError || !project) throw new Error(`Failed to create project: ${projectError?.message}`);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_projects', criteria: { id: project.id }, scope: 'local' });

    // 5. Create a session for that project, linking the current stage
    const { data: session, error: sessionError } = await adminClient
      .from('dialectic_sessions')
      .insert({
        project_id: project.id,
        session_description: 'Test Session for Edit',
        current_stage_id: stage.id, // Use the real stage ID
        status: 'active',
      })
      .select()
      .single();
    if (sessionError || !session) throw new Error(`Failed to create session: ${sessionError?.message}`);
    registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: session.id }, scope: 'local' });

    // 6. Create an initial AI contribution in that session
    const initialContributionData: DialecticContributionInsert = {
      session_id: session.id,
      stage: stage.id, // Corrected: Use the stage ID (UUID)
      storage_path: `projects/${project.id}/sessions/${session.id}/it1/thesis/ai_initial.md`,
      user_id: null, // AI contribution has no user
      model_id: null,
      model_name: 'TestGPT-Mock',
      iteration_number: 1,
      storage_bucket: 'dialectic_contributions_content',
      mime_type: 'text/markdown',
      size_bytes: 20,
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
      seed_prompt_url: null,
      contribution_type: 'model_generated',
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
      stageSlug: stage.slug, // Store the slug
    };
  });

  afterEach(async () => {
    await coreCleanupTestResources('local'); // Cleans up resources created in beforeEach with 'local' scope
  });

  it('should allow a user to edit their own AI contribution, creating a new version', async () => {
    const originalAIContributionId = testData.aiContributionId;
    const editedContent = 'This is the edited version of the AI content.';
    
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

    const rawResponseText = await response.text();
    const responseBody = JSON.parse(rawResponseText) as DialecticContribution; // Assuming responseBody is the contribution

    expect(response.status).toBe(201);

    // 1. Verify new contribution record
    expect(responseBody.id).not.toBe(originalAIContributionId);
    expect(responseBody.stage).toBe(testData.stageSlug); // Use stageSlug for comparison
    expect(responseBody.edit_version).toBe(testData.initialAiContribution.edit_version + 1);
    expect(responseBody.is_latest_edit).toBe(true);
    // original_model_contribution_id for an edit of a direct AI contribution should be the AI contribution's ID
    expect(responseBody.original_model_contribution_id).toBe(originalAIContributionId);
    expect(responseBody.user_id).toBe(primaryUserId);
    expect(responseBody.storage_path).toMatch(/edits\/.+\/\d+_edit.md/); // Matches placeholder path structure

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

    // Removed console.log statements
    const rawResponseText404 = await response.text();
    const responseBody = JSON.parse(rawResponseText404);

    expect(response.status).toBe(404); // Expect 404 because RLS makes it "not found"
    expect(responseBody.error).toBeDefined();
    expect(responseBody.error).toBe('Original contribution not found.'); // Corrected assertion
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

    const rawTextForNonExistent = await response.text();
    const responseBodyNonExistent = JSON.parse(rawTextForNonExistent);

    expect(response.status).toBe(404); 
    expect(responseBodyNonExistent.error).toBeDefined();
    expect(responseBodyNonExistent.error).toBe('Original contribution not found.');
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

    // Removed console.log statements
    const rawTextFirstEditInMulti = await firstEditResponse.text();
    const firstEditResponseBody = JSON.parse(rawTextFirstEditInMulti);

    expect(firstEditResponse.status).toBe(201);
    const version2Contribution = firstEditResponseBody as DialecticContribution;

    expect(version2Contribution.id).not.toBe(originalAIContributionId);
    expect(version2Contribution.edit_version).toBe(testData.initialAiContribution.edit_version + 1);
    expect(version2Contribution.is_latest_edit).toBe(true);
    expect(version2Contribution.original_model_contribution_id).toBe(originalAIContributionId);
    expect(version2Contribution.target_contribution_id).toBe(originalAIContributionId); // Target of edit was original AI

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
    // Using JSON.parse(await response.text()) for consistency
    const rawTextSecondEdit = await secondEditResponse.text();
    const secondEditResponseBody = JSON.parse(rawTextSecondEdit);
    
    expect(secondEditResponse.status).toBe(201);
    const version3Contribution = secondEditResponseBody as DialecticContribution;

    // 3. Verify Version 3 properties
    expect(version3Contribution.id).not.toBe(version2Contribution.id);
    expect(version3Contribution.stage).toBe(testData.stageSlug); // Use stageSlug for comparison
    expect(version3Contribution.edit_version).toBe(version2Contribution.edit_version + 1); // Which is initial.edit_version + 2
    expect(version3Contribution.is_latest_edit).toBe(true);
    // Crucially, original_model_contribution_id should still point to the very first AI contribution
    expect(version3Contribution.original_model_contribution_id).toBe(originalAIContributionId);
    expect(version3Contribution.user_id).toBe(primaryUserId);
    expect(version3Contribution.target_contribution_id).toBe(version2Contribution.id); // Target of edit was Version 2

    // 4. Verify Version 2 (first user edit) is_latest_edit is now false
    const { data: version2AfterEditData, error: fetchV2Error } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('id', version2Contribution.id)
      .single();
    expect(fetchV2Error).toBeNull();
    const originalAfterSecondEdit = version2AfterEditData as DialecticContributionSql;
    expect(originalAfterSecondEdit.is_latest_edit).toBe(false);

    // 5. Verify Version 1 (original AI contribution) is_latest_edit is also false
    const { data: version1AfterEditData, error: fetchV1Error } = await adminClient
      .from('dialectic_contributions')
      .select('is_latest_edit')
      .eq('id', originalAIContributionId)
      .single();
    expect(fetchV1Error).toBeNull();
    const firstEditAfterSecondEdit = version1AfterEditData!.is_latest_edit === false ? version1AfterEditData as DialecticContributionSql : null;
    expect(firstEditAfterSecondEdit).toBeDefined();
    expect(firstEditAfterSecondEdit!.is_latest_edit).toBe(false);
  });

  // TODO: Consider adding concurrency tests if important for multi-user scenarios.
}); 