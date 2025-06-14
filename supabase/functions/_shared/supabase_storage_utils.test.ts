import { assert, assertEquals, assertRejects, assertExists, assertStrictEquals, assertStringIncludes } from "jsr:@std/assert";
import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { spy, stub, type Spy, assertSpyCall, assertSpyCalls, assertSpyCallAsync } from "jsr:@std/testing/mock";

import { uploadToStorage, downloadFromStorage, deleteFromStorage, createSignedUrlForPath, getFileMetadata } from "./supabase_storage_utils.ts";
import { createMockSupabaseClient, type IMockClientSpies, type MockSupabaseDataConfig, getStorageSpies, type MockSupabaseClientSetup } from "./supabase.mock.ts";
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
    const bucketName = 'test-bucket-delete-success';
    const pathsToDelete = ['path/to/file1.txt', 'another/path/to/file2.png'];
    const mockFileObjects = pathsToDelete.map(name => ({ name, id: 'some-id', created_at: '', updated_at: '', last_accessed_at: '', metadata: {} }));

    const { client, spies }: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
      storageMock: {
        removeResult: { data: mockFileObjects, error: null }
      }
    });

    const result = await deleteFromStorage(client as unknown as SupabaseClient, bucketName, pathsToDelete);

    assertStrictEquals(result.error, null);
    assertSpyCall(spies.storage.from(bucketName).removeSpy, 0, { args: [pathsToDelete] });
  });

  it("should return an error if Supabase storage delete fails", async () => {
    const bucketName = 'test-bucket-delete-fail';
    const pathsToDelete = ["path/to/failure.txt"];
    const mockError = new Error("Supabase RLS delete policy violation.");

    const { client, spies }: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
      storageMock: {
        removeResult: { data: null, error: mockError }
      }
    });

    const result = await deleteFromStorage(client as unknown as SupabaseClient, bucketName, pathsToDelete);

    assertExists(result.error);
    assertEquals(result.error, mockError);
    assertSpyCall(spies.storage.from(bucketName).removeSpy, 0, { args: [pathsToDelete] });
  });

  it("should return an error if the delete call itself throws an exception", async () => {
    const bucketName = 'test-bucket-delete-exception';
    const pathsToDelete = ["path/to/exception.txt"];
    const mockError = new Error("Network connection failed during delete");

    const { client, spies }: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
      storageMock: {
        removeResult: () => { throw mockError; }
      }
    });

    const result = await deleteFromStorage(client as unknown as SupabaseClient, bucketName, pathsToDelete);

    assertExists(result.error);
    assertEquals(result.error, mockError);
    assertSpyCall(spies.storage.from(bucketName).removeSpy, 0, { args: [pathsToDelete] });
  });

  it("should return an error if file count mismatches", async () => {
    const bucketName = 'test-bucket-delete-mismatch';
    const pathsToDelete = ["path/one.txt", "path/two.txt"];
    
    const mockFileObjects = [{ name: 'path/one.txt', id: 'some-id', created_at: '', updated_at: '', last_accessed_at: '', metadata: {} }];

    const { client }: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
      storageMock: {
        removeResult: { data: mockFileObjects, error: null }
      }
    });

    const result = await deleteFromStorage(client as unknown as SupabaseClient, bucketName, pathsToDelete);

    assertExists(result.error);
    assertStringIncludes(result.error!.message, "file count mismatch");
  });

  it("should return an error if file names mismatch", async () => {
    const bucketName = 'test-bucket-delete-name-mismatch';
    const pathsToDelete = ["path/one.txt", "path/two.txt"];
    
    const mockFileObjects = [
      { name: 'path/one.txt', id: 'id1', created_at: '', updated_at: '', last_accessed_at: '', metadata: {} },
      { name: 'path/DIFFERENT.txt', id: 'id2', created_at: '', updated_at: '', last_accessed_at: '', metadata: {} }
    ];
    
    const { client }: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
      storageMock: {
        removeResult: { data: mockFileObjects, error: null }
      }
    });

    const result = await deleteFromStorage(client as unknown as SupabaseClient, bucketName, pathsToDelete);

    assertExists(result.error);
    assertStringIncludes(result.error!.message, "not all input path names were found");
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
    const bucketName = 'test-bucket-metadata';
    const fullPath = 'public/images/avatar.png';
    const directoryPath = 'public/images';
    const mockMetadata = { size: 12345, mimetype: 'image/png' };

    const mockFileList = [{
      name: fileName,
      id: 'some-uuid',
      metadata: mockMetadata,
      created_at: '2023-01-01T00:00:00.000Z',
      last_accessed_at: '2023-01-01T00:00:00.000Z',
      updated_at: '2023-01-01T00:00:00.000Z',
    }];

    const { client, spies }: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
      storageMock: {
        listResult: { data: mockFileList, error: null }
      }
    });

    const result = await getFileMetadata(client as unknown as SupabaseClient, bucketName, fullPath);

    assertStrictEquals(result.error, null);
    assertEquals(result.size, mockMetadata.size);
    assertEquals(result.mimeType, mockMetadata.mimetype);
    assertSpyCall(spies.storage.from(bucketName).listSpy, 0, { 
      args: [directoryPath, { search: fileName, limit: 1 }] 
    });
  });

  it("should return an error if Supabase client fails to list files", async () => {
    const bucketName = 'test-bucket-metadata-fail';
    const fullPath = 'public/images/avatar.png';
    const mockError = new Error("Supabase list RLS error.");

    const { client }: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
      storageMock: {
        listResult: { data: null, error: mockError }
      }
    });

    const result = await getFileMetadata(client as unknown as SupabaseClient, bucketName, fullPath);
    
    assertExists(result.error);
    assertEquals(result.error, mockError);
  });

  it("should return an error if file list is empty (file not found)", async () => {
    const bucketName = 'test-bucket-metadata-notfound';
    const fullPath = 'public/images/nonexistent.png';

    const { client }: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
      storageMock: {
        listResult: { data: [], error: null } // Empty list
      }
    });

    const result = await getFileMetadata(client as unknown as SupabaseClient, bucketName, fullPath);

    assertExists(result.error);
    assertStringIncludes(result.error!.message, 'File not found');
  });

  it("should return an error if file object has incomplete metadata", async () => {
    const bucketName = 'test-bucket-metadata-incomplete';
    const fullPath = 'public/images/folder-as-file.png';

    const mockFileList = [{
      name: 'folder-as-file.png',
      id: undefined, 
      metadata: undefined 
    }];

    const { client }: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
      storageMock: {
        listResult: { data: mockFileList, error: null }
      }
    });

    const result = await getFileMetadata(client as unknown as SupabaseClient, bucketName, fullPath);
    
    assertExists(result.error);
    assertStringIncludes(result.error!.message, 'is not a file or lacks expected metadata');
  });

  it("should return an error if the list call itself throws an exception", async () => {
    const bucketName = 'test-bucket-metadata-exception';
    const fullPath = 'public/images/exception.png';
    const mockError = new Error("Network connection failed during list");

    const { client }: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
      storageMock: {
        listResult: () => { throw mockError; }
      }
    });

    const result = await getFileMetadata(client as unknown as SupabaseClient, bucketName, fullPath);

    assertExists(result.error);
    assertEquals(result.error, mockError);
  });

  it("should handle paths without a directory", async () => {
    const bucketName = 'test-bucket-metadata-root';
    const fullPath = 'rootfile.txt';

    const { client, spies }: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
      storageMock: {
        listResult: { data: [], error: null }
      }
    });

    await getFileMetadata(client as unknown as SupabaseClient, bucketName, fullPath);
    
    assertSpyCall(spies.storage.from(bucketName).listSpy, 0, {
      args: ['', { search: fullPath, limit: 1 }] // Expects directoryPath to be ''
    });
  });

  it("should return an error for an invalid path", async () => {
    const bucketName = 'test-bucket-metadata-invalid-path';
    const fullPath = 'public/images/'; // Path ending in slash is invalid

    const { client }: MockSupabaseClientSetup = createMockSupabaseClient();
    const result = await getFileMetadata(client as unknown as SupabaseClient, bucketName, fullPath);

    assertExists(result.error);
    assertStringIncludes(result.error!.message, 'Invalid file path provided');
  });
}); 