// supabase/functions/dialectic-service/fetchProcessAssociation/fetchProcessAssociation.provides.ts
// Public surface for fetchProcessAssociation — consumers should import from this module only.

export { fetchProcessAssociation } from "./fetchProcessAssociation.ts";
export type {
	DomainProcessAssociationRow,
	FetchProcessAssociationDeps,
	FetchProcessAssociationErrorReturn,
	FetchProcessAssociationFn,
	FetchProcessAssociationParams,
	FetchProcessAssociationPayload,
	FetchProcessAssociationResult,
	FetchProcessAssociationSuccessReturn,
} from "./fetchProcessAssociation.interface.ts";
export {
	isDomainProcessAssociationRow,
	isFetchProcessAssociationErrorReturn,
	isFetchProcessAssociationParams,
	isFetchProcessAssociationPayload,
	isFetchProcessAssociationResult,
	isFetchProcessAssociationSuccessReturn,
} from "./fetchProcessAssociation.guard.ts";
export {
	buildDomainProcessAssociationRow,
	buildFetchProcessAssociationDeps,
	buildFetchProcessAssociationErrorReturn,
	buildFetchProcessAssociationParams,
	buildFetchProcessAssociationPayload,
	buildFetchProcessAssociationResult,
	buildFetchProcessAssociationSuccessReturn,
	createMockFetchProcessAssociationFn,
} from "./fetchProcessAssociation.mock.ts";
export type {
	BuildFetchProcessAssociationDepsOverrides,
	DomainProcessAssociationRowOverrides,
	FetchProcessAssociationErrorReturnOverrides,
	FetchProcessAssociationParamsOverrides,
	FetchProcessAssociationPayloadOverrides,
	FetchProcessAssociationResultOverrides,
	FetchProcessAssociationSuccessReturnOverrides,
} from "./fetchProcessAssociation.mock.ts";
