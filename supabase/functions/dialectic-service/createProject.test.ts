import { assertEquals, assertExists, assert, assertObjectMatch } from "jsr:@std/assert@0.225.1";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { createProject, type CreateProjectOptions } from "./createProject.ts";
import type { CreateProjectPayload, DialecticProject } from "./dialectic.interface.ts";
import type { User } from "@supabase/supabase-js"; // Import User type
import * as domainUtils from "../_shared/domain-utils.ts"; // To mock isValidDomain
import { createMockSupabaseClient, type MockSupabaseDataConfig, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";

Deno.test("createProject - successful project creation (no file)", async () => {
  const mockUserId = "user-test-id-refactored";
  const mockProjectName = "Test Project Refactored";
  const mockInitialUserPromptText = "Create a test project refactored.";
  const mockSelectedDomainId = "domain-id-for-success";
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
    selected_domain_id: mockSelectedDomainId,
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
    selected_domain_id: mockSelectedDomainId,
    domain_name: "Software Development",
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
    selectedDomainId: mockSelectedDomainId,
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
      'dialectic_projects': {
        insert: async (state: MockQueryBuilderState) => {
          insertPayloadHolder.payload = state.insertData;
          // Simulate the data that would be returned right after insert before the join
          const insertedData = (Array.isArray(state.insertData) ? state.insertData[0] : state.insertData) as any;
          return {
            data: [{
              ...mockProjectDataAfterInsert,
              ...insertedData,
              // The database would return the domain as a nested object after the join
              domain: { name: mockProjectDataAfterInsert.domain_name },
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
    const result = await createProject(
      formData,
      mockDbAdminClient as any, // Cast to any to satisfy SupabaseClient type for testing
      mockUser,
      {}
    );

    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.error, undefined, "Error should be undefined on success");

    // We can't directly compare the object because the mock returns a slightly different shape
    // before the final mapping. Let's check key properties.
    assertEquals(result.data.id, mockProjectDataAfterInsert.id);
    assertEquals(result.data.project_name, mockProjectDataAfterInsert.project_name);
    assertEquals(result.data.selected_domain_id, mockProjectDataAfterInsert.selected_domain_id);
    assertEquals(result.data.domain_name, mockProjectDataAfterInsert.domain_name);


    assertEquals(spies.fromSpy.calls.length, 1, "fromSpy should be called once for dialectic_projects");
    assertEquals(spies.fromSpy.calls[0].args[0], 'dialectic_projects', "fromSpy called with 'dialectic_projects'");

    const projectInsertSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectInsertSpies, "Project insert spies should exist");
    assertExists(projectInsertSpies.insert, "insert spy for projects should exist");
    assertExists(projectInsertSpies.select, "select spy for projects should exist");
    assertExists(projectInsertSpies.single, "single spy for projects should exist");

    assertEquals(projectInsertSpies.insert.calls.length, 1, "insert on dialectic_projects should be called once");
    assertObjectMatch(insertPayloadHolder.payload as any, mockExpectedDbInsert as any, "Insert payload should match expected");
    assertEquals(projectInsertSpies.select.calls.length, 1, "select on dialectic_projects (after insert) should be called once");
    assertEquals(projectInsertSpies.single.calls.length, 1, "single on dialectic_projects (after insert) should be called once");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - missing selectedDomainId", async () => {
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
    // selectedDomainId is intentionally missing
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, {});

  try {
    const result = await createProject(
      formData,
      mockDbAdminClient as any,
      mockUser,
      {}
    );

    assertExists(result.error, "Error object should exist when validation fails");
    assertEquals(result.error?.message, "selectedDomainId is required");
    assertEquals(result.error?.status, 400);

    assertEquals(spies.fromSpy.calls.length, 0, "DB should not be called on validation failure");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - database error on insert", async () => {
  const mockUserId = "user-db-error-id-refactored";
  const mockProjectName = "Test DB Error Refactored";
  const mockInitialUserPromptText = "DB will fail (refactored).";
  const mockSelectedDomainId = "domain-id-for-db-fail";
  const testTimestamp = new Date().toISOString();

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
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: null,
    status: "new",
    initial_prompt_resource_id: null,
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainId: mockSelectedDomainId,
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });

  const insertPayloadHolder = { payload: null as any };
  const dbOperationErrorMessage = "Database insert mock error from config";

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'dialectic_projects': {
        insert: async (state: MockQueryBuilderState) => {
          insertPayloadHolder.payload = state.insertData;
          // Simulate the error that .single() would receive
          return {
            data: null,
            error: { name: "PostgrestError", message: dbOperationErrorMessage, code: "XXYYZ", details: dbOperationErrorMessage, hint: "Check mock config" },
            count: 0,
            status: 500,
            statusText: "Internal Server Error"
          };
        }
      }
    }
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData,
      mockDbAdminClient as any, // Cast to any to satisfy SupabaseClient type for testing
      mockUser,
      {} // No custom isValidDomain, should not be called if basic validation passes
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
    assertObjectMatch(insertPayloadHolder.payload as any, mockExpectedDbInsert as any, "Insert payload should match expected even on failure");
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
    selectedDomainId: "some-domain-id", // Add to pass other validations
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
      {} // No custom isValidDomain, should not be called
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
    selectedDomainId: "some-domain-id", // Add to pass other validations
    // initialUserPromptText is intentionally omitted
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
      {} // No custom isValidDomain, should not be called
    );

    assertExists(result.error, "Error object should exist for missing prompt");
    assertEquals(result.error?.message, "Either initialUserPromptText or a promptFile must be provided.", "Error message should indicate missing prompt text or file");
    assertEquals(result.error?.status, 400, "Error status should be 400");
    
    assertEquals(spies.fromSpy.calls.length, 0, "fromSpy should not have been called");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - with invalid selectedDomainId (FK violation)", async () => {
  const mockUserId = "user-invalid-domain-id";
  const mockProjectName = "Test Project Invalid Domain";
  const mockInitialUserPromptText = "Prompt for invalid domain project.";
  const mockInvalidDomainId = "domain-id-that-does-not-exist";
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
    selectedDomainId: mockInvalidDomainId,
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value as string);
    }
  });

  const fkErrorMessage = `insert or update on table "dialectic_projects" violates foreign key constraint "dialectic_projects_selected_domain_id_fkey"`;
  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'dialectic_projects': {
        insert: async (_state: MockQueryBuilderState) => ({
          data: null,
          error: { name: "PostgrestError", message: fkErrorMessage, code: "23503", details: "Key (selected_domain_id)=(...) is not present in table \"dialectic_domains\".", hint: "Check mock config" },
          count: 0,
          status: 409, // Conflict or similar
          statusText: "Conflict"
        })
      }
    }
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData,
      mockDbAdminClient as any,
      mockUser,
      {}
    );

    assertExists(result.error, "Error object should exist for FK violation");
    assertEquals(result.error?.message, "Invalid selectedDomainId. The specified domain does not exist.");
    assertEquals(result.error?.status, 400);
    assertEquals(result.error?.details, fkErrorMessage, "Error details should contain the original DB error");

    assertEquals(spies.fromSpy.calls.length, 1, "fromSpy should be called once");
    const projectSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectSpies?.insert, "insert should have been called");
    assertEquals(projectSpies.insert.calls.length, 1);

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - successful with promptFile", async () => {
  const mockUserId = "user-file-upload-success";
  const mockProjectName = "Test Project With File";
  const mockSelectedDomainId = "domain-id-for-file-upload";
  const mockProjectId = "project-id-for-file-upload";
  const mockResourceId = "resource-id-for-file-upload";
  const testTimestamp = new Date().toISOString();
  const mockFile = new File(["file content"], "prompt.md", { type: "text/markdown" });

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const formData = new FormData();
  formData.append("action", "createProject");
  formData.append("projectName", mockProjectName);
  formData.append("selectedDomainId", mockSelectedDomainId);
  formData.append("promptFile", mockFile);

  const mockProjectDataAfterInsert = {
    id: mockProjectId,
    user_id: mockUserId,
    project_name: mockProjectName,
    selected_domain_id: mockSelectedDomainId,
  };

  const insertPayloadHolder = { payload: null as any };
  const resourceInsertPayloadHolder = { payload: null as any };
  const uploadPayloadHolder = { path: '', file: {} as File };

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'dialectic_projects': {
        insert: async (state) => {
          const insertedData = state.insertData as any;
          return { data: [{ ...mockProjectDataAfterInsert, ...insertedData, domain: { name: "File Upload Domain" } }], error: null };
        },
        update: async (state: MockQueryBuilderState) => {
          const updateData = state.updateData;
          return { data: [{ ...mockProjectDataAfterInsert, ...(updateData as any), domain: { name: "File Upload Domain" } }], error: null };
        },
      },
      'dialectic_project_resources': {
        insert: async (state: MockQueryBuilderState) => {
          const data = state.insertData;
          if (!data || Array.isArray(data)) throw new Error("Invalid insert data in mock for resources");
          resourceInsertPayloadHolder.payload = data;
          return { data: [{ id: (data as any).id }], error: null };
        },
      },
    },
    storageMock: {
      uploadResult: async (bucketId, path, file) => {
        uploadPayloadHolder.path = path;
        uploadPayloadHolder.file = file as File;
        return { data: { path: path }, error: null };
      },
    },
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData,
      mockDbAdminClient as any,
      mockUser,
      {}
    );

    assertExists(result.data, "Data should exist on successful file upload");
    assertEquals(result.error, undefined, "Error should be undefined on success");

    const projectSpiesList = spies.getAllQueryBuilderSpies('dialectic_projects');
    assertExists(projectSpiesList, "Should have spies for dialectic_projects");
    assertEquals(projectSpiesList.length, 2, "Should have two builders for insert and update");
    
    const insertSpies = projectSpiesList[0];
    const updateSpies = projectSpiesList[1];

    assertExists(insertSpies.insert);
    assertEquals(insertSpies.insert.calls.length, 1);

    assertExists(updateSpies.update);
    assertEquals(updateSpies.update.calls.length, 1);
    assertExists(updateSpies.update.calls[0].args[0].initial_prompt_resource_id);


    const resourceSpies = spies.getLatestQueryBuilderSpies('dialectic_project_resources');
    assertExists(resourceSpies?.insert);
    assertEquals(resourceSpies.insert.calls.length, 1);
    assertEquals(resourceInsertPayloadHolder.payload.file_name, mockFile.name);

    const bucketSpies = spies.storage.from('dialectic-contributions');
    assertExists(bucketSpies.uploadSpy);
    assertEquals(bucketSpies.uploadSpy.calls.length, 1);
    assert(uploadPayloadHolder.path.includes(mockProjectId));
    assert(uploadPayloadHolder.path.includes(mockFile.name));
    assertEquals(uploadPayloadHolder.file.name, mockFile.name);

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});


