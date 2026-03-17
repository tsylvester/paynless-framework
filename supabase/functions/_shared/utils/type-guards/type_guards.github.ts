import type {
  GitHubUser,
  GitHubRepo,
  GitHubBranch,
  GitHubCreateRepoPayload,
  GitHubPushResult,
  GitHubRefResponse,
  GitHubCommitResponse,
  GitHubBlobResponse,
  GitHubTreeResponse,
  GitHubCommitCreateResponse,
  GitHubApiErrorBody,
  GithubServiceRequestBody,
  ListBranchesParams,
  StoreInstallationPayload,
} from "../../types/github.types.ts";
import { isRecord } from "./type_guards.common.ts";

export function isGitHubApiErrorBody(obj: unknown): obj is GitHubApiErrorBody {
  if (!isRecord(obj)) return false;
  if (!Object.prototype.hasOwnProperty.call(obj, "message")) return true;
  const message = Object.getOwnPropertyDescriptor(obj, "message")?.value;
  return typeof message === "string" || message === undefined;
}

export function isGitHubUser(obj: unknown): obj is GitHubUser {
  if (!isRecord(obj)) return false;
  const id = Object.getOwnPropertyDescriptor(obj, "id")?.value;
  const login = Object.getOwnPropertyDescriptor(obj, "login")?.value;
  const avatar_url = Object.getOwnPropertyDescriptor(obj, "avatar_url")?.value;
  return typeof id === "number" && typeof login === "string" && typeof avatar_url === "string";
}

export function isGitHubRepo(obj: unknown): obj is GitHubRepo {
  if (!isRecord(obj)) return false;
  const id = Object.getOwnPropertyDescriptor(obj, "id")?.value;
  const name = Object.getOwnPropertyDescriptor(obj, "name")?.value;
  const full_name = Object.getOwnPropertyDescriptor(obj, "full_name")?.value;
  const owner = Object.getOwnPropertyDescriptor(obj, "owner")?.value;
  const default_branch = Object.getOwnPropertyDescriptor(obj, "default_branch")?.value;
  const priv = Object.getOwnPropertyDescriptor(obj, "private")?.value;
  const html_url = Object.getOwnPropertyDescriptor(obj, "html_url")?.value;
  if (typeof id !== "number" || typeof name !== "string" || typeof full_name !== "string") return false;
  if (typeof default_branch !== "string" || typeof priv !== "boolean" || typeof html_url !== "string") return false;
  if (!isRecord(owner)) return false;
  const ownerLogin = Object.getOwnPropertyDescriptor(owner, "login")?.value;
  return typeof ownerLogin === "string";
}

export function isGitHubRepoArray(obj: unknown): obj is GitHubRepo[] {
  if (!Array.isArray(obj)) return false;
  return obj.every((item) => isGitHubRepo(item));
}

export function isGitHubBranch(obj: unknown): obj is GitHubBranch {
  if (!isRecord(obj)) return false;
  const name = Object.getOwnPropertyDescriptor(obj, "name")?.value;
  const commit = Object.getOwnPropertyDescriptor(obj, "commit")?.value;
  const protectedVal = Object.getOwnPropertyDescriptor(obj, "protected")?.value;
  if (typeof name !== "string" || typeof protectedVal !== "boolean") return false;
  if (!isRecord(commit)) return false;
  const sha = Object.getOwnPropertyDescriptor(commit, "sha")?.value;
  return typeof sha === "string";
}

export function isGitHubBranchArray(obj: unknown): obj is GitHubBranch[] {
  if (!Array.isArray(obj)) return false;
  return obj.every((item) => isGitHubBranch(item));
}

export function isGitHubRefResponse(obj: unknown): obj is GitHubRefResponse {
  if (!isRecord(obj)) return false;
  const object = Object.getOwnPropertyDescriptor(obj, "object")?.value;
  if (!isRecord(object)) return false;
  const sha = Object.getOwnPropertyDescriptor(object, "sha")?.value;
  return typeof sha === "string";
}

export function isGitHubCommitResponse(obj: unknown): obj is GitHubCommitResponse {
  if (!isRecord(obj)) return false;
  const sha = Object.getOwnPropertyDescriptor(obj, "sha")?.value;
  if (typeof sha !== "string") return false;
  const tree = Object.getOwnPropertyDescriptor(obj, "tree")?.value;
  if (tree === undefined) return true;
  if (!isRecord(tree)) return false;
  const treeSha = Object.getOwnPropertyDescriptor(tree, "sha")?.value;
  return typeof treeSha === "string";
}

export function isGitHubBlobResponse(obj: unknown): obj is GitHubBlobResponse {
  if (!isRecord(obj)) return false;
  const sha = Object.getOwnPropertyDescriptor(obj, "sha")?.value;
  return typeof sha === "string";
}

