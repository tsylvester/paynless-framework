import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PostgrestError, SupabaseClient } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../../types_db.ts";
import {
	createMockSupabaseClient,
	type MockSupabaseDataConfig,
} from "../../_shared/supabase.mock.ts";
import type {
	DomainProcessAssociationRow,
	FetchProcessAssociationParams,
	FetchProcessAssociationPayload,
	FetchProcessAssociationResult,
} from "./fetchProcessAssociation.interface.ts";
import {
	isFetchProcessAssociationErrorReturn,
	isFetchProcessAssociationSuccessReturn,
} from "./fetchProcessAssociation.guard.ts";
import { fetchProcessAssociation } from "./fetchProcessAssociation.ts";
import {
	buildDomainProcessAssociationRow,
	buildFetchProcessAssociationDeps,
	buildFetchProcessAssociationPayload,
} from "./fetchProcessAssociation.mock.ts";

Deno.test("fetchProcessAssociation: valid domainId returns success with full default association row", async () => {
	const domainId: string = "domain-uuid-software";
	const associationRow: DomainProcessAssociationRow = buildDomainProcessAssociationRow({
		domain_id: domainId,
		process_template_id: "pt-thesis",
	});
	const config: MockSupabaseDataConfig = {
		genericMockResults: {
			domain_process_associations: {
				select: {
					data: [associationRow],
					error: null,
					count: 1,
					status: 200,
					statusText: "OK",
				},
			},
		},
	};
	const setup = createMockSupabaseClient("fetch-process-association-unit-user", config);
	const deps = buildFetchProcessAssociationDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
	});
	const params: FetchProcessAssociationParams = {};
	const payload: FetchProcessAssociationPayload = { domainId };
	const result: FetchProcessAssociationResult = await fetchProcessAssociation(deps, params, payload);
	assertEquals(isFetchProcessAssociationSuccessReturn(result), true);
	if (isFetchProcessAssociationSuccessReturn(result)) {
		assertEquals(result.status, 200);
		assertEquals(result.data.process_template_id, "pt-thesis");
		assertEquals(result.data.is_default_for_domain, true);
		assertEquals(result.data.domain_id, domainId);
		assertEquals(typeof result.data.created_at, "string");
		assertEquals(result.data.created_at.length > 0, true);
		assertEquals(typeof result.data.updated_at, "string");
		assertEquals(result.data.updated_at.length > 0, true);
	}
});

Deno.test("fetchProcessAssociation: PGRST116 returns NOT_FOUND without data", async () => {
	const domainId: string = "domain-uuid-missing";
	const pgRestNotFoundError: PostgrestError = {
		name: "PostgrestError",
		message: "JSON object requested, multiple (or no) rows returned",
		code: "PGRST116",
		details: "",
		hint: "",
	};
	const config: MockSupabaseDataConfig = {
		genericMockResults: {
			domain_process_associations: {
				select: {
					data: null,
					error: pgRestNotFoundError,
					count: null,
					status: 406,
					statusText: "Not Acceptable",
				},
			},
		},
	};
	const setup = createMockSupabaseClient("fetch-process-association-unit-user", config);
	const deps = buildFetchProcessAssociationDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
	});
	const params: FetchProcessAssociationParams = {};
	const payload: FetchProcessAssociationPayload = { domainId };
	const result: FetchProcessAssociationResult = await fetchProcessAssociation(deps, params, payload);
	assertEquals(isFetchProcessAssociationErrorReturn(result), true);
	if (isFetchProcessAssociationErrorReturn(result)) {
		assertEquals(result.status, 404);
		assertEquals(result.data, undefined);
		assertEquals(result.error.code, "NOT_FOUND");
	}
});

Deno.test("fetchProcessAssociation: null data and null error returns NOT_FOUND without data", async () => {
	const domainId: string = "domain-uuid-missing";
	const config: MockSupabaseDataConfig = {
		genericMockResults: {
			domain_process_associations: {
				select: {
					data: null,
					error: null,
					count: null,
					status: 200,
					statusText: "OK",
				},
			},
		},
	};
	const setup = createMockSupabaseClient("fetch-process-association-unit-user", config);
	const deps = buildFetchProcessAssociationDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
	});
	const params: FetchProcessAssociationParams = {};
	const payload: FetchProcessAssociationPayload = { domainId };
	const result: FetchProcessAssociationResult = await fetchProcessAssociation(deps, params, payload);
	assertEquals(isFetchProcessAssociationErrorReturn(result), true);
	if (isFetchProcessAssociationErrorReturn(result)) {
		assertEquals(result.status, 404);
		assertEquals(result.data, undefined);
		assertEquals(result.error.code, "NOT_FOUND");
	}
});

