// supabase/functions/dialectic-service/computeTemplateStageCounts/computeTemplateStageCounts.provides.ts
// Public surface for computeTemplateStageCounts — consumers should import from this module only.

export { computeTemplateStageCounts } from "./computeTemplateStageCounts.ts";
export type {
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
export {
	isComputeTemplateStageCountsData,
	isComputeTemplateStageCountsFailure,
	isComputeTemplateStageCountsParams,
	isComputeTemplateStageCountsPayload,
	isComputeTemplateStageCountsResult,
	isComputeTemplateStageCountsSuccess,
	isStageCountsEntry,
} from "./computeTemplateStageCounts.guard.ts";
export {
	buildComputeTemplateStageCountsData,
	buildComputeTemplateStageCountsDeps,
	buildComputeTemplateStageCountsFailureResult,
	buildComputeTemplateStageCountsParams,
	buildComputeTemplateStageCountsPayload,
	buildComputeTemplateStageCountsResult,
	buildComputeTemplateStageCountsSuccessResult,
	buildStageCountsEntry,
	createMockComputeTemplateStageCountsFn,
} from "./computeTemplateStageCounts.mock.ts";
export type {
	ComputeTemplateStageCountsDataOverrides,
	ComputeTemplateStageCountsDepsOverrides,
	ComputeTemplateStageCountsParamsOverrides,
	ComputeTemplateStageCountsPayloadOverrides,
	ComputeTemplateStageCountsResultOverrides,
	StageCountsEntryOverrides,
} from "./computeTemplateStageCounts.mock.ts";
