import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
	ComputeTemplateStageCountsData,
	ComputeTemplateStageCountsDeps,
	ComputeTemplateStageCountsFailure,
	ComputeTemplateStageCountsFn,
	ComputeTemplateStageCountsParams,
	ComputeTemplateStageCountsPayload,
	ComputeTemplateStageCountsResult,
	ComputeTemplateStageCountsSuccess,
	StageCountsEntry,
} from "./computeTemplateStageCounts.interface.ts";

Deno.test("ComputeTemplateStageCountsPayload contract: valid processTemplateId and modelCount", () => {
	const payload: ComputeTemplateStageCountsPayload = {
		processTemplateId: "template-uuid",
		modelCount: 2,
	};
	assertEquals(typeof payload.processTemplateId, "string");
	assertEquals(payload.processTemplateId.length > 0, true);
	assertEquals(typeof payload.modelCount, "number");
	assertEquals(Number.isFinite(payload.modelCount), true);
	assertEquals(Number.isInteger(payload.modelCount), true);
	assertEquals(payload.modelCount > 0, true);
});

Deno.test(
	"ComputeTemplateStageCountsPayload contract: empty processTemplateId is structurally assignable but invalid",
	() => {
		const payload: ComputeTemplateStageCountsPayload = {
			processTemplateId: "",
			modelCount: 2,
		};
		assertEquals(payload.processTemplateId.length, 0);
	},
);

Deno.test(
	"ComputeTemplateStageCountsPayload contract: zero modelCount is structurally assignable but invalid",
	() => {
		const payload: ComputeTemplateStageCountsPayload = {
			processTemplateId: "template-uuid",
			modelCount: 0,
		};
		assertEquals(payload.modelCount, 0);
		assertEquals(payload.modelCount > 0, false);
	},
);

Deno.test(
	"ComputeTemplateStageCountsPayload contract: negative modelCount is structurally assignable but invalid",
	() => {
		const payload: ComputeTemplateStageCountsPayload = {
			processTemplateId: "template-uuid",
			modelCount: -1,
		};
		assertEquals(payload.modelCount < 0, true);
	},
);

Deno.test(
	"ComputeTemplateStageCountsPayload contract: non-integer modelCount is structurally assignable but invalid",
	() => {
		const payload: ComputeTemplateStageCountsPayload = {
			processTemplateId: "template-uuid",
			modelCount: 1.5,
		};
		assertEquals(Number.isInteger(payload.modelCount), false);
	},
);

Deno.test("StageCountsEntry contract: valid shape and totalExpected equals sum of expected", () => {
	const entry: StageCountsEntry = {
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
	};
	assertEquals(entry.stageId.length > 0, true);
	assertEquals(entry.stageSlug.length > 0, true);
	assertEquals(Array.isArray(entry.steps), true);
	assertEquals(Array.isArray(entry.edges), true);
	assertEquals(entry.expected instanceof Map, true);
	let expectedSum = 0;
	for (const value of entry.expected.values()) {
		expectedSum += value;
	}
	assertEquals(entry.totalExpected, expectedSum);
	assertEquals(entry.totalExpected >= 0, true);
});

Deno.test("StageCountsEntry contract: empty stageSlug is structurally assignable but invalid", () => {
	const entry: StageCountsEntry = {
		stageId: "stage-id",
		stageSlug: "",
		steps: [],
		edges: [],
		expected: new Map<string, number>(),
		totalExpected: 0,
	};
	assertEquals(entry.stageSlug.length, 0);
});

Deno.test("StageCountsEntry contract: totalExpected may differ from sum of expected values", () => {
	const entry: StageCountsEntry = {
		stageId: "stage-id",
		stageSlug: "thesis",
		steps: [
			{
				id: "step-id",
				step_key: "plan",
				job_type: "PLAN",
				granularity_strategy: "all_to_one",
			},
		],
		edges: [],
		expected: new Map<string, number>([["plan", 3]]),
		totalExpected: 1,
	};
	let expectedSum = 0;
	for (const value of entry.expected.values()) {
		expectedSum += value;
	}
	assertEquals(entry.totalExpected === expectedSum, false);
});

