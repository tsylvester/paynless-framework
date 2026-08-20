import { assert, assertEquals } from "jsr:@std/assert";
import { FinalizeContributionJobDocumentRelatedError } from "./finalizeContributionJob.interface.ts";
import type {
	FinalizeContributionJobDeps,
	FinalizeContributionJobParams,
	FinalizeContributionJobPayload,
	FinalizeContributionJobSuccessReturn,
	FinalizeContributionJobErrorReturn,
	FinalizeContributionJobReturn,
	FinalizeContributionJobFn,
	BoundFinalizeContributionJobFn,
	FinalizeContributionJobDocumentRelatedErrorConstructorParams,
	FinalizeContributionJobRenderDispatchErrorConstructorParams,
	FinalizeContributionJobPromptLinkErrorConstructorParams,
	FinalizeContributionJobDocumentKeyErrorConstructorParams,
	FinalizeContributionJobContinuationErrorConstructorParams,
	FinalizeContributionJobCompletionUpdateErrorConstructorParams,
} from "./finalizeContributionJob.interface.ts";

/** Contract: FinalizeContributionJobDeps' required key surface is exactly logger, notificationService, fileManager, continueJob and enqueueRenderJob. */
Deno.test("FinalizeContributionJobDeps has the required surface", () => {
	const surface: Record<keyof FinalizeContributionJobDeps, true> = {
		logger: true,
		notificationService: true,
		fileManager: true,
		continueJob: true,
		enqueueRenderJob: true,
	};
	assertEquals(Object.keys(surface).length, 5);
});

/** Contract: FinalizeContributionJobParams' required key surface is exactly dbClient, job, contribution, assembledResponse, preparedContentResult, storageFileType and isContinuationForStorage. */
Deno.test("FinalizeContributionJobParams has the required surface", () => {
	const surface: Record<keyof FinalizeContributionJobParams, true> = {
		dbClient: true,
		job: true,
		contribution: true,
		assembledResponse: true,
		preparedContentResult: true,
		storageFileType: true,
		isContinuationForStorage: true,
	};
	assertEquals(Object.keys(surface).length, 7);
});

/** Contract: FinalizeContributionJobPayload's required key surface is exactly the twenty-nine keys of DialecticExecuteJobPayload. */
Deno.test("FinalizeContributionJobPayload has the required surface", () => {
	const surface: Record<keyof FinalizeContributionJobPayload, true> = {
		sessionId: true,
		projectId: true,
		stageSlug: true,
		iterationNumber: true,
		walletId: true,
		continueUntilComplete: true,
		maxRetries: true,
		continuation_count: true,
		target_contribution_id: true,
		user_jwt: true,
		is_test_job: true,
		model_slug: true,
		idempotencyKey: true,
		maxOutputTokens: true,
		model_id: true,
		sourceContributionId: true,
		source_prompt_resource_id: true,
		prompt_template_id: true,
		prompt_template_name: true,
		output_type: true,
		canonicalPathParams: true,
		inputs: true,
		document_key: true,
		branch_key: true,
		parallel_group: true,
		planner_metadata: true,
		document_relationships: true,
		isIntermediate: true,
		context_for_documents: true,
	};
	assertEquals(Object.keys(surface).length, 29);
});

/** Contract: FinalizeContributionJobSuccessReturn's required key surface is exactly status. */
Deno.test("FinalizeContributionJobSuccessReturn has the required surface", () => {
	const surface: Record<keyof FinalizeContributionJobSuccessReturn, true> = {
		status: true,
	};
	assertEquals(Object.keys(surface).length, 1);
});

