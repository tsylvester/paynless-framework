import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';
import { isDocumentRelationships } from '../../_shared/utils/type-guards/type_guards.dialectic.ts';
import {
	buildDialecticContributionRow,
	buildDocumentRelationships,
} from '../../_shared/dialectic.mock.ts';
import { persistContributionRelationships } from './persistContributionRelationships.ts';
import {
	isPersistContributionRelationshipsStageSlugMissingError,
	isPersistContributionRelationshipsRelationshipsMissingError,
	isPersistContributionRelationshipsUpdateError,
	isPersistContributionRelationshipsStageEntryError,
	isPersistContributionRelationshipsStageSlugTypeError,
	isPersistContributionRelationshipsMergedEntryError,
	isPersistContributionRelationshipsPersistedReturn,
	isPersistContributionRelationshipsUnchangedReturn,
} from './persistContributionRelationships.guard.ts';
import {
	buildPersistContributionRelationshipsDeps,
	buildPersistContributionRelationshipsParams,
	buildPersistContributionRelationshipsPayload,
} from './persistContributionRelationships.mock.ts';

// --- Stage slug invariant ---

Deno.test('Contract: a payload whose stageSlug is absent returns the error arm carrying a StageSlugMissingError, with no update performed', async () => {
	// Arrange — stageSlug removed from the payload via rest-destructure
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: 'contrib-stage-absent' });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution });
	const { stageSlug: _omit, ...payloadNoStage } = buildPersistContributionRelationshipsPayload();

	// Act
	const result = await persistContributionRelationships(deps, params, payloadNoStage);

	// Assert
	assertEquals('error' in result, true);
	if ('error' in result) {
		assertEquals(isPersistContributionRelationshipsStageSlugMissingError(result.error), true);
		if (isPersistContributionRelationshipsStageSlugMissingError(result.error)) {
			assertEquals(result.error.jobId, params.job.id);
			assertEquals(result.error.contributionId, params.contribution.id);
		}
		assertEquals(result.retriable, false);
	}
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertEquals(spy?.callCount, 0);
});

Deno.test('Contract: a payload whose stageSlug is whitespace returns the error arm carrying a StageSlugMissingError, with no update performed', async () => {
	// Arrange — stageSlug is whitespace
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: 'contrib-stage-ws' });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: '   ' });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals('error' in result, true);
	if ('error' in result) {
		assertEquals(isPersistContributionRelationshipsStageSlugMissingError(result.error), true);
		assertEquals(result.retriable, false);
	}
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertEquals(spy?.callCount, 0);
});

// --- Continuation relationships invariant ---

Deno.test('Contract: a continuation whose payload document_relationships is absent returns the error arm carrying a RelationshipsMissingError, with no update performed', async () => {
	// Arrange — continuation, document_relationships absent (rest-destructured away)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: 'contrib-rels-absent' });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: true });
	const { document_relationships: _omit, ...payloadNoRels } = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis' });

	// Act
	const result = await persistContributionRelationships(deps, params, payloadNoRels);

	// Assert
	assertEquals('error' in result, true);
	if ('error' in result) {
		assertEquals(isPersistContributionRelationshipsRelationshipsMissingError(result.error), true);
		if (isPersistContributionRelationshipsRelationshipsMissingError(result.error)) {
			assertEquals(result.error.jobId, params.job.id);
			assertEquals(result.error.contributionId, params.contribution.id);
		}
		assertEquals(result.retriable, false);
	}
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertEquals(spy?.callCount, 0);
});

Deno.test('Contract: a continuation whose payload document_relationships is null returns the error arm carrying a RelationshipsMissingError, with no update performed', async () => {
	// Arrange — continuation, document_relationships null
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: 'contrib-rels-null' });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: true });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis', document_relationships: null });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals('error' in result, true);
	if ('error' in result) {
		assertEquals(isPersistContributionRelationshipsRelationshipsMissingError(result.error), true);
		assertEquals(result.retriable, false);
	}
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertEquals(spy?.callCount, 0);
});

// --- Continuation write ---

Deno.test('Contract: a continuation whose relationships carry the stage entry updates dialectic_contributions once with exactly those relationships, filtered on the contribution id, and returns the persisted flavor whose contribution.document_relationships equals the payload relationships', async () => {
	// Arrange — continuation, relationships carry the stage entry; distinct values so a wrong source cannot pass
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contributionId = 'contrib-cont-write';
	const contribution = buildDialecticContributionRow({ id: contributionId });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: true });
	const payloadRelationships = buildDocumentRelationships({ thesis: 'distinct-thesis-id', source_group: 'distinct-sg' });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis', document_relationships: payloadRelationships });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals(isPersistContributionRelationshipsPersistedReturn(result), true);
	if (isPersistContributionRelationshipsPersistedReturn(result)) {
		assertEquals(result.contribution.document_relationships, payloadRelationships);
		assert(result.contribution !== params.contribution);
	}
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertExists(spy);
	assertEquals(spy.callCount, 1);
	const updateArgs = spy.callsArgs[0][0];
	if (!isRecord(updateArgs)) throw new Error('updateArgs is not a record');
	assertEquals(updateArgs.document_relationships, payloadRelationships);
});

