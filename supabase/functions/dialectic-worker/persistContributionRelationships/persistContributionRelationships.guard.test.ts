import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
	isPersistContributionRelationshipsDeps,
	isPersistContributionRelationshipsParams,
	isPersistContributionRelationshipsPayload,
	isPersistContributionRelationshipsPersistedReturn,
	isPersistContributionRelationshipsUnchangedReturn,
	isPersistContributionRelationshipsErrorReturn,
	isPersistContributionRelationshipsStageSlugMissingError,
	isPersistContributionRelationshipsRelationshipsMissingError,
	isPersistContributionRelationshipsUpdateError,
	isPersistContributionRelationshipsStageEntryError,
	isPersistContributionRelationshipsStageSlugTypeError,
	isPersistContributionRelationshipsMergedEntryError,
	isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams,
	isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams,
	isPersistContributionRelationshipsUpdateErrorConstructorParams,
	isPersistContributionRelationshipsStageEntryErrorConstructorParams,
	isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams,
	isPersistContributionRelationshipsMergedEntryErrorConstructorParams,
} from './persistContributionRelationships.guard.ts';
import {
	buildPersistContributionRelationshipsDeps,
	buildPersistContributionRelationshipsParams,
	invalidatePersistContributionRelationshipsParams,
	buildPersistContributionRelationshipsPayload,
	invalidatePersistContributionRelationshipsPayload,
	buildPersistContributionRelationshipsPersistedReturn,
	invalidatePersistContributionRelationshipsPersistedReturn,
	buildPersistContributionRelationshipsUnchangedReturn,
	invalidatePersistContributionRelationshipsUnchangedReturn,
	buildPersistContributionRelationshipsErrorReturn,
	invalidatePersistContributionRelationshipsErrorReturn,
	buildPersistContributionRelationshipsStageSlugMissingError,
	buildPersistContributionRelationshipsStageSlugMissingErrorConstructorParams,
	invalidatePersistContributionRelationshipsStageSlugMissingErrorConstructorParams,
	buildPersistContributionRelationshipsRelationshipsMissingError,
	buildPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams,
	invalidatePersistContributionRelationshipsRelationshipsMissingErrorConstructorParams,
	buildPersistContributionRelationshipsUpdateError,
	buildPersistContributionRelationshipsUpdateErrorConstructorParams,
	invalidatePersistContributionRelationshipsUpdateErrorConstructorParams,
	buildPersistContributionRelationshipsStageEntryError,
	buildPersistContributionRelationshipsStageEntryErrorConstructorParams,
	invalidatePersistContributionRelationshipsStageEntryErrorConstructorParams,
	buildPersistContributionRelationshipsStageSlugTypeError,
	buildPersistContributionRelationshipsStageSlugTypeErrorConstructorParams,
	invalidatePersistContributionRelationshipsStageSlugTypeErrorConstructorParams,
	buildPersistContributionRelationshipsMergedEntryError,
	buildPersistContributionRelationshipsMergedEntryErrorConstructorParams,
	invalidatePersistContributionRelationshipsMergedEntryErrorConstructorParams,
} from './persistContributionRelationships.mock.ts';
import {
	invalidateDialecticJobRow,
	invalidateDialecticContributionRow,
	invalidateDocumentRelationships,
} from '../../_shared/dialectic.mock.ts';

// --- isPersistContributionRelationshipsDeps ---

Deno.test('Type Guard: isPersistContributionRelationshipsDeps', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsDeps(buildPersistContributionRelationshipsDeps()));
	});

	/** Contract: case 1 — an empty object is accepted (the type declares no members). */
	await t.step('accepts an empty object', () => {
		assert(isPersistContributionRelationshipsDeps({}));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsDeps(null));
		assert(!isPersistContributionRelationshipsDeps(undefined));
		assert(!isPersistContributionRelationshipsDeps('a string'));
		assert(!isPersistContributionRelationshipsDeps(42));
		assert(!isPersistContributionRelationshipsDeps([]));
	});
});

// --- isPersistContributionRelationshipsParams ---

