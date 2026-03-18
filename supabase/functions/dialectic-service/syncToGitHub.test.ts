import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@^2";
import type { Database, Tables, TablesUpdate } from "../types_db.ts";
import type {
	SyncToGitHubDeps,
	SyncToGitHubParams,
	SyncToGitHubPayload,
	SyncToGitHubResult,
} from "./dialectic.interface.ts";
import { isDialecticProjectUpdate, isGitHubRepoSettings, isRepoUrlWithLastSyncAt } from "../_shared/utils/type-guards/type_guards.dialectic.ts";
import type { IGitHubAdapter, GitHubPushFile } from "../_shared/types/github.types.ts";
import type { IStorageUtils } from "../_shared/types/storage_utils.types.ts";
import { syncToGitHub } from "./syncToGitHub.ts";
import { logger, type Logger } from "../_shared/logger.ts";
import {
	createMockSupabaseClient,
	type MockSupabaseClientSetup,
	type MockSupabaseDataConfig,
	type MockQueryBuilderState,
} from "../_shared/supabase.mock.ts";

/** Narrows mock update payload to dialectic_projects update using the real type guard. */
function ensureDialecticProjectUpdate(
	value: MockQueryBuilderState["updateData"]
): TablesUpdate<"dialectic_projects"> {
	if (!value || !isDialecticProjectUpdate(value)) {
		throw new Error("expected dialectic_projects update payload");
	}
	return value;
}

function getMockUser(id: string): User {
	return {
		id,
		app_metadata: {},
		user_metadata: {},
		aud: "authenticated",
		created_at: new Date().toISOString(),
	};
}

const PROJECT_ID = "project-sync-123";
const USER_ID = "user-sync-456";
const INSTALLATION_ID = 999;
const BUCKET = "project-docs";
const STORAGE_PATH = "path/to/file";
const FILE_NAME = "doc.md";

/** Default repo_url for project row; type from schema column. */
const defaultRepoUrl: NonNullable<Tables<"dialectic_projects">["repo_url"]> = {
	provider: "github",
	owner: "octocat",
	repo: "repo",
	branch: "main",
	folder: "docs",
	last_sync_at: null,
};

function projectRow(overrides: Partial<Tables<"dialectic_projects">>): Tables<"dialectic_projects"> {
	const base: Tables<"dialectic_projects"> = {
		id: PROJECT_ID,
		user_id: USER_ID,
		project_name: "Test",
		initial_user_prompt: "Prompt",
		process_template_id: null,
		selected_domain_id: "d-1",
		selected_domain_overlay_id: null,
		user_domain_overlay_values: null,
		repo_url: defaultRepoUrl,
		status: "active",
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		initial_prompt_resource_id: null,
		idempotency_key: null,
	};
	return { ...base, ...overrides };
}

function resourceRow(overrides: Partial<Tables<"dialectic_project_resources">>): Tables<"dialectic_project_resources"> {
	const base: Tables<"dialectic_project_resources"> = {
		id: "res-1",
		project_id: PROJECT_ID,
		user_id: USER_ID,
		file_name: FILE_NAME,
		mime_type: "text/markdown",
		size_bytes: 10,
		storage_bucket: BUCKET,
		storage_path: STORAGE_PATH,
		resource_description: null,
		resource_type: "rendered_document",
		session_id: null,
		source_contribution_id: null,
		stage_slug: null,
		iteration_number: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	};
	return { ...base, ...overrides };
}

function githubConnectionRow(): Tables<"github_connections"> {
	return {
		id: "conn-1",
		user_id: USER_ID,
		github_user_id: "gh-1",
		github_username: "octocat",
		installation_id: INSTALLATION_ID,
		installation_target_type: "User",
		installation_target_id: 1,
		permissions: null,
		suspended_at: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	};
}

