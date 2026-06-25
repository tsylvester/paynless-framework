import type {
	DialecticDomainRow,
	ListDomainsDeps,
	ListDomainsErrorReturn,
	ListDomainsFn,
	ListDomainsParams,
	ListDomainsPayload,
	ListDomainsResult,
	ListDomainsSuccessReturn,
} from "./listDomains.interface.ts";

export type DialecticDomainRowOverrides = {
	id?: DialecticDomainRow["id"];
	name?: DialecticDomainRow["name"];
	description?: DialecticDomainRow["description"];
	parent_domain_id?: DialecticDomainRow["parent_domain_id"];
	is_enabled?: DialecticDomainRow["is_enabled"];
	created_at?: DialecticDomainRow["created_at"];
	updated_at?: DialecticDomainRow["updated_at"];
};

export type ListDomainsPayloadOverrides = Record<string, never>;

export type ListDomainsParamsOverrides = Record<string, never>;

export type BuildListDomainsDepsOverrides = {
	dbClient: ListDomainsDeps["dbClient"];
};

export type ListDomainsSuccessReturnOverrides = {
	status?: ListDomainsSuccessReturn["status"];
	data?: ListDomainsSuccessReturn["data"];
};

export type ListDomainsErrorReturnOverrides = {
	status?: ListDomainsErrorReturn["status"];
	error?: ListDomainsErrorReturn["error"];
};

export type ListDomainsResultOverrides = {
	status?: number;
	data?: DialecticDomainRow[];
	error?: ListDomainsErrorReturn["error"];
};

export function buildDialecticDomainRow(
	overrides?: DialecticDomainRowOverrides,
): DialecticDomainRow {
	const row: DialecticDomainRow = {
		id: overrides !== undefined && "id" in overrides
			? overrides.id!
			: "domain-uuid-finance",
		name: overrides !== undefined && "name" in overrides
			? overrides.name!
			: "Finance",
		description: overrides !== undefined && "description" in overrides
			? overrides.description!
			: "All about money",
		parent_domain_id: overrides !== undefined && "parent_domain_id" in overrides
			? overrides.parent_domain_id!
			: null,
		is_enabled: overrides !== undefined && "is_enabled" in overrides
			? overrides.is_enabled!
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

export function buildListDomainsPayload(
	_overrides?: ListDomainsPayloadOverrides,
): ListDomainsPayload {
	const payload: ListDomainsPayload = {};
	return payload;
}

export function buildListDomainsParams(
	_overrides?: ListDomainsParamsOverrides,
): ListDomainsParams {
	const params: ListDomainsParams = {};
	return params;
}

export function buildListDomainsDeps(
	overrides: BuildListDomainsDepsOverrides,
): ListDomainsDeps {
	const deps: ListDomainsDeps = {
		dbClient: overrides.dbClient,
	};
	return deps;
}

export function buildListDomainsSuccessReturn(
	overrides?: ListDomainsSuccessReturnOverrides,
): ListDomainsSuccessReturn {
	const defaultSoftware: DialecticDomainRow = buildDialecticDomainRow({
		id: "domain-uuid-software",
		name: "Software Development",
		description: "All about code",
	});
	const defaultFinance: DialecticDomainRow = buildDialecticDomainRow();
	const defaultWeb: DialecticDomainRow = buildDialecticDomainRow({
		id: "domain-uuid-web",
		name: "Web Development",
		description: "A subset of software",
		parent_domain_id: "domain-uuid-software",
	});
	const defaultData: DialecticDomainRow[] = [defaultSoftware, defaultFinance, defaultWeb];
	const success: ListDomainsSuccessReturn = {
		status: 200,
		data: overrides !== undefined && "data" in overrides
			? overrides.data!
			: defaultData,
	};
	return success;
}

export function buildListDomainsErrorReturn(
	overrides?: ListDomainsErrorReturnOverrides,
): ListDomainsErrorReturn {
	const errorReturn: ListDomainsErrorReturn = {
		status: overrides !== undefined && "status" in overrides
			? overrides.status!
			: 500,
		error: overrides !== undefined && "error" in overrides
			? overrides.error!
			: {
				message: "Could not fetch dialectic domains.",
				code: "DB_FETCH_FAILED",
				details: "connection failed",
			},
	};
	return errorReturn;
}

export function buildListDomainsResult(
	overrides?: ListDomainsResultOverrides,
): ListDomainsResult {
	if (overrides !== undefined && "error" in overrides) {
		const errorOverrides: ListDomainsErrorReturnOverrides = {
			error: overrides.error,
		};
		if ("status" in overrides) {
			errorOverrides.status = overrides.status;
		}
		return buildListDomainsErrorReturn(errorOverrides);
	}
	const successOverrides: ListDomainsSuccessReturnOverrides = {};
	if (overrides !== undefined && "data" in overrides) {
		successOverrides.data = overrides.data;
	}
	return buildListDomainsSuccessReturn(successOverrides);
}

export function createMockListDomainsFn(
	overrides?: ListDomainsResultOverrides,
): ListDomainsFn {
	const result: ListDomainsResult = buildListDomainsResult(overrides);
	return async (
		_deps: ListDomainsDeps,
		_params: ListDomainsParams,
		_payload: ListDomainsPayload,
	): Promise<ListDomainsResult> => result;
}
