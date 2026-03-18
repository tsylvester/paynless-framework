import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock";
import { GitHubApiAdapter } from "./github_adapter.ts";
import type {
  GitHubUser,
  GitHubRepo,
  GitHubBranch,
  GitHubPushResult,
  GetUserDeps,
  GetUserParams,
  GetUserPayload,
  GetUserResult,
  ListReposDeps,
  ListReposParams,
  ListReposPayload,
  ListReposResult,
  ListBranchesDeps,
  ListBranchesParams,
  ListBranchesPayload,
  ListBranchesResult,
  CreateRepoDeps,
  CreateRepoParams,
  CreateRepoPayload,
  CreateRepoResult,
  PushFilesDeps,
  PushFilesParams,
  PushFilesPayload,
  PushFilesResult,
  GetInstallationTokenSuccess,
} from "../types/github.types.ts";
import {
  parseGitHubUser,
  parseGitHubRepo,
  parseGitHubRepoArray,
  parseGitHubBranch,
  parseGitHubBranchArray,
  parseGitHubPushResult,
  parseCreateRepoPayload,
  requireCreateRepoPayload,
  isGetUserSuccess,
  isListReposSuccess,
  isListBranchesSuccess,
  isCreateRepoSuccess,
  isPushFilesSuccess,
  isGetUserFailure,
} from "../utils/type-guards/type_guards.github.ts";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function authFromInit(init: RequestInit | undefined): string | null {
  if (!init?.headers) return null;
  const h: HeadersInit = init.headers;
  if (h instanceof Headers) return h.get("Authorization");
  if (Array.isArray(h)) {
    const entry = h.find((pair) => pair[0] === "Authorization");
    return entry ? entry[1] : null;
  }
  const rec: Record<string, string> = h;
  return rec["Authorization"] ?? null;
}

const MOCK_TOKEN = "ghp_test_token";

const GET_USER_DEPS: GetUserDeps = { token: MOCK_TOKEN };
const GET_USER_PARAMS: GetUserParams = {};
const GET_USER_PAYLOAD: GetUserPayload = {};

const LIST_REPOS_DEPS: ListReposDeps = { token: MOCK_TOKEN };
const LIST_REPOS_PARAMS: ListReposParams = {};
const LIST_REPOS_PAYLOAD: ListReposPayload = {};

const LIST_BRANCHES_DEPS: ListBranchesDeps = { token: MOCK_TOKEN };
const LIST_BRANCHES_PARAMS: ListBranchesParams = { owner: "testuser", repo: "repo1" };
const LIST_BRANCHES_PAYLOAD: ListBranchesPayload = {};

const CREATE_REPO_DEPS: CreateRepoDeps = { token: MOCK_TOKEN };
const CREATE_REPO_PARAMS: CreateRepoParams = {};
const CREATE_REPO_PAYLOAD: CreateRepoPayload = {
  name: "newrepo",
  description: "desc",
  private: false,
  auto_init: true,
};

const PUSH_FILES_DEPS: PushFilesDeps = { token: MOCK_TOKEN };
const PUSH_FILES_PARAMS: PushFilesParams = { owner: "testuser", repo: "repo1", branch: "main" };
const PUSH_FILES_PAYLOAD: PushFilesPayload = {
  files: [{ path: "a.txt", content: "YQ==", encoding: "base64" }],
  commitMessage: "msg",
};

const MOCK_GET_USER_RESPONSE: GitHubUser = {
  id: 1,
  login: "testuser",
  avatar_url: "https://github.com/u.png",
};

const MOCK_LIST_REPOS_RESPONSE: GitHubRepo[] = [
  {
    id: 101,
    name: "repo1",
    full_name: "testuser/repo1",
    owner: { login: "testuser" },
    default_branch: "main",
    private: false,
    html_url: "https://github.com/testuser/repo1",
  },
];

