// Kit tag configuration interfaces for ref-to-tag mapping

import type { ServiceError } from "../types.ts";

export interface KitTagConfig {
  tagId: string;
  description: string;
}

export interface GetTagIdForRefDeps {
  tagMap: Record<string, KitTagConfig>;
}

export interface GetTagIdForRefParams {
  ref: string;
}

export type GetTagIdForRefReturn = string | null;

export type GetTagIdForRefFn = (
  deps: GetTagIdForRefDeps,
  params: GetTagIdForRefParams,
) => GetTagIdForRefReturn;

// --- Kit Service Configuration ---

export interface KitServiceConfig {
  apiKey: string;
  baseUrl: string;
  customUserIdField?: string;
  customCreatedAtField?: string;
}

// --- Kit API v4 Response Types ---

export interface KitApiNestedError {
  message: string;
}

export interface KitApiErrorBody {
  error?: KitApiNestedError;
  message?: string;
}

export interface KitSubscriber {
  id: number;
}

export interface KitSubscribersListResponse {
  subscribers: KitSubscriber[];
}

export interface KitSubscriberResponse {
  subscriber: KitSubscriber;
}

// --- MakeApiRequest Types ---

export interface MakeApiRequestDeps {
  apiKey: string;
  baseUrl: string;
}

export interface MakeApiRequestParams {
  endpoint: string;
  options: RequestInit;
}

export interface MakeApiRequestSuccess<T> {
  data: T;
  error?: undefined;
}

export interface MakeApiRequestFailure {
  error: ServiceError;
  data?: undefined;
}

export type MakeApiRequestResult<T> =
  | MakeApiRequestSuccess<T>
  | MakeApiRequestFailure;

// --- FindSubscriberByEmail Types ---

export interface FindSubscriberByEmailDeps {
  apiKey: string;
  baseUrl: string;
}

export interface FindSubscriberByEmailParams {
  email: string;
}

export interface FindSubscriberByEmailSuccess {
  data: number;
  error?: undefined;
}

export interface FindSubscriberByEmailFailure {
  error: ServiceError;
  data?: undefined;
}

export type FindSubscriberByEmailResult =
  | FindSubscriberByEmailSuccess
  | FindSubscriberByEmailFailure;
