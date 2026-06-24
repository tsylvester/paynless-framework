import type { SupabaseClient, User } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../../types_db.ts";
import type { ServiceError } from "../../_shared/types.ts";
import type {
	ComputeExpectedCountsDeps,
	ComputeExpectedCountsParams,
	ExpectedCountsResult,
	ProgressRecipeStep,
	TopologicalSortStepsDeps,
	TopologicalSortStepsParams,
} from "../dialectic.interface.ts";
import type { ComputeTemplateStageCountsFn } from "../computeTemplateStageCounts/computeTemplateStageCounts.interface.ts";

export interface GetStageExpectedCountsPayload {
	processTemplateId: string;
	modelCount: number;
}

export interface GetStageExpectedCountsParams {}

export interface GetStageExpectedCountsDeps {
	dbClient: SupabaseClient<Database>;
	user: User;
	computeTemplateStageCounts: ComputeTemplateStageCountsFn;
	topologicalSortSteps: (
		deps: TopologicalSortStepsDeps,
		params: TopologicalSortStepsParams,
	) => ProgressRecipeStep[];
	computeExpectedCounts: (
		deps: ComputeExpectedCountsDeps,
		params: ComputeExpectedCountsParams,
	) => ExpectedCountsResult;
}

export interface StageExpectedCount {
	stageSlug: string;
	expectedCount: number;
}

export interface GetStageExpectedCountsResponse {
	stages: StageExpectedCount[];
	totalStages: number;
}

export interface GetStageExpectedCountsSuccessReturn {
	status: 200;
	data: GetStageExpectedCountsResponse;
	error?: never;
}

export interface GetStageExpectedCountsErrorReturn {
	status: number;
	error: ServiceError;
	data?: never;
}

export type GetStageExpectedCountsResult =
	| GetStageExpectedCountsSuccessReturn
	| GetStageExpectedCountsErrorReturn;

export type GetStageExpectedCountsFn = (
	deps: GetStageExpectedCountsDeps,
	params: GetStageExpectedCountsParams,
	payload: GetStageExpectedCountsPayload,
) => Promise<GetStageExpectedCountsResult>;
