// deno-lint-ignore-file no-explicit-any
import {
    assertEquals,
    assertExists,
    assert,
  } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
    describe,
    it,
    beforeEach,
    afterEach,
  } from "https://deno.land/std@0.190.0/testing/bdd.ts";
import { Spy, spy, Stub, stub } from "https://deno.land/std@0.190.0/testing/mock.ts";
import { exportProject } from "./exportProject.ts";
import * as sharedLogger from "../_shared/logger.ts";
import type { Database } from "../types_db.ts";
import type { User } from "npm:@supabase/gotrue-js@^2.6.3";
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    type MockQueryBuilderState,
    type IMockStorageDownloadResponse
} from '../_shared/supabase.mock.ts';
import * as zip from "jsr:@zip-js/zip-js"; // Import all of zip.js for configuration
import { ZipWriter, TextReader, BlobReader } from "jsr:@zip-js/zip-js"; 
// import * as supabaseStorageUtils from "../_shared/supabase_storage_utils.ts"; // No longer directly stubbing these
import type { ServiceError } from "../_shared/types.ts";

describe('Dialectic Service: exportProject Action', () => {
    let mockUser: User;
    let projectIdToExport: string;
    
    let loggerWarnStub: Stub | undefined;
    let zipWriterAddSpy: Spy<zip.ZipWriter<Blob>, [string, zip.TextReader | zip.BlobReader, any?], Promise<any>>;
    let zipWriterCloseSpy: Spy<zip.ZipWriter<Blob>, [], Promise<Blob>>;
    
    const mockProjectToExport: Database['public']['Tables']['dialectic_projects']['Row'] = {
        id: 'export-project-uuid',
        user_id: 'user-uuid',
        project_name: 'Project To Export',
        initial_user_prompt: 'Export this prompt',
        initial_prompt_resource_id: null,
        selected_domain_overlay_id: null,
        selected_domain_id: 'domain-id-1',
        repo_url: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_domain_overlay_values: null,
        process_template_id: 'proc-template-uuid-456',
    };

    const mockResourceToExport: Database['public']['Tables']['dialectic_project_resources']['Row'] = {
        id: 'export-resource-uuid',
        project_id: mockProjectToExport.id,
        user_id: mockProjectToExport.user_id!,
        file_name: 'resource_to_export.txt',
        storage_bucket: 'dialectic-project-resources-bucket',
        storage_path: `projects/${mockProjectToExport.id}/resources/resource_to_export.txt`,
        mime_type: 'text/plain',
        size_bytes: 100,
        resource_description: 'Test resource',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const mockResourceContent = new TextEncoder().encode('This is resource content.');

    const mockSessionToExport: Database['public']['Tables']['dialectic_sessions']['Row'] = {
        id: 'export-session-uuid',
        project_id: mockProjectToExport.id,
        session_description: 'Session to export',
        iteration_count: 1,
        selected_model_catalog_ids: null,
        current_stage_id: 'stage-uuid-synthesis',
        status: 'synthesis_complete',
        associated_chat_id: null,
        user_input_reference_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    
    const mockContributionToExport: Database['public']['Tables']['dialectic_contributions']['Row'] = {
        id: 'export-contrib-uuid',
        session_id: mockSessionToExport.id,
        content_storage_bucket: 'dialectic-contributions',
        content_storage_path: `${mockProjectToExport.id}/${mockSessionToExport.id}/export-contrib-uuid_content.md`,
        content_mime_type: 'text/markdown',
        content_size_bytes: 150,
        raw_response_storage_path: `${mockProjectToExport.id}/${mockSessionToExport.id}/export-contrib-uuid_raw.json`,
        tokens_used_input: 5,
        tokens_used_output: 100,
        processing_time_ms: 2000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        iteration_number: 1,
        citations: null,
        error: null,
        model_id: 'session-model-id',
        model_name: 'gpt-4',
        stage: 'synthesis',
        target_contribution_id: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        contribution_type: 'model_generated',
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        user_id: 'user-uuid',
    };
    const mockContributionContent = new TextEncoder().encode('# Contribution Content');
    const mockRawResponseContent = new TextEncoder().encode('{"raw": "response"}');

    beforeEach(() => {
        mockUser = { 
            id: 'user-uuid', 
            email: 'test@example.com', 
            app_metadata: {}, 
            user_metadata: {}, 
            aud: 'authenticated',
            created_at: new Date().toISOString(),
        };
        projectIdToExport = mockProjectToExport.id;
        
        zip.configure({ useWebWorkers: false });

        zipWriterAddSpy = spy(zip.ZipWriter.prototype, "add") as unknown as Spy<zip.ZipWriter<Blob>, [string, zip.TextReader | zip.BlobReader, any?], Promise<any>>;
        zipWriterCloseSpy = stub(zip.ZipWriter.prototype, "close", () => 
            Promise.resolve(new Blob(["mock zip content"], {type: "application/zip"}))
        ) as unknown as Spy<zip.ZipWriter<Blob>, [], Promise<Blob>>; 
    });

    afterEach(() => {
        loggerWarnStub?.restore();
        zipWriterAddSpy?.restore();
        if (zipWriterCloseSpy && typeof (zipWriterCloseSpy as any).restore === 'function') {
            (zipWriterCloseSpy as any).restore();
        }
    });

    const createNotFoundError = (message = "Not found", code = "PGRST116") => {
        const error = new Error(message);
        (error as any).code = code; 
        (error as any).name = 'PostgrestError'; 
        return error;
    };

    it('should successfully export a project and return a signed URL', async () => {
        const dbMockConfig: MockSupabaseDataConfig['genericMockResults'] = {
            'dialectic_projects': {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === projectIdToExport)) {
                        return { data: [mockProjectToExport], error: null, count: 1 };
                    }
                    return { data: null, error: createNotFoundError(), count: 0 };
                }
            },
            'dialectic_project_resources': {
                select: { data: [mockResourceToExport], error: null, count: 1 }
            },
            'dialectic_sessions': {
                select: { data: [mockSessionToExport], error: null, count: 1 }
            },
            'dialectic_contributions': {
                select: { data: [mockContributionToExport], error: null, count: 1 }
            }
        };

        const mockUploadedPath = `project_exports/${projectIdToExport}/project_export_project-to-export_test-timestamp.zip`;
        const mockSignedUrl = `https://mock.supabase.co/storage/v1/object/sign/${mockUploadedPath}?token=mockToken`;

        const storageMockConfig: MockSupabaseDataConfig['storageMock'] = {
            downloadResult: async (_bucketId: string, path: string): Promise<IMockStorageDownloadResponse> => {
                let content: Uint8Array | null = null;
                if (path === mockResourceToExport.storage_path) content = mockResourceContent;
                else if (path === mockContributionToExport.content_storage_path) content = mockContributionContent;
                else if (path === mockContributionToExport.raw_response_storage_path) content = mockRawResponseContent;

                if (content) {
                    return { data: new Blob([content]), error: null }; 
                }
                return { data: null, error: new Error('File not found in mock storage') };
            },
            uploadResult: (_bucketId: string, _path: string, _body: unknown, _options?: unknown) => {
                return Promise.resolve({ data: { path: mockUploadedPath }, error: null });
            },
            createSignedUrlResult: (_bucketId: string, path: string, _expiresIn: number) => {
                if (path === mockUploadedPath) {
                    return Promise.resolve({ data: { signedUrl: mockSignedUrl }, error: null });
                }
                return Promise.resolve({ data: null, error: new Error('Signed URL path mismatch') });
            }
        };
        
        const clientConfig: MockSupabaseDataConfig = { 
            genericMockResults: dbMockConfig,
            storageMock: storageMockConfig
        };

        const { client: testClient, spies: testSpies, clearAllStubs } = createMockSupabaseClient(
            mockUser.id, 
            clientConfig
        );
        
        const result = await exportProject(
            testClient as any, 
            projectIdToExport, 
            mockUser.id
        );

        assertExists(result);
        assertEquals(result.status, 200);
        assertExists(result.data?.export_url);
        assertEquals(result.data?.export_url, mockSignedUrl);
        assertEquals(result.error, undefined);
        
        const projectSelectSpy = testSpies.getHistoricQueryBuilderSpies('dialectic_projects', 'select');
        assertExists(projectSelectSpy);
        assertEquals(projectSelectSpy.callCount > 0, true);

        const resourceSelectSpy = testSpies.getHistoricQueryBuilderSpies('dialectic_project_resources', 'select');
        assertExists(resourceSelectSpy);
        assertEquals(resourceSelectSpy.callCount > 0, true);

        const downloadSpyProjectResources = testSpies.storage.from(mockResourceToExport.storage_bucket).downloadSpy;
        assertExists(downloadSpyProjectResources);
        assertExists(downloadSpyProjectResources.calls.find(c => c.args[0] === mockResourceToExport.storage_path));
        
        const downloadSpyContributions = testSpies.storage.from(mockContributionToExport.content_storage_bucket).downloadSpy;
        assertExists(downloadSpyContributions);
        assertExists(downloadSpyContributions.calls.find(c => c.args[0] === mockContributionToExport.content_storage_path));
        assertExists(downloadSpyContributions.calls.find(c => c.args[0] === mockContributionToExport.raw_response_storage_path));

        assertEquals(zipWriterAddSpy.calls.length >= 1, true, "ZipWriter.add should be called at least for manifest"); 
        
        const manifestCall = zipWriterAddSpy.calls.find(call => call.args[0] === 'project_manifest.json');
        assertExists(manifestCall, "Manifest should be added to zip");
        assert(manifestCall.args[1] instanceof zip.TextReader, "Manifest should be added as TextReader");

        const resourceFileCall = zipWriterAddSpy.calls.find(call => call.args[0] === `resources/${mockResourceToExport.file_name}`);
        assertExists(resourceFileCall, "Resource file should be added to zip");
        assert(resourceFileCall.args[1] instanceof zip.BlobReader, "Resource file should be added as BlobReader");
        
        const contentFileCall = zipWriterAddSpy.calls.find(call => call.args[0] === `sessions/${mockSessionToExport.id}/contributions/${mockContributionToExport.id}_content.markdown`);
        assertExists(contentFileCall, "Contribution content file should be added to zip");
        assert(contentFileCall.args[1] instanceof zip.BlobReader, "Contribution content should be added as BlobReader");

        const rawResponseFileCall = zipWriterAddSpy.calls.find(call => call.args[0] === `sessions/${mockSessionToExport.id}/contributions/${mockContributionToExport.id}_raw.json`);
        assertExists(rawResponseFileCall, "Contribution raw response file should be added to zip");
        assert(rawResponseFileCall.args[1] instanceof zip.BlobReader, "Contribution raw response should be added as BlobReader");
        
        assertEquals(zipWriterCloseSpy.calls.length, 1, "ZipWriter.close should be called once");
        
        // Assertions for client's storage method calls
        const contributionsStorageSpies = testSpies.storage.from('dialectic-contributions');
        assertEquals(contributionsStorageSpies.uploadSpy.calls.length, 1);
        const uploadArgs = contributionsStorageSpies.uploadSpy.calls[0].args;
        assert(uploadArgs[0].startsWith(`project_exports/${projectIdToExport}/project_export_project-to-export_`), "Storage path for zip is incorrect");
        assert(uploadArgs[1] instanceof Blob, "Content for upload should be a Blob");
        assertEquals((uploadArgs[2] as any).contentType, "application/zip");


        assertEquals(contributionsStorageSpies.createSignedUrlSpy.calls.length, 1);
        const signedUrlArgs = contributionsStorageSpies.createSignedUrlSpy.calls[0].args;
        assertEquals(signedUrlArgs[0], mockUploadedPath); // path from uploadToStorage result (which is mockUploadedPath here)
        assertEquals(signedUrlArgs[1], 3600); // expiresIn

        clearAllStubs?.(); 
    });

    it('should return 404 if project does not exist for export', async () => {
        const dbMockConfig: MockSupabaseDataConfig['genericMockResults'] = {
            'dialectic_projects': {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === 'non-existent-project-id')) {
                        return { data: null, error: createNotFoundError("Not found", "PGRST116"), count: 0 };
                    }
                    // Fallback for any other ID to prevent test pollution
                    return { data: [mockProjectToExport], error: null, count: 1 };
                }
            }
        };
        const { client: testClient, clearAllStubs } = createMockSupabaseClient(mockUser.id, { genericMockResults: dbMockConfig });
        
        const result = await exportProject(testClient as any, 'non-existent-project-id', mockUser.id);

        assertExists(result.error);
        assertEquals(result.error?.status, 404);
        assertEquals(result.error?.code, 'PROJECT_NOT_FOUND');
        assertEquals(result.data, undefined);
        clearAllStubs?.();
    });

    it('should return 403 if user is not authorized to export project', async () => {
        const otherUserId = 'other-user-uuid';
        const dbMockConfig: MockSupabaseDataConfig['genericMockResults'] = {
            'dialectic_projects': {
                select: { data: [{ ...mockProjectToExport, user_id: otherUserId }], error: null, count: 1 }
            }
        };
        const { client: testClient, clearAllStubs } = createMockSupabaseClient(mockUser.id, { genericMockResults: dbMockConfig });

        const result = await exportProject(testClient as any, projectIdToExport, mockUser.id);
        
        assertExists(result.error);
        assertEquals(result.error?.status, 403);
        assertEquals(result.error?.code, 'AUTH_EXPORT_FORBIDDEN');
        assertEquals(result.data, undefined);
        clearAllStubs?.();
    });

    it('should return 500 if database error occurs fetching project', async () => {
        const dbError = new Error("Simulated DB connection error");
        (dbError as any).code = "XX000"; // Generic internal error
        const dbMockConfig: MockSupabaseDataConfig['genericMockResults'] = {
            'dialectic_projects': {
                select: { data: null, error: dbError, count: 0 }
            }
        };
        const { client: testClient, clearAllStubs } = createMockSupabaseClient(mockUser.id, { genericMockResults: dbMockConfig });

        const result = await exportProject(testClient as any, projectIdToExport, mockUser.id);

        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.code, 'DB_PROJECT_FETCH_ERROR');
        assertEquals(result.data, undefined);
        clearAllStubs?.();
    });

    it('should return 500 if uploading the zip to storage fails', async () => {
        // Setup for successful DB reads
        const dbMockConfig: MockSupabaseDataConfig['genericMockResults'] = {
            'dialectic_projects': { select: { data: [mockProjectToExport], error: null, count: 1 }},
            'dialectic_project_resources': { select: { data: [], error: null, count: 0 }}, // Keep it simple
            'dialectic_sessions': { select: { data: [], error: null, count: 0 }}
        };

        const uploadError = new Error("Simulated S3 failure");
        const clientConfig: MockSupabaseDataConfig = { 
            genericMockResults: dbMockConfig,
            storageMock: {
                uploadResult: () => Promise.resolve({ data: null, error: uploadError })
            }
        };

        const { client: testClient, spies: testSpies, clearAllStubs } = createMockSupabaseClient(mockUser.id, clientConfig);

        const result = await exportProject(testClient as any, projectIdToExport, mockUser.id);

        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.code, 'EXPORT_STORAGE_UPLOAD_FAILED');
        assertEquals(result.error?.details, uploadError.message);
        assertEquals(result.data, undefined);
        
        const contributionsStorageSpies = testSpies.storage.from('dialectic-contributions');
        assertEquals(contributionsStorageSpies.uploadSpy.calls.length, 1); // It was attempted
        assertEquals(contributionsStorageSpies.createSignedUrlSpy.calls.length, 0); // Should not be called if upload fails
        clearAllStubs?.();
    });

    it('should return 500 if creating signed URL fails', async () => {
        const dbMockConfig: MockSupabaseDataConfig['genericMockResults'] = {
            'dialectic_projects': { select: { data: [mockProjectToExport], error: null, count: 1 }},
            'dialectic_project_resources': { select: { data: [], error: null, count: 0 }},
            'dialectic_sessions': { select: { data: [], error: null, count: 0 }}
        };
        
        const mockUploadedPath = `project_exports/${projectIdToExport}/project_export_project-to-export_test-timestamp.zip`;
        const signedUrlError = new Error("Simulated signed URL generation failure");

        const clientConfig: MockSupabaseDataConfig = { 
            genericMockResults: dbMockConfig,
            storageMock: {
                uploadResult: () => Promise.resolve({ data: { path: mockUploadedPath }, error: null }),
                createSignedUrlResult: () => Promise.resolve({ data: null, error: signedUrlError })
            }
        };
        const { client: testClient, spies: testSpies, clearAllStubs } = createMockSupabaseClient(mockUser.id, clientConfig);
        
        const result = await exportProject(testClient as any, projectIdToExport, mockUser.id);

        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.code, 'EXPORT_SIGNED_URL_FAILED');
        assertEquals(result.error?.details, signedUrlError.message);
        assertEquals(result.data, undefined);

        const contributionsStorageSpies = testSpies.storage.from('dialectic-contributions');
        assertEquals(contributionsStorageSpies.uploadSpy.calls.length, 1); 
        assertEquals(contributionsStorageSpies.createSignedUrlSpy.calls.length, 1);

        clearAllStubs?.();
    });
    
    // Test for non-fatal errors (e.g., failure to download a specific resource for the zip)
    // This test ensures the export proceeds but logs warnings. The final result should still be success (signed URL).
    it('should still complete export if individual resource download fails, logging a warning', async () => {
        const dbMockConfig: MockSupabaseDataConfig['genericMockResults'] = {
            'dialectic_projects': { select: { data: [mockProjectToExport], error: null, count: 1 }},
            'dialectic_project_resources': { select: { data: [mockResourceToExport], error: null, count: 1 }},
            'dialectic_sessions': { select: { data: [], error: null, count: 0 }}, // No sessions for simplicity
            'dialectic_contributions': { select: { data: [], error: null, count: 0 }}
        };

        const mockUploadedPath = `project_exports/${projectIdToExport}/project_export_project-to-export_test-timestamp.zip`;
        const mockSignedUrl = `https://mock.supabase.co/storage/v1/object/sign/${mockUploadedPath}?token=mockToken`;

        // Mock storage to fail download for the specific resource, but succeed for upload/signed URL
        const storageMockConfig: MockSupabaseDataConfig['storageMock'] = {
            downloadResult: async (_bucketId: string, path: string): Promise<IMockStorageDownloadResponse> => {
                if (path === mockResourceToExport.storage_path) {
                    return { data: null, error: new Error('Mock resource download failure') }; 
                }
                return { data: new Blob(["other content"]), error: null }; // Other downloads succeed
            },
            uploadResult: () => Promise.resolve({ data: { path: mockUploadedPath }, error: null }),
            createSignedUrlResult: () => Promise.resolve({ data: { signedUrl: mockSignedUrl }, error: null })
        };
        const clientConfig: MockSupabaseDataConfig = { genericMockResults: dbMockConfig, storageMock: storageMockConfig };
        const { client: testClient, spies: testSpies, clearAllStubs } = createMockSupabaseClient(mockUser.id, clientConfig);

        loggerWarnStub = stub(sharedLogger.logger, "warn"); // Spy on logger.warn

        const result = await exportProject(testClient as any, projectIdToExport, mockUser.id);

        assertExists(result.data?.export_url);
        assertEquals(result.status, 200);
        assertEquals(result.data?.export_url, mockSignedUrl);
        
        // Check that logger.warn was called for the failed resource download
        assert(loggerWarnStub.calls.some(call => 
            call.args[0] === 'Failed to download project resource for export. Skipping file.' &&
            (call.args[1] as any)?.resourceId === mockResourceToExport.id
        ));
        
        // Zip should still contain manifest (and other successful files if any)
        const manifestCall = zipWriterAddSpy.calls.find(call => call.args[0] === 'project_manifest.json');
        assertExists(manifestCall, "Manifest should still be added to zip even if a resource fails");

        const resourceFileCall = zipWriterAddSpy.calls.find(call => call.args[0] === `resources/${mockResourceToExport.file_name}`);
        assertEquals(resourceFileCall, undefined, "Failed resource file should not be added to zip");

        // Assertions for client's storage method calls
        const contributionsStorageSpies = testSpies.storage.from('dialectic-contributions');
        assertEquals(contributionsStorageSpies.uploadSpy.calls.length, 1);
        const uploadArgs = contributionsStorageSpies.uploadSpy.calls[0].args;
        assert(uploadArgs[0].startsWith(`project_exports/${projectIdToExport}/project_export_project-to-export_`), "Storage path for zip is incorrect");

        assertEquals(contributionsStorageSpies.createSignedUrlSpy.calls.length, 1);
        const signedUrlArgs = contributionsStorageSpies.createSignedUrlSpy.calls[0].args;
        assertEquals(signedUrlArgs[0], mockUploadedPath); 

        clearAllStubs?.();
    });

});