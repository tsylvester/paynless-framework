import { logger } from "../../_shared/logger.ts";
import type { ServiceError } from "../../_shared/types.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type {
	DomainProcessAssociationRow,
	FetchProcessAssociationDeps,
	FetchProcessAssociationErrorReturn,
	FetchProcessAssociationParams,
	FetchProcessAssociationPayload,
	FetchProcessAssociationResult,
	FetchProcessAssociationSuccessReturn,
} from "./fetchProcessAssociation.interface.ts";
import {
	isDomainProcessAssociationRow,
	isFetchProcessAssociationPayload,
} from "./fetchProcessAssociation.guard.ts";

export async function fetchProcessAssociation(
	deps: FetchProcessAssociationDeps,
	_params: FetchProcessAssociationParams,
	payload: FetchProcessAssociationPayload,
): Promise<FetchProcessAssociationResult> {
	if (!isFetchProcessAssociationPayload(payload)) {
		const validationError: ServiceError = {
			message: "domainId is required and must be a non-empty string",
			code: "VALIDATION_ERROR",
		};
		const validationReturn: FetchProcessAssociationErrorReturn = {
			status: 400,
			error: validationError,
		};
		return validationReturn;
	}

	logger.info("Fetching default domain process association.", {
		domainId: payload.domainId,
	});

	const { data, error } = await deps.dbClient
		.from("domain_process_associations")
		.select("*")
		.eq("domain_id", payload.domainId)
		.eq("is_default_for_domain", true)
		.single();

	if (error !== null) {
		let postgrestCode: string | undefined = undefined;
		if (isRecord(error)) {
			const codeValue: unknown = error.code;
			if (typeof codeValue === "string") {
				postgrestCode = codeValue;
			}
		}
		if (postgrestCode === "PGRST116") {
			const notFoundError: ServiceError = {
				message: "No default process association found for the domain.",
				code: "NOT_FOUND",
			};
			const notFoundReturn: FetchProcessAssociationErrorReturn = {
				status: 404,
				error: notFoundError,
			};
			return notFoundReturn;
		}
		logger.error("Error fetching domain process association:", { error });
		const serviceError: ServiceError = {
			message: "Could not fetch domain process association.",
			code: "DB_FETCH_FAILED",
			details: error.message,
		};
		const errorReturn: FetchProcessAssociationErrorReturn = {
			status: 500,
			error: serviceError,
		};
		return errorReturn;
	}

	if (data === null) {
		const notFoundError: ServiceError = {
			message: "No default process association found for the domain.",
			code: "NOT_FOUND",
		};
		const notFoundReturn: FetchProcessAssociationErrorReturn = {
			status: 404,
			error: notFoundError,
		};
		return notFoundReturn;
	}

	const row: DomainProcessAssociationRow = data;

	if (!isDomainProcessAssociationRow(row)) {
		logger.error("Invalid domain process association row shape returned from DB.", { data });
		const invalidRowError: ServiceError = {
			message: "Invalid domain process association row shape returned from the database.",
			code: "DB_FETCH_FAILED",
		};
		const invalidRowReturn: FetchProcessAssociationErrorReturn = {
			status: 500,
			error: invalidRowError,
		};
		return invalidRowReturn;
	}

	logger.info("Successfully fetched default domain process association.", {
		process_template_id: row.process_template_id,
	});

	const successReturn: FetchProcessAssociationSuccessReturn = {
		status: 200,
		data: row,
	};
	return successReturn;
}
