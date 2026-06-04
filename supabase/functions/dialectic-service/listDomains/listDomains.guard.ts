import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type {
	DialecticDomainRow,
	ListDomainsErrorReturn,
	ListDomainsParams,
	ListDomainsPayload,
	ListDomainsResult,
	ListDomainsSuccessReturn,
} from "./listDomains.interface.ts";

export function isListDomainsPayload(
	value: unknown,
): value is ListDomainsPayload {
	if (!isRecord(value)) {
		return false;
	}
	if (Object.keys(value).length !== 0) {
		return false;
	}
	return true;
}

export function isListDomainsParams(
	value: unknown,
): value is ListDomainsParams {
	if (!isRecord(value)) {
		return false;
	}
	if (Object.keys(value).length !== 0) {
		return false;
	}
	return true;
}

export function isDialecticDomainRow(value: unknown): value is DialecticDomainRow {
	if (!isRecord(value)) {
		return false;
	}
	if (typeof value.id !== "string" || value.id.length === 0) {
		return false;
	}
	if (typeof value.name !== "string" || value.name.length === 0) {
		return false;
	}
	if (value.description !== null && typeof value.description !== "string") {
		return false;
	}
	if (value.parent_domain_id !== null && typeof value.parent_domain_id !== "string") {
		return false;
	}
	if (typeof value.is_enabled !== "boolean") {
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

export function isListDomainsSuccessReturn(
	value: unknown,
): value is ListDomainsSuccessReturn {
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
	if (!Array.isArray(value.data)) {
		return false;
	}
	for (const row of value.data) {
		if (!isDialecticDomainRow(row)) {
			return false;
		}
	}
	return true;
}

export function isListDomainsErrorReturn(
	value: unknown,
): value is ListDomainsErrorReturn {
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
	return true;
}

export function isListDomainsResult(
	value: unknown,
): value is ListDomainsResult {
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
		return isListDomainsErrorReturn(value);
	}
	return isListDomainsSuccessReturn(value);
}
