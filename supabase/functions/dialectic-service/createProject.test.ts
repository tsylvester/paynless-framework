import { assertEquals, assertExists, assert, assertObjectMatch } from "jsr:@std/assert@0.225.1";
import { stub, spy, type Stub } from "jsr:@std/testing@0.225.1/mock";
import { createProject, type CreateProjectOptions } from "./createProject.ts";
import type { CreateProjectPayload, DialecticProject } from "./dialectic.interface.ts";
import * as sharedAuth from "../_shared/auth.ts"; // To mock createSupabaseClient
import * as domainUtils from "../_shared/domain-utils.ts"; // To mock isValidDomainTag

Deno.test("createProject - successful project creation (no file)", async () => {
  const mockUserId = "user-test-id";
  const mockProjectName = "Test Project";
  const mockInitialUserPromptText = "Create a test project.";
  const mockSelectedDomainOverlayId = "overlay-uuid-for-testing";

  const mockExpectedDbInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: null, // Assuming no domain tag for this test
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    status: "new",
    initial_prompt_resource_id: null, // No file in this test
  };

  const mockReturnedProjectData: DialecticProject = {
    id: "project-test-id",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: null,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    repo_url: null,
    status: "new", // Should match what createProject sets initially
    created_at: new Date().toISOString(), // Will be set by DB
    updated_at: new Date().toISOString(), // Will be set by DB
    initial_prompt_resource_id: null,
  };

  // Data that would have been in CreateProjectPayload, now for FormData
  const formDataValues = {
    action: "createProject", // Important for routing in index.ts
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainOverlayId: mockSelectedDomainOverlayId,
    // selectedDomainTag is not provided in this test, so it will be undefined/null
  };

  const formData = new FormData();
  formData.append("action", formDataValues.action);
  formData.append("projectName", formDataValues.projectName);
  formData.append("initialUserPromptText", formDataValues.initialUserPromptText);
  if (formDataValues.selectedDomainOverlayId) {
    formData.append("selectedDomainOverlayId", formDataValues.selectedDomainOverlayId);
  }
  // Note: selectedDomainTag is intentionally omitted to test that path

  const mockRequest = new Request("http://localhost/dialectic-service", { // URL may point to the main service endpoint
    method: "POST",
    body: formData,
    // No Content-Type header needed, fetch handles it for FormData
  });

  let fromCalled = false;
  let insertCalledWith: any = null;
  let selectCalled = false;
  let singleCalled = false;

  const mockDbAdminClient: any = {
    from: (tableName: string) => {
      fromCalled = true;
      assertEquals(tableName, "dialectic_projects");
      return {
        insert: (data: any) => {
          insertCalledWith = data;
          return {
            select: () => {
              selectCalled = true;
              return {
                single: async () => {
                  singleCalled = true;
                  // Simulate DB returning the inserted data, matching mockReturnedProjectData structure
                  return await Promise.resolve({ 
                    data: { 
                      id: mockReturnedProjectData.id, 
                      ...data, // The data that was inserted
                      created_at: mockReturnedProjectData.created_at, 
                      updated_at: mockReturnedProjectData.updated_at,
                      repo_url: mockReturnedProjectData.repo_url, // ensure all fields are covered
                      initial_prompt_resource_id: mockReturnedProjectData.initial_prompt_resource_id,
                    },
                    error: null 
                  });
                },
              };
            },
          };
        },
      };
    },
    storage: { // Mock storage for file upload tests, not used here but good to have structure
      from: () => ({ upload: spy(), remove: spy() })
    }
  };
  
  const mockGetUserImplementation = async () => {
    return await Promise.resolve({ data: { user: { id: mockUserId } }, error: null });
  };
  const getUserSpy = spy(mockGetUserImplementation);
  const mockAuthObject = { getUser: getUserSpy };
  const mockSupabaseUserClient = { auth: mockAuthObject };
  const mockCreateSupabaseClientFn = spy(() => mockSupabaseUserClient as any);
  const mockIsValidDomainTagFn = spy(async (dbClient: any, domainTag: string): Promise<boolean> => await Promise.resolve(domainTag === null)); // Returns true if no tag, false otherwise for this test

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient, 
    // Removed payload argument
    {
      createSupabaseClient: mockCreateSupabaseClientFn,
      isValidDomainTag: mockIsValidDomainTagFn
    }
  );

  assertExists(result.data, "Response data should exist on success");
  assertEquals(result.error, undefined, "Error should be undefined on success");
  
  // Assert that the structure of the returned data matches DialecticProject
  // and specific fields have expected values.
  assertObjectMatch(result.data, {
      id: mockReturnedProjectData.id,
      user_id: mockUserId,
      project_name: mockProjectName,
      initial_user_prompt: mockInitialUserPromptText,
      selected_domain_tag: null, // As it was not in formDataValues
      selected_domain_overlay_id: mockSelectedDomainOverlayId,
      status: "new",
      initial_prompt_resource_id: null,
  });

  assert(getUserSpy.calls.length > 0, "getUserSpy should have been called");
  assert(fromCalled, "from() should have been called on dbAdminClient");
  assertExists(insertCalledWith, "insert() should have been called on dbAdminClient");
  
  // Check the data passed to insert.
  // selected_domain_tag will be null if not provided in formData
  assertObjectMatch(insertCalledWith, mockExpectedDbInsert);

  assert(selectCalled, "select() should have been called on dbAdminClient");
  assert(singleCalled, "single() should have been called on dbAdminClient");
  assert(mockCreateSupabaseClientFn.calls.length > 0, "mockCreateSupabaseClientFn should have been called");
  // isValidDomainTag should NOT be called if selectedDomainTag is not in formData
  assertEquals(mockIsValidDomainTagFn.calls.length, 0, "mockIsValidDomainTagFn should not have been called if no tag is provided");
});