Deno.test("ComputeTemplateStageCountsData contract: stages, totalStages, and stepIdToStepKey", () => {
	const entry: StageCountsEntry = {
		stageId: "stage-thesis-id",
		stageSlug: "thesis",
		steps: [
			{
				id: "step-plan-id",
				step_key: "plan",
				job_type: "PLAN",
				granularity_strategy: "all_to_one",
			},
		],
		edges: [{ from_step_id: "step-plan-id", to_step_id: "step-exec-id" }],
		expected: new Map<string, number>([["plan", 1]]),
		totalExpected: 1,
	};
	const data: ComputeTemplateStageCountsData = {
		stages: [entry],
		totalStages: 1,
		stepIdToStepKey: new Map<string, string>([["step-plan-id", "plan"]]),
	};
	assertEquals(Array.isArray(data.stages), true);
	assertEquals(data.stages.length, 1);
	assertEquals(typeof data.totalStages, "number");
	assertEquals(Number.isFinite(data.totalStages), true);
	assertEquals(Number.isInteger(data.totalStages), true);
	assertEquals(data.totalStages >= 0, true);
	assertEquals(data.stepIdToStepKey instanceof Map, true);
	assertEquals(data.stepIdToStepKey.get("step-plan-id"), "plan");
});

Deno.test("ComputeTemplateStageCountsSuccess contract: status 200 and data, no error", () => {
	const data: ComputeTemplateStageCountsData = {
		stages: [
			{
				stageId: "stage-thesis-id",
				stageSlug: "thesis",
				steps: [
					{
						id: "step-plan-id",
						step_key: "plan",
						job_type: "PLAN",
						granularity_strategy: "all_to_one",
					},
				],
				edges: [],
				expected: new Map<string, number>([["plan", 1]]),
				totalExpected: 1,
			},
		],
		totalStages: 1,
		stepIdToStepKey: new Map<string, string>([["step-plan-id", "plan"]]),
	};
	const success: ComputeTemplateStageCountsSuccess = {
		status: 200,
		data,
	};
	assertEquals(success.status, 200);
	assertEquals(success.data !== undefined, true);
	assertEquals(success.error, undefined);
	assertEquals(success.data.totalStages, 1);
	assertEquals(success.data.stages.length, 1);
});

Deno.test("ComputeTemplateStageCountsFailure contract: status and error, no data", () => {
	const failure: ComputeTemplateStageCountsFailure = {
		status: 500,
		error: { message: "Failed to fetch stage transitions: db error", status: 500 },
	};
	assertEquals(failure.status, 500);
	assertEquals(failure.data, undefined);
	assertEquals(failure.error !== undefined, true);
	assertEquals(typeof failure.error.message, "string");
	assertEquals(failure.error.message.length > 0, true);
});

Deno.test("ComputeTemplateStageCountsResult contract: valid success shape", () => {
	const entry: StageCountsEntry = {
		stageId: "stage-thesis-id",
		stageSlug: "thesis",
		steps: [
			{
				id: "step-plan-id",
				step_key: "plan",
				job_type: "PLAN",
				granularity_strategy: "all_to_one",
			},
		],
		edges: [{ from_step_id: "step-plan-id", to_step_id: "step-exec-id" }],
		expected: new Map<string, number>([["plan", 1]]),
		totalExpected: 1,
	};
	const result: ComputeTemplateStageCountsResult = {
		status: 200,
		data: {
			stages: [entry],
			totalStages: 1,
			stepIdToStepKey: new Map<string, string>([["step-plan-id", "plan"]]),
		},
	};
	assertEquals(result.status, 200);
	assertEquals(result.data !== undefined, true);
	assertEquals(result.error, undefined);
	if (result.data) {
		assertEquals(result.data.totalStages, 1);
		assertEquals(result.data.stages.length, 1);
		assertEquals(result.data.stepIdToStepKey instanceof Map, true);
		assertEquals(result.data.stepIdToStepKey.get("step-plan-id"), "plan");
	}
});

Deno.test("ComputeTemplateStageCountsResult contract: valid error shape", () => {
	const result: ComputeTemplateStageCountsResult = {
		status: 500,
		error: { message: "Failed to fetch stage transitions: db error", status: 500 },
	};
	assertEquals(result.status, 500);
	assertEquals(result.data, undefined);
	assertEquals(result.error !== undefined, true);
	if (result.error) {
		assertEquals(typeof result.error.message, "string");
		assertEquals(result.error.message.length > 0, true);
	}
});

