import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
	GetStageExpectedCountsDeps,
	GetStageExpectedCountsErrorReturn,
	GetStageExpectedCountsFn,
	GetStageExpectedCountsParams,
	GetStageExpectedCountsPayload,
	GetStageExpectedCountsResponse,
	GetStageExpectedCountsResult,
	GetStageExpectedCountsSuccessReturn,
	StageExpectedCount,
} from "./getStageExpectedCounts.interface.ts";

Deno.test("GetStageExpectedCountsPayload contract: valid processTemplateId and modelCount", () => {
	const payload: GetStageExpectedCountsPayload = {
		processTemplateId: "template-uuid",
		modelCount: 3,
	};
	assertEquals(typeof payload.processTemplateId, "string");
	assertEquals(payload.processTemplateId.length > 0, true);
	assertEquals(typeof payload.modelCount, "number");
	assertEquals(Number.isFinite(payload.modelCount), true);
	assertEquals(Number.isInteger(payload.modelCount), true);
	assertEquals(payload.modelCount > 0, true);
});

Deno.test("GetStageExpectedCountsPayload contract: empty processTemplateId is structurally assignable but invalid", () => {
	const payload: GetStageExpectedCountsPayload = {
		processTemplateId: "",
		modelCount: 2,
	};
	assertEquals(payload.processTemplateId.length, 0);
});

Deno.test("GetStageExpectedCountsPayload contract: zero modelCount is structurally assignable but invalid", () => {
	const payload: GetStageExpectedCountsPayload = {
		processTemplateId: "template-uuid",
		modelCount: 0,
	};
	assertEquals(payload.modelCount, 0);
	assertEquals(payload.modelCount > 0, false);
});

Deno.test("GetStageExpectedCountsPayload contract: negative modelCount is structurally assignable but invalid", () => {
	const payload: GetStageExpectedCountsPayload = {
		processTemplateId: "template-uuid",
		modelCount: -1,
	};
	assertEquals(payload.modelCount < 0, true);
});

Deno.test("GetStageExpectedCountsPayload contract: non-integer modelCount is structurally assignable but invalid", () => {
	const payload: GetStageExpectedCountsPayload = {
		processTemplateId: "template-uuid",
		modelCount: 1.5,
	};
	assertEquals(Number.isInteger(payload.modelCount), false);
});

Deno.test("StageExpectedCount contract: valid stageSlug and expectedCount", () => {
	const entry: StageExpectedCount = {
		stageSlug: "thesis",
		expectedCount: 13,
	};
	assertEquals(typeof entry.stageSlug, "string");
	assertEquals(entry.stageSlug.length > 0, true);
	assertEquals(typeof entry.expectedCount, "number");
	assertEquals(Number.isFinite(entry.expectedCount), true);
	assertEquals(Number.isInteger(entry.expectedCount), true);
	assertEquals(entry.expectedCount >= 0, true);
});

Deno.test("StageExpectedCount contract: empty stageSlug is structurally assignable but invalid", () => {
	const entry: StageExpectedCount = {
		stageSlug: "",
		expectedCount: 0,
	};
	assertEquals(entry.stageSlug.length, 0);
});

Deno.test("StageExpectedCount contract: negative expectedCount is structurally assignable but invalid", () => {
	const entry: StageExpectedCount = {
		stageSlug: "thesis",
		expectedCount: -1,
	};
	assertEquals(entry.expectedCount < 0, true);
});

Deno.test("StageExpectedCount contract: non-integer expectedCount is structurally assignable but invalid", () => {
	const entry: StageExpectedCount = {
		stageSlug: "thesis",
		expectedCount: 1.5,
	};
	assertEquals(Number.isInteger(entry.expectedCount), false);
});

Deno.test("GetStageExpectedCountsResponse contract: stages array and totalStages", () => {
	const thesis: StageExpectedCount = {
		stageSlug: "thesis",
		expectedCount: 13,
	};
	const synthesis: StageExpectedCount = {
		stageSlug: "synthesis",
		expectedCount: 125,
	};
	const response: GetStageExpectedCountsResponse = {
		stages: [thesis, synthesis],
		totalStages: 2,
	};
	assertEquals(Array.isArray(response.stages), true);
	assertEquals(response.stages.length, 2);
	assertEquals(response.stages[0].stageSlug, "thesis");
	assertEquals(response.stages[1].stageSlug, "synthesis");
	assertEquals(typeof response.totalStages, "number");
	assertEquals(Number.isFinite(response.totalStages), true);
	assertEquals(Number.isInteger(response.totalStages), true);
	assertEquals(response.totalStages >= 0, true);
});

