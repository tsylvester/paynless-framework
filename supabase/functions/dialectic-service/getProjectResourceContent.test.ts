import { assertEquals, assertRejects } from "https://deno.land/std@0.192.0/testing/asserts.ts";
// Import the function to test
import { getProjectResourceContent } from "./getProjectResourceContent.ts"; 
// Import Supabase and User types if needed for mocks
// import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
// import type { Database } from "../types_db.ts";


Deno.test("getProjectResourceContent - Happy Path: Successfully retrieves resource content", async () => {
  // Mock Supabase client and user
  const mockDbClient: any = {
    from: () => mockDbClient,
    select: () => mockDbClient,
    eq: () => mockDbClient,
    single: () => Promise.resolve({ 
      data: { 
        project_id: "project123", 
        user_id: "user123", 
        file_name: "test.txt", 
        mime_type: "text/plain",
        storage_bucket: "test-bucket",
        storage_path: "test/path/test.txt"
      }, 
      error: null 
    }),
    storage: {
      from: () => mockDbClient.storage, // return self for chaining
      download: () => Promise.resolve({ data: new Blob(["Test content"]), error: null })
    }
  };

  const mockUser: any = { id: "user123" };
  const payload = { resourceId: "resource123" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.error, undefined);
  assertEquals(result.data?.fileName, "test.txt");
  assertEquals(result.data?.mimeType, "text/plain");
  assertEquals(result.data?.content, "Test content");
});

// Add more tests for error cases and edge cases below

Deno.test("getProjectResourceContent - Error: resourceId is missing", async () => {
  const mockDbClient: any = {}; // Not used in this path
  const mockUser: any = { id: "user123" };
  const payload = { resourceId: "" }; // Empty resourceId

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.data, undefined);
  assertEquals(result.error?.message, "resourceId is required");
  assertEquals(result.error?.status, 400);
  assertEquals(result.error?.code, "VALIDATION_ERROR");
});

Deno.test("getProjectResourceContent - Error: Resource not found (PGRST116)", async () => {
  const mockDbClient: any = {
    from: () => mockDbClient,
    select: () => mockDbClient,
    eq: () => mockDbClient,
    single: () => Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'Row not found' } }),
  };
  const mockUser: any = { id: "user123" };
  const payload = { resourceId: "nonexistentResource" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.data, undefined);
  assertEquals(result.error?.message, "Resource not found.");
  assertEquals(result.error?.status, 404);
  assertEquals(result.error?.code, "NOT_FOUND");
});

Deno.test("getProjectResourceContent - Error: Generic DB error fetching resource", async () => {
  const mockDbClient: any = {
    from: () => mockDbClient,
    select: () => mockDbClient,
    eq: () => mockDbClient,
    single: () => Promise.resolve({ data: null, error: { message: "Simulated DB error", code: "XXYYZZ" } }),
  };
  const mockUser: any = { id: "user123" };
  const payload = { resourceId: "resourceErrorDb" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.data, undefined);
  assertEquals(result.error?.message, "Failed to fetch resource details.");
  assertEquals(result.error?.status, 500);
  assertEquals(result.error?.details, "Simulated DB error");
  assertEquals(result.error?.code, "DB_ERROR");
});

Deno.test("getProjectResourceContent - Error: Access denied (user does not own resource or project)", async () => {
  const mockDbClient: any = {
    _callCount: 0,
    from: function() { return this; }, // Ensure 'this' context for chaining
    select: function() { return this; },
    eq: function() { return this; },
    single: function() {
      this._callCount++;
      if (this._callCount === 1) { // First call: dialectic_project_resources
        return Promise.resolve({ 
          data: { 
            project_id: "project123", 
            user_id: "otherUser123", // Different user owns the resource
            file_name: "test.txt", 
            mime_type: "text/plain",
            storage_bucket: "test-bucket",
            storage_path: "test/path/test.txt"
          }, 
          error: null 
        });
      } else { // Second call: dialectic_projects
        return Promise.resolve({
          data: { user_id: "anotherOtherUser456" }, // Different user owns the project
          error: null
        });
      }
    }
  };

  const mockUser: any = { id: "user123" }; // Authenticated user
  const payload = { resourceId: "resourceForbidden" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.data, undefined);
  assertEquals(result.error?.message, "Access denied to this resource.");
  assertEquals(result.error?.status, 403);
  assertEquals(result.error?.code, "FORBIDDEN");
});

Deno.test("getProjectResourceContent - Error: Storage info missing (bucket or path)", async () => {
  const mockDbClient: any = {
    from: () => mockDbClient,
    select: () => mockDbClient,
    eq: () => mockDbClient,
    single: () => Promise.resolve({ 
      data: { 
        project_id: "project123", 
        user_id: "user123", 
        file_name: "test.txt", 
        mime_type: "text/plain",
        storage_bucket: null, // Missing storage_bucket
        storage_path: "test/path/test.txt"
      }, 
      error: null 
    }),
    // storage object won't be called in this path
  };

  const mockUser: any = { id: "user123" };
  const payload = { resourceId: "resourceMissingStorageInfo" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.data, undefined);
  assertEquals(result.error?.message, "Resource storage information is incomplete.");
  assertEquals(result.error?.status, 500);
  assertEquals(result.error?.code, "STORAGE_INFO_MISSING");
});

