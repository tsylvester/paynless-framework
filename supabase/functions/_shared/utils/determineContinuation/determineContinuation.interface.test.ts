import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ContextForDocument } from "../../../dialectic-service/dialectic.interface.ts";
import { FileType } from "../../types/file_manager.types.ts";
import type {
    DetermineContinuationParams,
    DetermineContinuationResult,
} from "./determineContinuation.interface.ts";

Deno.test(
    "Contract: DetermineContinuationParams requires all six fields",
    async (t) => {
        const contextDoc: ContextForDocument = {
            document_key: FileType.business_case,
            content_to_include: { field: "" },
        };

        await t.step("all keys present with typed values", () => {
            const params: DetermineContinuationParams = {
                finishReasonContinue: false,
                wasStructurallyFixed: false,
                parsedContent: { k: 1 },
                continueUntilComplete: true,
                documentKey: "business_case",
                contextForDocuments: [contextDoc],
            };
            assertEquals("finishReasonContinue" in params, true);
            assertEquals("wasStructurallyFixed" in params, true);
            assertEquals("parsedContent" in params, true);
            assertEquals("continueUntilComplete" in params, true);
            assertEquals("documentKey" in params, true);
            assertEquals("contextForDocuments" in params, true);
            assertEquals(typeof params.finishReasonContinue, "boolean");
            assertEquals(typeof params.wasStructurallyFixed, "boolean");
            assertEquals(typeof params.continueUntilComplete, "boolean");
        });

        await t.step("documentKey and contextForDocuments may be undefined", () => {
            const params: DetermineContinuationParams = {
                finishReasonContinue: false,
                wasStructurallyFixed: false,
                parsedContent: null,
                continueUntilComplete: false,
                documentKey: undefined,
                contextForDocuments: undefined,
            };
            assertEquals(params.documentKey, undefined);
            assertEquals(params.contextForDocuments, undefined);
        });
    },
);

Deno.test(
    "Contract: DetermineContinuationResult contains exactly shouldContinue",
    () => {
        const result: DetermineContinuationResult = { shouldContinue: true };
        assertEquals("shouldContinue" in result, true);
        assertEquals(Object.keys(result).length, 1);
        assertEquals(result.shouldContinue, true);
        const resultFalse: DetermineContinuationResult = { shouldContinue: false };
        assertEquals(Object.keys(resultFalse).length, 1);
        assertEquals(resultFalse.shouldContinue, false);
    },
);
