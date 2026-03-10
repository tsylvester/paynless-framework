import { assertEquals, assertExists, assert, assertObjectMatch } from "jsr:@std/assert@0.225.1";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { createProject, type CreateProjectOptions } from "./createProject.ts";
import type {
  CreateProjectPayload,
  DialecticProject,
  DialecticProjectInsert,
  DialecticProjectRow,
  DialecticProcessTemplate,
} from "./dialectic.interface.ts";
import type { User, SupabaseClient, PostgrestError } from "@supabase/supabase-js"; // Import User type
import type { FileOptions } from "npm:@supabase/storage-js@^2.5.5"; // Added this import
import type { IMockStorageFileOptions } from "../_shared/supabase.mock.ts"; // Added this import
import * as domainUtils from "../_shared/domain-utils.ts"; // To mock isValidDomain
import { createMockSupabaseClient, type MockSupabaseDataConfig, type MockQueryBuilderState, type PostgresError } from "../_shared/supabase.mock.ts";
import { Database } from "../types_db.ts";

function isDialecticProjectInsertArray(arr: unknown): arr is Database['public']['Tables']['dialectic_projects']['Insert'][] {
  return Array.isArray(arr) && arr.every(isDialecticProjectInsert);
}

function isDialecticProjectInsert(obj: unknown): obj is Database['public']['Tables']['dialectic_projects']['Insert'] {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj;
  return 'user_id' in o && typeof o.user_id === 'string' &&
         'project_name' in o && typeof o.project_name === 'string';
}

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

  const mockIdempotencyKey = "idem-success-no-file";
  const mockExpectedDbInsert: DialecticProjectInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "", // Always empty now - content stored as file
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    process_template_id: mockProcessTemplateId,
    status: "new",
    initial_prompt_resource_id: null,
    idempotency_key: mockIdempotencyKey,
  };

  const mockProcessTemplate: DialecticProcessTemplate = {
    id: mockProcessTemplateId,
    name: "Default Template",
    description: "Default process template",
    created_at: testTimestamp,
    starting_stage_id: "start-stage-id",
  };
  // This is what the .single() call after insert should resolve to (row shape plus join data; process_template uses existing type)
  const mockProjectDataAfterInsert = {
    id: "project-test-id-refactored",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "", // Always empty now - content stored as file
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    repo_url: null,
    status: "new",
    created_at: testTimestamp, // Use consistent timestamp
    updated_at: testTimestamp, // Use consistent timestamp
    initial_prompt_resource_id: mockProjectResourceId,
    process_template_id: mockProcessTemplateId,
    user_domain_overlay_values: null,
    idempotency_key: mockIdempotencyKey,
    domain: { name: "Software Development" },
    process_template: mockProcessTemplate,
  };

  const formDataValues = {
    action: "createProject",
    idempotencyKey: mockIdempotencyKey,
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainId: mockSelectedDomainId,
    selectedDomainOverlayId: mockSelectedDomainOverlayId,
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value);
    }
  });

  const insertPayloadHolder: { payload: Database['public']['Tables']['dialectic_projects']['Insert'][] | null } = { payload: null };

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
        insert: (state) => {
          const { insertData } = state;
          if (isDialecticProjectInsert(insertData)) {
            insertPayloadHolder.payload = [insertData];
          } else if (isDialecticProjectInsertArray(insertData)) {
            insertPayloadHolder.payload = insertData;
          }
          return Promise.resolve({ data: [mockProjectDataAfterInsert], error: null, count: 1, status: 201, statusText: 'Created' });
        },
        update: async () => ({
          data: [mockProjectDataAfterInsert],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        }),
        select: async () => ({
          data: [mockProjectDataAfterInsert],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        })
      },
      'dialectic_project_resources': {
        upsert: async () => ({
          data: [{ id: mockProjectResourceId, storage_path: 'mock/path/to/file.md' }],
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
      mockDbAdminClient as unknown as SupabaseClient<Database>, // Cast to any to satisfy SupabaseClient type for testing
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
    assertEquals(result.data.domain_name, "Software Development");

    assertExists(result.data.process_template, "process_template should exist on the returned project data");
    assertEquals(result.data.process_template?.id, mockProcessTemplateId);
    assertEquals(result.data.initial_prompt_resource_id, mockProjectResourceId, "initial_prompt_resource_id should be set");
    assertEquals(result.data.initial_user_prompt, "", "initial_user_prompt should be empty since content is stored as file");

    assertEquals(spies.fromSpy.calls.length, 4, "fromSpy should be called 4 times (assoc, projects insert, resources insert, projects update)");
    assertEquals(spies.fromSpy.calls[0].args[0], 'domain_process_associations', "First from call should be for 'domain_process_associations'");
    assertEquals(spies.fromSpy.calls[1].args[0], 'dialectic_projects', "Second from call should be for 'dialectic_projects' (insert)");
    assertEquals(spies.fromSpy.calls[2].args[0], 'dialectic_project_resources', "Third from call should be for 'dialectic_project_resources'");
    assertEquals(spies.fromSpy.calls[3].args[0], 'dialectic_projects', "Fourth from call should be for 'dialectic_projects' (update)");

    assertExists(insertPayloadHolder.payload);
    assertEquals(insertPayloadHolder.payload.length, 1);
    assertObjectMatch(insertPayloadHolder.payload[0], mockExpectedDbInsert);

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
    idempotencyKey: "idem-missing-domain",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    // selectedDomainId is intentionally missing
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value);
    }
  });

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, {});

  try {
    const result = await createProject(
      formData,
      mockDbAdminClient as unknown as SupabaseClient<Database>,
      mockUser,
      {}
    );

    assertExists(result.error, "Error object should exist when validation fails");
    assertEquals(result.error?.message, "selectedDomainId is required and must be a string");
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

  const mockIdempotencyKeyDbError = "idem-db-error-insert";
  const mockExpectedDbInsert: DialecticProjectInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "", // Always empty now - content stored as file
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: null,
    process_template_id: mockProcessTemplateId,
    status: "new",
    initial_prompt_resource_id: null,
    idempotency_key: mockIdempotencyKeyDbError,
  };

  const formDataValues = {
    action: "createProject",
    idempotencyKey: mockIdempotencyKeyDbError,
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainId: mockSelectedDomainId,
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value);
    }
  });

  const insertPayloadHolder: { payload: Database['public']['Tables']['dialectic_projects']['Insert'][] | null } = { payload: null };
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
        insert: (state) => {
          const { insertData } = state;
          if (isDialecticProjectInsert(insertData)) {
            insertPayloadHolder.payload = [insertData];
          } else if (isDialecticProjectInsertArray(insertData)) {
            insertPayloadHolder.payload = insertData;
          }
          return Promise.resolve({ data: null, error: new Error(dbOperationErrorMessage), count: 0, status: 500, statusText: 'Internal Server Error' });
        }
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
      mockDbAdminClient as unknown as SupabaseClient<Database>, // Cast to any to satisfy SupabaseClient type for testing
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
    assertExists(insertPayloadHolder.payload);
    assertEquals(insertPayloadHolder.payload.length, 1);
    assertObjectMatch(insertPayloadHolder.payload[0], mockExpectedDbInsert);
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
    idempotencyKey: "idem-missing-project-name",
    // projectName is intentionally omitted
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainId: "some-domain-id", // Add to pass other validations
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value);
    }
  });

  // No DB interaction expected, so config can be minimal
  const mockConfig: MockSupabaseDataConfig = {}; 

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData, 
        mockDbAdminClient as unknown as SupabaseClient<Database>, // Cast to any for testing
      mockUser,
      {} // No custom isValidDomain, should not be called
    );

    assertExists(result.error, "Error object should exist for missing projectName");
    assertEquals(result.error?.message, "projectName is required and must be a string", "Error message should indicate missing projectName"); 
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
    idempotencyKey: "idem-missing-prompt",
    projectName: mockProjectName,
    selectedDomainId: "some-domain-id", // Add to pass other validations
    // initialUserPromptText is intentionally omitted
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value);
    }
  });
  // No promptFile is appended to formData

  // No DB interaction expected
  const mockConfig: MockSupabaseDataConfig = {}; 

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(
      formData, 
      mockDbAdminClient as unknown as SupabaseClient<Database>, // Cast to any for testing
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
    idempotencyKey: "idem-invalid-domain",
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainId: mockSelectedDomainId,
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value);
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
      mockDbAdminClient as unknown as SupabaseClient<Database>,
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
  formData.append('idempotencyKey', 'idem-no-default-process');
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
    const result = await createProject(formData, mockDbAdminClient as unknown as SupabaseClient<Database>, mockUser, {});
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

  const mockIdempotencyKeyFile = "idem-success-with-file";
  const mockExpectedInitialDbInsert: DialecticProjectInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "", // Should be empty when file is provided
    selected_domain_id: mockSelectedDomainId,
    process_template_id: mockProcessTemplateId,
    selected_domain_overlay_id: null,
    status: "new",
    initial_prompt_resource_id: null, // Null on first insert
    idempotency_key: mockIdempotencyKeyFile,
  };

  const formData = new FormData();
  formData.append('idempotencyKey', mockIdempotencyKeyFile);
  formData.append('projectName', mockProjectName);
  formData.append('initialUserPromptText', "");
  formData.append('selectedDomainId', mockSelectedDomainId);
  formData.append('promptFile', mockFile);

  const insertPayloadHolder: { payload: Database['public']['Tables']['dialectic_projects']['Insert'][] | null } = { payload: null };
  const mockProcessTemplateFile: DialecticProcessTemplate = {
    id: mockProcessTemplateId,
    name: "File Upload Template",
    description: "Template for file uploads",
    created_at: testTimestamp,
    starting_stage_id: "start-stage-id",
  };
  const mockProjectDataAfterInsert = {
    id: "project-test-id-with-file",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "",
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: null,
    repo_url: null,
    status: "new",
    created_at: testTimestamp,
    updated_at: testTimestamp,
    initial_prompt_resource_id: mockProjectResourceId,
    process_template_id: mockProcessTemplateId,
    user_domain_overlay_values: null,
    idempotency_key: mockIdempotencyKeyFile,
    domain: { name: "File Upload Domain" },
    process_template: mockProcessTemplateFile,
  };
  const mockExpectedDbInsert: DialecticProjectInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "",
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: null,
    process_template_id: mockProcessTemplateId,
    status: "new",
    initial_prompt_resource_id: null,
    idempotency_key: mockIdempotencyKeyFile,
  };
  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'domain_process_associations': {
        select: async () => ({ data: [{ process_template_id: mockProcessTemplateId }], error: null, count: 1 })
      },
      'dialectic_projects': {
        insert: (state) => {
          const { insertData } = state;
          if (isDialecticProjectInsert(insertData)) {
            insertPayloadHolder.payload = [insertData];
          } else if (isDialecticProjectInsertArray(insertData)) {
            insertPayloadHolder.payload = insertData;
          }
          return Promise.resolve({
            data: [mockProjectDataAfterInsert],
            error: null,
            count: 1,
            status: 201,
            statusText: 'Created'
          });
        },
        update: async () => ({
          data: [mockProjectDataAfterInsert],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        }),
        select: async () => ({
          data: [mockProjectDataAfterInsert],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        })
      },
      'dialectic_project_resources': {
        upsert: async () => ({ data: [{ id: mockProjectResourceId, storage_path: 'mock/storage/path/prompt.txt' }], error: null })
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
      mockDbAdminClient as unknown as SupabaseClient<Database>,
      mockUser,
      {}
    );

    assertEquals(result.error, undefined, "Error should be undefined on successful file upload");
    assertExists(result.data, "Data should exist on successful file upload");
    assertEquals(result.data.initial_prompt_resource_id, mockProjectResourceId, "initial_prompt_resource_id should be set");
    assertEquals(result.data.initial_user_prompt, "", "initial_user_prompt should be empty since content is stored as file");

    assertEquals(spies.fromSpy.calls.length, 4, "fromSpy should be called 4 times (assoc, projects insert, resources insert, projects update)");
    assertEquals(spies.fromSpy.calls[0].args[0], 'domain_process_associations', "First from call should be for 'domain_process_associations'");
    assertEquals(spies.fromSpy.calls[1].args[0], 'dialectic_projects', "Second from call should be for 'dialectic_projects' (insert)");
    assertEquals(spies.fromSpy.calls[2].args[0], 'dialectic_project_resources', "Third from call should be for 'dialectic_project_resources'");
    assertEquals(spies.fromSpy.calls[3].args[0], 'dialectic_projects', "Fourth from call should be for 'dialectic_projects' (update)");

    assertExists(insertPayloadHolder.payload);
    assertEquals(insertPayloadHolder.payload.length, 1);
    assertObjectMatch(insertPayloadHolder.payload[0], mockExpectedDbInsert);

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
  formData.append('idempotencyKey', 'idem-file-upload-fail-storage');
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
    const result = await createProject(formData, mockDbAdminClient as unknown as SupabaseClient<Database>, mockUser, {});

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
  formData.append('idempotencyKey', 'idem-file-fail-resource-db');
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
        upsert: async () => ({ 
          data: null, 
          error: {
            name: "PostgresError",
            message: "Query returned no rows",
            code: "PGRST116",
            details: "Failed to record prompt file resource.",
            hint: undefined
          }
        })
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
    const result = await createProject(formData, mockDbAdminClient as unknown as SupabaseClient<Database>, mockUser, {});

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
  formData.append('idempotencyKey', 'idem-file-fail-project-update');
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
        upsert: async () => ({ data: [{ id: 'res-id', storage_path: 'mock/path/file.txt' }], error: null })
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
    const result = await createProject(formData, mockDbAdminClient as unknown as SupabaseClient<Database>, mockUser, {});

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
  const mockIdempotencyKeyOverlay = "idem-success-domain-overlay";

  const mockExpectedDbInsert: DialecticProjectInsert = {
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "", // Always empty now - content stored as file
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    process_template_id: mockProcessTemplateId,
    status: "new",
    initial_prompt_resource_id: null,
    idempotency_key: mockIdempotencyKeyOverlay,
  };

  const mockProcessTemplateOverlay: DialecticProcessTemplate = {
    id: mockProcessTemplateId,
    name: "Overlay Template",
    description: "Template for domain overlays",
    created_at: testTimestamp,
    starting_stage_id: "start-stage-id",
  };
  const mockProjectDataAfterInsert = {
    id: "project-test-id-with-domain-overlay",
    user_id: mockUserId,
    project_name: mockProjectName,
    initial_user_prompt: "", // Always empty now - content stored as file
    selected_domain_id: mockSelectedDomainId,
    selected_domain_overlay_id: mockSelectedDomainOverlayId,
    repo_url: null,
    status: "new",
    created_at: testTimestamp,
    updated_at: testTimestamp,
    initial_prompt_resource_id: mockProjectResourceId,
    process_template_id: mockProcessTemplateId,
    user_domain_overlay_values: null,
    idempotency_key: mockIdempotencyKeyOverlay,
    domain: { name: "Domain For Overlay" },
    process_template: mockProcessTemplateOverlay,
  };

  const formDataValues = {
    action: "createProject",
    idempotencyKey: mockIdempotencyKeyOverlay,
    projectName: mockProjectName,
    initialUserPromptText: mockInitialUserPromptText,
    selectedDomainId: mockSelectedDomainId,
    selectedDomainOverlayId: mockSelectedDomainOverlayId,
  };

  const formData = new FormData();
  Object.entries(formDataValues).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value);
    }
  });

  const insertPayloadHolder: { payload: Database['public']['Tables']['dialectic_projects']['Insert'][] | null } = { payload: null };

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
        insert: (state) => {
          const { insertData } = state;
          if (isDialecticProjectInsert(insertData)) {
            insertPayloadHolder.payload = [insertData];
          } else if (isDialecticProjectInsertArray(insertData)) {
            insertPayloadHolder.payload = insertData;
          }
          return Promise.resolve({
            data: [mockProjectDataAfterInsert],
            error: null,
            count: 1,
            status: 201,
            statusText: 'Created'
          });
        },
        update: async () => ({
          data: [mockProjectDataAfterInsert],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        }),
        select: async () => ({
          data: [mockProjectDataAfterInsert],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        })
      },
      'dialectic_project_resources': {
        upsert: async () => ({
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
      mockDbAdminClient as unknown as SupabaseClient<Database>,
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

    assertExists(insertPayloadHolder.payload);
    assertEquals(insertPayloadHolder.payload.length, 1);
    assertObjectMatch(insertPayloadHolder.payload[0], mockExpectedDbInsert);

  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - rejects when idempotencyKey is missing from FormData (400)", async () => {
  const mockUserId = "user-idem-missing";
  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
  const formData = new FormData();
  formData.append("action", "createProject");
  formData.append("projectName", "Test");
  formData.append("initialUserPromptText", "Prompt");
  formData.append("selectedDomainId", "domain-id");
  // idempotencyKey intentionally omitted

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, {});

  try {
    const result = await createProject(formData, mockDbAdminClient as unknown as SupabaseClient<Database>, mockUser, {});
    assertExists(result.error, "Error should exist when idempotencyKey is missing");
    assertEquals(result.error?.message, "idempotencyKey is required");
    assertEquals(result.error?.status, 400);
    assertEquals(spies.fromSpy.calls.length, 0, "DB should not be called when idempotencyKey is missing");
  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - rejects when idempotencyKey is empty string (400)", async () => {
  const mockUserId = "user-idem-empty";
  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
  const formData = new FormData();
  formData.append("action", "createProject");
  formData.append("idempotencyKey", "");
  formData.append("projectName", "Test");
  formData.append("initialUserPromptText", "Prompt");
  formData.append("selectedDomainId", "domain-id");

  const { client: mockDbAdminClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, {});

  try {
    const result = await createProject(formData, mockDbAdminClient as unknown as SupabaseClient<Database>, mockUser, {});
    assertExists(result.error, "Error should exist when idempotencyKey is empty");
    assertEquals(result.error?.message, "idempotencyKey is required");
    assertEquals(result.error?.status, 400);
    assertEquals(spies.fromSpy.calls.length, 0, "DB should not be called when idempotencyKey is empty");
  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - includes idempotency_key in insert call to dialectic_projects", async () => {
  const mockUserId = "user-idem-insert-assert";
  const mockIdempotencyKey = "idem-insert-assert-key";
  const mockProcessTemplateId = "proc-template-idem-assert";
  const testTimestamp = new Date().toISOString();
  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };
  const mockProcessTemplateIdem: DialecticProcessTemplate = {
    id: mockProcessTemplateId,
    name: "T",
    description: null,
    created_at: testTimestamp,
    starting_stage_id: "s",
  };
  const mockProjectDataAfterInsert = {
    id: "project-idem-assert",
    user_id: mockUserId,
    project_name: "Idem Assert Project",
    initial_user_prompt: "",
    selected_domain_id: "domain-idem",
    selected_domain_overlay_id: null,
    repo_url: null,
    status: "new",
    created_at: testTimestamp,
    updated_at: testTimestamp,
    initial_prompt_resource_id: "res-idem",
    process_template_id: mockProcessTemplateId,
    user_domain_overlay_values: null,
    idempotency_key: mockIdempotencyKey,
    domain: { name: "Domain" },
    process_template: mockProcessTemplateIdem,
  };
  const insertPayloadHolder: { payload: Database['public']['Tables']['dialectic_projects']['Insert'][] | null } = { payload: null };
  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'domain_process_associations': {
        select: async () => ({ data: [{ process_template_id: mockProcessTemplateId }], error: null, count: 1, status: 200, statusText: 'OK' }),
      },
      'dialectic_projects': {
        insert: (state) => {
          const { insertData } = state;
          if (isDialecticProjectInsert(insertData)) {
            insertPayloadHolder.payload = [insertData];
          } else if (isDialecticProjectInsertArray(insertData)) {
            insertPayloadHolder.payload = insertData;
          }
          return Promise.resolve({ data: [mockProjectDataAfterInsert], error: null, count: 1, status: 201, statusText: 'Created' });
        },
        update: async () => ({ data: [mockProjectDataAfterInsert], error: null, count: 1, status: 200, statusText: 'OK' }),
        select: async () => ({ data: [mockProjectDataAfterInsert], error: null, count: 1, status: 200, statusText: 'OK' }),
      },
      'dialectic_project_resources': {
        upsert: async () => ({ data: [{ id: "res-idem", storage_path: "mock/path" }], error: null, count: 1, status: 201, statusText: 'Created' }),
      },
    },
    storageMock: {
      uploadResult: async () => ({ data: { path: "mock/path" }, error: null }),
      removeResult: async () => ({ data: [], error: null }),
    },
    mockUser: mockUser,
  };
  const formData = new FormData();
  formData.append("action", "createProject");
  formData.append("idempotencyKey", mockIdempotencyKey);
  formData.append("projectName", "Idem Assert Project");
  formData.append("initialUserPromptText", "Prompt");
  formData.append("selectedDomainId", "domain-idem");

  const { client: mockDbAdminClient, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(formData, mockDbAdminClient as unknown as SupabaseClient<Database>, mockUser, {});
    assertEquals(result.error, undefined, "Create should succeed");
    assertExists(insertPayloadHolder.payload, "Insert payload should be captured");
    assertEquals(insertPayloadHolder.payload.length, 1);
    const insertPayload: DialecticProjectInsert | undefined = insertPayloadHolder.payload[0];
    assertExists(insertPayload, "Insert payload element should exist");
    assertEquals(insertPayload.idempotency_key, mockIdempotencyKey, "Insert must include idempotency_key");
  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});

