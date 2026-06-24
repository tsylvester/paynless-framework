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

export type GetStageExpectedCountsPayloadOverrides = {
	processTemplateId?: GetStageExpectedCountsPayload["processTemplateId"];
	modelCount?: GetStageExpectedCountsPayload["modelCount"];
};

export type GetStageExpectedCountsParamsOverrides = Record<string, never>;

export type BuildGetStageExpectedCountsDepsOverrides = {
	dbClient: GetStageExpectedCountsDeps["dbClient"];
	user: GetStageExpectedCountsDeps["user"];
	computeTemplateStageCounts: GetStageExpectedCountsDeps["computeTemplateStageCounts"];
	topologicalSortSteps: GetStageExpectedCountsDeps["topologicalSortSteps"];
	computeExpectedCounts: GetStageExpectedCountsDeps["computeExpectedCounts"];
};

export type StageExpectedCountOverrides = {
	stageSlug?: StageExpectedCount["stageSlug"];
	expectedCount?: StageExpectedCount["expectedCount"];
};

export type GetStageExpectedCountsResponseOverrides = {
	stages?: GetStageExpectedCountsResponse["stages"];
	totalStages?: GetStageExpectedCountsResponse["totalStages"];
};

export type GetStageExpectedCountsSuccessReturnOverrides = {
	status?: GetStageExpectedCountsSuccessReturn["status"];
	data?: GetStageExpectedCountsSuccessReturn["data"];
};

export type GetStageExpectedCountsErrorReturnOverrides = {
	status?: GetStageExpectedCountsErrorReturn["status"];
	error?: GetStageExpectedCountsErrorReturn["error"];
};

export type GetStageExpectedCountsResultOverrides = {
	status?: number;
	data?: GetStageExpectedCountsResponse;
	error?: GetStageExpectedCountsErrorReturn["error"];
};

export function buildGetStageExpectedCountsPayload(
	overrides?: GetStageExpectedCountsPayloadOverrides,
): GetStageExpectedCountsPayload {
	const payload: GetStageExpectedCountsPayload = {
		processTemplateId: overrides !== undefined && "processTemplateId" in overrides
			? overrides.processTemplateId!
			: "template-uuid",
		modelCount: overrides !== undefined && "modelCount" in overrides
			? overrides.modelCount!
			: 3,
	};
	return payload;
}

export function buildGetStageExpectedCountsParams(
	_overrides?: GetStageExpectedCountsParamsOverrides,
): GetStageExpectedCountsParams {
	const params: GetStageExpectedCountsParams = {};
	return params;
}

export function buildGetStageExpectedCountsDeps(
	overrides: BuildGetStageExpectedCountsDepsOverrides,
): GetStageExpectedCountsDeps {
	const deps: GetStageExpectedCountsDeps = {
		dbClient: overrides.dbClient,
		user: overrides.user,
		computeTemplateStageCounts: overrides.computeTemplateStageCounts,
		topologicalSortSteps: overrides.topologicalSortSteps,
		computeExpectedCounts: overrides.computeExpectedCounts,
	};
	return deps;
}

export function buildStageExpectedCount(
	overrides?: StageExpectedCountOverrides,
): StageExpectedCount {
	const entry: StageExpectedCount = {
		stageSlug: overrides !== undefined && "stageSlug" in overrides
			? overrides.stageSlug!
			: "thesis",
		expectedCount: overrides !== undefined && "expectedCount" in overrides
			? overrides.expectedCount!
			: 13,
	};
	return entry;
}

export function buildGetStageExpectedCountsResponse(
	overrides?: GetStageExpectedCountsResponseOverrides,
): GetStageExpectedCountsResponse {
	const defaultThesis: StageExpectedCount = buildStageExpectedCount();
	const defaultSynthesis: StageExpectedCount = buildStageExpectedCount({
		stageSlug: "synthesis",
		expectedCount: 125,
	});
	const defaultStages: StageExpectedCount[] = [defaultThesis, defaultSynthesis];
	const stages: StageExpectedCount[] = overrides !== undefined && "stages" in overrides
		? overrides.stages!
		: defaultStages;
	const totalStages: number = overrides !== undefined && "totalStages" in overrides
		? overrides.totalStages!
		: stages.length;
	const response: GetStageExpectedCountsResponse = {
		stages,
		totalStages,
	};
	return response;
}

export function buildGetStageExpectedCountsSuccessReturn(
	overrides?: GetStageExpectedCountsSuccessReturnOverrides,
): GetStageExpectedCountsSuccessReturn {
	const success: GetStageExpectedCountsSuccessReturn = {
		status: 200,
		data: overrides !== undefined && "data" in overrides
			? overrides.data!
			: buildGetStageExpectedCountsResponse(),
	};
	return success;
}

export function buildGetStageExpectedCountsErrorReturn(
	overrides?: GetStageExpectedCountsErrorReturnOverrides,
): GetStageExpectedCountsErrorReturn {
	const errorReturn: GetStageExpectedCountsErrorReturn = {
		status: overrides !== undefined && "status" in overrides
			? overrides.status!
			: 400,
		error: overrides !== undefined && "error" in overrides
			? overrides.error!
			: { message: "Invalid payload", status: 400 },
	};
	return errorReturn;
}

export function buildGetStageExpectedCountsResult(
	overrides?: GetStageExpectedCountsResultOverrides,
): GetStageExpectedCountsResult {
	if (overrides !== undefined && "error" in overrides) {
		const errorOverrides: GetStageExpectedCountsErrorReturnOverrides = {
			error: overrides.error,
		};
		if ("status" in overrides) {
			errorOverrides.status = overrides.status;
		}
		return buildGetStageExpectedCountsErrorReturn(errorOverrides);
	}
	const successOverrides: GetStageExpectedCountsSuccessReturnOverrides = {};
	if (overrides !== undefined && "data" in overrides) {
		successOverrides.data = overrides.data;
	}
	return buildGetStageExpectedCountsSuccessReturn(successOverrides);
}

export function createMockGetStageExpectedCountsFn(
	overrides?: GetStageExpectedCountsResultOverrides,
): GetStageExpectedCountsFn {
	const result: GetStageExpectedCountsResult = buildGetStageExpectedCountsResult(overrides);
	return async (
		_deps: GetStageExpectedCountsDeps,
		_params: GetStageExpectedCountsParams,
		_payload: GetStageExpectedCountsPayload,
	): Promise<GetStageExpectedCountsResult> => result;
}
