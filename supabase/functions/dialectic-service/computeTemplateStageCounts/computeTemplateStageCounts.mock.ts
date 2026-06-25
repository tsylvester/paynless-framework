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

export type ComputeTemplateStageCountsPayloadOverrides = {
	processTemplateId?: ComputeTemplateStageCountsPayload["processTemplateId"];
	modelCount?: ComputeTemplateStageCountsPayload["modelCount"];
};

export type ComputeTemplateStageCountsParamsOverrides = Record<string, never>;

export type ComputeTemplateStageCountsDepsOverrides = ComputeTemplateStageCountsDeps;

export type StageCountsEntryOverrides = {
	stageId?: StageCountsEntry["stageId"];
	stageSlug?: StageCountsEntry["stageSlug"];
	steps?: StageCountsEntry["steps"];
	edges?: StageCountsEntry["edges"];
	expected?: StageCountsEntry["expected"];
	totalExpected?: StageCountsEntry["totalExpected"];
};

export type ComputeTemplateStageCountsDataOverrides = {
	stages?: ComputeTemplateStageCountsData["stages"];
	totalStages?: ComputeTemplateStageCountsData["totalStages"];
	stepIdToStepKey?: ComputeTemplateStageCountsData["stepIdToStepKey"];
};

export type ComputeTemplateStageCountsSuccessOverrides = {
	status?: ComputeTemplateStageCountsSuccess["status"];
	data?: ComputeTemplateStageCountsSuccess["data"];
};

export type ComputeTemplateStageCountsFailureOverrides = {
	status?: ComputeTemplateStageCountsFailure["status"];
	error?: ComputeTemplateStageCountsFailure["error"];
};

export type ComputeTemplateStageCountsResultOverrides = {
	status?: number;
	data?: ComputeTemplateStageCountsData;
	error?: ComputeTemplateStageCountsResult["error"];
};

export function buildComputeTemplateStageCountsPayload(
	overrides?: ComputeTemplateStageCountsPayloadOverrides,
): ComputeTemplateStageCountsPayload {
	const payload: ComputeTemplateStageCountsPayload = {
		processTemplateId: overrides !== undefined && "processTemplateId" in overrides
			? overrides.processTemplateId!
			: "template-uuid",
		modelCount: overrides !== undefined && "modelCount" in overrides
			? overrides.modelCount!
			: 2,
	};
	return payload;
}

export function buildComputeTemplateStageCountsParams(
	_overrides?: ComputeTemplateStageCountsParamsOverrides,
): ComputeTemplateStageCountsParams {
	const params: ComputeTemplateStageCountsParams = {};
	return params;
}

export function buildComputeTemplateStageCountsDeps(
	overrides: ComputeTemplateStageCountsDepsOverrides,
): ComputeTemplateStageCountsDeps {
	const deps: ComputeTemplateStageCountsDeps = {
		dbClient: overrides.dbClient,
		topologicalSortSteps: overrides.topologicalSortSteps,
		computeExpectedCounts: overrides.computeExpectedCounts,
	};
	return deps;
}

export function buildStageCountsEntry(
	overrides?: StageCountsEntryOverrides,
): StageCountsEntry {
	const expected: Map<string, number> = overrides !== undefined && "expected" in overrides
		? overrides.expected!
		: new Map<string, number>([["plan", 1]]);
	let totalExpected = 0;
	for (const value of expected.values()) {
		totalExpected += value;
	}
	const entry: StageCountsEntry = {
		stageId: overrides !== undefined && "stageId" in overrides
			? overrides.stageId!
			: "stage-thesis-id",
		stageSlug: overrides !== undefined && "stageSlug" in overrides
			? overrides.stageSlug!
			: "thesis",
		steps: overrides !== undefined && "steps" in overrides
			? overrides.steps!
			: [
				{
					id: "step-plan-id",
					step_key: "plan",
					job_type: "PLAN",
					granularity_strategy: "all_to_one",
				},
			],
		edges: overrides !== undefined && "edges" in overrides
			? overrides.edges!
			: [{ from_step_id: "step-plan-id", to_step_id: "step-exec-id" }],
		expected,
		totalExpected: overrides !== undefined && "totalExpected" in overrides
			? overrides.totalExpected!
			: totalExpected,
	};
	return entry;
}

