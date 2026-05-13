import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { User } from "npm:@supabase/supabase-js@2";
import { startSession } from "./startSession.ts";
import { handleUpdateSessionModels } from "./updateSessionModels.ts";
import { cloneProject } from "./cloneProject.ts";
import type { StartSessionPayload, UpdateSessionModelsPayload, SelectedModels } from "./dialectic.interface.ts";
import {
    initializeTestDeps,
    coreInitializeTestStep,
    coreCleanupTestResources,
    registerUndoAction,
} from "../_shared/_integration.test.utils.ts";
import { FileManagerService } from "../_shared/services/file_manager.ts";
import { constructStoragePath } from "../_shared/utils/path_constructor.ts";
import { logger } from "../_shared/logger.ts";
import { assembleChunks } from "../_shared/utils/assembleChunks/assembleChunks.ts";

// OPENAI_API_KEY must be set to any non-empty string in the test environment.
// startSession constructs the embedding adapter before the tier guard fires; the adapter
// is never invoked because the tier check returns early on the disallowed model.

Deno.test("modelTiers integration: tier guard fires via real userClient RPC", async (t) => {
    initializeTestDeps();

    const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({}, "global");

    const { data: { user: primaryUser }, error: getUserError } = await primaryUserClient.auth.getUser();
    if (getUserError || !primaryUser) {
        throw new Error(`Failed to retrieve test user from JWT: ${getUserError?.message}`);
    }
    const user: User = primaryUser;

    // --- Resolve pre-seeded reference data by name/slug at runtime ---

    const { data: premiumModelRow, error: premiumModelError } = await adminClient
        .from("ai_providers")
        .select("id")
        .eq("api_identifier", "anthropic-claude-opus-4-6")
        .single();
    if (premiumModelError || !premiumModelRow) {
        throw new Error(`Seeded premium model 'anthropic-claude-opus-4-6' not found: ${premiumModelError?.message}`);
    }
    const premiumModelId: string = premiumModelRow.id;

    const { data: domainRow, error: domainError } = await adminClient
        .from("dialectic_domains")
        .select("id")
        .eq("name", "Software Development")
        .single();
    if (domainError || !domainRow) {
        throw new Error(`Seeded domain 'Software Development' not found: ${domainError?.message}`);
    }
    const domainId: string = domainRow.id;

    const { data: templateRow, error: templateError } = await adminClient
        .from("dialectic_process_templates")
        .select("id")
        .not("starting_stage_id", "is", null)
        .limit(1)
        .single();
    if (templateError || !templateRow) {
        throw new Error(`No seeded process template with starting_stage_id found: ${templateError?.message}`);
    }
    const templateId: string = templateRow.id;

    const { data: stageRow, error: stageError } = await adminClient
        .from("dialectic_stages")
        .select("id")
        .eq("slug", "thesis")
        .single();
    if (stageError || !stageRow) {
        throw new Error(`Seeded thesis stage not found: ${stageError?.message}`);
    }
    const stageId: string = stageRow.id;

    // --- Insert shared test project (owned by the free-tier test user) ---

    const projectId: string = crypto.randomUUID();
    const { error: projectInsertError } = await adminClient
        .from("dialectic_projects")
        .insert({
            id: projectId,
            user_id: primaryUserId,
            project_name: "Model Tier Integration Test Project",
            initial_user_prompt: "Integration test: verify tier guard rejects disallowed models.",
            process_template_id: templateId,
            selected_domain_id: domainId,
            status: "draft",
        });
    if (projectInsertError) {
        throw new Error(`Failed to insert test project: ${projectInsertError.message}`);
    }
    registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_projects",
        criteria: { id: projectId },
        scope: "global",
    });

    // -------------------------------------------------------------------------
    // Step 1: startSession rejects a premium-tier model for a free-tier user
    // -------------------------------------------------------------------------
    await t.step(
        "startSession rejects a premium-tier model for a free-tier user and does not create a session",
        async () => {
            const premiumModel: SelectedModels = { id: premiumModelId, displayName: "Opus 4.6 (Premium)" };
            const payload: StartSessionPayload = {
                projectId,
                selectedModels: [premiumModel],
                idempotencyKey: "tier-int-test-start-session",
            };

            const result = await startSession(user, adminClient, primaryUserClient, payload);

            assertExists(result.error);
            assertEquals(result.error?.code, "MODEL_TIER_DISALLOWED");

            const { data: sessions, error: sessionQueryError } = await adminClient
                .from("dialectic_sessions")
                .select("id")
                .eq("project_id", projectId)
                .eq("idempotency_key", "tier-int-test-start-session");
            if (sessionQueryError) {
                throw new Error(`Failed to query sessions after rejection: ${sessionQueryError.message}`);
            }
            assertEquals(sessions?.length ?? 0, 0);
        },
    );

    // -------------------------------------------------------------------------
    // Step 2: handleUpdateSessionModels rejects a premium-tier model
    // -------------------------------------------------------------------------
    await t.step(
        "handleUpdateSessionModels rejects a premium-tier model for a free-tier user and does not update the session",
        async () => {
            const { data: freeModelRow, error: freeModelError } = await adminClient
                .from("ai_providers")
                .select("id")
                .eq("min_plan_tier_level", 0)
                .eq("is_active", true)
                .limit(1)
                .single();
            if (freeModelError || !freeModelRow) {
                throw new Error(`No active free-tier model found for session seed: ${freeModelError?.message}`);
            }
            const freeModelId: string = freeModelRow.id;

            const sessionId: string = crypto.randomUUID();
            const { error: sessionInsertError } = await adminClient
                .from("dialectic_sessions")
                .insert({
                    id: sessionId,
                    project_id: projectId,
                    session_description: "Tier guard update test session",
                    iteration_count: 1,
                    selected_model_ids: [freeModelId],
                    current_stage_id: stageId,
                    status: "active",
                });
            if (sessionInsertError) {
                throw new Error(`Failed to insert test session: ${sessionInsertError.message}`);
            }
            registerUndoAction({
                type: "DELETE_CREATED_ROW",
                tableName: "dialectic_sessions",
                criteria: { id: sessionId },
                scope: "global",
            });

            const premiumModel: SelectedModels = { id: premiumModelId, displayName: "Opus 4.6 (Premium)" };
            const payload: UpdateSessionModelsPayload = {
                sessionId,
                selectedModels: [premiumModel],
            };

            const result = await handleUpdateSessionModels(adminClient, primaryUserClient, payload, primaryUserId);

            assertExists(result.error);
            assertEquals(result.error?.code, "MODEL_TIER_DISALLOWED");

            const { data: session, error: sessionQueryError } = await adminClient
                .from("dialectic_sessions")
                .select("selected_model_ids")
                .eq("id", sessionId)
                .single();
            if (sessionQueryError) {
                throw new Error(`Failed to query session after rejection: ${sessionQueryError.message}`);
            }
            assertExists(session);
            assertEquals(session.selected_model_ids, [freeModelId]);
        },
    );

    // -------------------------------------------------------------------------
    // Step 3: cloneProject filters premium-tier models from cloned sessions
    // -------------------------------------------------------------------------
    await t.step(
        "cloneProject filters a premium-tier model out of cloned sessions for a free-tier user",
        async () => {
            const sessionId: string = crypto.randomUUID();
            const { error: sessionInsertError } = await adminClient
                .from("dialectic_sessions")
                .insert({
                    id: sessionId,
                    project_id: projectId,
                    session_description: "Tier guard clone test session",
                    iteration_count: 1,
                    selected_model_ids: [premiumModelId],
                    current_stage_id: stageId,
                    status: "active",
                });
            if (sessionInsertError) {
                throw new Error(`Failed to insert clone test session: ${sessionInsertError.message}`);
            }
            registerUndoAction({
                type: "DELETE_CREATED_ROW",
                tableName: "dialectic_sessions",
                criteria: { id: sessionId },
                scope: "global",
            });

            const fileManager = new FileManagerService(adminClient, {
                constructStoragePath,
                logger,
                assembleChunks,
            });

            const result = await cloneProject(
                adminClient,
                primaryUserClient,
                fileManager,
                projectId,
                "Cloned Tier Test Project",
                primaryUserId,
            );

            assertExists(result.data);
            assertEquals(result.error, null);

            const clonedProjectId: string = result.data.id;

            // Register cloned project for deletion first (processed after its sessions due to LIFO).
            registerUndoAction({
                type: "DELETE_CREATED_ROW",
                tableName: "dialectic_projects",
                criteria: { id: clonedProjectId },
                scope: "global",
            });

            const { data: clonedSessions, error: clonedSessionsError } = await adminClient
                .from("dialectic_sessions")
                .select("id, selected_model_ids")
                .eq("project_id", clonedProjectId);
            if (clonedSessionsError) {
                throw new Error(`Failed to query cloned sessions: ${clonedSessionsError.message}`);
            }
            assertExists(clonedSessions);
            // The original project has 2 sessions: the one inserted in step 2 (free model)
            // and the one inserted in this step (premium model). Both are cloned; the premium
            // model is filtered out of the second session's selected_model_ids.
            assertEquals(clonedSessions.length, 2);

            // Register cloned sessions for deletion (processed before the cloned project due to LIFO).
            for (const cs of clonedSessions) {
                registerUndoAction({
                    type: "DELETE_CREATED_ROW",
                    tableName: "dialectic_sessions",
                    criteria: { id: cs.id },
                    scope: "global",
                });
            }

            for (const cs of clonedSessions) {
                const clonedModelIds: string[] = cs.selected_model_ids ?? [];
                assertEquals(clonedModelIds.includes(premiumModelId), false);
            }
        },
    );

    await coreCleanupTestResources("all");
});
