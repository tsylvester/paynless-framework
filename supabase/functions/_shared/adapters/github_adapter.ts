import type { ServiceError } from "../types.ts";
import type {
  IGitHubAdapter,
  GitHubCreateRepoPayload,
  GitHubPushFile,
  GitHubTreeEntry,
  GitHubTreeCreatePayload,
  GetUserDeps,
  GetUserParams,
  GetUserPayload,
  GetUserResult,
  GetUserSuccess,
  GetUserFailure,
  ListReposDeps,
  ListReposParams,
  ListReposPayload,
  ListReposResult,
  ListReposSuccess,
  ListReposFailure,
  ListBranchesDeps,
  ListBranchesParams,
  ListBranchesPayload,
  ListBranchesResult,
  ListBranchesSuccess,
  ListBranchesFailure,
  CreateRepoDeps,
  CreateRepoParams,
  CreateRepoPayload,
  CreateRepoResult,
  CreateRepoSuccess,
  CreateRepoFailure,
  PushFilesDeps,
  PushFilesParams,
  PushFilesPayload,
  PushFilesResult,
  PushFilesSuccess,
  PushFilesFailure,
} from "../types/github.types.ts";
import {
  isGitHubApiErrorBody,
  isGitHubUser,
  isGitHubRepoArray,
  isGitHubBranchArray,
  isGitHubRepo,
  isGitHubRefResponse,
  isGitHubCommitResponse,
  isGitHubBlobResponse,
  isGitHubTreeResponse,
  isGitHubCommitCreateResponse,
} from "../utils/type-guards/type_guards.github.ts";

const GITHUB_API_BASE = "https://api.github.com";

type FetchRawOk = { data: unknown; error: undefined };
type FetchRawErr = { data: undefined; error: ServiceError };
type FetchRawResult = FetchRawOk | FetchRawErr;

export class GitHubApiAdapter implements IGitHubAdapter {
  private token: string;
  private headers: Headers;

  constructor(token: string) {
    this.token = token;
    this.headers = new Headers({
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "paynless-framework",
    });
  }

  private async fetchGitHubRaw(
    path: string,
    options: RequestInit | undefined,
    token: string
  ): Promise<FetchRawResult> {
    const url = path.startsWith("http") ? path : `${GITHUB_API_BASE}${path}`;
    const mergedHeaders = new Headers(this.headers);
    mergedHeaders.set("Authorization", `Bearer ${token}`);
    if (options?.headers) {
      const extra = new Headers(options.headers);
      extra.forEach((value, key) => mergedHeaders.set(key, value));
    }
    const init: RequestInit = {
      ...options,
      headers: mergedHeaders,
    };
    const response = await fetch(url, init);
    const bodyText = await response.text();
    if (!response.ok) {
      let message: string = bodyText;
      try {
        const parsed: unknown = JSON.parse(bodyText);
        if (isGitHubApiErrorBody(parsed) && typeof parsed.message === "string") {
          message = parsed.message;
        }
      } catch {
        // use bodyText as-is
      }
      const error: ServiceError = { message, status: response.status };
      const result: FetchRawErr = { data: undefined, error };
      return result;
    }
    if (bodyText.length === 0) {
      const error: ServiceError = { message: "Empty response body" };
      const result: FetchRawErr = { data: undefined, error };
      return result;
    }
    const data: unknown = JSON.parse(bodyText);
    const result: FetchRawOk = { data, error: undefined };
    return result;
  }

  async getUser(deps: GetUserDeps, _params: GetUserParams, _payload: GetUserPayload): Promise<GetUserResult> {
    const fetchResult: FetchRawResult = await this.fetchGitHubRaw("/user", undefined, deps.token);
    if (fetchResult.error !== undefined) {
      const result: GetUserFailure = { error: fetchResult.error, data: undefined };
      return result;
    }
    const raw: unknown = fetchResult.data;
    if (!isGitHubUser(raw)) {
      const error: ServiceError = { message: "Invalid GitHub user response" };
      const result: GetUserFailure = { error, data: undefined };
      return result;
    }
    const result: GetUserSuccess = { data: raw, error: undefined };
    return result;
  }

  async listRepos(deps: ListReposDeps, _params: ListReposParams, _payload: ListReposPayload): Promise<ListReposResult> {
    const fetchResult: FetchRawResult = await this.fetchGitHubRaw(
      "/user/repos?sort=updated&per_page=100",
      undefined,
      deps.token
    );
    if (fetchResult.error !== undefined) {
      const result: ListReposFailure = { error: fetchResult.error, data: undefined };
      return result;
    }
    const raw: unknown = fetchResult.data;
    if (!isGitHubRepoArray(raw)) {
      const error: ServiceError = { message: "Invalid GitHub repos response" };
      const result: ListReposFailure = { error, data: undefined };
      return result;
    }
    const result: ListReposSuccess = { data: raw, error: undefined };
    return result;
  }