Deno.test('Type Guard: isPersistContributionRelationshipsParams', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsParams(buildPersistContributionRelationshipsParams()));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsParams(null));
		assert(!isPersistContributionRelationshipsParams(undefined));
		assert(!isPersistContributionRelationshipsParams('a string'));
		assert(!isPersistContributionRelationshipsParams([]));
	});

	/** Contract: case 4 — dbClient corrupted to a string is rejected. */
	await t.step('rejects dbClient a string', () => {
		assert(!isPersistContributionRelationshipsParams(invalidatePersistContributionRelationshipsParams({ dbClient: 'not-a-client' })));
	});

	/** Contract: case 4 — job corrupted via invalidateDialecticJobRow is rejected. */
	await t.step('rejects job corrupted', () => {
		assert(!isPersistContributionRelationshipsParams(invalidatePersistContributionRelationshipsParams({ job: invalidateDialecticJobRow({ id: 42 }) })));
	});

	/** Contract: case 4 — contribution corrupted via invalidateDialecticContributionRow is rejected. */
	await t.step('rejects contribution corrupted', () => {
		assert(!isPersistContributionRelationshipsParams(invalidatePersistContributionRelationshipsParams({ contribution: invalidateDialecticContributionRow({ id: null }) })));
	});

	/** Contract: case 4 — isContinuationForStorage corrupted to a non-boolean is rejected. */
	await t.step('rejects isContinuationForStorage non-boolean', () => {
		assert(!isPersistContributionRelationshipsParams(invalidatePersistContributionRelationshipsParams({ isContinuationForStorage: 'not-a-boolean' })));
	});

	/** Contract: case 5 — dbClient omitted (rest-destructured away) is rejected. */
	await t.step('rejects dbClient omitted', () => {
		const { dbClient: _omit, ...rest } = buildPersistContributionRelationshipsParams();
		assert(!isPersistContributionRelationshipsParams(rest));
	});

	/** Contract: case 5 — job omitted (rest-destructured away) is rejected. */
	await t.step('rejects job omitted', () => {
		const { job: _omit, ...rest } = buildPersistContributionRelationshipsParams();
		assert(!isPersistContributionRelationshipsParams(rest));
	});

	/** Contract: case 5 — contribution omitted (rest-destructured away) is rejected. */
	await t.step('rejects contribution omitted', () => {
		const { contribution: _omit, ...rest } = buildPersistContributionRelationshipsParams();
		assert(!isPersistContributionRelationshipsParams(rest));
	});

	/** Contract: case 5 — isContinuationForStorage omitted (rest-destructured away) is rejected. */
	await t.step('rejects isContinuationForStorage omitted', () => {
		const { isContinuationForStorage: _omit, ...rest } = buildPersistContributionRelationshipsParams();
		assert(!isPersistContributionRelationshipsParams(rest));
	});
});

// --- isPersistContributionRelationshipsPayload ---

Deno.test('Type Guard: isPersistContributionRelationshipsPayload', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsPayload(buildPersistContributionRelationshipsPayload()));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsPayload(null));
		assert(!isPersistContributionRelationshipsPayload(undefined));
		assert(!isPersistContributionRelationshipsPayload('a string'));
		assert(!isPersistContributionRelationshipsPayload([]));
	});

	/** Contract: case 4 — prompt_template_id corrupted is rejected. */
	await t.step('rejects prompt_template_id corrupted', () => {
		assert(!isPersistContributionRelationshipsPayload(invalidatePersistContributionRelationshipsPayload({ prompt_template_id: 42 })));
	});

	/** Contract: case 4 — output_type corrupted is rejected. */
	await t.step('rejects output_type corrupted', () => {
		assert(!isPersistContributionRelationshipsPayload(invalidatePersistContributionRelationshipsPayload({ output_type: 'not-a-filetype' })));
	});

	/** Contract: case 4 — canonicalPathParams corrupted is rejected. */
	await t.step('rejects canonicalPathParams corrupted', () => {
		assert(!isPersistContributionRelationshipsPayload(invalidatePersistContributionRelationshipsPayload({ canonicalPathParams: 'not-an-object' })));
	});

	/** Contract: case 4 — inputs corrupted is rejected. */
	await t.step('rejects inputs corrupted', () => {
		assert(!isPersistContributionRelationshipsPayload(invalidatePersistContributionRelationshipsPayload({ inputs: 'not-an-object' })));
	});

	/** Contract: case 4 — document_relationships corrupted via invalidateDocumentRelationships is rejected. */
	await t.step('rejects document_relationships corrupted', () => {
		assert(!isPersistContributionRelationshipsPayload(invalidatePersistContributionRelationshipsPayload({ document_relationships: invalidateDocumentRelationships({ source_group: 42 }) })));
	});
});

