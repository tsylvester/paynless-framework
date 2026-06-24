import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
	DomainProcessAssociationRow,
	FetchProcessAssociationErrorReturn,
	FetchProcessAssociationParams,
	FetchProcessAssociationPayload,
	FetchProcessAssociationResult,
	FetchProcessAssociationSuccessReturn,
} from "./fetchProcessAssociation.interface.ts";
import {
	buildDomainProcessAssociationRow,
	buildFetchProcessAssociationErrorReturn,
	buildFetchProcessAssociationParams,
	buildFetchProcessAssociationPayload,
	buildFetchProcessAssociationResult,
	buildFetchProcessAssociationSuccessReturn,
} from "./fetchProcessAssociation.mock.ts";
import {
	isDomainProcessAssociationRow,
	isFetchProcessAssociationErrorReturn,
	isFetchProcessAssociationParams,
	isFetchProcessAssociationPayload,
	isFetchProcessAssociationResult,
	isFetchProcessAssociationSuccessReturn,
} from "./fetchProcessAssociation.guard.ts";

Deno.test("isFetchProcessAssociationPayload accepts valid payload from mock builder", () => {
	const valid: FetchProcessAssociationPayload = buildFetchProcessAssociationPayload();
	assertEquals(isFetchProcessAssociationPayload(valid), true);
});

Deno.test("isFetchProcessAssociationPayload rejects null undefined empty record and extra keys", () => {
	assertEquals(isFetchProcessAssociationPayload(null), false);
	assertEquals(isFetchProcessAssociationPayload(undefined), false);
	assertEquals(isFetchProcessAssociationPayload({}), false);
	assertEquals(
		isFetchProcessAssociationPayload({
			domainId: "domain-uuid-software",
			extra: true,
		}),
		false,
	);
});

Deno.test("isFetchProcessAssociationPayload rejects empty domainId from mock override", () => {
	const invalid: FetchProcessAssociationPayload = buildFetchProcessAssociationPayload({
		domainId: "",
	});
	assertEquals(isFetchProcessAssociationPayload(invalid), false);
});

Deno.test("isFetchProcessAssociationParams accepts valid params from mock builder", () => {
	const valid: FetchProcessAssociationParams = buildFetchProcessAssociationParams();
	assertEquals(isFetchProcessAssociationParams(valid), true);
});

Deno.test("isFetchProcessAssociationParams rejects null undefined and record with extra keys", () => {
	assertEquals(isFetchProcessAssociationParams(null), false);
	assertEquals(isFetchProcessAssociationParams(undefined), false);
	assertEquals(isFetchProcessAssociationParams({ extra: true }), false);
});

Deno.test("isDomainProcessAssociationRow accepts valid row from mock builder", () => {
	const valid: DomainProcessAssociationRow = buildDomainProcessAssociationRow();
	assertEquals(isDomainProcessAssociationRow(valid), true);
});

Deno.test("isDomainProcessAssociationRow rejects null undefined and empty record", () => {
	assertEquals(isDomainProcessAssociationRow(null), false);
	assertEquals(isDomainProcessAssociationRow(undefined), false);
	assertEquals(isDomainProcessAssociationRow({}), false);
});

Deno.test("isDomainProcessAssociationRow rejects empty id from mock override", () => {
	const valid: DomainProcessAssociationRow = buildDomainProcessAssociationRow();
	const withEmptyId: DomainProcessAssociationRow = { ...valid, id: "" };
	assertEquals(isDomainProcessAssociationRow(withEmptyId), false);
});

Deno.test("isDomainProcessAssociationRow rejects is_default_for_domain false from mock override", () => {
	const valid: DomainProcessAssociationRow = buildDomainProcessAssociationRow();
	const notDefault: DomainProcessAssociationRow = {
		...valid,
		is_default_for_domain: false,
	};
	assertEquals(isDomainProcessAssociationRow(notDefault), false);
});

Deno.test("isDomainProcessAssociationRow rejects partial row missing updated_at from mock factory", () => {
	const valid: DomainProcessAssociationRow = buildDomainProcessAssociationRow();
	const { updated_at: _updatedAt, ...partialWithoutUpdatedAt } = valid;
	assertEquals(isDomainProcessAssociationRow(partialWithoutUpdatedAt), false);
});

Deno.test("isFetchProcessAssociationSuccessReturn accepts valid success from mock builder", () => {
	const valid: FetchProcessAssociationSuccessReturn = buildFetchProcessAssociationSuccessReturn();
	assertEquals(isFetchProcessAssociationSuccessReturn(valid), true);
});

