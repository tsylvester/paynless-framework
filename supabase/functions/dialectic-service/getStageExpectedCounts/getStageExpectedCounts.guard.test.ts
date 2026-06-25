import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
	GetStageExpectedCountsPayload,
	GetStageExpectedCountsResponse,
	StageExpectedCount,
} from "./getStageExpectedCounts.interface.ts";
import {
	buildGetStageExpectedCountsPayload,
	buildGetStageExpectedCountsResponse,
	buildStageExpectedCount,
} from "./getStageExpectedCounts.mock.ts";
import {
	isGetStageExpectedCountsPayload,
	isGetStageExpectedCountsResponse,
	isStageExpectedCount,
} from "./getStageExpectedCounts.guard.ts";

Deno.test("isGetStageExpectedCountsPayload accepts valid payload from mock builder", () => {
	const valid: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload();
	assertEquals(isGetStageExpectedCountsPayload(valid), true);
});

Deno.test("isGetStageExpectedCountsPayload rejects null undefined and empty record", () => {
	assertEquals(isGetStageExpectedCountsPayload(null), false);
	assertEquals(isGetStageExpectedCountsPayload(undefined), false);
	assertEquals(isGetStageExpectedCountsPayload({}), false);
});

Deno.test("isGetStageExpectedCountsPayload rejects empty processTemplateId from mock override", () => {
	const valid: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload();
	const withEmptyId: GetStageExpectedCountsPayload = {
		...valid,
		processTemplateId: "",
	};
	assertEquals(isGetStageExpectedCountsPayload(withEmptyId), false);
});

Deno.test("isGetStageExpectedCountsPayload rejects zero modelCount from mock override", () => {
	const valid: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload();
	const withZero: GetStageExpectedCountsPayload = { ...valid, modelCount: 0 };
	assertEquals(isGetStageExpectedCountsPayload(withZero), false);
});

Deno.test("isGetStageExpectedCountsPayload rejects negative modelCount from mock override", () => {
	const valid: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload();
	const withNegative: GetStageExpectedCountsPayload = { ...valid, modelCount: -1 };
	assertEquals(isGetStageExpectedCountsPayload(withNegative), false);
});

Deno.test("isGetStageExpectedCountsPayload rejects non-integer modelCount from mock override", () => {
	const valid: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload();
	const withFraction: GetStageExpectedCountsPayload = { ...valid, modelCount: 1.5 };
	assertEquals(isGetStageExpectedCountsPayload(withFraction), false);
});

Deno.test("isStageExpectedCount accepts valid entry from mock builder", () => {
	const valid: StageExpectedCount = buildStageExpectedCount();
	assertEquals(isStageExpectedCount(valid), true);
});

Deno.test("isStageExpectedCount accepts synthesis-shaped valid entry from mock builder", () => {
	const valid: StageExpectedCount = buildStageExpectedCount({
		stageSlug: "synthesis",
		expectedCount: 125,
	});
	assertEquals(isStageExpectedCount(valid), true);
});

Deno.test("isStageExpectedCount rejects null undefined and empty record", () => {
	assertEquals(isStageExpectedCount(null), false);
	assertEquals(isStageExpectedCount(undefined), false);
	assertEquals(isStageExpectedCount({}), false);
});

Deno.test("isStageExpectedCount rejects empty stageSlug from mock override", () => {
	const valid: StageExpectedCount = buildStageExpectedCount();
	const withEmptySlug: StageExpectedCount = { ...valid, stageSlug: "" };
	assertEquals(isStageExpectedCount(withEmptySlug), false);
});

Deno.test("isStageExpectedCount rejects negative expectedCount from mock override", () => {
	const valid: StageExpectedCount = buildStageExpectedCount();
	const withNegative: StageExpectedCount = { ...valid, expectedCount: -1 };
	assertEquals(isStageExpectedCount(withNegative), false);
});

Deno.test("isStageExpectedCount rejects non-integer expectedCount from mock override", () => {
	const valid: StageExpectedCount = buildStageExpectedCount();
	const withFraction: StageExpectedCount = { ...valid, expectedCount: 1.5 };
	assertEquals(isStageExpectedCount(withFraction), false);
});

Deno.test("isGetStageExpectedCountsResponse accepts valid response from mock builder", () => {
	const valid: GetStageExpectedCountsResponse = buildGetStageExpectedCountsResponse();
	assertEquals(isGetStageExpectedCountsResponse(valid), true);
});

Deno.test("isGetStageExpectedCountsResponse rejects null undefined and empty record", () => {
	assertEquals(isGetStageExpectedCountsResponse(null), false);
	assertEquals(isGetStageExpectedCountsResponse(undefined), false);
	assertEquals(isGetStageExpectedCountsResponse({}), false);
});

Deno.test("isGetStageExpectedCountsResponse rejects non-array stages", () => {
	const valid: GetStageExpectedCountsResponse = buildGetStageExpectedCountsResponse();
	assertEquals(
		isGetStageExpectedCountsResponse({
			...valid,
			stages: "not-array",
		}),
		false,
	);
});

Deno.test("isGetStageExpectedCountsResponse rejects invalid stage element", () => {
	const valid: GetStageExpectedCountsResponse = buildGetStageExpectedCountsResponse();
	assertEquals(
		isGetStageExpectedCountsResponse({
			...valid,
			stages: [{ ...valid.stages[0], stageSlug: "" }],
		}),
		false,
	);
});

Deno.test("isGetStageExpectedCountsResponse rejects negative totalStages from mock override", () => {
	const valid: GetStageExpectedCountsResponse = buildGetStageExpectedCountsResponse();
	const withNegativeTotal: GetStageExpectedCountsResponse = { ...valid, totalStages: -1 };
	assertEquals(isGetStageExpectedCountsResponse(withNegativeTotal), false);
});

Deno.test("isGetStageExpectedCountsResponse rejects non-integer totalStages from mock override", () => {
	const valid: GetStageExpectedCountsResponse = buildGetStageExpectedCountsResponse();
	const withFractionTotal: GetStageExpectedCountsResponse = { ...valid, totalStages: 1.5 };
	assertEquals(isGetStageExpectedCountsResponse(withFractionTotal), false);
});
