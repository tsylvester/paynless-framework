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
  GitHubCreateRepoPayload,
  GitHubPushFile,
  GitHubPushResult,
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

const MOCK_CREATE_REPO_PAYLOAD: GitHubCreateRepoPayload = {
  name: "newrepo",
  description: "desc",
  private: false,
  auto_init: true,
};

const MOCK_CREATE_REPO_RESPONSE: GitHubRepo = {
  id: 102,
  name: "newrepo",
  full_name: "testuser/newrepo",
  owner: { login: "testuser" },
  default_branch: "main",
  private: false,
  html_url: "https://github.com/testuser/newrepo",
};

const MOCK_PUSH_FILES: GitHubPushFile[] = [
  { path: "a.txt", content: "YQ==", encoding: "base64" },
];

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
    await adapter.getUser();
    assertSpyCalls(fetchStub, 1);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: getUser calls GET https://api.github.com/user and returns typed GitHubUser", async () => {
  let capturedUrl = "";
  const fetchStub = stub(globalThis, "fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = requestUrl(input);
    assertEquals(init?.method ?? "GET", "GET");
    return Promise.resolve(
      new Response(JSON.stringify(MOCK_GET_USER_RESPONSE), { status: 200 })
    );
  });
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const raw: unknown = await adapter.getUser();
    const result: GitHubUser = parseGitHubUser(raw);
    assert(capturedUrl.includes("api.github.com"));
    assert(capturedUrl.includes("/user"));
    assertEquals(result.id, MOCK_GET_USER_RESPONSE.id);
    assertEquals(result.login, MOCK_GET_USER_RESPONSE.login);
    assertEquals(result.avatar_url, MOCK_GET_USER_RESPONSE.avatar_url);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: listRepos calls GET https://api.github.com/user/repos with sort=updated&per_page=100 and returns GitHubRepo[]", async () => {
  let capturedUrl = "";
  const fetchStub = stub(globalThis, "fetch", (input: RequestInfo | URL) => {
    capturedUrl = requestUrl(input);
    return Promise.resolve(
      new Response(JSON.stringify(MOCK_LIST_REPOS_RESPONSE), { status: 200 })
    );
  });
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const raw: unknown = await adapter.listRepos();
    const result: GitHubRepo[] = parseGitHubRepoArray(raw);
    assert(capturedUrl.includes("api.github.com"));
    assert(capturedUrl.includes("/user/repos"));
    assert(capturedUrl.includes("sort=updated"));
    assert(capturedUrl.includes("per_page=100"));
    assertEquals(result.length, 1);
    assertEquals(result[0].name, MOCK_LIST_REPOS_RESPONSE[0].name);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: listBranches calls GET https://api.github.com/repos/:owner/:repo/branches and returns GitHubBranch[]", async () => {
  const owner = "testuser";
  const repo = "repo1";
  let capturedUrl = "";
  const fetchStub = stub(globalThis, "fetch", (input: RequestInfo | URL) => {
    capturedUrl = requestUrl(input);
    return Promise.resolve(
      new Response(JSON.stringify(MOCK_LIST_BRANCHES_RESPONSE), { status: 200 })
    );
  });
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    const raw: unknown = await adapter.listBranches(owner, repo);
    const result: GitHubBranch[] = parseGitHubBranchArray(raw);
    assert(capturedUrl.includes("api.github.com"));
    assert(capturedUrl.includes(`/repos/${owner}/${repo}/branches`));
    assertEquals(result.length, 1);
    assertEquals(result[0].name, MOCK_LIST_BRANCHES_RESPONSE[0].name);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: createRepo calls POST https://api.github.com/user/repos with JSON body and returns GitHubRepo", async () => {
  let capturedMethod = "";
  let capturedUrl = "";
  let capturedBody: GitHubCreateRepoPayload | null = null;
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
    const raw: unknown = await adapter.createRepo(MOCK_CREATE_REPO_PAYLOAD);
    const result: GitHubRepo = parseGitHubRepo(raw);
    assert(capturedUrl.includes("api.github.com"));
    assert(capturedUrl.includes("/user/repos"));
    assertEquals(capturedMethod, "POST");
    const body: GitHubCreateRepoPayload = requireCreateRepoPayload(capturedBody);
    assertEquals(body.name, MOCK_CREATE_REPO_PAYLOAD.name);
    assertEquals(result.name, MOCK_CREATE_REPO_RESPONSE.name);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: pushFiles creates blobs, builds tree, creates commit, updates ref and returns GitHubPushResult", async () => {
  const owner = "testuser";
  const repo = "repo1";
  const branch = "main";
  const commitMessage = "msg";
  const fetchStub = stub(globalThis, "fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
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
    const raw: unknown = await adapter.pushFiles(owner, repo, branch, MOCK_PUSH_FILES, commitMessage);
    const result: GitHubPushResult = parseGitHubPushResult(raw);
    assert(result.commitSha !== undefined);
    assertEquals(result.filesUpdated, MOCK_PUSH_FILES.length);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GitHubApiAdapter: non-200 responses throw with status and error message from GitHub API", async () => {
  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })
    )
  );
  try {
    const adapter = new GitHubApiAdapter(MOCK_TOKEN);
    let thrown: Error | null = null;
    try {
      await adapter.getUser();
    } catch (e) {
      thrown = e instanceof Error ? e : new Error(String(e));
    }
    assert(thrown !== null);
    assert(thrown.message.includes("404"));
    assert(thrown.message.includes("Not Found"));
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
