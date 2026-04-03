import type { ContextForDocument } from "../../../dialectic-service/dialectic.interface.ts";
import type {
    DetermineContinuationParams,
    DetermineContinuationResult,
} from "./determineContinuation.interface.ts";
import { isRecord } from "../type_guards.ts";

export function determineContinuation(
    params: DetermineContinuationParams,
): DetermineContinuationResult {
    let shouldContinue: boolean = params.finishReasonContinue;

    if (!shouldContinue && params.wasStructurallyFixed && params.continueUntilComplete) {
        shouldContinue = true;
    }

    const parsedContent: unknown = params.parsedContent;

    if (!shouldContinue && isRecord(parsedContent)) {
        if (
            parsedContent.continuation_needed === true ||
            parsedContent.stop_reason === "continuation" ||
            parsedContent.stop_reason === "token_limit" ||
            (typeof parsedContent.resume_cursor === "string" &&
                parsedContent.resume_cursor.trim() !== "")
        ) {
            shouldContinue = true;
        }
    }

    if (
        !shouldContinue &&
        isRecord(parsedContent) &&
        params.continueUntilComplete
    ) {
        const contextDocsUnknown: ContextForDocument[] | null | undefined =
            params.contextForDocuments;
        if (
            Array.isArray(contextDocsUnknown) &&
            typeof params.documentKey === "string"
        ) {
            let matchedContextForKeys: ContextForDocument | null | undefined = undefined;
            for (let docIdx = 0; docIdx < contextDocsUnknown.length; docIdx++) {
                const docRow: ContextForDocument = contextDocsUnknown[docIdx];
                if (docRow.document_key === params.documentKey) {
                    matchedContextForKeys = docRow;
                    break;
                }
            }
            if (matchedContextForKeys !== undefined) {
                const templateKeys: string[] = Object.keys(
                    matchedContextForKeys.content_to_include,
                );
                const missingKeys: string[] = [];
                for (let keyIdx = 0; keyIdx < templateKeys.length; keyIdx++) {
                    const templateKey: string = templateKeys[keyIdx];
                    if (!(templateKey in parsedContent)) {
                        missingKeys.push(templateKey);
                    }
                }
                if (missingKeys.length > 0) {
                    shouldContinue = true;
                }
            }
        }
    }

    const result: DetermineContinuationResult = { shouldContinue };
    return result;
}
