import { assertEquals, assertRejects, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { stub, type Stub, spy } from "https://deno.land/std@0.224.0/testing/mock.ts";

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.43.4";
import type { Database, TablesInsert, Tables } from "../types_db.ts";
import { cloneProject } from "./cloneProject.ts";
import type { FileRecord, UploadContext, FileType, FileManagerResponse } from "../_shared/types/file_manager.types.ts";
import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";
import { createMockFileManagerService, MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import { constructStoragePath } from '../_shared/utils/path_constructor.ts';
import { generateShortId } from '../_shared/utils/path_constructor.ts';
import type { DialecticMemoryRow, DialecticFeedbackRow, DialecticContributionRow, DialecticProjectResourceRow } from "../dialectic-service/dialectic.interface.ts";

describe("cloneProject", () => {
    let mockSupabaseSetup: MockSupabaseClientSetup;
    let mockFileManager: MockFileManagerService;
    let cryptoMock: Stub<Crypto>;

    const originalProjectId = "orig-project-uuid";
    const cloningUserId = "user-uuid-cloner";
    let capturedNewProjectId = "";
    let capturedNewSessionId1 = "";
    const originalSession1ShortId = generateShortId("orig-session-uuid-1");

    let uuidCallCount = 0;

    // Narrowing helpers for mock insert payloads
    function isArrayWithOptionalId(val: unknown): val is Array<{ id?: string }> {
        return Array.isArray(val) && val.every((v) => v !== null && typeof v === 'object');
    }
    function isObjectWithOptionalId(val: unknown): val is { id?: string } {
        return val !== null && typeof val === 'object';
    }

    beforeEach(() => {
        mockSupabaseSetup = createMockSupabaseClient(cloningUserId, {});
        mockFileManager = createMockFileManagerService();

        uuidCallCount = 0;
        cryptoMock = stub(crypto, "randomUUID", (): `${string}-${string}-${string}-${string}-${string}` => {
            uuidCallCount++;
            if (uuidCallCount === 1) {
                capturedNewProjectId = '00000000-0000-0000-0000-000000000001';
                return '00000000-0000-0000-0000-000000000001';
            }
            if (uuidCallCount === 2) {
                capturedNewSessionId1 = '00000000-0000-0000-0000-000000000002';
                return '00000000-0000-0000-0000-000000000002';
            }
            return '00000000-0000-0000-0000-00000000ffff';
        });

        mockFileManager.uploadAndRegisterFile = spy(
            (context: UploadContext): Promise<FileManagerResponse> => {
                const newPath = constructStoragePath(context.pathContext);
                const fileRecordId = crypto.randomUUID();
                const nowIso = new Date().toISOString();

                if (context.contributionMetadata) {
                    const meta = context.contributionMetadata;
                    const contributionRecord = {
                        id: fileRecordId,
                        session_id: meta.sessionId,
                        user_id: context.userId,
                        stage: context.pathContext.stageSlug || meta.stageSlug,
                        iteration_number: meta.iterationNumber,
                        model_id: meta.modelIdUsed,
                        model_name: context.pathContext.modelSlug || meta.modelNameDisplay,
                        prompt_template_id_used: meta.promptTemplateIdUsed ?? null,
                        seed_prompt_url: meta.seedPromptStoragePath ?? null,
                        edit_version: meta.editVersion ?? 1,
                        is_latest_edit: meta.isLatestEdit ?? true,
                        original_model_contribution_id: meta.originalModelContributionId ?? null,
                        raw_response_storage_path: meta.rawJsonResponseContent ? `${newPath.storagePath}/${(newPath.fileName || '').replace(/\.(md|json)$/i, '')}_raw.json` : null,
                        target_contribution_id: meta.target_contribution_id ?? null,
                        tokens_used_input: meta.tokensUsedInput ?? null,
                        tokens_used_output: meta.tokensUsedOutput ?? null,
                        processing_time_ms: meta.processingTimeMs ?? null,
                        error: meta.errorDetails ?? null,
                        citations: meta.citations ?? null,
                        created_at: nowIso,
                        updated_at: nowIso,
                        contribution_type: meta.contributionType ?? null,
                        file_name: newPath.fileName,
                        storage_bucket: 'test-bucket',
                        storage_path: newPath.storagePath,
                        size_bytes: context.sizeBytes,
                        mime_type: context.mimeType,
                        document_relationships: meta.document_relationships ?? null,
                    }; // conforms to dialectic_contributions.Row
                    return Promise.resolve({ record: contributionRecord, error: null });
                } else {
                    const resourceRecord = {
                        id: fileRecordId,
                        project_id: context.pathContext.projectId,
                        user_id: context.userId!,
                        file_name: newPath.fileName,
                        storage_bucket: 'test-bucket',
                        storage_path: newPath.storagePath,
                        mime_type: context.mimeType,
                        size_bytes: context.sizeBytes,
                        resource_description: context.description ? context.description : null,
                        created_at: nowIso,
                        updated_at: nowIso,
                    }; // conforms to dialectic_project_resources.Row
                    return Promise.resolve({ record: resourceRecord, error: null });
                }
            }
        );
    });

    afterEach(() => {
        cryptoMock.restore();
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
                        const insertPayloadRaw = state.insertData;
                        const insertPayload = isArrayWithOptionalId(insertPayloadRaw)
                            ? insertPayloadRaw[0]
                            : (isObjectWithOptionalId(insertPayloadRaw) ? insertPayloadRaw : {});
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
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 0); 
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
        const resource3Desc = JSON.stringify({ type: "general_resource" });

        const originalResourcesData = [
            {
                id: "res1-uuid", project_id: originalProjectId, user_id: cloningUserId,
                file_name: "resource1.txt", storage_bucket: "test-bucket", 
                storage_path: `${originalProjectId}/general_resource/resource1.txt`,
                mime_type: "text/plain", size_bytes: 100, resource_description: resource1Desc,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            },
            {
                id: "res2-uuid", project_id: originalProjectId, user_id: cloningUserId,
                file_name: "resource2.md", storage_bucket: "test-bucket", 
                storage_path: `${originalProjectId}/resource2.md`,
                mime_type: "text/markdown", size_bytes: 200, resource_description: resource2Desc,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            },
            {
                id: "res3-uuid", project_id: originalProjectId, user_id: cloningUserId,
                file_name: "iteration_1_stage_hypothesis_model_claude_seed.json", 
                storage_bucket: "test-bucket", 
                storage_path: `${originalProjectId}/general_resource/iteration_1_stage_hypothesis_model_claude_seed.json`,
                mime_type: "application/json", size_bytes: 300, resource_description: resource3Desc,
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
                        const insertPayloadRaw = state.insertData;
                        const insertPayload = isArrayWithOptionalId(insertPayloadRaw)
                            ? insertPayloadRaw[0]
                            : (isObjectWithOptionalId(insertPayloadRaw) ? insertPayloadRaw : {});
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
                        if (path === originalResourcesData[2].storage_path) return Promise.resolve({ data: new Blob(["content res3 seed prompt"]), error: null });
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
        
        const fmCalls = mockFileManager.uploadAndRegisterFile.calls;
        assertEquals(fmCalls.length, 3, "FileManagerService should be called for each of the 3 resources.");

        const firstCallArgs = fmCalls[0].args[0];
        assertEquals(firstCallArgs.pathContext.projectId, newProjectIdCapture);
        assertEquals(firstCallArgs.pathContext.fileType, "general_resource");
        assertEquals(firstCallArgs.pathContext.originalFileName, originalResourcesData[0].file_name);
        assertEquals(firstCallArgs.mimeType, originalResourcesData[0].mime_type);
        assertEquals(firstCallArgs.userId, cloningUserId);
        assertEquals(firstCallArgs.description, originalResourcesData[0].resource_description);
        // Check that path components that should be undefined for this simple resource are indeed undefined
        assertEquals(firstCallArgs.pathContext.iteration, undefined, "Iteration should be undefined for simple resource1");
        assertEquals(firstCallArgs.pathContext.stageSlug, undefined, "StageSlug should be undefined for simple resource1");
        assertEquals(firstCallArgs.pathContext.modelSlug, undefined, "ModelSlug should be undefined for simple resource1");

        const secondCallArgs = fmCalls[1].args[0];
        assertEquals(secondCallArgs.pathContext.projectId, newProjectIdCapture);
        assertEquals(secondCallArgs.pathContext.fileType, "initial_user_prompt");
        assertEquals(secondCallArgs.pathContext.originalFileName, originalResourcesData[1].file_name);
        assertEquals(secondCallArgs.mimeType, originalResourcesData[1].mime_type);
        assertEquals(secondCallArgs.description, originalResourcesData[1].resource_description);
        assertEquals(secondCallArgs.pathContext.iteration, undefined, "Iteration should be undefined for simple resource2");
        assertEquals(secondCallArgs.pathContext.stageSlug, undefined, "StageSlug should be undefined for simple resource2");
        assertEquals(secondCallArgs.pathContext.modelSlug, undefined, "ModelSlug should be undefined for simple resource2");

        const thirdCallArgs = fmCalls[2].args[0];
        assertEquals(thirdCallArgs.pathContext.projectId, newProjectIdCapture);
        assertEquals(thirdCallArgs.pathContext.fileType, "general_resource");
        assertEquals(thirdCallArgs.pathContext.originalFileName, originalResourcesData[2].file_name);
        assertEquals(thirdCallArgs.pathContext.sessionId, undefined, "SessionId should be undefined for this project-level seed_prompt");
        assertEquals(thirdCallArgs.pathContext.iteration, undefined, "Iteration should be undefined for this project-level seed_prompt path format");
        assertEquals(thirdCallArgs.pathContext.stageSlug, undefined, "StageSlug should be undefined for this project-level seed_prompt path format");
        assertEquals(thirdCallArgs.pathContext.modelSlug, undefined, "ModelSlug should be undefined for this project-level seed_prompt path format");
        assertEquals(thirdCallArgs.pathContext.attemptCount, undefined, "AttemptCount should be undefined for this seed_prompt path");
        assertEquals(thirdCallArgs.mimeType, originalResourcesData[2].mime_type);
        assertEquals(thirdCallArgs.description, originalResourcesData[2].resource_description);
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

    it("should successfully clone a project with sessions, contributions, and varied path structures", async () => {
        const originalProjectData = {
            id: originalProjectId, user_id: cloningUserId, project_name: "Complex Project To Clone",
            initial_user_prompt: "Initial complex prompt", status: "active",
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            process_template_id: "pt-complex", selected_domain_id: "domain-complex",
            initial_prompt_resource_id: null, repo_url: null, selected_domain_overlay_id: null, user_domain_overlay_values: null,
        };

        const originalSessionId1 = "orig-session-uuid-1";
        const originalSession1ShortId = generateShortId(originalSessionId1);

        const originalSessionsData = [
            {
                id: originalSessionId1, project_id: originalProjectId, session_description: "First original session",
                iteration_count: 2, status: "in_progress", current_stage_id: "stage_2_critique",
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                selected_model_ids: ["mc_claude_3_opus"], user_input_reference_url: null, associated_chat_id: null,
            }
        ];

        const originalContributionsData: Array<DialecticContributionRow & { model_name: string; seed_prompt_url?: string; raw_response_storage_path?: string }> = [
            {
                id: "contrib1-uuid", session_id: originalSessionId1, user_id: cloningUserId,
                file_name: "claude-3-opus_1_thesis.md", storage_bucket: "test-bucket",
                storage_path: `${originalProjectId}/session_${originalSession1ShortId}/iteration_1/1_thesis/claude-3-opus_1_thesis.md`,
                mime_type: "text/markdown", size_bytes: 1024, stage: "thesis", iteration_number: 1, 
                model_id: "ai_model_id_opus", model_name: "claude-3-opus", 
                contribution_type: "model_output",
                raw_response_storage_path: `${originalProjectId}/session_${originalSession1ShortId}/iteration_1/1_thesis/raw_responses/claude-3-opus_1_thesis_raw.json`,
                seed_prompt_url: `${originalProjectId}/session_${originalSession1ShortId}/iteration_1/1_thesis/seed_prompt.md`,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                error: "", citations: null, processing_time_ms: 1000, prompt_template_id_used: null, target_contribution_id: null,
                tokens_used_input: 100, tokens_used_output: 200, edit_version: 1, is_latest_edit: true, original_model_contribution_id: null,
                document_relationships: null,
            },
            {
                id: "contrib2-uuid", session_id: originalSessionId1, user_id: cloningUserId,
                file_name: "gemini-1.5-pro_0_antithesis.md", storage_bucket: "test-bucket",
                storage_path: `${originalProjectId}/session_${originalSession1ShortId}/iteration_1/2_antithesis/gemini-1.5-pro_0_antithesis.md`,
                mime_type: "text/markdown", size_bytes: 512, stage: "antithesis", iteration_number: 1, 
                model_id: "ai_model_id_gemini", model_name: "gemini-1.5-pro", 
                contribution_type: "model_output", 
                raw_response_storage_path: "",
                seed_prompt_url: `${originalProjectId}/session_${originalSession1ShortId}/iteration_1/2_antithesis/seed_prompt.md`,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                error: "", citations: null, processing_time_ms: 800, prompt_template_id_used: null, target_contribution_id: "contrib1-uuid",
                tokens_used_input: 50, tokens_used_output: 150, edit_version: 2, is_latest_edit: true, original_model_contribution_id: "some_prior_edit_id_for_contrib2",
                document_relationships: null,
            }
        ];
        
        let capturedNewProjectIdLocal = "";
        let capturedNewSessionId1Local = "";

        mockSupabaseSetup.client = createMockSupabaseClient(cloningUserId, {
            genericMockResults: {
                dialectic_projects: {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'id' && f.value === originalProjectId)) {
                            return Promise.resolve({ data: [originalProjectData], error: null });
                        }
                        if (state.filters.some(f => f.column === 'id' && f.value === capturedNewProjectIdLocal)) {
                            const finalClonedProject = { ...originalProjectData, id: capturedNewProjectIdLocal, project_name: "Cloned Complex Project" };
                            return Promise.resolve({ data: [finalClonedProject], error: null });
                        }
                        return Promise.resolve({ data: null, error: { name: "MockError", message: "Project not found in mock"} });
                    },
                    insert: (state: MockQueryBuilderState) => {
                        const insertPayloadRaw = state.insertData;
                        const insertPayload = isArrayWithOptionalId(insertPayloadRaw)
                            ? insertPayloadRaw[0]
                            : (isObjectWithOptionalId(insertPayloadRaw) ? insertPayloadRaw : {});
                        capturedNewProjectIdLocal = insertPayload.id!;
                        const newProjectEntry = { ...originalProjectData, ...(insertPayload), project_name: "Cloned Complex Project" };
                        return Promise.resolve({ data: [newProjectEntry], error: null, count: 1, status: 201 });
                    },
                },
                dialectic_sessions: {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'project_id' && f.value === originalProjectId)) {
                            if (state.selectColumns === 'id') {
                                return Promise.resolve({ data: originalSessionsData.map(s => ({id: s.id})), error: null });
                            }
                            return Promise.resolve({ data: originalSessionsData, error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                    insert: (state: MockQueryBuilderState) => {
                        const insertPayloadRaw = state.insertData;
                        const insertPayload = isArrayWithOptionalId(insertPayloadRaw)
                            ? insertPayloadRaw[0]
                            : (isObjectWithOptionalId(insertPayloadRaw) ? insertPayloadRaw : {});
                        capturedNewSessionId1Local = insertPayload.id!;
                        const newSessionEntry = { ...originalSessionsData[0], ...insertPayload, project_id: capturedNewProjectIdLocal };
                        return Promise.resolve({ data: [newSessionEntry], error: null, count: 1, status: 201 });
                    },
                },
                dialectic_project_resources: {
                    select: () => Promise.resolve({ data: [], error: null }), 
                },
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'session_id' && f.value === originalSessionId1)) {
                            return Promise.resolve({ data: originalContributionsData, error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
            },
            storageMock: {
                downloadResult: (bucketId: string, path: string) => {
                    if (bucketId === 'test-bucket') {
                        const contrib1 = originalContributionsData[0];
                        const contrib2 = originalContributionsData[1];
                        if (path === contrib1.storage_path) return Promise.resolve({ data: new Blob(["main content contrib1"]), error: null });
                        if (path === contrib1.raw_response_storage_path) return Promise.resolve({ data: new Blob(["{\"raw\": \"json contrib1\"}"]), error: null });
                        if (path === contrib2.storage_path) return Promise.resolve({ data: new Blob(["main content contrib2"]), error: null });
                        // contrib2.raw_response_storage_path is empty, so no download mock for it
                    }
                    return Promise.resolve({ data: null, error: new Error(`Mock download error: path ${path} not found`) });
                }
            }
        }).client;

        const typedClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;       
        const result = await cloneProject(typedClient, mockFileManager, originalProjectId, "Cloned Complex Project", cloningUserId);

        assert(result.data, "Expected data for successful complex clone.");
        assertEquals(result.error, null);
        assertEquals(result.data?.project_name, "Cloned Complex Project");
        assertEquals(result.data?.id, capturedNewProjectIdLocal);

        const fmCalls = mockFileManager.uploadAndRegisterFile.calls;
        assertEquals(fmCalls.length, 2, "FileManagerService should be called 2 times (once per original contribution).");

        // Assertions for main contribution file (contrib1)
        const contrib1MainCallArgs = fmCalls.find(call => {
            const ctx = call.args[0];
            return ctx.pathContext.originalFileName === originalContributionsData[0].file_name;
        })?.args[0];
        assert(contrib1MainCallArgs, "File manager should have been called for contribution 1 main file");
        assertEquals(contrib1MainCallArgs.pathContext.projectId, capturedNewProjectIdLocal);
        assertEquals(contrib1MainCallArgs.pathContext.sessionId, capturedNewSessionId1Local);
        assertEquals(contrib1MainCallArgs.pathContext.fileType, "model_contribution_main");
        assertEquals(contrib1MainCallArgs.pathContext.originalFileName, originalContributionsData[0].file_name);
        assertEquals(contrib1MainCallArgs.pathContext.iteration, originalContributionsData[0].iteration_number);
        assertEquals(contrib1MainCallArgs.pathContext.stageSlug, "thesis");
        assertEquals(contrib1MainCallArgs.pathContext.modelSlug, "claude-3-opus"); 
        assertEquals(contrib1MainCallArgs.pathContext.attemptCount, 1);
  
        assert(contrib1MainCallArgs.contributionMetadata, "Contribution metadata should exist for contrib1 main");
        assertEquals(contrib1MainCallArgs.contributionMetadata.sessionId, capturedNewSessionId1Local);
        assertEquals(contrib1MainCallArgs.contributionMetadata.modelIdUsed, originalContributionsData[0].model_id);
        assertEquals(contrib1MainCallArgs.contributionMetadata.stageSlug, "thesis");
        assertEquals(contrib1MainCallArgs.contributionMetadata.iterationNumber, originalContributionsData[0].iteration_number);
        assertEquals(contrib1MainCallArgs.contributionMetadata.rawJsonResponseContent, "{\"raw\": \"json contrib1\"}", "Raw JSON content for contrib1 should be passed");
          
        assert(contrib1MainCallArgs.contributionMetadata.seedPromptStoragePath, "Cloned seedPromptStoragePath should exist for contrib1");
        const clonedSession1ShortId = generateShortId(capturedNewSessionId1Local!);
        const expectedNewSeedPath1Parts = [
            capturedNewProjectIdLocal, 
            `session_${clonedSession1ShortId}`,
            `iteration_${originalContributionsData[0].iteration_number}`,
            '1_thesis', 
            'seed_prompt.md'
        ];
        const actualNewSeedPath1Parts = contrib1MainCallArgs.contributionMetadata.seedPromptStoragePath!.split('/');
        assertEquals(actualNewSeedPath1Parts, expectedNewSeedPath1Parts);

        // No separate call for rawJson1 - it's handled by FileManagerService based on rawJsonResponseContent in the main call
 
        // Assertions for second contribution (contrib2) - main file only
        const contrib2MainCallArgs = fmCalls.find(call => {
            const ctx = call.args[0];
            return ctx.pathContext.originalFileName === originalContributionsData[1].file_name;
        })?.args[0];
        assert(contrib2MainCallArgs, "File manager should have been called for contribution 2 main file");
        assertEquals(contrib2MainCallArgs.pathContext.projectId, capturedNewProjectIdLocal);
        assertEquals(contrib2MainCallArgs.pathContext.sessionId, capturedNewSessionId1Local);
        assertEquals(contrib2MainCallArgs.pathContext.fileType, "model_contribution_main");
        assertEquals(contrib2MainCallArgs.pathContext.originalFileName, originalContributionsData[1].file_name); 
        assertEquals(contrib2MainCallArgs.pathContext.iteration, originalContributionsData[1].iteration_number);
        assertEquals(contrib2MainCallArgs.pathContext.stageSlug, "antithesis"); 
        assertEquals(contrib2MainCallArgs.pathContext.modelSlug, "gemini-1.5-pro"); 
        assertEquals(contrib2MainCallArgs.pathContext.attemptCount, 0); 

        assert(contrib2MainCallArgs.contributionMetadata, "Contribution metadata should exist for contrib2 main");
        assertEquals(contrib2MainCallArgs.contributionMetadata.sessionId, capturedNewSessionId1Local);
        assertEquals(contrib2MainCallArgs.contributionMetadata.modelIdUsed, originalContributionsData[1].model_id);
        assertEquals(contrib2MainCallArgs.contributionMetadata.stageSlug, "antithesis");
        assertEquals(contrib2MainCallArgs.contributionMetadata.iterationNumber, originalContributionsData[1].iteration_number);
        assertEquals(contrib2MainCallArgs.contributionMetadata.rawJsonResponseContent, "", "Raw JSON content for contrib2 should be empty string");
        assert(contrib2MainCallArgs.contributionMetadata.seedPromptStoragePath, "Cloned seedPromptStoragePath should exist for contrib2");
        
        const clonedSession1ShortIdForContrib2 = generateShortId(capturedNewSessionId1Local!);
        const expectedNewSeedPath2Parts = [
            capturedNewProjectIdLocal,
            `session_${clonedSession1ShortIdForContrib2}`,
            `iteration_${originalContributionsData[1].iteration_number}`,
            "2_antithesis", 
            'seed_prompt.md'
        ];
        const actualNewSeedPath2Parts = contrib2MainCallArgs.contributionMetadata.seedPromptStoragePath!.split('/');
        assertEquals(actualNewSeedPath2Parts, expectedNewSeedPath2Parts);
    });

    it("should deeply clone resources, contributions with relationships, memory, and feedback", async () => {
        const originalProjectData = {
            id: originalProjectId, user_id: cloningUserId, project_name: "Deep Clone Project",
            initial_user_prompt: "Deep prompt", status: "active",
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            process_template_id: "pt-deep", selected_domain_id: "domain-deep",
            initial_prompt_resource_id: null, repo_url: null, selected_domain_overlay_id: null, user_domain_overlay_values: null,
        };

        const originalSessionId = "orig-session-uuid-1";
        const originalSessionShortId = generateShortId(originalSessionId);

        const originalSessionsData = [
            {
                id: originalSessionId, project_id: originalProjectId, session_description: "Only session",
                iteration_count: 1, status: "in_progress", current_stage_id: "stage_1_thesis",
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                selected_model_ids: ["mc_claude_3_opus"], user_input_reference_url: null, associated_chat_id: null,
            }
        ];

        const originalResourcesData = [
            {
                id: "res-initial-uuid", project_id: originalProjectId, user_id: cloningUserId,
                file_name: "initial_prompt.md", storage_bucket: "test-bucket",
                storage_path: `${originalProjectId}/initial_prompt.md`,
                mime_type: "text/markdown", size_bytes: 123, resource_description: JSON.stringify({ type: "initial_user_prompt" }),
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            },
            {
                id: "res-general-uuid", project_id: originalProjectId, user_id: cloningUserId,
                file_name: "notes.txt", storage_bucket: "test-bucket",
                storage_path: `${originalProjectId}/general_resource/notes.txt`,
                mime_type: "text/plain", size_bytes: 45, resource_description: JSON.stringify({ type: "general_resource", tag: "info" }),
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            },
        ];

        const contrib1Id = "contrib1-uuid";
        const contrib2Id = "contrib2-uuid";
        const originalContributionsData: Array<DialecticContributionRow & { model_name: string; seed_prompt_url?: string; raw_response_storage_path?: string }> = [
            {
                id: contrib1Id, session_id: originalSessionId, user_id: cloningUserId,
                file_name: "claude-3-opus_0_thesis.md", storage_bucket: "test-bucket",
                storage_path: `${originalProjectId}/session_${originalSessionShortId}/iteration_1/1_thesis/claude-3-opus_0_thesis.md`,
                mime_type: "text/markdown", size_bytes: 1000, stage: "thesis", iteration_number: 1,
                model_id: "ai_model_id_opus", model_name: "claude-3-opus",
                contribution_type: "model_output",
                raw_response_storage_path: `${originalProjectId}/session_${originalSessionShortId}/iteration_1/1_thesis/raw_responses/claude-3-opus_0_thesis_raw.json`,
                seed_prompt_url: `${originalProjectId}/session_${originalSessionShortId}/iteration_1/1_thesis/seed_prompt.md`,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                error: null, citations: null, processing_time_ms: 900, prompt_template_id_used: null, target_contribution_id: null,
                tokens_used_input: 10, tokens_used_output: 20, edit_version: 1, is_latest_edit: true, original_model_contribution_id: null,
                document_relationships: { thesis: contrib1Id },
            },
            {
                id: contrib2Id, session_id: originalSessionId, user_id: cloningUserId,
                file_name: "gemini-1.5-pro_0_antithesis.md", storage_bucket: "test-bucket",
                storage_path: `${originalProjectId}/session_${originalSessionShortId}/iteration_1/2_antithesis/gemini-1.5-pro_0_antithesis.md`,
                mime_type: "text/markdown", size_bytes: 800, stage: "antithesis", iteration_number: 1,
                model_id: "ai_model_id_gemini", model_name: "gemini-1.5-pro",
                contribution_type: "model_output",
                raw_response_storage_path: `${originalProjectId}/session_${originalSessionShortId}/iteration_1/2_antithesis/raw_responses/gemini-1.5-pro_0_antithesis_raw.json`,
                seed_prompt_url: `${originalProjectId}/session_${originalSessionShortId}/iteration_1/2_antithesis/seed_prompt.md`,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                error: null, citations: null, processing_time_ms: 700, prompt_template_id_used: null, target_contribution_id: contrib1Id,
                tokens_used_input: 15, tokens_used_output: 25, edit_version: 1, is_latest_edit: true, original_model_contribution_id: null,
                document_relationships: { thesis: contrib1Id, antithesis: contrib2Id },
            },
        ];

        const originalMemoryData = [
            {
                id: "mem-1", session_id: originalSessionId, source_contribution_id: contrib1Id,
                content: "key fact A", embedding: null, fts: null, metadata: null,
                created_at: new Date().toISOString(),
            },
            {
                id: "mem-2", session_id: originalSessionId, source_contribution_id: contrib2Id,
                content: "key fact B", embedding: "EMBED_BLOB", fts: null, metadata: { topic: "critique" },
                created_at: new Date().toISOString(),
            },
        ];

        const originalFeedbackData = [
            {
                id: "fb-1", project_id: originalProjectId, session_id: originalSessionId, user_id: cloningUserId,
                stage_slug: "thesis", iteration_number: 1, storage_bucket: "test-bucket",
                storage_path: `${originalProjectId}/sessions/${originalSessionShortId}/iteration_1/1_thesis/feedback`,
                file_name: "user-feedback.md", mime_type: "text/markdown", size_bytes: 200,
                feedback_type: "user_note", resource_description: { rating: 5 },
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            },
        ];

        const insertedMemory: DialecticMemoryRow[] = [];
        const insertedFeedback: DialecticFeedbackRow[] = [];

        let deepNewProjectId = "";
        let deepNewSessionId = "";

        mockSupabaseSetup.client = createMockSupabaseClient(cloningUserId, {
            genericMockResults: {
                dialectic_projects: {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'id' && f.value === originalProjectId)) {
                            return Promise.resolve({ data: [originalProjectData], error: null, count: 1, status: 200, statusText: 'OK' });
                        }
                        if (state.filters.some(f => f.column === 'id' && f.value === deepNewProjectId)) {
                            const clonedData = { ...originalProjectData, id: deepNewProjectId, project_name: "Deep Clone Project - Copy" };
                            return Promise.resolve({ data: [clonedData], error: null, count: 1, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
                    },
                    insert: (state: MockQueryBuilderState) => {
                        const raw = state.insertData;
                        const payload = Array.isArray(raw) ? raw[0] : raw;
                        deepNewProjectId = payload.id;
                        const row = { ...originalProjectData, ...payload };
                        return Promise.resolve({ data: [row], error: null, count: 1, status: 201, statusText: 'Created' });
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
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'project_id' && f.value === originalProjectId)) {
                            if (state.selectColumns === 'id') {
                                return Promise.resolve({ data: originalSessionsData.map(s => ({ id: s.id })), error: null, count: originalSessionsData.length, status: 200, statusText: 'OK' });
                            }
                            return Promise.resolve({ data: originalSessionsData, error: null, count: originalSessionsData.length, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
                    },
                    insert: (state: MockQueryBuilderState) => {
                        const raw = state.insertData;
                        const payload = Array.isArray(raw) ? raw[0] : raw;
                        deepNewSessionId = payload.id;
                        const newRow = { ...originalSessionsData[0], ...payload, project_id: deepNewProjectId };
                        return Promise.resolve({ data: [newRow], error: null, count: 1, status: 201, statusText: 'Created' });
                    },
                },
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'session_id' && f.value === originalSessionId)) {
                            return Promise.resolve({ data: originalContributionsData, error: null, count: originalContributionsData.length, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
                    },
                },
                dialectic_memory: {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'session_id' && f.value === originalSessionId)) {
                            return Promise.resolve({ data: originalMemoryData, error: null, count: originalMemoryData.length, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
                    },
                    insert: (state: MockQueryBuilderState) => {
                        const raw = state.insertData;
                        const payloads = Array.isArray(raw) ? raw : [raw];
                        payloads.forEach(p => insertedMemory.push(p));
                        return Promise.resolve({ data: payloads, error: null, count: payloads.length, status: 201, statusText: 'Created' });
                    },
                },
                dialectic_feedback: {
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'session_id' && f.value === originalSessionId)) {
                            return Promise.resolve({ data: originalFeedbackData, error: null, count: originalFeedbackData.length, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
                    },
                    insert: (state: MockQueryBuilderState) => {
                        const raw = state.insertData;
                        const payloads = Array.isArray(raw) ? raw  : [raw];
                        payloads.forEach(p => insertedFeedback.push(p));
                        return Promise.resolve({ data: payloads, error: null, count: payloads.length, status: 201, statusText: 'Created' });
                    },
                },
            },
            storageMock: {
                downloadResult: (bucketId: string, path: string) => {
                    if (bucketId === 'test-bucket') {
                        if (path === originalResourcesData[0].storage_path) return Promise.resolve({ data: new Blob(["initial"], { type: 'text/markdown' }), error: null });
                        if (path === originalResourcesData[1].storage_path) return Promise.resolve({ data: new Blob(["notes"], { type: 'text/plain' }), error: null });

                        if (path === originalContributionsData[0].storage_path) return Promise.resolve({ data: new Blob(["c1 main"], { type: 'text/markdown' }), error: null });
                        if (path === originalContributionsData[0].raw_response_storage_path) return Promise.resolve({ data: new Blob(["{\"raw\":1}"], { type: 'application/json' }), error: null });

                        if (path === originalContributionsData[1].storage_path) return Promise.resolve({ data: new Blob(["c2 main"], { type: 'text/markdown' }), error: null });
                        if (path === originalContributionsData[1].raw_response_storage_path) return Promise.resolve({ data: new Blob(["{\"raw\":2}"], { type: 'application/json' }), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error("Mock download error: path not found") });
                }
            }
        }).client;

        const typedClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const result = await cloneProject(typedClient, mockFileManager, originalProjectId, "Deep Clone Project - Copy", cloningUserId);

        assert(result.data, "Expected data for successful deep clone.");
        assertEquals(result.error, null);
        assertEquals(result.data?.project_name, "Deep Clone Project - Copy");
        assertEquals(result.data?.id, deepNewProjectId);

        // FileManager calls: 2 resources + 2 contributions = 4
        const fmCalls = mockFileManager.uploadAndRegisterFile.calls;
        assertEquals(fmCalls.length, 4, "Expected 4 FileManager uploads (2 resources + 2 contributions)");

        // Validate contribution metadata preservation: document_relationships, citations, etc.
        const contribCallContexts = fmCalls
            .map(call => call.args[0])
            .filter(ctx => ctx.contributionMetadata);
        assertEquals(contribCallContexts.length, 2);
        const [c1Ctx, c2Ctx] = contribCallContexts;
        assert(c1Ctx.contributionMetadata);
        assertEquals(c1Ctx.contributionMetadata!.stageSlug, "thesis");
        assertEquals(c1Ctx.contributionMetadata!.document_relationships ?? null, originalContributionsData[0].document_relationships);
        assert(c2Ctx.contributionMetadata);
        assertEquals(c2Ctx.contributionMetadata!.stageSlug, "antithesis");
        assertEquals(c2Ctx.contributionMetadata!.document_relationships ?? null, originalContributionsData[1].document_relationships);

        // Memory and feedback should be duplicated with new session/project IDs
        assertEquals(insertedMemory.length, originalMemoryData.length, "All memory rows should be cloned");
        insertedMemory.forEach((m) => {
            assertEquals(m.session_id, deepNewSessionId);
            assert(m.source_contribution_id, "Cloned memory should preserve a source_contribution_id (remapped to cloned id)");
        });
        assertEquals(insertedFeedback.length, originalFeedbackData.length, "All feedback rows should be cloned");
        insertedFeedback.forEach((f) => {
            assertEquals(f.session_id, deepNewSessionId);
            assertEquals(f.project_id, deepNewProjectId);
        });
    });

});