Deno.test("createProject - promptFile upload fails (storage error)", async () => {
  const mockUserId = "user-file-upload-fail-storage";
  const mockProjectName = "Test Project File Storage Fail";
  const mockSelectedDomainId = "domain-id-for-file-fail";
  const mockProjectId = "project-id-for-file-fail";
  const testTimestamp = new Date().toISOString();

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const mockFile = new File(["test content"], "prompt-fail.md", { type: "text/markdown" });
  const formData = new FormData();
  formData.append("action", "createProject");
  formData.append("projectName", mockProjectName);
  formData.append("selectedDomainId", mockSelectedDomainId);
  formData.append("promptFile", mockFile);

  const mockProjectDataAfterInsert = {
    id: mockProjectId,
    user_id: mockUserId,
    project_name: mockProjectName,
    selected_domain_id: mockSelectedDomainId,
  };

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'dialectic_projects': {
        insert: async (state) => ({ data: [{ ...mockProjectDataAfterInsert, ...state.insertData as any, domain: { name: "File Fail Domain" } }], error: null }),
      },
    },
    storageMock: {
      uploadResult: async () => ({ data: null, error: new Error("Storage upload mock error") }),
    },
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData,
      mockDbAdminClient as any,
      mockUser,
      {}
    );

    assertExists(result.error, "Error object should exist on storage failure");
    assertEquals(result.error.message, "Failed to upload initial prompt file.");

    const projectSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectSpies?.insert, "Insert spy should exist");
    assertEquals(projectSpies.insert.calls.length, 1, "Project should be inserted once");

    assertExists(projectSpies?.update, "Update spy should exist");
    assertEquals(projectSpies.update.calls.length, 0, "Project should not be updated");

    const resourceSpies = spies.getLatestQueryBuilderSpies('dialectic_project_resources');
    assertEquals(resourceSpies?.insert?.calls.length, undefined, "Resource insert should not be attempted");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});