Deno.test("isFetchProcessAssociationSuccessReturn rejects null undefined and empty record", () => {
	assertEquals(isFetchProcessAssociationSuccessReturn(null), false);
	assertEquals(isFetchProcessAssociationSuccessReturn(undefined), false);
	assertEquals(isFetchProcessAssociationSuccessReturn({}), false);
});

Deno.test("isFetchProcessAssociationSuccessReturn rejects success object with error present", () => {
	const valid: FetchProcessAssociationSuccessReturn = buildFetchProcessAssociationSuccessReturn();
	assertEquals(
		isFetchProcessAssociationSuccessReturn({
			...valid,
			error: { message: "unexpected error", code: "UNEXPECTED" },
		}),
		false,
	);
});

Deno.test("isFetchProcessAssociationSuccessReturn rejects invalid association in data", () => {
	const valid: FetchProcessAssociationSuccessReturn = buildFetchProcessAssociationSuccessReturn();
	assertEquals(
		isFetchProcessAssociationSuccessReturn({
			...valid,
			data: { ...valid.data, process_template_id: "" },
		}),
		false,
	);
});

Deno.test("isFetchProcessAssociationErrorReturn accepts valid error return from mock builder", () => {
	const valid: FetchProcessAssociationErrorReturn = buildFetchProcessAssociationErrorReturn();
	assertEquals(isFetchProcessAssociationErrorReturn(valid), true);
});

Deno.test("isFetchProcessAssociationErrorReturn rejects null undefined and empty record", () => {
	assertEquals(isFetchProcessAssociationErrorReturn(null), false);
	assertEquals(isFetchProcessAssociationErrorReturn(undefined), false);
	assertEquals(isFetchProcessAssociationErrorReturn({}), false);
});

Deno.test("isFetchProcessAssociationErrorReturn rejects error object with data present", () => {
	const valid: FetchProcessAssociationErrorReturn = buildFetchProcessAssociationErrorReturn();
	assertEquals(
		isFetchProcessAssociationErrorReturn({
			...valid,
			data: buildDomainProcessAssociationRow(),
		}),
		false,
	);
});

Deno.test("isFetchProcessAssociationErrorReturn rejects empty error message from mock override", () => {
	const valid: FetchProcessAssociationErrorReturn = buildFetchProcessAssociationErrorReturn();
	assertEquals(
		isFetchProcessAssociationErrorReturn({
			...valid,
			error: { ...valid.error, message: "" },
		}),
		false,
	);
});

Deno.test("isFetchProcessAssociationErrorReturn rejects empty error code from mock override", () => {
	const valid: FetchProcessAssociationErrorReturn = buildFetchProcessAssociationErrorReturn();
	assertEquals(
		isFetchProcessAssociationErrorReturn({
			...valid,
			error: { ...valid.error, code: "" },
		}),
		false,
	);
});

Deno.test("isFetchProcessAssociationResult accepts valid success result from mock builder", () => {
	const valid: FetchProcessAssociationResult = buildFetchProcessAssociationSuccessReturn();
	assertEquals(isFetchProcessAssociationResult(valid), true);
});

Deno.test("isFetchProcessAssociationResult accepts valid error result from mock builder", () => {
	const valid: FetchProcessAssociationResult = buildFetchProcessAssociationErrorReturn();
	assertEquals(isFetchProcessAssociationResult(valid), true);
});

Deno.test("isFetchProcessAssociationResult rejects null undefined and empty record", () => {
	assertEquals(isFetchProcessAssociationResult(null), false);
	assertEquals(isFetchProcessAssociationResult(undefined), false);
	assertEquals(isFetchProcessAssociationResult({}), false);
});

Deno.test("isFetchProcessAssociationResult rejects combined success and error shape", () => {
	const success: FetchProcessAssociationSuccessReturn = buildFetchProcessAssociationSuccessReturn();
	const errorReturn: FetchProcessAssociationErrorReturn = buildFetchProcessAssociationErrorReturn();
	assertEquals(
		isFetchProcessAssociationResult({
			status: success.status,
			data: success.data,
			error: errorReturn.error,
		}),
		false,
	);
});

Deno.test("isFetchProcessAssociationResult rejects invalid branch from mock builder override", () => {
	const invalid: FetchProcessAssociationResult = buildFetchProcessAssociationResult({
		error: { message: "" },
	});
	assertEquals(isFetchProcessAssociationResult(invalid), false);
});
