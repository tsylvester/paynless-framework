import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Database } from "../../types_db.ts";
import type {
	DomainProcessAssociationRow,
	FetchProcessAssociationDeps,
	FetchProcessAssociationErrorReturn,
	FetchProcessAssociationFn,
	FetchProcessAssociationParams,
	FetchProcessAssociationPayload,
	FetchProcessAssociationResult,
	FetchProcessAssociationSuccessReturn,
} from "./fetchProcessAssociation.interface.ts";

Deno.test("FetchProcessAssociationParams contract: empty object has zero keys", () => {
	const params: FetchProcessAssociationParams = {};
	assertEquals(Object.keys(params).length, 0);
});

Deno.test("FetchProcessAssociationPayload contract: domainId is the required key", () => {
	const payloadKey: keyof FetchProcessAssociationPayload = "domainId";
	assertEquals(payloadKey, "domainId");
	const payload: FetchProcessAssociationPayload = { domainId: "uuid-string" };
	assertEquals(payload.domainId, "uuid-string");
	// Empty {} may be structurally assignable in some partial shapes; invalid at handler entry (guard tests).
});

Deno.test("FetchProcessAssociationDeps contract: dbClient is a required key", () => {
	const key: keyof FetchProcessAssociationDeps = "dbClient";
	assertEquals(key, "dbClient");
});

Deno.test(
	"DomainProcessAssociationRow contract: full row with every domain_process_associations Row field populated",
	() => {
		const row: DomainProcessAssociationRow = {
			id: "association-uuid-1",
			domain_id: "domain-uuid-1",
			process_template_id: "pt-thesis",
			is_default_for_domain: true,
			created_at: "2024-01-01T00:00:00.000Z",
			updated_at: "2024-01-02T00:00:00.000Z",
		};
		const dbRow: Database["public"]["Tables"]["domain_process_associations"]["Row"] = row;
		assertEquals(typeof dbRow.id, "string");
		assertEquals(dbRow.id.length > 0, true);
		assertEquals(typeof dbRow.domain_id, "string");
		assertEquals(dbRow.domain_id.length > 0, true);
		assertEquals(typeof dbRow.process_template_id, "string");
		assertEquals(dbRow.process_template_id.length > 0, true);
		assertEquals(dbRow.is_default_for_domain, true);
		assertEquals(typeof dbRow.created_at, "string");
		assertEquals(dbRow.created_at.length > 0, true);
		assertEquals(typeof dbRow.updated_at, "string");
		assertEquals(dbRow.updated_at.length > 0, true);
	},
);

Deno.test("FetchProcessAssociationSuccessReturn contract: status 200 and data, no error", () => {
	const association: DomainProcessAssociationRow = {
		id: "association-uuid-1",
		domain_id: "domain-uuid-1",
		process_template_id: "pt-thesis",
		is_default_for_domain: true,
		created_at: "2024-01-01T00:00:00.000Z",
		updated_at: "2024-01-02T00:00:00.000Z",
	};
	const success: FetchProcessAssociationSuccessReturn = {
		status: 200,
		data: association,
	};
	assertEquals(success.status, 200);
	assertEquals(success.data !== undefined, true);
	assertEquals(success.error, undefined);
	assertEquals(success.data.id, "association-uuid-1");
	assertEquals(success.data.process_template_id, "pt-thesis");
});

Deno.test("FetchProcessAssociationErrorReturn contract: status and error, no data", () => {
	const errorReturn: FetchProcessAssociationErrorReturn = {
		status: 404,
		error: {
			message: "No default process association found for the domain.",
			code: "NOT_FOUND",
		},
	};
	assertEquals(errorReturn.status, 404);
	assertEquals(errorReturn.data, undefined);
	assertEquals(errorReturn.error !== undefined, true);
	assertEquals(typeof errorReturn.error.message, "string");
	assertEquals(errorReturn.error.message.length > 0, true);
	assertEquals(typeof errorReturn.error.code, "string");
});

Deno.test("FetchProcessAssociationResult contract: success branch assignable", () => {
	const success: FetchProcessAssociationSuccessReturn = {
		status: 200,
		data: {
			id: "association-uuid-1",
			domain_id: "domain-uuid-1",
			process_template_id: "pt-thesis",
			is_default_for_domain: true,
			created_at: "2024-01-01T00:00:00.000Z",
			updated_at: "2024-01-02T00:00:00.000Z",
		},
	};
	const result: FetchProcessAssociationResult = success;
	assertEquals(result.status, 200);
	assertEquals(result.data !== undefined, true);
	assertEquals(result.error, undefined);
});

Deno.test("FetchProcessAssociationResult contract: error branch assignable", () => {
	const errorReturn: FetchProcessAssociationErrorReturn = {
		status: 400,
		error: {
			message: "domainId is required and must be a non-empty string",
			code: "VALIDATION_ERROR",
		},
	};
	const result: FetchProcessAssociationResult = errorReturn;
	assertEquals(result.status, 400);
	assertEquals(result.data, undefined);
	assertEquals(result.error !== undefined, true);
});

Deno.test(
	"Contract: FetchProcessAssociationFn accepts (deps, params, payload) and returns Promise<FetchProcessAssociationResult>",
	() => {
		const fn: FetchProcessAssociationFn = async (
			_deps: FetchProcessAssociationDeps,
			_params: FetchProcessAssociationParams,
			_payload: FetchProcessAssociationPayload,
		): Promise<FetchProcessAssociationResult> => {
			const success: FetchProcessAssociationSuccessReturn = {
				status: 200,
				data: {
					id: "association-uuid-1",
					domain_id: _payload.domainId,
					process_template_id: "pt-thesis",
					is_default_for_domain: true,
					created_at: "2024-01-01T00:00:00.000Z",
					updated_at: "2024-01-02T00:00:00.000Z",
				},
			};
			return success;
		};
		assertEquals(typeof fn, "function");
	},
);
