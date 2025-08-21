import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { assertExists, assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient, type SupabaseClient, FunctionsHttpError } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts"; // Corrected path relative to this file's new location
import {
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreGenerateTestUserJwt,
  initializeSupabaseAdminClient, // Use initializeSupabaseAdminClient directly for this standalone test file context
  // getSharedAdminClient, // This would be used if run via a main test runner that initializes and shares it
  TestResourceRequirement,
  ProcessedResourceInfo, // Import this type
} from "../_shared/_integration.test.utils.ts"; // Corrected path
import type { DialecticServiceRequest, DialecticServiceResponse } from "./dialectic.interface.ts"; 
// Correctly import types from the central types package
import type { DialecticProject, DialecticSession, DialecticSessionModel, DialecticContribution } from "./dialectic.interface.ts"; 
import { initializeTestDeps } from "../_shared/_integration.test.utils.ts";

describe("Edge Function: dialectic-service - Action: getProjectDetails", () => {
  let testUserClient: SupabaseClient<Database>;
  let testUserId: string;
  let testUserAuthToken: string;
  let adminClient: SupabaseClient<Database>;

  initializeTestDeps();

  beforeEach(async () => {
    // Initialize admin client for this test suite's scope if not using a shared one
    adminClient = initializeSupabaseAdminClient(); 
    const setup = await coreInitializeTestStep({
      userProfile: { first_name: "GetDetailsUser" },
      // adminClient is not a property of TestSetupConfig, coreInitializeTestStep uses the global one
    });
    testUserClient = setup.primaryUserClient;
    testUserId = setup.primaryUserId;
    testUserAuthToken = await coreGenerateTestUserJwt(testUserId);
  });

  afterEach(async () => {
    await coreCleanupTestResources('local');
  });

  it("should return a 404 if the project_id does not exist", async () => {
    const nonExistentProjectId = crypto.randomUUID();
    const request: DialecticServiceRequest = {
      action: "getProjectDetails",
      payload: { projectId: nonExistentProjectId },
    };

    const { error } = await testUserClient.functions.invoke("dialectic-service", {
      body: request,
      headers: { Authorization: `Bearer ${testUserAuthToken}` },
    });

    assertExists(error, "Expected function invocation to error for non-existent project.");
    assert(error instanceof FunctionsHttpError, "Error should be a FunctionsHttpError.");
    assertEquals(error.context.status, 404);
  });

  it("should return a 404 (or 403) if trying to access another user's project", async () => {
    // User A creates a project
    const userASetup = await coreInitializeTestStep({
      userProfile: { first_name: "UserAOwner" },
      resources: [
        {
          tableName: "dialectic_domains",
          identifier: { name: "User A's Domain" },
          desiredState: { description: "A domain for User A" },
          exportId: "userADomain",
        },
        {
          tableName: "dialectic_projects",
          identifier: { project_name: "UserAProject" },
          desiredState: {
            initial_user_prompt: "User A's prompt",
            selected_domain_id: "{$ref: 'userADomain'}",
          },
          linkUserId: true,
        },
      ],
    });

    const projectAResourceInfo = userASetup.processedResources.find(
      (r: ProcessedResourceInfo) =>
        r.tableName === "dialectic_projects" &&
        r.identifier.project_name === "UserAProject"
    );
    assertExists(projectAResourceInfo, "User A's project resource info should exist after setup.");
    assertExists(projectAResourceInfo.resource, "User A's project resource data should exist.");
    const projectAId: string = projectAResourceInfo.resource.id;
    assertExists(projectAId, "User A's project ID should exist.");

    // User B (current testUser) tries to fetch User A's project
    const request: DialecticServiceRequest = {
      action: "getProjectDetails",
      payload: { projectId: projectAId },
    };

    const { error: userBError } = await testUserClient.functions.invoke("dialectic-service", {
      body: request,
      headers: { Authorization: `Bearer ${testUserAuthToken}` },
    });

    assertExists(userBError, "Expected function invocation to error for unauthorized access.");
    assert(userBError instanceof FunctionsHttpError);
    assert([403, 404].includes(userBError.context.status));
    // Ensure User A's resources are cleaned up. coreCleanupTestResources with 'local' scope in afterEach
    // should handle resources created by coreInitializeTestStep. If userASetup created global resources
    // or if tests need more fine-grained control, specific cleanup might be added here.
  });

  it("should successfully return project details for a project with no sessions", async () => {
    const projectName = "ProjectNoSessions";
    const setupResult = await coreInitializeTestStep({
      resources: [
        {
          tableName: "dialectic_domains",
          identifier: { name: "Test Domain for No Sessions" },
          desiredState: { description: "A test domain" },
          exportId: "domainNoSessions",
        },
        {
          tableName: "dialectic_projects",
          identifier: { project_name: projectName },
          desiredState: {
            initial_user_prompt: "A prompt for no sessions",
            selected_domain_id: "{$ref: 'domainNoSessions'}",
          },
          linkUserId: true,
        },
      ],
    });
    const projectResourceInfo = setupResult.processedResources.find(
      (r: ProcessedResourceInfo) =>
        r.tableName === "dialectic_projects" &&
        r.identifier.project_name === projectName
    );
    assertExists(projectResourceInfo, "ProjectNoSessions resource info should exist.");
    assertExists(projectResourceInfo.resource, "ProjectNoSessions resource data should exist.");
    const projectId: string = projectResourceInfo.resource.id;
    assertExists(projectId, "ProjectNoSessions ID should exist.");

    const request: DialecticServiceRequest = {
      action: "getProjectDetails",
      payload: { projectId: projectId },
    };

    const { data, error } = await setupResult.primaryUserClient.functions.invoke("dialectic-service", {
      body: request,
      headers: { Authorization: `Bearer ${setupResult.primaryUserJwt}` },
    });

    assertEquals(error, null, `Function invocation error: ${JSON.stringify(error)}`);
    assertExists(data, "Response data should exist");
    const responsePayload: DialecticServiceResponse<DialecticProject> = data;
    assertEquals(responsePayload.error, undefined, `Service action error: ${responsePayload.error?.message}`);
    
    assertExists(responsePayload.data, "Response data should exist");
    const project: DialecticProject = responsePayload.data;
    assertEquals(project.id, projectId);
    assertEquals(project.project_name, projectName);
    assertEquals(project.user_id, setupResult.primaryUserId);
    // Updated to check project.dialectic_sessions as per harmonized DialecticProject interface
    assertExists(project.dialectic_sessions, "Project sessions should be defined, even if empty."); 
    assertEquals(project.dialectic_sessions, []);
  });

  it("should successfully return project details with sessions, models, and contributions", async () => {
    const projectName = "ProjectWithDetails";
    const projectSetup = await coreInitializeTestStep({
      resources: [
        {
          tableName: "ai_providers",
          identifier: { api_identifier: "openai/gpt-3.5-turbo" },
          desiredState: { name: "GPT-3.5 Turbo", provider: "openai", is_active: true, is_enabled: true },
        },
        {
          tableName: "ai_providers",
          identifier: { api_identifier: "anthropic/claude-3" },
          desiredState: { name: "Claude 3", provider: "anthropic", is_active: true, is_enabled: true },
        },
        {
          tableName: "dialectic_domains",
          identifier: { name: "Test Domain for Details" },
          desiredState: { description: "A detailed test domain" },
          exportId: "domainWithDetails",
        },
        {
          tableName: "dialectic_projects",
          identifier: { project_name: projectName },
          desiredState: {
            initial_user_prompt: "Detailed project prompt",
            selected_domain_id: "{$ref: 'domainWithDetails'}",
          },
          linkUserId: true,
        },
      ],
    });
    const projectResourceInfo = projectSetup.processedResources.find(
      (r: ProcessedResourceInfo) =>
        r.tableName === "dialectic_projects" &&
        r.identifier.project_name === projectName
    );
    assertExists(projectResourceInfo, "ProjectWithDetails resource info should exist.");
    assertExists(projectResourceInfo.resource, "ProjectWithDetails resource data should exist.");
    const projectId: string = projectResourceInfo.resource.id;
    assertExists(projectId, "ProjectWithDetails ID should exist.");

    // Manually create session, session_models, contributions using adminClient directly
    const { data: stage, error: stageErr } = await adminClient
      .from('dialectic_stages')
      .insert({
          slug: `test-stage-thesis-${crypto.randomUUID()}`,
          display_name: 'Test Thesis Stage',
          description: 'A stage for testing',
      })
      .select()
      .single();
    assert(!stageErr, `Error inserting stage: ${stageErr?.message}`);
    assertExists(stage, "Stage should have been created");

    const { data: model1Data, error: model1Err } = await adminClient.from('ai_providers').select('id').eq('api_identifier', 'openai/gpt-3.5-turbo').single();
    assert(!model1Err && model1Data, "Test setup: openai/gpt-3.5-turbo not found.");
    const model1CatalogId = model1Data.id;

    const { data: model2Data, error: model2Err } = await adminClient.from('ai_providers').select('id').eq('api_identifier', 'anthropic/claude-3').single();
    assert(!model2Err && model2Data, "Test setup: anthropic/claude-3 not found.");
    const model2CatalogId = model2Data.id;

    const { data: session, error: sessionErr } = await adminClient // Use adminClient initialized in beforeEach
      .from("dialectic_sessions")
      .insert({
        project_id: projectId,
        session_description: "Session for detailed test",
        status: "thesis_complete", 
        iteration_count: 1,
        current_stage_id: stage.id,
        user_input_reference_url: null,
        selected_model_ids: [model1CatalogId, model2CatalogId],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    assert(!sessionErr, `Error inserting session: ${sessionErr?.message}`);
    assertExists(session, "Session should have been created");
    
    const contrib1CreatedAt = new Date(Date.now() - 2000).toISOString();
    const contrib2CreatedAt = new Date(Date.now() - 1000).toISOString();

    await adminClient.from("dialectic_contributions").insert({
        id: crypto.randomUUID(), session_id: session.id, stage: "thesis", iteration_number: 1,
        storage_bucket: "dialectic-contributions",
        storage_path: `${projectId}/${session.id}/contrib1.md`, mime_type: "text/markdown",
        size_bytes: 100, created_at: contrib1CreatedAt, user_id: null, parent_contribution_id: null
    });
    await adminClient.from("dialectic_contributions").insert({
        id: crypto.randomUUID(), session_id: session.id, stage: "thesis", iteration_number: 1,
        storage_bucket: "dialectic-contributions",
        storage_path: `${projectId}/${session.id}/contrib2.md`, mime_type: "text/markdown",
        size_bytes: 120, created_at: contrib2CreatedAt, user_id: null, parent_contribution_id: null
    });
    
    const request: DialecticServiceRequest = {
      action: "getProjectDetails",
      payload: { projectId: projectId },
    };

    const { data, error } = await projectSetup.primaryUserClient.functions.invoke("dialectic-service", {
      body: request,
      headers: { Authorization: `Bearer ${projectSetup.primaryUserJwt}` },
    });

    assertEquals(error, null, `Function invocation error: ${JSON.stringify(error)}`);
    assertExists(data, "Response data should exist for detailed project");
    const responsePayload: DialecticServiceResponse<DialecticProject> = data;
    assertEquals(responsePayload.error, undefined, `Service action error: ${responsePayload.error?.message}`);

    assertExists(responsePayload.data, "Response payload data should exist");
    const project: DialecticProject = responsePayload.data;
    assertEquals(project.id, projectId);
    assertEquals(project.project_name, projectName);
    assertExists(project.dialectic_sessions, "Project sessions should exist");
    assertEquals(project.dialectic_sessions?.length, 1);

    const fetchedSession: DialecticSession = project.dialectic_sessions?.[0]; 
    assertExists(fetchedSession, "Fetched session should exist");
    assertEquals(fetchedSession.id, session.id);
    assertEquals(fetchedSession.session_description, "Session for detailed test");

    assertExists(fetchedSession.dialectic_session_models, "Session models should exist");
    assertEquals(fetchedSession.dialectic_session_models?.length, 2);
    
    const modelIds = fetchedSession.dialectic_session_models?.map((m: DialecticSessionModel) => m.model_id).sort();
    const expectedModelIds = [model1CatalogId, model2CatalogId].sort();
    assertEquals(modelIds, expectedModelIds);

    assertExists(fetchedSession.dialectic_contributions, "Session contributions should exist");
    assertEquals(fetchedSession.dialectic_contributions?.length, 2);
    const contribs = fetchedSession.dialectic_contributions?.sort((a: DialecticContribution, b: DialecticContribution) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    assertExists(contribs, "Sorted contributions should exist");
    assertEquals(contribs[0].storage_path, `${projectId}/${session.id}/contrib1.md`); 
    assertEquals(contribs[1].storage_path, `${projectId}/${session.id}/contrib2.md`);
  });
}); 