// --- isPersistContributionRelationshipsPersistedReturn ---

Deno.test('Type Guard: isPersistContributionRelationshipsPersistedReturn', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsPersistedReturn(buildPersistContributionRelationshipsPersistedReturn()));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsPersistedReturn(null));
		assert(!isPersistContributionRelationshipsPersistedReturn(undefined));
		assert(!isPersistContributionRelationshipsPersistedReturn('a string'));
		assert(!isPersistContributionRelationshipsPersistedReturn([]));
	});

	/** Contract: case 4 — persisted corrupted to false is rejected. */
	await t.step('rejects persisted false', () => {
		assert(!isPersistContributionRelationshipsPersistedReturn(invalidatePersistContributionRelationshipsPersistedReturn({ persisted: false })));
	});

	/** Contract: case 4 — persisted corrupted to a non-boolean is rejected. */
	await t.step('rejects persisted non-boolean', () => {
		assert(!isPersistContributionRelationshipsPersistedReturn(invalidatePersistContributionRelationshipsPersistedReturn({ persisted: 'true' })));
	});

	/** Contract: case 4 — contribution corrupted via invalidateDialecticContributionRow is rejected. */
	await t.step('rejects contribution failing its owner guard', () => {
		assert(!isPersistContributionRelationshipsPersistedReturn(invalidatePersistContributionRelationshipsPersistedReturn({ contribution: invalidateDialecticContributionRow({ id: null }) })));
	});

	/** Contract: case 5 — persisted omitted (rest-destructured away) is rejected. */
	await t.step('rejects persisted omitted', () => {
		const { persisted: _omit, ...rest } = buildPersistContributionRelationshipsPersistedReturn();
		assert(!isPersistContributionRelationshipsPersistedReturn(rest));
	});

	/** Contract: case 5 — contribution omitted (rest-destructured away) is rejected. */
	await t.step('rejects contribution omitted', () => {
		const { contribution: _omit, ...rest } = buildPersistContributionRelationshipsPersistedReturn();
		assert(!isPersistContributionRelationshipsPersistedReturn(rest));
	});

	/** Contract: rejects the unchanged return, proving the two flavors are mutually exclusive. */
	await t.step('rejects the unchanged return', () => {
		assert(!isPersistContributionRelationshipsPersistedReturn(buildPersistContributionRelationshipsUnchangedReturn()));
	});

	/** Contract: rejects the error return, proving the two arms are mutually exclusive. */
	await t.step('rejects the error return', () => {
		assert(!isPersistContributionRelationshipsPersistedReturn(buildPersistContributionRelationshipsErrorReturn()));
	});
});

// --- isPersistContributionRelationshipsUnchangedReturn ---

Deno.test('Type Guard: isPersistContributionRelationshipsUnchangedReturn', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsUnchangedReturn(buildPersistContributionRelationshipsUnchangedReturn()));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsUnchangedReturn(null));
		assert(!isPersistContributionRelationshipsUnchangedReturn(undefined));
		assert(!isPersistContributionRelationshipsUnchangedReturn('a string'));
		assert(!isPersistContributionRelationshipsUnchangedReturn([]));
	});

	/** Contract: case 4 — persisted corrupted to true is rejected. */
	await t.step('rejects persisted true', () => {
		assert(!isPersistContributionRelationshipsUnchangedReturn(invalidatePersistContributionRelationshipsUnchangedReturn({ persisted: true })));
	});

	/** Contract: case 4 — persisted corrupted to a non-boolean is rejected. */
	await t.step('rejects persisted non-boolean', () => {
		assert(!isPersistContributionRelationshipsUnchangedReturn(invalidatePersistContributionRelationshipsUnchangedReturn({ persisted: 'false' })));
	});

	/** Contract: case 4 — contribution corrupted via invalidateDialecticContributionRow is rejected. */
	await t.step('rejects contribution failing its owner guard', () => {
		assert(!isPersistContributionRelationshipsUnchangedReturn(invalidatePersistContributionRelationshipsUnchangedReturn({ contribution: invalidateDialecticContributionRow({ id: null }) })));
	});

	/** Contract: case 5 — persisted omitted (rest-destructured away) is rejected. */
	await t.step('rejects persisted omitted', () => {
		const { persisted: _omit, ...rest } = buildPersistContributionRelationshipsUnchangedReturn();
		assert(!isPersistContributionRelationshipsUnchangedReturn(rest));
	});

	/** Contract: case 5 — contribution omitted (rest-destructured away) is rejected. */
	await t.step('rejects contribution omitted', () => {
		const { contribution: _omit, ...rest } = buildPersistContributionRelationshipsUnchangedReturn();
		assert(!isPersistContributionRelationshipsUnchangedReturn(rest));
	});

	/** Contract: rejects the persisted return, proving the two flavors are mutually exclusive. */
	await t.step('rejects the persisted return', () => {
		assert(!isPersistContributionRelationshipsUnchangedReturn(buildPersistContributionRelationshipsPersistedReturn()));
	});

	/** Contract: rejects the error return, proving the two arms are mutually exclusive. */
	await t.step('rejects the error return', () => {
		assert(!isPersistContributionRelationshipsUnchangedReturn(buildPersistContributionRelationshipsErrorReturn()));
	});
});

