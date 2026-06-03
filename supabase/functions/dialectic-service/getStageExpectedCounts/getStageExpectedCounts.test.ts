import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type {
	ComputeTemplateStageCountsFn,
	ComputeTemplateStageCountsResult,
} from "../computeTemplateStageCounts/computeTemplateStageCounts.interface.ts";
import {
	buildComputeTemplateStageCountsData,
	buildComputeTemplateStageCountsFailureResult,
	buildComputeTemplateStageCountsSuccessResult,
	buildStageCountsEntry,
	createMockComputeTemplateStageCountsFn,
} from "../computeTemplateStageCounts/computeTemplateStageCounts.mock.ts";
import { computeExpectedCounts } from "../computeExpectedCounts.ts";
import { topologicalSortSteps } from "../topologicalSortSteps.ts";
import type {
	GetStageExpectedCountsDeps,
	GetStageExpectedCountsErrorReturn,
	GetStageExpectedCountsParams,
	GetStageExpectedCountsPayload,
	GetStageExpectedCountsResult,
} from "./getStageExpectedCounts.interface.ts";
import { getStageExpectedCounts } from "./getStageExpectedCounts.ts";
import {
	buildGetStageExpectedCountsDeps,
	buildGetStageExpectedCountsParams,
	buildGetStageExpectedCountsPayload,
} from "./getStageExpectedCounts.mock.ts";

Deno.test("getStageExpectedCounts: valid authed request maps core StageCountsEntry to StageExpectedCount", async () => {
	const thesisEntry = buildStageCountsEntry({
		stageSlug: "thesis",
		totalExpected: 13,
	});
	const synthesisEntry = buildStageCountsEntry({
		stageSlug: "synthesis",
		totalExpected: 125,
	});
	const countsConfig: ComputeTemplateStageCountsResult = buildComputeTemplateStageCountsSuccessResult({
		data: buildComputeTemplateStageCountsData({
			stages: [thesisEntry, synthesisEntry],
			totalStages: 2,
			stepIdToStepKey: new Map<string, string>([["step-plan-id", "plan"]]),
		}),
	});
	const innerCore: ComputeTemplateStageCountsFn = createMockComputeTemplateStageCountsFn(countsConfig);
	let coreCallCount = 0;
	const computeTemplateStageCounts: ComputeTemplateStageCountsFn = async (
		deps,
		params,
		payload,
	): Promise<ComputeTemplateStageCountsResult> => {
		coreCallCount += 1;
		return innerCore(deps, params, payload);
	};
	const setup = createMockSupabaseClient("get-stage-expected-counts-unit-user", {});
	const authResult = await setup.client.auth.getUser();
	if (authResult.data.user === null) {
		throw new Error("expected authenticated test user");
	}
	const user: User = authResult.data.user;
	const deps: GetStageExpectedCountsDeps = buildGetStageExpectedCountsDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
		user,
		computeTemplateStageCounts,
		topologicalSortSteps,
		computeExpectedCounts,
	});
	const params: GetStageExpectedCountsParams = buildGetStageExpectedCountsParams();
	const payload: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload();
	const result: GetStageExpectedCountsResult = await getStageExpectedCounts(deps, params, payload);
	assertEquals(result.status, 200);
	assertEquals(coreCallCount, 1);
	if (result.status === 200 && result.data !== undefined) {
		assertEquals(result.data.totalStages, 2);
		assertEquals(result.data.stages.length, 2);
		assertEquals(result.data.stages[0].stageSlug, "thesis");
		assertEquals(result.data.stages[0].expectedCount, thesisEntry.totalExpected);
		assertEquals(result.data.stages[1].stageSlug, "synthesis");
		assertEquals(result.data.stages[1].expectedCount, synthesisEntry.totalExpected);
	}
});

Deno.test("getStageExpectedCounts: empty processTemplateId returns 400 and does not call core", async () => {
	const countsConfig: ComputeTemplateStageCountsResult = buildComputeTemplateStageCountsSuccessResult();
	const innerCore: ComputeTemplateStageCountsFn = createMockComputeTemplateStageCountsFn(countsConfig);
	let coreCallCount = 0;
	const computeTemplateStageCounts: ComputeTemplateStageCountsFn = async (
		deps,
		params,
		payload,
	): Promise<ComputeTemplateStageCountsResult> => {
		coreCallCount += 1;
		return innerCore(deps, params, payload);
	};
	const setup = createMockSupabaseClient("get-stage-expected-counts-unit-user", {});
	const authResult = await setup.client.auth.getUser();
	if (authResult.data.user === null) {
		throw new Error("expected authenticated test user");
	}
	const user: User = authResult.data.user;
	const deps: GetStageExpectedCountsDeps = buildGetStageExpectedCountsDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
		user,
		computeTemplateStageCounts,
		topologicalSortSteps,
		computeExpectedCounts,
	});
	const params: GetStageExpectedCountsParams = buildGetStageExpectedCountsParams();
	const payload: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload({
		processTemplateId: "",
	});
	const result: GetStageExpectedCountsResult = await getStageExpectedCounts(deps, params, payload);
	assertEquals(result.status, 400);
	assertEquals(coreCallCount, 0);
});

