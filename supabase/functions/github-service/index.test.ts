import { assert, assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert@0.225.3";
import { assertSpyCalls, spy, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { handleGithubServiceRequest, defaultDeps } from "./index.ts";
import {
  createMockSupabaseClient,
  withMockEnv,
  type MockSupabaseDataConfig,
  type MockQueryBuilderState,
} from "../_shared/supabase.mock.ts";
import type {
  CreateRepoDeps,
  CreateRepoParams,
  CreateRepoPayload,
  GenerateInstallationTokenDeps,
  GenerateInstallationTokenParams,
  GetConnectionStatusResponse,
  GetUserDeps,
  GetUserParams,
  GetUserPayload,
  GitHubBranch,
  GitHubCreateRepoPayload,
  GitHubPushResult,
  GitHubRepo,
  GitHubUser,
  GithubConnectionRow,
  GithubServiceDeps,
  IGitHubAdapter,
  ListBranchesDeps,
  ListBranchesParams,
  ListBranchesPayload,
  ListReposDeps,
  ListReposParams,
  ListReposPayload,
  PushFilesDeps,
  PushFilesParams,
  PushFilesPayload,
} from "../_shared/types/github.types.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { User } from "npm:@supabase/gotrue-js@^2.6.3";

const TEST_USER_ID = "test-user-github-123";

const MOCK_USER: User = {
  id: TEST_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const MOCK_GITHUB_USER: GitHubUser = {
  id: 12345,
  login: "octocat",
  avatar_url: "https://github.com/octocat.png",
};
const MOCK_INSTALLATION_ID = 98765;

const MOCK_CREATE_REPO_RESULT: GitHubRepo = {
  id: 1,
  name: "new-repo",
  full_name: "octocat/new-repo",
  owner: { login: "octocat" },
  default_branch: "main",
  private: false,
  html_url: "https://github.com/octocat/new-repo",
};

const MOCK_CONNECTION_ROW: GithubConnectionRow = {
  id: "conn-uuid",
  user_id: TEST_USER_ID,
  installation_id: MOCK_INSTALLATION_ID,
  github_user_id: String(MOCK_GITHUB_USER.id),
  github_username: MOCK_GITHUB_USER.login,
  installation_target_type: "User",
  installation_target_id: 12345,
  permissions: null,
  suspended_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const SUSPENDED_MESSAGE = "GitHub App connection is suspended. Please reactivate at github.com.";

const MOCK_CONNECTION_ROW_SUSPENDED: GithubConnectionRow = {
  ...MOCK_CONNECTION_ROW,
  suspended_at: "2024-01-01T00:00:00Z",
};

const MOCK_ENV: Record<string, string> = {
  GITHUB_APP_ID: "test-app-id",
  GITHUB_APP_PRIVATE_KEY: "test-private-key",
  SUPABASE_URL: "http://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

const EMPTY_GITHUB_REPOS: GitHubRepo[] = [];
const EMPTY_GITHUB_BRANCHES: GitHubBranch[] = [];
const MOCK_PUSH_RESULT: GitHubPushResult = { commitSha: "abc", filesUpdated: 0 };

function createJsonRequest(action: string, payload: unknown, authToken?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return new Request("http://localhost/github-service", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, payload }),
  });
}

function createMockAdapter(overrides: Partial<IGitHubAdapter>): IGitHubAdapter {
  return {
    getUser: spy(
      (_deps: GetUserDeps, _params: GetUserParams, _payload: GetUserPayload) =>
        Promise.resolve({ data: MOCK_GITHUB_USER })
    ),
    listRepos: spy(
      (_deps: ListReposDeps, _params: ListReposParams, _payload: ListReposPayload) =>
        Promise.resolve({ data: EMPTY_GITHUB_REPOS })
    ),
    listBranches: spy(
      (
        _deps: ListBranchesDeps,
        _params: ListBranchesParams,
        _payload: ListBranchesPayload
      ) => Promise.resolve({ data: EMPTY_GITHUB_BRANCHES })
    ),
    createRepo: spy(
      (
        _deps: CreateRepoDeps,
        _params: CreateRepoParams,
        _payload: CreateRepoPayload
      ) => Promise.resolve({ data: MOCK_CREATE_REPO_RESULT })
    ),
    pushFiles: spy(
      (
        _deps: PushFilesDeps,
        _params: PushFilesParams,
        _payload: PushFilesPayload
      ) => Promise.resolve({ data: MOCK_PUSH_RESULT })
    ),
    ...overrides,
  };
}

function createTestDeps(
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
  overrides: Partial<GithubServiceDeps>
): GithubServiceDeps {
  const createSupabaseClient = (_req: Request): SupabaseClient => userClient;
  const createSupabaseAdminClient = (): SupabaseClient => adminClient;
  const base: GithubServiceDeps = {
    ...defaultDeps,
    createSupabaseClient,
    createSupabaseAdminClient,
  };
  const deps: GithubServiceDeps = { ...base, ...overrides };
  return deps;
}

Deno.test("github-service index", { sanitizeOps: false, sanitizeResources: false }, async (t) => {
  await t.step(
    "storeInstallation — receives installationId, generates token, validates via getUser, upserts row, returns { connected: true, username }",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const getUserSpy: Spy = spy(
        (_deps: GetUserDeps, _params: GetUserParams, _payload: GetUserPayload) =>
          Promise.resolve({ data: MOCK_GITHUB_USER })
      );
      const mockAdapter: IGitHubAdapter = createMockAdapter({ getUser: getUserSpy });
      const generateInstallationTokenSpy: Spy = spy(
        (_deps: GenerateInstallationTokenDeps, _params: GenerateInstallationTokenParams) =>
          Promise.resolve("mock-installation-token")
      );
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: () =>
              Promise.resolve({ data: null, error: null, count: null, status: 200 }),
            upsert: (state: MockQueryBuilderState) => {
              assert(state.upsertData !== null);
              return Promise.resolve({
                data: Array.isArray(state.upsertData) ? state.upsertData : [state.upsertData],
                error: null,
                count: null,
                status: 200,
              });
            },
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const overrides: Partial<GithubServiceDeps> = {
        generateInstallationToken: (
          deps: GenerateInstallationTokenDeps,
          params: GenerateInstallationTokenParams
        ) => generateInstallationTokenSpy(deps, params),
        createGitHubAdapter: () => mockAdapter,
      };
      const deps = createTestDeps(
        userClient as unknown as SupabaseClient,
        adminClient as unknown as SupabaseClient,
        overrides
      );
      const req = createJsonRequest(
        "storeInstallation",
        {
          installationId: MOCK_INSTALLATION_ID,
          installation_target_type: "User",
          installation_target_id: 12345,
        },
        "Bearer jwt-token"
      );
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 200);
      const body = await res.json();
      assertObjectMatch(body, { connected: true, username: MOCK_GITHUB_USER.login });
      assertSpyCalls(generateInstallationTokenSpy, 1);
      assertSpyCalls(getUserSpy, 1);
      });
    }
  );

  await t.step(
    "storeInstallation — returns error if generateInstallationToken fails",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const generateInstallationTokenSpy: Spy = spy(() =>
        Promise.reject(new Error("Invalid installation"))
      );
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, {});
      const overrides: Partial<GithubServiceDeps> = {
        generateInstallationToken: (
          deps: GenerateInstallationTokenDeps,
          params: GenerateInstallationTokenParams
        ) => generateInstallationTokenSpy(deps, params),
        createGitHubAdapter: () => createMockAdapter({}),
      };
      const deps = createTestDeps(
        userClient as unknown as SupabaseClient,
        adminClient as unknown as SupabaseClient,
        overrides
      );
      const req = createJsonRequest(
        "storeInstallation",
        { installationId: MOCK_INSTALLATION_ID, installation_target_type: "User", installation_target_id: 12345 },
        "Bearer jwt-token"
      );
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 500);
      const body = await res.json();
      assertExists(body.error);
      });
    }
  );

  await t.step(
    "storeInstallation — returns error if getUser fails after token generation",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const generateInstallationTokenSpy: Spy = spy(() =>
        Promise.resolve("mock-token")
      );
      const mockAdapter: IGitHubAdapter = createMockAdapter({
        getUser: spy(
          (_deps: GetUserDeps, _params: GetUserParams, _payload: GetUserPayload) =>
            Promise.resolve({ error: { message: "Invalid token" } })
        ),
      });
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, {});
      const overrides: Partial<GithubServiceDeps> = {
        generateInstallationToken: (
          deps: GenerateInstallationTokenDeps,
          params: GenerateInstallationTokenParams
        ) => generateInstallationTokenSpy(deps, params),
        createGitHubAdapter: () => mockAdapter,
      };
      const deps = createTestDeps(
        userClient as unknown as SupabaseClient,
        adminClient as unknown as SupabaseClient,
        overrides
      );
      const req = createJsonRequest(
        "storeInstallation",
        { installationId: MOCK_INSTALLATION_ID, installation_target_type: "User", installation_target_id: 12345 },
        "Bearer jwt-token"
      );
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 500);
      const body = await res.json();
      assertExists(body.error);
      });
    }
  );

  await t.step(
    "getConnectionStatus — returns { connected: true, username, github_user_id } when row exists",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: (state: MockQueryBuilderState) => {
              const hasUserId = state.filters.some(
                (f) => f.column === "user_id" && f.value === TEST_USER_ID
              );
              if (hasUserId) {
                const rows: GithubConnectionRow[] = [MOCK_CONNECTION_ROW];
                return Promise.resolve({
                  data: rows,
                  error: null,
                  count: 1,
                  status: 200,
                });
              }
              return Promise.resolve({ data: [], error: null, count: 0, status: 200 });
            },
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const deps = createTestDeps(userClient as unknown as SupabaseClient, adminClient as unknown as SupabaseClient, {});
      const req = createJsonRequest("getConnectionStatus", {}, "Bearer jwt-token");
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 200);
      const body: GetConnectionStatusResponse = await res.json();
      assertObjectMatch(body, {
        connected: true,
        username: MOCK_GITHUB_USER.login,
        github_user_id: String(MOCK_GITHUB_USER.id),
        suspended: false,
      });
      });
    }
  );

  await t.step(
    "getConnectionStatus — returns { connected: true, username, github_user_id, suspended: true } when suspended_at is non-null",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: (state: MockQueryBuilderState) => {
              const hasUserId = state.filters.some(
                (f) => f.column === "user_id" && f.value === TEST_USER_ID
              );
              if (hasUserId) {
                const rows: GithubConnectionRow[] = [MOCK_CONNECTION_ROW_SUSPENDED];
                return Promise.resolve({
                  data: rows,
                  error: null,
                  count: 1,
                  status: 200,
                });
              }
              return Promise.resolve({ data: [], error: null, count: 0, status: 200 });
            },
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const deps = createTestDeps(userClient as unknown as SupabaseClient, adminClient as unknown as SupabaseClient, {});
      const req = createJsonRequest("getConnectionStatus", {}, "Bearer jwt-token");
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 200);
      const body: GetConnectionStatusResponse = await res.json();
      assertObjectMatch(body, {
        connected: true,
        username: MOCK_GITHUB_USER.login,
        github_user_id: String(MOCK_GITHUB_USER.id),
        suspended: true,
      });
      });
    }
  );

  await t.step(
    "getConnectionStatus — returns { connected: false } when no row exists",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: () =>
              Promise.resolve({ data: [], error: null, count: 0, status: 200 }),
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const deps = createTestDeps(userClient as unknown as SupabaseClient, adminClient as unknown as SupabaseClient, {});
      const req = createJsonRequest("getConnectionStatus", {}, "Bearer jwt-token");
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 200);
      const body: GetConnectionStatusResponse = await res.json();
      assertObjectMatch(body, { connected: false });
      });
    }
  );

  await t.step(
    "getConnectionStatus — returns error when select fails",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: () =>
              Promise.resolve({
                data: null,
                error: new Error("DB select failed"),
                count: null,
                status: 500,
                statusText: "Internal Server Error",
              }),
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const deps = createTestDeps(userClient as unknown as SupabaseClient, adminClient as unknown as SupabaseClient, {});
      const req = createJsonRequest("getConnectionStatus", {}, "Bearer jwt-token");
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 500);
      const body: GetConnectionStatusResponse = await res.json();
      assertObjectMatch(body, { error: "DB select failed" });
      });
    }
  );

  await t.step(
    "getInstallationToken returns error with 'suspended' message when github_connections.suspended_at is non-null",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const listReposSpy: Spy = spy(
        (_deps: ListReposDeps, _params: ListReposParams, _payload: ListReposPayload) =>
          Promise.resolve({ data: EMPTY_GITHUB_REPOS })
      );
      const mockAdapter: IGitHubAdapter = createMockAdapter({ listRepos: listReposSpy });
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: (state: MockQueryBuilderState) => {
              const hasUserId = state.filters.some(
                (f) => f.column === "user_id" && f.value === TEST_USER_ID
              );
              if (hasUserId) {
                const rows: GithubConnectionRow[] = [MOCK_CONNECTION_ROW_SUSPENDED];
                return Promise.resolve({
                  data: rows,
                  error: null,
                  count: 1,
                  status: 200,
                });
              }
              return Promise.resolve({ data: [], error: null, count: 0, status: 200 });
            },
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const deps = createTestDeps(
        userClient as unknown as SupabaseClient,
        adminClient as unknown as SupabaseClient,
        { createGitHubAdapter: () => mockAdapter }
      );
      const req = createJsonRequest("listRepos", {}, "Bearer jwt-token");
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 500);
      const body = await res.json();
      assertExists(body.error);
      assertEquals(body.error, SUSPENDED_MESSAGE);
      assertSpyCalls(listReposSpy, 0);
      });
    }
  );

  await t.step(
    "disconnectGitHub — deletes row from github_connections, returns { disconnected: true }",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            delete: () =>
              Promise.resolve({ data: [], error: null, count: null, status: 200 }),
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const deps = createTestDeps(userClient as unknown as SupabaseClient, adminClient as unknown as SupabaseClient, {});
      const req = createJsonRequest("disconnectGitHub", {}, "Bearer jwt-token");
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 200);
      const body = await res.json();
      assertObjectMatch(body, { disconnected: true });
      });
    }
  );

  await t.step(
    "listRepos — reads installation_id, generates token, calls adapter.listRepos(), returns repos",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const mockRepos: GitHubRepo[] = [
        {
          id: 1,
          name: "repo1",
          full_name: "octocat/repo1",
          owner: { login: "octocat" },
          default_branch: "main",
          private: false,
          html_url: "https://github.com/octocat/repo1",
        },
      ];
      const listReposSpy: Spy = spy(
        (_deps: ListReposDeps, _params: ListReposParams, _payload: ListReposPayload) =>
          Promise.resolve({ data: mockRepos })
      );
      const mockAdapter: IGitHubAdapter = createMockAdapter({ listRepos: listReposSpy });
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: (state: MockQueryBuilderState) => {
              const hasUserId = state.filters.some(
                (f) => f.column === "user_id" && f.value === TEST_USER_ID
              );
              if (hasUserId) {
                const rows: GithubConnectionRow[] = [MOCK_CONNECTION_ROW];
                return Promise.resolve({
                  data: rows,
                  error: null,
                  count: 1,
                  status: 200,
                });
              }
              return Promise.resolve({ data: [], error: null, count: 0, status: 200 });
            },
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const generateInstallationTokenMock = spy(
        (_deps: GenerateInstallationTokenDeps, _params: GenerateInstallationTokenParams) =>
          Promise.resolve("mock-installation-token")
      );
      const deps = createTestDeps(
        userClient as unknown as SupabaseClient,
        adminClient as unknown as SupabaseClient,
        {
          generateInstallationToken: (
            deps: GenerateInstallationTokenDeps,
            params: GenerateInstallationTokenParams
          ) => generateInstallationTokenMock(deps, params),
          createGitHubAdapter: () => mockAdapter,
        }
      );
      const req = createJsonRequest("listRepos", {}, "Bearer jwt-token");
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(Array.isArray(body), true);
      assertEquals(body.length, 1);
      assertEquals(body[0].name, "repo1");
      assertSpyCalls(listReposSpy, 1);
      });
    }
  );

  await t.step(
    "listRepos — returns error if no GitHub connection exists",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: () =>
              Promise.resolve({ data: [], error: null, count: 0, status: 200 }),
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const deps = createTestDeps(userClient as unknown as SupabaseClient, adminClient as unknown as SupabaseClient, {});
      const req = createJsonRequest("listRepos", {}, "Bearer jwt-token");
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 500);
      const body = await res.json();
      assertExists(body.error);
      });
    }
  );

  await t.step(
    "listRepos — returns error when connection is suspended (does not attempt GitHub API call)",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const listReposSpy: Spy = spy(
        (_deps: ListReposDeps, _params: ListReposParams, _payload: ListReposPayload) =>
          Promise.resolve({ data: EMPTY_GITHUB_REPOS })
      );
      const mockAdapter: IGitHubAdapter = createMockAdapter({ listRepos: listReposSpy });
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: (state: MockQueryBuilderState) => {
              const hasUserId = state.filters.some(
                (f) => f.column === "user_id" && f.value === TEST_USER_ID
              );
              if (hasUserId) {
                const rows: GithubConnectionRow[] = [MOCK_CONNECTION_ROW_SUSPENDED];
                return Promise.resolve({
                  data: rows,
                  error: null,
                  count: 1,
                  status: 200,
                });
              }
              return Promise.resolve({ data: [], error: null, count: 0, status: 200 });
            },
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const deps = createTestDeps(
        userClient as unknown as SupabaseClient,
        adminClient as unknown as SupabaseClient,
        { createGitHubAdapter: () => mockAdapter }
      );
      const req = createJsonRequest("listRepos", {}, "Bearer jwt-token");
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 500);
      const body = await res.json();
      assertExists(body.error);
      assertEquals(body.error, SUSPENDED_MESSAGE);
      assertSpyCalls(listReposSpy, 0);
      });
    }
  );

  await t.step(
    "listBranches — reads installation_id, generates token, calls adapter.listBranches(owner, repo), returns branches",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const mockBranches: GitHubBranch[] = [
        { name: "main", commit: { sha: "abc" }, protected: false },
      ];
      const listBranchesSpy: Spy = spy(
        (
          _deps: ListBranchesDeps,
          _params: ListBranchesParams,
          _payload: ListBranchesPayload
        ) => Promise.resolve({ data: mockBranches })
      );
      const mockAdapter: IGitHubAdapter = createMockAdapter({ listBranches: listBranchesSpy });
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: () => {
              const rows: GithubConnectionRow[] = [MOCK_CONNECTION_ROW];
              return Promise.resolve({
                data: rows,
                error: null,
                count: 1,
                status: 200,
              });
            },
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const generateInstallationTokenMock = spy(
        (_deps: GenerateInstallationTokenDeps, _params: GenerateInstallationTokenParams) =>
          Promise.resolve("mock-installation-token")
      );
      const deps = createTestDeps(
        userClient as unknown as SupabaseClient,
        adminClient as unknown as SupabaseClient,
        {
          generateInstallationToken: (
            deps: GenerateInstallationTokenDeps,
            params: GenerateInstallationTokenParams
          ) => generateInstallationTokenMock(deps, params),
          createGitHubAdapter: () => mockAdapter,
        }
      );
      const req = createJsonRequest(
        "listBranches",
        { owner: "octocat", repo: "repo1" },
        "Bearer jwt-token"
      );
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(Array.isArray(body), true);
      assertEquals(body[0].name, "main");
      assertSpyCalls(listBranchesSpy, 1);
      });
    }
  );

  await t.step(
    "listBranches — returns error when connection is suspended",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const listBranchesSpy: Spy = spy(
        (
          _deps: ListBranchesDeps,
          _params: ListBranchesParams,
          _payload: ListBranchesPayload
        ) => Promise.resolve({ data: EMPTY_GITHUB_BRANCHES })
      );
      const mockAdapter: IGitHubAdapter = createMockAdapter({ listBranches: listBranchesSpy });
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: (state: MockQueryBuilderState) => {
              const hasUserId = state.filters.some(
                (f) => f.column === "user_id" && f.value === TEST_USER_ID
              );
              if (hasUserId) {
                const rows: GithubConnectionRow[] = [MOCK_CONNECTION_ROW_SUSPENDED];
                return Promise.resolve({
                  data: rows,
                  error: null,
                  count: 1,
                  status: 200,
                });
              }
              return Promise.resolve({ data: [], error: null, count: 0, status: 200 });
            },
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const deps = createTestDeps(
        userClient as unknown as SupabaseClient,
        adminClient as unknown as SupabaseClient,
        { createGitHubAdapter: () => mockAdapter }
      );
      const req = createJsonRequest(
        "listBranches",
        { owner: "octocat", repo: "repo1" },
        "Bearer jwt-token"
      );
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 500);
      const body = await res.json();
      assertExists(body.error);
      assertEquals(body.error, SUSPENDED_MESSAGE);
      assertSpyCalls(listBranchesSpy, 0);
      });
    }
  );

  await t.step(
    "createRepo — reads installation_id, generates token, calls adapter.createRepo(payload), returns new repo",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const createRepoSpy: Spy = spy(
        (
          _deps: CreateRepoDeps,
          _params: CreateRepoParams,
          _payload: CreateRepoPayload
        ) => Promise.resolve({ data: MOCK_CREATE_REPO_RESULT })
      );
      const mockAdapter: IGitHubAdapter = createMockAdapter({ createRepo: createRepoSpy });
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: () => {
              const rows: GithubConnectionRow[] = [MOCK_CONNECTION_ROW];
              return Promise.resolve({
                data: rows,
                error: null,
                count: 1,
                status: 200,
              });
            },
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const generateInstallationTokenMock = spy(
        (_deps: GenerateInstallationTokenDeps, _params: GenerateInstallationTokenParams) =>
          Promise.resolve("mock-installation-token")
      );
      const deps = createTestDeps(
        userClient as unknown as SupabaseClient,
        adminClient as unknown as SupabaseClient,
        {
          generateInstallationToken: (
            deps: GenerateInstallationTokenDeps,
            params: GenerateInstallationTokenParams
          ) => generateInstallationTokenMock(deps, params),
          createGitHubAdapter: () => mockAdapter,
        }
      );
      const payload: GitHubCreateRepoPayload = { name: "new-repo", private: false };
      const req = createJsonRequest("createRepo", payload, "Bearer jwt-token");
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 200);
      const body = await res.json();
      assertObjectMatch(body, { name: "new-repo", full_name: "octocat/new-repo" });
      assertSpyCalls(createRepoSpy, 1);
      });
    }
  );

  await t.step(
    "createRepo — returns error when connection is suspended",
    async () => {
      await withMockEnv(MOCK_ENV, async () => {
      const createRepoSpy: Spy = spy(
        (
          _deps: CreateRepoDeps,
          _params: CreateRepoParams,
          _payload: CreateRepoPayload
        ) => Promise.resolve({ data: MOCK_CREATE_REPO_RESULT })
      );
      const mockAdapter: IGitHubAdapter = createMockAdapter({ createRepo: createRepoSpy });
      const userConfig: MockSupabaseDataConfig = {
        mockUser: MOCK_USER,
      };
      const adminConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          github_connections: {
            select: (state: MockQueryBuilderState) => {
              const hasUserId = state.filters.some(
                (f) => f.column === "user_id" && f.value === TEST_USER_ID
              );
              if (hasUserId) {
                const rows: GithubConnectionRow[] = [MOCK_CONNECTION_ROW_SUSPENDED];
                return Promise.resolve({
                  data: rows,
                  error: null,
                  count: 1,
                  status: 200,
                });
              }
              return Promise.resolve({ data: [], error: null, count: 0, status: 200 });
            },
          },
        },
      };
      const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
      const { client: adminClient } = createMockSupabaseClient(undefined, adminConfig);
      const deps = createTestDeps(
        userClient as unknown as SupabaseClient,
        adminClient as unknown as SupabaseClient,
        { createGitHubAdapter: () => mockAdapter }
      );
      const payload: GitHubCreateRepoPayload = { name: "new-repo", private: false };
      const req = createJsonRequest("createRepo", payload, "Bearer jwt-token");
      const res = await handleGithubServiceRequest(req, deps);
      assertEquals(res.status, 500);
      const body = await res.json();
      assertExists(body.error);
      assertEquals(body.error, SUSPENDED_MESSAGE);
      assertSpyCalls(createRepoSpy, 0);
      });
    }
  );

  await t.step("unauthenticated requests return 401", async () => {
    await withMockEnv(MOCK_ENV, async () => {
    const userConfig: MockSupabaseDataConfig = {
      mockUser: null,
      simulateAuthError: new Error("Unauthorized"),
    };
    const { client: userClient } = createMockSupabaseClient(undefined, userConfig);
    const { client: adminClient } = createMockSupabaseClient(undefined, {});
    const deps = createTestDeps(userClient as unknown as SupabaseClient, adminClient as unknown as SupabaseClient, {});
    const req = createJsonRequest("getConnectionStatus", {});
    const res = await handleGithubServiceRequest(req, deps);
    assertEquals(res.status, 401);
    });
  });

  await t.step("unknown action returns 400", async () => {
    await withMockEnv(MOCK_ENV, async () => {
    const userConfig: MockSupabaseDataConfig = {
      mockUser: MOCK_USER,
    };
    const { client: userClient } = createMockSupabaseClient(TEST_USER_ID, userConfig);
    const { client: adminClient } = createMockSupabaseClient(undefined, {});
    const deps = createTestDeps(userClient as unknown as SupabaseClient, adminClient as unknown as SupabaseClient, {});
    const req = createJsonRequest("unknownAction", {}, "Bearer jwt-token");
    const res = await handleGithubServiceRequest(req, deps);
    assertEquals(res.status, 400);
    const body = await res.json();
    assertExists(body.error);
    });
  });
});
