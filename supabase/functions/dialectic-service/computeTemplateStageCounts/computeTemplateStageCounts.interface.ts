import type { SupabaseClient } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../../types_db.ts";
import type { ServiceError } from "../../_shared/types.ts";
import type {
	ComputeExpectedCountsDeps,
	ComputeExpectedCountsParams,
	ExpectedCountsResult,
	ProgressRecipeEdge,
	ProgressRecipeStep,
	TopologicalSortStepsDeps,
	TopologicalSortStepsParams,
} from "../dialectic.interface.ts";

export interface StageCountsEntry {
	stageId: string;
	stageSlug: string;
	steps: ProgressRecipeStep[];
	edges: ProgressRecipeEdge[];
	expected: Map<string, number>;
	totalExpected: number;
}

export interface ComputeTemplateStageCountsDeps {
	dbClient: SupabaseClient<Database>;
	topologicalSortSteps: (
		deps: TopologicalSortStepsDeps,
		params: TopologicalSortStepsParams,
	) => ProgressRecipeStep[];
	computeExpectedCounts: (
		deps: ComputeExpectedCountsDeps,
		params: ComputeExpectedCountsParams,
	) => ExpectedCountsResult;
}

export interface ComputeTemplateStageCountsParams {}

export interface ComputeTemplateStageCountsPayload {
	processTemplateId: string;
	modelCount: number;
}

export interface ComputeTemplateStageCountsData {
	stages: StageCountsEntry[];
	totalStages: number;
	stepIdToStepKey: Map<string, string>;
}

export interface ComputeTemplateStageCountsSuccess {
	status: 200;
	data: ComputeTemplateStageCountsData;
	error?: undefined;
}

export interface ComputeTemplateStageCountsFailure {
	status: number;
	error: ServiceError;
	data?: undefined;
}

export interface ComputeTemplateStageCountsResult {
	data?: ComputeTemplateStageCountsData;
	error?: ServiceError;
	status?: number;
}

export type ComputeTemplateStageCountsFn = (
	deps: ComputeTemplateStageCountsDeps,
	params: ComputeTemplateStageCountsParams,
	payload: ComputeTemplateStageCountsPayload,
) => Promise<ComputeTemplateStageCountsResult>;
