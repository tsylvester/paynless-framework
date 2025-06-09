import { assertEquals, assertExists, assert, assertObjectMatch } from "jsr:@std/assert@0.225.1";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { createProject, type CreateProjectOptions } from "./createProject.ts";
import type { CreateProjectPayload, DialecticProject } from "./dialectic.interface.ts";
import type { User } from "@supabase/supabase-js"; // Import User type
import * as domainUtils from "../_shared/domain-utils.ts"; // To mock isValidDomainTag
import { createMockSupabaseClient, type MockSupabaseDataConfig, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";

Deno.test("createProject - successful project creation (no file)", async () => {
  const mockUserId = "user-test-id-refactored";
  const mockProjectName = "Test Project Refactored";
  const mockInitialUserPromptText = "Create a test project refactored.";
  const mockSelectedDomainOverlayId = "overlay-uuid-for-testing-refactored";
  const testTimestamp = new Date().toISOString();

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {}, 
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const mockExpectedDbInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: null,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    status: "new",
    initial_prompt_resource_id: null,
  };

  // This is what the .single() call after insert should resolve to
  const mockProjectDataAfterInsert: DialecticProject = {
    id: "project-test-id-refactored",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: null,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    repo_url: null,
    status: "new",
    created_at: testTimestamp, // Use consistent timestamp
    updated_at: testTimestamp, // Use consistent timestamp
    initial_prompt_resource_id: null,
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainOverlayId: mockSelectedDomainOverlayId,
    // selectedDomainTag is intentionally omitted as it's null for this test
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });

  const insertPayloadHolder = { payload: null as any };

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'dialectic_projects': {
        insert: async (state: MockQueryBuilderState) => {
          insertPayloadHolder.payload = state.insertData;
          const insertedData = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
          return {
            data: [{
              id: mockProjectDataAfterInsert.id, // Use the predefined ID
              ...(insertedData as object),
              created_at: mockProjectDataAfterInsert.created_at,
              updated_at: mockProjectDataAfterInsert.updated_at,
              repo_url: mockProjectDataAfterInsert.repo_url,
              initial_prompt_resource_id: mockProjectDataAfterInsert.initial_prompt_resource_id,
              // Ensure all fields from mockProjectDataAfterInsert are covered or taken from insertedData
              user_id: (insertedData as any)?.user_id || mockUserId,
              project_name: (insertedData as any)?.project_name || mockProjectName,
              initial_user_prompt: (insertedData as any)?.initial_user_prompt || mockInitialUserPromptText,
              selected_domain_tag: (insertedData as any)?.selected_domain_tag === undefined ? null : (insertedData as any)?.selected_domain_tag,
              selected_domain_overlay_id: (insertedData as any)?.selected_domain_overlay_id === undefined ? mockSelectedDomainOverlayId : (insertedData as any)?.selected_domain_overlay_id,
              status: (insertedData as any)?.status || "new",
            }],
            error: null,
            count: 1,
            status: 201,
            statusText: 'Created'
          };
        }
      }
      // No mock for 'domain_specific_prompt_overlays' as it shouldn't be called
    }
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData, 
      mockDbAdminClient as any, // Cast to any to satisfy SupabaseClient type for testing
      mockUser,
      {} // Pass empty options, so default isValidDomainTag is used (but shouldn't be called)
    );

    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.error, undefined, "Error should be undefined on success");
    assertObjectMatch(result.data as any, mockProjectDataAfterInsert as any, "Project data should match expected");

    assertEquals(spies.fromSpy.calls.length, 1, "fromSpy should be called once for dialectic_projects");
    assertEquals(spies.fromSpy.calls[0].args[0], 'dialectic_projects', "fromSpy called with 'dialectic_projects'");

    const projectInsertSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectInsertSpies, "Project insert spies should exist");
    assertExists(projectInsertSpies.insert, "insert spy for projects should exist");
    assertExists(projectInsertSpies.select, "select spy for projects should exist");
    assertExists(projectInsertSpies.single, "single spy for projects should exist");

    assertEquals(projectInsertSpies.insert.calls.length, 1, "insert on dialectic_projects should be called once");
    assertObjectMatch(insertPayloadHolder.payload, mockExpectedDbInsert as any, "Insert payload should match expected");
    assertEquals(projectInsertSpies.select.calls.length, 1, "select on dialectic_projects (after insert) should be called once");
    assertEquals(projectInsertSpies.single.calls.length, 1, "single on dialectic_projects (after insert) should be called once");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - user not authenticated", async () => {
  const mockUserId = "user-auth-fail-id-refactored";
  const mockProjectName = "Test Project Auth Fail Refactored";
  const mockInitialUserPromptText = "This should fail (refactored).";
  const testTimestamp = new Date().toISOString();

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {}, 
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });

  const dbOperationErrorMessage = "Database insert mock error from config";
  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'dialectic_projects': {
        insert: async (_state: MockQueryBuilderState) => {
          // This mock simulates the behavior of .single() after an insert that errors.
          // The MockQueryBuilder will handle the .single() part based on this error.
          return {
            data: null, 
            error: { name: "PostgrestError", message: dbOperationErrorMessage, code: "XXYYZ", details: dbOperationErrorMessage, hint: "Check mock config" }, 
            count: 0, 
            status: 500, 
            statusText: "Internal Server Error"
          };
        }
      }
      // No mock for 'domain_specific_prompt_overlays' as it shouldn't be called
    }
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData, 
      mockDbAdminClient as any, // Cast to any to satisfy SupabaseClient type for testing
      mockUser, 
      {} // No custom isValidDomainTag, should not be called if basic validation passes
    );

    assertExists(result.error, "Error object should exist when DB operation fails");
    assertEquals(result.error?.message, "Failed to create project", "Primary error message should be consistent"); 
    // The details should now come from the PostgrestError-like object provided by the mock
    assertEquals(result.error?.details, dbOperationErrorMessage, "Error details should match the mock DB error message"); 
    assertEquals(result.error?.status, 500, "Error status should be 500");

    assertEquals(spies.fromSpy.calls.length, 1, "fromSpy should be called once for dialectic_projects");
    assertEquals(spies.fromSpy.calls[0].args[0], 'dialectic_projects', "fromSpy called with 'dialectic_projects'");

    const projectInsertSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectInsertSpies, "Project insert spies should exist");
    assertExists(projectInsertSpies.insert, "insert spy for projects should exist");
    assertExists(projectInsertSpies.select, "select spy for projects should exist");
    assertExists(projectInsertSpies.single, "single spy for projects should exist");

    assertEquals(projectInsertSpies.insert.calls.length, 1, "insert on dialectic_projects should be called once");
    assertEquals(projectInsertSpies.select.calls.length, 1, "select on dialectic_projects (after insert) should be called once");
    assertEquals(projectInsertSpies.single.calls.length, 1, "single on dialectic_projects (after insert) should be called once");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - missing projectName", async () => {
  const mockUserId = "user-missing-project-id-refactored";
  const mockInitialUserPromptText = "This should also fail (refactored).";
  const testTimestamp = new Date().toISOString();

  const mockUser: User = { 
    id: mockUserId,
    app_metadata: {}, 
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const formDataValues = {
    action: "createProject",
    // projectName is intentionally omitted
    initialUserPromptText: mockInitialUserPromptText,
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });

  // No DB interaction expected, so config can be minimal
  const mockConfig: MockSupabaseDataConfig = {}; 

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData, 
      mockDbAdminClient as any, // Cast to any for testing
      mockUser,
      {} // No custom isValidDomainTag, should not be called
    );

    assertExists(result.error, "Error object should exist for missing projectName");
    assertEquals(result.error?.message, "projectName is required", "Error message should indicate missing projectName"); 
    assertEquals(result.error?.status, 400, "Error status should be 400");
    
    assertEquals(spies.fromSpy.calls.length, 0, "fromSpy should not have been called");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - missing initialUserPromptText (and no file)", async () => {
  const mockUserId = "user-no-prompt-id-refactored";
  const mockProjectName = "Test Project No Prompt Text Refactored";
  const testTimestamp = new Date().toISOString();

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {}, 
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    // initialUserPromptText is intentionally omitted
    // promptFile is also intentionally omitted from FormData for this test
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });
  // No promptFile is appended to formData

  // No DB interaction expected
  const mockConfig: MockSupabaseDataConfig = {}; 

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData, 
      mockDbAdminClient as any, // Cast to any for testing
      mockUser,
      {} // No custom isValidDomainTag, should not be called
    );

    assertExists(result.error, "Error object should exist for missing prompt");
    assertEquals(result.error?.message, "Either initialUserPromptText or a promptFile must be provided.", "Error message should indicate missing prompt text or file");
    assertEquals(result.error?.status, 400, "Error status should be 400");
    
    assertEquals(spies.fromSpy.calls.length, 0, "fromSpy should not have been called");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - with selectedDomainTag - success", async () => {
  const MOCK_ISO_DATE_STRING = "2023-01-01T12:00:00.000Z";
  const mockUserId = "user-tag-id-success-mock-util";
  const mockProjectName = "Test Project With Tag Success Mock Util";
  const mockInitialUserPromptText = "Prompt for tagged project success mock util.";
  const mockSelectedDomainTag = "software_dev_tag_success_mock_util";

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: MOCK_ISO_DATE_STRING,
  };

  const mockExpectedDbInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: mockSelectedDomainTag,
    selected_domain_overlay_id: null,
    status: "new",
    initial_prompt_resource_id: null,
  };

  // This is what the .single() call after insert should resolve to
  const mockProjectDataAfterInsert: DialecticProject = {
    id: "project-tag-id-success-mock-util",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: mockSelectedDomainTag,
    status: "new",
    initial_prompt_resource_id: null,
    selected_domain_overlay_id: null,
    repo_url: null,
    created_at: MOCK_ISO_DATE_STRING,
    updated_at: MOCK_ISO_DATE_STRING,
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainTag: mockSelectedDomainTag,
  };
  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });

  const insertPayloadHolder = { payload: null as any };

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'domain_specific_prompt_overlays': {
        select: async (state: MockQueryBuilderState) => {
          console.log(`[Mock Config][${mockProjectName}] domain_specific_prompt_overlays.select state:`, JSON.stringify(state));
          const hasCorrectEqFilter = state.filters.some(f => f.type === 'eq' && f.column === 'domain_tag' && f.value === mockSelectedDomainTag);
          const hasCorrectLimit = state.limitCount === 1;
          const hasCorrectSelect = state.selectColumns === 'domain_tag';

          if (hasCorrectEqFilter && hasCorrectLimit && hasCorrectSelect) {
            return { data: [{ domain_tag: mockSelectedDomainTag }], error: null, count: 1, status: 200, statusText: 'OK' };
          }
          // Fallback if conditions not met, simulating tag not found or wrong query
          return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
        }
      },
      'dialectic_projects': {
        insert: async (state: MockQueryBuilderState) => {
          console.log(`[Mock Config][${mockProjectName}] dialectic_projects.insert state:`, JSON.stringify(state));
          insertPayloadHolder.payload = state.insertData; // Capture for assertion

          // The data array must contain the object that .single() will return
          // Ensure all fields from mockProjectDataAfterInsert are present
          const insertedData = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
          return {
            data: [{
              id: mockProjectDataAfterInsert.id,
              ...(insertedData as object), // Spread the actual data passed to insert
              // Explicitly set fields that might not be in insertData but are in mockProjectDataAfterInsert
              user_id: (insertedData as any)?.user_id || mockUserId,
              project_name: (insertedData as any)?.project_name || mockProjectName,
              initial_user_prompt: (insertedData as any)?.initial_user_prompt || mockInitialUserPromptText,
              selected_domain_tag: (insertedData as any)?.selected_domain_tag || mockSelectedDomainTag,
              status: (insertedData as any)?.status || "new",
              initial_prompt_resource_id: (insertedData as any)?.initial_prompt_resource_id || null,
              selected_domain_overlay_id: (insertedData as any)?.selected_domain_overlay_id || null,
              repo_url: (insertedData as any)?.repo_url || null,
              created_at: MOCK_ISO_DATE_STRING,
              updated_at: MOCK_ISO_DATE_STRING,
            }],
            error: null,
            count: 1,
            status: 201, // 201 for successful insert
            statusText: 'Created'
          };
        }
      }
    }
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    // --- Function Call ---
    const result = await createProject(
      formData,
      mockDbAdminClient as any, // Cast to any to satisfy SupabaseClient type for testing
      mockUser,
      {} 
    );

    // --- Assertions ---
    assertExists(result.data, "result.data should exist");
    assertEquals(result.error, undefined, "result.error should be undefined");
    assertObjectMatch(result.data as any, mockProjectDataAfterInsert as any, "Project data should match expected");

    // Assertions using spies from createMockSupabaseClient
    assertEquals(spies.fromSpy.calls.length, 2, "fromSpy should be called twice");

    const domainOverlayCalls = spies.getHistoricQueryBuilderSpies('domain_specific_prompt_overlays', 'select');
    assert(domainOverlayCalls && domainOverlayCalls.callCount > 0, "select on domain_specific_prompt_overlays should have been called");
    
    // Check specific method calls on the latest builder for domain_specific_prompt_overlays
    const overlaySelectSpies = spies.getLatestQueryBuilderSpies('domain_specific_prompt_overlays');
    assertExists(overlaySelectSpies, "Overlay select spies should exist");
    assertExists(overlaySelectSpies.select, "Overlay select spy should exist");
    assertExists(overlaySelectSpies.eq, "Overlay eq spy should exist");
    assertExists(overlaySelectSpies.limit, "Overlay limit spy should exist");
    
    assertEquals(overlaySelectSpies.select.calls.length, 1, "select on overlays called once");
    assertEquals(overlaySelectSpies.select.calls[0].args[0], 'domain_tag', "select on overlays called with 'domain_tag'");
    assertEquals(overlaySelectSpies.eq.calls.length, 1, "eq on overlays called once");
    assertEquals(overlaySelectSpies.eq.calls[0].args, ['domain_tag', mockSelectedDomainTag], "eq on overlays called with correct args");
    assertEquals(overlaySelectSpies.limit.calls.length, 1, "limit on overlays called once");
    assertEquals(overlaySelectSpies.limit.calls[0].args[0], 1, "limit on overlays called with 1");


    const projectInsertSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectInsertSpies, "Project insert spies should exist");
    assertExists(projectInsertSpies.insert, "Project insert spy should exist");
    assertExists(projectInsertSpies.select, "Project select (after insert) spy should exist");
    assertExists(projectInsertSpies.single, "Project single (after insert) spy should exist");
    
    assertEquals(projectInsertSpies.insert.calls.length, 1, "insert on dialectic_projects should be called once");
    assertEquals(projectInsertSpies.select.calls.length, 1, "select on dialectic_projects (after insert) should be called once");
    assertEquals(projectInsertSpies.single.calls.length, 1, "single on dialectic_projects (after insert) should be called once");
    
    assertObjectMatch(insertPayloadHolder.payload, mockExpectedDbInsert as any, "Insert payload should match expected");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - with selectedDomainTag - invalid tag", async () => {
  const mockUserId = "user-invalid-tag-id-refactored";
  const mockProjectName = "Test Project Invalid Tag Refactored";
  const mockInitialUserPromptText = "Prompt for invalid tag project refactored.";
  const mockSelectedDomainTag = "invalid_tag_for_sure_refactored";
  const testTimestamp = new Date().toISOString();

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {}, 
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainTag: mockSelectedDomainTag,
  };
  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'domain_specific_prompt_overlays': {
        select: async (state: MockQueryBuilderState) => {
          // console.log(`[Mock Config][${mockProjectName}] domain_specific_prompt_overlays.select state for invalid tag:`, JSON.stringify(state));
          const hasCorrectEqFilter = state.filters.some(f => f.type === 'eq' && f.column === 'domain_tag' && f.value === mockSelectedDomainTag);
          const hasCorrectLimit = state.limitCount === 1;
          const hasCorrectSelect = state.selectColumns === 'domain_tag';

          if (hasCorrectEqFilter && hasCorrectLimit && hasCorrectSelect) {
            // Simulate tag not found
            return { data: [], error: null, count: 0, status: 200, statusText: 'OK' }; 
          }
          // Fallback if query shape is not as expected, should ideally not happen
          return { data: null, error: new Error("Unexpected query to domain_specific_prompt_overlays in invalid tag test"), count: 0, status: 500, statusText: 'Internal Server Error' };
        }
      }
      // 'dialectic_projects' table should not be called, so no mock needed here for it.
    }
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData, 
      mockDbAdminClient as any, // Cast for testing
      mockUser,
      {} // Use default isValidDomainTag implementation with the mocked client
    );

    assertExists(result.error, "Error object should exist for invalid domain tag");
    assertEquals(result.error?.message, `Invalid selectedDomainTag: "${mockSelectedDomainTag}"`, "Error message should indicate invalid tag");
    assertEquals(result.error?.status, 400, "Error status should be 400");

    assertEquals(spies.fromSpy.calls.length, 1, "fromSpy should be called once for domain_specific_prompt_overlays");
    assertEquals(spies.fromSpy.calls[0].args[0], 'domain_specific_prompt_overlays', "fromSpy called with 'domain_specific_prompt_overlays'");

    const overlaySelectSpies = spies.getLatestQueryBuilderSpies('domain_specific_prompt_overlays');
    assertExists(overlaySelectSpies, "Overlay select spies should exist");
    assertExists(overlaySelectSpies.select, "Overlay select spy should exist");
    assertExists(overlaySelectSpies.eq, "Overlay eq spy should exist");
    assertExists(overlaySelectSpies.limit, "Overlay limit spy should exist"); // This will cause a linter error until supabase.mock.ts is updated

    assertEquals(overlaySelectSpies.select.calls.length, 1, "select on overlays called once");
    assertEquals(overlaySelectSpies.select.calls[0].args[0], 'domain_tag', "select on overlays called with 'domain_tag'");
    assertEquals(overlaySelectSpies.eq.calls.length, 1, "eq on overlays called once");
    assertEquals(overlaySelectSpies.eq.calls[0].args, ['domain_tag', mockSelectedDomainTag], "eq on overlays called with correct args");
    assertEquals(overlaySelectSpies.limit.calls.length, 1, "limit on overlays called once"); // This will cause a linter error
    assertEquals(overlaySelectSpies.limit.calls[0].args[0], 1, "limit on overlays called with 1"); // This will cause a linter error

    // Ensure dialectic_projects was not touched
    const projectInsertSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertEquals(projectInsertSpies, undefined, "No spies should exist for dialectic_projects table");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - database error on insert", async () => {
  const mockUserId = "user-db-error-id-refactored";
  const mockProjectName = "Test DB Error Refactored";
  const mockInitialUserPromptText = "DB will fail (refactored).";
  const testTimestamp = new Date().toISOString();
  const dbErrorDetails = { 
    name: "PostgrestError",
    message: "DB insert failed from config", 
    code: "SOME_DB_ERROR_CODE", 
    details: "Unique constraint violation from config", 
    hint: "Check DB constraints or mock config"
  };

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {}, 
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const mockExpectedDbInsert = { // This is what we expect to be passed to insert, even if it fails
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: null,
    selected_domain_overlay_id: null,
    status: "new",
    initial_prompt_resource_id: null,
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
  };
  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });

  const insertPayloadHolder = { payload: null as any };

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'dialectic_projects': {
        insert: async (state: MockQueryBuilderState) => {
          insertPayloadHolder.payload = state.insertData;
          // Simulate the error that .single() would receive
          return { 
            data: null, 
            error: dbErrorDetails, 
            count: 0, 
            status: 500, 
            statusText: "Internal Server Error" 
          };
        }
      }
      // No mock for 'domain_specific_prompt_overlays' as it shouldn't be called
    }
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData, 
      mockDbAdminClient as any, // Cast for testing
      mockUser,
      {} // No custom isValidDomainTag, should not be called
    );

    assertExists(result.error, "Error object should exist for DB insert failure");
    assertEquals(result.error?.message, "Failed to create project", "Primary error message should be consistent");
    assertEquals(result.error?.details, dbErrorDetails.details, "Error details should match the mock DB error");
    assertEquals(result.error?.status, 500, "Error status should be 500");

    assertEquals(spies.fromSpy.calls.length, 1, "fromSpy should be called once for dialectic_projects");
    assertEquals(spies.fromSpy.calls[0].args[0], 'dialectic_projects', "fromSpy called with 'dialectic_projects'");

    const projectInsertSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectInsertSpies, "Project insert spies should exist");
    assertExists(projectInsertSpies.insert, "insert spy for projects should exist");
    assertExists(projectInsertSpies.select, "select spy for projects should exist");
    assertExists(projectInsertSpies.single, "single spy for projects should exist");

    assertEquals(projectInsertSpies.insert.calls.length, 1, "insert on dialectic_projects should be called once");
    assertObjectMatch(insertPayloadHolder.payload, mockExpectedDbInsert as any, "Insert payload should match expected even on failure");
    assertEquals(projectInsertSpies.select.calls.length, 1, "select on dialectic_projects (after insert) should be called once");
    assertEquals(projectInsertSpies.single.calls.length, 1, "single on dialectic_projects (after insert) should be called once");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