// --- isPersistContributionRelationshipsErrorReturn ---

Deno.test('Type Guard: isPersistContributionRelationshipsErrorReturn', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsErrorReturn(buildPersistContributionRelationshipsErrorReturn()));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsErrorReturn(null));
		assert(!isPersistContributionRelationshipsErrorReturn(undefined));
		assert(!isPersistContributionRelationshipsErrorReturn('a string'));
		assert(!isPersistContributionRelationshipsErrorReturn([]));
	});

	/** Contract: case 4 — error corrupted to a plain object is rejected. */
	await t.step('rejects error a plain object', () => {
		assert(!isPersistContributionRelationshipsErrorReturn(invalidatePersistContributionRelationshipsErrorReturn({ error: { message: 'oops' } })));
	});

	/** Contract: case 4 — error corrupted to a string is rejected. */
	await t.step('rejects error a string', () => {
		assert(!isPersistContributionRelationshipsErrorReturn(invalidatePersistContributionRelationshipsErrorReturn({ error: 'failure' })));
	});

	/** Contract: case 4 — retriable corrupted to a non-boolean is rejected. */
	await t.step('rejects retriable non-boolean', () => {
		assert(!isPersistContributionRelationshipsErrorReturn(invalidatePersistContributionRelationshipsErrorReturn({ retriable: 'not-a-boolean' })));
	});

	/** Contract: case 5 — error omitted (rest-destructured away) is rejected. */
	await t.step('rejects error omitted', () => {
		const { error: _omit, ...rest } = buildPersistContributionRelationshipsErrorReturn();
		assert(!isPersistContributionRelationshipsErrorReturn(rest));
	});

	/** Contract: case 5 — retriable omitted (rest-destructured away) is rejected. */
	await t.step('rejects retriable omitted', () => {
		const { retriable: _omit, ...rest } = buildPersistContributionRelationshipsErrorReturn();
		assert(!isPersistContributionRelationshipsErrorReturn(rest));
	});

	/** Contract: rejects the persisted return, proving the two arms are mutually exclusive. */
	await t.step('rejects the persisted return', () => {
		assert(!isPersistContributionRelationshipsErrorReturn(buildPersistContributionRelationshipsPersistedReturn()));
	});

	/** Contract: rejects the unchanged return, proving the two arms are mutually exclusive. */
	await t.step('rejects the unchanged return', () => {
		assert(!isPersistContributionRelationshipsErrorReturn(buildPersistContributionRelationshipsUnchangedReturn()));
	});
});

// --- Owned error instanceof guards ---

