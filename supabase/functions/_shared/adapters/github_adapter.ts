import type {
  IGitHubAdapter,
  GitHubUser,
  GitHubRepo,
  GitHubBranch,
  GitHubCreateRepoPayload,
  GitHubPushFile,
  GitHubPushResult,
  GitHubTreeEntry,
  GitHubTreeCreatePayload,
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

  private async fetchGitHubRaw(path: string, options?: RequestInit): Promise<unknown> {
    const url = path.startsWith("http") ? path : `${GITHUB_API_BASE}${path}`;
    const mergedHeaders = new Headers(this.headers);
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
      throw new Error(`${response.status} ${message}`);
    }
    if (bodyText.length === 0) {
      throw new Error("Empty response body");
    }
    return JSON.parse(bodyText);
  }

  async getUser(): Promise<GitHubUser> {
    const raw = await this.fetchGitHubRaw("/user");
    if (!isGitHubUser(raw)) throw new Error("Invalid GitHub user response");
    return raw;
  }

  async listRepos(): Promise<GitHubRepo[]> {
    const raw = await this.fetchGitHubRaw("/user/repos?sort=updated&per_page=100");
    if (!isGitHubRepoArray(raw)) throw new Error("Invalid GitHub repos response");
    return raw;
  }

  async listBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`;
    const raw = await this.fetchGitHubRaw(path);
    if (!isGitHubBranchArray(raw)) throw new Error("Invalid GitHub branches response");
    return raw;
  }

  async createRepo(payload: GitHubCreateRepoPayload): Promise<GitHubRepo> {
    const body: GitHubCreateRepoPayload = {
      name: payload.name,
      description: payload.description,
      private: payload.private,
      auto_init: payload.auto_init !== undefined ? payload.auto_init : true,
    };
    const raw = await this.fetchGitHubRaw("/user/repos", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!isGitHubRepo(raw)) throw new Error("Invalid GitHub create repo response");
    return raw;
  }

  async pushFiles(
    owner: string,
    repo: string,
    branch: string,
    files: GitHubPushFile[],
    commitMessage: string
  ): Promise<GitHubPushResult> {
    const ownerEnc = encodeURIComponent(owner);
    const repoEnc = encodeURIComponent(repo);
    const branchEnc = encodeURIComponent(branch);
    const basePath = `/repos/${ownerEnc}/${repoEnc}/git`;

    const refRaw = await this.fetchGitHubRaw(`${basePath}/ref/heads/${branchEnc}`);
    if (!isGitHubRefResponse(refRaw)) throw new Error("Invalid GitHub ref response");
    const commitSha: string = refRaw.object.sha;

    const commitRaw = await this.fetchGitHubRaw(`${basePath}/commits/${commitSha}`);
    if (!isGitHubCommitResponse(commitRaw)) throw new Error("Invalid GitHub commit response");
    const baseTreeSha: string | undefined = commitRaw.tree?.sha;

    const treeEntries: GitHubTreeEntry[] = [];
    for (const file of files) {
      const blobRaw = await this.fetchGitHubRaw(`${basePath}/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: file.content,
          encoding: file.encoding,
        }),
      });
      if (!isGitHubBlobResponse(blobRaw)) throw new Error("Invalid GitHub blob response");
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
    if (baseTreeSha) treeBody.base_tree = baseTreeSha;

    const treeRaw = await this.fetchGitHubRaw(`${basePath}/trees`, {
      method: "POST",
      body: JSON.stringify(treeBody),
    });
    if (!isGitHubTreeResponse(treeRaw)) throw new Error("Invalid GitHub tree response");

    const commitRaw2 = await this.fetchGitHubRaw(`${basePath}/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: commitMessage,
        tree: treeRaw.sha,
        parents: [commitSha],
      }),
    });
    if (!isGitHubCommitCreateResponse(commitRaw2)) throw new Error("Invalid GitHub commit create response");

    await this.fetchGitHubRaw(`${basePath}/refs/heads/${branchEnc}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commitRaw2.sha }),
    });

    return {
      commitSha: commitRaw2.sha,
      filesUpdated: files.length,
    };
  }
}