Deno.test("createProject - user not authenticated", async () => {
  const mockProjectName = "Test Project Auth Fail";
  const mockInitialUserPromptText = "This should fail.";

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
  };

  const formData = new FormData();
  formData.append("action", formDataValues.action);
  formData.append("projectName", formDataValues.projectName);
  formData.append("initialUserPromptText", formDataValues.initialUserPromptText);

  const mockRequest = new Request("http://localhost/dialectic-service", {
    method: "POST",
    body: formData,
  });

  const mockDbAdminClient: any = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => await Promise.resolve({ data: null, error: { message: "Should not be called" } })
        })
      })
    })
  };

  const mockAuthErrorUserClient = {
    auth: {
      getUser: async () => await Promise.resolve({ data: { user: null }, error: { message: "Auth error", status: 401 } })
    }
  };
  const mockCreateSupabaseClientAuthErrorFn = spy(() => mockAuthErrorUserClient as any);
  const mockIsValidDomainTagFn = spy(async (dbClient: any, domainTag: string): Promise<boolean> => await Promise.resolve(true));

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient, 
    // mockPayload removed
    {
      createSupabaseClient: mockCreateSupabaseClientAuthErrorFn,
      isValidDomainTag: mockIsValidDomainTagFn
    }
  );

  assertExists(result.error, "Error object should exist on auth failure");
  assertEquals(result.error?.message, "User not authenticated");
  assertEquals(result.error?.status, 401);
  assert(mockCreateSupabaseClientAuthErrorFn.calls.length > 0, "mockCreateSupabaseClientAuthErrorFn should have been called");
  assertEquals(mockIsValidDomainTagFn.calls.length, 0, "mockIsValidDomainTagFn should not have been called on auth failure");
});

