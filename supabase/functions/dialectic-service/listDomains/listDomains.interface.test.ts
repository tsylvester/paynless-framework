import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Database } from "../../types_db.ts";
import type {
	DialecticDomainRow,
	ListDomainsDeps,
	ListDomainsErrorReturn,
	ListDomainsFn,
	ListDomainsParams,
	ListDomainsPayload,
	ListDomainsResult,
	ListDomainsSuccessReturn,
} from "./listDomains.interface.ts";

Deno.test("ListDomainsParams contract: empty object has zero keys", () => {
	const params: ListDomainsParams = {};
	assertEquals(Object.keys(params).length, 0);
});

Deno.test("ListDomainsPayload contract: empty object has zero keys", () => {
	const payload: ListDomainsPayload = {};
	assertEquals(Object.keys(payload).length, 0);
});

Deno.test("ListDomainsDeps contract: dbClient is a required key", () => {
	const key: keyof ListDomainsDeps = "dbClient";
	assertEquals(key, "dbClient");
});

Deno.test("DialecticDomainRow contract: full row with every dialectic_domains Row field populated", () => {
	const row: DialecticDomainRow = {
		id: "domain-uuid-1",
		name: "Finance",
		description: "All about money",
		parent_domain_id: null,
		is_enabled: true,
		created_at: "2024-01-01T00:00:00.000Z",
		updated_at: "2024-01-02T00:00:00.000Z",
	};
	const dbRow: Database["public"]["Tables"]["dialectic_domains"]["Row"] = row;
	assertEquals(typeof dbRow.id, "string");
	assertEquals(dbRow.id.length > 0, true);
	assertEquals(typeof dbRow.name, "string");
	assertEquals(dbRow.name.length > 0, true);
	assertEquals(typeof dbRow.is_enabled, "boolean");
	assertEquals(typeof dbRow.created_at, "string");
	assertEquals(dbRow.created_at.length > 0, true);
	assertEquals(typeof dbRow.updated_at, "string");
	assertEquals(dbRow.updated_at.length > 0, true);
	assertEquals(dbRow.description === null || typeof dbRow.description === "string", true);
	assertEquals(dbRow.parent_domain_id === null || typeof dbRow.parent_domain_id === "string", true);
});

Deno.test("DialecticDomainRow contract: empty id is structurally assignable but invalid", () => {
	const row: DialecticDomainRow = {
		id: "",
		name: "Finance",
		description: null,
		parent_domain_id: null,
		is_enabled: true,
		created_at: "2024-01-01T00:00:00.000Z",
		updated_at: "2024-01-02T00:00:00.000Z",
	};
	assertEquals(row.id.length, 0);
});

Deno.test("ListDomainsSuccessReturn contract: status 200 and data, no error", () => {
	const domain: DialecticDomainRow = {
		id: "domain-uuid-1",
		name: "Finance",
		description: "All about money",
		parent_domain_id: null,
		is_enabled: true,
		created_at: "2024-01-01T00:00:00.000Z",
		updated_at: "2024-01-02T00:00:00.000Z",
	};
	const success: ListDomainsSuccessReturn = {
		status: 200,
		data: [domain],
	};
	assertEquals(success.status, 200);
	assertEquals(success.data !== undefined, true);
	assertEquals(success.error, undefined);
	assertEquals(Array.isArray(success.data), true);
	assertEquals(success.data.length, 1);
	assertEquals(success.data[0].name, "Finance");
});

Deno.test("ListDomainsErrorReturn contract: status and error, no data", () => {
	const errorReturn: ListDomainsErrorReturn = {
		status: 500,
		error: {
			message: "Could not fetch dialectic domains.",
			code: "DB_FETCH_FAILED",
			details: "connection failed",
		},
	};
	assertEquals(errorReturn.status, 500);
	assertEquals(errorReturn.data, undefined);
	assertEquals(errorReturn.error !== undefined, true);
	assertEquals(typeof errorReturn.error.message, "string");
	assertEquals(errorReturn.error.message.length > 0, true);
});

Deno.test("ListDomainsResult contract: success branch assignable", () => {
	const success: ListDomainsSuccessReturn = {
		status: 200,
		data: [{
			id: "domain-uuid-1",
			name: "Finance",
			description: null,
			parent_domain_id: null,
			is_enabled: true,
			created_at: "2024-01-01T00:00:00.000Z",
			updated_at: "2024-01-02T00:00:00.000Z",
		}],
	};
	const result: ListDomainsResult = success;
	assertEquals(result.status, 200);
	assertEquals(result.data !== undefined, true);
	assertEquals(result.error, undefined);
});

Deno.test("ListDomainsResult contract: error branch assignable", () => {
	const errorReturn: ListDomainsErrorReturn = {
		status: 500,
		error: { message: "Could not fetch dialectic domains.", code: "DB_FETCH_FAILED" },
	};
	const result: ListDomainsResult = errorReturn;
	assertEquals(result.status, 500);
	assertEquals(result.data, undefined);
	assertEquals(result.error !== undefined, true);
});

Deno.test(
	"Contract: ListDomainsFn accepts (deps, params, payload) and returns Promise<ListDomainsResult>",
	() => {
		const fn: ListDomainsFn = async (
			_deps: ListDomainsDeps,
			_params: ListDomainsParams,
			_payload: ListDomainsPayload,
		): Promise<ListDomainsResult> => {
			const success: ListDomainsSuccessReturn = {
				status: 200,
				data: [{
					id: "domain-uuid-1",
					name: "Finance",
					description: null,
					parent_domain_id: null,
					is_enabled: true,
					created_at: "2024-01-01T00:00:00.000Z",
					updated_at: "2024-01-02T00:00:00.000Z",
				}],
			};
			return success;
		};
		assertEquals(typeof fn, "function");
	},
);
