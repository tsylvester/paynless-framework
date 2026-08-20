import { assert, assertEquals } from "jsr:@std/assert";
import type {
	PersistContributionRelationshipsDeps,
	PersistContributionRelationshipsParams,
	PersistContributionRelationshipsPayload,
	PersistContributionRelationshipsPersistedReturn,
	PersistContributionRelationshipsUnchangedReturn,
	PersistContributionRelationshipsSuccessReturn,
	PersistContributionRelationshipsErrorReturn,
	PersistContributionRelationshipsReturn,
	PersistContributionRelationshipsFn,
	BoundPersistContributionRelationshipsFn,
	PersistContributionRelationshipsStageSlugMissingErrorConstructorParams,
	PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams,
	PersistContributionRelationshipsUpdateErrorConstructorParams,
	PersistContributionRelationshipsStageEntryErrorConstructorParams,
	PersistContributionRelationshipsStageSlugTypeErrorConstructorParams,
	PersistContributionRelationshipsMergedEntryErrorConstructorParams,
} from "./persistContributionRelationships.interface.ts";

/** Contract: PersistContributionRelationshipsDeps has an empty surface. */
Deno.test("PersistContributionRelationshipsDeps has the required surface", () => {
	const surface: Record<keyof PersistContributionRelationshipsDeps, true> = {};
	assertEquals(Object.keys(surface).length, 0);
});

/** Contract: PersistContributionRelationshipsParams requires exactly dbClient, job, contribution and isContinuationForStorage. */
Deno.test("PersistContributionRelationshipsParams has the required surface", () => {
	const surface: Record<keyof PersistContributionRelationshipsParams, true> = {
		dbClient: true,
		job: true,
		contribution: true,
		isContinuationForStorage: true,
	};
	assertEquals(Object.keys(surface).length, 4);
});

/** Contract: PersistContributionRelationshipsPayload requires exactly the twenty-nine keys of DialecticExecuteJobPayload. */
Deno.test("PersistContributionRelationshipsPayload has the required surface", () => {
	const surface: Record<keyof PersistContributionRelationshipsPayload, true> = {
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

/** Contract: PersistContributionRelationshipsPersistedReturn requires exactly persisted and contribution. */
Deno.test("PersistContributionRelationshipsPersistedReturn has the required surface", () => {
	const surface: Record<
		keyof PersistContributionRelationshipsPersistedReturn,
		true
	> = {
		persisted: true,
		contribution: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: PersistContributionRelationshipsUnchangedReturn requires exactly persisted and contribution. */
Deno.test("PersistContributionRelationshipsUnchangedReturn has the required surface", () => {
	const surface: Record<
		keyof PersistContributionRelationshipsUnchangedReturn,
		true
	> = {
		persisted: true,
		contribution: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: PersistContributionRelationshipsSuccessReturn requires exactly persisted and contribution. */
Deno.test("PersistContributionRelationshipsSuccessReturn has the required surface", () => {
	const surface: Record<
		keyof PersistContributionRelationshipsSuccessReturn,
		true
	> = {
		persisted: true,
		contribution: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: PersistContributionRelationshipsErrorReturn requires exactly error and retriable. */
Deno.test("PersistContributionRelationshipsErrorReturn has the required surface", () => {
	const surface: Record<
		keyof PersistContributionRelationshipsErrorReturn,
		true
	> = {
		error: true,
		retriable: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: the error arm is a member of the return union. */
Deno.test("PersistContributionRelationshipsErrorReturn is a member of PersistContributionRelationshipsReturn", () => {
	const errorReturn: PersistContributionRelationshipsErrorReturn = {
		error: new Error("test"),
		retriable: false,
	};
	const result: PersistContributionRelationshipsReturn = errorReturn;
	assert(result === errorReturn);
});

/** Contract: StageSlugMissingErrorConstructorParams requires exactly jobId and contributionId. */
Deno.test("PersistContributionRelationshipsStageSlugMissingErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof PersistContributionRelationshipsStageSlugMissingErrorConstructorParams,
		true
	> = {
		jobId: true,
		contributionId: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: RelationshipsMissingErrorConstructorParams requires exactly jobId and contributionId. */
Deno.test("PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams,
		true
	> = {
		jobId: true,
		contributionId: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: UpdateErrorConstructorParams requires exactly jobId, contributionId, stageSlug and driverMessage. */
Deno.test("PersistContributionRelationshipsUpdateErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof PersistContributionRelationshipsUpdateErrorConstructorParams,
		true
	> = {
		jobId: true,
		contributionId: true,
		stageSlug: true,
		driverMessage: true,
	};
	assertEquals(Object.keys(surface).length, 4);
});

/** Contract: StageEntryErrorConstructorParams requires exactly jobId, contributionId and stageSlug. */
Deno.test("PersistContributionRelationshipsStageEntryErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof PersistContributionRelationshipsStageEntryErrorConstructorParams,
		true
	> = {
		jobId: true,
		contributionId: true,
		stageSlug: true,
	};
	assertEquals(Object.keys(surface).length, 3);
});

/** Contract: StageSlugTypeErrorConstructorParams requires exactly jobId, contributionId and stageSlug. */
Deno.test("PersistContributionRelationshipsStageSlugTypeErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof PersistContributionRelationshipsStageSlugTypeErrorConstructorParams,
		true
	> = {
		jobId: true,
		contributionId: true,
		stageSlug: true,
	};
	assertEquals(Object.keys(surface).length, 3);
});

/** Contract: MergedEntryErrorConstructorParams requires exactly jobId, contributionId and stageSlug. */
Deno.test("PersistContributionRelationshipsMergedEntryErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof PersistContributionRelationshipsMergedEntryErrorConstructorParams,
		true
	> = {
		jobId: true,
		contributionId: true,
		stageSlug: true,
	};
	assertEquals(Object.keys(surface).length, 3);
});

/** Contract: the function's declared Promise return admits its error arm. */
Deno.test("PersistContributionRelationshipsFn resolves to its declared return type", () => {
	const errorReturn: PersistContributionRelationshipsErrorReturn = {
		error: new Error("test"),
		retriable: false,
	};
	const returned: ReturnType<PersistContributionRelationshipsFn> = Promise.resolve(errorReturn);
	const declared: Promise<PersistContributionRelationshipsReturn> = returned;
	assert(declared instanceof Promise);
});

/** Contract: BoundPersistContributionRelationshipsFn's declared Promise return admits its error arm, proving the bound signature is asynchronous. */
Deno.test("BoundPersistContributionRelationshipsFn resolves to its declared return type", () => {
	const errorReturn: PersistContributionRelationshipsErrorReturn = {
		error: new Error("test"),
		retriable: false,
	};
	const returned: ReturnType<BoundPersistContributionRelationshipsFn> = Promise.resolve(errorReturn);
	const declared: Promise<PersistContributionRelationshipsReturn> = returned;
	assert(declared instanceof Promise);
});
