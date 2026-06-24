import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../../types_db.ts";
import {
	createMockSupabaseClient,
	type MockSupabaseDataConfig,
} from "../../_shared/supabase.mock.ts";
import type {
	DialecticDomainRow,
	ListDomainsParams,
	ListDomainsPayload,
	ListDomainsResult,
} from "./listDomains.interface.ts";
import {
	isListDomainsErrorReturn,
	isListDomainsSuccessReturn,
} from "./listDomains.guard.ts";
import { listDomains } from "./listDomains.ts";
import {
	buildListDomainsDeps,
	buildListDomainsSuccessReturn,
} from "./listDomains.mock.ts";

Deno.test("listDomains: valid call returns ListDomainsSuccessReturn with name-sorted full rows", async () => {
	const unsortedRows: DialecticDomainRow[] = buildListDomainsSuccessReturn().data;
	const sortedRows: DialecticDomainRow[] = [...unsortedRows].sort(
		(left, right) => left.name.localeCompare(right.name),
	);
	const config: MockSupabaseDataConfig = {
		genericMockResults: {
			dialectic_domains: {
				select: {
					data: sortedRows,
					error: null,
					count: sortedRows.length,
					status: 200,
					statusText: "OK",
				},
			},
		},
	};
	const setup = createMockSupabaseClient("list-domains-unit-user", config);
	const deps = buildListDomainsDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
	});
	const params: ListDomainsParams = {};
	const payload: ListDomainsPayload = {};
	const result: ListDomainsResult = await listDomains(deps, params, payload);
	assertEquals(isListDomainsSuccessReturn(result), true);
	if (isListDomainsSuccessReturn(result)) {
		assertEquals(result.data.length, 3);
		assertEquals(result.data[0].name, "Finance");
		for (const row of result.data) {
			assertEquals(typeof row.created_at, "string");
			assertEquals(row.created_at.length > 0, true);
			assertEquals(typeof row.updated_at, "string");
			assertEquals(row.updated_at.length > 0, true);
		}
	}
});

Deno.test("listDomains: DB error returns ListDomainsErrorReturn with DB_FETCH_FAILED", async () => {
	const dbError: Error = new Error("Connection failed");
	const config: MockSupabaseDataConfig = {
		genericMockResults: {
			dialectic_domains: {
				select: {
					data: null,
					error: dbError,
					count: null,
					status: 500,
					statusText: "Internal Server Error",
				},
			},
		},
	};
	const setup = createMockSupabaseClient("list-domains-unit-user", config);
	const deps = buildListDomainsDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
	});
	const params: ListDomainsParams = {};
	const payload: ListDomainsPayload = {};
	const result: ListDomainsResult = await listDomains(deps, params, payload);
	assertEquals(isListDomainsErrorReturn(result), true);
	if (isListDomainsErrorReturn(result)) {
		assertEquals(result.status, 500);
		assertEquals(result.data, undefined);
		assertEquals(result.error.code, "DB_FETCH_FAILED");
		assertEquals(result.error.message, "Could not fetch dialectic domains.");
	}
});

Deno.test("listDomains: empty enabled set returns ListDomainsSuccessReturn with empty data", async () => {
	const config: MockSupabaseDataConfig = {
		genericMockResults: {
			dialectic_domains: {
				select: {
					data: [],
					error: null,
					count: 0,
					status: 200,
					statusText: "OK",
				},
			},
		},
	};
	const setup = createMockSupabaseClient("list-domains-unit-user", config);
	const deps = buildListDomainsDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
	});
	const params: ListDomainsParams = {};
	const payload: ListDomainsPayload = {};
	const result: ListDomainsResult = await listDomains(deps, params, payload);
	assertEquals(isListDomainsSuccessReturn(result), true);
	if (isListDomainsSuccessReturn(result)) {
		assertEquals(result.data, []);
	}
});

Deno.test("listDomains: queries dialectic_domains only and never domain_process_associations", async () => {
	const unsortedRows: DialecticDomainRow[] = buildListDomainsSuccessReturn().data;
	const sortedRows: DialecticDomainRow[] = [...unsortedRows].sort(
		(left, right) => left.name.localeCompare(right.name),
	);
	const config: MockSupabaseDataConfig = {
		genericMockResults: {
			dialectic_domains: {
				select: {
					data: sortedRows,
					error: null,
					count: sortedRows.length,
					status: 200,
					statusText: "OK",
				},
			},
		},
	};
	const setup = createMockSupabaseClient("list-domains-unit-user", config);
	const deps = buildListDomainsDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
	});
	const params: ListDomainsParams = {};
	const payload: ListDomainsPayload = {};
	await listDomains(deps, params, payload);
	assertEquals(setup.spies.fromSpy.calls.length, 1);
	assertEquals(setup.spies.fromSpy.calls[0].args[0], "dialectic_domains");
	for (const call of setup.spies.fromSpy.calls) {
		assertEquals(call.args[0] !== "domain_process_associations", true);
	}
});