Deno.test("createProject - missing projectName", async () => {
  const mockInitialUserPromptText = "This should also fail.";

  const formDataValues = {
    action: "createProject",
    initialUserPromptText: mockInitialUserPromptText,
    // projectName is intentionally missing
  };

  const formData = new FormData();
  formData.append("action", formDataValues.action);
  formData.append("initialUserPromptText", formDataValues.initialUserPromptText);

  const mockRequest = new Request("http://localhost/dialectic-service", {
    method: "POST",
    body: formData,
  });

  const mockDbAdminClient: any = {}; 
  const mockSupabaseUserClient: any = {}; 
  // Mock createSupabaseClient to return our mockSupabaseUserClient
  const mockCreateSupabaseClientFn = spy(() => mockSupabaseUserClient as any);
  const mockIsValidDomainTagFn = spy(async (dbClient: any, domainTag: string): Promise<boolean> => await Promise.resolve(true));

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient, 
    // mockPayload removed
    {
      createSupabaseClient: mockCreateSupabaseClientFn, // Pass the DI mock
      isValidDomainTag: mockIsValidDomainTagFn
    }
  );

  assertExists(result.error, "Error object should exist for missing projectName");
  // Updated expected error message based on createProject logic
  assertEquals(result.error?.message, "projectName is required"); 
  assertEquals(result.error?.status, 400);
  // getUser should not be called if projectName is missing (early exit)
  assertEquals(mockCreateSupabaseClientFn.calls.length, 0, "mockCreateSupabaseClientFn should not be called if projectName is missing");
  assertEquals(mockIsValidDomainTagFn.calls.length, 0, "mockIsValidDomainTagFn should not be called if projectName is missing");
});

Deno.test("createProject - missing initialUserPromptText (and no file)", async () => {
  const mockProjectName = "Test Project No Prompt Text";

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    // initialUserPromptText is missing, and no promptFile will be added
  };

  const formData = new FormData();
  formData.append("action", formDataValues.action);
  formData.append("projectName", formDataValues.projectName);

  const mockRequest = new Request("http://localhost/dialectic-service", {
    method: "POST",
    body: formData,
  });

  const mockDbAdminClient: any = {}; 
  const mockSupabaseUserClient: any = {};
  const mockCreateSupabaseClientFn = spy(() => mockSupabaseUserClient as any);
  const mockIsValidDomainTagFn = spy(async (dbClient: any, domainTag: string): Promise<boolean> => await Promise.resolve(true)); 

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient,
    // No payload argument
    {
      createSupabaseClient: mockCreateSupabaseClientFn,
      isValidDomainTag: mockIsValidDomainTagFn
    }
  );

  assertExists(result.error);
  assertEquals(result.error?.message, "Either initialUserPromptText or a promptFile must be provided.");
  assertEquals(result.error?.status, 400);
  assertEquals(mockCreateSupabaseClientFn.calls.length, 0); // Should exit before auth
  assertEquals(mockIsValidDomainTagFn.calls.length, 0);
});

