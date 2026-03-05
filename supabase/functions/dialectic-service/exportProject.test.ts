import { assertEquals, assertExists, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@^2.43.4";
import type { Database, Tables } from "../types_db.ts";
import { exportProject } from "./exportProject.ts";
import type { IFileManager, FileRecord, UploadContext, FileManagerError } from "../_shared/types/file_manager.types.ts";
import { createMockFileManagerService, MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import {
    createMockSupabaseClient,
    type IMockStorageListResponse,
    type MockQueryBuilderState,
    type MockSupabaseClientSetup,
} from "../_shared/supabase.mock.ts";
import { configure, ZipReader, BlobReader, TextWriter } from "jsr:@zip-js/zip-js";
import type { IStorageUtils } from "../_shared/types/storage_utils.types.ts";
import type { DownloadStorageResult } from "../_shared/supabase_storage_utils.ts";
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

    /** Root-level file (included in zip). */
    const projectRootReadmePath = `${mockProjectId}/project_readme.md`;
    /** Root-level export zip (excluded from zip). */
    const rootZipName = "project_export_my-test-export-project.zip";
    const rootZipPath = `${mockProjectId}/${rootZipName}`;
    /** Subfolder path prefix. */
    const generalResourcePrefix = `${mockProjectId}/general_resource`;
    const fileInSubfolderPath = `${generalResourcePrefix}/resource1.txt`;

    let projectData: Tables<'dialectic_projects'>;
    /** One resource row only to supply storage_bucket; file set comes from storage list. */
    let bucketResourceData: Tables<'dialectic_project_resources'>;
    let mockFileRecordForZip: FileRecord;
    let readmeContentBuffer: ArrayBuffer;
    let resourceInFolderContentBuffer: ArrayBuffer;

    /** Simulates storage list: project root and one subfolder. Items with id are files, without id are folders. */
    function createListResult(
        _bucketId: string,
        path: string | undefined,
        _options?: object
    ): Promise<IMockStorageListResponse> {
        if (path === mockProjectId) {
            return Promise.resolve({
                data: [
                    { name: "project_readme.md", id: "file-1" },
                    { name: "general_resource", id: undefined },
                    { name: rootZipName, id: "file-zip" },
                ],
                error: null,
            });
        }
        if (path === generalResourcePrefix) {
            return Promise.resolve({
                data: [{ name: "resource1.txt", id: "file-2" }],
                error: null,
            });
        }
        return Promise.resolve({ data: [], error: null });
    }

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
        bucketResourceData = {
            id: "res-bucket",
            project_id: mockProjectId,
            user_id: mockUser.id,
            file_name: "any",
            mime_type: "text/plain",
            size_bytes: 0,
            storage_bucket: mockExportBucket,
            storage_path: mockProjectId,
            resource_description: { type: "general_resource" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: null,
            session_id: mockProjectId,
            source_contribution_id: null,
            stage_slug: "thesis",
        };
        readmeContentBuffer = await new Blob(["# Project readme"]).arrayBuffer();
        resourceInFolderContentBuffer = await new Blob(["Resource 1 content"]).arrayBuffer();

        mockFileRecordForZip = {
            id: "zip-export-file-id-123",
            project_id: mockProjectId,
            user_id: mockUser.id,
            file_name: "project_export_my-test-export-project.zip",
            mime_type: "application/zip",
            size_bytes: 12345,
            storage_bucket: mockExportBucket,
            storage_path: mockProjectId,
            resource_description: { type: "project_export_zip" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
            target_contribution_id: null,
            stage_slug: "thesis",
            iteration_number: 1,
            resource_type: null,
            source_contribution_id: null,
            session_id: mockProjectId,
        };

        mockSupabaseSetup = createMockSupabaseClient(mockUser.id, {
            genericMockResults: {
                "dialectic_projects": {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some((f) => f.column === "id" && f.value === mockProjectId)) {
                            return Promise.resolve({ data: [projectData], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({
                            data: [],
                            error: Object.assign(new Error("Not found"), { code: "PGRST116" }),
                            count: 0,
                            status: 404,
                            statusText: "Not Found",
                        });
                    },
                },
                "dialectic_project_resources": {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some((f) => f.column === "project_id" && f.value === mockProjectId)) {
                            return Promise.resolve({ data: [bucketResourceData], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" });
                    },
                },
                "dialectic_sessions": {
                    select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" }),
                },
            },
            storageMock: {
                listResult: createListResult,
            },
        });

        mockFileManager = createMockFileManagerService();

        const downloadFromStorageImpl = async (
            _client: SupabaseClient,
            bucket: string,
            path: string
        ): Promise<DownloadStorageResult> => {
            if (bucket !== mockExportBucket) {
                return { data: null, error: new Error(`Unexpected bucket ${bucket}`) };
            }
            if (path === projectRootReadmePath) {
                return { data: readmeContentBuffer, error: null };
            }
            if (path === fileInSubfolderPath) {
                return { data: resourceInFolderContentBuffer, error: null };
            }
            return { data: null, error: new Error(`Mock downloadFromStorage: unknown path ${path}`) };
        };

        const createSignedUrlForPathImpl = async (
            _client: SupabaseClient,
            _bucket: string,
            _path: string,
            _expiresIn: number
        ): Promise<{ signedUrl: string | null; error: Error | null }> => {
            return Promise.resolve({ signedUrl: mockSignedUrl, error: null });
        };

        mockStorageUtils = {
            downloadFromStorage: downloadFromStorageImpl,
            createSignedUrlForPath: createSignedUrlForPathImpl,
        };

        downloadFromStorageSpy = stub(mockStorageUtils, "downloadFromStorage", downloadFromStorageImpl);
        createSignedUrlForPathSpy = stub(mockStorageUtils, "createSignedUrlForPath", createSignedUrlForPathImpl);
    });

    afterEach(() => {
        mockSupabaseSetup.clearAllStubs?.();
        downloadFromStorageSpy.restore();
        createSignedUrlForPathSpy.restore();
    });

    it("packages entire project folder from storage at bucket/project_id and returns download link", async () => {
        mockFileManager.setUploadAndRegisterFileResponse(mockFileRecordForZip, null);

        const result = await exportProject(
            mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockFileManager,
            mockStorageUtils,
            mockProjectId,
            mockUser.id
        );

        assertExists(result.data, "Export data should exist on success.");
        assertEquals(result.data?.export_url, mockSignedUrl);
        assertEquals(result.error, undefined);
        assertEquals(result.status, 200);
        assertEquals(result.data?.file_name, mockFileRecordForZip.file_name);

        assertEquals(
            downloadFromStorageSpy.calls.length,
            2,
            "Download should be called for each file under project (excluding root zip)."
        );
        const downloadedPaths = downloadFromStorageSpy.calls.map((c: { args: unknown[] }) => c.args[2] as string);
        assertEquals(downloadedPaths.includes(projectRootReadmePath), true);
        assertEquals(downloadedPaths.includes(fileInSubfolderPath), true);
        assertEquals(
            downloadedPaths.some((p: string) => p === rootZipPath || p.endsWith(rootZipName)),
            false,
            "Root-level export zip must not be downloaded for inclusion."
        );

        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);
        const uploadArgs: UploadContext = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
        assertEquals(uploadArgs.pathContext.projectId, mockProjectId);
        assertEquals(uploadArgs.userId, mockUser.id);
        assertInstanceOf(uploadArgs.fileContent, Buffer);
        assertEquals(uploadArgs.pathContext.fileType, "project_export_zip");
        assertExists(uploadArgs.pathContext.originalFileName);
        const originalFileName = String(uploadArgs.pathContext.originalFileName);
        const expectedSlug = mockProjectName.toLowerCase().replace(/\s+/g, "-");
        assertEquals(originalFileName.toLowerCase().includes(expectedSlug), true);

        assertEquals(createSignedUrlForPathSpy.calls.length, 1);
        assertEquals(createSignedUrlForPathSpy.calls[0].args[2], `${mockFileRecordForZip.storage_path}/${mockFileRecordForZip.file_name}`);
        assertEquals(createSignedUrlForPathSpy.calls[0].args[3], 3600);

        const zipBuffer: Buffer | ArrayBuffer | string = uploadArgs.fileContent;
        const zipReader = new ZipReader(new BlobReader(new Blob([zipBuffer])));
        const entries = await zipReader.getEntries();

        const manifestEntry = entries.find((e) => e.filename === "project_manifest.json");
        assertExists(manifestEntry, "Zip should contain project_manifest.json.");
        const readmeEntry = entries.find((e) => e.filename === projectRootReadmePath);
        assertExists(readmeEntry, "Zip should contain project root file from storage.");
        const subfolderEntry = entries.find((e) => e.filename === fileInSubfolderPath);
        assertExists(subfolderEntry, "Zip should contain file from subfolder in storage.");
        const rootZipEntry = entries.find(
            (e) => e.filename === rootZipPath || e.filename === rootZipName
        );
        assertEquals(rootZipEntry, undefined, "Root-level zip must not be included in the package.");

        await zipReader.close();
    });

    it("includes exact file_name in the export response matching stored file", async () => {
        mockFileManager.setUploadAndRegisterFileResponse(mockFileRecordForZip, null);

        const result = await exportProject(
            mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockFileManager,
            mockStorageUtils,
            mockProjectId,
            mockUser.id
        );

        assertExists(result.data, "Export data should exist on success.");
        assertEquals(
            result.data && "file_name" in result.data ? (result.data as { file_name: string }).file_name : undefined,
            mockFileRecordForZip.file_name
        );
    });

    it("should return 404 if project not found", async () => {
        const nonExistentProjectId = "project-does-not-exist";

        const localMockSupabaseSetup = createMockSupabaseClient(mockUser.id, {
            genericMockResults: {
                "dialectic_projects": {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some((f) => f.column === "id" && f.value === nonExistentProjectId)) {
                            return Promise.resolve({
                                data: null,
                                error: Object.assign(new Error("No rows found for single()"), {
                                    code: "PGRST116",
                                    details: "The query returned no rows",
                                }),
                                count: 0,
                                status: 404,
                                statusText: "Not Found",
                            });
                        }
                        return Promise.resolve({
                            data: [],
                            error: Object.assign(
                                new Error(`Unexpected project ID in 404 test: ${(state.filters.find((f) => f.column === "id") as { value?: string })?.value}`),
                                { code: "UNEXPECTED_QUERY" }
                            ),
                            count: 0,
                            status: 500,
                            statusText: "Internal Server Error",
                        });
                    },
                },
            },
        });

        const result = await exportProject(
            localMockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockFileManager,
            mockStorageUtils,
            nonExistentProjectId,
            mockUser.id
        );

        assertExists(result.error, "Error should exist for non-existent project.");
        assertEquals(result.error?.status, 404);
        assertEquals(result.error?.code, "PROJECT_NOT_FOUND");
        assertEquals(result.data, undefined);

        assertEquals(downloadFromStorageSpy.calls.length, 0);
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 0);
        assertEquals(createSignedUrlForPathSpy.calls.length, 0);

        localMockSupabaseSetup.clearAllStubs?.();
    });

    it("should return 403 if user is not authorized to export", async () => {
        const differentUserId = "user-not-authorized-id";

        const localMockSupabaseSetup = createMockSupabaseClient(differentUserId, {
            genericMockResults: {
                "dialectic_projects": {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some((f) => f.column === "id" && f.value === mockProjectId)) {
                            return Promise.resolve({ data: [projectData], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({
                            data: [],
                            error: Object.assign(new Error("Not found"), { code: "PGRST116" }),
                            count: 0,
                            status: 404,
                            statusText: "Not Found",
                        });
                    },
                },
            },
        });

        const result = await exportProject(
            localMockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockFileManager,
            mockStorageUtils,
            mockProjectId,
            differentUserId
        );

        assertExists(result.error, "Error should exist for unauthorized user.");
        assertEquals(result.error?.status, 403);
        assertEquals(result.error?.code, "AUTH_EXPORT_FORBIDDEN");
        assertEquals(result.data, undefined);

        assertEquals(downloadFromStorageSpy.calls.length, 0);
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 0);
        assertEquals(createSignedUrlForPathSpy.calls.length, 0);

        localMockSupabaseSetup.clearAllStubs?.();
    });

    it("should return 500 if fetching project_resources fails (bucket unknown)", async () => {
        const localMockSupabaseSetup = createMockSupabaseClient(mockUser.id, {
            genericMockResults: {
                "dialectic_projects": {
                    select: () => Promise.resolve({ data: [projectData], error: null, count: 1, status: 200, statusText: "OK" }),
                },
                "dialectic_project_resources": {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: Object.assign(new Error("Simulated DB error"), { code: "DB_ERROR" }),
                            count: 0,
                            status: 500,
                            statusText: "Internal Server Error",
                        }),
                },
            },
        });

        const result = await exportProject(
            localMockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockFileManager,
            mockStorageUtils,
            mockProjectId,
            mockUser.id
        );

        assertExists(result.error, "Function should return an error when resource fetch fails.");
        assertEquals(result.error?.status, 500);
        assertEquals(result.data, undefined);

        localMockSupabaseSetup.clearAllStubs?.();
    });

    it("should return 500 when download of a listed file fails", async () => {
        const failingDownloadImpl = async (
            _client: SupabaseClient,
            bucket: string,
            path: string
        ): Promise<DownloadStorageResult> => {
            if (bucket !== mockExportBucket) return { data: null, error: new Error(`Unexpected bucket ${bucket}`) };
            if (path === projectRootReadmePath) return { data: readmeContentBuffer, error: null };
            if (path === fileInSubfolderPath) return { data: null, error: new Error("Simulated download failure") };
            return { data: null, error: new Error(`Unexpected path ${path}`) };
        };
        const localStorageUtils: IStorageUtils = {
            downloadFromStorage: failingDownloadImpl,
            createSignedUrlForPath: mockStorageUtils.createSignedUrlForPath,
        };
        const localDownloadSpy = stub(localStorageUtils, "downloadFromStorage", failingDownloadImpl);

        const result = await exportProject(
            mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockFileManager,
            localStorageUtils,
            mockProjectId,
            mockUser.id
        );

        assertExists(result.error, "Export should fail when a listed file cannot be downloaded.");
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.code, "EXPORT_DOWNLOAD_FAILED");
        assertEquals(result.data, undefined);
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 0);
        assertEquals(createSignedUrlForPathSpy.calls.length, 0);

        localDownloadSpy.restore();
    });

    it("should return 500 if FileManager.uploadAndRegisterFile fails", async () => {
        const fmError = {
            name: "FMError",
            message: "Simulated FileManager upload error",
            status: 500,
            code: "FM_UPLOAD_ERROR",
            details: "Underlying DB unique constraint violation",
        };
        mockFileManager.setUploadAndRegisterFileResponse(null, fmError as FileManagerError);

        const result = await exportProject(
            mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockFileManager,
            mockStorageUtils,
            mockProjectId,
            mockUser.id
        );

        assertExists(result.error, "Error should exist when FileManager fails.");
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.code, "EXPORT_FM_UPLOAD_FAILED");
        assertEquals(result.error?.message, "Failed to store project export file using FileManager.");
        assertEquals(result.error?.details, fmError.details);
        assertEquals(result.data, undefined);

        assertEquals(
            downloadFromStorageSpy.calls.length,
            2,
            "Downloads for listed files should have occurred before FileManager failure."
        );
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);
        assertEquals(createSignedUrlForPathSpy.calls.length, 0);
    });

    it("should return 500 if storageUtils.createSignedUrlForPath fails", async () => {
        mockFileManager.setUploadAndRegisterFileResponse(mockFileRecordForZip, null);

        const signedUrlError = new Error("Simulated createSignedUrlForPath failure");
        const localFailedSignedUrlImpl = async () =>
            Promise.resolve({ signedUrl: null, error: signedUrlError });
        const localTestStorageUtils: IStorageUtils = {
            downloadFromStorage: mockStorageUtils.downloadFromStorage,
            createSignedUrlForPath: localFailedSignedUrlImpl,
        };
        const localCreateSignedUrlSpy = stub(
            localTestStorageUtils,
            "createSignedUrlForPath",
            localFailedSignedUrlImpl
        );

        const result = await exportProject(
            mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockFileManager,
            localTestStorageUtils,
            mockProjectId,
            mockUser.id
        );

        assertExists(result.error, "Error should exist when createSignedUrlForPath fails.");
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.code, "EXPORT_SIGNED_URL_FAILED");
        assertEquals(result.error?.details, signedUrlError.message);
        assertEquals(result.data, undefined);
        assertEquals(downloadFromStorageSpy.calls.length, 2);
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);
        assertEquals(localCreateSignedUrlSpy.calls.length, 1);

        localCreateSignedUrlSpy.restore();
    });

    it("should succeed with manifest only when project folder in storage is empty", async () => {
        const emptyListResult = (
            _bucketId: string,
            path: string | undefined,
            _options?: object
        ): Promise<IMockStorageListResponse> => {
            if (path === mockProjectId) {
                return Promise.resolve({ data: [], error: null });
            }
            return Promise.resolve({ data: [], error: null });
        };

        const localMockSupabaseSetup = createMockSupabaseClient(mockUser.id, {
            genericMockResults: {
                "dialectic_projects": {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some((f) => f.column === "id" && f.value === mockProjectId)) {
                            return Promise.resolve({ data: [projectData], error: null, count: 1, status: 200, statusText: "OK" });
                        }
                        return Promise.resolve({
                            data: [],
                            error: Object.assign(new Error("Not found"), { code: "PGRST116" }),
                            count: 0,
                            status: 404,
                            statusText: "Not Found",
                        });
                    },
                },
                "dialectic_project_resources": {
                    select: () =>
                        Promise.resolve({ data: [bucketResourceData], error: null, count: 1, status: 200, statusText: "OK" }),
                },
                "dialectic_sessions": {
                    select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" }),
                },
            },
            storageMock: { listResult: emptyListResult },
        });

        mockFileManager.setUploadAndRegisterFileResponse(mockFileRecordForZip, null);

        const result = await exportProject(
            localMockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockFileManager,
            mockStorageUtils,
            mockProjectId,
            mockUser.id
        );

        assertExists(result.data, "Export data should exist when project folder is empty.");
        assertEquals(result.data?.export_url, mockSignedUrl);
        assertEquals(result.error, undefined);
        assertEquals(result.status, 200);

        assertEquals(downloadFromStorageSpy.calls.length, 0, "No file downloads when folder is empty.");
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);
        assertEquals(createSignedUrlForPathSpy.calls.length, 1);

        const zipBuffer = mockFileManager.uploadAndRegisterFile.calls[0].args[0].fileContent;
        const zipReader = new ZipReader(new BlobReader(new Blob([zipBuffer])));
        const entries = await zipReader.getEntries();

        assertEquals(entries.length, 1, "Zip should only contain project_manifest.json.");
        const manifestEntry = entries.find((e) => e.filename === "project_manifest.json");
        assertExists(manifestEntry, "project_manifest.json not found in zip.");
        if (manifestEntry?.getData) {
            const manifest = JSON.parse(await manifestEntry.getData(new TextWriter()));
            assertEquals(manifest.project.id, mockProjectId);
        }

        await zipReader.close();
        localMockSupabaseSetup.clearAllStubs?.();
    });

    it("uses a deterministic export filename at the project root to enable overwrite", async () => {
        mockFileManager.setUploadAndRegisterFileResponse(mockFileRecordForZip, null);

        const result = await exportProject(
            mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockFileManager,
            mockStorageUtils,
            mockProjectId,
            mockUser.id
        );

        assertExists(result.data);
        assertEquals(result.status, 200);

        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length > 0, true);
        const uploadArgs: UploadContext = mockFileManager.uploadAndRegisterFile.calls[
            mockFileManager.uploadAndRegisterFile.calls.length - 1
        ].args[0];
        const expectedSlug = mockProjectName.toLowerCase().replace(/\s+/g, "-");
        const expectedDeterministic = `project_export_${expectedSlug}.zip`;
        assertEquals(uploadArgs.pathContext.fileType, "project_export_zip");
        assertEquals(uploadArgs.pathContext.projectId, mockProjectId);
        assertEquals(uploadArgs.pathContext.originalFileName, expectedDeterministic);
    });

    it("repeated exports use the same deterministic filename to support overwrite semantics", async () => {
        const localFM = createMockFileManagerService();
        localFM.setUploadAndRegisterFileResponse(mockFileRecordForZip, null);

        const first = await exportProject(
            mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            localFM,
            mockStorageUtils,
            mockProjectId,
            mockUser.id
        );
        assertExists(first.data);
        assertEquals(first.status, 200);

        const second = await exportProject(
            mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            localFM,
            mockStorageUtils,
            mockProjectId,
            mockUser.id
        );
        assertExists(second.data);
        assertEquals(second.status, 200);

        assertEquals(localFM.uploadAndRegisterFile.calls.length >= 2, true);
        const firstArgs: UploadContext = localFM.uploadAndRegisterFile.calls[0].args[0];
        const secondArgs: UploadContext = localFM.uploadAndRegisterFile.calls[1].args[0];
        assertEquals(firstArgs.pathContext.originalFileName, secondArgs.pathContext.originalFileName);
        const expectedSlug = mockProjectName.toLowerCase().replace(/\s+/g, "-");
        const expectedDeterministic = `project_export_${expectedSlug}.zip`;
        assertEquals(firstArgs.pathContext.originalFileName, expectedDeterministic);
        assertEquals(secondArgs.pathContext.originalFileName, expectedDeterministic);
    });
}); 