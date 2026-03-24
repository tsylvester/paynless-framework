/**
 * @file Defines interfaces and types for GitHub REST API v3 adapter (request/response shapes).
 * Table-backed types reference public.github_connections; auth types reference Supabase Auth API (auth.getUser()).
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Logger } from "../logger.ts";
import type { ServiceError } from "../types.ts";
import type { Tables, TablesInsert } from "../../types_db.ts";

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  html_url: string;
}

export interface GitHubBranch {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

export interface GitHubCreateRepoPayload {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
}

export interface GitHubPushFile {
  path: string;
  content: string;
  encoding: "base64" | "utf-8";
}

export interface GitHubPushResult {
  commitSha: string;
  filesUpdated: number;
}

export interface GitHubApiErrorBody {
  message?: string;
}

export interface GitHubRefResponse {
  object: { sha: string };
}

export interface GitHubCommitResponse {
  sha: string;
  tree?: { sha: string };
}

export interface GitHubBlobResponse {
  sha: string;
}

export interface GitHubTreeResponse {
  sha: string;
}

export interface GitHubCommitCreateResponse {
  sha: string;
}

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
}

export interface GitHubTreeCreatePayload {
  base_tree?: string;
  tree: GitHubTreeEntry[];
}

export interface GetUserDeps {
  token: string;
}

export interface GetUserParams {}

export interface GetUserPayload {}

export interface GetUserReturn {
  id: number;
  login: string;
  avatar_url: string;
}

export interface GetUserSuccess {
  data: GitHubUser;
  error?: undefined;
}

export interface GetUserFailure {
  error: ServiceError;
  data?: undefined;
}

export type GetUserResult = GetUserSuccess | GetUserFailure;

export interface ListReposDeps {
  token: string;
}

export interface ListReposParams {}

export interface ListReposPayload {}

export interface ListReposReturnItem {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  html_url: string;
}

export interface ListReposReturn {
  [index: number]: ListReposReturnItem;
  length: number;
}

export interface ListReposSuccess {
  data: GitHubRepo[];
  error?: undefined;
}

export interface ListReposFailure {
  error: ServiceError;
  data?: undefined;
}

export type ListReposResult = ListReposSuccess | ListReposFailure;

export interface ListBranchesDeps {
  token: string;
}

export interface ListBranchesParams {
  owner: string;
  repo: string;
}

export interface ListBranchesPayload {}

export interface ListBranchesReturnItem {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

export interface ListBranchesReturn {
  [index: number]: ListBranchesReturnItem;
  length: number;
}

export interface ListBranchesSuccess {
  data: GitHubBranch[];
  error?: undefined;
}

export interface ListBranchesFailure {
  error: ServiceError;
  data?: undefined;
}

export type ListBranchesResult = ListBranchesSuccess | ListBranchesFailure;

export interface CreateRepoDeps {
  token: string;
}

export interface CreateRepoParams {}

export interface CreateRepoPayload {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
}

export interface CreateRepoReturn {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  html_url: string;
}

export interface CreateRepoSuccess {
  data: GitHubRepo;
  error?: undefined;
}

export interface CreateRepoFailure {
  error: ServiceError;
  data?: undefined;
}

export type CreateRepoResult = CreateRepoSuccess | CreateRepoFailure;

export interface PushFilesDeps {
  token: string;
}

export interface PushFilesParams {
  owner: string;
  repo: string;
  branch: string;
}

export interface PushFilesPayloadFile {
  path: string;
  content: string;
  encoding: "base64" | "utf-8";
}

export interface PushFilesPayload {
  files: PushFilesPayloadFile[];
  commitMessage: string;
}

export interface PushFilesReturn {
  commitSha: string;
  filesUpdated: number;
}

export interface PushFilesSuccess {
  data: GitHubPushResult;
  error?: undefined;
}

export interface PushFilesFailure {
  error: ServiceError;
  data?: undefined;
}

export type PushFilesResult = PushFilesSuccess | PushFilesFailure;

export interface GenerateInstallationTokenDeps {
  appId: string;
  privateKey: string;
}

export interface GenerateInstallationTokenParams {
  installationId: number;
}

export interface GenerateInstallationTokenPayload {}

export type GenerateInstallationTokenReturn = string;

export interface IGenerateInstallationToken {
  (
    deps: GenerateInstallationTokenDeps,
    params: GenerateInstallationTokenParams
  ): Promise<GenerateInstallationTokenReturn>;
}

export interface GitHubAppJwtPayload {
  iss: string;
  iat: number;
  exp: number;
}

export interface GitHubInstallationTokenResponse {
  token: string;
}

/** Row from table public.github_connections. */
export type GithubConnectionRow = Tables<"github_connections">;

/** Insert payload for table public.github_connections. */
export type GithubConnectionInsert = TablesInsert<"github_connections">;

