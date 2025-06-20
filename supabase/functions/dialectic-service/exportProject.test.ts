import { assertEquals, assertExists, assertInstanceOf, assertObjectMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@^2.43.4";
import type { Database, Tables } from "../types_db.ts";
import { exportProject } from "./exportProject.ts";
import type { IFileManager, FileRecord, UploadContext } from "../_shared/types/file_manager.types.ts";
import { createMockFileManagerService, MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";
import { configure, ZipReader, BlobReader, TextWriter } from "jsr:@zip-js/zip-js";
import type { DialecticProject, DialecticProjectResource, DialecticSession, DialecticContribution } from "./dialectic.interface.ts";
import type { DownloadStorageResult } from "../_shared/supabase_storage_utils.ts";
import type { IStorageUtils } from "../_shared/types/storage_utils.types.ts";
import { Buffer } from "https://deno.land/std@0.177.0/node/buffer.ts";

describe("exportProject", () => {
    configure({
        useWebWorkers: false,
    });

    let mockSupabaseSetup: MockSupabaseClientSetup;
    let mockFileManager: MockFileManagerService;
    let mockStorageUtils: IStorageUtils;
    let downloadFromStorageSpy: Stub<
        IStorageUtils, 
        Parameters<IStorageUtils["downloadFromStorage"]>,
        ReturnType<IStorageUtils["downloadFromStorage"]>
    >;
    let createSignedUrlForPathSpy: Stub<
        IStorageUtils, 
        Parameters<IStorageUtils["createSignedUrlForPath"]>,
        ReturnType<IStorageUtils["createSignedUrlForPath"]>
    >;

    const mockUser: User = {
        id: "user-export-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockProjectId = "project-export-id-123";
    const mockProjectName = "My Test Export Project";
    const mockExportBucket = "project-exports";
    const mockSignedUrl = "https://example.com/signed/url/project_export.zip";

    let projectData: Tables<'dialectic_projects'>;
    let resource1Data: Tables<'dialectic_project_resources'>;
    let session1Data: Tables<'dialectic_sessions'>;
    let contribution1Data: Tables<'dialectic_contributions'>;
    let resource1ContentBuffer: ArrayBuffer;
    let contribution1ContentBuffer: ArrayBuffer;
    let contribution1RawJsonContentBuffer: ArrayBuffer;
    let mockFileRecordForZip: FileRecord;

    beforeEach(async () => {
        projectData = {
            id: mockProjectId,
            user_id: mockUser.id,
            project_name: mockProjectName,
            initial_user_prompt: "Initial prompt for project.",
            process_template_id: "pt-1",
            selected_domain_id: "sd-1",
            selected_domain_overlay_id: null,
            user_domain_overlay_values: null,
            repo_url: null,
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            initial_prompt_resource_id: null,
        };
        resource1Data = {
            id: "res-1",
            project_id: mockProjectId,
            user_id: mockUser.id,
            file_name: "resource1.txt",
            mime_type: "text/plain",
            size_bytes: 100,
            storage_bucket: mockExportBucket,
            storage_path: "project_files/resource1.txt",
            resource_description: JSON.stringify({type: "general_resource"}),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        resource1ContentBuffer = await new Blob(["Resource 1 content"]).arrayBuffer();
        session1Data = {
            id: "sess-1",
            project_id: mockProjectId,
            session_description: "Session 1 description",
            iteration_count: 1,
            selected_model_catalog_ids: ["mc-1"],
            user_input_reference_url: null,
            current_stage_id: "stage-1",
            status: "completed",
            associated_chat_id: "chat-1",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        contribution1Data = {
            id: "contrib-1",
            session_id: "sess-1",
            user_id: mockUser.id,
            model_id: "ai_model_id_1",
            model_name: "Test Model",
            stage: "hypothesis",
            iteration_number: 1,
            file_name: "contrib1_content.md",
            mime_type: "text/markdown",
            size_bytes: 200,
            storage_bucket: mockExportBucket,
            storage_path: "session_files/contrib1_content.md",
            raw_response_storage_path: "session_files/contrib1_raw.json",
            contribution_type: "model_completion",
            citations: null,
            error: null,
            prompt_template_id_used: null,
            tokens_used_input: 10,
            tokens_used_output: 20,
            processing_time_ms: 1000,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            target_contribution_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            seed_prompt_url: null,
        };
        contribution1ContentBuffer = await new Blob(["Contribution 1 main content"]).arrayBuffer();
        contribution1RawJsonContentBuffer = await new Blob([JSON.stringify({ raw: "response" })]).arrayBuffer();
        mockFileRecordForZip = { 
            id: "zip-export-file-id-123",
            project_id: mockProjectId,
            user_id: mockUser.id,
            file_name: `project_export_${mockProjectName.replace(/\s+/g, '-')}_TIMESTAMP.zip`,
            mime_type: "application/zip",
            size_bytes: 12345,
            storage_bucket: mockExportBucket,
            storage_path: `project_exports/${mockProjectId}/project_export_${mockProjectName.replace(/\s+/g, '-')}_TIMESTAMP.zip`,
            resource_description: JSON.stringify({type: "project_export_zip"}),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        } as FileRecord;

        mockSupabaseSetup = createMockSupabaseClient(mockUser.id, {
            genericMockResults: {
                'dialectic_projects': {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId)) {
                            return Promise.resolve({ data: [projectData], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({ data: [], error: { message: "Not found" } as any, count: 0, status: 404, statusText: "Not Found" });
                    }
                },
                'dialectic_project_resources': {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'project_id' && f.value === mockProjectId)) {
                            return Promise.resolve({ data: [resource1Data], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" });
                    }
                },
                'dialectic_sessions': {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'project_id' && f.value === mockProjectId)) {
                            return Promise.resolve({ data: [session1Data], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" });
                    }
                },
                'dialectic_contributions': {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'session_id' && f.value === session1Data.id)) {
                            const testContribData = { ...contribution1Data, parent_contribution_id: contribution1Data.target_contribution_id };
                            return Promise.resolve({ data: [testContribData], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" });
                    }
                }
            }
        });

        mockFileManager = createMockFileManagerService();
        
        // Define the mock implementations first
        const downloadFromStorageImpl = async (_client: SupabaseClient, bucket: string, path: string): Promise<DownloadStorageResult> => {
            if (bucket === mockExportBucket && path === resource1Data.storage_path) {
                return { data: resource1ContentBuffer, error: null };
            }
            if (bucket === mockExportBucket && path === contribution1Data.storage_path) {
                return { data: contribution1ContentBuffer, error: null };
            }
            if (bucket === mockExportBucket && path === contribution1Data.raw_response_storage_path) {
                return { data: contribution1RawJsonContentBuffer, error: null };
            }
            return { data: null, error: new Error(`Mock downloadFromStorage error: Unknown path ${path}`) };
        };

        const createSignedUrlForPathImpl = async (
            _client: SupabaseClient,
            _bucket: string, 
            _path: string, 
            _expiresIn: number
        ): Promise<{ signedUrl: string | null; error: Error | null }> => {
            return Promise.resolve({ signedUrl: mockSignedUrl, error: null }); // Removed redundant await
        };

        mockStorageUtils = {
            downloadFromStorage: downloadFromStorageImpl,
            createSignedUrlForPath: createSignedUrlForPathImpl,
        };

        // Create stubs that use the defined implementations
        // These stubs replace the methods on mockStorageUtils but will execute the Impl functions
        downloadFromStorageSpy = stub(
            mockStorageUtils,
            "downloadFromStorage",
            downloadFromStorageImpl
        );
        createSignedUrlForPathSpy = stub(
            mockStorageUtils,
            "createSignedUrlForPath",
            createSignedUrlForPathImpl
        );
    });

    afterEach(() => {
        mockSupabaseSetup.clearAllStubs?.();
        downloadFromStorageSpy.restore();
        createSignedUrlForPathSpy.restore();
    });

    it("should successfully export a project with resources, sessions, and contributions", async () => {
        mockFileManager.setUploadAndRegisterFileResponse(mockFileRecordForZip, null);
        
        const result = await exportProject(mockSupabaseSetup.client as any, mockFileManager, mockStorageUtils, mockProjectId, mockUser.id);

        assertExists(result.data, "Export data should exist on success.");
        assertEquals(result.data?.export_url, mockSignedUrl);
        assertEquals(result.error, undefined);
        assertEquals(result.status, 200);
        
        assertEquals(downloadFromStorageSpy.calls.length, 3);
        assertEquals(downloadFromStorageSpy.calls[0].args, [mockSupabaseSetup.client as any, mockExportBucket, resource1Data.storage_path]);
        assertEquals(downloadFromStorageSpy.calls[1].args, [mockSupabaseSetup.client as any, mockExportBucket, contribution1Data.storage_path]);
        assertEquals(downloadFromStorageSpy.calls[2].args, [mockSupabaseSetup.client as any, mockExportBucket, contribution1Data.raw_response_storage_path]);

        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);
        const uploadArgs = mockFileManager.uploadAndRegisterFile.calls[0].args[0] as UploadContext;
        assertEquals(uploadArgs.pathContext.projectId, mockProjectId);
        assertEquals(uploadArgs.userId, mockUser.id);
        assertInstanceOf(uploadArgs.fileContent, Buffer);
        assertEquals(uploadArgs.pathContext.fileType, 'general_resource'); 
        assertExists(uploadArgs.pathContext.originalFileName);

        assertEquals(createSignedUrlForPathSpy.calls.length, 1);
        assertEquals(createSignedUrlForPathSpy.calls[0].args, [
            mockSupabaseSetup.client as any, 
            mockFileRecordForZip.storage_bucket, 
            mockFileRecordForZip.storage_path, 
            3600
        ]);
        
        const zipBufferSentToFileManager = mockFileManager.uploadAndRegisterFile.calls[0].args[0].fileContent as Buffer;
        const zipBlobForReading = new Blob([zipBufferSentToFileManager]);
        const zipReader = new ZipReader(new BlobReader(zipBlobForReading));
        const entries = await zipReader.getEntries();
        
        assertEquals(entries.length, 4, "Zip should contain manifest, 1 resource, 1 contrib content, 1 contrib raw");
        
        const manifestEntry = entries.find(e => e.filename === "project_manifest.json");
        assertExists(manifestEntry, "project_manifest.json not found in zip");
        if (manifestEntry && manifestEntry.getData) {
            const manifestText = await manifestEntry.getData(new TextWriter());
            const manifest = JSON.parse(manifestText);
            assertEquals(manifest.project.id, mockProjectId);
            assertEquals(manifest.resources.length, 1);
            assertEquals(manifest.resources[0].id, resource1Data.id);
            assertEquals(manifest.sessions.length, 1);
            assertEquals(manifest.sessions[0].id, session1Data.id);
            assertEquals(manifest.sessions[0].contributions.length, 1);
            assertEquals(manifest.sessions[0].contributions[0].id, contribution1Data.id);
        }

        const resourceFileEntry = entries.find(e => e.filename === `resources/${resource1Data.file_name}`);
        assertExists(resourceFileEntry, "Resource file not found in zip");

        const contribContentEntry = entries.find(e => e.filename.startsWith(`sessions/${session1Data.id}/contributions/${contribution1Data.id}_content`));
        assertExists(contribContentEntry, "Contribution content file not found in zip");
        
        const contribRawEntry = entries.find(e => e.filename.startsWith(`sessions/${session1Data.id}/contributions/${contribution1Data.id}_raw.json`));
        assertExists(contribRawEntry, "Contribution raw JSON file not found in zip");

        await zipReader.close();
    });

    it("should return 404 if project not found", async () => {
        const nonExistentProjectId = "project-does-not-exist";

        // Create a new mockSupabaseSetup for this specific test case
        const localMockSupabaseSetup = createMockSupabaseClient(mockUser.id, {
            genericMockResults: {
                'dialectic_projects': {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'id' && f.value === nonExistentProjectId)) {
                            // Simulate PGRST116 (no rows for .single()) which exportProject handles as a 404
                            return Promise.resolve({ data: null, error: { message: "No rows found for single()", code: "PGRST116", details: "The query returned no rows" } as any, count: 0, status: 404, statusText: "Not Found" });
                        }
                        // Fallback for this specific mock setup if any other ID is queried (should not happen in this test)
                        return Promise.resolve({ data: [], error: { message: `Unexpected project ID queried in 'project not found' test: ${state.filters.find(f=>f.column==='id')?.value}`, code: "UNEXPECTED_QUERY" } as any, count: 0, status: 500, statusText: "Internal Server Error" });
                    }
                },
                // No need to mock other tables for this test as the function should exit early.
            }
        });

        const result = await exportProject(
            localMockSupabaseSetup.client as any, // Use the locally configured client
            mockFileManager, // Uses the describe-level mock, which is fine as we assert no calls
            mockStorageUtils, // Uses the describe-level mock, fine for asserting no calls
            nonExistentProjectId, 
            mockUser.id
        );

        assertExists(result.error, "Error should exist for non-existent project.");
        assertEquals(result.error?.status, 404);
        assertEquals(result.error?.code, 'PROJECT_NOT_FOUND');
        assertEquals(result.data, undefined);

        // Ensure no file operations were attempted on the describe-level mocks
        assertEquals(downloadFromStorageSpy.calls.length, 0);
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 0);
        assertEquals(createSignedUrlForPathSpy.calls.length, 0);

        // Clean up stubs from the local Supabase client setup, if any were created by it.
        // The main spies (downloadFromStorageSpy, etc.) are restored by the describe-level afterEach.
        localMockSupabaseSetup.clearAllStubs?.();
    });

    it("should return 403 if user is not authorized to export", async () => {
        const differentUserId = "user-not-authorized-id";
        // Ensure projectData.user_id is different from differentUserId
        // projectData is set up in beforeEach to use mockUser.id

        // Create a new mockSupabaseSetup for this specific test case
        const localMockSupabaseSetup = createMockSupabaseClient(differentUserId, { // Client initialized with the 'different' user
            genericMockResults: {
                'dialectic_projects': {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId)) {
                            // Return the project data as if the project exists
                            return Promise.resolve({ data: [projectData], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({ data: [], error: { message: "Not found" } as any, count: 0, status: 404, statusText: "Not Found" });
                    }
                },
            }
        });

        const result = await exportProject(
            localMockSupabaseSetup.client as any, 
            mockFileManager, 
            mockStorageUtils, 
            mockProjectId,      // Project ID that exists
            differentUserId     // User ID that does not own the project
        );

        assertExists(result.error, "Error should exist for unauthorized user.");
        assertEquals(result.error?.status, 403);
        assertEquals(result.error?.code, 'AUTH_EXPORT_FORBIDDEN');
        assertEquals(result.data, undefined);

        // Ensure no file operations were attempted
        assertEquals(downloadFromStorageSpy.calls.length, 0);
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 0);
        assertEquals(createSignedUrlForPathSpy.calls.length, 0);

        localMockSupabaseSetup.clearAllStubs?.();
    });

    it("should continue export if fetching project_resources fails (non-fatal)", async () => {
        const localMockSupabaseSetup = createMockSupabaseClient(mockUser.id, {
            genericMockResults: {
                'dialectic_projects': {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId)) {
                            return Promise.resolve({ data: [projectData], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({ data: [], error: { message: "Project not found for this test scenario" } as any, count: 0, status: 404, statusText: "Not Found" });
                    }
                },
                'dialectic_project_resources': {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'project_id' && f.value === mockProjectId)) {
                            return Promise.resolve({ data: null, error: { message: "Simulated DB error fetching resources", code: "DB_FETCH_ERROR" } as any, count: 0, status: 500, statusText: "Internal Server Error" });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" }); // Should not be called if project_id matches
                    }
                },
                'dialectic_sessions': {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'project_id' && f.value === mockProjectId)) {
                            return Promise.resolve({ data: [session1Data], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" });
                    }
                },
                'dialectic_contributions': {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'session_id' && f.value === session1Data.id)) {
                            return Promise.resolve({ data: [{ ...contribution1Data, parent_contribution_id: contribution1Data.target_contribution_id }], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" });
                    }
                }
            }
        });

        // FileManager should still be called to upload the zip
        mockFileManager.setUploadAndRegisterFileResponse(mockFileRecordForZip, null);

        const result = await exportProject(
            localMockSupabaseSetup.client as any, 
            mockFileManager, 
            mockStorageUtils, 
            mockProjectId, 
            mockUser.id
        );

        assertExists(result.data, "Export data should exist even if fetching resources failed.");
        assertEquals(result.data?.export_url, mockSignedUrl);
        assertEquals(result.error, undefined); // The error is logged but not returned as fatal
        assertEquals(result.status, 200);
        
        // Should only download contribution files, not project resources
        assertEquals(downloadFromStorageSpy.calls.length, 2, "Should attempt to download 2 contribution files.");
        assertEquals(downloadFromStorageSpy.calls[0].args[2], contribution1Data.storage_path);
        assertEquals(downloadFromStorageSpy.calls[1].args[2], contribution1Data.raw_response_storage_path);

        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "File manager should be called to upload the zip.");
        assertEquals(createSignedUrlForPathSpy.calls.length, 1, "Create signed URL should be called.");

        const zipBuffer = mockFileManager.uploadAndRegisterFile.calls[0].args[0].fileContent as Buffer;
        const zipBlob = new Blob([zipBuffer]);
        const zipReader = new ZipReader(new BlobReader(zipBlob));
        const entries = await zipReader.getEntries();

        assertEquals(entries.length, 3, "Zip should contain manifest, 1 contrib content, 1 contrib raw.");
        
        const manifestEntry = entries.find(e => e.filename === "project_manifest.json");
        assertExists(manifestEntry, "project_manifest.json not found in zip");
        if (manifestEntry && manifestEntry.getData) {
            const manifest = JSON.parse(await manifestEntry.getData(new TextWriter()));
            assertEquals(manifest.project.id, mockProjectId);
            assertEquals(manifest.resources.length, 0, "Manifest resources array should be empty.");
            assertEquals(manifest.sessions.length, 1);
            assertEquals(manifest.sessions[0].contributions.length, 1);
        }

        assertExists(entries.find(e => e.filename.startsWith(`sessions/${session1Data.id}/contributions/${contribution1Data.id}_content`)), "Contrib content missing");
        assertExists(entries.find(e => e.filename.startsWith(`sessions/${session1Data.id}/contributions/${contribution1Data.id}_raw.json`)), "Contrib raw JSON missing");
        assertEquals(entries.find(e => e.filename.startsWith("resources/")), undefined, "No resource files should be in the zip.");

        await zipReader.close();
        localMockSupabaseSetup.clearAllStubs?.();
    });

    it("should skip a resource and continue if its downloadFromStorage fails", async () => {
        const resource2Data: Tables<'dialectic_project_resources'> = {
            id: "res-2-fails",
            project_id: mockProjectId,
            user_id: mockUser.id,
            file_name: "resource2_fails.txt",
            mime_type: "text/plain",
            size_bytes: 50,
            storage_bucket: mockExportBucket,
            storage_path: "project_files/resource2_fails.txt",
            resource_description: JSON.stringify({type: "another_resource"}),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        const resource2ContentBuffer = await new Blob(["Resource 2 content - should not be in zip"]).arrayBuffer(); // Not used by download

        const localMockSupabaseSetup = createMockSupabaseClient(mockUser.id, {
            genericMockResults: {
                'dialectic_projects': { select: () => Promise.resolve({ data: [projectData], error: null }) },
                'dialectic_project_resources': { select: () => Promise.resolve({ data: [resource1Data, resource2Data], error: null }) },
                'dialectic_sessions': { select: () => Promise.resolve({ data: [session1Data], error: null }) },
                'dialectic_contributions': { select: () => Promise.resolve({ data: [{ ...contribution1Data, parent_contribution_id: contribution1Data.target_contribution_id }], error: null }) },
            }
        });

        const localDownloadImpl = async (_client: SupabaseClient, bucket: string, path: string): Promise<DownloadStorageResult> => {
            if (path === resource1Data.storage_path) return { data: resource1ContentBuffer, error: null };
            if (path === resource2Data.storage_path) return { data: null, error: new Error("Simulated download failure for resource2") };
            if (path === contribution1Data.storage_path) return { data: contribution1ContentBuffer, error: null };
            if (path === contribution1Data.raw_response_storage_path) return { data: contribution1RawJsonContentBuffer, error: null };
            return { data: null, error: new Error(`Test localDownloadImpl: Unknown path ${path}`) };
        };
        const localCreateSignedUrlImpl = async () => Promise.resolve({ signedUrl: mockSignedUrl, error: null });

        const localTestStorageUtils: IStorageUtils = {
            downloadFromStorage: localDownloadImpl,
            createSignedUrlForPath: localCreateSignedUrlImpl,
        };
        const localDownloadSpy = stub(localTestStorageUtils, "downloadFromStorage", localDownloadImpl);
        const localSignedUrlSpy = stub(localTestStorageUtils, "createSignedUrlForPath", localCreateSignedUrlImpl);

        mockFileManager.setUploadAndRegisterFileResponse(mockFileRecordForZip, null);

        const result = await exportProject(
            localMockSupabaseSetup.client as any, 
            mockFileManager, 
            localTestStorageUtils, // Pass the locally configured storage utils
            mockProjectId, 
            mockUser.id
        );

        assertExists(result.data, "Export should succeed even if one resource download fails.");
        assertEquals(result.data?.export_url, mockSignedUrl);
        assertEquals(result.error, undefined);
        assertEquals(result.status, 200);

        assertEquals(localDownloadSpy.calls.length, 4, "Download should be attempted for all 4 files.");
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);
        assertEquals(localSignedUrlSpy.calls.length, 1);

        const zipBuffer = mockFileManager.uploadAndRegisterFile.calls[0].args[0].fileContent as Buffer;
        const zipReader = new ZipReader(new BlobReader(new Blob([zipBuffer])));
        const entries = await zipReader.getEntries();

        assertEquals(entries.length, 4, "Zip should contain manifest, 1 successful resource, 1 contrib content, 1 contrib raw.");
        const fileNamesInZip = entries.map(e => e.filename);

        assertExists(fileNamesInZip.find(name => name === "project_manifest.json"));
        assertExists(fileNamesInZip.find(name => name === `resources/${resource1Data.file_name}`), "Resource1 should be in zip");
        assertEquals(fileNamesInZip.find(name => name === `resources/${resource2Data.file_name}`), undefined, "Failed resource2 should not be in zip");
        assertExists(fileNamesInZip.find(name => name.startsWith(`sessions/${session1Data.id}/contributions/${contribution1Data.id}_content`)));
        assertExists(fileNamesInZip.find(name => name.startsWith(`sessions/${session1Data.id}/contributions/${contribution1Data.id}_raw.json`)));
        
        const manifestEntry = entries.find(e => e.filename === "project_manifest.json");
        assertExists(manifestEntry);
        if (manifestEntry && manifestEntry.getData) {
            const manifest = JSON.parse(await manifestEntry.getData(new TextWriter()));
            assertEquals(manifest.resources.length, 2, "Manifest should still list both resources, even if one failed to download.");
        }

        await zipReader.close();
        localMockSupabaseSetup.clearAllStubs?.();
        localDownloadSpy.restore();
        localSignedUrlSpy.restore();
    });

    it("should return 500 if FileManager.uploadAndRegisterFile fails", async () => {
        // Record initial call counts for spies that are set up in beforeEach
        const initialDownloadCalls = downloadFromStorageSpy.calls.length;
        const initialSignedUrlCalls = createSignedUrlForPathSpy.calls.length;
        const initialFileManagerCalls = mockFileManager.uploadAndRegisterFile.calls.length;

        // Configure FileManager to fail
        const fmError = { message: "Simulated FileManager upload error", status: 500, code: "FM_UPLOAD_ERROR" };
        mockFileManager.setUploadAndRegisterFileResponse(null, fmError as any);

        // Supabase client and storage utils will use the global mocks from beforeEach, which should succeed for fetching/downloading.

        const result = await exportProject(
            mockSupabaseSetup.client as any, 
            mockFileManager,              
            mockStorageUtils,             
            mockProjectId, 
            mockUser.id
        );

        assertExists(result.error, "Error should exist when FileManager fails.");
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.code, 'EXPORT_FM_UPLOAD_FAILED');
        assertEquals(result.error?.details, fmError.message);
        assertEquals(result.data, undefined);

        // Downloads should have occurred before the FileManager failure
        assertEquals(downloadFromStorageSpy.calls.length, initialDownloadCalls + 3, "Download attempts for resource, contrib content, and contrib raw.");
        
        // FileManager.uploadAndRegisterFile should have been called once
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, initialFileManagerCalls + 1);

        // createSignedUrlForPath should NOT have been called
        assertEquals(createSignedUrlForPathSpy.calls.length, initialSignedUrlCalls + 0, "createSignedUrlForPath should not be called if FileManager fails.");
    });

    it("should return 500 if storageUtils.createSignedUrlForPath fails", async () => {
        const initialDownloadCalls = downloadFromStorageSpy.calls.length;
        const initialFileManagerCalls = mockFileManager.uploadAndRegisterFile.calls.length;
        // We will create a local spy for createSignedUrlForPath, so no need to track its initial global count.

        // FileManager should succeed for this test
        mockFileManager.setUploadAndRegisterFileResponse(mockFileRecordForZip, null);

        // Configure a local IStorageUtils where createSignedUrlForPath fails
        const signedUrlError = new Error("Simulated createSignedUrlForPath failure");
        const localFailedSignedUrlImpl = async () => Promise.resolve({ signedUrl: null, error: signedUrlError });
        
        const localTestStorageUtils: IStorageUtils = {
            // Use the globally successful download implementation for simplicity, or define a local successful one.
            // The key is that downloads should succeed to reach the signed URL step.
            downloadFromStorage: mockStorageUtils.downloadFromStorage, // Using the global successful spy setup in beforeEach
            createSignedUrlForPath: localFailedSignedUrlImpl,      // This part fails
        };
        // Spy on the failing method of the local utility
        const localCreateSignedUrlSpy = stub(localTestStorageUtils, "createSignedUrlForPath", localFailedSignedUrlImpl);

        const result = await exportProject(
            mockSupabaseSetup.client as any, 
            mockFileManager, 
            localTestStorageUtils, // Use the locally configured storage utils
            mockProjectId, 
            mockUser.id
        );

        assertExists(result.error, "Error should exist when createSignedUrlForPath fails.");
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.code, 'EXPORT_SIGNED_URL_FAILED');
        assertEquals(result.error?.details, signedUrlError.message);
        assertEquals(result.data, undefined);

        // Downloads should have occurred
        assertEquals(downloadFromStorageSpy.calls.length, initialDownloadCalls + 3);
        
        // FileManager.uploadAndRegisterFile should have been called
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, initialFileManagerCalls + 1);

        // The local createSignedUrlForPath spy (which fails) should have been called once
        assertEquals(localCreateSignedUrlSpy.calls.length, 1);

        localCreateSignedUrlSpy.restore(); // Restore the locally created spy
    });

    it("should succeed with an empty zip (manifest only) if project has no resources or sessions", async () => {
        const initialDownloadCalls = downloadFromStorageSpy.calls.length;
        const initialFileManagerCalls = mockFileManager.uploadAndRegisterFile.calls.length;
        const initialSignedUrlCalls = createSignedUrlForPathSpy.calls.length;

        const localMockSupabaseSetup = createMockSupabaseClient(mockUser.id, {
            genericMockResults: {
                'dialectic_projects': { 
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId)) {
                            return Promise.resolve({ data: [projectData], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({ data: [], error: { message: "Project not found" } as any, count: 0, status: 404, statusText: "Not Found" });
                    }
                },
                'dialectic_project_resources': { select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" }) },
                'dialectic_sessions': { select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" }) },
                // No contributions will be fetched if sessions are empty.
            }
        });

        mockFileManager.setUploadAndRegisterFileResponse(mockFileRecordForZip, null);
        // Global mockStorageUtils is used, createSignedUrlForPath should succeed.

        const result = await exportProject(
            localMockSupabaseSetup.client as any, 
            mockFileManager, 
            mockStorageUtils, 
            mockProjectId, 
            mockUser.id
        );

        assertExists(result.data, "Export data should exist for project with no resources/sessions.");
        assertEquals(result.data?.export_url, mockSignedUrl);
        assertEquals(result.error, undefined);
        assertEquals(result.status, 200);

        assertEquals(downloadFromStorageSpy.calls.length, initialDownloadCalls + 0, "No downloads should be attempted.");
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, initialFileManagerCalls + 1, "File manager should be called to upload the zip.");
        assertEquals(createSignedUrlForPathSpy.calls.length, initialSignedUrlCalls + 1, "Create signed URL should be called.");

        const zipBuffer = mockFileManager.uploadAndRegisterFile.calls[0].args[0].fileContent as Buffer;
        const zipReader = new ZipReader(new BlobReader(new Blob([zipBuffer])));
        const entries = await zipReader.getEntries();

        assertEquals(entries.length, 1, "Zip should only contain project_manifest.json.");
        const manifestEntry = entries.find(e => e.filename === "project_manifest.json");
        assertExists(manifestEntry, "project_manifest.json not found in zip.");

        if (manifestEntry && manifestEntry.getData) {
            const manifest = JSON.parse(await manifestEntry.getData(new TextWriter()));
            assertEquals(manifest.project.id, mockProjectId);
            assertEquals(manifest.resources.length, 0, "Manifest resources should be empty.");
            assertEquals(manifest.sessions.length, 0, "Manifest sessions should be empty.");
        }

        await zipReader.close();
        localMockSupabaseSetup.clearAllStubs?.();
    });

    // TODO: Add more test cases:
    // - Project with no sessions / no resources (empty manifest sections, empty zip folders)
}); 