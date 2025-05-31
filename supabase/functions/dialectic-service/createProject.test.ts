import { assertEquals, assertExists, assert, assertObjectMatch } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { stub, spy, type Stub } from "jsr:@std/testing@0.225.1/mock";
import { createProject, type CreateProjectOptions } from "./createProject.ts";
import type { CreateProjectPayload } from "./dialectic.interface.ts";
import * as sharedAuth from "../_shared/auth.ts"; // To mock createSupabaseClient
import * as domainUtils from "../_shared/domain-utils.ts"; // To mock isValidDomainTag

Deno.test("createProject - successful project creation", async () => {
  const mockUserId = "user-test-id";
  const mockProjectName = "Test Project";
  const mockInitialUserPrompt = "Create a test project.";
  // const mockSelectedDomainTag = "test_domain"; // Keep for expectedBody if re-enabled

  const mockNewProjectData = {
    id: "project-test-id",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPrompt,
    selected_domain_tag: null, // Reflecting that it won't be passed for this isolation test
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockPayload: CreateProjectPayload = {
    projectName: mockProjectName,
    initialUserPrompt: mockInitialUserPrompt,
    // selected_domain_tag: mockSelectedDomainTag, // Will be removed from testPayload
  };

  const mockRequest = new Request("http://localhost/createProject", {
    method: "POST",
    // body will use testPayload which won't have selected_domain_tag
    headers: { "Content-Type": "application/json" },
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
                  // Adjust mockNewProjectData to not expect selected_domain_tag if it was removed from payload
                  return await Promise.resolve({ data: {
                    ...mockNewProjectData,
                    // selected_domain_tag is already null in mockNewProjectData if we remove it from payload
                  }, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  
  const mockGetUserImplementation = async () => {
    return await Promise.resolve({ data: { user: { id: mockUserId } }, error: null });
  };
  const getUserSpy = spy(mockGetUserImplementation);

  const mockAuthObject = { 
    getUser: getUserSpy 
  };
  
  const mockSupabaseUserClient = { 
    auth: mockAuthObject
  };

  // Create a spy for our mock createSupabaseClient function
  const mockCreateSupabaseClientFn = spy(() => mockSupabaseUserClient as any);

  // Mock for isValidDomainTag (not relevant for this specific test as selected_domain_tag is not provided)
  // If selected_domain_tag were provided, this would need to return true.
  const mockIsValidDomainTagFn = spy(async () => await Promise.resolve(true)); 

  try {
    const testPayload = { ...mockPayload }; 
    delete testPayload.selected_domain_tag; 
    
    const currentMockRequest = new Request(mockRequest.url, {
        method: mockRequest.method,
        headers: mockRequest.headers,
        body: JSON.stringify(testPayload)
    });

    const result = await createProject(
      currentMockRequest, 
      mockDbAdminClient, 
      testPayload,
      {
        createSupabaseClient: mockCreateSupabaseClientFn,
        isValidDomainTag: mockIsValidDomainTagFn // Pass the mock
      }
    );

    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.error, undefined, "Error should be undefined on success");
    assertEquals(result.data, mockNewProjectData); // mockNewProjectData has selected_domain_tag: null

    assert(getUserSpy.calls.length > 0, "getUserSpy should have been called"); 

    assert(fromCalled, "from() should have been called on dbAdminClient");
    assertExists(insertCalledWith, "insert() should have been called on dbAdminClient");
    assertEquals(insertCalledWith, {
      user_id: mockUserId,
      project_name: mockProjectName,
      initial_user_prompt: mockInitialUserPrompt,
      selected_domain_tag: undefined, // Because it was deleted from testPayload
    });
    assert(selectCalled, "select() should have been called on dbAdminClient");
    assert(singleCalled, "single() should have been called on dbAdminClient");
    
    // assert(isValidDomainTagStub.calls.length > 0, "isValidDomainTagStub should have been called");
    // assertEquals(isValidDomainTagStub.calls[0].args[0], mockDbAdminClient);
    // assertEquals(isValidDomainTagStub.calls[0].args[1], mockSelectedDomainTag); // Would need original mockSelectedDomainTag here

    // Assert that our mock createSupabaseClient function was called
    assert(mockCreateSupabaseClientFn.calls.length > 0, "mockCreateSupabaseClientFn should have been called");
    // Assert isValidDomainTag was not called as selected_domain_tag is undefined
    assertEquals(mockIsValidDomainTagFn.calls.length, 0, "mockIsValidDomainTagFn should not have been called");

  } finally {
    // No longer need to restore createSupabaseClientStub as it's removed
    // createSupabaseClientStub.restore();
    // isValidDomainTagStub.restore();
  }
});

Deno.test("createProject - user not authenticated", async () => {
  const mockProjectName = "Test Project Auth Fail";
  const mockInitialUserPrompt = "This should fail.";

  const mockPayload: CreateProjectPayload = {
    projectName: mockProjectName,
    initialUserPrompt: mockInitialUserPrompt,
  };

  const mockRequest = new Request("http://localhost/createProject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockPayload)
  });

  // Mock for dbAdminClient (may not be strictly needed if auth fails early, but good for consistency)
  const mockDbAdminClient: any = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => await Promise.resolve({ data: null, error: { message: "Should not be called" } })
        })
      })
    })
  };

  // Mock Supabase client that simulates auth failure
  const mockAuthErrorUserClient = {
    auth: {
      getUser: async () => await Promise.resolve({ data: { user: null }, error: { message: "Auth error" } })
    }
  };
  const mockCreateSupabaseClientAuthErrorFn = spy(() => mockAuthErrorUserClient as any);
  const mockIsValidDomainTagFn = spy(async () => await Promise.resolve(true)); // Should not be called

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient, 
    mockPayload,
    {
      createSupabaseClient: mockCreateSupabaseClientAuthErrorFn,
      isValidDomainTag: mockIsValidDomainTagFn // Pass the mock
    }
  );

  assertExists(result.error, "Error object should exist on auth failure");
  assertEquals(result.error?.message, "User not authenticated");
  assertEquals(result.error?.status, 401);
  assert(mockCreateSupabaseClientAuthErrorFn.calls.length > 0, "mockCreateSupabaseClientAuthErrorFn should have been called");
  assertEquals(mockIsValidDomainTagFn.calls.length, 0, "mockIsValidDomainTagFn should not be called on auth failure");
});

