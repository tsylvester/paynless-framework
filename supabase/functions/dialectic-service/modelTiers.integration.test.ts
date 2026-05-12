import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../types_db.ts";
import { startSession } from "./startSession.ts";
import { handleUpdateSessionModels } from "./updateSessionModels.ts";
import { cloneProject } from "./cloneProject.ts";
import type { StartSessionPayload, UpdateSessionModelsPayload, SelectedModels } from "./dialectic.interface.ts";
import type { ProjectContext } from "../_shared/prompt-assembler/prompt-assembler.interface.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";
import { createMockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import { MockPromptAssembler } from "../_shared/prompt-assembler/prompt-assembler.mock.ts";
import { MockLogger } from "../_shared/logger.mock.ts";

const FREE_USER: User = {
    id: "free-user-model-tier-int",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
};

const PREMIUM_MODEL_ID = "premium-model-tier-int";
const PREMIUM_SELECTED_MODELS: SelectedModels[] = [
    { id: PREMIUM_MODEL_ID, displayName: "Premium Tier Model" },
];

Deno.test("modelTiers integration: startSession -> updateSessionModels -> cloneProject", async (t) => {
    await t.step("startSession rejects a premium-tier model for a free-tier user and does not create a session", async () => {
        const startProjectId = "project-model-tier-start-int";
        const startSessionPayload: StartSessionPayload = {
            projectId: startProjectId,
            selectedModels: PREMIUM_SELECTED_MODELS,
            idempotencyKey: "idem-model-tier-start-int",
        };
        const startProject: ProjectContext = {
            id: startProjectId,
            user_id: FREE_USER.id,
            project_name: "Model Tier Start Project",
            initial_user_prompt: "Start project prompt",
            process_template_id: "process-template-model-tier-int",
            selected_domain_id: "domain-model-tier-int",
            dialectic_domains: { name: "General" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            initial_prompt_resource_id: null,
            repo_url: null,
            selected_domain_overlay_id: null,
            user_domain_overlay_values: null,
            status: "draft",
            idempotency_key: null,
        };
        const startSessionConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_projects: {
                    select: async () => ({
                        data: [startProject],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: "OK",
                    }),
                },
                dialectic_process_templates: {
                    select: async () => ({
                        data: [{ id: "process-template-model-tier-int", name: "Integration Template", starting_stage_id: "stage-model-tier-int" }],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: "OK",
                    }),
                },
                dialectic_stages: {
                    select: async () => ({
                        data: [{ id: "stage-model-tier-int", slug: "hypothesis", display_name: "Hypothesis", default_system_prompt_id: "system-prompt-model-tier-int" }],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: "OK",
                    }),
                },
                system_prompts: {
                    select: async () => ({
                        data: [{ id: "system-prompt-model-tier-int", prompt_text: "Integration system prompt" }],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: "OK",
                    }),
                },
                domain_specific_prompt_overlays: {
                    select: async () => ({
                        data: [{ overlay_values: { role: "senior product strategist", stage_instructions: "baseline", style_guide_markdown: "# Guide", expected_output_artifacts_json: "{}" } }],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: "OK",
                    }),
                },
                ai_providers: {
                    select: async () => ({
                        data: [{
                            id: "embedding-model-tier-int",
                            api_identifier: "text-embedding-3-large",
                            provider_max_input_tokens: 8000,
                            config: {
                                tokenization_strategy: {
                                    type: "tiktoken",
                                    tiktoken_encoding_name: "cl100k_base",
                                },
                            },
                        }],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: "OK",
                    }),
                },
                dialectic_sessions: {
                    insert: async () => ({
                        data: [{ id: "session-should-not-exist" }],
                        error: null,
                        count: 1,
                        status: 201,
                        statusText: "Created",
                    }),
                },
            },
            rpcResults: {
                validate_model_tier_access: {
                    data: [{
                        valid: false,
                        user_tier_level: 0,
                        max_models_per_project: 1,
                        over_model_limit: false,
                        disallowed_model_ids: [PREMIUM_MODEL_ID],
                    }],
                    error: null,
                },
            },
            mockUser: FREE_USER,
        };
        const startSetup = createMockSupabaseClient(FREE_USER.id, startSessionConfig);
        const startClient: SupabaseClient<Database> = startSetup.client as unknown as SupabaseClient<Database>;
        const startFileManager = createMockFileManagerService();
        const startPromptAssembler = new MockPromptAssembler(startClient, startFileManager);
        const startLogger = new MockLogger();

        const startResult = await startSession(
            FREE_USER,
            startClient,
            startSessionPayload,
            {
                logger: startLogger,
                fileManager: startFileManager,
                promptAssembler: startPromptAssembler,
                randomUUID: () => "session-should-not-exist",
            },
        );

        assertExists(startResult.error);
        assertEquals(startResult.error?.code, "MODEL_TIER_DISALLOWED");
        assertEquals(startSetup.spies.rpcSpy.calls.length, 1);
        assertEquals(
            startSetup.spies.getHistoricQueryBuilderSpies("dialectic_sessions", "insert")?.callCount,
            0,
        );
    });

    await t.step("handleUpdateSessionModels rejects a premium-tier model for a free-tier user and does not update the session", async () => {
        const updateProjectId = "project-model-tier-update-int";
        const updateSessionId = "session-model-tier-update-int";
        const updatePayload: UpdateSessionModelsPayload = {
            sessionId: updateSessionId,
            selectedModels: PREMIUM_SELECTED_MODELS,
        };
        const existingSession: Tables<"dialectic_sessions"> = {
            id: updateSessionId,
            project_id: updateProjectId,
            session_description: "Existing integration session",
            user_input_reference_url: null,
            iteration_count: 1,
            selected_model_ids: ["free-model-tier-int"],
            status: "active",
            associated_chat_id: null,
            current_stage_id: "stage-model-tier-update-int",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            idempotency_key: null,
            viewing_stage_id: null,
        };
        const updateConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_sessions: {
                    select: async () => ({
                        data: [existingSession],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: "OK",
                    }),
                    update: async () => ({
                        data: [existingSession],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: "OK",
                    }),
                },
                dialectic_projects: {
                    select: async () => ({
                        data: [{ id: updateProjectId, user_id: FREE_USER.id }],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: "OK",
                    }),
                },
            },
            rpcResults: {
                validate_model_tier_access: {
                    data: [{
                        valid: false,
                        user_tier_level: 0,
                        max_models_per_project: 1,
                        over_model_limit: false,
                        disallowed_model_ids: [PREMIUM_MODEL_ID],
                    }],
                    error: null,
                },
            },
            mockUser: FREE_USER,
        };
        const updateSetup = createMockSupabaseClient(FREE_USER.id, updateConfig);
        const updateClient: SupabaseClient<Database> = updateSetup.client as unknown as SupabaseClient<Database>;

        const updateResult = await handleUpdateSessionModels(updateClient, updatePayload, FREE_USER.id);

        assertExists(updateResult.error);
        assertEquals(updateResult.error?.code, "MODEL_TIER_DISALLOWED");
        assertEquals(updateSetup.spies.rpcSpy.calls.length, 1);
        assertEquals(
            updateSetup.spies.getHistoricQueryBuilderSpies("dialectic_sessions", "update")?.callCount,
            0,
        );
    });

    await t.step("cloneProject filters a premium-tier model out of cloned sessions for a free-tier user", async () => {
        const originalProjectId = "project-model-tier-clone-original-int";
        const clonedProjectName = "Cloned Model Tier Project";
        const originalProject: Tables<"dialectic_projects"> = {
            id: originalProjectId,
            user_id: FREE_USER.id,
            project_name: "Original Model Tier Project",
            initial_user_prompt: "Clone project prompt",
            process_template_id: "process-template-model-tier-clone-int",
            selected_domain_id: "domain-model-tier-clone-int",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            initial_prompt_resource_id: null,
            repo_url: null,
            selected_domain_overlay_id: null,
            user_domain_overlay_values: null,
            status: "active",
            idempotency_key: null,
        };
        const originalSession: Tables<"dialectic_sessions"> = {
            id: "session-model-tier-clone-original-int",
            project_id: originalProjectId,
            session_description: "Original cloned session",
            user_input_reference_url: null,
            iteration_count: 1,
            selected_model_ids: [PREMIUM_MODEL_ID],
            status: "active",
            associated_chat_id: null,
            current_stage_id: "stage-model-tier-clone-int",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            idempotency_key: null,
            viewing_stage_id: null,
        };
        const insertedSelectedModelIds: Array<string[] | null | undefined> = [];
        let clonedProjectId = "";

        const cloneConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_projects: {
                    select: async (state: MockQueryBuilderState) => {
                        if (state.filters.some((filter) => filter.column === "id" && filter.value === originalProjectId)) {
                            return {
                                data: [originalProject],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: "OK",
                            };
                        }
                        if (state.filters.some((filter) => filter.column === "id" && filter.value === clonedProjectId)) {
                            return {
                                data: [{ ...originalProject, id: clonedProjectId, project_name: clonedProjectName }],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: "OK",
                            };
                        }
                        return {
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: "OK",
                        };
                    },
                    insert: async (state: MockQueryBuilderState) => {
                        const insertData = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
                        if (insertData && typeof insertData === "object" && "id" in insertData && typeof insertData.id === "string") {
                            clonedProjectId = insertData.id;
                        }
                        return {
                            data: [{ ...originalProject, ...(insertData && typeof insertData === "object" ? insertData : {}), project_name: clonedProjectName }],
                            error: null,
                            count: 1,
                            status: 201,
                            statusText: "Created",
                        };
                    },
                },
                dialectic_sessions: {
                    select: async () => ({
                        data: [originalSession],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: "OK",
                    }),
                    insert: async (state: MockQueryBuilderState) => {
                        const insertData = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
                        if (insertData && typeof insertData === "object" && "selected_model_ids" in insertData) {
                            const selectedModelIds = insertData.selected_model_ids;
                            if (selectedModelIds === null || selectedModelIds === undefined || Array.isArray(selectedModelIds)) {
                                insertedSelectedModelIds.push(selectedModelIds);
                            }
                        }
                        return {
                            data: [{ ...originalSession, ...(insertData && typeof insertData === "object" ? insertData : {}), project_id: clonedProjectId }],
                            error: null,
                            count: 1,
                            status: 201,
                            statusText: "Created",
                        };
                    },
                },
                dialectic_project_resources: {
                    select: async () => ({
                        data: [],
                        error: null,
                        count: 0,
                        status: 200,
                        statusText: "OK",
                    }),
                },
                dialectic_contributions: {
                    select: async () => ({
                        data: [],
                        error: null,
                        count: 0,
                        status: 200,
                        statusText: "OK",
                    }),
                },
                dialectic_feedback: {
                    select: async () => ({
                        data: [],
                        error: null,
                        count: 0,
                        status: 200,
                        statusText: "OK",
                    }),
                },
                dialectic_memory: {
                    select: async () => ({
                        data: [],
                        error: null,
                        count: 0,
                        status: 200,
                        statusText: "OK",
                    }),
                },
            },
            rpcResults: {
                validate_model_tier_access: {
                    data: [{
                        valid: false,
                        user_tier_level: 0,
                        max_models_per_project: 1,
                        over_model_limit: false,
                        disallowed_model_ids: [PREMIUM_MODEL_ID],
                    }],
                    error: null,
                },
            },
            mockUser: FREE_USER,
        };
        const cloneSetup = createMockSupabaseClient(FREE_USER.id, cloneConfig);
        const cloneClient: SupabaseClient<Database> = cloneSetup.client as unknown as SupabaseClient<Database>;
        const cloneFileManager = createMockFileManagerService();

        const cloneResult = await cloneProject(
            cloneClient,
            cloneFileManager,
            originalProjectId,
            clonedProjectName,
            FREE_USER.id,
        );

        assertExists(cloneResult.data);
        assertEquals(cloneResult.error, null);
        assertEquals(insertedSelectedModelIds, [[]]);
        assertEquals(cloneSetup.spies.rpcSpy.calls.length, 1);
    });
});