Deno.test("createProject - with selectedDomainTag - success", async () => {
  const MOCK_ISO_DATE_STRING = "2023-01-01T12:00:00.000Z"; // Added fixed date
  const mockUserId = "user-tag-id";
  const mockProjectName = "Test Project With Tag";
  const mockInitialUserPromptText = "Prompt for tagged project.";
  const mockSelectedDomainTag = "software_development_tag";
  
  const mockExpectedDbInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: mockSelectedDomainTag,
    selected_domain_overlay_id: null, // Explicitly null
    status: "new",
    initial_prompt_resource_id: null, // Explicitly null
  };

  const mockReturnedProjectData: Partial<DialecticProject> = {
    id: "project-tag-id",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: mockSelectedDomainTag,
    status: "new",
    initial_prompt_resource_id: null,
    selected_domain_overlay_id: null,
    repo_url: null, // ADDED
    created_at: MOCK_ISO_DATE_STRING, // ADDED
    updated_at: MOCK_ISO_DATE_STRING, // ADDED
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainTag: mockSelectedDomainTag,
  };
  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => formData.append(key, value as string));

  const mockRequest = new Request("http://localhost/dialectic-service", { method: "POST", body: formData });

  const insertPayloadHolder = { payload: null as any };
  const mockDbAdminClient: any = {
    from: () => ({
      insert: spy((payloadToInsert: any) => {
        insertPayloadHolder.payload = payloadToInsert;
        return {
          select: () => ({
            single: async () => await Promise.resolve({
              data: {
                id: mockReturnedProjectData.id,
                ...payloadToInsert,
                repo_url: null,
                created_at: MOCK_ISO_DATE_STRING,
                updated_at: MOCK_ISO_DATE_STRING,
              },
              error: null
            })
          })
        };
      })
    })
  };
  const mockGetUserImplementation = async () => await Promise.resolve({ data: { user: { id: mockUserId } }, error: null });
  const getUserSpy = spy(mockGetUserImplementation);
  const mockCreateSupabaseClientFn = spy(() => ({ auth: { getUser: getUserSpy } }) as any);
  const mockIsValidDomainTagFn = spy(async (dbClient: any, domainTag: string): Promise<boolean> => await Promise.resolve(true));

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient,
    {
      createSupabaseClient: mockCreateSupabaseClientFn,
      isValidDomainTag: mockIsValidDomainTagFn
    }
  );

  assertExists(result.data);
  assertEquals(result.error, undefined);

  // Using assertEquals for a different comparison perspective
  assertEquals(result.data, mockReturnedProjectData);
  
  assert(mockIsValidDomainTagFn.calls.length > 0, "isValidDomainTag should be called");
  assertEquals(mockIsValidDomainTagFn.calls[0].args[1], mockSelectedDomainTag);
  assertObjectMatch(insertPayloadHolder.payload, mockExpectedDbInsert as any);
});

Deno.test("createProject - with selectedDomainTag - invalid tag", async () => {
  const mockUserId = "user-invalid-tag-id";
  const mockProjectName = "Test Project Invalid Tag";
  const mockInitialUserPromptText = "Prompt for invalid tag project.";
  const mockSelectedDomainTag = "invalid_tag_for_sure";

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainTag: mockSelectedDomainTag,
  };
  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => formData.append(key, value as string));

  const mockRequest = new Request("http://localhost/dialectic-service", { method: "POST", body: formData });

  const mockDbAdminClient: any = { from: spy() }; // from should not be called if tag is invalid before DB op
  const mockGetUserImplementation = async () => await Promise.resolve({ data: { user: { id: mockUserId } }, error: null });
  const getUserSpy = spy(mockGetUserImplementation);
  const mockCreateSupabaseClientFn = spy(() => ({ auth: { getUser: getUserSpy } }) as any);
  const mockIsValidDomainTagFn = spy(async (dbClient: any, domainTag: string): Promise<boolean> => await Promise.resolve(false)); // Simulate invalid tag

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient,
    {
      createSupabaseClient: mockCreateSupabaseClientFn,
      isValidDomainTag: mockIsValidDomainTagFn
    }
  );

  assertExists(result.error);
  assertEquals(result.error?.message, `Invalid selectedDomainTag: "${mockSelectedDomainTag}"`);
  assertEquals(result.error?.status, 400);
  assert(mockIsValidDomainTagFn.calls.length > 0);
  assertEquals(mockDbAdminClient.from.calls.length, 0); // DB insert should not be attempted
});