Deno.test(
	"ComputeTemplateStageCountsResult contract: data and error must not both be present",
	() => {
		const invalidBoth: ComputeTemplateStageCountsResult = {
			status: 500,
			data: {
				stages: [],
				totalStages: 0,
				stepIdToStepKey: new Map<string, string>(),
			},
			error: { message: "mutually exclusive violation", status: 500 },
		};
		assertEquals(invalidBoth.data !== undefined, true);
		assertEquals(invalidBoth.error !== undefined, true);
	},
);

Deno.test("ComputeTemplateStageCountsResult contract: success branch assignable from ComputeTemplateStageCountsSuccess", () => {
	const success: ComputeTemplateStageCountsSuccess = {
		status: 200,
		data: {
			stages: [
				{
					stageId: "stage-thesis-id",
					stageSlug: "thesis",
					steps: [
						{
							id: "step-plan-id",
							step_key: "plan",
							job_type: "PLAN",
							granularity_strategy: "all_to_one",
						},
					],
					edges: [],
					expected: new Map<string, number>([["plan", 1]]),
					totalExpected: 1,
				},
			],
			totalStages: 1,
			stepIdToStepKey: new Map<string, string>([["step-plan-id", "plan"]]),
		},
	};
	const result: ComputeTemplateStageCountsResult = success;
	assertEquals(result.status, 200);
	assertEquals(result.data !== undefined, true);
	assertEquals(result.error, undefined);
});

Deno.test("ComputeTemplateStageCountsResult contract: error branch assignable from ComputeTemplateStageCountsFailure", () => {
	const failure: ComputeTemplateStageCountsFailure = {
		status: 500,
		error: { message: "Failed to fetch stage transitions: db error", status: 500 },
	};
	const result: ComputeTemplateStageCountsResult = failure;
	assertEquals(result.status, 500);
	assertEquals(result.data, undefined);
	assertEquals(result.error !== undefined, true);
});

Deno.test("ComputeTemplateStageCountsParams contract: empty object has zero keys", () => {
	const params: ComputeTemplateStageCountsParams = {};
	assertEquals(Object.keys(params).length, 0);
});

Deno.test("ComputeTemplateStageCountsDeps contract: dbClient is a required key", () => {
	const key: keyof ComputeTemplateStageCountsDeps = "dbClient";
	assertEquals(key, "dbClient");
});

Deno.test("ComputeTemplateStageCountsDeps contract: topologicalSortSteps is a required key", () => {
	const key: keyof ComputeTemplateStageCountsDeps = "topologicalSortSteps";
	assertEquals(key, "topologicalSortSteps");
});

Deno.test("ComputeTemplateStageCountsDeps contract: computeExpectedCounts is a required key", () => {
	const key: keyof ComputeTemplateStageCountsDeps = "computeExpectedCounts";
	assertEquals(key, "computeExpectedCounts");
});

Deno.test(
	"Contract: ComputeTemplateStageCountsFn accepts (deps, params, payload) and returns Promise<ComputeTemplateStageCountsResult>",
	() => {
		const fn: ComputeTemplateStageCountsFn = async (
			_deps: ComputeTemplateStageCountsDeps,
			_params: ComputeTemplateStageCountsParams,
			_payload: ComputeTemplateStageCountsPayload,
		): Promise<ComputeTemplateStageCountsResult> => {
			const success: ComputeTemplateStageCountsSuccess = {
				status: 200,
				data: {
					stages: [
						{
							stageId: "stage-thesis-id",
							stageSlug: "thesis",
							steps: [
								{
									id: "step-plan-id",
									step_key: "plan",
									job_type: "PLAN",
									granularity_strategy: "all_to_one",
								},
							],
							edges: [],
							expected: new Map<string, number>([["plan", 1]]),
							totalExpected: 1,
						},
					],
					totalStages: 1,
					stepIdToStepKey: new Map<string, string>([["step-plan-id", "plan"]]),
				},
			};
			return success;
		};
		assertEquals(typeof fn, "function");
	},
);