Deno.test("createProject - on unique constraint violation 23505 on idempotency_key returns existing project", async () => {
  const mockUserId = "user-idem-23505";
  const mockIdempotencyKey = "idem-duplicate-key";
  const mockProcessTemplateId = "proc-template-23505";
  const testTimestamp = new Date().toISOString();
  const mockUser: User = {
    id: mockUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: testTimestamp,
  };
  const existingProcessTemplate: DialecticProcessTemplate = {
    id: mockProcessTemplateId,
    name: "Template",
    description: null,
    created_at: testTimestamp,
    starting_stage_id: "s",
  };
  const existingProjectRow = {
    id: "project-existing-23505",
    user_id: mockUserId,
    project_name: "Existing Project",
    initial_user_prompt: "",
    selected_domain_id: "domain-23505",
    selected_domain_overlay_id: null,
    repo_url: null,
    status: "new",
    created_at: testTimestamp,
    updated_at: testTimestamp,
    initial_prompt_resource_id: "res-23505",
    process_template_id: mockProcessTemplateId,
    user_domain_overlay_values: null,
    idempotency_key: mockIdempotencyKey,
    domain: { name: "Existing Domain" },
    process_template: existingProcessTemplate,
  };
  const idempotencyConflictError: PostgresError = {
    name: "PostgrestError",
    message: 'duplicate key value violates unique constraint "dialectic_projects_idempotency_key_key"',
    code: "23505",
    details: "idempotency_key",
    hint: undefined,
  };
  let selectCallCount = 0;
  const mockConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      'domain_process_associations': {
        select: async () => ({ data: [{ process_template_id: mockProcessTemplateId }], error: null, count: 1, status: 200, statusText: 'OK' }),
      },
      'dialectic_projects': {
        insert: async () => ({
          data: null,
          error: idempotencyConflictError,
          count: 0,
          status: 409,
          statusText: "Conflict",
        }),
        select: async () => {
          selectCallCount += 1;
          return { data: [existingProjectRow], error: null, count: 1, status: 200, statusText: 'OK' };
        },
      },
    },
    mockUser: mockUser,
  };
  const formData = new FormData();
  formData.append("action", "createProject");
  formData.append("idempotencyKey", mockIdempotencyKey);
  formData.append("projectName", "Duplicate Project");
  formData.append("initialUserPromptText", "Prompt");
  formData.append("selectedDomainId", "domain-23505");

  const { client: mockDbAdminClient, clearAllStubs } = createMockSupabaseClient(mockUserId, mockConfig);

  try {
    const result = await createProject(formData, mockDbAdminClient as unknown as SupabaseClient<Database>, mockUser, {});
    assertEquals(result.error, undefined, "Should return success with existing project");
    assertExists(result.data, "Data should be the existing project");
    assertEquals(result.data.id, existingProjectRow.id);
    assertEquals(result.data.project_name, existingProjectRow.project_name);
    assertEquals(result.data.domain_name, "Existing Domain");
    assert(selectCallCount >= 1, "Select by idempotency_key should be called to fetch existing project");
  } finally {
    if (clearAllStubs) clearAllStubs();
  }
});
