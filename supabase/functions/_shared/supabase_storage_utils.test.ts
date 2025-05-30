import { assert, assertEquals, assertRejects, assertExists, assertStrictEquals } from "jsr:@std/assert";
import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { spy, stub, type Spy, assertSpyCall, assertSpyCalls, assertSpyCallAsync } from "jsr:@std/testing/mock";

import { uploadToStorage, downloadFromStorage, deleteFromStorage, createSignedUrlForPath, getFileMetadata } from "./supabase_storage_utils.ts";
import { createMockSupabaseClient, type IMockClientSpies, type MockSupabaseDataConfig, getStorageSpies } from "./supabase.mock.ts";
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

describe("downloadFromStorage", () => {
  const bucketName = "test-bucket";
  const filePath = "test-file.txt";

  it("should download a file and return ArrayBuffer and mimeType on success", async () => {
    const mockContent = "Hello, world!";
    const mockBlob = new Blob([mockContent], { type: "text/plain" });
    const mockArrayBuffer = await mockBlob.arrayBuffer();

    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        downloadResult: async (_bucket: string, _path: string) => {
          return { data: mockBlob, error: null };
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { data, mimeType, error } = await downloadFromStorage(client as unknown as SupabaseClient, bucketName, filePath);

    assert(data instanceof ArrayBuffer, "Data should be ArrayBuffer");
    assertEquals(new Uint8Array(data!), new Uint8Array(mockArrayBuffer));
    assertEquals(mimeType, "text/plain");
    assertStrictEquals(error, null);
    assertSpyCall(storageSpies.downloadSpy, 0, {
      args: [filePath]
    });
    if (clear) clear(); 
  });

  it("should return an error if Supabase storage download fails", async () => {
    const supabaseError = new Error("Supabase download failed");
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        downloadResult: async (_bucket: string, _path: string) => {
          return { data: null, error: supabaseError };
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { data, mimeType, error } = await downloadFromStorage(client as unknown as SupabaseClient, bucketName, filePath);

    assertStrictEquals(data, null);
    assertStrictEquals(mimeType, undefined);
    assertStrictEquals(error, supabaseError);
    assertSpyCall(storageSpies.downloadSpy, 0, { args: [filePath] });
    if (clear) clear();
  });

  it("should return an error if no data is returned from download (e.g., file not found)", async () => {
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        downloadResult: async (_bucket: string, _path: string) => {
          return { data: null, error: null };
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);
    
    const { data, mimeType, error } = await downloadFromStorage(client as unknown as SupabaseClient, bucketName, filePath);

    assertStrictEquals(data, null);
    assertStrictEquals(mimeType, undefined);
    assert(error instanceof Error, "Error should be an Error instance");
    assertEquals(error?.message, "No data returned from storage download.");
    assertSpyCall(storageSpies.downloadSpy, 0, { args: [filePath] });
    if (clear) clear();
  });

  it("should return an error if Blob.arrayBuffer() throws an exception", async () => {
    const mockBlob = new Blob(["corrupted data"], { type: "application/octet-stream" });
    stub(mockBlob, "arrayBuffer", () => Promise.reject(new Error("ArrayBuffer conversion failed")));

    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        downloadResult: async (_bucket: string, _path: string) => {
          return { data: mockBlob, error: null };
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { data, mimeType, error } = await downloadFromStorage(client as unknown as SupabaseClient, bucketName, filePath);

    assertStrictEquals(data, null);
    assert(error instanceof Error, "Error should be an Error instance");
    assertEquals(error?.message, "ArrayBuffer conversion failed");
    assertSpyCall(storageSpies.downloadSpy, 0, { args: [filePath] });
    if (clear) clear();
  });
});

describe("deleteFromStorage", () => {
  const bucketName = "test-bucket-delete";
  const filePaths = ["path/to/file1.txt", "another/path/to/file2.png"];

  it("should delete files and return null error on success", async () => {
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        removeResult: async (_bucket: string, _paths: string[]) => {
          return { data: null, error: null };
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { error } = await deleteFromStorage(client as unknown as SupabaseClient, bucketName, filePaths);

    assertStrictEquals(error, null);
    assertSpyCall(storageSpies.removeSpy, 0, {
      args: [filePaths]
    });
    if (clear) clear();
  });

  it("should return an error if Supabase storage delete fails", async () => {
    const supabaseError = new Error("Supabase delete failed");
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        removeResult: async (_bucket: string, _paths: string[]) => {
          return { data: null, error: supabaseError };
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { error } = await deleteFromStorage(client as unknown as SupabaseClient, bucketName, filePaths);

    assertStrictEquals(error, supabaseError);
    assertSpyCall(storageSpies.removeSpy, 0, { args: [filePaths] });
    if (clear) clear();
  });

  it("should return an error if the delete call itself throws an exception", async () => {
    const exceptionError = new Error("Network issue during delete");
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        removeResult: async (_bucket: string, _paths: string[]) => {
          throw exceptionError;
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { error } = await deleteFromStorage(client as unknown as SupabaseClient, bucketName, filePaths);

    assert(error instanceof Error);
    assertEquals(error?.message, exceptionError.message);
    assertSpyCall(storageSpies.removeSpy, 0, { args: [filePaths] });
    if (clear) clear();
  });
});

describe("createSignedUrlForPath", () => {
  const bucketName = "test-bucket-signed-url";
  const filePath = "secure/file.pdf";
  const expiresIn = 3600; // 1 hour

  it("should return a signed URL on success", async () => {
    const mockSignedUrl = `https://supabase.example.com/storage/v1/object/sign/${bucketName}/${filePath}?token=mocktoken&expires_in=${expiresIn}`;
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        createSignedUrlResult: async (_bucket: string, _path: string, _expires: number) => {
          return { data: { signedUrl: mockSignedUrl }, error: null };
        }
      }
    });
    client.storage.from(bucketName); 
    const storageSpies = getStorageSpies(client, bucketName);

    const { signedUrl, error } = await createSignedUrlForPath(client as unknown as SupabaseClient, bucketName, filePath, expiresIn);

    assertStrictEquals(signedUrl, mockSignedUrl);
    assertStrictEquals(error, null);
    assertSpyCall(storageSpies.createSignedUrlSpy, 0, {
      args: [filePath, expiresIn]
    });
    if (clear) clear();
  });

  it("should return an error if Supabase client fails to create signed URL", async () => {
    const supabaseError = new Error("Supabase createSignedUrl failed");
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        createSignedUrlResult: async (_bucket: string, _path: string, _expires: number) => {
          return { data: null, error: supabaseError };
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { signedUrl, error } = await createSignedUrlForPath(client as unknown as SupabaseClient, bucketName, filePath, expiresIn);

    assertStrictEquals(signedUrl, null);
    assertStrictEquals(error, supabaseError);
    assertSpyCall(storageSpies.createSignedUrlSpy, 0, { args: [filePath, expiresIn] });
    if (clear) clear();
  });

  it("should return an error if Supabase returns no URL and no error", async () => {
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        createSignedUrlResult: async (_bucket: string, _path: string, _expires: number) => {
          return { data: null, error: null }; // No URL, no error
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { signedUrl, error } = await createSignedUrlForPath(client as unknown as SupabaseClient, bucketName, filePath, expiresIn);

    assertStrictEquals(signedUrl, null);
    assert(error instanceof Error);
    assertEquals(error?.message, "Failed to create signed URL: No URL in response.");
    assertSpyCall(storageSpies.createSignedUrlSpy, 0, { args: [filePath, expiresIn] });
    if (clear) clear();
  });

  it("should return an error if the createSignedUrl call itself throws an exception", async () => {
    const exceptionError = new Error("Network issue during createSignedUrl");
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        createSignedUrlResult: async (_bucket: string, _path: string, _expires: number) => {
          throw exceptionError;
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { signedUrl, error } = await createSignedUrlForPath(client as unknown as SupabaseClient, bucketName, filePath, expiresIn);

    assertStrictEquals(signedUrl, null);
    assert(error instanceof Error);
    assertEquals(error?.message, exceptionError.message);
    assertSpyCall(storageSpies.createSignedUrlSpy, 0, { args: [filePath, expiresIn] });
    if (clear) clear();
  });
});

describe("getFileMetadata", () => {
  const bucketName = "test-bucket-metadata";
  const filePath = "public/images/avatar.png";
  const fileName = "avatar.png";

  it("should return file metadata on success", async () => {
    const mockMetadata = { name: fileName, id: "uuid-for-avatar", metadata: { size: 12345, mimetype: "image/png" } };
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        listResult: async (_bucket: string, path?: string, _options?: object) => {
          if (path === filePath) {
            return { data: [mockMetadata], error: null };
          }
          return { data: [], error: null }; 
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { size, mimeType, error } = await getFileMetadata(client as unknown as SupabaseClient, bucketName, filePath);

    assertEquals(size, mockMetadata.metadata.size);
    assertEquals(mimeType, mockMetadata.metadata.mimetype);
    assertStrictEquals(error, null);
    assertSpyCall(storageSpies.listSpy, 0, { args: [filePath, { limit: 1 }] });
    if (clear) clear();
  });

  it("should return an error if Supabase client fails to list files", async () => {
    const supabaseError = new Error("Supabase list failed");
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        listResult: async (_bucket: string, _path?: string, _options?: object) => {
          return { data: null, error: supabaseError };
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { size, mimeType, error } = await getFileMetadata(client as unknown as SupabaseClient, bucketName, filePath);

    assertStrictEquals(size, undefined);
    assertStrictEquals(mimeType, undefined);
    assertStrictEquals(error, supabaseError);
    assertSpyCall(storageSpies.listSpy, 0, { args: [filePath, { limit: 1 }] });
    if (clear) clear();
  });

  it("should return an error if file list is empty (file not found)", async () => {
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        listResult: async (_bucket: string, _path?: string, _options?: object) => {
          return { data: [], error: null };
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { error } = await getFileMetadata(client as unknown as SupabaseClient, bucketName, filePath);

    assert(error instanceof Error);
    assertEquals(error?.message, "File not found or no metadata returned.");
    if (clear) clear();
  });

  it("should return an error if list returns data but not for the exact file", async () => {
    const otherFileName = "other-file.txt";
    const mockMetadata = { name: otherFileName, id: "uuid-for-other", metadata: { size: 500, mimetype: "text/plain" } };
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        listResult: async (_bucket: string, path?: string, _options?: object) => {
          // Simulate list called with a folder path, returning a different file within that folder
          if (path === filePath) { // still use filePath for the call
            return { data: [mockMetadata], error: null };
          }
          return { data: [], error: null };
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { error } = await getFileMetadata(client as unknown as SupabaseClient, bucketName, filePath);

    assert(error instanceof Error);
    assertEquals(error?.message, `File metadata not found for the exact path "${filePath}" within list results.`);
    if (clear) clear();
  });

  it("should return an error if the list call itself throws an exception", async () => {
    const exceptionError = new Error("Network issue during list");
    const { client, clearAllStubs: clear } = createMockSupabaseClient(undefined, {
      storageMock: {
        listResult: async (_bucket: string, _path?: string, _options?: object) => {
          throw exceptionError;
        }
      }
    });
    client.storage.from(bucketName);
    const storageSpies = getStorageSpies(client, bucketName);

    const { error } = await getFileMetadata(client as unknown as SupabaseClient, bucketName, filePath);

    assert(error instanceof Error);
    assertEquals(error?.message, exceptionError.message);
    assertSpyCall(storageSpies.listSpy, 0, { args: [filePath, { limit: 1 }] });
    if (clear) clear();
  });
}); 