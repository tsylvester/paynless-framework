import type { SupabaseClient } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../../types_db.ts";
import type { ServiceError } from "../../_shared/types.ts";

export type DialecticDomainRow = Database["public"]["Tables"]["dialectic_domains"]["Row"];

export interface ListDomainsPayload {}

export interface ListDomainsParams {}

export interface ListDomainsDeps {
	dbClient: SupabaseClient<Database>;
}

export interface ListDomainsSuccessReturn {
	status: 200;
	data: DialecticDomainRow[];
	error?: never;
}

export interface ListDomainsErrorReturn {
	status: number;
	error: ServiceError;
	data?: never;
}

export type ListDomainsResult =
	| ListDomainsSuccessReturn
	| ListDomainsErrorReturn;

export type ListDomainsFn = (
	deps: ListDomainsDeps,
	params: ListDomainsParams,
	payload: ListDomainsPayload,
) => Promise<ListDomainsResult>;