const MOCK_LIST_BRANCHES_RESPONSE: GitHubBranch[] = [
  {
    name: "main",
    commit: { sha: "abc123" },
    protected: true,
  },
];

const MOCK_CREATE_REPO_RESPONSE: GitHubRepo = {
  id: 102,
  name: "newrepo",
  full_name: "testuser/newrepo",
  owner: { login: "testuser" },
  default_branch: "main",
  private: false,
  html_url: "https://github.com/testuser/newrepo",
};

Deno.test("GitHubApiAdapter: constructor stores token and sets Authorization header on requests", async () => {
  const fetchStub = stub(globalThis, "fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
    const auth = authFromInit(init);
    assertEquals(auth, `Bearer ${MOCK_TOKEN}`);
    return Promise.resolve(
      new Response(JSON.stringify(MOCK_GET_USER_RESPONSE), { status: 200 })
    );
  });
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    await adapter.getUser(GET_USER_DEPS, GET_USER_PARAMS, GET_USER_PAYLOAD);
    assertSpyCalls(fetchStub, 1);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: works when token is taken from GetInstallationTokenSuccess.data", async () => {
  const tokenResult: GetInstallationTokenSuccess = { data: MOCK_TOKEN };
  const fetchStub = stub(globalThis, "fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
    const auth = authFromInit(init);
    assertEquals(auth, `Bearer ${tokenResult.data}`);
    return Promise.resolve(
      new Response(JSON.stringify(MOCK_GET_USER_RESPONSE), { status: 200 })
    );
  });
  try {
    const deps: GetUserDeps = { token: tokenResult.data };
    const adapter = new GitHubApiAdapter(tokenResult.data);
    const result: GetUserResult = await adapter.getUser(deps, GET_USER_PARAMS, GET_USER_PAYLOAD);
    assert(isGetUserSuccess(result));
    assertEquals(result.data.login, MOCK_GET_USER_RESPONSE.login);
    assertSpyCalls(fetchStub, 1);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: getUser returns GetUserSuccess with data and no error when API returns 200", async () => {
  let capturedUrl: string = "";
  const fetchStub = stub(globalThis, "fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = requestUrl(input);
    assertEquals(init?.method ?? "GET", "GET");
    return Promise.resolve(
      new Response(JSON.stringify(MOCK_GET_USER_RESPONSE), { status: 200 })
    );
  });
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const result: GetUserResult = await adapter.getUser(GET_USER_DEPS, GET_USER_PARAMS, GET_USER_PAYLOAD);
    assert(isGetUserSuccess(result));
    assertEquals(result.data.id, MOCK_GET_USER_RESPONSE.id);
    assertEquals(result.data.login, MOCK_GET_USER_RESPONSE.login);
    assertEquals(result.data.avatar_url, MOCK_GET_USER_RESPONSE.avatar_url);
    assertEquals(result.error, undefined);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: listRepos calls GET https://api.github.com/user/repos with sort=updated&per_page=100 and returns GitHubRepo[]", async () => {
  let capturedUrl: string = "";
  const fetchStub = stub(globalThis, "fetch", (input: RequestInfo | URL) => {
    capturedUrl = requestUrl(input);
    return Promise.resolve(
      new Response(JSON.stringify(MOCK_LIST_REPOS_RESPONSE), { status: 200 })
    );
  });
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const result: ListReposResult = await adapter.listRepos(LIST_REPOS_DEPS, LIST_REPOS_PARAMS, LIST_REPOS_PAYLOAD);
    assert(isListReposSuccess(result));
    assert(capturedUrl.includes("api.github.com"));
    assert(capturedUrl.includes("/user/repos"));
    assert(capturedUrl.includes("sort=updated"));
    assert(capturedUrl.includes("per_page=100"));
    assertEquals(result.data.length, 1);
    assertEquals(result.data[0].name, MOCK_LIST_REPOS_RESPONSE[0].name);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: listBranches calls GET https://api.github.com/repos/:owner/:repo/branches and returns GitHubBranch[]", async () => {
  const owner: string = "testuser";
  const repo: string = "repo1";
  let capturedUrl: string = "";
  const fetchStub = stub(globalThis, "fetch", (input: RequestInfo | URL) => {
    capturedUrl = requestUrl(input);
    return Promise.resolve(
      new Response(JSON.stringify(MOCK_LIST_BRANCHES_RESPONSE), { status: 200 })
    );
  });
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const result: ListBranchesResult = await adapter.listBranches(
      LIST_BRANCHES_DEPS,
      LIST_BRANCHES_PARAMS,
      LIST_BRANCHES_PAYLOAD
    );
    assert(isListBranchesSuccess(result));
    assert(capturedUrl.includes("api.github.com"));
    assert(capturedUrl.includes(`/repos/${owner}/${repo}/branches`));
    assertEquals(result.data.length, 1);
    assertEquals(result.data[0].name, MOCK_LIST_BRANCHES_RESPONSE[0].name);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: createRepo calls POST https://api.github.com/user/repos with JSON body and returns GitHubRepo", async () => {
  let capturedMethod: string = "";
  let capturedUrl: string = "";
  let capturedBody: CreateRepoPayload | null = null;
  const fetchStub = stub(globalThis, "fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = requestUrl(input);
    capturedMethod = init?.method ?? "";
    if (typeof init?.body === "string") {
      const parsed: unknown = JSON.parse(init.body);
      capturedBody = parseCreateRepoPayload(parsed);
    }
    return Promise.resolve(
      new Response(JSON.stringify(MOCK_CREATE_REPO_RESPONSE), { status: 201 })
    );
  });
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const result: CreateRepoResult = await adapter.createRepo(
      CREATE_REPO_DEPS,
      CREATE_REPO_PARAMS,
      CREATE_REPO_PAYLOAD
    );
    assert(isCreateRepoSuccess(result));
    assert(capturedUrl.includes("api.github.com"));
    assert(capturedUrl.includes("/user/repos"));
    assertEquals(capturedMethod, "POST");
    const body: CreateRepoPayload = requireCreateRepoPayload(capturedBody);
    assertEquals(body.name, CREATE_REPO_PAYLOAD.name);
    assertEquals(result.data.name, MOCK_CREATE_REPO_RESPONSE.name);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: pushFiles creates blobs, builds tree, creates commit, updates ref and returns PushFilesResult", async () => {
  const fetchStub = stub(globalThis, "fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url: string = requestUrl(input);
    if (url.includes("/git/ref/heads/") && init?.method !== "PATCH") {
      return Promise.resolve(new Response(JSON.stringify({ object: { sha: "basetreesha" } }), { status: 200 }));
    }
    if (url.includes("/git/blobs")) {
      return Promise.resolve(new Response(JSON.stringify({ sha: "blobsha" }), { status: 201 }));
    }
    if (url.includes("/git/trees")) {
      return Promise.resolve(new Response(JSON.stringify({ sha: "treesha" }), { status: 201 }));
    }
    if (url.includes("/git/commits")) {
      return Promise.resolve(new Response(JSON.stringify({ sha: "commitsha" }), { status: 201 }));
    }
    if (url.includes("/git/refs") && init?.method === "PATCH") {
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const result: PushFilesResult = await adapter.pushFiles(
      PUSH_FILES_DEPS,
      PUSH_FILES_PARAMS,
      PUSH_FILES_PAYLOAD
    );
    assert(isPushFilesSuccess(result));
    assert(result.data.commitSha !== undefined);
    assertEquals(result.data.filesUpdated, PUSH_FILES_PAYLOAD.files.length);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: non-200 responses return GetUserFailure with status and error message from GitHub API", async () => {
  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })
    )
  );
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const result: GetUserResult = await adapter.getUser(GET_USER_DEPS, GET_USER_PARAMS, GET_USER_PAYLOAD);
    assert(isGetUserFailure(result));
    assertEquals(result.error.status, 404);
    assertEquals(result.error.message, "Not Found");
    assertEquals(result.data, undefined);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: listRepos returns ListReposFailure with status and message when API returns 500", async () => {
  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ message: "Internal Server Error" }), { status: 500 })
    )
  );
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const result: ListReposResult = await adapter.listRepos(LIST_REPOS_DEPS, LIST_REPOS_PARAMS, LIST_REPOS_PAYLOAD);
    assert(!isListReposSuccess(result));
    assertEquals(result.error.status, 500);
    assertEquals(result.error.message, "Internal Server Error");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: listBranches returns ListBranchesFailure with status and message when API returns 404", async () => {
  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })
    )
  );
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const result: ListBranchesResult = await adapter.listBranches(
      LIST_BRANCHES_DEPS,
      LIST_BRANCHES_PARAMS,
      LIST_BRANCHES_PAYLOAD
    );
    assert(!isListBranchesSuccess(result));
    assertEquals(result.error.status, 404);
    assertEquals(result.error.message, "Not Found");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: createRepo returns CreateRepoFailure with status and message when API returns 422", async () => {
  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ message: "Validation Failed" }), { status: 422 })
    )
  );
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const result: CreateRepoResult = await adapter.createRepo(
      CREATE_REPO_DEPS,
      CREATE_REPO_PARAMS,
      CREATE_REPO_PAYLOAD
    );
    assert(!isCreateRepoSuccess(result));
    assertEquals(result.error.status, 422);
    assertEquals(result.error.message, "Validation Failed");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: pushFiles returns PushFilesFailure with status and message when API returns error on ref fetch", async () => {
  const fetchStub = stub(globalThis, "fetch", (input: RequestInfo | URL) => {
    const url: string = requestUrl(input);
    if (url.includes("/git/ref/heads/")) {
      return Promise.resolve(
        new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const result: PushFilesResult = await adapter.pushFiles(
      PUSH_FILES_DEPS,
      PUSH_FILES_PARAMS,
      PUSH_FILES_PAYLOAD
    );
    assert(!isPushFilesSuccess(result));
    assertEquals(result.error.status, 404);
    assertEquals(result.error.message, "Not Found");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("parseGitHubUser: throws when input is null", () => {
  assertThrows(() => parseGitHubUser(null), Error, "invalid user");
});

Deno.test("parseGitHubUser: throws when input is not an object", () => {
  assertThrows(() => parseGitHubUser("string"), Error, "invalid user");
});

Deno.test("parseGitHubUser: throws when input lacks required fields", () => {
  assertThrows(() => parseGitHubUser({}), Error);
});

Deno.test("parseGitHubRepo: throws when input is null", () => {
  assertThrows(() => parseGitHubRepo(null), Error, "invalid repo");
});

Deno.test("parseGitHubRepo: throws when input is not an object", () => {
  assertThrows(() => parseGitHubRepo([]), Error, "invalid repo");
});

Deno.test("parseGitHubRepoArray: throws when input is not an array", () => {
  assertThrows(() => parseGitHubRepoArray({}), Error, "invalid repo array");
});

Deno.test("parseGitHubBranch: throws when input is null", () => {
  assertThrows(() => parseGitHubBranch(null), Error, "invalid branch");
});

Deno.test("parseGitHubBranchArray: throws when input is not an array", () => {
  assertThrows(() => parseGitHubBranchArray(null), Error, "invalid branch array");
});

Deno.test("parseGitHubPushResult: throws when input is null", () => {
  assertThrows(() => parseGitHubPushResult(null), Error, "invalid push result");
});

Deno.test("parseGitHubPushResult: throws when input lacks required fields", () => {
  assertThrows(() => parseGitHubPushResult({}), Error);
});

Deno.test("requireCreateRepoPayload: throws when input is null", () => {
  assertThrows(() => requireCreateRepoPayload(null), Error, "expected payload");
});
