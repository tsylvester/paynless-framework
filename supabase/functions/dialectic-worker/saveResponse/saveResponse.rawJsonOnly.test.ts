/**
 * Raw JSON document upload context: pathContext.fileType, mimeType, fileContent,
 * contributionMetadata (no rawJsonResponseContent), and persisted contribution paths.
 */
import {
    assert,
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    DialecticContributionRow,
    DialecticExecuteJobPayload,
} from "../../dialectic-service/dialectic.interface.ts";
import { MockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isDialecticContribution, isRecord } from "../../_shared/utils/type_guards.ts";
import { isModelContributionContext } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { saveResponse } from "./saveResponse.ts";
import {
    createMockContributionRow,
    createMockDialecticExecuteJobPayload,
    createMockFileManager,
    createMockSaveResponseDeps,
    createMockSaveResponseParamsWithQueuedJob,
    createMockSaveResponsePayload,
} from "./saveResponse.mock.ts";

const sanitizedJson: string =
    '{"content": "# Business Case\\n\\n## Market Opportunity\\n..."}';

const rawJsonOnlyExecutePayload: DialecticExecuteJobPayload =
    createMockDialecticExecuteJobPayload({
        output_type: FileType.business_case,
        document_key: "business_case",
        document_relationships: {
            thesis: "contrib-test-1",
            source_group: "00000000-0000-4000-8000-000000000002",
        },
    });

Deno.test(
    "49.b.i: saveResponse passes FileType.ModelContributionRawJson to file manager (not document key fileType)",
    async () => {
        const contributionRow: DialecticContributionRow = createMockContributionRow({
            id: "contrib-123",
            file_name: "mock-ai-v1_0_business_case_raw.json",
            mime_type: "application/json",
            raw_response_storage_path: "raw_responses/mock-ai-v1_0_business_case_raw.json",
            storage_path: "raw_responses",
        });
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            rawJsonOnlyExecutePayload,
        );
        await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content: sanitizedJson,
            }),
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "Expected fileManager.uploadAndRegisterFile to be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be a ModelContributionUploadContext",
        );
        assertEquals(
            uploadContext.pathContext.fileType,
            FileType.ModelContributionRawJson,
            `Expected fileType to be FileType.ModelContributionRawJson, but got ${uploadContext.pathContext.fileType}. The function currently passes the document key fileType (e.g., FileType.business_case) instead of FileType.ModelContributionRawJson.`,
        );
    },
);

Deno.test(
    '49.b.ii: saveResponse passes mimeType "application/json" to file manager (not "text/markdown")',
    async () => {
        const contributionRow: DialecticContributionRow = createMockContributionRow({
            id: "contrib-123",
            file_name: "mock-ai-v1_0_business_case_raw.json",
            mime_type: "application/json",
            raw_response_storage_path: "raw_responses/mock-ai-v1_0_business_case_raw.json",
            storage_path: "raw_responses",
        });
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            rawJsonOnlyExecutePayload,
        );
        await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content: sanitizedJson,
            }),
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "Expected fileManager.uploadAndRegisterFile to be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be a ModelContributionUploadContext",
        );
        assertEquals(
            uploadContext.mimeType,
            "application/json",
            `Expected mimeType to be "application/json", but got "${uploadContext.mimeType}". The function currently passes aiResponse.contentType || "text/markdown" instead of "application/json".`,
        );
    },
);

Deno.test(
    "49.b.iii: saveResponse passes sanitized JSON string as fileContent to file manager",
    async () => {
        const contributionRow: DialecticContributionRow = createMockContributionRow({
            id: "contrib-123",
            file_name: "mock-ai-v1_0_business_case_raw.json",
            mime_type: "application/json",
            raw_response_storage_path: "raw_responses/mock-ai-v1_0_business_case_raw.json",
            storage_path: "raw_responses",
        });
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            rawJsonOnlyExecutePayload,
        );
        await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content: sanitizedJson,
            }),
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "Expected fileManager.uploadAndRegisterFile to be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be a ModelContributionUploadContext",
        );
        assertEquals(
            uploadContext.fileContent,
            sanitizedJson,
            `Expected fileContent to be the sanitized JSON string like '{"content": "# Business Case\\n\\n..."}', not the raw provider response object.`,
        );
        assert(
            typeof uploadContext.fileContent === "string",
            "fileContent should be a string (the sanitized JSON), not an object",
        );
    },
);