/** Contract: FinalizeContributionJobErrorReturn's required key surface is exactly error and retriable. */
Deno.test("FinalizeContributionJobErrorReturn has the required surface", () => {
	const surface: Record<keyof FinalizeContributionJobErrorReturn, true> = {
		error: true,
		retriable: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: the error arm is a member of the return union, constructed with an owned error class. */
Deno.test("FinalizeContributionJobErrorReturn is a member of FinalizeContributionJobReturn", () => {
	const errorReturn: FinalizeContributionJobErrorReturn = {
		error: new FinalizeContributionJobDocumentRelatedError({ jobId: "job-1", contributionId: "contrib-1", stageSlug: "thesis" }),
		retriable: false,
	};
	const result: FinalizeContributionJobReturn = errorReturn;
	assert(result === errorReturn);
});

/** Contract: FinalizeContributionJobDocumentRelatedErrorConstructorParams' required key surface is exactly jobId, contributionId and stageSlug. */
Deno.test("FinalizeContributionJobDocumentRelatedErrorConstructorParams has the required surface", () => {
	const surface: Record<keyof FinalizeContributionJobDocumentRelatedErrorConstructorParams, true> = {
		jobId: true,
		contributionId: true,
		stageSlug: true,
	};
	assertEquals(Object.keys(surface).length, 3);
});

/** Contract: FinalizeContributionJobRenderDispatchErrorConstructorParams' required key surface is exactly jobId, contributionId and driverMessage. */
Deno.test("FinalizeContributionJobRenderDispatchErrorConstructorParams has the required surface", () => {
	const surface: Record<keyof FinalizeContributionJobRenderDispatchErrorConstructorParams, true> = {
		jobId: true,
		contributionId: true,
		driverMessage: true,
	};
	assertEquals(Object.keys(surface).length, 3);
});

/** Contract: FinalizeContributionJobPromptLinkErrorConstructorParams' required key surface is exactly jobId, contributionId, promptResourceId and driverMessage. */
Deno.test("FinalizeContributionJobPromptLinkErrorConstructorParams has the required surface", () => {
	const surface: Record<keyof FinalizeContributionJobPromptLinkErrorConstructorParams, true> = {
		jobId: true,
		contributionId: true,
		promptResourceId: true,
		driverMessage: true,
	};
	assertEquals(Object.keys(surface).length, 4);
});

/** Contract: FinalizeContributionJobDocumentKeyErrorConstructorParams' required key surface is exactly jobId and notificationType. */
Deno.test("FinalizeContributionJobDocumentKeyErrorConstructorParams has the required surface", () => {
	const surface: Record<keyof FinalizeContributionJobDocumentKeyErrorConstructorParams, true> = {
		jobId: true,
		notificationType: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: FinalizeContributionJobContinuationErrorConstructorParams' required key surface is exactly jobId and driverMessage. */
Deno.test("FinalizeContributionJobContinuationErrorConstructorParams has the required surface", () => {
	const surface: Record<keyof FinalizeContributionJobContinuationErrorConstructorParams, true> = {
		jobId: true,
		driverMessage: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: FinalizeContributionJobCompletionUpdateErrorConstructorParams' required key surface is exactly jobId and driverMessage. */
Deno.test("FinalizeContributionJobCompletionUpdateErrorConstructorParams has the required surface", () => {
	const surface: Record<keyof FinalizeContributionJobCompletionUpdateErrorConstructorParams, true> = {
		jobId: true,
		driverMessage: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: the function's declared Promise return admits its error arm. */
Deno.test("FinalizeContributionJobFn resolves to its declared return type", () => {
	const errorReturn: FinalizeContributionJobErrorReturn = {
		error: new FinalizeContributionJobDocumentRelatedError({ jobId: "job-1", contributionId: "contrib-1", stageSlug: "thesis" }),
		retriable: false,
	};
	const returned: ReturnType<FinalizeContributionJobFn> = Promise.resolve(errorReturn);
	const declared: Promise<FinalizeContributionJobReturn> = returned;
	assert(declared instanceof Promise);
});

/** Contract: BoundFinalizeContributionJobFn's declared Promise return admits its error arm, proving the bound signature is asynchronous. */
Deno.test("BoundFinalizeContributionJobFn resolves to its declared return type", () => {
	const errorReturn: FinalizeContributionJobErrorReturn = {
		error: new FinalizeContributionJobDocumentRelatedError({ jobId: "job-1", contributionId: "contrib-1", stageSlug: "thesis" }),
		retriable: false,
	};
	const returned: ReturnType<BoundFinalizeContributionJobFn> = Promise.resolve(errorReturn);
	const declared: Promise<FinalizeContributionJobReturn> = returned;
	assert(declared instanceof Promise);
});
