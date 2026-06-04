import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
	DialecticDomainRow,
	ListDomainsErrorReturn,
	ListDomainsParams,
	ListDomainsPayload,
	ListDomainsResult,
	ListDomainsSuccessReturn,
} from "./listDomains.interface.ts";
import {
	buildDialecticDomainRow,
	buildListDomainsErrorReturn,
	buildListDomainsParams,
	buildListDomainsPayload,
	buildListDomainsResult,
	buildListDomainsSuccessReturn,
} from "./listDomains.mock.ts";
import {
	isDialecticDomainRow,
	isListDomainsErrorReturn,
	isListDomainsParams,
	isListDomainsPayload,
	isListDomainsResult,
	isListDomainsSuccessReturn,
} from "./listDomains.guard.ts";

Deno.test("isListDomainsPayload accepts valid payload from mock builder", () => {
	const valid: ListDomainsPayload = buildListDomainsPayload();
	assertEquals(isListDomainsPayload(valid), true);
});

Deno.test("isListDomainsPayload rejects null undefined and record with extra keys", () => {
	assertEquals(isListDomainsPayload(null), false);
	assertEquals(isListDomainsPayload(undefined), false);
	assertEquals(isListDomainsPayload({ extra: true }), false);
});

Deno.test("isListDomainsParams accepts valid params from mock builder", () => {
	const valid: ListDomainsParams = buildListDomainsParams();
	assertEquals(isListDomainsParams(valid), true);
});

Deno.test("isListDomainsParams rejects null undefined and record with extra keys", () => {
	assertEquals(isListDomainsParams(null), false);
	assertEquals(isListDomainsParams(undefined), false);
	assertEquals(isListDomainsParams({ extra: true }), false);
});

Deno.test("isDialecticDomainRow accepts valid row from mock builder", () => {
	const valid: DialecticDomainRow = buildDialecticDomainRow();
	assertEquals(isDialecticDomainRow(valid), true);
});

Deno.test("isDialecticDomainRow accepts software-shaped valid row from mock builder", () => {
	const valid: DialecticDomainRow = buildDialecticDomainRow({
		id: "domain-uuid-software",
		name: "Software Development",
		description: "All about code",
	});
	assertEquals(isDialecticDomainRow(valid), true);
});

Deno.test("isDialecticDomainRow rejects null undefined and empty record", () => {
	assertEquals(isDialecticDomainRow(null), false);
	assertEquals(isDialecticDomainRow(undefined), false);
	assertEquals(isDialecticDomainRow({}), false);
});

Deno.test("isDialecticDomainRow rejects empty id from mock override", () => {
	const valid: DialecticDomainRow = buildDialecticDomainRow();
	const withEmptyId: DialecticDomainRow = { ...valid, id: "" };
	assertEquals(isDialecticDomainRow(withEmptyId), false);
});

Deno.test("isDialecticDomainRow rejects empty name from mock override", () => {
	const valid: DialecticDomainRow = buildDialecticDomainRow();
	const withEmptyName: DialecticDomainRow = { ...valid, name: "" };
	assertEquals(isDialecticDomainRow(withEmptyName), false);
});

Deno.test("isDialecticDomainRow rejects partial row missing created_at from mock factory", () => {
	const valid: DialecticDomainRow = buildDialecticDomainRow();
	const { created_at: _createdAt, ...partialWithoutCreatedAt } = valid;
	assertEquals(isDialecticDomainRow(partialWithoutCreatedAt), false);
});

Deno.test("isListDomainsSuccessReturn accepts valid success from mock builder", () => {
	const valid: ListDomainsSuccessReturn = buildListDomainsSuccessReturn();
	assertEquals(isListDomainsSuccessReturn(valid), true);
});

Deno.test("isListDomainsSuccessReturn rejects null undefined and empty record", () => {
	assertEquals(isListDomainsSuccessReturn(null), false);
	assertEquals(isListDomainsSuccessReturn(undefined), false);
	assertEquals(isListDomainsSuccessReturn({}), false);
});

Deno.test("isListDomainsSuccessReturn rejects success object with error present", () => {
	const valid: ListDomainsSuccessReturn = buildListDomainsSuccessReturn();
	assertEquals(
		isListDomainsSuccessReturn({
			...valid,
			error: { message: "unexpected error" },
		}),
		false,
	);
});

Deno.test("isListDomainsSuccessReturn rejects invalid domain element in data", () => {
	const valid: ListDomainsSuccessReturn = buildListDomainsSuccessReturn();
	assertEquals(
		isListDomainsSuccessReturn({
			...valid,
			data: [{ ...valid.data[0], id: "" }],
		}),
		false,
	);
});

Deno.test("isListDomainsErrorReturn accepts valid error return from mock builder", () => {
	const valid: ListDomainsErrorReturn = buildListDomainsErrorReturn();
	assertEquals(isListDomainsErrorReturn(valid), true);
});

Deno.test("isListDomainsErrorReturn rejects null undefined and empty record", () => {
	assertEquals(isListDomainsErrorReturn(null), false);
	assertEquals(isListDomainsErrorReturn(undefined), false);
	assertEquals(isListDomainsErrorReturn({}), false);
});

Deno.test("isListDomainsErrorReturn rejects error object with data present", () => {
	const valid: ListDomainsErrorReturn = buildListDomainsErrorReturn();
	assertEquals(
		isListDomainsErrorReturn({
			...valid,
			data: [buildDialecticDomainRow()],
		}),
		false,
	);
});

Deno.test("isListDomainsErrorReturn rejects empty error message from mock override", () => {
	const valid: ListDomainsErrorReturn = buildListDomainsErrorReturn();
	assertEquals(
		isListDomainsErrorReturn({
			...valid,
			error: { ...valid.error, message: "" },
		}),
		false,
	);
});

Deno.test("isListDomainsResult accepts valid success result from mock builder", () => {
	const valid: ListDomainsResult = buildListDomainsSuccessReturn();
	assertEquals(isListDomainsResult(valid), true);
});

Deno.test("isListDomainsResult accepts valid error result from mock builder", () => {
	const valid: ListDomainsResult = buildListDomainsErrorReturn();
	assertEquals(isListDomainsResult(valid), true);
});

Deno.test("isListDomainsResult rejects null undefined and empty record", () => {
	assertEquals(isListDomainsResult(null), false);
	assertEquals(isListDomainsResult(undefined), false);
	assertEquals(isListDomainsResult({}), false);
});

Deno.test("isListDomainsResult rejects combined success and error shape", () => {
	const success: ListDomainsSuccessReturn = buildListDomainsSuccessReturn();
	const errorReturn: ListDomainsErrorReturn = buildListDomainsErrorReturn();
	assertEquals(
		isListDomainsResult({
			status: success.status,
			data: success.data,
			error: errorReturn.error,
		}),
		false,
	);
});

Deno.test("isListDomainsResult rejects invalid branch from mock builder override", () => {
	const invalid: ListDomainsResult = buildListDomainsResult({
		error: { message: "" },
	});
	assertEquals(isListDomainsResult(invalid), false);
});
