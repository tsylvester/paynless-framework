// supabase/functions/dialectic-service/getStageExpectedCounts/getStageExpectedCounts.provides.ts
// Public surface for getStageExpectedCounts — consumers should import from this module only.

export { getStageExpectedCounts } from "./getStageExpectedCounts.ts";
export type {
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
export {
	isGetStageExpectedCountsErrorReturn,
	isGetStageExpectedCountsParams,
	isGetStageExpectedCountsPayload,
	isGetStageExpectedCountsResponse,
	isGetStageExpectedCountsResult,
	isGetStageExpectedCountsSuccessReturn,
	isStageExpectedCount,
} from "./getStageExpectedCounts.guard.ts";
export {
	buildGetStageExpectedCountsDeps,
	buildGetStageExpectedCountsErrorReturn,
	buildGetStageExpectedCountsParams,
	buildGetStageExpectedCountsPayload,
	buildGetStageExpectedCountsResponse,
	buildGetStageExpectedCountsResult,
	buildGetStageExpectedCountsSuccessReturn,
	buildStageExpectedCount,
	createMockGetStageExpectedCountsFn,
} from "./getStageExpectedCounts.mock.ts";
export type {
	BuildGetStageExpectedCountsDepsOverrides,
	GetStageExpectedCountsErrorReturnOverrides,
	GetStageExpectedCountsParamsOverrides,
	GetStageExpectedCountsPayloadOverrides,
	GetStageExpectedCountsResponseOverrides,
	GetStageExpectedCountsResultOverrides,
	GetStageExpectedCountsSuccessReturnOverrides,
	StageExpectedCountOverrides,
} from "./getStageExpectedCounts.mock.ts";