Deno.test("createProject - missing projectName", async () => {
  const mockInitialUserPrompt = "This should also fail.";

  // Payload with projectName missing
  const mockPayload: any = { // Use 'any' to allow missing properties for testing
    initialUserPrompt: mockInitialUserPrompt,
  };

  const mockRequest = new Request("http://localhost/createProject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockPayload)
  });

  const mockDbAdminClient: any = {}; 
  const mockSupabaseUserClient: any = {}; 
  const mockIsValidDomainTagFn = spy(async () => await Promise.resolve(true)); // Should not be called

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient, 
    mockPayload as CreateProjectPayload, 
    {
      createSupabaseClient: spy(() => mockSupabaseUserClient),
      isValidDomainTag: mockIsValidDomainTagFn // Pass the mock
    }
  );

  assertExists(result.error, "Error object should exist for missing projectName");
  assertEquals(result.error?.message, "projectName and initialUserPrompt are required");
  assertEquals(result.error?.status, 400);
  assertEquals(mockIsValidDomainTagFn.calls.length, 0, "mockIsValidDomainTagFn should not be called on missing projectName");
});

Deno.test("createProject - missing initialUserPrompt", async () => {
  const mockProjectName = "Test Project No Prompt";

  // Payload with initialUserPrompt missing
  const mockPayload: any = { // Use 'any' to allow missing properties for testing
    projectName: mockProjectName,
  };

  const mockRequest = new Request("http://localhost/createProject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockPayload)
  });

  const mockDbAdminClient: any = {}; 
  const mockSupabaseUserClient: any = {};
  const mockIsValidDomainTagFn = spy(async () => await Promise.resolve(true)); // Should not be called

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient, 
    mockPayload as CreateProjectPayload,
    {
      createSupabaseClient: spy(() => mockSupabaseUserClient),
      isValidDomainTag: mockIsValidDomainTagFn // Pass the mock
    }
  );

  assertExists(result.error, "Error object should exist for missing initialUserPrompt");
  assertEquals(result.error?.message, "projectName and initialUserPrompt are required");
  assertEquals(result.error?.status, 400);
  assertEquals(mockIsValidDomainTagFn.calls.length, 0, "mockIsValidDomainTagFn should not be called on missing initialUserPrompt");
});