/** Dependencies for getInstallationToken helper (github-service). */
export interface GetInstallationTokenDeps {
  adminClient: SupabaseClient;
  generateInstallationToken: (
    deps: GenerateInstallationTokenDeps,
    params: GenerateInstallationTokenParams
  ) => Promise<GenerateInstallationTokenReturn>;
  appId: string;
  privateKey: string;
}

/** Params for getInstallationToken helper (github-service). */
export interface GetInstallationTokenParams {
  userId: string;
}

/** Payload for getInstallationToken helper (github-service). */
export interface GetInstallationTokenPayload {}

/** Success branch: token available. */
export interface GetInstallationTokenSuccess {
  data: string;
  error?: undefined;
}

/** Failure branch: structured error (no connection, suspended, token generation failed). */
export interface GetInstallationTokenFailure {
  error: ServiceError;
  data?: undefined;
}

/** Return type for getInstallationToken helper (github-service). Discriminated union. */
export type GetInstallationTokenReturn =
  | GetInstallationTokenSuccess
  | GetInstallationTokenFailure;

/** Signature for getInstallationToken helper (github-service). */
export interface IGetInstallationToken {
  (
    deps: GetInstallationTokenDeps,
    params: GetInstallationTokenParams,
    payload: GetInstallationTokenPayload
  ): Promise<GetInstallationTokenReturn>;
}

/** Allowed actions for github-service. */
export type GithubServiceAction =
  | "storeInstallation"
  | "getConnectionStatus"
  | "disconnectGitHub"
  | "listRepos"
  | "listBranches"
  | "createRepo";

/** Payload for storeInstallation action. */
export interface StoreInstallationPayload {
  installationId: number;
  installation_target_type: "User" | "Organization";
  installation_target_id: number;
}

/** Payload for getConnectionStatus action. */
export interface GetConnectionStatusPayload {}

/** Response when no github_connections row exists. */
export interface GetConnectionStatusDisconnected {
  connected: false;
}

/** Response when a github_connections row exists. */
export interface GetConnectionStatusConnected {
  connected: true;
  username: string;
  github_user_id: string;
  suspended: boolean;
}

/** Response body when getConnectionStatus fails (e.g. select error). */
export interface GetConnectionStatusError {
  error: string;
}

/** Response body for getConnectionStatus action (success or error). */
export type GetConnectionStatusResponse =
  | GetConnectionStatusDisconnected
  | GetConnectionStatusConnected
  | GetConnectionStatusError;

/** Payload for disconnectGitHub action. */
export interface DisconnectGitHubPayload {}

/** Payload for listRepos action. */
export interface ListReposActionPayload {}

/** Request body for github-service: discriminated union of action + payload. */
export type GithubServiceRequestBody =
  | { action: "storeInstallation"; payload: StoreInstallationPayload }
  | { action: "getConnectionStatus"; payload: GetConnectionStatusPayload }
  | { action: "disconnectGitHub"; payload: DisconnectGitHubPayload }
  | { action: "listRepos"; payload: ListReposActionPayload }
  | { action: "listBranches"; payload: ListBranchesParams }
  | { action: "createRepo"; payload: GitHubCreateRepoPayload };

/** Dependencies for github-service request handler. */
export interface GithubServiceDeps {
  createSupabaseClient: (req: Request) => SupabaseClient;
  createSupabaseAdminClient: () => SupabaseClient;
  handleCorsPreflightRequest: (req: Request) => Response | null;
  createErrorResponse: (
    message: string,
    status: number,
    request: Request,
    error?: Error | unknown,
    additionalHeaders?: Record<string, string>
  ) => Response;
  createSuccessResponse: (
    data: unknown,
    status: number,
    request: Request,
    additionalHeaders?: Record<string, string>
  ) => Response;
  logger: Logger;
  generateInstallationToken: (
    deps: GenerateInstallationTokenDeps,
    params: GenerateInstallationTokenParams
  ) => Promise<GenerateInstallationTokenReturn>;
  createGitHubAdapter: (token: string) => IGitHubAdapter;
}

export interface IGitHubAdapter {
  getUser(
    deps: GetUserDeps,
    params: GetUserParams,
    payload: GetUserPayload
  ): Promise<GetUserResult>;
  listRepos(
    deps: ListReposDeps,
    params: ListReposParams,
    payload: ListReposPayload
  ): Promise<ListReposResult>;
  listBranches(
    deps: ListBranchesDeps,
    params: ListBranchesParams,
    payload: ListBranchesPayload
  ): Promise<ListBranchesResult>;
  createRepo(
    deps: CreateRepoDeps,
    params: CreateRepoParams,
    payload: CreateRepoPayload
  ): Promise<CreateRepoResult>;
  pushFiles(
    deps: PushFilesDeps,
    params: PushFilesParams,
    payload: PushFilesPayload
  ): Promise<PushFilesResult>;
}
