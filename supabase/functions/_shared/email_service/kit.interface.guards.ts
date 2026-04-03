import type {
  KitApiNestedError,
  KitApiErrorBody,
  KitSubscribersListResponse,
  KitSubscriberResponse,
  MakeApiRequestSuccess,
  MakeApiRequestFailure,
  FindSubscriberByEmailSuccess,
  FindSubscriberByEmailFailure,
} from "./kit.interface.ts";

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isServiceError(value: unknown): value is { message: string } {
  if (!isNonNullObject(value)) return false;
  return typeof value.message === "string";
}

export function isKitApiNestedError(value: unknown): value is KitApiNestedError {
  if (!isNonNullObject(value)) return false;
  return typeof value.message === "string";
}

export function isKitApiErrorBody(value: unknown): value is KitApiErrorBody {
  if (!isNonNullObject(value)) return false;

  const hasNestedError =
    "error" in value &&
    isNonNullObject(value.error) &&
    isKitApiNestedError(value.error);

  const hasTopLevelMessage =
    "message" in value && typeof value.message === "string";

  return hasNestedError || hasTopLevelMessage;
}

export function isKitSubscribersListResponse(
  value: unknown,
): value is KitSubscribersListResponse {
  if (!isNonNullObject(value)) return false;
  if (!("subscribers" in value)) return false;
  if (!Array.isArray(value.subscribers)) return false;

  for (const item of value.subscribers) {
    if (!isNonNullObject(item)) return false;
    if (typeof item.id !== "number") return false;
  }

  return true;
}

export function isKitSubscriberResponse(
  value: unknown,
): value is KitSubscriberResponse {
  if (!isNonNullObject(value)) return false;
  if (!("subscriber" in value)) return false;
  if (!isNonNullObject(value.subscriber)) return false;
  return typeof value.subscriber.id === "number";
}

export function isMakeApiRequestSuccess<T>(
  value: unknown,
): value is MakeApiRequestSuccess<T> {
  if (!isNonNullObject(value)) return false;
  if (!("data" in value)) return false;
  if ("error" in value && value.error !== undefined) return false;
  return true;
}

export function isMakeApiRequestFailure(
  value: unknown,
): value is MakeApiRequestFailure {
  if (!isNonNullObject(value)) return false;
  if (!("error" in value)) return false;
  if (!isServiceError(value.error)) return false;
  return true;
}

export function isFindSubscriberByEmailSuccess(
  value: unknown,
): value is FindSubscriberByEmailSuccess {
  if (!isNonNullObject(value)) return false;
  if (!("data" in value)) return false;
  if (typeof value.data !== "number") return false;
  if ("error" in value && value.error !== undefined) return false;
  return true;
}

export function isFindSubscriberByEmailFailure(
  value: unknown,
): value is FindSubscriberByEmailFailure {
  if (!isNonNullObject(value)) return false;
  if (!("error" in value)) return false;
  if (!isServiceError(value.error)) return false;
  return true;
}