export function isGitHubTreeResponse(obj: unknown): obj is GitHubTreeResponse {
  if (!isRecord(obj)) return false;
  const sha = Object.getOwnPropertyDescriptor(obj, "sha")?.value;
  return typeof sha === "string";
}

export function isGitHubCommitCreateResponse(obj: unknown): obj is GitHubCommitCreateResponse {
  if (!isRecord(obj)) return false;
  const sha = Object.getOwnPropertyDescriptor(obj, "sha")?.value;
  return typeof sha === "string";
}

export function isGitHubPushResult(obj: unknown): obj is GitHubPushResult {
  if (!isRecord(obj)) return false;
  const commitSha = Object.getOwnPropertyDescriptor(obj, "commitSha")?.value;
  const filesUpdated = Object.getOwnPropertyDescriptor(obj, "filesUpdated")?.value;
  return typeof commitSha === "string" && typeof filesUpdated === "number";
}

export function isGitHubCreateRepoPayload(obj: unknown): obj is GitHubCreateRepoPayload {
  if (!isRecord(obj)) return false;
  const name = Object.getOwnPropertyDescriptor(obj, "name")?.value;
  if (typeof name !== "string") return false;
  const description = Object.getOwnPropertyDescriptor(obj, "description")?.value;
  const priv = Object.getOwnPropertyDescriptor(obj, "private")?.value;
  const autoInit = Object.getOwnPropertyDescriptor(obj, "auto_init")?.value;
  if (description !== undefined && typeof description !== "string") return false;
  if (priv !== undefined && typeof priv !== "boolean") return false;
  if (autoInit !== undefined && typeof autoInit !== "boolean") return false;
  return true;
}

export function isGithubServiceRequestBody(obj: unknown): obj is GithubServiceRequestBody {
  if (!isRecord(obj)) return false;
  const action = Object.getOwnPropertyDescriptor(obj, "action")?.value;
  const payload = Object.getOwnPropertyDescriptor(obj, "payload")?.value;
  if (action === "storeInstallation") return isStoreInstallationPayload(payload);
  if (action === "getConnectionStatus") return true;
  if (action === "disconnectGitHub") return true;
  if (action === "listRepos") return true;
  if (action === "listBranches") return isListBranchesParams(payload);
  if (action === "createRepo") return isGitHubCreateRepoPayload(payload);
  return false;
}

export function isStoreInstallationPayload(obj: unknown): obj is StoreInstallationPayload {
  if (!isRecord(obj)) return false;
  const installationId = Object.getOwnPropertyDescriptor(obj, "installationId")?.value;
  const installation_target_type = Object.getOwnPropertyDescriptor(obj, "installation_target_type")?.value;
  const installation_target_id = Object.getOwnPropertyDescriptor(obj, "installation_target_id")?.value;
  if (typeof installationId !== "number") return false;
  if (installation_target_type !== "User" && installation_target_type !== "Organization") return false;
  if (typeof installation_target_id !== "number") return false;
  return true;
}

export function isListBranchesParams(obj: unknown): obj is ListBranchesParams {
  if (!isRecord(obj)) return false;
  const owner = Object.getOwnPropertyDescriptor(obj, "owner")?.value;
  const repo = Object.getOwnPropertyDescriptor(obj, "repo")?.value;
  return typeof owner === "string" && typeof repo === "string";
}

export function parseGitHubUser(obj: unknown): GitHubUser {
  if (!isGitHubUser(obj)) throw new Error("invalid user");
  return obj;
}

export function parseGitHubRepo(obj: unknown): GitHubRepo {
  if (!isGitHubRepo(obj)) throw new Error("invalid repo");
  return obj;
}

export function parseGitHubRepoArray(obj: unknown): GitHubRepo[] {
  if (!isGitHubRepoArray(obj)) throw new Error("invalid repo array");
  return obj;
}

export function parseGitHubBranch(obj: unknown): GitHubBranch {
  if (!isGitHubBranch(obj)) throw new Error("invalid branch");
  return obj;
}

export function parseGitHubBranchArray(obj: unknown): GitHubBranch[] {
  if (!isGitHubBranchArray(obj)) throw new Error("invalid branch array");
  return obj;
}

export function parseGitHubPushResult(obj: unknown): GitHubPushResult {
  if (!isGitHubPushResult(obj)) throw new Error("invalid push result");
  return obj;
}

export function parseCreateRepoPayload(obj: unknown): GitHubCreateRepoPayload | null {
  if (obj === null || typeof obj !== "object") return null;
  if (!isGitHubCreateRepoPayload(obj)) return null;
  return obj;
}

export function requireCreateRepoPayload(p: GitHubCreateRepoPayload | null): GitHubCreateRepoPayload {
  if (p === null) throw new Error("expected payload");
  return {
    name: p.name,
    description: p.description,
    private: p.private,
    auto_init: p.auto_init,
  };
}