Deno.test("fetchProcessAssociation: empty domainId returns VALIDATION_ERROR without calling DB", async () => {
	const config: MockSupabaseDataConfig = {
		genericMockResults: {
			domain_process_associations: {
				select: {
					data: [buildDomainProcessAssociationRow()],
					error: null,
					count: 1,
					status: 200,
					statusText: "OK",
				},
			},
		},
	};
	const setup = createMockSupabaseClient("fetch-process-association-unit-user", config);
	const deps = buildFetchProcessAssociationDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
	});
	const params: FetchProcessAssociationParams = {};
	const payload: FetchProcessAssociationPayload = { domainId: "" };
	const result: FetchProcessAssociationResult = await fetchProcessAssociation(deps, params, payload);
	assertEquals(isFetchProcessAssociationErrorReturn(result), true);
	if (isFetchProcessAssociationErrorReturn(result)) {
		assertEquals(result.status, 400);
		assertEquals(result.error.code, "VALIDATION_ERROR");
		assertEquals(result.data, undefined);
	}
	assertEquals(setup.spies.fromSpy.calls.length, 0);
});

Deno.test("fetchProcessAssociation: empty payload returns VALIDATION_ERROR without calling DB", async () => {
	const config: MockSupabaseDataConfig = {
		genericMockResults: {
			domain_process_associations: {
				select: {
					data: [buildDomainProcessAssociationRow()],
					error: null,
					count: 1,
					status: 200,
					statusText: "OK",
				},
			},
		},
	};
	const setup = createMockSupabaseClient("fetch-process-association-unit-user", config);
	const deps = buildFetchProcessAssociationDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
	});
	const params: FetchProcessAssociationParams = {};
	const payload: FetchProcessAssociationPayload = buildFetchProcessAssociationPayload();
	Reflect.deleteProperty(payload, "domainId");
	const result: FetchProcessAssociationResult = await fetchProcessAssociation(deps, params, payload);
	assertEquals(isFetchProcessAssociationErrorReturn(result), true);
	if (isFetchProcessAssociationErrorReturn(result)) {
		assertEquals(result.status, 400);
		assertEquals(result.error.code, "VALIDATION_ERROR");
		assertEquals(result.data, undefined);
	}
	assertEquals(setup.spies.fromSpy.calls.length, 0);
});

Deno.test("fetchProcessAssociation: non-PGRST116 DB error returns DB_FETCH_FAILED", async () => {
	const domainId: string = "domain-uuid-software";
	const dbError: PostgrestError = {
		name: "PostgrestError",
		message: "Connection failed",
		code: "08006",
		details: "",
		hint: "",
	};
	const config: MockSupabaseDataConfig = {
		genericMockResults: {
			domain_process_associations: {
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
	const setup = createMockSupabaseClient("fetch-process-association-unit-user", config);
	const deps = buildFetchProcessAssociationDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
	});
	const params: FetchProcessAssociationParams = {};
	const payload: FetchProcessAssociationPayload = { domainId };
	const result: FetchProcessAssociationResult = await fetchProcessAssociation(deps, params, payload);
	assertEquals(isFetchProcessAssociationErrorReturn(result), true);
	if (isFetchProcessAssociationErrorReturn(result)) {
		assertEquals(result.status, 500);
		assertEquals(result.error.code, "DB_FETCH_FAILED");
		assertEquals(result.error.message, "Could not fetch domain process association.");
		assertEquals(result.data, undefined);
	}
});

Deno.test("fetchProcessAssociation: queries domain_process_associations only", async () => {
	const domainId: string = "domain-uuid-software";
	const associationRow: DomainProcessAssociationRow = buildDomainProcessAssociationRow({
		domain_id: domainId,
	});
	const config: MockSupabaseDataConfig = {
		genericMockResults: {
			domain_process_associations: {
				select: {
					data: [associationRow],
					error: null,
					count: 1,
					status: 200,
					statusText: "OK",
				},
			},
		},
	};
	const setup = createMockSupabaseClient("fetch-process-association-unit-user", config);
	const deps = buildFetchProcessAssociationDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
	});
	const params: FetchProcessAssociationParams = {};
	const payload: FetchProcessAssociationPayload = { domainId };
	await fetchProcessAssociation(deps, params, payload);
	assertEquals(setup.spies.fromSpy.calls.length, 1);
	assertEquals(setup.spies.fromSpy.calls[0].args[0], "domain_process_associations");
	for (const call of setup.spies.fromSpy.calls) {
		assertEquals(call.args[0] !== "dialectic_domains", true);
		assertEquals(call.args[0] !== "dialectic_process_templates", true);
	}
});