Deno.test("createProject - database error on insert", async () => {
  const mockUserId = "user-db-error-id";
  const mockProjectName = "Test DB Error";
  const mockInitialUserPromptText = "DB will fail.";
  const dbError = { message: "DB insert failed", code: "SOME_DB_ERROR_CODE", details: "Unique constraint violation" };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
  };
  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => formData.append(key, value as string));

  const mockRequest = new Request("http://localhost/dialectic-service", { method: "POST", body: formData });

  const mockDbAdminClient: any = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => await Promise.resolve({ data: null, error: dbError })
        })
      })
    })
  };
  const mockGetUserImplementation = async () => await Promise.resolve({ data: { user: { id: mockUserId } }, error: null });
  const getUserSpy = spy(mockGetUserImplementation);
  const mockCreateSupabaseClientFn = spy(() => ({ auth: { getUser: getUserSpy } }) as any);
  // The isValidDomainTagFn can be a simple mock here as the test focuses on DB insert error, 
  // assuming tag validation (if applicable for this path) would pass or not be the primary failure point.
  const mockIsValidDomainTagFn = spy(async (dbClient: any, domainTag: string): Promise<boolean> => await Promise.resolve(true));

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient,
    {
      createSupabaseClient: mockCreateSupabaseClientFn,
      isValidDomainTag: mockIsValidDomainTagFn
    }
  );

  assertExists(result.error);
  assertEquals(result.error?.message, "Failed to create project");
  assertEquals(result.error?.details, dbError.details);
  assertEquals(result.error?.status, 500);
  // Ensuring isValidDomainTagFn is called if a selectedDomainTag were part of formDataValues (it's not in this specific test's setup for DB error)
  // If no tag is sent, it might not be called, which is fine.
  // If a tag *was* sent and this check is important: assert(mockIsValidDomainTagFn.calls.length > 0);
});

// --- STUBS FOR NEW FILE HANDLING TESTS ---

Deno.test("createProject - successful with promptFile", async () => {
  // TODO: Implement this test
  // - FormData will include action, projectName, and a mock File for promptFile
  // - initialUserPromptText can be null/omitted
  // - Mock dbAdminClient.storage.from().upload() for success
  // - Mock dbAdminClient.from('dialectic_project_resources').insert() for success
  // - Mock dbAdminClient.from('dialectic_projects').update() for success
  // - Assert responseData has initial_prompt_resource_id set, initial_user_prompt is empty/placeholder
  assert(true, "Test not implemented");
});

Deno.test("createProject - promptFile upload fails (storage error)", async () => {
  // TODO: Implement this test
  // - Mock dbAdminClient.storage.from().upload() to return an error
  // - Assert correct error response
  assert(true, "Test not implemented");
});

Deno.test("createProject - promptFile dialectic_project_resources insert fails (db error)", async () => {
  // TODO: Implement this test
  // - Mock storage upload to succeed
  // - Mock dbAdminClient.from('dialectic_project_resources').insert() to return an error
  // - Assert dbAdminClient.storage.from().remove() is called for cleanup
  // - Assert correct error response
  assert(true, "Test not implemented");
});

Deno.test("createProject - project update with resource_id fails (db error)", async () => {
  // TODO: Implement this test
  // - Mock storage upload and resource insert to succeed
  // - Mock dbAdminClient.from('dialectic_projects').update() to return an error
  // - Assert correct error response (consider if rollback of file/resource record is needed/tested)
  assert(true, "Test not implemented");
});

Deno.test("createProject - error during isValidDomainTag check", async () => {
  const mockUserId = "user-tag-error-id";
  const mockProjectName = "Test Invalid Tag Error";
  const mockInitialUserPromptText = "This tag check will throw.";
  const mockSelectedDomainTagForError = "tag_that_causes_error_in_validation";
  const expectedErrorMessage = "DB error on domain tag check"; // Specific error from mock

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainTag: mockSelectedDomainTagForError, // Ensure this is included
  };
  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => formData.append(key, value as string));

  const mockRequest = new Request("http://localhost/dialectic-service", { method: "POST", body: formData });

  const mockDbAdminClient: any = { /* ...irrelevant for this path if validation throws... */ };
  
  const mockGetUserImplementation = async () => await Promise.resolve({ data: { user: { id: mockUserId } }, error: null });
  const getUserSpy = spy(mockGetUserImplementation);
  const mockCreateSupabaseClientFn = spy(() => ({ auth: { getUser: getUserSpy } }) as any);
  
  // This mock will throw an error
  const mockIsValidDomainTagFn = spy(async (dbClient: any, domainTag: string): Promise<boolean> => {
    throw new Error(expectedErrorMessage);
  });

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient,
    {
      createSupabaseClient: mockCreateSupabaseClientFn,
      isValidDomainTag: mockIsValidDomainTagFn
    }
  );

  assertExists(result.error);
  assertEquals(result.error?.message, "Failed to create project");
  assertEquals(result.error?.details, expectedErrorMessage); // Assert against the thrown error's message
  assertEquals(result.error?.status, 500);
  assert(mockIsValidDomainTagFn.calls.length > 0, "isValidDomainTag should have been called");
  assertEquals(mockIsValidDomainTagFn.calls[0].args[1], mockSelectedDomainTagForError);
});

