import { assert, assertEquals, assertRejects, assertExists } from "jsr:@std/assert";
import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { spy, stub, type Spy, assertSpyCall, assertSpyCalls, assertSpyCallAsync } from "jsr:@std/testing/mock";

import { uploadToStorage } from "./supabase_storage_utils.ts";
import { createMockSupabaseClient, type IMockClientSpies, type MockSupabaseDataConfig } from "./supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.43.4";

describe("uploadToStorage", () => {
  it("should successfully upload a file with upsert false by default", async () => {
    const bucketName = "test-bucket";
    const filePath = "test_folder/test_file.txt";
    const fileContent = "Hello, Supabase Storage!";
    
    const mockConfig: MockSupabaseDataConfig = {
      storageMock: {
        uploadResult: { data: { path: filePath }, error: null },
      }
    };
    const { client: mockSupabaseClient, spies } = createMockSupabaseClient("test-user-id", mockConfig);

    const result = await uploadToStorage(
      mockSupabaseClient as unknown as SupabaseClient, 
      bucketName,
      filePath,
      fileContent,
      { contentType: "text/plain" }
    );

    assertEquals(result.path, filePath);
    assertEquals(result.error, null);

    const uploadSpy = spies.storage.from(bucketName).uploadSpy;
    
    assertSpyCalls(uploadSpy, 1);
    await assertSpyCallAsync(uploadSpy, 0, {
      args: [filePath, fileContent, { contentType: "text/plain", upsert: false }],
      returned: { data: { path: filePath }, error: null },
    });
  });

  it("should successfully upload a file with upsert true", async () => {
    const bucketName = "test-bucket-upsert";
    const filePath = "another_folder/image.png";
    const fileContent = new ArrayBuffer(10);

    const mockConfig: MockSupabaseDataConfig = {
      storageMock: {
        uploadResult: { data: { path: filePath }, error: null },
      }
    };
    const { client: mockSupabaseClient, spies } = createMockSupabaseClient("test-user-id", mockConfig);

    const result = await uploadToStorage(
      mockSupabaseClient as unknown as SupabaseClient, 
      bucketName,
      filePath,
      fileContent,
      { contentType: "image/png", upsert: true }
    );

    assertEquals(result.path, filePath);
    assertEquals(result.error, null);

    const uploadSpy = spies.storage.from(bucketName).uploadSpy;
    assertSpyCalls(uploadSpy, 1);
    await assertSpyCallAsync(uploadSpy, 0, {
      args: [filePath, fileContent, { contentType: "image/png", upsert: true }],
      returned: { data: { path: filePath }, error: null },
    });
  });

  it("should return an error if Supabase client fails to upload", async () => {
    const bucketName = "test-bucket-fail";
    const filePath = "errors/error_file.json";
    const fileContent = JSON.stringify({ message: "failure" });
    const supabaseError = new Error("Supabase storage RLS error");

    const mockConfig: MockSupabaseDataConfig = {
      storageMock: {
        uploadResult: { data: null, error: supabaseError },
      }
    };
    const { client: mockSupabaseClient, spies } = createMockSupabaseClient("test-user-id", mockConfig);

    const result = await uploadToStorage(
      mockSupabaseClient as unknown as SupabaseClient, 
      bucketName,
      filePath,
      fileContent,
      { contentType: "application/json" }
    );

    assertEquals(result.path, null);
    assertEquals(result.error?.message, supabaseError.message);

    const uploadSpy = spies.storage.from(bucketName).uploadSpy;
    assertSpyCalls(uploadSpy, 1);
    await assertSpyCallAsync(uploadSpy, 0, {
      args: [filePath, fileContent, { contentType: "application/json", upsert: false }],
      returned: { data: null, error: supabaseError }, 
    });
  });

  it("should return an error if the upload call itself throws an exception", async () => {
    const bucketName = "test-bucket-exception";
    const filePath = "exceptions/exception.log";
    const fileContent = "Log entry";
    const exceptionError = new Error("Network connection failed unexpectedly");

    const mockConfig: MockSupabaseDataConfig = {
      storageMock: {
        uploadResult: () => {
          throw exceptionError;
        },
      }
    };
    const { client: mockSupabaseClient, spies } = createMockSupabaseClient("test-user-id", mockConfig);
    
    const result = await uploadToStorage(
      mockSupabaseClient as unknown as SupabaseClient, 
      bucketName,
      filePath,
      fileContent,
      { contentType: "text/plain" }
    );

    assertEquals(result.path, null);
    assertEquals(result.error?.message, exceptionError.message);
    
    const uploadSpy = spies.storage.from(bucketName).uploadSpy;
    assertSpyCalls(uploadSpy, 1);
    await assertSpyCallAsync(uploadSpy, 0, {
      args: [filePath, fileContent, { contentType: "text/plain", upsert: false }],
      error: {
        Class: Error,
        msgIncludes: exceptionError.message,
      },
    });
  });

  it("basic spy sanity check for Deno's spy functionality", () => {
    const simpleService = {
      process: (data: string): string => {
        return `processed: ${data}`;
      },
    };

    const processSpy = spy(simpleService, 'process');

    assertSpyCalls(processSpy, 0);

    const result = simpleService.process("test_data");
    assertEquals(result, "processed: test_data");

    assertSpyCalls(processSpy, 1);
    assertSpyCall(processSpy, 0, { args: ["test_data"], returned: "processed: test_data" });
  });

}); 