/**
 * Integration: real dialectic_domains rows from database; real listDomains handler.
 * Mocks only at auth/setup boundaries via _integration.test.utils — domain rows are not mocked.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
	coreCleanupTestResources,
	coreInitializeTestStep,
	initializeTestDeps,
} from "../../_shared/_integration.test.utils.ts";
import type {
	DialecticDomainRow,
	ListDomainsDeps,
	ListDomainsParams,
	ListDomainsPayload,
	ListDomainsResult,
} from "./listDomains.interface.ts";
import {
	buildListDomainsDeps,
	isListDomainsSuccessReturn,
	listDomains,
} from "./listDomains.provides.ts";

Deno.test("listDomains integration: handler matches independent dialectic_domains query", async () => {
	initializeTestDeps();
	const { adminClient } = await coreInitializeTestStep({}, "global");

	try {
		const directQuery = await adminClient
			.from("dialectic_domains")
			.select("*")
			.eq("is_enabled", true)
			.order("name", { ascending: true });
		if (directQuery.error !== null) {
			throw directQuery.error;
		}
		let expectedRows: DialecticDomainRow[];
		if (directQuery.data === null) {
			expectedRows = [];
		} else {
			expectedRows = directQuery.data;
		}

		const deps: ListDomainsDeps = buildListDomainsDeps({ dbClient: adminClient });
		const params: ListDomainsParams = {};
		const payload: ListDomainsPayload = {};
		const result: ListDomainsResult = await listDomains(deps, params, payload);

		assertEquals(isListDomainsSuccessReturn(result), true);
		if (isListDomainsSuccessReturn(result)) {
			assertEquals(result.status, 200);
			assertEquals(result.data.length, expectedRows.length);

			for (let index = 0; index < expectedRows.length; index++) {
				const expectedRow: DialecticDomainRow = expectedRows[index];
				const actualRow: DialecticDomainRow = result.data[index];
				assertEquals(actualRow.id, expectedRow.id);
				assertEquals(actualRow.name, expectedRow.name);
				assertEquals(actualRow.description, expectedRow.description);
				assertEquals(actualRow.parent_domain_id, expectedRow.parent_domain_id);
				assertEquals(actualRow.is_enabled, expectedRow.is_enabled);
				assertEquals(actualRow.created_at, expectedRow.created_at);
				assertEquals(actualRow.updated_at, expectedRow.updated_at);
			}

			for (let index = 1; index < result.data.length; index++) {
				assertEquals(
					result.data[index - 1].name <= result.data[index].name,
					true,
				);
			}

			for (const candidateRow of expectedRows) {
				if (candidateRow.name === "Software Development") {
					const softwareDevelopmentExpected: DialecticDomainRow = candidateRow;
					let foundSoftwareDevelopment = false;
					for (let actualIndex = 0; actualIndex < result.data.length; actualIndex++) {
						const actualRow: DialecticDomainRow = result.data[actualIndex];
						if (actualRow.id === softwareDevelopmentExpected.id) {
							foundSoftwareDevelopment = true;
						}
					}
					assertEquals(foundSoftwareDevelopment, true);
				}
			}
		}
	} finally {
		await coreCleanupTestResources();
	}
});
