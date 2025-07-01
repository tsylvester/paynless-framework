import { assertEquals, assertExists, assert, assertObjectMatch } from "jsr:@std/assert@0.225.1";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { createProject, type CreateProjectOptions } from "./createProject.ts";
import type { CreateProjectPayload, DialecticProject } from "./dialectic.interface.ts";
import type { User } from "@supabase/supabase-js"; // Import User type
import type { FileOptions } from "npm:@supabase/storage-js@^2.5.5"; // Added this import
import type { IMockStorageFileOptions } from "../_shared/supabase.mock.ts"; // Added this import
import * as domainUtils from "../_shared/domain-utils.ts"; // To mock isValidDomain
import { createMockSupabaseClient, type MockSupabaseDataConfig, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";

Deno.test("createProject - successful project creation (no file)", async () => {
  const mockUserId = "user-test-id-refactored";
  const mockProjectName = "Test Project Refactored";
  const mockInitialUserPromptText = "Create a test project refactored.";
  const mockSelectedDomainId = "domain-id-for-success";
  const mockSelectedDomainOverlayId = "overlay-uuid-for-testing-refactored";
  const mockProcessTemplateId = "proc-template-uuid-default";
  const testTimestamp = new Date().toISOString();

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const mockProjectResourceId = "res-uuid-for-string-upload";

  const mockExpectedDbInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "", // Always empty now - content stored as file
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    process_template_id: mockProcessTemplateId,
    status: "new",
    initial_prompt_resource_id: null,
  };

  // This is what the .single() call after insert should resolve to
  const mockProjectDataAfterInsert: DialecticProject = {
    id: "project-test-id-refactored",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "", // Always empty now - content stored as file
    selected_domain_id: mockSelectedDomainId,
    domain_name: "Software Development",
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    repo_url: null,
    status: "new",
    created_at: testTimestamp, // Use consistent timestamp
    updated_at: testTimestamp, // Use consistent timestamp
    initial_prompt_resource_id: mockProjectResourceId,
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
      'domain_process_associations': {
        select: async () => ({
          data: [{ process_template_id: mockProcessTemplateId }],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        })
      },
      'dialectic_projects': {
        insert: async (state: MockQueryBuilderState) => {
          insertPayloadHolder.payload = state.insertData;
          // Simulate the data that would be returned right after insert before the join
          const insertedData = (Array.isArray(state.insertData) ? state.insertData[0] : state.insertData) as any;
          return {
            data: [{
              ...mockProjectDataAfterInsert,
              ...insertedData,
              initial_prompt_resource_id: null, // Still null at insert time
              // The database would return the domain as a nested object after the join
              domain: { name: mockProjectDataAfterInsert.domain_name },
            }],
            error: null,
            count: 1,
            status: 201,
            statusText: 'Created'
          };
        },
        update: async (state: MockQueryBuilderState) => {
          const updatedData = state.updateData as any;
          return {
            data: [{
              ...mockProjectDataAfterInsert,
              ...updatedData,
              domain: { name: mockProjectDataAfterInsert.domain_name },
              // Don't include process_template here to trigger final select
            }],
            error: null,
            count: 1,
            status: 200,
            statusText: 'OK'
          };
        },
        select: async (_state: MockQueryBuilderState) => {
          // This mock handles the final .select() call to get the full project details
          return {
            data: [{
              ...mockProjectDataAfterInsert,
              process_template: { id: mockProcessTemplateId, name: 'Default Mock Process' }
            }],
            error: null, count: 1, status: 200, statusText: 'OK'
          };
        }
      },
      'dialectic_project_resources': {
        insert: async () => ({
          data: [{ id: mockProjectResourceId, storage_path: 'mock/storage/path/prompt.md' }],
          error: null,
          count: 1,
          status: 201,
          statusText: 'Created'
        })
      }
    },
    storageMock: {
      uploadResult: async (bucketId: string, _path: string, _body: unknown, _options?: IMockStorageFileOptions) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for upload") };
        }
        return { data: { path: 'mock/storage/path/prompt.md' }, error: null };
      },
      removeResult: async (bucketId: string, _paths: string[]) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for remove") };
        }
        return { data: [], error: null };
      }
    },
    mockUser: mockUser,
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

    assertExists(result.data.process_template, "process_template should exist on the returned project data");
    assertEquals(result.data.process_template?.id, mockProcessTemplateId);
    assertEquals(result.data.initial_prompt_resource_id, mockProjectResourceId, "initial_prompt_resource_id should be set");
    assertEquals(result.data.initial_user_prompt, "", "initial_user_prompt should be empty since content is stored as file");

    assertEquals(spies.fromSpy.calls.length, 5, "fromSpy should be called 5 times (assoc, projects insert, resources insert, projects update, projects select)");
    assertEquals(spies.fromSpy.calls[0].args[0], 'domain_process_associations', "First from call should be for 'domain_process_associations'");
    assertEquals(spies.fromSpy.calls[1].args[0], 'dialectic_projects', "Second from call should be for 'dialectic_projects' (insert)");
    assertEquals(spies.fromSpy.calls[2].args[0], 'dialectic_project_resources', "Third from call should be for 'dialectic_project_resources'");
    assertEquals(spies.fromSpy.calls[3].args[0], 'dialectic_projects', "Fourth from call should be for 'dialectic_projects' (update)");
    assertEquals(spies.fromSpy.calls[4].args[0], 'dialectic_projects', "Fifth from call should be for 'dialectic_projects' (final select)");

    // We can check the insert payload was correct via the holder.
    assertObjectMatch(insertPayloadHolder.payload as any, mockExpectedDbInsert as any, "Insert payload should match expected");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - missing selectedDomainId", async () => {
  const mockUserId = "user-auth-fail-id-refactored";
  const mockProjectName = "Test Project Auth Fail Refactored";
  const mockInitialUserPromptText = "This should fail (refactored).";
  const mockProcessTemplateId = "proc-template-for-auth-fail";
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
  const mockProcessTemplateId = "proc-template-for-db-fail";
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
    initial_user_prompt: "", // Always empty now - content stored as file
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: null,
    process_template_id: mockProcessTemplateId,
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
      'domain_process_associations': {
        select: async () => ({
          data: [{ process_template_id: mockProcessTemplateId }],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        })
      },
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

    assertEquals(spies.fromSpy.calls.length, 2, "fromSpy should be called twice (assoc and projects)");
    assertEquals(spies.fromSpy.calls[0].args[0], 'domain_process_associations');
    assertEquals(spies.fromSpy.calls[1].args[0], 'dialectic_projects');

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
  const mockProcessTemplateId = "proc-template-for-missing-project";
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
  const mockProcessTemplateId = "proc-template-for-no-prompt";
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
  const mockSelectedDomainId = "domain-id-that-does-not-exist";
  const mockProcessTemplateId = "proc-template-for-invalid-domain";
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
    selectedDomainId: mockSelectedDomainId,
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
      'domain_process_associations': {
        select: async () => ({
          data: [{ process_template_id: mockProcessTemplateId }],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        })
      },
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

    assertEquals(spies.fromSpy.calls.length, 2, "fromSpy should be called twice (assoc and projects)");
    const projectSpies = spies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(projectSpies?.insert, "insert should have been called");
    assertEquals(projectSpies.insert.calls.length, 1);

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - no default process template found for domain", async () => {
  const mockUserId = "user-no-default-process";
  const mockProjectName = "Test No Default Process";
  const mockSelectedDomainId = "domain-with-no-default-process";
  const mockUser = { id: mockUserId, created_at: new Date().toISOString(), aud: 'authenticated', app_metadata: {}, user_metadata: {} };
  
  const formData = new FormData();
  formData.append('projectName', mockProjectName);
  formData.append('initialUserPromptText', "A prompt");
  formData.append('selectedDomainId', mockSelectedDomainId);

  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'domain_process_associations': {
        select: async () => ({ // Mock the case where no default is found
          data: [],
          error: null,
          count: 0,
          status: 200,
          statusText: 'OK'
        })
      }
    }
  };
  
  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);
  
  try {
    const result = await createProject(formData, mockDbAdminClient as any, mockUser, {});
    assertExists(result.error, "Error should exist when no default process is found");
    assertEquals(result.error?.message, "Could not find a default process template for the selected domain.");
    assertEquals(result.error?.status, 400);
  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - successful with promptFile", async () => {
  const mockUserId = "user-file-upload-success";
  const mockProjectName = "Test Project With File";
  const mockSelectedDomainId = "domain-id-for-file-upload";
  const mockProcessTemplateId = "proc-template-for-file-upload";
  const testTimestamp = new Date().toISOString();
  const mockFile = new File(["file content"], "prompt.txt", { type: "text/plain" });
  const mockProjectResourceId = "res-uuid-for-file-upload";

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const mockExpectedInitialDbInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "", // Should be empty when file is provided
    selected_domain_id: mockSelectedDomainId,
    process_template_id: mockProcessTemplateId,
    selected_domain_overlay_id: null,
    status: "new",
    initial_prompt_resource_id: null, // Null on first insert
  };

  const formData = new FormData();
  formData.append('projectName', mockProjectName);
  formData.append('initialUserPromptText', "");
  formData.append('selectedDomainId', mockSelectedDomainId);
  formData.append('promptFile', mockFile);

  const insertPayloadHolder = { payload: null as any };
  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'domain_process_associations': {
        select: async () => ({ data: [{ process_template_id: mockProcessTemplateId }], error: null, count: 1 })
      },
      'dialectic_projects': {
        insert: async (state: MockQueryBuilderState) => {
           insertPayloadHolder.payload = state.insertData;
           const insertedData = (Array.isArray(state.insertData) ? state.insertData[0] : state.insertData) as any;
          return {
            data: [{ id: 'temp-project-id', ...insertedData, domain: { name: 'File Domain' } }],
            error: null
          };
        },
        select: async (_state: MockQueryBuilderState) => {
          return {
            data: [{
              id: 'temp-project-id',
              ...mockExpectedInitialDbInsert,
              initial_prompt_resource_id: mockProjectResourceId,
              domain: { name: 'File Domain' },
              process_template: { id: mockProcessTemplateId, name: 'File Mock Process' }
            }],
            error: null, count: 1, status: 200, statusText: 'OK'
          };
        },
        update: async (state: MockQueryBuilderState) => {
          const updatedData = state.updateData as any;
          return {
            data: [{ id: 'temp-project-id', ...mockExpectedInitialDbInsert, ...updatedData, domain: { name: 'File Domain' } }],
            error: null
          };
        }
      },
      'dialectic_project_resources': {
        insert: async () => ({ data: [{ id: mockProjectResourceId, storage_path: 'mock/storage/path/prompt.txt' }], error: null })
      }
    },
    storageMock: {
      uploadResult: async (bucketId: string, _path: string, _body: unknown, _options?: IMockStorageFileOptions) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for upload") };
        }
        return { data: { path: 'mock/storage/path/prompt.txt' }, error: null };
      },
      removeResult: async (bucketId: string, _paths: string[]) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for remove") };
        }
        return { data: [], error: null };
      }
    },
    mockUser: mockUser,
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData,
      mockDbAdminClient as any,
      mockUser,
      {}
    );

    assertEquals(result.error, undefined, "Error should be undefined on successful file upload");
    assertExists(result.data, "Data should exist on successful file upload");
    assertEquals(result.data.initial_prompt_resource_id, mockProjectResourceId, "initial_prompt_resource_id should be set");
    assertEquals(result.data.initial_user_prompt, "", "initial_user_prompt should be cleared");

    // Check DB calls
    assertEquals(spies.fromSpy.calls.length, 5, "from() should be called 5 times (assoc, projects insert, resources insert, projects update, and final select)");
    assertEquals(spies.fromSpy.calls[0].args[0], 'domain_process_associations');
    assertEquals(spies.fromSpy.calls[1].args[0], 'dialectic_projects'); // insert
    assertEquals(spies.fromSpy.calls[2].args[0], 'dialectic_project_resources');
    assertEquals(spies.fromSpy.calls[3].args[0], 'dialectic_projects'); // update
    assertEquals(spies.fromSpy.calls[4].args[0], 'dialectic_projects'); // final select
    
    // Cannot effectively spy on storage with the current mock setup, but logic is tested by success.

    assertEquals(result.data.selected_domain_id, mockSelectedDomainId);
    assertEquals(result.data.project_name, mockProjectName);
    assertExists(result.data.process_template, "process_template should exist on the returned data");
    assertEquals(result.data.process_template?.id, mockProcessTemplateId);

    assertObjectMatch(insertPayloadHolder.payload as any, mockExpectedInitialDbInsert as any);

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - promptFile upload fails (storage error)", async () => {
  const mockUserId = "user-file-upload-fail-storage";
  const mockProjectName = "Test Project File Storage Fail";
  const mockSelectedDomainId = "domain-id-for-file-fail";
  const mockProcessTemplateId = "proc-template-for-file-fail-storage";
  const mockFile = new File(["file content"], "prompt.txt", { type: "text/plain" });

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };

  const formData = new FormData();
  formData.append('projectName', mockProjectName);
  formData.append('initialUserPromptText', "");
  formData.append('selectedDomainId', mockSelectedDomainId);
  formData.append('promptFile', mockFile);

  const storageErrorMessage = "Mock storage upload error";
  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
       'domain_process_associations': {
        select: async () => ({ data: [{ process_template_id: mockProcessTemplateId }], error: null, count: 1 })
      },
       'dialectic_projects': {
        insert: async () => ({ data: [{ id: 'temp-project-id' }], error: null }),
        delete: async () => ({ data: [], error: null })
      }
    },
    storageMock: {
      uploadResult: async (bucketId: string, _path: string, _body: unknown, _options?: IMockStorageFileOptions) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for upload") };
        }
        return { data: null, error: new Error("Failed to upload initial prompt file.") }; 
      },
      removeResult: async (bucketId: string, _paths: string[]) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for remove") };
        }
        return { data: [], error: null };
      }
    },
    mockUser: mockUser,
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(formData, mockDbAdminClient as any, mockUser, {});

    assertExists(result.error);
    assertEquals(result.error?.message, "Main content storage upload failed: Failed to upload initial prompt file.");
    assertEquals(result.error?.status, 500);
    assertEquals(result.error?.details, "Failed to upload initial prompt file.");

    // Verify that the project was deleted if the file handling failed
    const deleteProjectSpyStorageFail = spies.getLatestQueryBuilderSpies('dialectic_projects')?.delete;
    assertExists(deleteProjectSpyStorageFail, "Delete spy for projects should exist after storage failure.");
    assertEquals(deleteProjectSpyStorageFail.calls.length, 1, "Project delete should be called once after storage failure.");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - promptFile dialectic_project_resources insert fails (db error)", async () => {
  const mockUserId = "user-file-fail-resource-db";
  const mockProjectName = "Test Project Resource DB Fail";
  const mockSelectedDomainId = "domain-id-resource-db-fail";
  const mockProcessTemplateId = "proc-template-for-file-fail-resource";
  const mockFile = new File(["file content"], "prompt.txt", { type: "text/plain" });

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };

  const formData = new FormData();
  formData.append('projectName', mockProjectName);
  formData.append('initialUserPromptText', "");
  formData.append('selectedDomainId', mockSelectedDomainId);
  formData.append('promptFile', mockFile);

  const resourceInsertError = "Mock resource insert error";
  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'domain_process_associations': {
        select: async () => ({ data: [{ process_template_id: mockProcessTemplateId }], error: null, count: 1 })
      },
      'dialectic_projects': {
        insert: async () => ({ data: [{ id: 'temp-project-id' }], error: null }),
        delete: async () => ({ data: [], error: null })
      },
      'dialectic_project_resources': {
        insert: async () => ({ data: null, error: new Error("Failed to record prompt file resource.") })
      }
    },
    storageMock: {
      uploadResult: async (bucketId: string, _path: string, _body: unknown, _options?: IMockStorageFileOptions) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for upload") };
        }
        return { data: { path: 'mock/storage/path/prompt.txt' }, error: null };
      },
      removeResult: async (bucketId: string, _paths: string[]) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for remove") };
        }
        return { data: [], error: null };
      }
    },
    mockUser: mockUser,
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(formData, mockDbAdminClient as any, mockUser, {});

    assertExists(result.error);
    assertEquals(result.error?.message, "Database registration failed after successful upload.: Failed to record prompt file resource.");
    assertEquals(result.error?.status, 500);
    assertEquals(result.error?.details, "Failed to record prompt file resource.");

    // Verify that the project was deleted if the file handling failed
    const deleteProjectSpyResourceFail = spies.getLatestQueryBuilderSpies('dialectic_projects')?.delete;
    assertExists(deleteProjectSpyResourceFail, "Delete spy for projects should exist after resource DB failure.");
    assertEquals(deleteProjectSpyResourceFail.calls.length, 1, "Project delete should be called once after resource DB failure.");

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - project update with resource_id fails (db error)", async () => {
  const mockUserId = "user-file-fail-project-update";
  const mockProjectName = "Test Project Update Fail";
  const mockSelectedDomainId = "domain-id-project-update-fail";
  const mockProcessTemplateId = "proc-template-for-file-fail-update";
  const mockFile = new File(["file content"], "prompt.txt", { type: "text/plain" });

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };

  const formData = new FormData();
  formData.append('projectName', mockProjectName);
  formData.append('initialUserPromptText', "");
  formData.append('selectedDomainId', mockSelectedDomainId);
  formData.append('promptFile', mockFile);

  const projectUpdateError = "Mock project update error";
  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'domain_process_associations': {
        select: async () => ({ data: [{ process_template_id: mockProcessTemplateId }], error: null, count: 1 })
      },
      'dialectic_projects': {
        insert: async () => ({ data: [{ id: 'temp-project-id' }], error: null }),
        update: async () => ({ data: null, error: { name: "PostgrestError", message: projectUpdateError, code: 'YYYYY' } })
      },
      'dialectic_project_resources': {
        insert: async () => ({ data: [{ id: 'res-id', storage_path: 'mock/path/file.txt' }], error: null })
      }
    },
    storageMock: {
      uploadResult: async (bucketId: string, _path: string, _body: unknown, _options?: IMockStorageFileOptions) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for upload") };
        }
        return { data: { path: 'mock/storage/path/prompt.txt' }, error: null };
      },
      removeResult: async (bucketId: string, _paths: string[]) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for remove") };
        }
        return { data: [], error: null };
      }
    },
    mockUser: mockUser,
  };

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(formData, mockDbAdminClient as any, mockUser, {});

    assertExists(result.error);
    assertEquals(result.error?.message, "Failed to finalize project with file resource.");
    assertEquals(result.error?.status, 500);
    assertEquals(result.error?.details, projectUpdateError);

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
  const mockProcessTemplateId = "proc-template-for-overlay";
  const testTimestamp = new Date().toISOString();

  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };

  const mockProjectResourceId = "res-uuid-for-overlay-string-upload";

  const mockExpectedDbInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "", // Always empty now - content stored as file
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    process_template_id: mockProcessTemplateId,
    status: "new",
    initial_prompt_resource_id: null,
  };

  const mockProjectDataAfterInsert: DialecticProject = {
    id: "project-test-id-with-domain-overlay",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "", // Always empty now - content stored as file
    selected_domain_id: mockSelectedDomainId,
    domain_name: "Domain For Overlay",
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    repo_url: null,
    status: "new",
    created_at: testTimestamp,
    updated_at: testTimestamp,
    initial_prompt_resource_id: mockProjectResourceId,
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
      'domain_process_associations': {
        select: async () => ({
          data: [{ process_template_id: mockProcessTemplateId }],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        })
      },
      'dialectic_projects': {
        insert: async (state: MockQueryBuilderState) => {
          insertPayloadHolder.payload = state.insertData;
          const insertedData = (Array.isArray(state.insertData) ? state.insertData[0] : state.insertData) as any;
          if (!insertedData) throw new Error("Mock insert received no data");
          return {
            data: [{
              ...mockProjectDataAfterInsert,
              ...insertedData,
              initial_prompt_resource_id: null, // Still null at insert time
              domain: { name: mockProjectDataAfterInsert.domain_name },
            }],
            error: null,
            count: 1,
            status: 201,
            statusText: 'Created'
          };
        },
        update: async (state: MockQueryBuilderState) => {
          const updatedData = state.updateData as any;
          return {
            data: [{
              ...mockProjectDataAfterInsert,
              ...updatedData,
              domain: { name: mockProjectDataAfterInsert.domain_name },
              process_template: { id: mockProcessTemplateId, name: 'Overlay Mock Process' }
            }],
            error: null,
            count: 1,
            status: 200,
            statusText: 'OK'
          };
        },
        select: async (_state: MockQueryBuilderState) => {
          return {
            data: [{
              ...mockProjectDataAfterInsert,
              process_template: { id: mockProcessTemplateId, name: 'Overlay Mock Process' }
            }],
            error: null, count: 1, status: 200, statusText: 'OK'
          };
        }
      },
      'dialectic_project_resources': {
        insert: async () => ({
          data: [{ id: mockProjectResourceId, storage_path: 'mock/storage/path/overlay-prompt.md' }],
          error: null,
          count: 1,
          status: 201,
          statusText: 'Created'
        })
      }
    },
    storageMock: {
      uploadResult: async (bucketId: string, _path: string, _body: unknown, _options?: IMockStorageFileOptions) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for upload") };
        }
        return { data: { path: 'mock/storage/path/overlay-prompt.md' }, error: null };
      },
      removeResult: async (bucketId: string, _paths: string[]) => {
        if (bucketId !== "dialectic-contributions") {
          return { data: null, error: new Error("Mock: Invalid bucket for remove") };
        }
        return { data: [], error: null };
      }
    },
    mockUser: mockUser,
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
    assertEquals(result.error, undefined, "Error should be undefined on success");
    assertEquals(result.data.selected_domain_id, mockSelectedDomainId);
    assertEquals(result.data.selected_domain_overlay_id, mockSelectedDomainOverlayId);
    assertEquals(result.data.project_name, mockProjectName);
    assertEquals(result.data.initial_prompt_resource_id, mockProjectResourceId, "initial_prompt_resource_id should be set");
    assertEquals(result.data.initial_user_prompt, "", "initial_user_prompt should be empty since content is stored as file");
    assertExists(result.data.process_template, "process_template should exist on the returned data");
    assertEquals(result.data.process_template?.id, mockProcessTemplateId);

    assertObjectMatch(insertPayloadHolder.payload as any, mockExpectedDbInsert as any);

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});
