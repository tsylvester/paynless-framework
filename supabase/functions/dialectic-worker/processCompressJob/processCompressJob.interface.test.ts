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
import type { BoundPrepareModelJobFn } from "../prepareModelJob/prepareModelJob.interface.ts";

Deno.test(
    "ProcessCompressJobDeps declares five dependency keys",
    () => {
        const surface: Record<keyof ProcessCompressJobDeps, true> = {
            assembleCompressionPrompt: true,
            assembleContinuationPrompt: true,
            prepareModelJob: true,
            constructStoragePath: true,
            logger: true,
        };
        assertEquals(surface.assembleCompressionPrompt, true);
        assertEquals(surface.assembleContinuationPrompt, true);
        assertEquals(surface.prepareModelJob, true);
        assertEquals(surface.constructStoragePath, true);
        assertEquals(surface.logger, true);
    },
);

Deno.test(
    "ProcessCompressJobParams declares one field (dbClient only)",
    () => {
        const surface: Record<keyof ProcessCompressJobParams, true> = {
            dbClient: true,
        };
        assertEquals(surface.dbClient, true);
    },
);

Deno.test(
    "ProcessCompressJobPayload declares one field (job only)",
    () => {
        const surface: Record<keyof ProcessCompressJobPayload, true> = {
            job: true,
        };
        assertEquals(surface.job, true);
    },
);

Deno.test(
    "ProcessCompressJobDeps['prepareModelJob'] accepts a BoundPrepareModelJobFn value",
    () => {
        const compatible: BoundPrepareModelJobFn extends
            ProcessCompressJobDeps["prepareModelJob"] ? true : false = true;
        assertEquals(compatible, true);
    },
);

Deno.test(
    "ProcessCompressJobSuccessReturn queued boolean",
    () => {
        const r: ProcessCompressJobSuccessReturn = { queued: false };
        assertEquals(typeof r.queued, "boolean");
    },
);

Deno.test(
    "ProcessCompressJobErrorReturn has Error and retriable boolean",
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
    "ProcessCompressJobErrorReturn.error admits AssembleCompressionPromptError without conversion",
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
    "ProcessCompressJobReturn is a union of success and error",
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
    "ProcessCompressJobFn resolves to its declared success type",
    () => {
        const success: ProcessCompressJobSuccessReturn = { queued: true };
        const returned: ReturnType<ProcessCompressJobFn> = Promise.resolve(success);
        const declared: Promise<ProcessCompressJobReturn> = returned;
        assertEquals(declared instanceof Promise, true);
    },
);

Deno.test(
    "ProcessCompressJobFn resolves to its declared error type",
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
    "BoundProcessCompressJobFn resolves to its declared success type",
    () => {
        const success: ProcessCompressJobSuccessReturn = { queued: true };
        const returned: ReturnType<BoundProcessCompressJobFn> = Promise.resolve(success);
        const declared: Promise<ProcessCompressJobReturn> = returned;
        assertEquals(declared instanceof Promise, true);
    },
);

Deno.test(
    "BoundProcessCompressJobFn resolves to its declared error type",
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
