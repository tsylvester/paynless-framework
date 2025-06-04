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

describe('Dialectic Service: exportProject Action', () => {
    let mockUser: User;
    let projectIdToExport: string;
    
    let loggerWarnStub: Stub | undefined;
    let zipWriterAddSpy: Spy<zip.ZipWriter<Blob>, [string, zip.TextReader | zip.BlobReader, any?], Promise<any>>;
    let zipWriterCloseSpy: Spy<zip.ZipWriter<Blob>, [], Promise<Blob>>;
    // let originalZipConfig: zip.Configuration; // To store original config if restoring

    const mockProjectToExport: Database['public']['Tables']['dialectic_projects']['Row'] = {
        id: 'export-project-uuid',
        user_id: 'user-uuid',
        project_name: 'Project To Export',
        initial_user_prompt: 'Export this prompt',
        selected_domain_overlay_id: null,
        selected_domain_tag: null,
        repo_url: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_domain_overlay_values: null,
    };

    const mockResourceToExport: Database['public']['Tables']['dialectic_project_resources']['Row'] = {
        id: 'export-resource-uuid',
        project_id: mockProjectToExport.id,
        user_id: mockProjectToExport.user_id!,
        file_name: 'resource_to_export.txt',
        storage_bucket: 'dialectic-project-resources',
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
        current_stage_seed_prompt: 'seed prompt for export session',
        iteration_count: 1,
        active_thesis_prompt_template_id: null,
        active_antithesis_prompt_template_id: null,
        status: 'synthesis_complete',
        associated_chat_id: null,
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
        actual_prompt_sent: 'Prompt for exported contribution',
        tokens_used_input: 5,
        tokens_used_output: 100,
        processing_time_ms: 2000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        iteration_number: 1,
        citations: null,
        error: null,
        model_version_details: null,
        stage: 'synthesis',
        target_contribution_id: null,
        prompt_template_id_used: null,
        session_model_id: 'session-model-id',
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
        
        // Configure zip.js to not use web workers for tests to prevent timer leaks
        // originalZipConfig = zip.getConfiguration(); // If getConfiguration exists and we want to restore
        zip.configure({ useWebWorkers: false });

        // Spy on the prototype methods of ZipWriter from zip.js
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
        // zip.configure(originalZipConfig); // Restore original config if it was saved
    });

    const createNotFoundError = (message = "Not found", code = "PGRST116") => {
        const error = new Error(message);
        (error as any).code = code; 
        (error as any).name = 'PostgrestError'; 
        return error;
    };

    it('should successfully export a project and return a zip file response', async () => {
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
        
        const response = await exportProject(
            testClient as any, 
            projectIdToExport, 
            mockUser.id
        );

        assertExists(response);
        assertEquals(response.status, 200);
        assertEquals(response.headers.get('Content-Type'), 'application/zip');
        assertEquals(response.headers.get('Content-Disposition'), `attachment; filename="project_export_${projectIdToExport}.zip"`);
        
        const body = await response.arrayBuffer();
        assertExists(body);
        assert(body.byteLength > 0, "Zip body should have content"); 

        const projectSelectSpy = testSpies.getHistoricQueryBuilderSpies('dialectic_projects', 'select');
        assertExists(projectSelectSpy);
        assertEquals(projectSelectSpy.callCount > 0, true);

        const resourceSelectSpy = testSpies.getHistoricQueryBuilderSpies('dialectic_project_resources', 'select');
        assertExists(resourceSelectSpy);
        assertEquals(resourceSelectSpy.callCount > 0, true);

        const downloadSpyProjectResources = testSpies.storage.from("dialectic-project-resources").downloadSpy;
        assertExists(downloadSpyProjectResources);
        assertExists(downloadSpyProjectResources.calls.find(c => c.args[0] === mockResourceToExport.storage_path));
        
        const downloadSpyContributions = testSpies.storage.from("dialectic-contributions").downloadSpy;
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
        
        const contentFileCall = zipWriterAddSpy.calls.find(call => call.args[0] === `sessions/${mockSessionToExport.id}/contributions/${mockContributionToExport.id}_content.md`);
        assertExists(contentFileCall, "Contribution content file should be added to zip");
        assert(contentFileCall.args[1] instanceof zip.BlobReader, "Contribution content should be added as BlobReader");

        const rawResponseFileCall = zipWriterAddSpy.calls.find(call => call.args[0] === `sessions/${mockSessionToExport.id}/contributions/${mockContributionToExport.id}_raw.json`);
        assertExists(rawResponseFileCall, "Contribution raw response file should be added to zip");
        assert(rawResponseFileCall.args[1] instanceof zip.BlobReader, "Contribution raw response should be added as BlobReader");
        
        assertEquals(zipWriterCloseSpy.calls.length, 1, "ZipWriter.close should be called once");
        
        clearAllStubs?.(); 
    });

    it('should return 404 if project does not exist for export', async () => {
        const dbMockConfig: MockSupabaseDataConfig['genericMockResults'] = {
            'dialectic_projects': {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === 'non-existent-project-id')) {
                        return { data: null, error: createNotFoundError("Not found", "PGRST116"), count: 0 };
                    }
                    return { data: null, error: createNotFoundError("Not found general"), count: 0 };
                }
            }
        };
        const clientConfig: Omit<MockSupabaseDataConfig, 'mockUser'> = { genericMockResults: dbMockConfig };
        const { client: testClient, clearAllStubs } = createMockSupabaseClient(mockUser.id, clientConfig);

        const response = await exportProject(testClient as any, 'non-existent-project-id', mockUser.id);
        assertEquals(response.status, 404);
        const errorBody = await response.json();
        assertEquals(errorBody.error, 'Project not found or database error.'); 
        
        clearAllStubs?.();
    });

    it('should return 403 if user is not authorized for export', async () => {
        const unauthorizedProject = { ...mockProjectToExport, user_id: 'other-user-uuid' };
        const dbMockConfig: MockSupabaseDataConfig['genericMockResults'] = {
            'dialectic_projects': {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === projectIdToExport)) {
                        return { data: [unauthorizedProject], error: null, count: 1 };
                    }
                    return { data: null, error: createNotFoundError(), count: 0 };
                }
            }
        };
        const clientConfig: Omit<MockSupabaseDataConfig, 'mockUser'> = { genericMockResults: dbMockConfig };
        const { client: testClient, clearAllStubs } = createMockSupabaseClient(mockUser.id, clientConfig);

        const response = await exportProject(testClient as any, projectIdToExport, mockUser.id);
        assertEquals(response.status, 403);
        const errorBody = await response.json();
        assertEquals(errorBody.error, 'User not authorized to export this project.');
        
        clearAllStubs?.();
    });
    
    it('should still produce a zip if project has no resources or contributions', async () => {
        const dbMockConfig: MockSupabaseDataConfig['genericMockResults'] = {
            'dialectic_projects': {
                select: async (state: MockQueryBuilderState) => { 
                    if (state.filters.some(f => f.column === 'id' && f.value === projectIdToExport)) {
                        return { data: [mockProjectToExport], error: null, count: 1 };
                    }
                    return { data: null, error: createNotFoundError(), count: 0 };
                }
            },
            'dialectic_project_resources': { select: { data: [], error: null, count: 0 } }, 
            'dialectic_sessions': { select: { data: [], error: null, count: 0 } }, 
            'dialectic_contributions': { select: { data: [], error: null, count: 0 } }
        };
        const storageMockConfig: MockSupabaseDataConfig['storageMock'] = {
            // No downloads expected, but provide a safe default
            downloadResult: async () => ({ data: null, error: new Error('not found in mock for empty test') }) 
        };
        const clientConfig: Omit<MockSupabaseDataConfig, 'mockUser'> = { genericMockResults: dbMockConfig, storageMock: storageMockConfig };

        const { client: testClient, clearAllStubs } = createMockSupabaseClient(mockUser.id, clientConfig);
        
        const response = await exportProject(testClient as any, projectIdToExport, mockUser.id);

        assertEquals(response.status, 200);
        assertEquals(response.headers.get('Content-Type'), 'application/zip');

        const manifestCall = zipWriterAddSpy.calls.find(call => call.args[0] === 'project_manifest.json');
        assertExists(manifestCall, "Manifest should be added to zip");
        assert(manifestCall.args[1] instanceof zip.TextReader, "Manifest should be added as TextReader for empty project test");
        
        // Ensure no other files were attempted to be added
        const nonManifestCalls = zipWriterAddSpy.calls.filter(call => call.args[0] !== 'project_manifest.json');
        assertEquals(nonManifestCalls.length, 0, "No files other than manifest should be added for empty project");

        assertEquals(zipWriterCloseSpy.calls.length, 1, "ZipWriter.close should be called for empty project");
        
        clearAllStubs?.();
    });

    it('should handle (skip and log) if a single storage file download fails during export', async () => {
        const dbMockConfig: MockSupabaseDataConfig['genericMockResults'] = {
            'dialectic_projects': {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === projectIdToExport)) {
                        return { data: [mockProjectToExport], error: null, count: 1 };
                    }
                    return { data: null, error: createNotFoundError(), count: 0 };
                }
            },
            'dialectic_project_resources': { select: { data: [mockResourceToExport], error: null, count: 1 } }, 
            'dialectic_sessions': { select: { data: [mockSessionToExport], error: null, count: 1 } },
            'dialectic_contributions': { select: { data: [mockContributionToExport], error: null, count: 1 } }
        };

        const storageMockConfig: MockSupabaseDataConfig['storageMock'] = {
            downloadResult: async (_bucketId: string, path: string): Promise<IMockStorageDownloadResponse> => {
                if (path === mockResourceToExport.storage_path) { 
                    return { data: null, error: new Error('Failed to download specific resource') }; // This resource fails
                }
                if (path === mockContributionToExport.content_storage_path) {
                    return { data: new Blob([mockContributionContent]), error: null }; // This succeeds
                }
                if (path === mockContributionToExport.raw_response_storage_path) {
                    return { data: new Blob([mockRawResponseContent]), error: null }; // This succeeds
                }
                return { data: null, error: new Error('Unexpected download path in mock') };
            }
        };
        
        const clientConfig: Omit<MockSupabaseDataConfig, 'mockUser'> = { genericMockResults: dbMockConfig, storageMock: storageMockConfig };
        const { client: testClient, clearAllStubs } = createMockSupabaseClient(mockUser.id, clientConfig);
        
        loggerWarnStub = stub(sharedLogger.logger, 'warn');

        const response = await exportProject(testClient as any, projectIdToExport, mockUser.id);

        assertEquals(response.status, 200);
        assertEquals(response.headers.get('Content-Type'), 'application/zip');
        
        assertExists(loggerWarnStub.calls.find(c => (c.args[0] as string).includes('Failed to download project resource for export') && (c.args[1] as any)?.path === mockResourceToExport.storage_path));

        const manifestCall = zipWriterAddSpy.calls.find(call => call.args[0] === 'project_manifest.json');
        assertExists(manifestCall, "Manifest should still be added when a file download fails");

        const failedResourceCall = zipWriterAddSpy.calls.find(call => call.args[0] === `resources/${mockResourceToExport.file_name}`);
        assertEquals(failedResourceCall, undefined, "Failed resource should not be added to zip");
        
        const successfulContentCall = zipWriterAddSpy.calls.find(call => call.args[0] === `sessions/${mockSessionToExport.id}/contributions/${mockContributionToExport.id}_content.md`);
        assertExists(successfulContentCall, "Successful contribution content should be added");
        assert(successfulContentCall.args[1] instanceof zip.BlobReader, "Successful content should be added as BlobReader");

        assertEquals(zipWriterCloseSpy.calls.length, 1, "ZipWriter.close should be called even if a file download fails");
        
        clearAllStubs?.();
    });
});