Deno.test('Type Guard: isPersistContributionRelationshipsStageSlugMissingError', async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step('accepts its own builder instance', () => {
		assert(isPersistContributionRelationshipsStageSlugMissingError(buildPersistContributionRelationshipsStageSlugMissingError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step('rejects non-instances', () => {
		assert(!isPersistContributionRelationshipsStageSlugMissingError(new Error('test')));
		assert(!isPersistContributionRelationshipsStageSlugMissingError({ jobId: 'job-1', contributionId: 'contribution-1' }));
		assert(!isPersistContributionRelationshipsStageSlugMissingError(buildPersistContributionRelationshipsRelationshipsMissingError()));
		assert(!isPersistContributionRelationshipsStageSlugMissingError(null));
		assert(!isPersistContributionRelationshipsStageSlugMissingError('a string'));
	});
});

Deno.test('Type Guard: isPersistContributionRelationshipsRelationshipsMissingError', async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step('accepts its own builder instance', () => {
		assert(isPersistContributionRelationshipsRelationshipsMissingError(buildPersistContributionRelationshipsRelationshipsMissingError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step('rejects non-instances', () => {
		assert(!isPersistContributionRelationshipsRelationshipsMissingError(new Error('test')));
		assert(!isPersistContributionRelationshipsRelationshipsMissingError({ jobId: 'job-1', contributionId: 'contribution-1' }));
		assert(!isPersistContributionRelationshipsRelationshipsMissingError(buildPersistContributionRelationshipsUpdateError()));
		assert(!isPersistContributionRelationshipsRelationshipsMissingError(null));
		assert(!isPersistContributionRelationshipsRelationshipsMissingError('a string'));
	});
});

Deno.test('Type Guard: isPersistContributionRelationshipsUpdateError', async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step('accepts its own builder instance', () => {
		assert(isPersistContributionRelationshipsUpdateError(buildPersistContributionRelationshipsUpdateError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step('rejects non-instances', () => {
		assert(!isPersistContributionRelationshipsUpdateError(new Error('test')));
		assert(!isPersistContributionRelationshipsUpdateError({ jobId: 'job-1', contributionId: 'contribution-1', stageSlug: 'thesis', driverMessage: 'driver error' }));
		assert(!isPersistContributionRelationshipsUpdateError(buildPersistContributionRelationshipsStageEntryError()));
		assert(!isPersistContributionRelationshipsUpdateError(null));
		assert(!isPersistContributionRelationshipsUpdateError('a string'));
	});
});

Deno.test('Type Guard: isPersistContributionRelationshipsStageEntryError', async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step('accepts its own builder instance', () => {
		assert(isPersistContributionRelationshipsStageEntryError(buildPersistContributionRelationshipsStageEntryError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step('rejects non-instances', () => {
		assert(!isPersistContributionRelationshipsStageEntryError(new Error('test')));
		assert(!isPersistContributionRelationshipsStageEntryError({ jobId: 'job-1', contributionId: 'contribution-1', stageSlug: 'thesis' }));
		assert(!isPersistContributionRelationshipsStageEntryError(buildPersistContributionRelationshipsStageSlugTypeError()));
		assert(!isPersistContributionRelationshipsStageEntryError(null));
		assert(!isPersistContributionRelationshipsStageEntryError('a string'));
	});
});

Deno.test('Type Guard: isPersistContributionRelationshipsStageSlugTypeError', async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step('accepts its own builder instance', () => {
		assert(isPersistContributionRelationshipsStageSlugTypeError(buildPersistContributionRelationshipsStageSlugTypeError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step('rejects non-instances', () => {
		assert(!isPersistContributionRelationshipsStageSlugTypeError(new Error('test')));
		assert(!isPersistContributionRelationshipsStageSlugTypeError({ jobId: 'job-1', contributionId: 'contribution-1', stageSlug: 'thesis' }));
		assert(!isPersistContributionRelationshipsStageSlugTypeError(buildPersistContributionRelationshipsMergedEntryError()));
		assert(!isPersistContributionRelationshipsStageSlugTypeError(null));
		assert(!isPersistContributionRelationshipsStageSlugTypeError('a string'));
	});
});

Deno.test('Type Guard: isPersistContributionRelationshipsMergedEntryError', async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step('accepts its own builder instance', () => {
		assert(isPersistContributionRelationshipsMergedEntryError(buildPersistContributionRelationshipsMergedEntryError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step('rejects non-instances', () => {
		assert(!isPersistContributionRelationshipsMergedEntryError(new Error('test')));
		assert(!isPersistContributionRelationshipsMergedEntryError({ jobId: 'job-1', contributionId: 'contribution-1', stageSlug: 'thesis' }));
		assert(!isPersistContributionRelationshipsMergedEntryError(buildPersistContributionRelationshipsStageSlugMissingError()));
		assert(!isPersistContributionRelationshipsMergedEntryError(null));
		assert(!isPersistContributionRelationshipsMergedEntryError('a string'));
	});
});

// --- Constructor-params guards (infill: the node's guard element omits these; guards.md requires them) ---

Deno.test('Type Guard: isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(buildPersistContributionRelationshipsStageSlugMissingErrorConstructorParams()));
	});

	/** Contract: case 2 — valid overrides are accepted. */
	await t.step('accepts valid overrides', () => {
		assert(isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(buildPersistContributionRelationshipsStageSlugMissingErrorConstructorParams({ jobId: 'different-job' })));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(null));
		assert(!isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(undefined));
		assert(!isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams('a string'));
		assert(!isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams([]));
	});

	/** Contract: case 4 — jobId corrupted is rejected. */
	await t.step('rejects jobId corrupted', () => {
		assert(!isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(invalidatePersistContributionRelationshipsStageSlugMissingErrorConstructorParams({ jobId: 123 })));
	});

	/** Contract: case 4 — contributionId corrupted is rejected. */
	await t.step('rejects contributionId corrupted', () => {
		assert(!isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(invalidatePersistContributionRelationshipsStageSlugMissingErrorConstructorParams({ contributionId: 123 })));
	});

	/** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
	await t.step('rejects jobId omitted', () => {
		const { jobId: _omit, ...missing } = buildPersistContributionRelationshipsStageSlugMissingErrorConstructorParams();
		assert(!isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(missing));
	});

	/** Contract: case 5 — contributionId omitted (rest-destructured away) is rejected. */
	await t.step('rejects contributionId omitted', () => {
		const { contributionId: _omit, ...missing } = buildPersistContributionRelationshipsStageSlugMissingErrorConstructorParams();
		assert(!isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(missing));
	});
});

Deno.test('Type Guard: isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(buildPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams()));
	});

	/** Contract: case 2 — valid overrides are accepted. */
	await t.step('accepts valid overrides', () => {
		assert(isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(buildPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams({ jobId: 'different-job' })));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(null));
		assert(!isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(undefined));
		assert(!isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams('a string'));
		assert(!isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams([]));
	});

	/** Contract: case 4 — jobId corrupted is rejected. */
	await t.step('rejects jobId corrupted', () => {
		assert(!isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(invalidatePersistContributionRelationshipsRelationshipsMissingErrorConstructorParams({ jobId: 123 })));
	});

	/** Contract: case 4 — contributionId corrupted is rejected. */
	await t.step('rejects contributionId corrupted', () => {
		assert(!isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(invalidatePersistContributionRelationshipsRelationshipsMissingErrorConstructorParams({ contributionId: 123 })));
	});

	/** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
	await t.step('rejects jobId omitted', () => {
		const { jobId: _omit, ...missing } = buildPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams();
		assert(!isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(missing));
	});

	/** Contract: case 5 — contributionId omitted (rest-destructured away) is rejected. */
	await t.step('rejects contributionId omitted', () => {
		const { contributionId: _omit, ...missing } = buildPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams();
		assert(!isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(missing));
	});
});

Deno.test('Type Guard: isPersistContributionRelationshipsUpdateErrorConstructorParams', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsUpdateErrorConstructorParams(buildPersistContributionRelationshipsUpdateErrorConstructorParams()));
	});

	/** Contract: case 2 — valid overrides are accepted. */
	await t.step('accepts valid overrides', () => {
		assert(isPersistContributionRelationshipsUpdateErrorConstructorParams(buildPersistContributionRelationshipsUpdateErrorConstructorParams({ jobId: 'different-job' })));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams(null));
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams(undefined));
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams('a string'));
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams([]));
	});

	/** Contract: case 4 — jobId corrupted is rejected. */
	await t.step('rejects jobId corrupted', () => {
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams(invalidatePersistContributionRelationshipsUpdateErrorConstructorParams({ jobId: 123 })));
	});

	/** Contract: case 4 — contributionId corrupted is rejected. */
	await t.step('rejects contributionId corrupted', () => {
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams(invalidatePersistContributionRelationshipsUpdateErrorConstructorParams({ contributionId: 123 })));
	});

	/** Contract: case 4 — stageSlug corrupted is rejected. */
	await t.step('rejects stageSlug corrupted', () => {
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams(invalidatePersistContributionRelationshipsUpdateErrorConstructorParams({ stageSlug: 123 })));
	});

	/** Contract: case 4 — driverMessage corrupted is rejected. */
	await t.step('rejects driverMessage corrupted', () => {
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams(invalidatePersistContributionRelationshipsUpdateErrorConstructorParams({ driverMessage: 123 })));
	});

	/** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
	await t.step('rejects jobId omitted', () => {
		const { jobId: _omit, ...missing } = buildPersistContributionRelationshipsUpdateErrorConstructorParams();
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams(missing));
	});

	/** Contract: case 5 — contributionId omitted (rest-destructured away) is rejected. */
	await t.step('rejects contributionId omitted', () => {
		const { contributionId: _omit, ...missing } = buildPersistContributionRelationshipsUpdateErrorConstructorParams();
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams(missing));
	});

	/** Contract: case 5 — stageSlug omitted (rest-destructured away) is rejected. */
	await t.step('rejects stageSlug omitted', () => {
		const { stageSlug: _omit, ...missing } = buildPersistContributionRelationshipsUpdateErrorConstructorParams();
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams(missing));
	});

	/** Contract: case 5 — driverMessage omitted (rest-destructured away) is rejected. */
	await t.step('rejects driverMessage omitted', () => {
		const { driverMessage: _omit, ...missing } = buildPersistContributionRelationshipsUpdateErrorConstructorParams();
		assert(!isPersistContributionRelationshipsUpdateErrorConstructorParams(missing));
	});
});