// --- STUBS FOR NEW FILE HANDLING TESTS ---

Deno.test("createProject - successful with promptFile", async () => {
  // TODO: Implement this test
  assert(true, "Test not implemented");
});

Deno.test("createProject - promptFile upload fails (storage error)", async () => {
  // TODO: Implement this test
  assert(true, "Test not implemented");
});

Deno.test("createProject - promptFile dialectic_project_resources insert fails (db error)", async () => {
  // TODO: Implement this test
  assert(true, "Test not implemented");
});

Deno.test("createProject - project update with resource_id fails (db error)", async () => {
  // TODO: Implement this test
  assert(true, "Test not implemented");
});

Deno.test("createProject - error during isValidDomainTag check", async () => {
  const mockUserId = "user-tag-error-id-refactored";
  const mockProjectName = "Test Invalid Tag Error Refactored";
  const mockInitialUserPromptText = "This tag check will throw (refactored).";
  const mockSelectedDomainTagForError = "tag_that_causes_error_in_validation_refactored";
  const testTimestamp = new Date().toISOString();
  const expectedErrorMessageFromMockDb = "Simulated DB error during tag validation from config";

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {}, 
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainTag: mockSelectedDomainTagForError,
  };
  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'domain_specific_prompt_overlays': {
        select: async (state: MockQueryBuilderState) => {
          // console.log(`[Mock Config][${mockProjectName}] domain_specific_prompt_overlays.select state for DB error:`, JSON.stringify(state));
          // This mock simulates the behavior of .limit(1) after a select that errors.
          // The MockQueryBuilder will handle the .limit(1) part based on this error.
          return { 
            data: null, 
            error: { name: "PostgrestError", message: expectedErrorMessageFromMockDb, code: "XYZ123", details: "Further details of simulated DB error", hint: "Check DB or mock"}, 
            count: 0, 
            status: 500, 
            statusText: "Internal Server Error" 
          };
        }
      }
      // 'dialectic_projects' should not be called.
    }
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData, 
      mockDbAdminClient as any, // Cast for testing
      mockUser,
      {} // Use default isValidDomainTag with the mocked client
    );

    assertExists(result.error, "Error object should exist when isValidDomainTag check fails internally");
    assertEquals(result.error?.message, "Failed to create project", "Primary error message should be consistent");
    assertEquals(result.error?.details, expectedErrorMessageFromMockDb, "Error details should reflect the DB error during tag validation");
    assertEquals(result.error?.status, 500, "Error status should be 500 for internal validation failure");

    assertEquals(spies.fromSpy.calls.length, 1, "fromSpy should be called once for domain_specific_prompt_overlays");
    assertEquals(spies.fromSpy.calls[0].args[0], 'domain_specific_prompt_overlays', "fromSpy called with 'domain_specific_prompt_overlays'");

    const overlaySelectSpies = spies.getLatestQueryBuilderSpies('domain_specific_prompt_overlays');
    assertExists(overlaySelectSpies, "Overlay select spies should exist");
    assertExists(overlaySelectSpies.select, "Overlay select spy should exist");
    assertExists(overlaySelectSpies.eq, "Overlay eq spy should exist");
    assertExists(overlaySelectSpies.limit, "Overlay limit spy should exist"); // This will cause a linter error

    assertEquals(overlaySelectSpies.select.calls.length, 1, "select on overlays called once");
    assertEquals(overlaySelectSpies.select.calls[0].args[0], 'domain_tag', "select on overlays called with 'domain_tag'");
    assertEquals(overlaySelectSpies.eq.calls.length, 1, "eq on overlays called once");
    assertEquals(overlaySelectSpies.eq.calls[0].args, ['domain_tag', mockSelectedDomainTagForError], "eq on overlays called with correct args");
    assertEquals(overlaySelectSpies.limit.calls.length, 1, "limit on overlays called once"); // This will cause a linter error

    // Ensure dialectic_projects was not touched
    const projectInsertSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertEquals(projectInsertSpies, undefined, "No spies should exist for dialectic_projects table");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - successful project creation with domain tag and overlay", async () => {
  const MOCK_ISO_DATE_STRING = "2023-01-01T12:00:00.000Z";
  const mockUserId = "user-tag-overlay-id-refactored";
  const mockProjectName = "Test Project With Tag And Overlay Refactored";
  const mockInitialUserPromptText = "Prompt for tagged project with overlay refactored.";
  const mockSelectedDomainTag = "software_dev_tag_for_overlay_refactored";
  const mockSelectedDomainOverlayId = "overlay-uuid-for-testing-with-tag-refactored";
  
  const mockUser: User = {
    id: mockUserId,
    app_metadata: {}, 
    user_metadata: {},
    aud: "authenticated",
    created_at: MOCK_ISO_DATE_STRING,
  };

  const mockExpectedDbInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: mockSelectedDomainTag,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    status: "new",
    initial_prompt_resource_id: null,
  };

  // This is what the .single() call after insert should resolve to
  const mockProjectDataAfterInsert: DialecticProject = {
    id: "project-tag-overlay-id-refactored",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: mockSelectedDomainTag,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    status: "new",
    initial_prompt_resource_id: null,
    repo_url: null,
    created_at: MOCK_ISO_DATE_STRING,
    updated_at: MOCK_ISO_DATE_STRING,
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainTag: mockSelectedDomainTag,
    selectedDomainOverlayId: mockSelectedDomainOverlayId,
  };
  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });

  const insertPayloadHolder = { payload: null as any };

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'domain_specific_prompt_overlays': {
        select: async (state: MockQueryBuilderState) => {
          // console.log(`[Mock Config][${mockProjectName}] domain_specific_prompt_overlays.select state:`, JSON.stringify(state));
          const hasCorrectEqFilter = state.filters.some(f => f.type === 'eq' && f.column === 'domain_tag' && f.value === mockSelectedDomainTag);
          const hasCorrectLimit = state.limitCount === 1;
          const hasCorrectSelect = state.selectColumns === 'domain_tag';

          if (hasCorrectEqFilter && hasCorrectLimit && hasCorrectSelect) {
            return { data: [{ domain_tag: mockSelectedDomainTag }], error: null, count: 1, status: 200, statusText: 'OK' };
          }
          return { data: [], error: null, count: 0, status: 200, statusText: 'OK' }; // Fallback if tag not found
        }
      },
      'dialectic_projects': {
        insert: async (state: MockQueryBuilderState) => {
          // console.log(`[Mock Config][${mockProjectName}] dialectic_projects.insert state:`, JSON.stringify(state));
          insertPayloadHolder.payload = state.insertData;
          const insertedData = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
          return {
            data: [{
              id: mockProjectDataAfterInsert.id,
              ...(insertedData as object),
              // Ensure all fields from mockProjectDataAfterInsert are present
              user_id: (insertedData as any)?.user_id || mockUserId,
              project_name: (insertedData as any)?.project_name || mockProjectName,
              initial_user_prompt: (insertedData as any)?.initial_user_prompt || mockInitialUserPromptText,
              selected_domain_tag: (insertedData as any)?.selected_domain_tag || mockSelectedDomainTag,
              selected_domain_overlay_id: (insertedData as any)?.selected_domain_overlay_id || mockSelectedDomainOverlayId,
              status: (insertedData as any)?.status || "new",
              initial_prompt_resource_id: (insertedData as any)?.initial_prompt_resource_id || null,
              repo_url: (insertedData as any)?.repo_url || null,
              created_at: MOCK_ISO_DATE_STRING,
              updated_at: MOCK_ISO_DATE_STRING,
            }],
            error: null,
            count: 1,
            status: 201,
            statusText: 'Created'
          };
        }
      }
    }
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    // --- Function Call ---
    const result = await createProject(
      formData, 
      mockDbAdminClient as any, // Cast for testing
      mockUser,
      {} // Use default isValidDomainTag with the mocked client
    );

    // --- Assertions ---
    assertExists(result.data, "result.data should exist");
    assertEquals(result.error, undefined, "result.error should be undefined");
    assertObjectMatch(result.data as any, mockProjectDataAfterInsert as any, "Project data should match expected");

    assertEquals(spies.fromSpy.calls.length, 2, "fromSpy should be called twice (overlays and projects)");

    // Assertions for domain_specific_prompt_overlays call chain
    const overlaySelectSpies = spies.getLatestQueryBuilderSpies('domain_specific_prompt_overlays');
    assertExists(overlaySelectSpies, "Overlay select spies should exist");
    assertExists(overlaySelectSpies.select, "Overlay select spy should exist");
    assertExists(overlaySelectSpies.eq, "Overlay eq spy should exist");
    assertExists(overlaySelectSpies.limit, "Overlay limit spy should exist"); // Linter error until supabase.mock.ts is updated

    assertEquals(overlaySelectSpies.select.calls.length, 1, "select on overlays called once");
    assertEquals(overlaySelectSpies.select.calls[0].args[0], 'domain_tag', "select on overlays called with 'domain_tag'");
    assertEquals(overlaySelectSpies.eq.calls.length, 1, "eq on overlays called once");
    assertEquals(overlaySelectSpies.eq.calls[0].args, ['domain_tag', mockSelectedDomainTag], "eq on overlays called with correct args");
    assertEquals(overlaySelectSpies.limit.calls.length, 1, "limit on overlays called once"); // Linter error

    // Assertions for dialectic_projects call chain
    const projectInsertSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectInsertSpies, "Project insert spies should exist");
    assertExists(projectInsertSpies.insert, "Project insert spy should exist");
    assertExists(projectInsertSpies.select, "Project select (after insert) spy should exist");
    assertExists(projectInsertSpies.single, "Project single (after insert) spy should exist");

    assertEquals(projectInsertSpies.insert.calls.length, 1, "insert on dialectic_projects should be called once");
    assertEquals(projectInsertSpies.select.calls.length, 1, "select on dialectic_projects (after insert) should be called once");
    assertEquals(projectInsertSpies.single.calls.length, 1, "single on dialectic_projects (after insert) should be called once");
    
    assertObjectMatch(insertPayloadHolder.payload, mockExpectedDbInsert as any, "Insert payload should match expected");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});