// --- Continuation verification ---

Deno.test('Contract: a continuation whose relationships carry no entry for the stage returns the error arm carrying a StageEntryError, after the update ran', async () => {
	// Arrange — continuation, relationships present but no stage entry (thesis removed via rest-destructure)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: 'contrib-no-stage-entry' });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: true });
	const { thesis: _omit, ...relsNoStage } = buildDocumentRelationships({ source_group: 'sg-no-stage' });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis', document_relationships: relsNoStage });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals('error' in result, true);
	if ('error' in result) {
		assertEquals(isPersistContributionRelationshipsStageEntryError(result.error), true);
		if (isPersistContributionRelationshipsStageEntryError(result.error)) {
			assertEquals(result.error.jobId, params.job.id);
			assertEquals(result.error.contributionId, params.contribution.id);
			assertEquals(result.error.stageSlug, 'thesis');
		}
		assertEquals(result.retriable, false);
	}
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertExists(spy);
	assertEquals(spy.callCount, 1);
});

Deno.test('Contract: a continuation whose relationships carry an empty-string stage entry returns the error arm carrying a StageEntryError, after the update ran', async () => {
	// Arrange — continuation, stage entry is an empty string
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: 'contrib-empty-stage-entry' });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: true });
	const payload = buildPersistContributionRelationshipsPayload({
		stageSlug: 'thesis',
		document_relationships: buildDocumentRelationships({ thesis: '', source_group: 'sg-empty' }),
	});

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals('error' in result, true);
	if ('error' in result) {
		assertEquals(isPersistContributionRelationshipsStageEntryError(result.error), true);
		assertEquals(result.retriable, false);
	}
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertExists(spy);
	assertEquals(spy.callCount, 1);
});

// --- Unchanged flavor ---

Deno.test('Contract: a non-continuation whose contribution already carries document_relationships[stageSlug] equal to its own id returns the unchanged flavor carrying that contribution, with no update performed', async () => {
	// Arrange — non-continuation, stage entry already equals contribution id
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contributionId = 'contrib-unchanged';
	const contribution = buildDialecticContributionRow({
		id: contributionId,
		document_relationships: buildDocumentRelationships({ thesis: contributionId }),
	});
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis' });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals(isPersistContributionRelationshipsUnchangedReturn(result), true);
	if (isPersistContributionRelationshipsUnchangedReturn(result)) {
		assertEquals(result.contribution, params.contribution);
	}
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertEquals(spy?.callCount, 0);
});

// --- Init decision (three cases that reach the merge) ---

Deno.test('Contract: a non-continuation whose contribution has no document_relationships reaches the merge and updates once', async () => {
	// Arrange — non-continuation, relationships absent (null)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: 'contrib-init-absent', document_relationships: null });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis' });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals(isPersistContributionRelationshipsPersistedReturn(result), true);
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertExists(spy);
	assertEquals(spy.callCount, 1);
});

Deno.test('Contract: a non-continuation whose relationships stage entry is not a string reaches the merge and updates once', async () => {
	// Arrange — non-continuation, stage entry is a number (valid Json on the row, not a string)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: 'contrib-init-non-string', document_relationships: { thesis: 42 } });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis' });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals(isPersistContributionRelationshipsPersistedReturn(result), true);
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertExists(spy);
	assertEquals(spy.callCount, 1);
});

Deno.test('Contract: a non-continuation whose relationships stage entry is a foreign id reaches the merge and updates once', async () => {
	// Arrange — non-continuation, stage entry is a different contribution's id (distinct from own)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contributionId = 'contrib-init-foreign';
	const contribution = buildDialecticContributionRow({
		id: contributionId,
		document_relationships: buildDocumentRelationships({ thesis: 'foreign-contrib-id' }),
	});
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis' });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals(isPersistContributionRelationshipsPersistedReturn(result), true);
	if (isPersistContributionRelationshipsPersistedReturn(result)) {
		assert(isDocumentRelationships(result.contribution.document_relationships));
		assertEquals(result.contribution.document_relationships.thesis, contributionId);
	}
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertExists(spy);
	assertEquals(spy.callCount, 1);
});

// --- Merge copy ---