Deno.test("getProjectResourceContent - Error: Storage download fails", async () => {
  const mockDbClient: any = {
    from: () => mockDbClient,
    select: () => mockDbClient,
    eq: () => mockDbClient,
    single: () => Promise.resolve({ 
      data: { 
        project_id: "project123", 
        user_id: "user123", 
        file_name: "test.txt", 
        mime_type: "text/plain",
        storage_bucket: "test-bucket",
        storage_path: "test/path/test.txt"
      }, 
      error: null 
    }),
    storage: {
      from: () => mockDbClient.storage,
      download: () => Promise.resolve({ data: null, error: { message: "Simulated storage download error" } })
    }
  };

  const mockUser: any = { id: "user123" };
  const payload = { resourceId: "resourceStorageFail" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.data, undefined);
  assertEquals(result.error?.message, "Failed to download resource content.");
  assertEquals(result.error?.status, 500);
  assertEquals(result.error?.details, "Simulated storage download error");
  assertEquals(result.error?.code, "STORAGE_DOWNLOAD_ERROR");
});

Deno.test("getProjectResourceContent - Error: Resource not found (no data from db, no db error)", async () => {
  const mockDbClient: any = {
    from: () => mockDbClient,
    select: () => mockDbClient,
    eq: () => mockDbClient,
    single: () => Promise.resolve({ data: null, error: null }), // No data, no error
  };
  const mockUser: any = { id: "user123" };
  const payload = { resourceId: "resourceNotFoundNoData" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.data, undefined);
  assertEquals(result.error?.message, "Resource not found (no data).");
  assertEquals(result.error?.status, 404);
  assertEquals(result.error?.code, "NOT_FOUND");
});

Deno.test("getProjectResourceContent - Error: Access denied (project owner check fails with DB error)", async () => {
  const mockDbClient: any = {
    _callCount: 0,
    from: function() { return this; },
    select: function() { return this; },
    eq: function() { return this; },
    single: function() {
      this._callCount++;
      if (this._callCount === 1) { // First call: dialectic_project_resources
        return Promise.resolve({ 
          data: { 
            project_id: "project123", 
            user_id: "otherUser123", // Different user owns the resource
            file_name: "test.txt", 
            mime_type: "text/plain",
            storage_bucket: "test-bucket",
            storage_path: "test/path/test.txt"
          }, 
          error: null 
        });
      } else { // Second call: dialectic_projects (simulating error)
        return Promise.resolve({
          data: null,
          error: { message: "Simulated project owner DB error" }
        });
      }
    }
  };

  const mockUser: any = { id: "user123" }; // Authenticated user
  const payload = { resourceId: "resourceForbiddenProjectError" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.data, undefined);
  assertEquals(result.error?.message, "Access denied to this resource.");
  assertEquals(result.error?.status, 403);
  assertEquals(result.error?.code, "FORBIDDEN");
});

Deno.test("getProjectResourceContent - Error: Storage download returns no data (empty blob)", async () => {
  const mockDbClient: any = {
    from: () => mockDbClient,
    select: () => mockDbClient,
    eq: () => mockDbClient,
    single: () => Promise.resolve({ 
      data: { 
        project_id: "project123", 
        user_id: "user123", 
        file_name: "test.txt", 
        mime_type: "text/plain",
        storage_bucket: "test-bucket",
        storage_path: "test/path/test.txt"
      }, 
      error: null 
    }),
    storage: {
      from: () => mockDbClient.storage,
      download: () => Promise.resolve({ data: null, error: null }) // No data, no error from download
    }
  };

  const mockUser: any = { id: "user123" };
  const payload = { resourceId: "resourceStorageEmpty" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.data, undefined);
  assertEquals(result.error?.message, "Failed to retrieve resource content (empty).");
  assertEquals(result.error?.status, 500);
  assertEquals(result.error?.code, "STORAGE_EMPTY_CONTENT");
});

Deno.test("getProjectResourceContent - Error: Unexpected error (e.g., fileBlob.text() fails)", async () => {
  const mockDbClient: any = {
    from: () => mockDbClient,
    select: () => mockDbClient,
    eq: () => mockDbClient,
    single: () => Promise.resolve({ 
      data: { 
        project_id: "project123", 
        user_id: "user123", 
        file_name: "test.txt", 
        mime_type: "text/plain",
        storage_bucket: "test-bucket",
        storage_path: "test/path/test.txt"
      }, 
      error: null 
    }),
    storage: {
      from: () => mockDbClient.storage,
      download: () => Promise.resolve({ 
        data: { text: () => Promise.reject(new Error("Simulated text() error")) }, // Simulate error in blob.text()
        error: null 
      })
    }
  };

  const mockUser: any = { id: "user123" };
  const payload = { resourceId: "resourceUnexpectedError" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.data, undefined);
  assertEquals(result.error?.message, "An unexpected error occurred while fetching resource content.");
  assertEquals(result.error?.status, 500);
  assertEquals(result.error?.details, "Simulated text() error");
  assertEquals(result.error?.code, "UNEXPECTED_ERROR");
});

