import type { SupabaseClient } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../../types_db.ts";
import type { ServiceError } from "../../_shared/types.ts";

export type DomainProcessAssociationRow =
	Database["public"]["Tables"]["domain_process_associations"]["Row"];

export interface FetchProcessAssociationPayload {
	domainId: string;
}

export interface FetchProcessAssociationParams {}

export interface FetchProcessAssociationDeps {
	dbClient: SupabaseClient<Database>;
}

export interface FetchProcessAssociationSuccessReturn {
	status: 200;
	data: DomainProcessAssociationRow;
	error?: never;
}

export interface FetchProcessAssociationErrorReturn {
	status: number;
	error: ServiceError;
	data?: never;
}

export type FetchProcessAssociationResult =
	| FetchProcessAssociationSuccessReturn
	| FetchProcessAssociationErrorReturn;

export type FetchProcessAssociationFn = (
	deps: FetchProcessAssociationDeps,
	params: FetchProcessAssociationParams,
	payload: FetchProcessAssociationPayload,
) => Promise<FetchProcessAssociationResult>;