Deno.test("createProject - successful project creation with domain tag and overlay", async () => {
  const MOCK_ISO_DATE_STRING = "2023-01-01T12:00:00.000Z"; // Added fixed date
  const mockUserId = "user-tag-overlay-id";
  const mockProjectName = "Test Project With Tag And Overlay";
  const mockInitialUserPromptText = "Prompt for tagged project with overlay.";
  const mockSelectedDomainTag = "software_development_tag_for_overlay";
  const mockSelectedDomainOverlayId = "overlay-uuid-for-testing-with-tag";
  
  const mockExpectedDbInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: mockSelectedDomainTag,
    selected_domain_overlay_id: mockSelectedDomainOverlayId, // Has value
    status: "new",
    initial_prompt_resource_id: null, // Explicitly null
  };

  const mockReturnedProjectData: Partial<DialecticProject> = {
    id: "project-tag-overlay-id",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_tag: mockSelectedDomainTag,
    selected_domain_overlay_id: mockSelectedDomainOverlayId, // Has value
    status: "new",
    initial_prompt_resource_id: null,
    repo_url: null, // ADDED
    created_at: MOCK_ISO_DATE_STRING, // ADDED
    updated_at: MOCK_ISO_DATE_STRING, // ADDED
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainTag: mockSelectedDomainTag,
    selectedDomainOverlayId: mockSelectedDomainOverlayId, // Ensure this is included
  };
  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => formData.append(key, value as string));

  const mockRequest = new Request("http://localhost/dialectic-service", { method: "POST", body: formData });

  const insertPayloadHolder = { payload: null as any };
  const mockDbAdminClient: any = {
    from: () => ({
      insert: spy((data: any) => {
        insertPayloadHolder.payload = data;
        return {
          select: () => ({
            single: async () => await Promise.resolve({
              data: {
                id: mockReturnedProjectData.id,
                ...data,
                repo_url: null,
                created_at: MOCK_ISO_DATE_STRING,
                updated_at: MOCK_ISO_DATE_STRING,
              },
              error: null
            })
          })
        };
      })
    })
  };
  const mockGetUserImplementation = async () => await Promise.resolve({ data: { user: { id: mockUserId } }, error: null });
  const getUserSpy = spy(mockGetUserImplementation);
  const mockCreateSupabaseClientFn = spy(() => ({ auth: { getUser: getUserSpy } }) as any);
  const mockIsValidDomainTagFn = spy(async (dbClient: any, domainTag: string): Promise<boolean> => await Promise.resolve(true));

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient,
    {
      createSupabaseClient: mockCreateSupabaseClientFn,
      isValidDomainTag: mockIsValidDomainTagFn
    }
  );

  assertExists(result.data);
  assertEquals(result.error, undefined);

  // Log objects for debugging
  console.log("typeof result.data (overlay test):", typeof result.data);
  console.log("result.data value (overlay test):", JSON.stringify(result.data, null, 2));
  console.log("typeof mockReturnedProjectData (overlay test):", typeof mockReturnedProjectData);
  console.log("mockReturnedProjectData value (overlay test):", JSON.stringify(mockReturnedProjectData, null, 2));

  // Using assertEquals for a different comparison perspective
  assertObjectMatch(result.data as any, mockReturnedProjectData as any);

  assert(mockIsValidDomainTagFn.calls.length > 0, "isValidDomainTag should be called");
  assertEquals(mockIsValidDomainTagFn.calls[0].args[1], mockSelectedDomainTag);
  assertObjectMatch(insertPayloadHolder.payload, mockExpectedDbInsert as any);
});