/** IStorageUtils that delegates to the mock client's storage so storageMock.downloadResult drives behavior. */
function createStorageUtilsFromMock(client: MockSupabaseClientSetup["client"]): IStorageUtils {
	return {
		downloadFromStorage: async (
			supabase: Parameters<IStorageUtils["downloadFromStorage"]>[0],
			bucket: string,
			path: string
		) => {
			const r = await supabase.storage.from(bucket).download(path);
			if (r.error || !r.data) {
				return { data: null, error: r.error ?? new Error("No data") };
			}
			const data = await r.data.arrayBuffer();
			return { data, mimeType: r.data.type || undefined, error: null };
		},
		createSignedUrlForPath: async () => ({ signedUrl: null, error: null }),
	};
}

function buildDeps(
	setup: MockSupabaseClientSetup,
	opts: {
		generateInstallationToken: SyncToGitHubDeps["generateInstallationToken"];
		createGitHubAdapter: SyncToGitHubDeps["createGitHubAdapter"];
		storageUtils?: IStorageUtils;
	}
): SyncToGitHubDeps {
	const client: SupabaseClient<Database> = setup.client as unknown as SupabaseClient<Database>;
	return {
		supabaseClient: client,
		adminClient: client,
		storageUtils: opts.storageUtils ?? createStorageUtilsFromMock(setup.client),
		generateInstallationToken: opts.generateInstallationToken,
		createGitHubAdapter: opts.createGitHubAdapter,
		appId: "app-1",
		privateKey: "pem",
		logger,
	};
}