Deno.test("createProject - promptFile dialectic_project_resources insert fails (db error)", async () => {
  const mockUserId = "user-file-fail-resource-db";
  const mockProjectName = "Test Project Resource DB Fail";
  const mockSelectedDomainId = "domain-id-resource-db-fail";
  const mockProjectId = "project-id-resource-db-fail";
  const testTimestamp = new Date().toISOString();

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const mockFile = new File(["test content"], "prompt-res-db-fail.md", { type: "text/markdown" });
  const formData = new FormData();
  formData.append("action", "createProject");
  formData.append("projectName", mockProjectName);
  formData.append("selectedDomainId", mockSelectedDomainId);
  formData.append("promptFile", mockFile);

  const mockProjectDataAfterInsert = {
    id: mockProjectId,
    user_id: mockUserId,
    project_name: mockProjectName,
    selected_domain_id: mockSelectedDomainId,
  };

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'dialectic_projects': {
        insert: async (state) => ({ data: [{ ...mockProjectDataAfterInsert, ...state.insertData as any, domain: { name: "Resource DB Fail Domain" } }], error: null }),
      },
      'dialectic_project_resources': {
        insert: async () => ({ data: null, error: { name: "PostgrestError", message: "Resource DB insert mock error", code: "XXYYZ", details: "details", hint: "hint" } as any }),
      },
    },
    storageMock: {
      uploadResult: async (bucket, path) => ({ data: { path }, error: null }),
    },
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData,
      mockDbAdminClient as any,
      mockUser,
      {}
    );

    assertExists(result.error);
    assertEquals(result.error.message, "Failed to record prompt file resource.");

    const bucketSpies = spies.storage.from('dialectic-contributions');
    assertExists(bucketSpies.removeSpy, "Remove spy should exist");
    assertEquals(bucketSpies.removeSpy.calls.length, 1, "Storage remove should be called on resource DB failure");

    const projectSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectSpies?.update);
    assertEquals(projectSpies.update.calls.length, 0, "Project should not be updated if resource insert fails");
  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});


