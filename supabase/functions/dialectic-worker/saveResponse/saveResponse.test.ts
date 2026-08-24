import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { BoundLoadJobContextFn } from "../loadJobContext/loadJobContext.interface.ts";
import type { BoundAssembleAiResponseFn } from "../assembleAiResponse/assembleAiResponse.interface.ts";
import type { BoundDebitForResponseFn } from "../debitForResponse/debitForResponse.interface.ts";
import type { BoundPrepareResponseContentFn } from "../prepareResponseContent/prepareResponseContent.interface.ts";
import type { BoundSaveContributionResponseFn } from "../saveContributionResponse/saveContributionResponse.interface.ts";
import type { BoundSaveCompressedResponseFn } from "../saveCompressedResponse/saveCompressedResponse.interface.ts";
import type { BoundRetryJobFn } from "../retryJob/retryJob.interface.ts";
import {
    buildDialecticJobRow,
    buildDialecticExecuteJobPayload,
    buildContextForDocument,
} from "../../_shared/dialectic.mock.ts";
import { buildDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import {
    buildLoadJobContextSuccessReturn,
    buildLoadJobContextErrorReturn,
} from "../loadJobContext/loadJobContext.mock.ts";
import {
    buildAssembleAiResponseSuccessReturn,
    buildAssembleAiResponseErrorReturn,
} from "../assembleAiResponse/assembleAiResponse.mock.ts";
import {
    buildDebitForResponseSuccessReturn,
    buildDebitForResponseErrorReturn,
} from "../debitForResponse/debitForResponse.mock.ts";
import {
    buildPrepareResponseContentPreparedReturn,
    buildPrepareResponseContentRetryRequiredReturn,
    buildPrepareResponseContentErrorReturn,
} from "../prepareResponseContent/prepareResponseContent.mock.ts";
import {
    buildSaveContributionResponseSuccessReturn,
    buildSaveContributionResponseErrorReturn,
} from "../saveContributionResponse/saveContributionResponse.mock.ts";
import {
    buildSaveCompressedResponseSuccessReturn,
    buildSaveCompressedResponseErrorReturn,
} from "../saveCompressedResponse/saveCompressedResponse.mock.ts";
import { buildRetryJobNotifiedReturn } from "../retryJob/retryJob.mock.ts";
import { saveResponse } from "./saveResponse.ts";
import {
    buildSaveResponseDeps,
    buildSaveResponseParams,
    buildSaveResponsePayload,
} from "./saveResponse.mock.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";

// --- loadJobContext fails ---

/**
 * Contract: loadJobContext returning its error arm propagates that error
 *   unchanged on this module's error arm, and assembleAiResponse is not called.
 * Arrange: a loadJobContext stub returning a distinct error arm; an
 *   assembleAiResponse spy that should not be called.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error is the same reference as the
 *   loadJobContext error's error and whose retriable matches; assembleAiResponse
 *   was not called.
 * Boundary: loadJobContext — the bound context-loading collaborator.
 * Mocked: buildLoadJobContextErrorReturn, buildSaveResponseDeps,
 *   buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("loadJobContext fails: propagates the error arm unchanged and assembleAiResponse is not called", async () => {
    // Arrange
    const ctxError = buildLoadJobContextErrorReturn({
        error: new Error("load-context-fail-distinct"),
        retriable: true,
    });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxError;
    const assembleAiResponseStub: BoundAssembleAiResponseFn = () =>
        buildAssembleAiResponseSuccessReturn();
    const assembleAiResponseSpy = spy(assembleAiResponseStub);
    const deps = buildSaveResponseDeps({
        loadJobContext,
        assembleAiResponse: assembleAiResponseSpy,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assert(result.error === ctxError.error);
        assertEquals(result.retriable, ctxError.retriable);
    }
    assertEquals(assembleAiResponseSpy.calls.length, 0);
});

// --- job_type is unknown ---

/**
 * Contract: a job whose job_type is neither EXECUTE nor COMPRESS returns the
 *   error arm with a message naming the unknown job_type, retriable false, and
 *   assembleAiResponse, debitForResponse, and prepareResponseContent are all
 *   uncalled.
 * Arrange: a loadJobContext stub returning a success whose job row has
 *   job_type 'PLAN'; spies on assembleAiResponse, debitForResponse, and
 *   prepareResponseContent that should not be called.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error message contains the
 *   job_type 'PLAN'; retriable is false; assembleAiResponse, debitForResponse,
 *   and prepareResponseContent were not called.
 * Boundary: the job_type exhaustiveness check — no collaborator is called.
 * Mocked: buildDialecticJobRow, buildLoadJobContextSuccessReturn,
 *   buildAssembleAiResponseSuccessReturn, buildDebitForResponseSuccessReturn,
 *   buildPrepareResponseContentPreparedReturn, buildSaveResponseDeps,
 *   buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("job_type unknown: returns error arm with the job_type in the message, retriable false, and no collaborator after loadJobContext is called", async () => {
    // Arrange
    const jobRow = buildDialecticJobRow({
        job_type: "PLAN",
        payload: {},
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const assembleAiResponseStub: BoundAssembleAiResponseFn = () =>
        buildAssembleAiResponseSuccessReturn();
    const assembleAiResponseSpy = spy(assembleAiResponseStub);
    const debitForResponseStub: BoundDebitForResponseFn = async () =>
        buildDebitForResponseSuccessReturn();
    const debitForResponseSpy = spy(debitForResponseStub);
    const prepareResponseContentStub: BoundPrepareResponseContentFn = () =>
        buildPrepareResponseContentPreparedReturn();
    const prepareResponseContentSpy = spy(prepareResponseContentStub);
    const deps = buildSaveResponseDeps({
        loadJobContext,
        assembleAiResponse: assembleAiResponseSpy,
        debitForResponse: debitForResponseSpy,
        prepareResponseContent: prepareResponseContentSpy,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
    assertEquals(assembleAiResponseSpy.calls.length, 0);
    assertEquals(debitForResponseSpy.calls.length, 0);
    assertEquals(prepareResponseContentSpy.calls.length, 0);
});

// --- job_type is EXECUTE, the payload guard throws ---

/**
 * Contract: an EXECUTE job whose payload fails isDialecticExecuteJobPayload
 *   returns the error arm carrying the thrown Error unchanged, retriable false,
 *   and no collaborator after loadJobContext is called.
 * Arrange: a loadJobContext stub returning a success whose job row has
 *   job_type 'EXECUTE' and payload null (makes the guard throw); spies on
 *   assembleAiResponse, debitForResponse, and prepareResponseContent.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error message is the guard's
 *   thrown message; retriable is false; assembleAiResponse, debitForResponse,
 *   and prepareResponseContent were not called.
 * Boundary: the EXECUTE arm's payload-proving guard, called inside a try.
 * Mocked: buildDialecticJobRow, buildLoadJobContextSuccessReturn,
 *   buildAssembleAiResponseSuccessReturn, buildDebitForResponseSuccessReturn,
 *   buildPrepareResponseContentPreparedReturn, buildSaveResponseDeps,
 *   buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("EXECUTE payload guard throws: returns the error arm with the thrown message, retriable false, and no collaborator after loadJobContext is called", async () => {
    // Arrange
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: null,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const assembleAiResponseStub: BoundAssembleAiResponseFn = () =>
        buildAssembleAiResponseSuccessReturn();
    const assembleAiResponseSpy = spy(assembleAiResponseStub);
    const debitForResponseStub: BoundDebitForResponseFn = async () =>
        buildDebitForResponseSuccessReturn();
    const debitForResponseSpy = spy(debitForResponseStub);
    const prepareResponseContentStub: BoundPrepareResponseContentFn = () =>
        buildPrepareResponseContentPreparedReturn();
    const prepareResponseContentSpy = spy(prepareResponseContentStub);
    const deps = buildSaveResponseDeps({
        loadJobContext,
        assembleAiResponse: assembleAiResponseSpy,
        debitForResponse: debitForResponseSpy,
        prepareResponseContent: prepareResponseContentSpy,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
    assertEquals(assembleAiResponseSpy.calls.length, 0);
    assertEquals(debitForResponseSpy.calls.length, 0);
    assertEquals(prepareResponseContentSpy.calls.length, 0);
});

// --- job_type is COMPRESS, the payload guard throws ---

/**
 * Contract: a COMPRESS job whose payload fails isDialecticCompressJobPayload
 *   returns the error arm carrying the thrown Error unchanged, retriable false,
 *   and no collaborator after loadJobContext is called.
 * Arrange: a loadJobContext stub returning a success whose job row has
 *   job_type 'COMPRESS' and payload null (makes the guard throw); spies on
 *   assembleAiResponse, debitForResponse, and prepareResponseContent.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error message is the guard's
 *   thrown message; retriable is false; assembleAiResponse, debitForResponse,
 *   and prepareResponseContent were not called.
 * Boundary: the COMPRESS arm's payload-proving guard, called inside a try.
 * Mocked: buildDialecticJobRow, buildLoadJobContextSuccessReturn,
 *   buildAssembleAiResponseSuccessReturn, buildDebitForResponseSuccessReturn,
 *   buildPrepareResponseContentPreparedReturn, buildSaveResponseDeps,
 *   buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("COMPRESS payload guard throws: returns the error arm with the thrown message, retriable false, and no collaborator after loadJobContext is called", async () => {
    // Arrange
    const jobRow = buildDialecticJobRow({
        job_type: "COMPRESS",
        payload: null,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const assembleAiResponseStub: BoundAssembleAiResponseFn = () =>
        buildAssembleAiResponseSuccessReturn();
    const assembleAiResponseSpy = spy(assembleAiResponseStub);
    const debitForResponseStub: BoundDebitForResponseFn = async () =>
        buildDebitForResponseSuccessReturn();
    const debitForResponseSpy = spy(debitForResponseStub);
    const prepareResponseContentStub: BoundPrepareResponseContentFn = () =>
        buildPrepareResponseContentPreparedReturn();
    const prepareResponseContentSpy = spy(prepareResponseContentStub);
    const deps = buildSaveResponseDeps({
        loadJobContext,
        assembleAiResponse: assembleAiResponseSpy,
        debitForResponse: debitForResponseSpy,
        prepareResponseContent: prepareResponseContentSpy,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
    assertEquals(assembleAiResponseSpy.calls.length, 0);
    assertEquals(debitForResponseSpy.calls.length, 0);
    assertEquals(prepareResponseContentSpy.calls.length, 0);
});

// --- job_type is COMPRESS, content is not parseable JSON ---

/**
 * Contract: a COMPRESS job whose proven payload's content is not parseable
 *   JSON returns the error arm, retriable false.
 * Arrange: a loadJobContext stub returning a success whose job row has
 *   job_type 'COMPRESS' and a valid DialecticCompressJobPayload whose content
 *   is malformed JSON.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm; retriable is false.
 * Boundary: the COMPRESS arm's content parse, inside a try.
 * Mocked: buildDialecticJobRow, buildDialecticCompressJobPayload,
 *   buildLoadJobContextSuccessReturn, buildSaveResponseDeps,
 *   buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("COMPRESS content not parseable: returns the error arm, retriable false", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload({
        content: "{",
    });
    if(!isJson(compressPayload)) {
        throw new Error("Content is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "COMPRESS",
        payload: compressPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const deps = buildSaveResponseDeps({ loadJobContext });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
});

// --- job_type is COMPRESS, parsed content fails isContentToInclude ---

/**
 * Contract: a COMPRESS job whose proven payload's content parses to a value
 *   that fails isContentToInclude returns the error arm, retriable false.
 * Arrange: a loadJobContext stub returning a success whose job row has
 *   job_type 'COMPRESS' and a valid DialecticCompressJobPayload whose content
 *   parses to a number (not a ContentToInclude record).
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm; retriable is false.
 * Boundary: the COMPRESS arm's isContentToInclude guard on the parsed content.
 * Mocked: buildDialecticJobRow, buildDialecticCompressJobPayload,
 *   buildLoadJobContextSuccessReturn, buildSaveResponseDeps,
 *   buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("COMPRESS content fails isContentToInclude: returns the error arm, retriable false", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload({
        content: "42",
    });
    if(!isJson(compressPayload)) {
        throw new Error("Content is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "COMPRESS",
        payload: compressPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const deps = buildSaveResponseDeps({ loadJobContext });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
});

// --- assembleAiResponse fails ---

/**
 * Contract: assembleAiResponse returning its error arm propagates that error
 *   unchanged on this module's error arm.
 * Arrange: a loadJobContext stub returning a success with an EXECUTE job row;
 *   an assembleAiResponse stub returning a distinct error arm.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error is the same reference as the
 *   assembleAiResponse error's error and whose retriable matches.
 * Boundary: assembleAiResponse — the bound assembly collaborator.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildLoadJobContextSuccessReturn, buildAssembleAiResponseErrorReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("assembleAiResponse fails: propagates the error arm unchanged", async () => {
    // Arrange
    const testPayload = buildDialecticExecuteJobPayload();
    if(!isJson(testPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: testPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const assembleError = buildAssembleAiResponseErrorReturn({
        retriable: true,
    });
    const assembleAiResponse: BoundAssembleAiResponseFn = () => assembleError;
    const deps = buildSaveResponseDeps({ loadJobContext, assembleAiResponse });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assert(result.error === assembleError.error);
        assertEquals(result.retriable, assembleError.retriable);
    }
});

// --- debitForResponse fails ---

/**
 * Contract: debitForResponse returning its error arm propagates that error
 *   unchanged on this module's error arm.
 * Arrange: a loadJobContext stub returning a success with an EXECUTE job row;
 *   a debitForResponse stub returning a distinct error arm.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error is the same reference as the
 *   debitForResponse error's error and whose retriable matches.
 * Boundary: debitForResponse — the bound debit collaborator.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildLoadJobContextSuccessReturn, buildDebitForResponseErrorReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("debitForResponse fails: propagates the error arm unchanged", async () => {
    // Arrange
    const testPayload = buildDialecticExecuteJobPayload();
    if(!isJson(testPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: testPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const debitError = buildDebitForResponseErrorReturn({
        error: new Error("debit-fail-distinct"),
        retriable: true,
    });
    const debitForResponse: BoundDebitForResponseFn = async () => debitError;
    const deps = buildSaveResponseDeps({ loadJobContext, debitForResponse });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assert(result.error === debitError.error);
        assertEquals(result.retriable, debitError.retriable);
    }
});

// --- prepareResponseContent returns retry-required ---

/**
 * Contract: prepareResponseContent returning retryRequired true dispatches
 *   retryJob and returns the success arm with status 'completed'.
 * Arrange: a loadJobContext stub returning a success with an EXECUTE job row;
 *   a prepareResponseContent stub returning retryRequired true with a distinct
 *   reason; a retryJob spy.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: retryJob was called exactly once; the result is the success arm with
 *   status 'completed'.
 * Boundary: prepareResponseContent — the retry-required discriminant.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildLoadJobContextSuccessReturn, buildPrepareResponseContentRetryRequiredReturn,
 *   buildRetryJobNotifiedReturn, buildSaveResponseDeps, buildSaveResponseParams,
 *   buildSaveResponsePayload.
 */
Deno.test("prepareResponseContent retry-required: dispatches retryJob and returns status completed", async () => {
    // Arrange
    const testPayload = buildDialecticExecuteJobPayload();
    if(!isJson(testPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: testPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const retryRequired = buildPrepareResponseContentRetryRequiredReturn({
        reason: "retry-reason-distinct",
    });
    const prepareResponseContent: BoundPrepareResponseContentFn = () =>
        retryRequired;
    const retryJobStub: BoundRetryJobFn = async () =>
        buildRetryJobNotifiedReturn();
    const retryJobSpy = spy(retryJobStub);
    const deps = buildSaveResponseDeps({
        loadJobContext,
        prepareResponseContent,
        retryJob: retryJobSpy,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals(retryJobSpy.calls.length, 1);
    assertEquals("status" in result, true);
    if ("status" in result) {
        assertEquals(result.status, "completed");
    }
});

// --- prepareResponseContent returns error ---

/**
 * Contract: prepareResponseContent returning its error arm propagates that
 *   error unchanged on this module's error arm.
 * Arrange: a loadJobContext stub returning a success with an EXECUTE job row;
 *   a prepareResponseContent stub returning a distinct error arm.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error is the same reference as the
 *   prepareResponseContent error's error and whose retriable matches.
 * Boundary: prepareResponseContent — the bound preparation collaborator.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildLoadJobContextSuccessReturn, buildPrepareResponseContentErrorReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("prepareResponseContent error: propagates the error arm unchanged", async () => {
    // Arrange
    const testPayload = buildDialecticExecuteJobPayload();
    if(!isJson(testPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: testPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const prepareError = buildPrepareResponseContentErrorReturn({
        retriable: true,
    });
    const prepareResponseContent: BoundPrepareResponseContentFn = () =>
        prepareError;
    const deps = buildSaveResponseDeps({
        loadJobContext,
        prepareResponseContent,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assert(result.error === prepareError.error);
        assertEquals(result.retriable, prepareError.retriable);
    }
});

// --- job_type is EXECUTE, saveContributionResponse fails ---

/**
 * Contract: saveContributionResponse returning its error arm propagates that
 *   error unchanged on this module's error arm.
 * Arrange: a loadJobContext stub returning a success with an EXECUTE job row;
 *   a saveContributionResponse stub returning a distinct error arm.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error is the same reference as the
 *   saveContributionResponse error's error and whose retriable matches.
 * Boundary: saveContributionResponse — the bound contribution-saving
 *   collaborator.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildLoadJobContextSuccessReturn, buildSaveContributionResponseErrorReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("EXECUTE saveContributionResponse fails: propagates the error arm unchanged", async () => {
    // Arrange
    const testPayload = buildDialecticExecuteJobPayload();
    if(!isJson(testPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: testPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const contributionError = buildSaveContributionResponseErrorReturn({
        error: new Error("contribution-fail-distinct"),
        retriable: true,
    });
    const saveContributionResponse: BoundSaveContributionResponseFn = async () =>
        contributionError;
    const deps = buildSaveResponseDeps({
        loadJobContext,
        saveContributionResponse,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assert(result.error === contributionError.error);
        assertEquals(result.retriable, contributionError.retriable);
    }
});

// --- job_type is EXECUTE, saveContributionResponse returns completed ---

/**
 * Contract: saveContributionResponse returning { status: 'completed' } on an
 *   EXECUTE job forwards that status on the success arm, saveCompressedResponse
 *   is not called, and retryJob is not called.
 * Arrange: a loadJobContext stub returning a success with an EXECUTE job row;
 *   a saveContributionResponse stub returning status 'completed'; spies on
 *   saveCompressedResponse and retryJob.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'completed';
 *   saveCompressedResponse was not called; retryJob was not called.
 * Boundary: saveContributionResponse — the bound contribution-saving
 *   collaborator whose status is forwarded.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildLoadJobContextSuccessReturn, buildSaveContributionResponseSuccessReturn,
 *   buildSaveCompressedResponseSuccessReturn, buildRetryJobNotifiedReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("EXECUTE saveContributionResponse completed: forwards status, saveCompressedResponse and retryJob uncalled", async () => {
    // Arrange
    const testPayload = buildDialecticExecuteJobPayload();
    if(!isJson(testPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: testPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const saveContributionResponse: BoundSaveContributionResponseFn = async () =>
        buildSaveContributionResponseSuccessReturn({ status: "completed" });
    const saveCompressedResponseStub: BoundSaveCompressedResponseFn = async () =>
        buildSaveCompressedResponseSuccessReturn();
    const saveCompressedResponseSpy = spy(saveCompressedResponseStub);
    const retryJobStub: BoundRetryJobFn = async () =>
        buildRetryJobNotifiedReturn();
    const retryJobSpy = spy(retryJobStub);
    const deps = buildSaveResponseDeps({
        loadJobContext,
        saveContributionResponse,
        saveCompressedResponse: saveCompressedResponseSpy,
        retryJob: retryJobSpy,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("status" in result, true);
    if ("status" in result) {
        assertEquals(result.status, "completed");
    }
    assertEquals(saveCompressedResponseSpy.calls.length, 0);
    assertEquals(retryJobSpy.calls.length, 0);
});

// --- job_type is EXECUTE, saveContributionResponse returns needs_continuation ---

/**
 * Contract: saveContributionResponse returning { status: 'needs_continuation' }
 *   on an EXECUTE job forwards that status on the success arm.
 * Arrange: a loadJobContext stub returning a success with an EXECUTE job row;
 *   a saveContributionResponse stub returning status 'needs_continuation'.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'needs_continuation'.
 * Boundary: saveContributionResponse — the bound contribution-saving
 *   collaborator whose status is forwarded.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildLoadJobContextSuccessReturn, buildSaveContributionResponseSuccessReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("EXECUTE saveContributionResponse needs_continuation: forwards status", async () => {
    // Arrange
    const testPayload = buildDialecticExecuteJobPayload();
    if(!isJson(testPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: testPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const saveContributionResponse: BoundSaveContributionResponseFn = async () =>
        buildSaveContributionResponseSuccessReturn({
            status: "needs_continuation",
        });
    const deps = buildSaveResponseDeps({
        loadJobContext,
        saveContributionResponse,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("status" in result, true);
    if ("status" in result) {
        assertEquals(result.status, "needs_continuation");
    }
});

// --- job_type is EXECUTE, saveContributionResponse returns continuation_limit_reached ---

/**
 * Contract: saveContributionResponse returning
 *   { status: 'continuation_limit_reached' } on an EXECUTE job forwards that
 *   status on the success arm.
 * Arrange: a loadJobContext stub returning a success with an EXECUTE job row;
 *   a saveContributionResponse stub returning status
 *   'continuation_limit_reached'.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status
 *   'continuation_limit_reached'.
 * Boundary: saveContributionResponse — the bound contribution-saving
 *   collaborator whose status is forwarded.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildLoadJobContextSuccessReturn, buildSaveContributionResponseSuccessReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("EXECUTE saveContributionResponse continuation_limit_reached: forwards status", async () => {
    // Arrange
    const testPayload = buildDialecticExecuteJobPayload();
    if(!isJson(testPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: testPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const saveContributionResponse: BoundSaveContributionResponseFn = async () =>
        buildSaveContributionResponseSuccessReturn({
            status: "continuation_limit_reached",
        });
    const deps = buildSaveResponseDeps({
        loadJobContext,
        saveContributionResponse,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("status" in result, true);
    if ("status" in result) {
        assertEquals(result.status, "continuation_limit_reached");
    }
});

// --- job_type is COMPRESS, saveCompressedResponse fails ---

/**
 * Contract: saveCompressedResponse returning its error arm propagates that
 *   error unchanged on this module's error arm.
 * Arrange: a loadJobContext stub returning a success with a COMPRESS job row
 *   whose payload's content is valid JSON passing isContentToInclude; a
 *   saveCompressedResponse stub returning a distinct error arm.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error is the same reference as the
 *   saveCompressedResponse error's error and whose retriable matches.
 * Boundary: saveCompressedResponse — the bound compressed-saving collaborator.
 * Mocked: buildDialecticJobRow, buildDialecticCompressJobPayload,
 *   buildLoadJobContextSuccessReturn, buildSaveCompressedResponseErrorReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("COMPRESS saveCompressedResponse fails: propagates the error arm unchanged", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload({
        content: '{"field":"value"}',
    });
    if(!isJson(compressPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "COMPRESS",
        payload: compressPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const compressedError = buildSaveCompressedResponseErrorReturn({
        error: new Error("compressed-fail-distinct"),
        retriable: true,
    });
    const saveCompressedResponse: BoundSaveCompressedResponseFn = async () =>
        compressedError;
    const deps = buildSaveResponseDeps({
        loadJobContext,
        saveCompressedResponse,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assert(result.error === compressedError.error);
        assertEquals(result.retriable, compressedError.retriable);
    }
});

// --- job_type is COMPRESS, saveCompressedResponse returns completed ---

/**
 * Contract: saveCompressedResponse returning { status: 'completed' } on a
 *   COMPRESS job forwards that status on the success arm, and
 *   saveContributionResponse is not called.
 * Arrange: a loadJobContext stub returning a success with a COMPRESS job row
 *   whose payload's content is valid JSON passing isContentToInclude; a
 *   saveCompressedResponse stub returning status 'completed'; a spy on
 *   saveContributionResponse.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'completed';
 *   saveContributionResponse was not called.
 * Boundary: saveCompressedResponse — the bound compressed-saving collaborator
 *   whose status is forwarded.
 * Mocked: buildDialecticJobRow, buildDialecticCompressJobPayload,
 *   buildLoadJobContextSuccessReturn, buildSaveCompressedResponseSuccessReturn,
 *   buildSaveContributionResponseSuccessReturn, buildSaveResponseDeps,
 *   buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("COMPRESS saveCompressedResponse completed: forwards status and saveContributionResponse uncalled", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload({
        content: '{"field":"value"}',
    });
    if(!isJson(compressPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "COMPRESS",
        payload: compressPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const saveCompressedResponse: BoundSaveCompressedResponseFn = async () =>
        buildSaveCompressedResponseSuccessReturn({ status: "completed" });
    const saveContributionResponseStub: BoundSaveContributionResponseFn =
        async () => buildSaveContributionResponseSuccessReturn();
    const saveContributionResponseSpy = spy(saveContributionResponseStub);
    const deps = buildSaveResponseDeps({
        loadJobContext,
        saveCompressedResponse,
        saveContributionResponse: saveContributionResponseSpy,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("status" in result, true);
    if ("status" in result) {
        assertEquals(result.status, "completed");
    }
    assertEquals(saveContributionResponseSpy.calls.length, 0);
});

// --- job_type is COMPRESS, saveCompressedResponse returns waiting_for_children ---

/**
 * Contract: saveCompressedResponse returning { status: 'waiting_for_children' }
 *   on a COMPRESS job forwards that status on the success arm.
 * Arrange: a loadJobContext stub returning a success with a COMPRESS job row
 *   whose payload's content is valid JSON passing isContentToInclude; a
 *   saveCompressedResponse stub returning status 'waiting_for_children'.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'waiting_for_children'.
 * Boundary: saveCompressedResponse — the bound compressed-saving collaborator
 *   whose status is forwarded.
 * Mocked: buildDialecticJobRow, buildDialecticCompressJobPayload,
 *   buildLoadJobContextSuccessReturn, buildSaveCompressedResponseSuccessReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("COMPRESS saveCompressedResponse waiting_for_children: forwards status", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload({
        content: '{"field":"value"}',
    });
    if(!isJson(compressPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "COMPRESS",
        payload: compressPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const saveCompressedResponse: BoundSaveCompressedResponseFn = async () =>
        buildSaveCompressedResponseSuccessReturn({
            status: "waiting_for_children",
        });
    const deps = buildSaveResponseDeps({
        loadJobContext,
        saveCompressedResponse,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("status" in result, true);
    if ("status" in result) {
        assertEquals(result.status, "waiting_for_children");
    }
});

// --- job_type is COMPRESS, saveCompressedResponse returns needs_continuation ---

/**
 * Contract: saveCompressedResponse returning { status: 'needs_continuation' }
 *   on a COMPRESS job forwards that status on the success arm.
 * Arrange: a loadJobContext stub returning a success with a COMPRESS job row
 *   whose payload's content is valid JSON passing isContentToInclude; a
 *   saveCompressedResponse stub returning status 'needs_continuation'.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'needs_continuation'.
 * Boundary: saveCompressedResponse — the bound compressed-saving collaborator
 *   whose status is forwarded.
 * Mocked: buildDialecticJobRow, buildDialecticCompressJobPayload,
 *   buildLoadJobContextSuccessReturn, buildSaveCompressedResponseSuccessReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("COMPRESS saveCompressedResponse needs_continuation: forwards status", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload({
        content: '{"field":"value"}',
    });
    if(!isJson(compressPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "COMPRESS",
        payload: compressPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const saveCompressedResponse: BoundSaveCompressedResponseFn = async () =>
        buildSaveCompressedResponseSuccessReturn({
            status: "needs_continuation",
        });
    const deps = buildSaveResponseDeps({
        loadJobContext,
        saveCompressedResponse,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    const result = await saveResponse(deps, params, payload);

    // Assert
    assertEquals("status" in result, true);
    if ("status" in result) {
        assertEquals(result.status, "needs_continuation");
    }
});

// --- assembleAiResponse receives preflightInputTokens from the proven payload ---

/**
 * Contract: assembleAiResponse receives preflightInputTokens equal to the
 *   proven job payload's preflight_input_tokens, asserted against an
 *   independent literal.
 * Arrange: a loadJobContext stub returning a success with an EXECUTE job row
 *   whose payload has preflight_input_tokens 999; an assembleAiResponse spy.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: assembleAiResponse was called; its params carry preflightInputTokens
 *   equal to 999.
 * Boundary: assembleAiResponse — the bound assembly collaborator whose params
 *   are composed by the orchestrator.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildLoadJobContextSuccessReturn, buildAssembleAiResponseSuccessReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("assembleAiResponse receives preflightInputTokens from the proven payload's preflight_input_tokens", async () => {
    // Arrange
    const executePayload = buildDialecticExecuteJobPayload({
        preflight_input_tokens: 999,
    });
    if(!isJson(executePayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: executePayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const assembleAiResponseStub: BoundAssembleAiResponseFn = () =>
        buildAssembleAiResponseSuccessReturn();
    const assembleAiResponseSpy = spy(assembleAiResponseStub);
    const deps = buildSaveResponseDeps({
        loadJobContext,
        assembleAiResponse: assembleAiResponseSpy,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    await saveResponse(deps, params, payload);

    // Assert
    assertEquals(assembleAiResponseSpy.calls.length, 1);
    const assembleParams = assembleAiResponseSpy.calls[0].args[0];
    assertEquals(assembleParams.preflightInputTokens, 999);
});

// --- payload with no preflight_input_tokens reaches assembleAiResponse with the member absent ---

/**
 * Contract: a proven payload with no preflight_input_tokens reaches
 *   assembleAiResponse with preflightInputTokens absent (undefined).
 * Arrange: a loadJobContext stub returning a success with an EXECUTE job row
 *   whose payload omits preflight_input_tokens; an assembleAiResponse spy.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: assembleAiResponse was called; its params carry no
 *   preflightInputTokens (undefined).
 * Boundary: assembleAiResponse — the bound assembly collaborator whose params
 *   are composed by the orchestrator.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildLoadJobContextSuccessReturn, buildAssembleAiResponseSuccessReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("no preflight_input_tokens: assembleAiResponse receives preflightInputTokens absent", async () => {
    // Arrange
    const executePayload = buildDialecticExecuteJobPayload();
    if(!isJson(executePayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: executePayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const assembleAiResponseStub: BoundAssembleAiResponseFn = () =>
        buildAssembleAiResponseSuccessReturn();
    const assembleAiResponseSpy = spy(assembleAiResponseStub);
    const deps = buildSaveResponseDeps({
        loadJobContext,
        assembleAiResponse: assembleAiResponseSpy,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    await saveResponse(deps, params, payload);

    // Assert
    assertEquals(assembleAiResponseSpy.calls.length, 1);
    const assembleParams = assembleAiResponseSpy.calls[0].args[0];
    assertEquals(assembleParams.preflightInputTokens, undefined);
});

// --- EXECUTE composes prepareParams ---

/**
 * Contract: the EXECUTE arm composes prepareParams with documentKey from the
 *   proven payload's document_key, contextForDocuments from
 *   context_for_documents, mode absent, and sourceObject undefined.
 * Arrange: a loadJobContext stub returning a success with an EXECUTE job row
 *   whose payload has distinct document_key and context_for_documents; a
 *   prepareResponseContent spy.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: prepareResponseContent was called; its params carry documentKey
 *   equal to the payload's document_key, contextForDocuments equal to the
 *   payload's context_for_documents, mode undefined, sourceObject undefined.
 * Boundary: prepareResponseContent — the bound preparation collaborator
 *   whose params are composed by the orchestrator.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildContextForDocument, buildLoadJobContextSuccessReturn,
 *   buildPrepareResponseContentPreparedReturn, buildSaveResponseDeps,
 *   buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("EXECUTE prepareParams: documentKey from document_key, contextForDocuments from context_for_documents, mode absent, sourceObject undefined", async () => {
    // Arrange
    const contextForDocs = [buildContextForDocument()];
    const executePayload = buildDialecticExecuteJobPayload({
        document_key: FileType.feature_spec,
        context_for_documents: contextForDocs,
    });
    if(!isJson(executePayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: executePayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const prepareResponseContentStub: BoundPrepareResponseContentFn = () =>
        buildPrepareResponseContentPreparedReturn();
    const prepareResponseContentSpy = spy(prepareResponseContentStub);
    const deps = buildSaveResponseDeps({
        loadJobContext,
        prepareResponseContent: prepareResponseContentSpy,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    await saveResponse(deps, params, payload);

    // Assert
    assertEquals(prepareResponseContentSpy.calls.length, 1);
    const prepareParams = prepareResponseContentSpy.calls[0].args[0];
    assertEquals(prepareParams.documentKey, FileType.feature_spec);
    assertEquals(prepareParams.contextForDocuments, contextForDocs);
    assertEquals(prepareParams.mode, undefined);
    assertEquals(prepareParams.sourceObject, undefined);
});

// --- COMPRESS composes prepareParams ---

/**
 * Contract: the COMPRESS arm composes prepareParams with documentKey from the
 *   proven payload's documentKey, mode from mode, contextForDocuments
 *   undefined, and sourceObject equal to the parsed content.
 * Arrange: a loadJobContext stub returning a success with a COMPRESS job row
 *   whose payload has distinct documentKey, mode, and content; a
 *   prepareResponseContent spy.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: prepareResponseContent was called; its params carry documentKey
 *   equal to the payload's documentKey, mode equal to the payload's mode,
 *   contextForDocuments undefined, sourceObject equal to the parsed content.
 * Boundary: prepareResponseContent — the bound preparation collaborator
 *   whose params are composed by the orchestrator.
 * Mocked: buildDialecticJobRow, buildDialecticCompressJobPayload,
 *   buildLoadJobContextSuccessReturn, buildPrepareResponseContentPreparedReturn,
 *   buildSaveResponseDeps, buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("COMPRESS prepareParams: documentKey from documentKey, mode from mode, contextForDocuments undefined, sourceObject parsed from content", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload({
        documentKey: FileType.business_case,
        mode: "text",
        content: '{"field":"value"}',
    });
    if(!isJson(compressPayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "COMPRESS",
        payload: compressPayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const prepareResponseContentStub: BoundPrepareResponseContentFn = () =>
        buildPrepareResponseContentPreparedReturn();
    const prepareResponseContentSpy = spy(prepareResponseContentStub);
    const deps = buildSaveResponseDeps({
        loadJobContext,
        prepareResponseContent: prepareResponseContentSpy,
    });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Act
    await saveResponse(deps, params, payload);

    // Assert
    assertEquals(prepareResponseContentSpy.calls.length, 1);
    const prepareParams = prepareResponseContentSpy.calls[0].args[0];
    assertEquals(prepareParams.documentKey, FileType.business_case);
    assertEquals(prepareParams.mode, "text");
    assertEquals(prepareParams.contextForDocuments, undefined);
    assertEquals(prepareParams.sourceObject, { field: "value" });
});

// --- neither params nor payload is mutated ---

/**
 * Contract: a successful invocation leaves params and payload deep-equal to
 *   their pre-call snapshots — no field is mutated on any path.
 * Arrange: a full happy-path arrangement with an EXECUTE job row; deep
 *   snapshots of the payload taken before the call.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the payload is deep-equal to its pre-call snapshot; params.job_id
 *   is unchanged.
 * Boundary: the function's own params and payload slots — proven not mutated.
 * Mocked: buildDialecticJobRow, buildDialecticExecuteJobPayload,
 *   buildLoadJobContextSuccessReturn, buildSaveResponseDeps,
 *   buildSaveResponseParams, buildSaveResponsePayload.
 */
Deno.test("no mutation: a successful invocation leaves params and payload deep-equal to their pre-call snapshots", async () => {
    // Arrange — full happy path
    const executePayload = buildDialecticExecuteJobPayload();
    if(!isJson(executePayload)) {
        throw new Error("Payload is not valid JSON");
    }
    const jobRow = buildDialecticJobRow({
        job_type: "EXECUTE",
        payload: executePayload,
    });
    const ctxSuccess = buildLoadJobContextSuccessReturn({ job: jobRow });
    const loadJobContext: BoundLoadJobContextFn = async () => ctxSuccess;
    const deps = buildSaveResponseDeps({ loadJobContext });
    const params = buildSaveResponseParams();
    const payload = buildSaveResponsePayload();

    // Snapshot — deep-clone the payload (plain object, fully cloneable)
    const payloadSnapshot = structuredClone(payload);
    const jobIdSnapshot = params.job_id;

    // Act
    await saveResponse(deps, params, payload);

    // Assert — no mutation
    assertEquals(payload, payloadSnapshot);
    assertEquals(params.job_id, jobIdSnapshot);
});
