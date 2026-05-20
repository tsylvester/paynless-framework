import { isRecord } from "../_shared/utils/type-guards/type_guards.common.ts";
import { MeGetResponse, TierRow } from "./index.interface.ts";

export function isTierRow(value: unknown): value is TierRow {
  if (!isRecord(value)) {
    return false;
  }
  if (!("level" in value) || typeof value.level !== "number") {
    return false;
  }
  if (!("name" in value) || typeof value.name !== "string") {
    return false;
  }
  if (
    !("output_cap_tokens" in value) ||
    (value.output_cap_tokens !== null &&
      typeof value.output_cap_tokens !== "number")
  ) {
    return false;
  }
  if (
    !("max_models_per_project" in value) ||
    (value.max_models_per_project !== null &&
      typeof value.max_models_per_project !== "number")
  ) {
    return false;
  }
  return true;
}

export function isMeGetResponse(value: unknown): value is MeGetResponse {
  if (!isRecord(value)) {
    return false;
  }
  if (!("user" in value) || value.user == null) {
    return false;
  }
  if (!("profile" in value) || value.profile == null) {
    return false;
  }
  if (!("userTier" in value) || !isTierRow(value.userTier)) {
    return false;
  }
  if (!("tiers" in value) || !Array.isArray(value.tiers)) {
    return false;
  }
  if (value.tiers.length === 0) {
    return false;
  }
  for (const tier of value.tiers) {
    if (!isTierRow(tier)) {
      return false;
    }
  }
  return true;
}
