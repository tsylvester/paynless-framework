/**
 * Job lifecycle notifications for saveResponse (`execute_chunk_completed`;
 * `execute_completed` is emitted here on terminal success per split architecture).
 */
import {
    assert,
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { UnifiedAIResponse } from "../../dialectic-service/dialectic.interface.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import {
    ExecuteChunkCompletedPayload,
    ExecuteCompletedPayload,
} from "../../_shared/types/notification.service.types.ts";
import {
    mockNotificationService,
    resetMockNotificationService,
} from "../../_shared/utils/notification.service.mock.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { saveResponse } from "./saveResponse.ts";
import {
    createMockContributionRow,
    createMockDialecticExecuteJobPayload,
    createMockFileManager,
    createMockSaveResponseDeps,
    createMockSaveResponseParamsWithQueuedJob,
    createMockSaveResponsePayload,
} from "./saveResponse.mock.ts";

const defaultNotificationPayload = createMockSaveResponsePayload({
    assembled_content: '{"ok": true}',
});

function countJobNotificationType(
    type: ExecuteChunkCompletedPayload["type"] | ExecuteCompletedPayload["type"],
): number {
    let count = 0;
    const calls = mockNotificationService.sendJobNotificationEvent.calls;
    for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const first: unknown = call.args[0];
        if (
            isRecord(first) &&
            "type" in first &&
            first.type === type
        ) {
            count += 1;
        }
    }
    return count;
}

function callsWithJobNotificationType(
    type: ExecuteChunkCompletedPayload["type"] | ExecuteCompletedPayload["type"],
): typeof mockNotificationService.sendJobNotificationEvent.calls {
    return mockNotificationService.sendJobNotificationEvent.calls.filter((c) => {
        const p: unknown = c.args[0];
        return isRecord(p) && "type" in p && p.type === type;
    });
}

Deno.test(
    "saveResponse - notifications: execute_chunk_completed emitted for final chunk",
    async () => {
        resetMockNotificationService();
        const contributionRow = createMockContributionRow();
        const fileManager = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            createMockDialecticExecuteJobPayload({
                output_type: FileType.business_case,
                document_key: "business_case",
                document_relationships: {
                    source_group: "550e8400-e29b-41d4-a716-446655440000",
                },
            }),
        );
        await saveResponse(deps, params, defaultNotificationPayload);
        const chunkCalls = callsWithJobNotificationType("execute_chunk_completed");
        assertEquals(
            chunkCalls.length,
            1,
            "Expected one execute_chunk_completed emission for final chunk",
        );
        const firstCall = chunkCalls[0];
        assertExists(firstCall, "Expected notification call");
        const [payloadArg, targetUserId] = firstCall.args;
        const expected: ExecuteChunkCompletedPayload = {
            sessionId: "session-456",
            stageSlug: "thesis",
            job_id: "job-id-123",
            step_key: "business_case",
            document_key: "business_case",
            modelId: "model-def",
            iterationNumber: 1,
            type: "execute_chunk_completed",
        };
        assertEquals(payloadArg, expected);
        assertEquals(targetUserId, "user-789", "targetUserId must equal project owner on job row");
    },
);

Deno.test(
    "saveResponse - notifications: execute_chunk_completed emitted with all required fields when continuation chunk and document-related",
    async () => {
        resetMockNotificationService();
        const contributionRow = createMockContributionRow();
        const fileManager = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({
            fileManager,
            resolveFinishReason: (_ai: UnifiedAIResponse) => "length",
        });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            createMockDialecticExecuteJobPayload({
                output_type: FileType.business_case,
                document_key: "business_case",
                continueUntilComplete: true,
                continuation_count: 2,
                target_contribution_id: "root-123",
                document_relationships: {
                    source_group: "550e8400-e29b-41d4-a716-446655440000",
                    thesis: "root-123",
                },
            }),
        );
        await saveResponse(deps, params, defaultNotificationPayload);
        const chunkCalls = callsWithJobNotificationType("execute_chunk_completed");
        assertEquals(
            chunkCalls.length,
            1,
            "Expected one execute_chunk_completed emission",
        );
        const firstCall = chunkCalls[0];
        assertExists(firstCall, "Expected notification call");
        const [payloadArg, targetUserId] = firstCall.args;
        const expected: ExecuteChunkCompletedPayload = {
            sessionId: "session-456",
            stageSlug: "thesis",
            job_id: "job-id-123",
            step_key: "business_case",
            document_key: "business_case",
            modelId: "model-def",
            iterationNumber: 1,
            type: "execute_chunk_completed",
        };
        assertEquals(payloadArg, expected);
        assertEquals(targetUserId, "user-789", "targetUserId must equal project owner on job row");
    },
);

Deno.test(
    "saveResponse - notifications: no sendJobNotificationEvent when output type is non-document (HeaderContext)",
    async () => {
        resetMockNotificationService();
        const contributionRow = createMockContributionRow({
            contribution_type: "header_context",
        });
        const fileManager = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            createMockDialecticExecuteJobPayload(),
        );
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(
            mockNotificationService.sendJobNotificationEvent.calls.length,
            0,
            "Expected no sendJobNotificationEvent when output type is HeaderContext (non-document)",
        );
    },
);