describe("syncToGitHub", () => {
	let mockSetup: MockSupabaseClientSetup;
	let mockAdapter: IGitHubAdapter;
	let pushFilesStub: Stub<
		IGitHubAdapter,
		Parameters<IGitHubAdapter["pushFiles"]>,
		ReturnType<IGitHubAdapter["pushFiles"]>
	>;
	let loggerErrorStub: Stub<
		Logger,
		Parameters<Logger["error"]>,
		ReturnType<Logger["error"]>
	>;

	beforeEach(() => {
		mockAdapter = {
			getUser: async () => ({ id: 1, login: "octocat", avatar_url: "" }),
			listRepos: async () => [],
			listBranches: async () => [],
			createRepo: async () => ({ id: 1, name: "", full_name: "", owner: { login: "" }, default_branch: "", private: false, html_url: "" }),
			pushFiles: async () => ({ commitSha: "sha-1", filesUpdated: 1 }),
		};
		pushFilesStub = stub(
			mockAdapter,
			"pushFiles",
			async () => ({ commitSha: "sha-1", filesUpdated: 1 })
		);
		loggerErrorStub = stub(logger, "error", () => {});
	});

	afterEach(() => {
		loggerErrorStub.restore();
		mockSetup?.clearAllStubs?.();
	});

	it("returns error if project not found", async () => {
		mockSetup = createMockSupabaseClient(USER_ID, {
			mockUser: getMockUser(USER_ID),
			genericMockResults: {
				dialectic_projects: {
					select: { data: [], error: null },
				},
			},
		});
		const deps = buildDeps(mockSetup, {
			generateInstallationToken: async () => "mock-token",
			createGitHubAdapter: () => mockAdapter,
		});
		const params: SyncToGitHubParams = { user: getMockUser(USER_ID) };
		const payload: SyncToGitHubPayload = { projectId: PROJECT_ID };

		const result: SyncToGitHubResult = await syncToGitHub(deps, params, payload);

		assertExists(result.error);
		assertEquals(result.status, 404);
	});

	it("returns error if user does not own the project", async () => {
		const otherUserId = "other-user";
		mockSetup = createMockSupabaseClient(USER_ID, {
			mockUser: getMockUser(USER_ID),
			genericMockResults: {
				dialectic_projects: {
					select: { data: [projectRow({ user_id: otherUserId })], error: null },
				},
			},
		});
		const deps = buildDeps(mockSetup, {
			generateInstallationToken: async () => "mock-token",
			createGitHubAdapter: () => mockAdapter,
		});
		const params: SyncToGitHubParams = { user: getMockUser(USER_ID) };
		const payload: SyncToGitHubPayload = { projectId: PROJECT_ID };

		const result: SyncToGitHubResult = await syncToGitHub(deps, params, payload);

		assertExists(result.error);
		assertEquals(result.status, 403);
	});

	it("returns error if repo_url is null (no GitHub repo configured)", async () => {
		mockSetup = createMockSupabaseClient(USER_ID, {
			mockUser: getMockUser(USER_ID),
			genericMockResults: {
				dialectic_projects: {
					select: { data: [projectRow({ repo_url: null })], error: null },
				},
			},
		});
		const deps = buildDeps(mockSetup, {
			generateInstallationToken: async () => "mock-token",
		createGitHubAdapter: () => mockAdapter,
	});
		const params: SyncToGitHubParams = { user: getMockUser(USER_ID) };
		const payload: SyncToGitHubPayload = { projectId: PROJECT_ID };

		const result: SyncToGitHubResult = await syncToGitHub(deps, params, payload);

		assertExists(result.error);
		assertEquals(result.status, 400);
	});

	it("returns error if user has no GitHub connection in github_connections", async () => {
		mockSetup = createMockSupabaseClient(USER_ID, {
			mockUser: getMockUser(USER_ID),
			genericMockResults: {
				dialectic_projects: {
					select: { data: [projectRow({})], error: null },
				},
				github_connections: {
					select: { data: [], error: null },
				},
			},
		});
		const deps = buildDeps(mockSetup, {
			generateInstallationToken: async () => "mock-token",
		createGitHubAdapter: () => mockAdapter,
	});
		const params: SyncToGitHubParams = { user: getMockUser(USER_ID) };
		const payload: SyncToGitHubPayload = { projectId: PROJECT_ID };

		const result: SyncToGitHubResult = await syncToGitHub(deps, params, payload);

		assertExists(result.error);
		assertEquals(result.status, 400);
	});

	it("queries dialectic_project_resources for the project and downloads each file from storage", async () => {
		const resource = resourceRow({});
		mockSetup = createMockSupabaseClient(USER_ID, {
			mockUser: getMockUser(USER_ID),
			genericMockResults: {
				dialectic_projects: {
					select: { data: [projectRow({})], error: null },
					update: { data: [], error: null },
				},
				github_connections: {
					select: { data: [githubConnectionRow()], error: null },
				},
				dialectic_project_resources: {
					select: (state: MockQueryBuilderState) => {
						const eqProject = state.filters.find((f) => f.column === "project_id" && f.value === PROJECT_ID);
						return Promise.resolve(
							eqProject
								? { data: [resource], error: null, count: 1, status: 200, statusText: "OK" }
								: { data: [], error: null, count: 0, status: 200, statusText: "OK" }
						);
					},
				},
			},
			storageMock: {
				downloadResult: (_bucketId: string, path: string) =>
					Promise.resolve({
						data: path === STORAGE_PATH ? new Blob(["content"]) : null,
						error: null,
					}),
			},
		});
		const deps = buildDeps(mockSetup, {
			generateInstallationToken: async () => "mock-token",
		createGitHubAdapter: () => mockAdapter,
	});
		const params: SyncToGitHubParams = { user: getMockUser(USER_ID) };
		const payload: SyncToGitHubPayload = { projectId: PROJECT_ID };

		// Attach storage spies before sync so download calls are recorded (bucket API is created on first storage.from(BUCKET))
		const bucketSpies = mockSetup.spies.storage.from(BUCKET);

		await syncToGitHub(deps, params, payload);

		assertEquals(bucketSpies.downloadSpy.calls.length, 1);
		assertEquals(bucketSpies.downloadSpy.calls[0].args[0], STORAGE_PATH);
	});

	it("converts downloaded file content to base64 and constructs GitHubPushFile[] with paths under the configured folder", async () => {
		mockSetup = createMockSupabaseClient(USER_ID, {
			mockUser: getMockUser(USER_ID),
			genericMockResults: {
				dialectic_projects: {
					select: { data: [projectRow({})], error: null },
					update: { data: [], error: null },
				},
				github_connections: {
					select: { data: [githubConnectionRow()], error: null },
				},
				dialectic_project_resources: {
					select: (state: MockQueryBuilderState) => {
						const eqProject = state.filters.find((f) => f.column === "project_id" && f.value === PROJECT_ID);
						return Promise.resolve(
							eqProject
								? { data: [resourceRow({})], error: null, count: 1, status: 200, statusText: "OK" }
								: { data: [], error: null, count: 0, status: 200, statusText: "OK" }
						);
					},
				},
			},
			storageMock: {
				downloadResult: (_bucketId: string, path: string) =>
					Promise.resolve({
						data: path === STORAGE_PATH ? new Blob(["hello"]) : null,
						error: null,
					}),
			},
		});
		const deps = buildDeps(mockSetup, {
			generateInstallationToken: async () => "mock-token",
		createGitHubAdapter: () => mockAdapter,
	});
		const params: SyncToGitHubParams = { user: getMockUser(USER_ID) };
		const payload: SyncToGitHubPayload = { projectId: PROJECT_ID };

		await syncToGitHub(deps, params, payload);

		assertEquals(pushFilesStub.calls.length, 1);
		const files: GitHubPushFile[] = pushFilesStub.calls[0].args[3];
		assertEquals(files.length, 1);
		assert(isGitHubRepoSettings(defaultRepoUrl));
		assertEquals(files[0].path, `${defaultRepoUrl.folder}/${FILE_NAME}`);
		assertEquals(files[0].encoding, "base64");
		assertExists(files[0].content);
	});

	it("calls adapter.pushFiles() with correct owner, repo, branch, files, and commit message", async () => {
		mockSetup = createMockSupabaseClient(USER_ID, {
			mockUser: getMockUser(USER_ID),
			genericMockResults: {
				dialectic_projects: {
					select: { data: [projectRow({})], error: null },
					update: { data: [], error: null },
				},
				github_connections: {
					select: { data: [githubConnectionRow()], error: null },
				},
				dialectic_project_resources: {
					select: (state: MockQueryBuilderState) => {
						const eqProject = state.filters.find((f) => f.column === "project_id" && f.value === PROJECT_ID);
						return Promise.resolve(
							eqProject
								? { data: [resourceRow({})], error: null, count: 1, status: 200, statusText: "OK" }
								: { data: [], error: null, count: 0, status: 200, statusText: "OK" }
						);
					},
				},
			},
			storageMock: {
				downloadResult: () =>
					Promise.resolve({ data: new Blob(["x"]), error: null }),
			},
		});
		const deps = buildDeps(mockSetup, {
			generateInstallationToken: async () => "mock-token",
		createGitHubAdapter: () => mockAdapter,
	});
		const params: SyncToGitHubParams = { user: getMockUser(USER_ID) };
		const payload: SyncToGitHubPayload = { projectId: PROJECT_ID };

		await syncToGitHub(deps, params, payload);

		assertEquals(pushFilesStub.calls.length, 1);
		assert(isGitHubRepoSettings(defaultRepoUrl));
		assertEquals(pushFilesStub.calls[0].args[0], defaultRepoUrl.owner);
		assertEquals(pushFilesStub.calls[0].args[1], defaultRepoUrl.repo);
		assertEquals(pushFilesStub.calls[0].args[2], defaultRepoUrl.branch);
		assertEquals(typeof pushFilesStub.calls[0].args[4], "string");
		assertExists(pushFilesStub.calls[0].args[4]);
	});

	it("updates dialectic_projects.repo_url with last_sync_at timestamp after successful push", async () => {
		let updatePayload: MockQueryBuilderState["updateData"] = null;
		mockSetup = createMockSupabaseClient(USER_ID, {
			mockUser: getMockUser(USER_ID),
			genericMockResults: {
				dialectic_projects: {
					select: { data: [projectRow({})], error: null },
					update: (state: MockQueryBuilderState) => {
						updatePayload = state.updateData;
						return Promise.resolve({
							data: [],
							error: null,
							count: 1,
							status: 200,
							statusText: "OK",
						});
					},
				},
				github_connections: {
					select: { data: [githubConnectionRow()], error: null },
				},
				dialectic_project_resources: {
					select: (state: MockQueryBuilderState) => {
						const eqProject = state.filters.find((f) => f.column === "project_id" && f.value === PROJECT_ID);
						return Promise.resolve(
							eqProject
								? { data: [resourceRow({})], error: null, count: 1, status: 200, statusText: "OK" }
								: { data: [], error: null, count: 0, status: 200, statusText: "OK" }
						);
					},
				},
			},
			storageMock: {
				downloadResult: () =>
					Promise.resolve({ data: new Blob(["x"]), error: null }),
			},
		});
		const deps = buildDeps(mockSetup, {
			generateInstallationToken: async () => "mock-token",
		createGitHubAdapter: () => mockAdapter,
	});
		const params: SyncToGitHubParams = { user: getMockUser(USER_ID) };
		const payload: SyncToGitHubPayload = { projectId: PROJECT_ID };

		await syncToGitHub(deps, params, payload);

		const update: TablesUpdate<"dialectic_projects"> = ensureDialecticProjectUpdate(updatePayload);
		if (!update.repo_url || !isRepoUrlWithLastSyncAt(update.repo_url)) {
			throw new Error("expected repo_url with last_sync_at");
		}
		assertExists(update.repo_url.last_sync_at);
	});

	it("returns { commitSha, filesUpdated, syncedAt } on success", async () => {
		mockSetup = createMockSupabaseClient(USER_ID, {
			mockUser: getMockUser(USER_ID),
			genericMockResults: {
				dialectic_projects: {
					select: { data: [projectRow({})], error: null },
					update: { data: [], error: null },
				},
				github_connections: {
					select: { data: [githubConnectionRow()], error: null },
				},
				dialectic_project_resources: {
					select: (state: MockQueryBuilderState) => {
						const eqProject = state.filters.find((f) => f.column === "project_id" && f.value === PROJECT_ID);
						return Promise.resolve(
							eqProject
								? { data: [resourceRow({})], error: null, count: 1, status: 200, statusText: "OK" }
								: { data: [], error: null, count: 0, status: 200, statusText: "OK" }
						);
					},
				},
			},
			storageMock: {
				downloadResult: () =>
					Promise.resolve({ data: new Blob(["x"]), error: null }),
			},
		});
		const deps = buildDeps(mockSetup, {
			generateInstallationToken: async () => "mock-token",
		createGitHubAdapter: () => mockAdapter,
	});
		const params: SyncToGitHubParams = { user: getMockUser(USER_ID) };
		const payload: SyncToGitHubPayload = { projectId: PROJECT_ID };

		const result: SyncToGitHubResult = await syncToGitHub(deps, params, payload);

		assertExists(result.data);
		assertEquals(result.data?.commitSha, "sha-1");
		assertEquals(result.data?.filesUpdated, 1);
		assertExists(result.data?.syncedAt);
	});

	it("handles empty dialectic_project_resources gracefully (returns success with 0 files)", async () => {
		mockSetup = createMockSupabaseClient(USER_ID, {
			mockUser: getMockUser(USER_ID),
			genericMockResults: {
				dialectic_projects: {
					select: { data: [projectRow({})], error: null },
					update: { data: [], error: null },
				},
				github_connections: {
					select: { data: [githubConnectionRow()], error: null },
				},
				dialectic_project_resources: {
					select: { data: [], error: null },
				},
			},
		});
		const deps = buildDeps(mockSetup, {
			generateInstallationToken: async () => "mock-token",
		createGitHubAdapter: () => mockAdapter,
	});
		const params: SyncToGitHubParams = { user: getMockUser(USER_ID) };
		const payload: SyncToGitHubPayload = { projectId: PROJECT_ID };

		const result: SyncToGitHubResult = await syncToGitHub(deps, params, payload);

		assertExists(result.data);
		assertEquals(result.data?.filesUpdated, 0);
		assertExists(result.data?.syncedAt);
		assertEquals(pushFilesStub.calls.length, 0);
	});
});