Deno.test("createProject - project update with resource_id fails (db error)", async () => {
  const mockUserId = "user-file-fail-project-update";
  const mockProjectName = "Test Project Update Fail";
  const mockSelectedDomainId = "domain-id-project-update-fail";
  const mockProjectId = "project-id-project-update-fail";
  const testTimestamp = new Date().toISOString();

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const mockFile = new File(["test content"], "prompt-proj-update-fail.md", { type: "text/markdown" });
  const formData = new FormData();
  formData.append("action", "createProject");
  formData.append("projectName", mockProjectName);
  formData.append("selectedDomainId", mockSelectedDomainId);
  formData.append("promptFile", mockFile);

  const mockProjectDataAfterInsert = {
    id: mockProjectId,
    user_id: mockUserId,
    project_name: mockProjectName,
    selected_domain_id: mockSelectedDomainId,
  };

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'dialectic_projects': {
        insert: async (state) => ({ data: [{ ...mockProjectDataAfterInsert, ...state.insertData as any, domain: { name: "Project Update Fail Domain" } }], error: null }),
        update: async () => ({ data: null, error: { name: "PostgrestError", message: "Project update mock error", code: "XXYYZ", details: "details", hint: "hint" } as any }),
      },
      'dialectic_project_resources': {
        insert: async (state) => {
          const data = state.insertData;
          if (!data || Array.isArray(data)) throw new Error("Invalid insert data in mock");
          return { data: [{ id: (data as any).id }], error: null };
        },
      },
    },
    storageMock: {
      uploadResult: async (bucket, path) => ({ data: { path }, error: null }),
    },
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData,
      mockDbAdminClient as any,
      mockUser,
      {}
    );

    assertExists(result.error);
    assertEquals(result.error.message, "Failed to finalize project with file resource.");

    const bucketSpies = spies.storage.from('dialectic-contributions');
    assertExists(bucketSpies.removeSpy);
    assertEquals(bucketSpies.removeSpy.calls.length, 0, "Storage remove should NOT be called on project update failure");

    const projectSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectSpies?.update);
    assertEquals(projectSpies.update.calls.length, 1, "Project update should be attempted once");
  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});


Deno.test("createProject - successful project creation with domain and overlay", async () => {
  const mockUserId = "user-domain-overlay-id-refactored";
  const mockProjectName = "Test Project With Domain And Overlay Refactored";
  const mockInitialUserPromptText = "Prompt for domain project with overlay refactored.";
  const mockSelectedDomainId = "domain-id-for-overlay-test";
  const mockSelectedDomainOverlayId = "overlay-uuid-for-testing-with-domain-refactored";
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
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
  };

  const mockProjectDataAfterInsert: DialecticProject = {
    id: "project-test-id-with-domain-overlay",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: mockInitialUserPromptText,
    selected_domain_id: mockSelectedDomainId,
    domain_name: "Domain For Overlay",
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    repo_url: null,
    status: "new",
    created_at: testTimestamp,
    updated_at: testTimestamp,
    initial_prompt_resource_id: null,
  };

  const formDataValues = {
    action: "createProject",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainId: mockSelectedDomainId,
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
      'dialectic_projects': {
        insert: async (state: MockQueryBuilderState) => {
          insertPayloadHolder.payload = state.insertData;
          const insertedData = (Array.isArray(state.insertData) ? state.insertData[0] : state.insertData) as any;
          if (!insertedData) throw new Error("Mock insert received no data");
          return {
            data: [{
              ...mockProjectDataAfterInsert,
              ...insertedData,
              domain: { name: mockProjectDataAfterInsert.domain_name },
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
    const result = await createProject(
      formData,
      mockDbAdminClient as any,
      mockUser,
      {}
    );

    assertExists(result.data, "result.data should exist");
    assertEquals(result.data.selected_domain_id, mockSelectedDomainId);
    assertEquals(result.data.selected_domain_overlay_id, mockSelectedDomainOverlayId);
    assertEquals(result.data.project_name, mockProjectName);

    const projectInsertSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectInsertSpies?.insert);
    assertEquals(projectInsertSpies.insert.calls.length, 1);
    assertObjectMatch(insertPayloadHolder.payload as any, mockExpectedDbInsert as any);

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});