Deno.test("GetStageExpectedCountsSuccessReturn contract: status 200 and data, no error", () => {
	const data: GetStageExpectedCountsResponse = {
		stages: [{ stageSlug: "thesis", expectedCount: 13 }],
		totalStages: 1,
	};
	const success: GetStageExpectedCountsSuccessReturn = {
		status: 200,
		data,
	};
	assertEquals(success.status, 200);
	assertEquals(success.data !== undefined, true);
	assertEquals(success.error, undefined);
	assertEquals(success.data.totalStages, 1);
	assertEquals(success.data.stages.length, 1);
	assertEquals(success.data.stages[0].stageSlug, "thesis");
	assertEquals(success.data.stages[0].expectedCount, 13);
});

Deno.test("GetStageExpectedCountsErrorReturn contract: status and error, no data", () => {
	const errorReturn: GetStageExpectedCountsErrorReturn = {
		status: 401,
		error: { message: "User not authorized", status: 401 },
	};
	assertEquals(errorReturn.status, 401);
	assertEquals(errorReturn.data, undefined);
	assertEquals(errorReturn.error !== undefined, true);
	assertEquals(typeof errorReturn.error.message, "string");
	assertEquals(errorReturn.error.message.length > 0, true);
});

Deno.test("GetStageExpectedCountsResult contract: success branch assignable", () => {
	const success: GetStageExpectedCountsSuccessReturn = {
		status: 200,
		data: {
			stages: [{ stageSlug: "thesis", expectedCount: 13 }],
			totalStages: 1,
		},
	};
	const result: GetStageExpectedCountsResult = success;
	assertEquals(result.status, 200);
	assertEquals(result.data !== undefined, true);
	assertEquals(result.error, undefined);
});

Deno.test("GetStageExpectedCountsResult contract: error branch assignable", () => {
	const errorReturn: GetStageExpectedCountsErrorReturn = {
		status: 400,
		error: { message: "Invalid payload", status: 400 },
	};
	const result: GetStageExpectedCountsResult = errorReturn;
	assertEquals(result.status, 400);
	assertEquals(result.data, undefined);
	assertEquals(result.error !== undefined, true);
});

Deno.test("GetStageExpectedCountsParams contract: empty object has zero keys", () => {
	const params: GetStageExpectedCountsParams = {};
	assertEquals(Object.keys(params).length, 0);
});

Deno.test("GetStageExpectedCountsDeps contract: dbClient is a required key", () => {
	const key: keyof GetStageExpectedCountsDeps = "dbClient";
	assertEquals(key, "dbClient");
});

Deno.test("GetStageExpectedCountsDeps contract: user is a required key", () => {
	const key: keyof GetStageExpectedCountsDeps = "user";
	assertEquals(key, "user");
});

Deno.test("GetStageExpectedCountsDeps contract: computeTemplateStageCounts is a required key", () => {
	const key: keyof GetStageExpectedCountsDeps = "computeTemplateStageCounts";
	assertEquals(key, "computeTemplateStageCounts");
});

Deno.test("GetStageExpectedCountsDeps contract: topologicalSortSteps is a required key", () => {
	const key: keyof GetStageExpectedCountsDeps = "topologicalSortSteps";
	assertEquals(key, "topologicalSortSteps");
});

Deno.test("GetStageExpectedCountsDeps contract: computeExpectedCounts is a required key", () => {
	const key: keyof GetStageExpectedCountsDeps = "computeExpectedCounts";
	assertEquals(key, "computeExpectedCounts");
});

Deno.test(
	"Contract: GetStageExpectedCountsFn accepts (deps, params, payload) and returns Promise<GetStageExpectedCountsResult>",
	() => {
		const fn: GetStageExpectedCountsFn = async (
			_deps: GetStageExpectedCountsDeps,
			_params: GetStageExpectedCountsParams,
			_payload: GetStageExpectedCountsPayload,
		): Promise<GetStageExpectedCountsResult> => {
			const success: GetStageExpectedCountsSuccessReturn = {
				status: 200,
				data: {
					stages: [{ stageSlug: "thesis", expectedCount: 13 }],
					totalStages: 1,
				},
			};
			return success;
		};
		assertEquals(typeof fn, "function");
	},
);