Deno.test(
    "49.b.iv: saveResponse does NOT include rawJsonResponseContent in upload context",
    async () => {
        const contributionRow: DialecticContributionRow = createMockContributionRow({
            id: "contrib-123",
            file_name: "mock-ai-v1_0_business_case_raw.json",
            mime_type: "application/json",
            raw_response_storage_path: "raw_responses/mock-ai-v1_0_business_case_raw.json",
            storage_path: "raw_responses",
        });
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: contributionRow,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            rawJsonOnlyExecutePayload,
        );
        await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content: sanitizedJson,
            }),
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "Expected fileManager.uploadAndRegisterFile to be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be a ModelContributionUploadContext",
        );
        assert(
            !("rawJsonResponseContent" in uploadContext.contributionMetadata),
            `Expected rawJsonResponseContent to NOT be present in contributionMetadata. It's redundant - fileContent IS the raw JSON content. The function currently sets rawJsonResponseContent: aiResponse.rawProviderResponse.`,
        );
        const contributionMetadata = uploadContext.contributionMetadata;
        assert(
            isRecord(contributionMetadata),
            "contributionMetadata should be a record",
        );
        assert(
            !("rawJsonResponseContent" in contributionMetadata),
            "rawJsonResponseContent should not be in contributionMetadata",
        );
    },
);

Deno.test(
    "49.b.v: saveResponse creates contribution record with correct file_name, storage_path, and mime_type",
    async () => {
        const expectedContribution: DialecticContributionRow = createMockContributionRow({
            id: "contrib-123",
            file_name: "mock-ai-v1_0_business_case_raw.json",
            storage_path: "raw_responses",
            raw_response_storage_path: "raw_responses/mock-ai-v1_0_business_case_raw.json",
            mime_type: "application/json",
        });
        const fileManager: MockFileManagerService = createMockFileManager({
            outcome: "success",
            contribution: expectedContribution,
        });
        const deps = createMockSaveResponseDeps({ fileManager });
        const { params } = createMockSaveResponseParamsWithQueuedJob(
            rawJsonOnlyExecutePayload,
        );
        await saveResponse(
            deps,
            params,
            createMockSaveResponsePayload({
                assembled_content: sanitizedJson,
            }),
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "Expected fileManager.uploadAndRegisterFile to be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be a ModelContributionUploadContext",
        );
        const result = await fileManager.uploadAndRegisterFile(uploadContext);
        assert(!result.error, "File upload should succeed");
        assertExists(result.record, "Contribution record should be returned");
        if (isDialecticContribution(result.record)) {
            const contribution: DialecticContributionRow = result.record;
            assert(
                contribution.storage_path !== null &&
                    contribution.storage_path.includes("raw_responses"),
                `Expected storage_path to contain 'raw_responses/' (not 'documents/'), but got '${contribution.storage_path}'`,
            );
            if (contribution.file_name) {
                assert(
                    contribution.file_name.endsWith("_raw.json"),
                    `Expected file_name to end with '_raw.json' (not '.md'), but got '${contribution.file_name}'`,
                );
            } else {
                throw new Error("Expected file_name to be non-null");
            }
            assertEquals(
                contribution.mime_type,
                "application/json",
                `Expected mime_type to be "application/json" (not "text/markdown"), but got "${contribution.mime_type}"`,
            );
            assert(
                contribution.raw_response_storage_path !== null &&
                    contribution.raw_response_storage_path.includes("_raw.json"),
                `Expected raw_response_storage_path to point to the _raw.json file, but got '${contribution.raw_response_storage_path}'`,
            );
        }
    },
);
