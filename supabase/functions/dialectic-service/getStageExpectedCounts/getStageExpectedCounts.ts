import type { ServiceError } from "../../_shared/types.ts";
import type {
	ComputeTemplateStageCountsParams,
	ComputeTemplateStageCountsPayload,
	StageCountsEntry,
} from "../computeTemplateStageCounts/computeTemplateStageCounts.interface.ts";
import type {
	GetStageExpectedCountsDeps,
	GetStageExpectedCountsErrorReturn,
	GetStageExpectedCountsParams,
	GetStageExpectedCountsPayload,
	GetStageExpectedCountsResult,
	GetStageExpectedCountsSuccessReturn,
	StageExpectedCount,
} from "./getStageExpectedCounts.interface.ts";
import { isGetStageExpectedCountsPayload } from "./getStageExpectedCounts.guard.ts";

export async function getStageExpectedCounts(
	deps: GetStageExpectedCountsDeps,
	_params: GetStageExpectedCountsParams,
	payload: GetStageExpectedCountsPayload,
): Promise<GetStageExpectedCountsResult> {
	const user = deps.user;
	if (!user) {
		const error: ServiceError = {
			message: "User not authorized for getStageExpectedCounts",
			status: 401,
		};
		const errorReturn: GetStageExpectedCountsErrorReturn = { status: 401, error };
		return errorReturn;
	}

	if (!isGetStageExpectedCountsPayload(payload)) {
		const error: ServiceError = { message: "Invalid payload", status: 400 };
		const errorReturn: GetStageExpectedCountsErrorReturn = { status: 400, error };
		return errorReturn;
	}

	const coreParams: ComputeTemplateStageCountsParams = {};
	const corePayload: ComputeTemplateStageCountsPayload = {
		processTemplateId: payload.processTemplateId,
		modelCount: payload.modelCount,
	};
	const countsResult = await deps.computeTemplateStageCounts(
		{
			dbClient: deps.dbClient,
			topologicalSortSteps: deps.topologicalSortSteps,
			computeExpectedCounts: deps.computeExpectedCounts,
		},
		coreParams,
		corePayload,
	);

	if (countsResult.error !== undefined) {
		const countsStatus: number = typeof countsResult.status === "number" ? countsResult.status : 500;
		const errorReturn: GetStageExpectedCountsErrorReturn = {
			status: countsStatus,
			error: countsResult.error,
		};
		return errorReturn;
	}

	if (countsResult.data === undefined) {
		const error: ServiceError = {
			message: "computeTemplateStageCounts returned no data",
			status: 500,
		};
		const errorReturn: GetStageExpectedCountsErrorReturn = { status: 500, error };
		return errorReturn;
	}

	const stages: StageExpectedCount[] = [];
	for (const entry of countsResult.data.stages) {
		const stageCountsEntry: StageCountsEntry = entry;
		const stageExpected: StageExpectedCount = {
			stageSlug: stageCountsEntry.stageSlug,
			expectedCount: stageCountsEntry.totalExpected,
		};
		stages.push(stageExpected);
	}

	const successReturn: GetStageExpectedCountsSuccessReturn = {
		status: 200,
		data: {
			stages,
			totalStages: countsResult.data.totalStages,
		},
	};
	return successReturn;
}
