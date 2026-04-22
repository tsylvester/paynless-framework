/**
 * Final-chunk assembly behavior: `assembleAndSaveFinalDocument` gating for `saveResponse`
 * (adapted from `executeModelCallAndSave.assembleDocument.test.ts`).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    DialecticContributionRow,
    DialecticExecuteJobPayload,
    UnifiedAIResponse,
} from "../../dialectic-service/dialectic.interface.ts";
import { MockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import type { SaveResponseDeps } from "./saveResponse.interface.ts";
import {
    createMockDialecticContributionRow,
    testPayload,
    createMockFileManager,
    createMockSaveResponseDeps,
    createMockSaveResponseParamsWithQueuedJob,
    createMockSaveResponsePayload,
} from "./saveResponse.mock.ts";
import { saveResponse } from "./saveResponse.ts";

Deno.test(
    "saveResponse — should NOT call assembleAndSaveFinalDocument for final chunk with markdown document (root relationships normalize to contribution id)",
    async () => {
        const rootContributionId: string = "root-contrib-123";
        const savedContribution: DialecticContributionRow = createMockDialecticContributionRow({
            document_relationships: {
                source_group: "550e8400-e29b-41d4-a716-446655440000",
                thesis: rootContributionId,
            },
        });
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: savedContribution,
        });
        const markdownPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: FileType.business_case,
            document_key: "business_case",
            document_relationships: {
                source_group: "550e8400-e29b-41d4-a716-446655440000",
                thesis: rootContributionId,
            },
        };
        if (!isJson(markdownPayload)) {
            throw new Error("test fixture: markdownPayload must be Json");
        }
        const { params } = createMockSaveResponseParamsWithQueuedJob(markdownPayload, {
            payload: markdownPayload,
        });
        const deps: SaveResponseDeps = createMockSaveResponseDeps({
            fileManager,
        });
        await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content: '{"content": "AI response"}',
            }),
        );
        assertEquals(
            fileManager.assembleAndSaveFinalDocument.calls.length,
            0,
            "assembleAndSaveFinalDocument should NOT be called when persisted stage relationship equals contribution id (single effective root chunk)",
        );
    },
);

Deno.test(
    "saveResponse — should NOT call assembleAndSaveFinalDocument for final JSON-only chunk when rootIdFromSaved equals contribution id",
    async () => {
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: createMockDialecticContributionRow(),
        });
        const jsonOnlyPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: FileType.HeaderContext,
            document_relationships: {
                source_group: "550e8400-e29b-41d4-a716-446655440000",
            },
        };
        if (!isJson(jsonOnlyPayload)) {
            throw new Error("test fixture: jsonOnlyPayload must be Json");
        }
        const { params } = createMockSaveResponseParamsWithQueuedJob(jsonOnlyPayload, {
            payload: jsonOnlyPayload,
        });
        const deps: SaveResponseDeps = createMockSaveResponseDeps({
            fileManager,
        });
        await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content:
                    '{"header": "Header Context", "context": {"key": "value"}}',
            }),
        );
        assertEquals(
            fileManager.assembleAndSaveFinalDocument.calls.length,
            0,
            "assembleAndSaveFinalDocument should NOT be called for single-chunk JSON artifacts (rootIdFromSaved === contribution.id)",
        );
    },
);

Deno.test(
    "saveResponse — should NOT call assembleAndSaveFinalDocument for non-final chunk (resolvedFinish !== stop)",
    async () => {
        const rootContributionId: string = "root-contrib-789";
        const savedContribution: DialecticContributionRow = createMockDialecticContributionRow({
            id: "contrib-continuation-1",
            document_relationships: {
                thesis: rootContributionId,
                source_group: "550e8400-e29b-41d4-a716-446655440001",
            },
            target_contribution_id: rootContributionId,
        });
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: savedContribution,
        });
        const continuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: FileType.HeaderContext,
            target_contribution_id: rootContributionId,
            continueUntilComplete: true,
            continuation_count: 1,
            document_relationships: {
                thesis: rootContributionId,
                source_group: "550e8400-e29b-41d4-a716-446655440001",
            },
        };
        if (!isJson(continuationPayload)) {
            throw new Error("test fixture: continuationPayload must be Json");
        }
        const { params } = createMockSaveResponseParamsWithQueuedJob(continuationPayload, {
            payload: continuationPayload,
        });
        const deps: SaveResponseDeps = createMockSaveResponseDeps({
            fileManager,
            resolveFinishReason: (_ai: UnifiedAIResponse) => "length",
        });
        await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content: '{"content": "Partial AI response"}',
            }),
        );
        assertEquals(
            fileManager.assembleAndSaveFinalDocument.calls.length,
            0,
            "assembleAndSaveFinalDocument should NOT be called for non-final chunks (resolvedFinish !== stop)",
        );
    },
);

Deno.test(
    "saveResponse — should NOT call assembleAndSaveFinalDocument when document_relationships on saved record is null (no rootIdFromSaved after persistence rules)",
    async () => {
        const savedContribution: DialecticContributionRow = createMockDialecticContributionRow({
            document_relationships: null,
        });
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: savedContribution,
        });
        const jsonOnlyPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: FileType.HeaderContext,
            document_relationships: {
                source_group: "550e8400-e29b-41d4-a716-446655440000",
            },
        };
        if (!isJson(jsonOnlyPayload)) {
            throw new Error("test fixture: jsonOnlyPayload must be Json");
        }
        const { params } = createMockSaveResponseParamsWithQueuedJob(jsonOnlyPayload, {
            payload: jsonOnlyPayload,
        });
        const deps: SaveResponseDeps = createMockSaveResponseDeps({
            fileManager,
        });
        await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content:
                    '{"header": "Header Context", "context": {"key": "value"}}',
            }),
        );
        assertEquals(
            fileManager.assembleAndSaveFinalDocument.calls.length,
            0,
            "assembleAndSaveFinalDocument should NOT be called when document_relationships cannot yield rootIdFromSaved distinct from contribution id",
        );
    },
);