Deno.test('Type Guard: isPersistContributionRelationshipsStageEntryErrorConstructorParams', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsStageEntryErrorConstructorParams(buildPersistContributionRelationshipsStageEntryErrorConstructorParams()));
	});

	/** Contract: case 2 — valid overrides are accepted. */
	await t.step('accepts valid overrides', () => {
		assert(isPersistContributionRelationshipsStageEntryErrorConstructorParams(buildPersistContributionRelationshipsStageEntryErrorConstructorParams({ jobId: 'different-job' })));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsStageEntryErrorConstructorParams(null));
		assert(!isPersistContributionRelationshipsStageEntryErrorConstructorParams(undefined));
		assert(!isPersistContributionRelationshipsStageEntryErrorConstructorParams('a string'));
		assert(!isPersistContributionRelationshipsStageEntryErrorConstructorParams([]));
	});

	/** Contract: case 4 — jobId corrupted is rejected. */
	await t.step('rejects jobId corrupted', () => {
		assert(!isPersistContributionRelationshipsStageEntryErrorConstructorParams(invalidatePersistContributionRelationshipsStageEntryErrorConstructorParams({ jobId: 123 })));
	});

	/** Contract: case 4 — contributionId corrupted is rejected. */
	await t.step('rejects contributionId corrupted', () => {
		assert(!isPersistContributionRelationshipsStageEntryErrorConstructorParams(invalidatePersistContributionRelationshipsStageEntryErrorConstructorParams({ contributionId: 123 })));
	});

	/** Contract: case 4 — stageSlug corrupted is rejected. */
	await t.step('rejects stageSlug corrupted', () => {
		assert(!isPersistContributionRelationshipsStageEntryErrorConstructorParams(invalidatePersistContributionRelationshipsStageEntryErrorConstructorParams({ stageSlug: 123 })));
	});

	/** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
	await t.step('rejects jobId omitted', () => {
		const { jobId: _omit, ...missing } = buildPersistContributionRelationshipsStageEntryErrorConstructorParams();
		assert(!isPersistContributionRelationshipsStageEntryErrorConstructorParams(missing));
	});

	/** Contract: case 5 — contributionId omitted (rest-destructured away) is rejected. */
	await t.step('rejects contributionId omitted', () => {
		const { contributionId: _omit, ...missing } = buildPersistContributionRelationshipsStageEntryErrorConstructorParams();
		assert(!isPersistContributionRelationshipsStageEntryErrorConstructorParams(missing));
	});

	/** Contract: case 5 — stageSlug omitted (rest-destructured away) is rejected. */
	await t.step('rejects stageSlug omitted', () => {
		const { stageSlug: _omit, ...missing } = buildPersistContributionRelationshipsStageEntryErrorConstructorParams();
		assert(!isPersistContributionRelationshipsStageEntryErrorConstructorParams(missing));
	});
});

