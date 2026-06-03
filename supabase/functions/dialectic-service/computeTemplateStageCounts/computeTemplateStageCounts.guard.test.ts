import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
	ComputeTemplateStageCountsPayload,
	ComputeTemplateStageCountsResult,
	StageCountsEntry,
} from "./computeTemplateStageCounts.interface.ts";
import {
	buildComputeTemplateStageCountsData,
	buildComputeTemplateStageCountsFailureResult,
	buildComputeTemplateStageCountsPayload,
	buildComputeTemplateStageCountsSuccessResult,
	buildStageCountsEntry,
} from "./computeTemplateStageCounts.mock.ts";
import {
	isComputeTemplateStageCountsPayload,
	isComputeTemplateStageCountsResult,
	isStageCountsEntry,
} from "./computeTemplateStageCounts.guard.ts";

Deno.test("isComputeTemplateStageCountsPayload accepts valid payload from mock builder", () => {
	const valid: ComputeTemplateStageCountsPayload = buildComputeTemplateStageCountsPayload();
	assertEquals(isComputeTemplateStageCountsPayload(valid), true);
});

Deno.test("isComputeTemplateStageCountsPayload rejects null undefined and empty record", () => {
	assertEquals(isComputeTemplateStageCountsPayload(null), false);
	assertEquals(isComputeTemplateStageCountsPayload(undefined), false);
	assertEquals(isComputeTemplateStageCountsPayload({}), false);
});

Deno.test("isComputeTemplateStageCountsPayload rejects empty processTemplateId from mock override", () => {
	const valid: ComputeTemplateStageCountsPayload = buildComputeTemplateStageCountsPayload();
	const withEmptyId: ComputeTemplateStageCountsPayload = {
		...valid,
		processTemplateId: "",
	};
	assertEquals(isComputeTemplateStageCountsPayload(withEmptyId), false);
});

Deno.test("isComputeTemplateStageCountsPayload rejects zero modelCount from mock override", () => {
	const valid: ComputeTemplateStageCountsPayload = buildComputeTemplateStageCountsPayload();
	const withZero: ComputeTemplateStageCountsPayload = { ...valid, modelCount: 0 };
	assertEquals(isComputeTemplateStageCountsPayload(withZero), false);
});

Deno.test("isComputeTemplateStageCountsPayload rejects negative modelCount from mock override", () => {
	const valid: ComputeTemplateStageCountsPayload = buildComputeTemplateStageCountsPayload();
	const withNegative: ComputeTemplateStageCountsPayload = { ...valid, modelCount: -1 };
	assertEquals(isComputeTemplateStageCountsPayload(withNegative), false);
});

Deno.test("isComputeTemplateStageCountsPayload rejects non-integer modelCount from mock override", () => {
	const valid: ComputeTemplateStageCountsPayload = buildComputeTemplateStageCountsPayload();
	const withFraction: ComputeTemplateStageCountsPayload = { ...valid, modelCount: 1.5 };
	assertEquals(isComputeTemplateStageCountsPayload(withFraction), false);
});

Deno.test("isStageCountsEntry accepts valid entry from mock builder", () => {
	const valid: StageCountsEntry = buildStageCountsEntry();
	assertEquals(isStageCountsEntry(valid), true);
});

Deno.test("isStageCountsEntry accepts synthesis-shaped valid entry from mock builder", () => {
	const valid: StageCountsEntry = buildStageCountsEntry({
		stageId: "stage-synthesis-id",
		stageSlug: "synthesis",
		steps: [
			{
				id: "step-h1-id",
				step_key: "prepare-header",
				job_type: "PLAN",
				granularity_strategy: "all_to_one",
			},
			{
				id: "step-p1-id",
				step_key: "pairwise-business-case",
				job_type: "EXECUTE",
				granularity_strategy: "pairwise_by_origin",
			},
		],
		edges: [{ from_step_id: "step-h1-id", to_step_id: "step-p1-id" }],
		expected: new Map<string, number>([
			["prepare-header", 1],
			["pairwise-business-case", 4],
		]),
		totalExpected: 5,
	});
	assertEquals(isStageCountsEntry(valid), true);
});

Deno.test("isStageCountsEntry rejects null undefined and empty record", () => {
	assertEquals(isStageCountsEntry(null), false);
	assertEquals(isStageCountsEntry(undefined), false);
	assertEquals(isStageCountsEntry({}), false);
});