Deno.test('Contract: a contribution whose relationships carry a valid ContributionType entry, a source_group string, an isContinuation boolean and a turnIndex number yields merged relationships carrying the first two and neither of the last two', async () => {
	// Arrange — relationships with all four kinds of entries
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contributionId = 'contrib-merge-copy';
	const contribution = buildDialecticContributionRow({
		id: contributionId,
		document_relationships: buildDocumentRelationships({
			antithesis: 'antithesis-id-kept',
			source_group: 'sg-kept',
			isContinuation: true,
			turnIndex: 3,
		}),
	});
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis' });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert — merged carries antithesis and source_group, not isContinuation or turnIndex, and adds thesis
	assertEquals(isPersistContributionRelationshipsPersistedReturn(result), true);
	if (isPersistContributionRelationshipsPersistedReturn(result)) {
		const merged = result.contribution.document_relationships;
		assert(isDocumentRelationships(merged));
		assertEquals(merged.antithesis, 'antithesis-id-kept');
		assertEquals(merged.source_group, 'sg-kept');
		assertEquals('isContinuation' in merged, false);
		assertEquals('turnIndex' in merged, false);
		assertEquals(merged.thesis, contributionId);
	}
});

// --- Source group initialization ---

Deno.test('Contract: a payload whose document_relationships.source_group is explicitly null yields merged relationships whose source_group equals the contribution id', async () => {
	// Arrange — payload source_group is null
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contributionId = 'contrib-sg-null';
	const contribution = buildDialecticContributionRow({ id: contributionId, document_relationships: null });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const payload = buildPersistContributionRelationshipsPayload({
		stageSlug: 'thesis',
		document_relationships: buildDocumentRelationships({ source_group: null }),
	});

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals(isPersistContributionRelationshipsPersistedReturn(result), true);
	if (isPersistContributionRelationshipsPersistedReturn(result)) {
		assert(isDocumentRelationships(result.contribution.document_relationships));
		assertEquals(result.contribution.document_relationships.source_group, contributionId);
	}
});

Deno.test('Contract: a payload whose document_relationships.source_group is a string leaves the merged source_group as the copy loop produced it', async () => {
	// Arrange — payload source_group is a string; existing has a source_group to copy
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contributionId = 'contrib-sg-string';
	const existingSg = 'existing-sg';
	const contribution = buildDialecticContributionRow({
		id: contributionId,
		document_relationships: buildDocumentRelationships({ source_group: existingSg }),
	});
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const payload = buildPersistContributionRelationshipsPayload({
		stageSlug: 'thesis',
		document_relationships: buildDocumentRelationships({ source_group: 'payload-sg' }),
	});

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert — source_group stays as the copy loop left it (existingSg)
	assertEquals(isPersistContributionRelationshipsPersistedReturn(result), true);
	if (isPersistContributionRelationshipsPersistedReturn(result)) {
		assert(isDocumentRelationships(result.contribution.document_relationships));
		assertEquals(result.contribution.document_relationships.source_group, existingSg);
	}
});

Deno.test('Contract: a payload with no document_relationships leaves the merged source_group as the copy loop produced it', async () => {
	// Arrange — payload has no document_relationships; existing has a source_group to copy
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contributionId = 'contrib-sg-no-payload-rels';
	const existingSg = 'existing-sg-no-payload';
	const contribution = buildDialecticContributionRow({
		id: contributionId,
		document_relationships: buildDocumentRelationships({ source_group: existingSg }),
	});
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const { document_relationships: _omit, ...payloadNoRels } = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis' });

	// Act
	const result = await persistContributionRelationships(deps, params, payloadNoRels);

	// Assert — source_group stays as the copy loop left it (existingSg)
	assertEquals(isPersistContributionRelationshipsPersistedReturn(result), true);
	if (isPersistContributionRelationshipsPersistedReturn(result)) {
		assert(isDocumentRelationships(result.contribution.document_relationships));
		assertEquals(result.contribution.document_relationships.source_group, existingSg);
	}
});

// --- Stage key type ---

Deno.test('Contract: a non-continuation whose stageSlug is a non-empty string that is not a ContributionType returns the error arm carrying a StageSlugTypeError, with no update performed', async () => {
	// Arrange — stageSlug is a non-empty string but not a ContributionType
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: 'contrib-stage-type', document_relationships: null });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: 'not-a-contribution-type' });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals('error' in result, true);
	if ('error' in result) {
		assertEquals(isPersistContributionRelationshipsStageSlugTypeError(result.error), true);
		if (isPersistContributionRelationshipsStageSlugTypeError(result.error)) {
			assertEquals(result.error.jobId, params.job.id);
			assertEquals(result.error.contributionId, params.contribution.id);
			assertEquals(result.error.stageSlug, 'not-a-contribution-type');
		}
		assertEquals(result.retriable, false);
	}
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertEquals(spy?.callCount, 0);
});

// --- Merged verification ---

