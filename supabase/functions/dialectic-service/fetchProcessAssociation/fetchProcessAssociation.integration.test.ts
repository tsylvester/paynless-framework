/**
 * Integration: real domain_process_associations rows from database; real fetchProcessAssociation handler.
 * Mocks only at auth/setup boundaries via _integration.test.utils — association rows are not mocked.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
	coreCleanupTestResources,
	coreInitializeTestStep,
	initializeTestDeps,
} from "../../_shared/_integration.test.utils.ts";
import type {
	DomainProcessAssociationRow,
	FetchProcessAssociationDeps,
	FetchProcessAssociationParams,
	FetchProcessAssociationPayload,
	FetchProcessAssociationResult,
} from "./fetchProcessAssociation.interface.ts";
import {
	buildFetchProcessAssociationDeps,
	fetchProcessAssociation,
	isFetchProcessAssociationErrorReturn,
	isFetchProcessAssociationSuccessReturn,
} from "./fetchProcessAssociation.provides.ts";

Deno.test(
	"fetchProcessAssociation integration: handler matches independent domain_process_associations query for Software Development",
	async () => {
		initializeTestDeps();
		const { adminClient } = await coreInitializeTestStep({}, "global");

		try {
			const domainLookup = await adminClient
				.from("dialectic_domains")
				.select("id")
				.eq("name", "Software Development")
				.eq("is_enabled", true)
				.maybeSingle();
			if (domainLookup.error !== null) {
				throw domainLookup.error;
			}
			if (domainLookup.data === null) {
				throw new Error("Software Development domain not found in seed data");
			}
			const domainId: string = domainLookup.data.id;

			const associationQuery = await adminClient
				.from("domain_process_associations")
				.select("*")
				.eq("domain_id", domainId)
				.eq("is_default_for_domain", true)
				.single();
			if (associationQuery.error !== null) {
				throw associationQuery.error;
			}
			if (associationQuery.data === null) {
				throw new Error("Default domain_process_associations row not found for Software Development");
			}
			const expectedRow: DomainProcessAssociationRow = associationQuery.data;

			const deps: FetchProcessAssociationDeps = buildFetchProcessAssociationDeps({
				dbClient: adminClient,
			});
			const params: FetchProcessAssociationParams = {};
			const payload: FetchProcessAssociationPayload = { domainId };
			const result: FetchProcessAssociationResult = await fetchProcessAssociation(
				deps,
				params,
				payload,
			);

			assertEquals(isFetchProcessAssociationSuccessReturn(result), true);
			if (isFetchProcessAssociationSuccessReturn(result)) {
				assertEquals(result.status, 200);
				assertEquals(result.data.id, expectedRow.id);
				assertEquals(result.data.domain_id, expectedRow.domain_id);
				assertEquals(result.data.process_template_id, expectedRow.process_template_id);
				assertEquals(result.data.is_default_for_domain, expectedRow.is_default_for_domain);
				assertEquals(result.data.created_at, expectedRow.created_at);
				assertEquals(result.data.updated_at, expectedRow.updated_at);
			}
		} finally {
			await coreCleanupTestResources();
		}
	},
);

Deno.test(
	"fetchProcessAssociation integration: Financial Analysis has no default association (seed 20250616153421)",
	async () => {
		initializeTestDeps();
		const { adminClient } = await coreInitializeTestStep({}, "global");

		try {
			// Financial Analysis is disabled in catalog (20250627194907); only Software Development is enabled.
			// Handler reads domain_process_associations by domain_id only — is_enabled is not required here.
			const domainLookup = await adminClient
				.from("dialectic_domains")
				.select("id")
				.eq("name", "Financial Analysis")
				.maybeSingle();
			if (domainLookup.error !== null) {
				throw domainLookup.error;
			}
			if (domainLookup.data === null) {
				throw new Error("Financial Analysis domain not found in seed data");
			}
			const domainId: string = domainLookup.data.id;

			const deps: FetchProcessAssociationDeps = buildFetchProcessAssociationDeps({
				dbClient: adminClient,
			});
			const params: FetchProcessAssociationParams = {};
			const payload: FetchProcessAssociationPayload = { domainId };
			const result: FetchProcessAssociationResult = await fetchProcessAssociation(
				deps,
				params,
				payload,
			);

			assertEquals(isFetchProcessAssociationErrorReturn(result), true);
			if (isFetchProcessAssociationErrorReturn(result)) {
				assertEquals(result.status, 404);
				assertEquals(result.data, undefined);
				assertEquals(result.error.code, "NOT_FOUND");
			}
		} finally {
			await coreCleanupTestResources();
		}
	},
);