Deno.test(
    "saveResponse - notifications: no job notification when project owner user_id on job row is empty",
    async () => {
        resetMockNotificationService();
        const contributionRow = createMockContributionRow();
        const fileManager = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            createMockDialecticExecuteJobPayload({
                output_type: FileType.business_case,
                document_key: "business_case",
                document_relationships: {
                    source_group: "550e8400-e29b-41d4-a716-446655440000",
                },
            }),
            { user_id: "" },
        );
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(
            mockNotificationService.sendJobNotificationEvent.calls.length,
            0,
            "Expected no sendJobNotificationEvent when project owner user_id is empty",
        );
    },
);

Deno.test(
    "saveResponse - notifications: all sendJobNotificationEvent calls include targetUserId as second argument",
    async () => {
        resetMockNotificationService();
        const contributionRow = createMockContributionRow();
        const fileManager = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const projectOwnerUserId = "owner-user-456";
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            createMockDialecticExecuteJobPayload({
                output_type: FileType.business_case,
                document_key: "business_case",
                document_relationships: {
                    source_group: "550e8400-e29b-41d4-a716-446655440000",
                },
            }),
            { user_id: projectOwnerUserId },
        );
        await saveResponse(deps, params, defaultNotificationPayload);
        const allCalls = mockNotificationService.sendJobNotificationEvent.calls;
        assert(
            allCalls.length >= 1,
            "At least one notification expected",
        );
        for (
            let i = 0;
            i < allCalls.length;
            i++
        ) {
            const call = allCalls[i];
            assertExists(call, "Call entry must exist");
            const args = call.args;
            assertExists(args[1], "Second argument (targetUserId) must be present");
            assertEquals(
                args[1],
                projectOwnerUserId,
                "targetUserId must equal job row user_id",
            );
        }
    },
);

Deno.test(
    "saveResponse - notifications: execute_completed emitted exactly once on terminal success",
    async () => {
        resetMockNotificationService();
        const contributionRow = createMockContributionRow();
        const fileManager = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            createMockDialecticExecuteJobPayload({
                output_type: FileType.business_case,
                document_key: "business_case",
                document_relationships: {
                    source_group: "550e8400-e29b-41d4-a716-446655440000",
                },
            }),
        );
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(countJobNotificationType("execute_completed"), 1);
        const calls = mockNotificationService.sendJobNotificationEvent.calls.filter(
            (c) => {
                const p: unknown = c.args[0];
                return isRecord(p) && p.type === "execute_completed";
            },
        );
        assertEquals(calls.length, 1);
        const [payloadArg, targetUserId] = calls[0].args;
        const expected: ExecuteCompletedPayload = {
            sessionId: "session-456",
            stageSlug: "thesis",
            job_id: "job-id-123",
            step_key: "business_case",
            document_key: "business_case",
            modelId: "model-def",
            iterationNumber: 1,
            type: "execute_completed",
        };
        assertEquals(payloadArg, expected);
        assertEquals(targetUserId, "user-789");
    },
);

Deno.test(
    "saveResponse - notifications: execute_completed not emitted on needs_continuation path",
    async () => {
        resetMockNotificationService();
        const contributionRow = createMockContributionRow();
        const fileManager = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({
            fileManager,
            isIntermediateChunk: () => true,
            continueJob: async () => ({ enqueued: true }),
        });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            createMockDialecticExecuteJobPayload({
                output_type: FileType.business_case,
                document_key: "business_case",
                document_relationships: {
                    source_group: "550e8400-e29b-41d4-a716-446655440000",
                },
            }),
        );
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(countJobNotificationType("execute_completed"), 0);
    },
);

Deno.test(
    "saveResponse - notifications: execute_completed not emitted on retriable error path",
    async () => {
        resetMockNotificationService();
        const contributionRow = createMockContributionRow();
        const fileManager = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({
            fileManager,
            debitTokens: async () => ({
                error: new Error("debit failed"),
                retriable: true,
            }),
        });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            createMockDialecticExecuteJobPayload({
                output_type: FileType.business_case,
                document_key: "business_case",
                document_relationships: {
                    source_group: "550e8400-e29b-41d4-a716-446655440000",
                },
            }),
        );
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(countJobNotificationType("execute_completed"), 0);
    },
);

Deno.test(
    "saveResponse - notifications: execute_completed not emitted on unretriable error path",
    async () => {
        resetMockNotificationService();
        const contributionRow = createMockContributionRow();
        const fileManager = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({
            fileManager,
            debitTokens: async () => ({
                error: new Error("debit failed"),
                retriable: false,
            }),
        });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            createMockDialecticExecuteJobPayload({
                output_type: FileType.business_case,
                document_key: "business_case",
                document_relationships: {
                    source_group: "550e8400-e29b-41d4-a716-446655440000",
                },
            }),
        );
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(countJobNotificationType("execute_completed"), 0);
    },
);