Deno.test('Type Guard: isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(buildPersistContributionRelationshipsStageSlugTypeErrorConstructorParams()));
	});

	/** Contract: case 2 — valid overrides are accepted. */
	await t.step('accepts valid overrides', () => {
		assert(isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(buildPersistContributionRelationshipsStageSlugTypeErrorConstructorParams({ jobId: 'different-job' })));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(null));
		assert(!isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(undefined));
		assert(!isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams('a string'));
		assert(!isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams([]));
	});

	/** Contract: case 4 — jobId corrupted is rejected. */
	await t.step('rejects jobId corrupted', () => {
		assert(!isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(invalidatePersistContributionRelationshipsStageSlugTypeErrorConstructorParams({ jobId: 123 })));
	});

	/** Contract: case 4 — contributionId corrupted is rejected. */
	await t.step('rejects contributionId corrupted', () => {
		assert(!isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(invalidatePersistContributionRelationshipsStageSlugTypeErrorConstructorParams({ contributionId: 123 })));
	});

	/** Contract: case 4 — stageSlug corrupted is rejected. */
	await t.step('rejects stageSlug corrupted', () => {
		assert(!isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(invalidatePersistContributionRelationshipsStageSlugTypeErrorConstructorParams({ stageSlug: 123 })));
	});

	/** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
	await t.step('rejects jobId omitted', () => {
		const { jobId: _omit, ...missing } = buildPersistContributionRelationshipsStageSlugTypeErrorConstructorParams();
		assert(!isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(missing));
	});

	/** Contract: case 5 — contributionId omitted (rest-destructured away) is rejected. */
	await t.step('rejects contributionId omitted', () => {
		const { contributionId: _omit, ...missing } = buildPersistContributionRelationshipsStageSlugTypeErrorConstructorParams();
		assert(!isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(missing));
	});

	/** Contract: case 5 — stageSlug omitted (rest-destructured away) is rejected. */
	await t.step('rejects stageSlug omitted', () => {
		const { stageSlug: _omit, ...missing } = buildPersistContributionRelationshipsStageSlugTypeErrorConstructorParams();
		assert(!isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(missing));
	});
});