Deno.test("getStageExpectedCounts: zero modelCount returns 400 and does not call core", async () => {
	const countsConfig: ComputeTemplateStageCountsResult = buildComputeTemplateStageCountsSuccessResult();
	const innerCore: ComputeTemplateStageCountsFn = createMockComputeTemplateStageCountsFn(countsConfig);
	let coreCallCount = 0;
	const computeTemplateStageCounts: ComputeTemplateStageCountsFn = async (
		deps,
		params,
		payload,
	): Promise<ComputeTemplateStageCountsResult> => {
		coreCallCount += 1;
		return innerCore(deps, params, payload);
	};
	const setup = createMockSupabaseClient("get-stage-expected-counts-unit-user", {});
	const authResult = await setup.client.auth.getUser();
	if (authResult.data.user === null) {
		throw new Error("expected authenticated test user");
	}
	const user: User = authResult.data.user;
	const deps: GetStageExpectedCountsDeps = buildGetStageExpectedCountsDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
		user,
		computeTemplateStageCounts,
		topologicalSortSteps,
		computeExpectedCounts,
	});
	const params: GetStageExpectedCountsParams = buildGetStageExpectedCountsParams();
	const payload: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload({
		modelCount: 0,
	});
	const result: GetStageExpectedCountsResult = await getStageExpectedCounts(deps, params, payload);
	assertEquals(result.status, 400);
	assertEquals(coreCallCount, 0);
});

Deno.test("getStageExpectedCounts: negative modelCount returns 400 and does not call core", async () => {
	const countsConfig: ComputeTemplateStageCountsResult = buildComputeTemplateStageCountsSuccessResult();
	const innerCore: ComputeTemplateStageCountsFn = createMockComputeTemplateStageCountsFn(countsConfig);
	let coreCallCount = 0;
	const computeTemplateStageCounts: ComputeTemplateStageCountsFn = async (
		deps,
		params,
		payload,
	): Promise<ComputeTemplateStageCountsResult> => {
		coreCallCount += 1;
		return innerCore(deps, params, payload);
	};
	const setup = createMockSupabaseClient("get-stage-expected-counts-unit-user", {});
	const authResult = await setup.client.auth.getUser();
	if (authResult.data.user === null) {
		throw new Error("expected authenticated test user");
	}
	const user: User = authResult.data.user;
	const deps: GetStageExpectedCountsDeps = buildGetStageExpectedCountsDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
		user,
		computeTemplateStageCounts,
		topologicalSortSteps,
		computeExpectedCounts,
	});
	const params: GetStageExpectedCountsParams = buildGetStageExpectedCountsParams();
	const payload: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload({
		modelCount: -1,
	});
	const result: GetStageExpectedCountsResult = await getStageExpectedCounts(deps, params, payload);
	assertEquals(result.status, 400);
	assertEquals(coreCallCount, 0);
});

Deno.test("getStageExpectedCounts: non-integer modelCount returns 400 and does not call core", async () => {
	const countsConfig: ComputeTemplateStageCountsResult = buildComputeTemplateStageCountsSuccessResult();
	const innerCore: ComputeTemplateStageCountsFn = createMockComputeTemplateStageCountsFn(countsConfig);
	let coreCallCount = 0;
	const computeTemplateStageCounts: ComputeTemplateStageCountsFn = async (
		deps,
		params,
		payload,
	): Promise<ComputeTemplateStageCountsResult> => {
		coreCallCount += 1;
		return innerCore(deps, params, payload);
	};
	const setup = createMockSupabaseClient("get-stage-expected-counts-unit-user", {});
	const authResult = await setup.client.auth.getUser();
	if (authResult.data.user === null) {
		throw new Error("expected authenticated test user");
	}
	const user: User = authResult.data.user;
	const deps: GetStageExpectedCountsDeps = buildGetStageExpectedCountsDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
		user,
		computeTemplateStageCounts,
		topologicalSortSteps,
		computeExpectedCounts,
	});
	const params: GetStageExpectedCountsParams = buildGetStageExpectedCountsParams();
	const payload: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload({
		modelCount: 1.5,
	});
	const result: GetStageExpectedCountsResult = await getStageExpectedCounts(deps, params, payload);
	assertEquals(result.status, 400);
	assertEquals(coreCallCount, 0);
});

Deno.test("getStageExpectedCounts: core failure returns propagated 500 error", async () => {
	const computeTemplateStageCounts: ComputeTemplateStageCountsFn =
		createMockComputeTemplateStageCountsFn(
			buildComputeTemplateStageCountsFailureResult({
				status: 500,
				error: { message: "Failed to fetch stage transitions: db error", status: 500 },
			}),
		);
	const setup = createMockSupabaseClient("get-stage-expected-counts-unit-user", {});
	const authResult = await setup.client.auth.getUser();
	if (authResult.data.user === null) {
		throw new Error("expected authenticated test user");
	}
	const user: User = authResult.data.user;
	const deps: GetStageExpectedCountsDeps = buildGetStageExpectedCountsDeps({
		dbClient: setup.client as unknown as SupabaseClient<Database>,
		user,
		computeTemplateStageCounts,
		topologicalSortSteps,
		computeExpectedCounts,
	});
	const params: GetStageExpectedCountsParams = buildGetStageExpectedCountsParams();
	const payload: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload();
	const result: GetStageExpectedCountsResult = await getStageExpectedCounts(deps, params, payload);
	assertEquals(result.status, 500);
	if (result.status === 500) {
		const errorReturn: GetStageExpectedCountsErrorReturn = result;
		assertEquals(errorReturn.error.message, "Failed to fetch stage transitions: db error");
	}
});
