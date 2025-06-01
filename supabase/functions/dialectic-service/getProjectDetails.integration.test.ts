// @deno-types="npm:@types/chai@4.3.1"
import { expect } from "npm:chai@4.3.7";
import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
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
import type { DialecticServiceRequest } from "./dialectic.interface.ts"; 
// Correctly import types from the central types package
import type { DialecticProject, DialecticSession, DialecticSessionModel, DialecticContribution } from "./dialectic.interface.ts"; 

describe("Edge Function: dialectic-service - Action: getProjectDetails", () => {
  let testUserClient: SupabaseClient<Database>;
  let testUserId: string;
  let testUserAuthToken: string;
  let adminClient: SupabaseClient<Database>;

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
    expect(error.context.status).to.equal(404);
  });

  it("should return a 404 (or 403) if trying to access another user's project", async () => {
    // User A creates a project
    const userASetup = await coreInitializeTestStep({
      userProfile: { first_name: "UserAOwner" },
      resources: [
        {
          tableName: "dialectic_projects",
          identifier: { project_name: "UserAProject" }, // This will be used for retrieval from processedResources
          desiredState: { initial_user_prompt: "User A's prompt", user_id: "dummy_temp_id" }, // user_id will be overridden by linkUserId
          linkUserId: true, 
        },
      ],
      // No adminClient property here
    });
    
    // Find the created project from processedResources
    const projectAResourceInfo = userASetup.processedResources.find(
        (r: ProcessedResourceInfo) => r.tableName === "dialectic_projects" && r.identifier.project_name === "UserAProject"
    );
    assertExists(projectAResourceInfo, "User A's project resource info should exist after setup."); // Added assertExists
    assertExists(projectAResourceInfo.resource, "User A's project resource data should exist.");
    const projectAId = (projectAResourceInfo.resource as DialecticProject).id;
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
    expect(userBError.context.status).to.be.oneOf([403, 404]);
    // Ensure User A's resources are cleaned up. coreCleanupTestResources with 'local' scope in afterEach
    // should handle resources created by coreInitializeTestStep. If userASetup created global resources
    // or if tests need more fine-grained control, specific cleanup might be added here.
  });

  it("should successfully return project details for a project with no sessions", async () => {
    const projectName = "ProjectNoSessions";
    const setupResult = await coreInitializeTestStep({
        userProfile: { first_name: "ProjectNoSessionsOwner" }, 
        resources: [{
            tableName: "dialectic_projects",
            identifier: { project_name: projectName },
            desiredState: { initial_user_prompt: "A prompt for no sessions", user_id: testUserId }, // Explicitly set user_id
            // linkUserId: true, // Not needed if user_id is in desiredState
        }],
        // No adminClient property here
    });
    const projectResourceInfo = setupResult.processedResources.find(
        (r: ProcessedResourceInfo) => r.tableName === "dialectic_projects" && r.identifier.project_name === projectName
    );
    assertExists(projectResourceInfo, "ProjectNoSessions resource info should exist."); // Added assertExists
    assertExists(projectResourceInfo.resource, "ProjectNoSessions resource data should exist.");
    const projectId = (projectResourceInfo.resource as DialecticProject).id;
    assertExists(projectId, "ProjectNoSessions ID should exist.");

    const request: DialecticServiceRequest = {
      action: "getProjectDetails",
      payload: { projectId: projectId },
    };

    const { data, error } = await testUserClient.functions.invoke("dialectic-service", {
      body: request,
      headers: { Authorization: `Bearer ${testUserAuthToken}` },
    });

    expect(error, `Function invocation error: ${JSON.stringify(error)}`).to.be.null;
    assertExists(data, "Response data should exist");
    const responsePayload = data as any;
    expect(responsePayload.error, `Service action error: ${responsePayload.error?.message}`).to.be.undefined;
    
    const project = responsePayload.data as DialecticProject;
    expect(project.id).to.equal(projectId);
    expect(project.project_name).to.equal(projectName);
    expect(project.user_id).to.equal(testUserId);
    // Updated to check project.sessions as per harmonized DialecticProject interface
    assertExists(project.sessions, "Project sessions should be defined, even if empty."); 
    expect(project.sessions).to.be.an("array").that.is.empty;
  });

  it("should successfully return project details with sessions, models, and contributions", async () => {
    const projectName = "ProjectWithDetails";
    const projectSetup = await coreInitializeTestStep({
      userProfile: { first_name: "ProjectDetailsOwner" }, 
      resources: [
        {
          tableName: "dialectic_projects",
          identifier: { project_name: projectName }, 
          desiredState: { initial_user_prompt: "Detailed project prompt", user_id: testUserId },
        },
      ],
      // No adminClient property here
    });
    const projectResourceInfo = projectSetup.processedResources.find(
        (r: ProcessedResourceInfo) => r.tableName === "dialectic_projects" && r.identifier.project_name === projectName
    );
    assertExists(projectResourceInfo, "ProjectWithDetails resource info should exist."); // Added assertExists
    assertExists(projectResourceInfo.resource, "ProjectWithDetails resource data should exist.");
    const projectId = (projectResourceInfo.resource as DialecticProject).id;
    assertExists(projectId, "ProjectWithDetails ID should exist.");

    // Manually create session, session_models, contributions using adminClient directly
    const { data: session, error: sessionErr } = await adminClient // Use adminClient initialized in beforeEach
      .from("dialectic_sessions")
      .insert({
        project_id: projectId,
        session_description: "Session for detailed test",
        status: "thesis_complete", 
        iteration_count: 1,
        max_iterations: 3, 
        active_thesis_prompt_template_id: null, 
        active_antithesis_prompt_template_id: null,
        active_synthesis_prompt_template_id: null,
        active_parenthesis_prompt_template_id: null,
        active_paralysis_prompt_template_id: null,
      })
      .select()
      .single();
    assert(!sessionErr, `Error inserting session: ${sessionErr?.message}`);
    assertExists(session, "Session should have been created");

    const { data: model1Data, error: model1Err } = await adminClient.from('ai_providers').select('id').eq('api_identifier', 'openai/gpt-3.5-turbo').single();
    assert(!model1Err && model1Data, "Test setup: openai/gpt-3.5-turbo not found.");
    const model1CatalogId = model1Data.id;

    const { data: model2Data, error: model2Err } = await adminClient.from('ai_providers').select('id').eq('api_identifier', 'anthropic/claude-3').single();
    assert(!model2Err && model2Data, "Test setup: anthropic/claude-3 not found.");
    const model2CatalogId = model2Data.id;
    
    const { data: sm1, error: sm1Err } = await adminClient
      .from("dialectic_session_models")
      .insert({ session_id: session.id, model_id: model1CatalogId })
      .select('id').single();
    assert(!sm1Err && sm1, `Error inserting session_model 1: ${sm1Err?.message}`);

    const { data: sm2, error: sm2Err } = await adminClient
      .from("dialectic_session_models")
      .insert({ session_id: session.id, model_id: model2CatalogId })
      .select('id').single();
    assert(!sm2Err && sm2, `Error inserting session_model 2: ${sm2Err?.message}`);

    const contrib1CreatedAt = new Date(Date.now() - 2000).toISOString();
    const contrib2CreatedAt = new Date(Date.now() - 1000).toISOString();

    await adminClient.from("dialectic_contributions").insert({
        id: crypto.randomUUID(), session_id: session.id, session_model_id: sm1.id, stage: "thesis", iteration_number: 1,
        actual_prompt_sent: "Thesis prompt 1", content_storage_bucket: "dialectic-contributions",
        content_storage_path: `${projectId}/${session.id}/contrib1.md`, content_mime_type: "text/markdown",
        content_size_bytes: 100, created_at: contrib1CreatedAt, user_id: null, parent_contribution_id: null
    });
    await adminClient.from("dialectic_contributions").insert({
        id: crypto.randomUUID(), session_id: session.id, session_model_id: sm2.id, stage: "thesis", iteration_number: 1,
        actual_prompt_sent: "Thesis prompt 2", content_storage_bucket: "dialectic-contributions",
        content_storage_path: `${projectId}/${session.id}/contrib2.md`, content_mime_type: "text/markdown",
        content_size_bytes: 120, created_at: contrib2CreatedAt, user_id: null, parent_contribution_id: null
    });
    
    const request: DialecticServiceRequest = {
      action: "getProjectDetails",
      payload: { projectId: projectId },
    };

    const { data, error } = await testUserClient.functions.invoke("dialectic-service", {
      body: request,
      headers: { Authorization: `Bearer ${testUserAuthToken}` },
    });

    expect(error, `Function invocation error: ${JSON.stringify(error)}`).to.be.null;
    assertExists(data, "Response data should exist for detailed project");
    const responsePayload = data as any;
    expect(responsePayload.error, `Service action error: ${responsePayload.error?.message}`).to.be.undefined;

    const project = responsePayload.data as DialecticProject;
    expect(project.id).to.equal(projectId);
    expect(project.project_name).to.equal(projectName);
    assertExists(project.sessions, "Project sessions should exist");
    expect(project.sessions).to.be.an("array").with.lengthOf(1);

    const fetchedSession = project.sessions?.[0] as DialecticSession; 
    assertExists(fetchedSession, "Fetched session should exist");
    expect(fetchedSession.id).to.equal(session.id);
    expect(fetchedSession.session_description).to.equal("Session for detailed test");

    assertExists(fetchedSession.dialectic_session_models, "Session models should exist");
    expect(fetchedSession.dialectic_session_models).to.be.an("array").with.lengthOf(2);
    expect(fetchedSession.dialectic_session_models?.map((m: DialecticSessionModel) => m.model_id)).to.have.members([model1CatalogId, model2CatalogId]);

    assertExists(fetchedSession.dialectic_contributions, "Session contributions should exist");
    expect(fetchedSession.dialectic_contributions).to.be.an("array").with.lengthOf(2);
    const contribs = fetchedSession.dialectic_contributions?.sort((a: DialecticContribution, b: DialecticContribution) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    assertExists(contribs, "Sorted contributions should exist");
    expect(contribs[0].actual_prompt_sent).to.equal("Thesis prompt 1"); 
    expect(contribs[1].actual_prompt_sent).to.equal("Thesis prompt 2");
  });
}); 