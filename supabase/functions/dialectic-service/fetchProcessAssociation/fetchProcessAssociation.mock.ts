import type {
	DomainProcessAssociationRow,
	FetchProcessAssociationDeps,
	FetchProcessAssociationErrorReturn,
	FetchProcessAssociationFn,
	FetchProcessAssociationParams,
	FetchProcessAssociationPayload,
	FetchProcessAssociationResult,
	FetchProcessAssociationSuccessReturn,
} from "./fetchProcessAssociation.interface.ts";

// Domain-approved defaults: default association for a domain, fixed ISO timestamps, placeholder UUIDs.
export type DomainProcessAssociationRowOverrides = {
	id?: DomainProcessAssociationRow["id"];
	domain_id?: DomainProcessAssociationRow["domain_id"];
	process_template_id?: DomainProcessAssociationRow["process_template_id"];
	is_default_for_domain?: DomainProcessAssociationRow["is_default_for_domain"];
	created_at?: DomainProcessAssociationRow["created_at"];
	updated_at?: DomainProcessAssociationRow["updated_at"];
};

export type FetchProcessAssociationPayloadOverrides = {
	domainId?: FetchProcessAssociationPayload["domainId"];
};

export type FetchProcessAssociationParamsOverrides = Record<string, never>;

export type BuildFetchProcessAssociationDepsOverrides = {
	dbClient: FetchProcessAssociationDeps["dbClient"];
};

export type FetchProcessAssociationSuccessReturnOverrides = {
	status?: FetchProcessAssociationSuccessReturn["status"];
	data?: FetchProcessAssociationSuccessReturn["data"];
};

export type FetchProcessAssociationErrorReturnOverrides = {
	status?: FetchProcessAssociationErrorReturn["status"];
	error?: FetchProcessAssociationErrorReturn["error"];
};

export type FetchProcessAssociationResultOverrides = {
	status?: number;
	data?: DomainProcessAssociationRow;
	error?: FetchProcessAssociationErrorReturn["error"];
};

export function buildDomainProcessAssociationRow(
	overrides?: DomainProcessAssociationRowOverrides,
): DomainProcessAssociationRow {
	const row: DomainProcessAssociationRow = {
		id: overrides !== undefined && "id" in overrides
			? overrides.id!
			: "association-uuid-default",
		domain_id: overrides !== undefined && "domain_id" in overrides
			? overrides.domain_id!
			: "domain-uuid-software",
		process_template_id: overrides !== undefined && "process_template_id" in overrides
			? overrides.process_template_id!
			: "pt-thesis",
		is_default_for_domain: overrides !== undefined && "is_default_for_domain" in overrides
			? overrides.is_default_for_domain!
			: true,
		created_at: overrides !== undefined && "created_at" in overrides
			? overrides.created_at!
			: "2024-01-01T00:00:00.000Z",
		updated_at: overrides !== undefined && "updated_at" in overrides
			? overrides.updated_at!
			: "2024-01-02T00:00:00.000Z",
	};
	return row;
}

export function buildFetchProcessAssociationPayload(
	overrides?: FetchProcessAssociationPayloadOverrides,
): FetchProcessAssociationPayload {
	const payload: FetchProcessAssociationPayload = {
		domainId: overrides !== undefined && "domainId" in overrides
			? overrides.domainId!
			: "domain-uuid-software",
	};
	return payload;
}

export function buildFetchProcessAssociationParams(
	_overrides?: FetchProcessAssociationParamsOverrides,
): FetchProcessAssociationParams {
	const params: FetchProcessAssociationParams = {};
	return params;
}

export function buildFetchProcessAssociationDeps(
	overrides: BuildFetchProcessAssociationDepsOverrides,
): FetchProcessAssociationDeps {
	const deps: FetchProcessAssociationDeps = {
		dbClient: overrides.dbClient,
	};
	return deps;
}

export function buildFetchProcessAssociationSuccessReturn(
	overrides?: FetchProcessAssociationSuccessReturnOverrides,
): FetchProcessAssociationSuccessReturn {
	const success: FetchProcessAssociationSuccessReturn = {
		status: 200,
		data: overrides !== undefined && "data" in overrides
			? overrides.data!
			: buildDomainProcessAssociationRow(),
	};
	return success;
}

export function buildFetchProcessAssociationErrorReturn(
	overrides?: FetchProcessAssociationErrorReturnOverrides,
): FetchProcessAssociationErrorReturn {
	const errorReturn: FetchProcessAssociationErrorReturn = {
		status: overrides !== undefined && "status" in overrides
			? overrides.status!
			: 404,
		error: overrides !== undefined && "error" in overrides
			? overrides.error!
			: {
				message: "No default process association found for the domain.",
				code: "NOT_FOUND",
			},
	};
	return errorReturn;
}

export function buildFetchProcessAssociationResult(
	overrides?: FetchProcessAssociationResultOverrides,
): FetchProcessAssociationResult {
	if (overrides !== undefined && "error" in overrides) {
		const errorOverrides: FetchProcessAssociationErrorReturnOverrides = {
			error: overrides.error,
		};
		if ("status" in overrides) {
			errorOverrides.status = overrides.status;
		}
		return buildFetchProcessAssociationErrorReturn(errorOverrides);
	}
	const successOverrides: FetchProcessAssociationSuccessReturnOverrides = {};
	if (overrides !== undefined && "data" in overrides) {
		successOverrides.data = overrides.data;
	}
	return buildFetchProcessAssociationSuccessReturn(successOverrides);
}

export function createMockFetchProcessAssociationFn(
	overrides?: FetchProcessAssociationResultOverrides,
): FetchProcessAssociationFn {
	const result: FetchProcessAssociationResult = buildFetchProcessAssociationResult(overrides);
	return async (
		_deps: FetchProcessAssociationDeps,
		_params: FetchProcessAssociationParams,
		_payload: FetchProcessAssociationPayload,
	): Promise<FetchProcessAssociationResult> => result;
}