Deno.test('Contract: a non-continuation whose contribution id is an empty string returns the error arm carrying a MergedEntryError after the update ran', async () => {
	// Arrange — contribution id is empty; merged[stageSlug] will be '' which fails the check
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: '', document_relationships: null });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis' });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals('error' in result, true);
	if ('error' in result) {
		assertEquals(isPersistContributionRelationshipsMergedEntryError(result.error), true);
		if (isPersistContributionRelationshipsMergedEntryError(result.error)) {
			assertEquals(result.error.jobId, params.job.id);
			assertEquals(result.error.contributionId, params.contribution.id);
			assertEquals(result.error.stageSlug, 'thesis');
		}
		assertEquals(result.retriable, false);
	}
	const spy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
	assertExists(spy);
	assertEquals(spy.callCount, 1);
});

// --- Update failures surfaced ---

Deno.test('Contract: a driver error on the continuation write returns the error arm carrying an UpdateError with the driver message and stage slug, retriable true', async () => {
	// Arrange — continuation, update fails with a distinct driver message
	const driverMessage = 'continuation-driver-error';
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: new Error(driverMessage) } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: 'contrib-cont-update-err' });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: true });
	const payload = buildPersistContributionRelationshipsPayload({
		stageSlug: 'thesis',
		document_relationships: buildDocumentRelationships({ thesis: 'thesis-id' }),
	});

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals('error' in result, true);
	if ('error' in result) {
		assertEquals(isPersistContributionRelationshipsUpdateError(result.error), true);
		if (isPersistContributionRelationshipsUpdateError(result.error)) {
			assertEquals(result.error.jobId, params.job.id);
			assertEquals(result.error.contributionId, params.contribution.id);
			assertEquals(result.error.stageSlug, 'thesis');
			assertEquals(result.error.driverMessage, driverMessage);
		}
		assertEquals(result.retriable, true);
	}
});

Deno.test('Contract: a driver error on the init write returns the error arm carrying an UpdateError with the driver message and stage slug, retriable true', async () => {
	// Arrange — non-continuation, init update fails with a distinct driver message
	const driverMessage = 'init-driver-error';
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: new Error(driverMessage) } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contribution = buildDialecticContributionRow({ id: 'contrib-init-update-err', document_relationships: null });
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const payload = buildPersistContributionRelationshipsPayload({ stageSlug: 'thesis' });

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals('error' in result, true);
	if ('error' in result) {
		assertEquals(isPersistContributionRelationshipsUpdateError(result.error), true);
		if (isPersistContributionRelationshipsUpdateError(result.error)) {
			assertEquals(result.error.jobId, params.job.id);
			assertEquals(result.error.contributionId, params.contribution.id);
			assertEquals(result.error.stageSlug, 'thesis');
			assertEquals(result.error.driverMessage, driverMessage);
		}
		assertEquals(result.retriable, true);
	}
});

// --- Purity ---

Deno.test('Contract: neither the params object nor the payload object is mutated by any path; the returned contribution is not params.contribution; and the returned relationships are neither payload.document_relationships nor params.contribution.document_relationships by reference', async () => {
	// Arrange — non-continuation init path that produces a persisted flavor with merged relationships
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: { dialectic_contributions: { update: { data: null, error: null } } },
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildPersistContributionRelationshipsDeps();
	const contributionId = 'contrib-purity';
	const contribution = buildDialecticContributionRow({
		id: contributionId,
		document_relationships: buildDocumentRelationships({ antithesis: 'antithesis-purity', source_group: 'sg-purity' }),
	});
	const params = buildPersistContributionRelationshipsParams({ dbClient, contribution, isContinuationForStorage: false });
	const payload = buildPersistContributionRelationshipsPayload({
		stageSlug: 'thesis',
		document_relationships: buildDocumentRelationships({ source_group: null }),
	});
	const paramsContributionSnapshot = structuredClone(params.contribution);
	const payloadSnapshot = structuredClone(payload);

	// Act
	const result = await persistContributionRelationships(deps, params, payload);

	// Assert
	assertEquals(isPersistContributionRelationshipsPersistedReturn(result), true);
	if (isPersistContributionRelationshipsPersistedReturn(result)) {
		assert(result.contribution !== params.contribution);
		assert(result.contribution.document_relationships !== payload.document_relationships);
		assert(result.contribution.document_relationships !== params.contribution.document_relationships);
	}
	// params not mutated
	assertEquals(params.isContinuationForStorage, false);
	assertEquals(params.contribution.id, paramsContributionSnapshot.id);
	assertEquals(params.contribution.document_relationships, paramsContributionSnapshot.document_relationships);
	// payload not mutated
	assertEquals(payload.stageSlug, payloadSnapshot.stageSlug);
	assertEquals(payload.document_relationships, payloadSnapshot.document_relationships);
});