Deno.test("getProjectResourceContent - Happy Path: User owns project, not resource directly", async () => {
  const mockDbClient: any = {
    _callCount: 0,
    from: function() { return this; },
    select: function() { return this; },
    eq: function() { return this; },
    single: function() {
      this._callCount++;
      if (this._callCount === 1) { // First call: dialectic_project_resources
        return Promise.resolve({ 
          data: { 
            project_id: "project123", 
            user_id: "otherUser123", // Different user owns the resource
            file_name: "project_owned.txt", 
            mime_type: "text/plain",
            storage_bucket: "test-bucket",
            storage_path: "test/path/project_owned.txt"
          }, 
          error: null 
        });
      } else { // Second call: dialectic_projects
        return Promise.resolve({
          data: { user_id: "user123" }, // Authenticated user owns the project
          error: null
        });
      }
    },
    storage: {
      from: function() { return this; }, // Ensure 'this' context for chaining
      download: () => Promise.resolve({ data: new Blob(["Project owned content"]), error: null })
    }
  };

  const mockUser: any = { id: "user123" }; // Authenticated user
  const payload = { resourceId: "resourceProjectOwned" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.error, undefined);
  assertEquals(result.data?.fileName, "project_owned.txt");
  assertEquals(result.data?.mimeType, "text/plain");
  assertEquals(result.data?.content, "Project owned content");
});

Deno.test("getProjectResourceContent - Error: Access denied (project not found for secondary check)", async () => {
  const mockDbClient: any = {
    _callCount: 0,
    from: function() { return this; },
    select: function() { return this; },
    eq: function() { return this; },
    single: function() {
      this._callCount++;
      if (this._callCount === 1) { // First call: dialectic_project_resources
        return Promise.resolve({ 
          data: { 
            project_id: "projectNotFound123", 
            user_id: "otherUser123", // Different user owns the resource
            file_name: "test.txt", 
            mime_type: "text/plain",
            storage_bucket: "test-bucket",
            storage_path: "test/path/test.txt"
          }, 
          error: null 
        });
      } else { // Second call: dialectic_projects (simulating project not found)
        return Promise.resolve({
          data: null, // No project data found
          error: null
        });
      }
    }
  };

  const mockUser: any = { id: "user123" }; // Authenticated user
  const payload = { resourceId: "resourceProjectNotFoundForbidden" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.data, undefined);
  assertEquals(result.error?.message, "Access denied to this resource.");
  assertEquals(result.error?.status, 403);
  assertEquals(result.error?.code, "FORBIDDEN");
});

Deno.test("getProjectResourceContent - returns sourceContributionId when source_contribution_id is set", async () => {
  const mockDbClient: any = {
    from: () => mockDbClient,
    select: () => mockDbClient,
    eq: () => mockDbClient,
    single: () => Promise.resolve({ 
      data: { 
        project_id: "project123", 
        user_id: "user123", 
        file_name: "test.txt", 
        mime_type: "text/plain",
        storage_bucket: "test-bucket",
        storage_path: "test/path/test.txt",
        source_contribution_id: "contrib-123"
      }, 
      error: null 
    }),
    storage: {
      from: () => mockDbClient.storage,
      download: () => Promise.resolve({ data: new Blob(["Test content"]), error: null })
    }
  };

  const mockUser: any = { id: "user123" };
  const payload = { resourceId: "resource123" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.error, undefined);
  assertEquals(result.data?.fileName, "test.txt");
  assertEquals(result.data?.mimeType, "text/plain");
  assertEquals(result.data?.content, "Test content");
  assertEquals(result.data?.sourceContributionId, "contrib-123");
});

Deno.test("getProjectResourceContent - returns sourceContributionId as null when source_contribution_id is null", async () => {
  const mockDbClient: any = {
    from: () => mockDbClient,
    select: () => mockDbClient,
    eq: () => mockDbClient,
    single: () => Promise.resolve({ 
      data: { 
        project_id: "project123", 
        user_id: "user123", 
        file_name: "test.txt", 
        mime_type: "text/plain",
        storage_bucket: "test-bucket",
        storage_path: "test/path/test.txt",
        source_contribution_id: null
      }, 
      error: null 
    }),
    storage: {
      from: () => mockDbClient.storage,
      download: () => Promise.resolve({ data: new Blob(["Test content"]), error: null })
    }
  };

  const mockUser: any = { id: "user123" };
  const payload = { resourceId: "resource123" };

  const result = await getProjectResourceContent(payload, mockDbClient as any, mockUser as any);

  assertEquals(result.error, undefined);
  assertEquals(result.data?.fileName, "test.txt");
  assertEquals(result.data?.mimeType, "text/plain");
  assertEquals(result.data?.content, "Test content");
  assertEquals(result.data?.sourceContributionId, null);
}); 