Deno.test("createProject - invalid selected_domain_tag", async () => {
  const mockUserId = "user-test-id-valid-tag-check";
  const mockProjectName = "Test Project Invalid Tag";
  const mockInitialUserPrompt = "This should fail due to invalid tag.";
  const mockSelectedDomainTag = "invalid_domain_tag";

  const mockPayload: CreateProjectPayload = {
    projectName: mockProjectName,
    initialUserPrompt: mockInitialUserPrompt,
    selected_domain_tag: mockSelectedDomainTag,
  };

  const mockRequest = new Request("http://localhost/createProject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockPayload)
  });

  // Mock for dbAdminClient (needed by isValidDomainTag)
  const mockDbAdminClient: any = {}; // Actual implementation of dbAdminClient doesn't matter here as isValidDomainTag is mocked

  // Mock Supabase client for successful auth
  const mockGoodUserClient = {
    auth: {
      getUser: async () => await Promise.resolve({ data: { user: { id: mockUserId } }, error: null })
    }
  };
  const mockCreateSupabaseClientGoodAuthFn = spy(() => mockGoodUserClient as any);

  // Mock isValidDomainTag to return false
  const mockIsValidDomainTagReturnsFalseFn = spy(async () => await Promise.resolve(false));

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient, 
    mockPayload,
    {
      createSupabaseClient: mockCreateSupabaseClientGoodAuthFn,
      isValidDomainTag: mockIsValidDomainTagReturnsFalseFn
    }
  );

  assertExists(result.error, "Error object should exist for invalid selected_domain_tag");
  assertEquals(result.error?.message, `Invalid selectedDomainTag: "${mockSelectedDomainTag}"`);
  assertEquals(result.error?.status, 400);
  assert(mockCreateSupabaseClientGoodAuthFn.calls.length > 0, "mockCreateSupabaseClientGoodAuthFn should have been called");
  
  assertEquals(mockIsValidDomainTagReturnsFalseFn.calls.length, 1, "mockIsValidDomainTagReturnsFalseFn should have been called once");
  const firstCallInvalidTag = mockIsValidDomainTagReturnsFalseFn.calls[0];
  assertExists(firstCallInvalidTag, "First call to mockIsValidDomainTagReturnsFalseFn should exist");
  assertEquals(firstCallInvalidTag.args.length, 2, "mockIsValidDomainTagReturnsFalseFn should be called with two arguments");
  assertEquals((firstCallInvalidTag.args as any[])[0], mockDbAdminClient);
  assertEquals((firstCallInvalidTag.args as any[])[1], mockSelectedDomainTag);
});

