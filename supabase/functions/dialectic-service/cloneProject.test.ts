import { assertEquals, assertRejects, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { stub, type Stub, spy } from "https://deno.land/std@0.224.0/testing/mock.ts";

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.43.4";
import type { Database, TablesInsert } from "../types_db.ts";
import { cloneProject, type CloneProjectResult } from "./cloneProject.ts";
import type { IFileManager, FileRecord, PathContext, UploadContext, FileType, FileManagerResponse } from "../_shared/types/file_manager.types.ts";
import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";

// Helper to create a mock FileManagerService
const createMockFileManager = (): IFileManager => {
    const serviceInstance: IFileManager = {
        async uploadAndRegisterFile(context: UploadContext): Promise<FileManagerResponse> {
            const fileTypeInContext = context.pathContext.fileType; 
            const recordId = crypto.randomUUID();
            const storagePath = `projects/${context.pathContext.projectId}/${context.pathContext.sessionId ? `sessions/${context.pathContext.sessionId}/` : 'resources/'}${context.pathContext.originalFileName}`;
            
            let parsedDescription: any = null;
            if (typeof context.description === 'string' && context.description.trim() !== '') {
                try {
                    parsedDescription = JSON.parse(context.description);
                } catch (e) {
                    parsedDescription = { unparsedError: 'Failed to parse description', originalDesc: context.description };
                }
            } else if (context.description) { 
                parsedDescription = context.description;
            }

            let baseRecord: any = {
                id: recordId,
                user_id: context.userId,
                file_name: context.pathContext.originalFileName,
                mime_type: context.mimeType,
                size_bytes: context.sizeBytes,
                storage_bucket: 'test-bucket', 
                storage_path: storagePath,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            if (fileTypeInContext === ('model_contribution_main' as FileType) || fileTypeInContext === ('model_contribution_raw_json' as FileType)) { 
                baseRecord = {
                    ...baseRecord,
                    project_id: context.pathContext.projectId, 
                    session_id: context.pathContext.sessionId || "mock_session_id_fallback", 
                    stage: context.pathContext.stageSlug || 'unknown', 
                    iteration_number: context.pathContext.iteration || 1,
                    model_id: (context.customMetadata as any)?.model_id,
                    model_name: (context.customMetadata as any)?.model_name,
                };
            } else { 
                 baseRecord = {
                    ...baseRecord,
                    project_id: context.pathContext.projectId,
                    resource_description: parsedDescription,
                };
            }
            
            return Promise.resolve({
                record: baseRecord as FileRecord, 
                error: null,
            });
        }
    };
    
    spy(serviceInstance, 'uploadAndRegisterFile');
    
    return serviceInstance;
};

describe("cloneProject", () => {
    let mockSupabaseSetup: MockSupabaseClientSetup;
    let mockFileManager: IFileManager; 

    const originalProjectId = "orig-project-uuid";
    const cloningUserId = "user-uuid-cloner";

    beforeEach(() => {
        mockSupabaseSetup = createMockSupabaseClient(cloningUserId, { /* genericMockResults, rpcResults, etc. */ });
        mockFileManager = createMockFileManager(); 
    });

    afterEach(() => {
        mockSupabaseSetup.clearAllStubs?.();
    });

    it("should successfully clone a project with no resources or sessions", async () => {
        const originalProjectData = {
            id: originalProjectId,
            user_id: cloningUserId,
            project_name: "Original Project",
            initial_user_prompt: "Original prompt",
            selected_domain_id: "domain-uuid",
            process_template_id: "proc-template-uuid",
            status: "draft",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            initial_prompt_resource_id: null,
            repo_url: null,
            selected_domain_overlay_id: null,
            user_domain_overlay_values: null,
        };

        let capturedNewProjectId = "";

        mockSupabaseSetup.client = createMockSupabaseClient(cloningUserId, {
            genericMockResults: {
                dialectic_projects: {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'id' && f.value === originalProjectId)) {
                            return Promise.resolve({ data: [originalProjectData], error: null, count: 1, status: 200, statusText: 'OK' });
                        }
                        if (state.filters.some(f => f.column === 'id' && f.value === capturedNewProjectId)) {
                            const clonedData = { 
                                ...originalProjectData, 
                                id: capturedNewProjectId, 
                                user_id: cloningUserId, 
                                project_name: "New Cloned Project Alpha",
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                            };
                            return Promise.resolve({ data: [clonedData], error: null, count: 1, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
                    },
                    insert: (state: MockQueryBuilderState) => {
                        const insertPayload = (state.insertData as TablesInsert<"dialectic_projects">[])[0];
                        capturedNewProjectId = insertPayload.id!;
                        const newProjectEntry = {
                            ...originalProjectData, 
                            ...insertPayload,
                            project_name: "New Cloned Project Alpha", 
                            created_at: new Date().toISOString(), 
                            updated_at: new Date().toISOString(),
                        };
                        return Promise.resolve({ data: [newProjectEntry], error: null, count: 1, status: 201, statusText: 'Created' });
                    },
                },
                dialectic_project_resources: {
                    select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }), 
                },
                dialectic_sessions: {
                    select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }), 
                },
            }
        }).client;

        const typedClientForL149: SupabaseClient<Database> = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const result = await cloneProject(typedClientForL149, mockFileManager, originalProjectId, "New Cloned Project Alpha", cloningUserId);

        assert(result.data, "Expected data to be returned for a successful clone.");
        assertEquals(result.error, null);
        assertEquals(result.data?.project_name, "New Cloned Project Alpha");
        assertEquals(result.data?.user_id, cloningUserId);
        assertEquals(result.data?.initial_user_prompt, originalProjectData.initial_user_prompt);
        assertEquals(result.data?.id, capturedNewProjectId);
        assert(capturedNewProjectId !== originalProjectId, "New project ID should be different from original.");
        assertEquals((mockFileManager.uploadAndRegisterFile as unknown as Stub).calls.length, 0); 
    });
    
    it("should successfully clone a project with resources", async () => {
        const originalProjectData = {
            id: originalProjectId, user_id: cloningUserId, project_name: "Project With Resources",
            initial_user_prompt: "prompt", selected_domain_id: "domain1", status: "active",
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(), process_template_id: "pt1",
            initial_prompt_resource_id: null, repo_url: null, selected_domain_overlay_id: null, user_domain_overlay_values: null,
        };
        const resource1Desc = JSON.stringify({ type: "general_resource", description: "A general file" });
        const resource2Desc = JSON.stringify({ type: "user_prompt" });

        const originalResourcesData = [
            {
                id: "res1-uuid", project_id: originalProjectId, user_id: cloningUserId,
                file_name: "resource1.txt", storage_bucket: "test-bucket", storage_path: "projects/orig-proj/res1.txt",
                mime_type: "text/plain", size_bytes: 100, resource_description: resource1Desc,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            },
            {
                id: "res2-uuid", project_id: originalProjectId, user_id: cloningUserId,
                file_name: "resource2.md", storage_bucket: "test-bucket", storage_path: "projects/orig-proj/res2.md",
                mime_type: "text/markdown", size_bytes: 200, resource_description: resource2Desc,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }
        ];
        
        let newProjectIdCapture = "";

        mockSupabaseSetup.client = createMockSupabaseClient(cloningUserId, {
            genericMockResults: {
                dialectic_projects: {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'id' && f.value === originalProjectId)) {
                            return Promise.resolve({ data: [originalProjectData], error: null, count: 1, status: 200, statusText: 'OK' });
                        }
                        if (state.filters.some(f => f.column === 'id' && f.value === newProjectIdCapture)) {
                             return Promise.resolve({ data: [{ ...originalProjectData, id: newProjectIdCapture, project_name: "Cloned Resource Project", user_id: cloningUserId }], error: null, count: 1, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
                    },
                    insert: (state: MockQueryBuilderState) => {
                        const insertPayload = (state.insertData as TablesInsert<"dialectic_projects">[])[0];
                        newProjectIdCapture = insertPayload.id!;
                        return Promise.resolve({ data: [{...insertPayload, project_name: "Cloned Resource Project"}], error: null, count: 1, status: 201, statusText: 'Created' });
                    },
                },
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'project_id' && f.value === originalProjectId)) {
                            return Promise.resolve({ data: originalResourcesData, error: null, count: originalResourcesData.length, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
                    },
                },
                dialectic_sessions: {
                    select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
                },
            },
            storageMock: {
                downloadResult: (bucketId: string, path: string) => {
                    if (bucketId === 'test-bucket') {
                        if (path === originalResourcesData[0].storage_path) return Promise.resolve({ data: new Blob(["content res1"]), error: null });
                        if (path === originalResourcesData[1].storage_path) return Promise.resolve({ data: new Blob(["content res2"]), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error("Mock download error: path not found") });
                }
            }
        }).client;

        const typedClientForL229: SupabaseClient<Database> = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const result = await cloneProject(typedClientForL229, mockFileManager, originalProjectId, "Cloned Resource Project", cloningUserId);

        assert(result.data, "Expected data for successful resource clone.");
        assertEquals(result.error, null);
        assertEquals(result.data?.project_name, "Cloned Resource Project");
        assertEquals(result.data?.id, newProjectIdCapture);
        
        const fmCalls = (mockFileManager.uploadAndRegisterFile as unknown as Stub).calls;
        assertEquals(fmCalls.length, 2, "FileManagerService should be called for each resource.");

        const firstCallArgs = fmCalls[0].args[0] as UploadContext;
        assertEquals(firstCallArgs.pathContext.projectId, newProjectIdCapture);
        assertEquals(firstCallArgs.pathContext.fileType, "general_resource" as FileType);
        assertEquals(firstCallArgs.pathContext.originalFileName, originalResourcesData[0].file_name);
        assertEquals(firstCallArgs.mimeType, originalResourcesData[0].mime_type);
        assertEquals(firstCallArgs.userId, cloningUserId);
        assertEquals(firstCallArgs.description, originalResourcesData[0].resource_description);

        const secondCallArgs = fmCalls[1].args[0] as UploadContext;
        assertEquals(secondCallArgs.pathContext.projectId, newProjectIdCapture);
        assertEquals(secondCallArgs.pathContext.fileType, "user_prompt" as FileType);
        assertEquals(secondCallArgs.pathContext.originalFileName, originalResourcesData[1].file_name);
        assertEquals(secondCallArgs.mimeType, originalResourcesData[1].mime_type);
        assertEquals(secondCallArgs.description, originalResourcesData[1].resource_description);
    });
    
    it("should return error if original project not found", async () => {
        mockSupabaseSetup.client = createMockSupabaseClient(cloningUserId, {
            genericMockResults: {
                dialectic_projects: {
                    select: () => Promise.resolve({ data: null, error: { message: "Simulated DB error", name:"DBError", code:"PGRST116" }, count: 0, status: 404, statusText: 'Not Found' })
                }
            }
        }).client;

        const typedClientForL264: SupabaseClient<Database> = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const result = await cloneProject(typedClientForL264, mockFileManager, "non-existent-id", "Clone Test", cloningUserId);
        assert(result.error, "Error should be returned");
        assertEquals(result.error?.message, "Original project not found or database error.");
        assertEquals(result.data, null);
    });

    it("should return error if user is not authorized to clone (different user_id)", async () => {
        const originalProjectDataUnowned = {
            id: originalProjectId, user_id: "another-user-uuid", project_name: "Original Project",
            initial_user_prompt: "Original prompt", selected_domain_id: "domain-uuid",
            process_template_id: "proc-template-uuid", status: "draft",
            created_at: new Date().toISOString(), updatedAt: new Date().toISOString(),
            initial_prompt_resource_id: null, repo_url: null, selected_domain_overlay_id: null, user_domain_overlay_values: null,
        };

        mockSupabaseSetup.client = createMockSupabaseClient(cloningUserId, {
            genericMockResults: {
                dialectic_projects: {
                    select: () => Promise.resolve({ data: [originalProjectDataUnowned], error: null, count: 1, status: 200, statusText: 'OK' })
                }
            }
        }).client;

        const typedClientForL287: SupabaseClient<Database> = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const result = await cloneProject(typedClientForL287, mockFileManager, originalProjectId, "Clone Test", cloningUserId);
        assert(result.error, "Error should be returned for authorization failure.");
        assertEquals(result.error?.message, "Original project not found or not accessible.");
        assertEquals(result.data, null);
    });
    
    // TODO: Add detailed test for cloning with sessions and contributions, testing fileManager calls for contribution content and raw responses.
    // TODO: Add detailed rollback tests when FileManagerService.uploadAndRegisterFile fails for resources or contributions.
});

const AllFileTypes: FileType[] = [
    'project_readme', 'user_prompt', 'system_settings', 'seed_prompt', 
    'model_contribution_main', 'user_feedback', 'contribution_document', 'general_resource',
    'model_contribution_raw_json' 
]; 