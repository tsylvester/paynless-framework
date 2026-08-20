import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    BoundProcessCompressJobFn,
    ProcessCompressJobDeps,
    ProcessCompressJobErrorReturn,
    ProcessCompressJobFn,
    ProcessCompressJobParams,
    ProcessCompressJobPayload,
    ProcessCompressJobReturn,
    ProcessCompressJobSuccessReturn,
} from "./processCompressJob.interface.ts";
import type { AssembleCompressionPromptError } from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.interface.ts";
import type { FileManagerError } from "../../_shared/types/file_manager.types.ts";

Deno.test(
    "Contract: ProcessCompressJobDeps declares eight dependency keys",
    () => {
        const surface: Record<keyof ProcessCompressJobDeps, true> = {
            assembleCompressionPrompt: true,
            assembleContinuationPrompt: true,
            enqueueModelCall: true,
            countTokens: true,
            getEncoding: true,
            countTokensAnthropic: true,
            constructStoragePath: true,
            logger: true,
        };
        assertEquals(Object.keys(surface).length, 8);
    },
);

Deno.test(
    "Contract: ProcessCompressJobParams declares four fields",
    () => {
        const surface: Record<keyof ProcessCompressJobParams, true> = {
            dbClient: true,
            job: true,
            projectOwnerUserId: true,
            authToken: true,
        };
        assertEquals(Object.keys(surface).length, 4);
    },
);

Deno.test(
    "Contract: ProcessCompressJobPayload has the required surface",
    () => {
        const surface: Record<keyof ProcessCompressJobPayload, true> = {
            job_type: true,
            sessionId: true,
            projectId: true,
            stageSlug: true,
            output_type: true,
            iterationNumber: true,
            model_id: true,
            model_slug: true,
            mode: true,
            content: true,
            sourceType: true,
            sourceId: true,
            role: true,
            documentKey: true,
            docType: true,
            sourceStageSlug: true,
            chunk_index: true,
            chunk_total: true,
            continuation_count: true,
            source_prompt_resource_id: true,
            walletId: true,
            user_id: true,
        };
        assertEquals(Object.keys(surface).length, 22);
    },
);

Deno.test(
    "Contract: ProcessCompressJobSuccessReturn queued boolean",
    () => {
        const r: ProcessCompressJobSuccessReturn = { queued: false };
        assertEquals(typeof r.queued, "boolean");
    },
);

Deno.test(
    "Contract: ProcessCompressJobErrorReturn has Error and retriable boolean",
    () => {
        const err: ProcessCompressJobErrorReturn = {
            error: new Error("x"),
            retriable: false,
        };
        assertEquals(err.error instanceof Error, true);
        assertEquals(typeof err.retriable, "boolean");
    },
);

Deno.test(
    "Contract: ProcessCompressJobErrorReturn.error admits AssembleCompressionPromptError without conversion",
    () => {
        const fileManagerError: FileManagerError = {
            message: "storage failure",
            statusCode: "500",
        };
        const assembleError: AssembleCompressionPromptError = fileManagerError;
        const err: ProcessCompressJobErrorReturn = {
            error: assembleError,
            retriable: true,
        };
        assertEquals(typeof err.error, "object");
        assertEquals(typeof err.retriable, "boolean");
    },
);

Deno.test(
    "Contract: ProcessCompressJobReturn is a union of success and error",
    () => {
        const ok: ProcessCompressJobSuccessReturn = { queued: true };
        const unionOk: ProcessCompressJobReturn = ok;
        assertEquals("queued" in unionOk, true);

        const err: ProcessCompressJobErrorReturn = {
            error: new Error("x"),
            retriable: true,
        };
        const unionErr: ProcessCompressJobReturn = err;
        assertEquals("error" in unionErr, true);
    },
);

Deno.test(
    "Contract: ProcessCompressJobFn resolves to its declared success type",
    () => {
        const success: ProcessCompressJobSuccessReturn = { queued: true };
        const returned: ReturnType<ProcessCompressJobFn> = Promise.resolve(success);
        const declared: Promise<ProcessCompressJobReturn> = returned;
        assertEquals(declared instanceof Promise, true);
    },
);

Deno.test(
    "Contract: ProcessCompressJobFn resolves to its declared error type",
    () => {
        const error: ProcessCompressJobErrorReturn = {
            error: new Error("x"),
            retriable: false,
        };
        const returned: ReturnType<ProcessCompressJobFn> = Promise.resolve(error);
        const declared: Promise<ProcessCompressJobReturn> = returned;
        assertEquals(declared instanceof Promise, true);
    },
);

Deno.test(
    "Contract: BoundProcessCompressJobFn resolves to its declared success type",
    () => {
        const success: ProcessCompressJobSuccessReturn = { queued: true };
        const returned: ReturnType<BoundProcessCompressJobFn> = Promise.resolve(success);
        const declared: Promise<ProcessCompressJobReturn> = returned;
        assertEquals(declared instanceof Promise, true);
    },
);

Deno.test(
    "Contract: BoundProcessCompressJobFn resolves to its declared error type",
    () => {
        const error: ProcessCompressJobErrorReturn = {
            error: new Error("x"),
            retriable: false,
        };
        const returned: ReturnType<BoundProcessCompressJobFn> = Promise.resolve(error);
        const declared: Promise<ProcessCompressJobReturn> = returned;
        assertEquals(declared instanceof Promise, true);
    },
);