  async listBranches(
    deps: ListBranchesDeps,
    params: ListBranchesParams,
    _payload: ListBranchesPayload
  ): Promise<ListBranchesResult> {
    const path = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/branches`;
    const fetchResult: FetchRawResult = await this.fetchGitHubRaw(path, undefined, deps.token);
    if (fetchResult.error !== undefined) {
      const result: ListBranchesFailure = { error: fetchResult.error, data: undefined };
      return result;
    }
    const raw: unknown = fetchResult.data;
    if (!isGitHubBranchArray(raw)) {
      const error: ServiceError = { message: "Invalid GitHub branches response" };
      const result: ListBranchesFailure = { error, data: undefined };
      return result;
    }
    const result: ListBranchesSuccess = { data: raw, error: undefined };
    return result;
  }

  async createRepo(
    deps: CreateRepoDeps,
    _params: CreateRepoParams,
    payload: CreateRepoPayload
  ): Promise<CreateRepoResult> {
    const body: GitHubCreateRepoPayload = {
      name: payload.name,
      description: payload.description,
      private: payload.private,
      auto_init: payload.auto_init,
    };
    const fetchResult: FetchRawResult = await this.fetchGitHubRaw("/user/repos", {
      method: "POST",
      body: JSON.stringify(body),
    }, deps.token);
    if (fetchResult.error !== undefined) {
      const result: CreateRepoFailure = { error: fetchResult.error, data: undefined };
      return result;
    }
    const raw: unknown = fetchResult.data;
    if (!isGitHubRepo(raw)) {
      const error: ServiceError = { message: "Invalid GitHub create repo response" };
      const result: CreateRepoFailure = { error, data: undefined };
      return result;
    }
    const result: CreateRepoSuccess = { data: raw, error: undefined };
    return result;
  }

  async pushFiles(
    deps: PushFilesDeps,
    params: PushFilesParams,
    payload: PushFilesPayload
  ): Promise<PushFilesResult> {
    const ownerEnc = encodeURIComponent(params.owner);
    const repoEnc = encodeURIComponent(params.repo);
    const branchEnc = encodeURIComponent(params.branch);
    const files: GitHubPushFile[] = payload.files;
    const commitMessage: string = payload.commitMessage;
    const basePath = `/repos/${ownerEnc}/${repoEnc}/git`;

    const refResult: FetchRawResult = await this.fetchGitHubRaw(
      `${basePath}/ref/heads/${branchEnc}`,
      undefined,
      deps.token
    );
    if (refResult.error !== undefined) {
      const result: PushFilesFailure = { error: refResult.error, data: undefined };
      return result;
    }
    const refRaw: unknown = refResult.data;
    if (!isGitHubRefResponse(refRaw)) {
      const error: ServiceError = { message: "Invalid GitHub ref response" };
      const result: PushFilesFailure = { error, data: undefined };
      return result;
    }
    const commitSha: string = refRaw.object.sha;

    const commitResult: FetchRawResult = await this.fetchGitHubRaw(
      `${basePath}/commits/${commitSha}`,
      undefined,
      deps.token
    );
    if (commitResult.error !== undefined) {
      const result: PushFilesFailure = { error: commitResult.error, data: undefined };
      return result;
    }
    const commitRaw: unknown = commitResult.data;
    if (!isGitHubCommitResponse(commitRaw)) {
      const error: ServiceError = { message: "Invalid GitHub commit response" };
      const result: PushFilesFailure = { error, data: undefined };
      return result;
    }
    const baseTreeSha: string | undefined = commitRaw.tree?.sha;

    const treeEntries: GitHubTreeEntry[] = [];
    for (const file of files) {
      const blobResult: FetchRawResult = await this.fetchGitHubRaw(`${basePath}/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: file.content,
          encoding: file.encoding,
        }),
      }, deps.token);
      if (blobResult.error !== undefined) {
        const result: PushFilesFailure = { error: blobResult.error, data: undefined };
        return result;
      }
      const blobRaw: unknown = blobResult.data;
      if (!isGitHubBlobResponse(blobRaw)) {
        const error: ServiceError = { message: "Invalid GitHub blob response" };
        const result: PushFilesFailure = { error, data: undefined };
        return result;
      }
      const entry: GitHubTreeEntry = {
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blobRaw.sha,
      };
      treeEntries.push(entry);
    }

    const treeBody: GitHubTreeCreatePayload = {
      tree: treeEntries,
    };
    if (baseTreeSha !== undefined) treeBody.base_tree = baseTreeSha;

    const treeResult: FetchRawResult = await this.fetchGitHubRaw(`${basePath}/trees`, {
      method: "POST",
      body: JSON.stringify(treeBody),
    }, deps.token);
    if (treeResult.error !== undefined) {
      const result: PushFilesFailure = { error: treeResult.error, data: undefined };
      return result;
    }
    const treeRaw: unknown = treeResult.data;
    if (!isGitHubTreeResponse(treeRaw)) {
      const error: ServiceError = { message: "Invalid GitHub tree response" };
      const result: PushFilesFailure = { error, data: undefined };
      return result;
    }

    const commitCreateResult: FetchRawResult = await this.fetchGitHubRaw(`${basePath}/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: commitMessage,
        tree: treeRaw.sha,
        parents: [commitSha],
      }),
    }, deps.token);
    if (commitCreateResult.error !== undefined) {
      const result: PushFilesFailure = { error: commitCreateResult.error, data: undefined };
      return result;
    }
    const commitRaw2: unknown = commitCreateResult.data;
    if (!isGitHubCommitCreateResponse(commitRaw2)) {
      const error: ServiceError = { message: "Invalid GitHub commit create response" };
      const result: PushFilesFailure = { error, data: undefined };
      return result;
    }

    const patchResult: FetchRawResult = await this.fetchGitHubRaw(`${basePath}/refs/heads/${branchEnc}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commitRaw2.sha }),
    }, deps.token);
    if (patchResult.error !== undefined) {
      const result: PushFilesFailure = { error: patchResult.error, data: undefined };
      return result;
    }

    const result: PushFilesSuccess = {
      data: {
        commitSha: commitRaw2.sha,
        filesUpdated: files.length,
      },
      error: undefined,
    };
    return result;
  }
}