Deno.test("createProject - successful with valid selected_domain_tag", async () => {
  const mockUserId = "user-id-domain-tag-success";
  const mockProjectName = "Test Project Valid Tag";
  const mockInitialUserPrompt = "Create a project with a domain tag.";
  const mockSelectedDomainTag = "valid_domain_tag";

  const mockNewProjectDataWithTag = {
    id: "project-id-tag-success",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPrompt,
    selected_domain_tag: mockSelectedDomainTag, // Expect tag to be present
    status: "active",
    created_at: new Date().toISOString(), // Approximate, exact match not always feasible/needed
    updated_at: new Date().toISOString(), // Approximate
  };

  const mockPayload: CreateProjectPayload = {
    projectName: mockProjectName,
    initialUserPrompt: mockInitialUserPrompt,
    selected_domain_tag: mockSelectedDomainTag,
  };

  const mockRequest = new Request("http://localhost/createProject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockPayload)
  });

  const mockDbAdminClient: any = {
    from: (tableName: string) => {
      assertEquals(tableName, "dialectic_projects");
      return {
        insert: (data: any) => {
          // Check that selected_domain_tag is included in the insert data
          assertEquals(data.selected_domain_tag, mockSelectedDomainTag);
          return {
            select: () => ({
              single: async () => await Promise.resolve({ data: mockNewProjectDataWithTag, error: null })
            })
          };
        },
      };
    },
  };
  
  const mockGoodUserClient = {
    auth: {
      getUser: async () => await Promise.resolve({ data: { user: { id: mockUserId } }, error: null })
    }
  };
  const mockCreateSupabaseClientFn = spy(() => mockGoodUserClient as any);
  const mockIsValidDomainTagReturnsTrueFn = spy(async () => await Promise.resolve(true));

  const result = await createProject(
    mockRequest, 
    mockDbAdminClient, 
    mockPayload,
    {
      createSupabaseClient: mockCreateSupabaseClientFn,
      isValidDomainTag: mockIsValidDomainTagReturnsTrueFn
    }
  );

  assertExists(result.data, "Response data should exist on success");
  assertExists(result.data?.created_at);
  assertExists(result.data?.updated_at);
  assertObjectMatch(result.data as object, { 
    id: mockNewProjectDataWithTag.id,
    user_id: mockNewProjectDataWithTag.user_id,
    project_name: mockNewProjectDataWithTag.project_name,
    initial_user_prompt: mockNewProjectDataWithTag.initial_user_prompt,
    selected_domain_tag: mockNewProjectDataWithTag.selected_domain_tag,
    status: mockNewProjectDataWithTag.status,
  });

  assert(mockCreateSupabaseClientFn.calls.length > 0, "mockCreateSupabaseClientFn should have been called");
  
  assertEquals(mockIsValidDomainTagReturnsTrueFn.calls.length, 1, "mockIsValidDomainTagReturnsTrueFn should be called once");
  const firstCallValidTag = mockIsValidDomainTagReturnsTrueFn.calls[0];
  assertExists(firstCallValidTag, "First call to mockIsValidDomainTagReturnsTrueFn should exist");
  assertEquals(firstCallValidTag.args.length, 2, "mockIsValidDomainTagReturnsTrueFn should be called with two arguments");
  assertEquals((firstCallValidTag.args as any[])[0], mockDbAdminClient);
  assertEquals((firstCallValidTag.args as any[])[1], mockSelectedDomainTag);
});

Deno.test("createProject - database error during project creation", async () => {
  const mockUserId = "user-id-db-error";
  const mockProjectName = "Test Project DB Error";
  const mockInitialUserPrompt = "This should cause a DB error.";

  const mockPayload: CreateProjectPayload = {
    projectName: mockProjectName,
    initialUserPrompt: mockInitialUserPrompt,
    // No selected_domain_tag for simplicity in this DB error test
  };

  const mockRequest = new Request("http://localhost/createProject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockPayload)
  });

  const dbErrorMessage = "Simulated database insertion error";
  const mockDbAdminClientError: any = {
    from: (tableName: string) => {
      assertEquals(tableName, "dialectic_projects");
      return {
        insert: (data: any) => {
          return {
            select: () => ({
              single: async () => await Promise.resolve({ data: null, error: { message: dbErrorMessage, details: "DB constraint failed" } })
            })
          };
        },
      };
    },
  };
  
  const mockGoodUserClient = {
    auth: {
      getUser: async () => await Promise.resolve({ data: { user: { id: mockUserId } }, error: null })
    }
  };
  const mockCreateSupabaseClientFn = spy(() => mockGoodUserClient as any);
  // isValidDomainTag won't be called if no selected_domain_tag is in payload
  const mockIsValidDomainTagFn = spy(async () => await Promise.resolve(true)); 

  const result = await createProject(
    mockRequest, 
    mockDbAdminClientError, // Use the client that simulates a DB error
    mockPayload,
    {
      createSupabaseClient: mockCreateSupabaseClientFn,
      isValidDomainTag: mockIsValidDomainTagFn
    }
  );

  assertExists(result.error, "Error object should exist on DB failure");
  assertEquals(result.error?.message, "Failed to create project");
  assertEquals(result.error?.status, 500);
  assertExists(result.error?.details, "Error details should exist on DB failure");
  assertEquals(result.error.details, dbErrorMessage, "Error details should match the DB error message");

  assert(mockCreateSupabaseClientFn.calls.length > 0, "mockCreateSupabaseClientFn should have been called");
  assertEquals(mockIsValidDomainTagFn.calls.length, 0, "mockIsValidDomainTagFn should not be called if no tag in payload");
});