export function buildComputeTemplateStageCountsData(
	overrides?: ComputeTemplateStageCountsDataOverrides,
): ComputeTemplateStageCountsData {
	const defaultThesis: StageCountsEntry = buildStageCountsEntry();
	const defaultStages: StageCountsEntry[] = [defaultThesis];
	const stages: StageCountsEntry[] = overrides !== undefined && "stages" in overrides
		? overrides.stages!
		: defaultStages;
	const stepIdToStepKey: Map<string, string> = overrides !== undefined &&
			"stepIdToStepKey" in overrides
		? overrides.stepIdToStepKey!
		: new Map<string, string>([["step-plan-id", "plan"]]);
	const data: ComputeTemplateStageCountsData = {
		stages,
		totalStages: overrides !== undefined && "totalStages" in overrides
			? overrides.totalStages!
			: stages.length,
		stepIdToStepKey,
	};
	return data;
}

export function buildComputeTemplateStageCountsSuccess(
	overrides?: ComputeTemplateStageCountsSuccessOverrides,
): ComputeTemplateStageCountsSuccess {
	const success: ComputeTemplateStageCountsSuccess = {
		status: 200,
		data: overrides !== undefined && "data" in overrides
			? overrides.data!
			: buildComputeTemplateStageCountsData(),
	};
	return success;
}

export function buildComputeTemplateStageCountsFailure(
	overrides?: ComputeTemplateStageCountsFailureOverrides,
): ComputeTemplateStageCountsFailure {
	const failure: ComputeTemplateStageCountsFailure = {
		status: overrides !== undefined && "status" in overrides ? overrides.status! : 500,
		error: overrides !== undefined && "error" in overrides
			? overrides.error!
			: { message: "Failed to fetch stage transitions: db error", status: 500 },
	};
	return failure;
}

export function buildComputeTemplateStageCountsSuccessResult(
	overrides?: ComputeTemplateStageCountsResultOverrides,
): ComputeTemplateStageCountsResult {
	const success: ComputeTemplateStageCountsSuccess = buildComputeTemplateStageCountsSuccess(
		overrides !== undefined && "data" in overrides ? { data: overrides.data } : undefined,
	);
	const result: ComputeTemplateStageCountsResult = {
		status: overrides !== undefined && "status" in overrides ? overrides.status! : success.status,
		data: success.data,
	};
	return result;
}

export function buildComputeTemplateStageCountsFailureResult(
	overrides?: ComputeTemplateStageCountsResultOverrides,
): ComputeTemplateStageCountsResult {
	const failure: ComputeTemplateStageCountsFailure = buildComputeTemplateStageCountsFailure(
		overrides !== undefined && "error" in overrides
			? { status: overrides.status, error: overrides.error }
			: undefined,
	);
	const result: ComputeTemplateStageCountsResult = {
		status: overrides !== undefined && "status" in overrides ? overrides.status! : failure.status,
		error: failure.error,
	};
	return result;
}

export function buildComputeTemplateStageCountsResult(
	overrides?: ComputeTemplateStageCountsResultOverrides,
): ComputeTemplateStageCountsResult {
	if (overrides !== undefined && "error" in overrides) {
		return buildComputeTemplateStageCountsFailureResult(overrides);
	}
	return buildComputeTemplateStageCountsSuccessResult(overrides);
}

export function createMockComputeTemplateStageCountsFn(
	overrides?: ComputeTemplateStageCountsResultOverrides,
): ComputeTemplateStageCountsFn {
	const result: ComputeTemplateStageCountsResult = buildComputeTemplateStageCountsResult(overrides);
	return async (
		_deps: ComputeTemplateStageCountsDeps,
		_params: ComputeTemplateStageCountsParams,
		_payload: ComputeTemplateStageCountsPayload,
	): Promise<ComputeTemplateStageCountsResult> => result;
}
