/**
 * HeaderContext plan output: saved JSON shape, type-guard rejection paths, and
 * contribution / pathContext fileType (post-stream; assembled_content carries JSON).
 */
import {
    assert,
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    DialecticContributionRow,
    HeaderContext,
} from "../../dialectic-service/dialectic.interface.ts";
import { MockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isRecord } from "../../_shared/utils/type_guards.ts";
import { isHeaderContext } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isModelContributionContext } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import type { SaveResponseReturn } from "./saveResponse.interface.ts";
import { isSaveResponseSuccessReturn } from "./saveResponse.guard.ts";
import { saveResponse } from "./saveResponse.ts";
import {
    createMockContributionRow,
    createMockDialecticExecuteJobPayload,
    createMockFileManager,
    createMockSaveResponseDeps,
    createMockSaveResponseParamsWithQueuedJob,
    createMockSaveResponsePayload,
    createValidHeaderContext,
} from "./saveResponse.mock.ts";

Deno.test(
    "saveResponse — plan validation — header_context saves with context_for_documents and no files_to_generate",
    async () => {
        const validHeaderContext: HeaderContext = createValidHeaderContext();
        const headerJson: string = JSON.stringify(validHeaderContext);
        const savedContribution: DialecticContributionRow = createMockContributionRow({
            contribution_type: "header_context",
            file_name: "header_context.json",
            mime_type: "application/json",
        });
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: savedContribution,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const jobPayload = createMockDialecticExecuteJobPayload();
        const { params } = createMockSaveResponseParamsWithQueuedJob(jobPayload);
        const result: SaveResponseReturn = await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content: headerJson,
            }),
        );
        assert(
            isSaveResponseSuccessReturn(result),
            "Expected success return for valid header_context save",
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "FileManager.uploadAndRegisterFile should be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(isRecord(uploadContext), "Upload context should be a record");
        assertExists(uploadContext.fileContent, "Upload context should have fileContent");
        assert(typeof uploadContext.fileContent === "string", "fileContent must be a string");
        assert(
            uploadContext.fileContent.includes("context_for_documents"),
            "Saved content should contain context_for_documents",
        );
        assert(
            !uploadContext.fileContent.includes("files_to_generate"),
            "Saved content should NOT contain files_to_generate",
        );
    },
);

Deno.test(
    "saveResponse — plan validation — header_context with files_to_generate fails isHeaderContext",
    async () => {
        const invalidHeaderContext = {
            ...createValidHeaderContext(),
            files_to_generate: [
                {
                    from_document_key: FileType.business_case,
                    template_filename: "test.md",
                },
            ],
        } as HeaderContext;

        const headerJson: string = JSON.stringify(invalidHeaderContext);
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: createMockContributionRow(),
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const jobPayload = createMockDialecticExecuteJobPayload();
        const { params } = createMockSaveResponseParamsWithQueuedJob(jobPayload);
        const result: SaveResponseReturn = await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content: headerJson,
            }),
        );
        assert(
            isSaveResponseSuccessReturn(result),
            "Expected success return after save of invalid-shaped JSON",
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "FileManager.uploadAndRegisterFile should be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(isRecord(uploadContext), "Upload context should be a record");
        assertExists(uploadContext.fileContent, "Upload context should have fileContent");
        assert(typeof uploadContext.fileContent === "string", "fileContent must be a string");
        let parsedContent: Parameters<typeof isHeaderContext>[0];
        try {
            parsedContent = JSON.parse(uploadContext.fileContent);
        } catch (e) {
            throw new Error(
                `Failed to parse saved content as JSON: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
        assert(
            !isHeaderContext(parsedContent),
            "HeaderContext with files_to_generate should fail type guard validation",
        );
        assert(isRecord(parsedContent), "Parsed content should be a record");
        assert(
            "files_to_generate" in parsedContent,
            "Parsed content should have files_to_generate property (proving invalid structure)",
        );
    },
);

Deno.test(
    "saveResponse — plan validation — header_context missing context_for_documents fails isHeaderContext",
    async () => {
        const invalidHeaderContext: HeaderContext = {
            system_materials: {
                agent_notes_to_self: "Test executive summary",
                input_artifacts_summary: "Test input artifacts summary",
                stage_rationale: "Test stage rationale",
            },
            header_context_artifact: {
                type: "header_context",
                document_key: FileType.HeaderContext,
                artifact_class: "header_context",
                file_type: "json",
            },
        } as HeaderContext;

        const headerJson: string = JSON.stringify(invalidHeaderContext);
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: createMockContributionRow(),
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const jobPayload = createMockDialecticExecuteJobPayload();
        const { params } = createMockSaveResponseParamsWithQueuedJob(jobPayload);
        const result: SaveResponseReturn = await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content: headerJson,
            }),
        );
        assert(
            isSaveResponseSuccessReturn(result),
            "Expected success return after save of invalid-shaped JSON",
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "FileManager.uploadAndRegisterFile should be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(isRecord(uploadContext), "Upload context should be a record");
        assertExists(uploadContext.fileContent, "Upload context should have fileContent");
        assert(typeof uploadContext.fileContent === "string", "fileContent must be a string");
        let parsedContent: Parameters<typeof isHeaderContext>[0];
        try {
            parsedContent = JSON.parse(uploadContext.fileContent);
        } catch (e) {
            throw new Error(
                `Failed to parse saved content as JSON: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
        assert(
            !isHeaderContext(parsedContent),
            "HeaderContext missing context_for_documents should fail type guard validation",
        );
    },
);

Deno.test(
    "saveResponse — plan validation — header_context output saves with fileType HeaderContext on pathContext",
    async () => {
        const validHeaderContext: HeaderContext = createValidHeaderContext();
        const headerJson: string = JSON.stringify(validHeaderContext);
        const savedContribution: DialecticContributionRow = createMockContributionRow({
            contribution_type: "header_context",
            file_name: "header_context.json",
            mime_type: "application/json",
        });
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: savedContribution,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const jobPayload = createMockDialecticExecuteJobPayload();
        const { params } = createMockSaveResponseParamsWithQueuedJob(jobPayload);
        const result: SaveResponseReturn = await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content: headerJson,
            }),
        );
        assert(
            isSaveResponseSuccessReturn(result),
            "Expected success return for header_context fileType check",
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "FileManager.uploadAndRegisterFile should be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be ModelContributionUploadContext",
        );
        assertEquals(
            uploadContext.pathContext.fileType,
            FileType.HeaderContext,
            "PLAN-derived header_context job should save with fileType HeaderContext",
        );
    },
);