Deno.test('Type Guard: isPersistContributionRelationshipsMergedEntryErrorConstructorParams', async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step('accepts the builder default', () => {
		assert(isPersistContributionRelationshipsMergedEntryErrorConstructorParams(buildPersistContributionRelationshipsMergedEntryErrorConstructorParams()));
	});

	/** Contract: case 2 — valid overrides are accepted. */
	await t.step('accepts valid overrides', () => {
		assert(isPersistContributionRelationshipsMergedEntryErrorConstructorParams(buildPersistContributionRelationshipsMergedEntryErrorConstructorParams({ jobId: 'different-job' })));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step('rejects non-objects', () => {
		assert(!isPersistContributionRelationshipsMergedEntryErrorConstructorParams(null));
		assert(!isPersistContributionRelationshipsMergedEntryErrorConstructorParams(undefined));
		assert(!isPersistContributionRelationshipsMergedEntryErrorConstructorParams('a string'));
		assert(!isPersistContributionRelationshipsMergedEntryErrorConstructorParams([]));
	});

	/** Contract: case 4 — jobId corrupted is rejected. */
	await t.step('rejects jobId corrupted', () => {
		assert(!isPersistContributionRelationshipsMergedEntryErrorConstructorParams(invalidatePersistContributionRelationshipsMergedEntryErrorConstructorParams({ jobId: 123 })));
	});

	/** Contract: case 4 — contributionId corrupted is rejected. */
	await t.step('rejects contributionId corrupted', () => {
		assert(!isPersistContributionRelationshipsMergedEntryErrorConstructorParams(invalidatePersistContributionRelationshipsMergedEntryErrorConstructorParams({ contributionId: 123 })));
	});

	/** Contract: case 4 — stageSlug corrupted is rejected. */
	await t.step('rejects stageSlug corrupted', () => {
		assert(!isPersistContributionRelationshipsMergedEntryErrorConstructorParams(invalidatePersistContributionRelationshipsMergedEntryErrorConstructorParams({ stageSlug: 123 })));
	});

	/** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
	await t.step('rejects jobId omitted', () => {
		const { jobId: _omit, ...missing } = buildPersistContributionRelationshipsMergedEntryErrorConstructorParams();
		assert(!isPersistContributionRelationshipsMergedEntryErrorConstructorParams(missing));
	});

	/** Contract: case 5 — contributionId omitted (rest-destructured away) is rejected. */
	await t.step('rejects contributionId omitted', () => {
		const { contributionId: _omit, ...missing } = buildPersistContributionRelationshipsMergedEntryErrorConstructorParams();
		assert(!isPersistContributionRelationshipsMergedEntryErrorConstructorParams(missing));
	});

	/** Contract: case 5 — stageSlug omitted (rest-destructured away) is rejected. */
	await t.step('rejects stageSlug omitted', () => {
		const { stageSlug: _omit, ...missing } = buildPersistContributionRelationshipsMergedEntryErrorConstructorParams();
		assert(!isPersistContributionRelationshipsMergedEntryErrorConstructorParams(missing));
	});
});
