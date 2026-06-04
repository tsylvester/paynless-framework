import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type {
	DomainProcessAssociationRow,
	FetchProcessAssociationErrorReturn,
	FetchProcessAssociationParams,
	FetchProcessAssociationPayload,
	FetchProcessAssociationResult,
	FetchProcessAssociationSuccessReturn,
} from "./fetchProcessAssociation.interface.ts";

export function isFetchProcessAssociationPayload(
	value: unknown,
): value is FetchProcessAssociationPayload {
	if (!isRecord(value)) {
		return false;
	}
	if (Object.keys(value).length !== 1) {
		return false;
	}
	if (typeof value.domainId !== "string" || value.domainId.length === 0) {
		return false;
	}
	return true;
}

export function isFetchProcessAssociationParams(
	value: unknown,
): value is FetchProcessAssociationParams {
	if (!isRecord(value)) {
		return false;
	}
	if (Object.keys(value).length !== 0) {
		return false;
	}
	return true;
}

export function isDomainProcessAssociationRow(
	value: unknown,
): value is DomainProcessAssociationRow {
	if (!isRecord(value)) {
		return false;
	}
	if (typeof value.id !== "string" || value.id.length === 0) {
		return false;
	}
	if (typeof value.domain_id !== "string" || value.domain_id.length === 0) {
		return false;
	}
	if (typeof value.process_template_id !== "string" || value.process_template_id.length === 0) {
		return false;
	}
	if (typeof value.is_default_for_domain !== "boolean") {
		return false;
	}
	if (value.is_default_for_domain !== true) {
		return false;
	}
	if (typeof value.created_at !== "string" || value.created_at.length === 0) {
		return false;
	}
	if (typeof value.updated_at !== "string" || value.updated_at.length === 0) {
		return false;
	}
	return true;
}

export function isFetchProcessAssociationSuccessReturn(
	value: unknown,
): value is FetchProcessAssociationSuccessReturn {
	if (!isRecord(value)) {
		return false;
	}
	if (value.status !== 200) {
		return false;
	}
	if ("error" in value && value.error !== undefined) {
		return false;
	}
	if (!("data" in value) || value.data === undefined) {
		return false;
	}
	if (!isDomainProcessAssociationRow(value.data)) {
		return false;
	}
	return true;
}

export function isFetchProcessAssociationErrorReturn(
	value: unknown,
): value is FetchProcessAssociationErrorReturn {
	if (!isRecord(value)) {
		return false;
	}
	if ("data" in value && value.data !== undefined) {
		return false;
	}
	if (typeof value.status !== "number" || !Number.isFinite(value.status)) {
		return false;
	}
	if (!("error" in value) || value.error === undefined) {
		return false;
	}
	if (!isRecord(value.error)) {
		return false;
	}
	if (typeof value.error.message !== "string" || value.error.message.length === 0) {
		return false;
	}
	if (typeof value.error.code !== "string" || value.error.code.length === 0) {
		return false;
	}
	return true;
}

export function isFetchProcessAssociationResult(
	value: unknown,
): value is FetchProcessAssociationResult {
	if (!isRecord(value)) {
		return false;
	}
	const hasError: boolean = "error" in value && value.error !== undefined;
	const hasData: boolean = "data" in value && value.data !== undefined;
	if (hasError && hasData) {
		return false;
	}
	if (!hasError && !hasData) {
		return false;
	}
	if (hasError) {
		return isFetchProcessAssociationErrorReturn(value);
	}
	return isFetchProcessAssociationSuccessReturn(value);
}