Deno.test("isStageCountsEntry rejects empty stageSlug from mock override", () => {
	const valid: StageCountsEntry = buildStageCountsEntry();
	const withEmptySlug: StageCountsEntry = { ...valid, stageSlug: "" };
	assertEquals(isStageCountsEntry(withEmptySlug), false);
});

Deno.test("isStageCountsEntry rejects empty stageId from mock override", () => {
	const valid: StageCountsEntry = buildStageCountsEntry();
	const withEmptyId: StageCountsEntry = { ...valid, stageId: "" };
	assertEquals(isStageCountsEntry(withEmptyId), false);
});

Deno.test("isStageCountsEntry rejects expected that is not a Map", () => {
	const valid: StageCountsEntry = buildStageCountsEntry();
	assertEquals(
		isStageCountsEntry({
			...valid,
			expected: { plan: 1 },
		}),
		false,
	);
});

Deno.test("isStageCountsEntry rejects totalExpected not equal to sum of expected", () => {
	const valid: StageCountsEntry = buildStageCountsEntry({
		expected: new Map<string, number>([["plan", 3]]),
		totalExpected: 1,
	});
	assertEquals(isStageCountsEntry(valid), false);
});

Deno.test("isStageCountsEntry rejects invalid steps element", () => {
	const valid: StageCountsEntry = buildStageCountsEntry();
	assertEquals(
		isStageCountsEntry({
			...valid,
			steps: [
				{
					id: "",
					step_key: "",
					job_type: "NOT_A_JOB_TYPE",
					granularity_strategy: "not_a_granularity",
				},
			],
		}),
		false,
	);
});

Deno.test("isStageCountsEntry rejects invalid edges element", () => {
	const valid: StageCountsEntry = buildStageCountsEntry();
	assertEquals(
		isStageCountsEntry({
			...valid,
			edges: [{ from_step_id: "", to_step_id: "" }],
		}),
		false,
	);
});

Deno.test("isComputeTemplateStageCountsResult accepts valid success from mock builder", () => {
	const valid: ComputeTemplateStageCountsResult = buildComputeTemplateStageCountsSuccessResult();
	assertEquals(isComputeTemplateStageCountsResult(valid), true);
});

Deno.test("isComputeTemplateStageCountsResult accepts valid error from mock builder", () => {
	const valid: ComputeTemplateStageCountsResult = buildComputeTemplateStageCountsFailureResult();
	assertEquals(isComputeTemplateStageCountsResult(valid), true);
});

Deno.test("isComputeTemplateStageCountsResult rejects null undefined and empty record", () => {
	assertEquals(isComputeTemplateStageCountsResult(null), false);
	assertEquals(isComputeTemplateStageCountsResult(undefined), false);
	assertEquals(isComputeTemplateStageCountsResult({}), false);
});

Deno.test("isComputeTemplateStageCountsResult rejects both data and error present", () => {
	const validData = buildComputeTemplateStageCountsData({
		stages: [],
		totalStages: 0,
		stepIdToStepKey: new Map<string, string>(),
	});
	assertEquals(
		isComputeTemplateStageCountsResult({
			status: 500,
			data: validData,
			error: { message: "mutually exclusive violation", status: 500 },
		}),
		false,
	);
});

Deno.test("isComputeTemplateStageCountsResult rejects non-Map stepIdToStepKey", () => {
	const validData = buildComputeTemplateStageCountsData();
	assertEquals(
		isComputeTemplateStageCountsResult({
			status: 200,
			data: {
				stages: validData.stages,
				totalStages: validData.totalStages,
				stepIdToStepKey: { "step-plan-id": "plan" },
			},
		}),
		false,
	);
});

Deno.test("isComputeTemplateStageCountsResult rejects data with invalid stage entry", () => {
	const validData = buildComputeTemplateStageCountsData();
	assertEquals(
		isComputeTemplateStageCountsResult({
			status: 200,
			data: {
				stages: [{ ...validData.stages[0], stageSlug: "" }],
				totalStages: validData.totalStages,
				stepIdToStepKey: validData.stepIdToStepKey,
			},
		}),
		false,
	);
});

Deno.test("isComputeTemplateStageCountsResult rejects error without string message", () => {
	assertEquals(
		isComputeTemplateStageCountsResult({
			status: 500,
			error: { message: "", status: 500 },
		}),
		false,
	);
});
