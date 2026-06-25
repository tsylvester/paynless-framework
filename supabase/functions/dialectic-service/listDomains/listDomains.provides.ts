// supabase/functions/dialectic-service/listDomains/listDomains.provides.ts
// Public surface for listDomains — consumers should import from this module only.

export { listDomains } from "./listDomains.ts";
export type {
	DialecticDomainRow,
	ListDomainsDeps,
	ListDomainsErrorReturn,
	ListDomainsFn,
	ListDomainsParams,
	ListDomainsPayload,
	ListDomainsResult,
	ListDomainsSuccessReturn,
} from "./listDomains.interface.ts";
export {
	isDialecticDomainRow,
	isListDomainsErrorReturn,
	isListDomainsParams,
	isListDomainsPayload,
	isListDomainsResult,
	isListDomainsSuccessReturn,
} from "./listDomains.guard.ts";
export {
	buildDialecticDomainRow,
	buildListDomainsDeps,
	buildListDomainsErrorReturn,
	buildListDomainsParams,
	buildListDomainsPayload,
	buildListDomainsResult,
	buildListDomainsSuccessReturn,
	createMockListDomainsFn,
} from "./listDomains.mock.ts";
export type {
	BuildListDomainsDepsOverrides,
	DialecticDomainRowOverrides,
	ListDomainsErrorReturnOverrides,
	ListDomainsParamsOverrides,
	ListDomainsPayloadOverrides,
	ListDomainsResultOverrides,
	ListDomainsSuccessReturnOverrides,
} from "./listDomains.mock.ts";
