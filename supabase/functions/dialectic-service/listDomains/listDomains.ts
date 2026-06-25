import { logger } from "../../_shared/logger.ts";
import type { ServiceError } from "../../_shared/types.ts";
import type {
	DialecticDomainRow,
	ListDomainsDeps,
	ListDomainsErrorReturn,
	ListDomainsParams,
	ListDomainsPayload,
	ListDomainsResult,
	ListDomainsSuccessReturn,
} from "./listDomains.interface.ts";

export async function listDomains(
	deps: ListDomainsDeps,
	_params: ListDomainsParams,
	_payload: ListDomainsPayload,
): Promise<ListDomainsResult> {
	logger.info("Fetching all enabled dialectic domains.");

	const { data, error } = await deps.dbClient
		.from("dialectic_domains")
		.select("*")
		.eq("is_enabled", true)
		.order("name", { ascending: true });

	if (error) {
		logger.error("Error fetching dialectic domains:", { error });
		const serviceError: ServiceError = {
			message: "Could not fetch dialectic domains.",
			code: "DB_FETCH_FAILED",
			details: error.message,
		};
		const errorReturn: ListDomainsErrorReturn = {
			status: 500,
			error: serviceError,
		};
		return errorReturn;
	}

	let rows: DialecticDomainRow[];
	if (data === null) {
		rows = [];
	} else {
		rows = data;
	}
	logger.info(`Successfully fetched ${rows.length} dialectic domains.`);
	const successReturn: ListDomainsSuccessReturn = {
		status: 200,
		data: rows,
	};
	return successReturn;
}
