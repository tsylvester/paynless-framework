import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { spy, stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../types_db.ts";
import type {
	GitHubRepoSettings,
	SyncMapRow,
	SyncToGitHubDeps,
	SyncToGitHubParams,
	SyncToGitHubPayload,
	SyncToGitHubResponse,
	SyncToGitHubResult,
} from "./dialectic.interface.ts";
import type {
	GetUserDeps,
	GetUserParams,
	GetUserPayload,
	IGitHubAdapter,
	ListBranchesDeps,
	ListBranchesParams,
	ListBranchesPayload,
	ListReposDeps,
	ListReposParams,
	ListReposPayload,
	CreateRepoDeps,
	CreateRepoParams,
	CreateRepoPayload,
	PushFilesDeps,
	PushFilesParams,
	PushFilesPayload,
	GitHubPushResult,
	GitHubUser,
	GitHubRepo,
	GitHubBranch,
	GithubConnectionRow,
	GenerateInstallationTokenDeps,
	GenerateInstallationTokenParams,
} from "../_shared/types/github.types.ts";
import type { IStorageUtils } from "../_shared/types/storage_utils.types.ts";
import { createMockDownloadFromStorage, type MockDownloadConfig } from "../_shared/supabase_storage_utils.mock.ts";
import { syncToGitHub } from "./syncToGitHub.ts";
import { logger, type Logger } from "../_shared/logger.ts";
import {
	createMockSupabaseClient,
	type MockSupabaseClientSetup,
	type MockSupabaseDataConfig,
	type MockQueryBuilderState,
} from "../_shared/supabase.mock.ts";
import { constructStoragePath } from "../_shared/utils/path_constructor.ts";
import { FileType, type PathContext } from "../_shared/types/file_manager.types.ts";

const TEST_USER_ID = "user-sync-456";
const OTHER_USER_ID = "other-user-789";
const PROJECT_ID = "project-sync-123";
const INSTALLATION_ID = 999;
const BUCKET = "project-docs";
const STAGE_SLUG = "thesis";
const TEMPLATE_ID = "template-uuid";
const STAGE_ID = "stage-uuid";
const SESSION_ID = "session-uuid";
const MODEL_ID = "model-uuid";
const MODEL_SLUG = "gpt-4";
const DOC_KEY = "business_case";
const FRIENDLY_NAME = "business_case";

const DEFAULT_REPO_SETTINGS: GitHubRepoSettings = {
	provider: "github",
	owner: "octocat",
	repo: "repo",
	branch: "main",
	folder: "docs",
	last_sync_at: null,
};

const REPO_SETTINGS_WITH_LAST_SYNC: GitHubRepoSettings = {
	...DEFAULT_REPO_SETTINGS,
	last_sync_at: "2024-01-01T00:00:00Z",
};

const DEFAULT_PAYLOAD: SyncToGitHubPayload = {
	projectId: PROJECT_ID,
	selectedModelIds: [MODEL_ID],
	selectedDocumentKeys: [DOC_KEY],
	includeRulesFile: false,
};

function buildRenderedDocumentPath(params: {
	projectId: string;
	sessionId: string;
	stageSlug: string;
	iteration: number;
	modelSlug: string;
	attemptCount: number;
	documentKey: string;
}): { storagePath: string; fileName: string } {
	const context: PathContext = {
		projectId: params.projectId,
		fileType: FileType.RenderedDocument,
		sessionId: params.sessionId,
		iteration: params.iteration,
		stageSlug: params.stageSlug,
		modelSlug: params.modelSlug,
		attemptCount: params.attemptCount,
		documentKey: params.documentKey,
	};
	return constructStoragePath(context);
}

const MOCK_USER: User = {
	id: TEST_USER_ID,
	aud: "authenticated",
	role: "authenticated",
	app_metadata: {},
	user_metadata: {},
	created_at: new Date().toISOString(),
};

const MOCK_GITHUB_USER: GitHubUser = {
	id: 1,
	login: "octocat",
	avatar_url: "",
};

const MOCK_PUSH_RESULT: GitHubPushResult = {
	commitSha: "sha-1",
	filesUpdated: 1,
};

const EMPTY_REPOS: GitHubRepo[] = [];
const EMPTY_BRANCHES: GitHubBranch[] = [];

function buildProjectRow(overrides: {
	id?: string;
	user_id?: string;
	repo_url?: GitHubRepoSettings | null;
}): { id: string; user_id: string; repo_url: GitHubRepoSettings | null } {
	return {
		id: PROJECT_ID,
		user_id: TEST_USER_ID,
		repo_url: DEFAULT_REPO_SETTINGS,
		...overrides,
	};
}

function buildConnectionRow(overrides: { user_id?: string; installation_id?: number; suspended_at?: string | null }): GithubConnectionRow {
	const base: GithubConnectionRow = {
		id: "conn-id",
		user_id: TEST_USER_ID,
		installation_id: INSTALLATION_ID,
		github_user_id: String(MOCK_GITHUB_USER.id),
		github_username: MOCK_GITHUB_USER.login,
		installation_target_type: "User",
		installation_target_id: 12345,
		permissions: null,
		suspended_at: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	};
	return { ...base, ...overrides };
}

function buildStorageUtils(config: MockDownloadConfig): IStorageUtils {
	const downloadFromStorage = createMockDownloadFromStorage(config);
	return {
		downloadFromStorage,
		createSignedUrlForPath: async () => ({ signedUrl: null, error: null }),
	};
}

function createMockGitHubAdapter(): IGitHubAdapter {
	return {
		getUser: spy(
			(_deps: GetUserDeps, _params: GetUserParams, _payload: GetUserPayload) =>
				Promise.resolve({ data: MOCK_GITHUB_USER })
		),
		listRepos: spy(
			(_deps: ListReposDeps, _params: ListReposParams, _payload: ListReposPayload) =>
				Promise.resolve({ data: EMPTY_REPOS })
		),
		listBranches: spy(
			(_deps: ListBranchesDeps, _params: ListBranchesParams, _payload: ListBranchesPayload) =>
				Promise.resolve({ data: EMPTY_BRANCHES })
		),
		createRepo: spy(
			(
				_deps: CreateRepoDeps,
				_params: CreateRepoParams,
				_payload: CreateRepoPayload
			) =>
				Promise.resolve({
					data: {
						id: 1,
						name: "",
						full_name: "",
						owner: { login: "" },
						default_branch: "",
						private: false,
						html_url: "",
					},
				})
		),
		pushFiles: async (
			_deps: PushFilesDeps,
			_params: PushFilesParams,
			_payload: PushFilesPayload
		): Promise<{ data: GitHubPushResult }> =>
			Promise.resolve({ data: MOCK_PUSH_RESULT }),
	};
}

function buildDeps(
	setup: MockSupabaseClientSetup,
	adapter: IGitHubAdapter,
	storageConfig: MockDownloadConfig
): SyncToGitHubDeps {
	const storageUtils: IStorageUtils = buildStorageUtils(storageConfig);
	const generateInstallationToken = async (
		_deps: GenerateInstallationTokenDeps,
		_params: GenerateInstallationTokenParams
	): Promise<string> => "mock-token";
	return {
		supabaseClient: setup.client as unknown as SupabaseClient<Database>,
		adminClient: setup.client as unknown as SupabaseClient<Database>,
		storageUtils,
		generateInstallationToken,
		createGitHubAdapter: () => adapter,
		appId: "app-id",
		privateKey: "private-key",
		logger,
	};
}

async function getParamsFromSetup(setup: MockSupabaseClientSetup): Promise<SyncToGitHubParams> {
	const { data } = await setup.client.auth.getUser();
	assertExists(data.user);
	const user: User = data.user;
	return { user };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const ab = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(ab).set(bytes);
	return ab;
}

function buildDefaultConfig(overrides: Partial<MockSupabaseDataConfig> = {}): MockSupabaseDataConfig {
	const projectRow = buildProjectRow({});
	const connectionRow = buildConnectionRow({});
	const defaultPath = buildRenderedDocumentPath({
		projectId: PROJECT_ID,
		sessionId: SESSION_ID,
		stageSlug: STAGE_SLUG,
		iteration: 1,
		modelSlug: MODEL_SLUG,
		attemptCount: 1,
		documentKey: DOC_KEY,
	});
	const resourceRow = {
		storage_bucket: BUCKET,
		storage_path: defaultPath.storagePath,
		file_name: defaultPath.fileName,
		resource_description: { document_key: DOC_KEY },
		source_contribution_id: "contrib-id",
	};
	return {
		mockUser: MOCK_USER,
		genericMockResults: {
			dialectic_projects: {
				select: {
					data: [projectRow],
					error: null,
					count: 1,
					status: 200,
					statusText: "OK",
				},
				update: {
					data: [],
					error: null,
					count: 1,
					status: 200,
					statusText: "OK",
				},
			},
			github_connections: {
				select: {
					data: [connectionRow],
					error: null,
					count: 1,
					status: 200,
					statusText: "OK",
				},
			},
			dialectic_sessions: {
				select: {
					data: [{ current_stage_id: STAGE_ID }],
					error: null,
					count: 1,
					status: 200,
					statusText: "OK",
				},
			},
			dialectic_stages: {
				select: {
					data: [{ recipe_template_id: TEMPLATE_ID }],
					error: null,
					count: 1,
					status: 200,
					statusText: "OK",
				},
			},
			dialectic_sync_maps: {
				select: {
					data: [{ document_key: DOC_KEY, friendly_name: FRIENDLY_NAME }],
					error: null,
					count: 1,
					status: 200,
					statusText: "OK",
				},
			},
			dialectic_project_resources: {
				select: {
					data: [resourceRow],
					error: null,
					count: 1,
					status: 200,
					statusText: "OK",
				},
			},
		},
		...overrides,
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
		mockAdapter = createMockGitHubAdapter();
		pushFilesStub = stub(
			mockAdapter,
			"pushFiles",
			async () => ({ data: MOCK_PUSH_RESULT })
		);
		loggerErrorStub = stub(logger, "error", () => {});
	});

	afterEach(() => {
		loggerErrorStub.restore();
		mockSetup?.clearAllStubs?.();
	});

	it("returns error if project not found", async () => {
		const config = buildDefaultConfig({
			genericMockResults: {
				...buildDefaultConfig().genericMockResults,
				dialectic_projects: {
					select: {
						data: null,
						error: new Error("PGRST116"),
						count: null,
						status: 406,
						statusText: "Not Found",
					},
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.error);
		assertEquals(result.status, 404);
		assertEquals(result.error?.message, "Project not found");
	});

	it("returns error if user does not own the project", async () => {
		const projectRow = buildProjectRow({ user_id: OTHER_USER_ID });
		const config = buildDefaultConfig({
			genericMockResults: {
				...buildDefaultConfig().genericMockResults,
				dialectic_projects: {
					select: { data: [projectRow], error: null, count: 1, status: 200, statusText: "OK" },
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.error);
		assertEquals(result.status, 403);
		assertEquals(result.error?.message, "Forbidden");
	});

	it("returns error if repo_url is null (no GitHub repo configured)", async () => {
		const projectRow = buildProjectRow({ repo_url: null });
		const config = buildDefaultConfig({
			genericMockResults: {
				...buildDefaultConfig().genericMockResults,
				dialectic_projects: {
					select: { data: [projectRow], error: null, count: 1, status: 200, statusText: "OK" },
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.error);
		assertEquals(result.status, 400);
		assertEquals(result.error?.message, "No GitHub repo configured for this project");
	});

	it("returns error if user has no GitHub connection in github_connections", async () => {
		const config = buildDefaultConfig({
			genericMockResults: {
				...buildDefaultConfig().genericMockResults,
				github_connections: {
					select: { data: null, error: null, count: null, status: 200, statusText: "OK" },
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.error);
		assertEquals(result.status, 400);
		assertEquals(result.error?.message, "GitHub account not connected");
	});

	it("returns error with clear message if github_connections.suspended_at is non-null (connection suspended)", async () => {
		const connectionRow = buildConnectionRow({ suspended_at: "2024-01-01T00:00:00Z" });
		const config = buildDefaultConfig({
			genericMockResults: {
				...buildDefaultConfig().genericMockResults,
				github_connections: {
					select: { data: [connectionRow], error: null, count: 1, status: 200, statusText: "OK" },
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.error);
		assertEquals(result.status, 400);
		assertEquals(
			result.error?.message,
			"GitHub App connection is suspended. Please reactivate at github.com."
		);
	});

	it("loads sync map from dialectic_sync_maps for the project's template and applies friendly_name mapping to file paths", async () => {
		const docContent = new TextEncoder().encode("# doc");
		mockSetup = createMockSupabaseClient(TEST_USER_ID, buildDefaultConfig());
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: toArrayBuffer(docContent) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.data);
		assertEquals(result.status, 200);
		const callArgs = pushFilesStub.calls[0]?.args;
		assertExists(callArgs);
		const pushPayload = callArgs[2];
		const filePaths: string[] = pushPayload.files.map((f) => f.path);
		assert(filePaths.some((p) => p.includes(FRIENDLY_NAME) && p.endsWith(".md")));
	});

	it("filters dialectic_project_resources by selectedDocumentKeys (only syncs chosen document types)", async () => {
		const pathDoc = buildRenderedDocumentPath({
			projectId: PROJECT_ID,
			sessionId: SESSION_ID,
			stageSlug: STAGE_SLUG,
			iteration: 1,
			modelSlug: MODEL_SLUG,
			attemptCount: 1,
			documentKey: DOC_KEY,
		});
		const pathOther = buildRenderedDocumentPath({
			projectId: PROJECT_ID,
			sessionId: SESSION_ID,
			stageSlug: STAGE_SLUG,
			iteration: 1,
			modelSlug: MODEL_SLUG,
			attemptCount: 1,
			documentKey: "other_doc",
		});
		const resourceRowDoc = {
			storage_bucket: BUCKET,
			storage_path: pathDoc.storagePath,
			file_name: pathDoc.fileName,
			resource_description: { document_key: DOC_KEY },
			source_contribution_id: "contrib-id",
		};
		const resourceRowOther = {
			storage_bucket: BUCKET,
			storage_path: pathOther.storagePath,
			file_name: pathOther.fileName,
			resource_description: { document_key: "other_doc" },
			source_contribution_id: "contrib-2",
		};
		const defaultMockResults = buildDefaultConfig().genericMockResults;
		const config = buildDefaultConfig({
			genericMockResults: {
				...defaultMockResults,
				dialectic_sync_maps: {
					select: {
						data: [
							{ document_key: DOC_KEY, friendly_name: FRIENDLY_NAME },
							{ document_key: "other_doc", friendly_name: "other_doc" },
						],
						error: null,
						count: 2,
						status: 200,
						statusText: "OK",
					},
				},
				dialectic_project_resources: {
					select: {
						data: [resourceRowDoc, resourceRowOther],
						error: null,
						count: 2,
						status: 200,
						statusText: "OK",
					},
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = {
			...DEFAULT_PAYLOAD,
			selectedDocumentKeys: [DOC_KEY],
		};

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.data);
		assertEquals(result.data.syncedDocumentKeys, [DOC_KEY]);
		assertEquals(result.data.skippedDocumentKeys.length, 0);
	});

	it("syncs one file when one rendered resource matches selected document key", async () => {
		const pathOther = buildRenderedDocumentPath({
			projectId: PROJECT_ID,
			sessionId: SESSION_ID,
			stageSlug: STAGE_SLUG,
			iteration: 1,
			modelSlug: "other",
			attemptCount: 1,
			documentKey: DOC_KEY,
		});
		const config = buildDefaultConfig({
			genericMockResults: {
				...buildDefaultConfig().genericMockResults,
				dialectic_project_resources: {
					select: {
						data: [
							{
								storage_bucket: BUCKET,
								storage_path: pathOther.storagePath,
								file_name: pathOther.fileName,
								resource_description: { document_key: DOC_KEY },
								source_contribution_id: "contrib-id",
							},
						],
						error: null,
						count: 1,
						status: 200,
						statusText: "OK",
					},
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = {
			...DEFAULT_PAYLOAD,
			selectedDocumentKeys: [DOC_KEY],
		};

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.data);
		assertEquals(result.data.filesUpdated, 1);
		assertEquals(result.data.syncedDocumentKeys, [DOC_KEY]);
		assertEquals(result.data.skippedDocumentKeys, []);
	});

	it("single model selected — files placed at docs/{friendly_name}.md (flat structure)", async () => {
		mockSetup = createMockSupabaseClient(TEST_USER_ID, buildDefaultConfig());
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD, selectedModelIds: [MODEL_ID] };

		await syncToGitHub(deps, params, payload);

		const callArgs = pushFilesStub.calls[0]?.args;
		assertExists(callArgs);
		const pushParams = callArgs[1];
		const pushPayload = callArgs[2];
		assertEquals(pushParams.owner, DEFAULT_REPO_SETTINGS.owner);
		assertEquals(pushParams.repo, DEFAULT_REPO_SETTINGS.repo);
		assertEquals(pushParams.branch, DEFAULT_REPO_SETTINGS.branch);
		const docFile = pushPayload.files.find((f) => f.path.includes(FRIENDLY_NAME));
		assertExists(docFile);
		assertEquals(docFile.path, `${DEFAULT_REPO_SETTINGS.folder}/${FRIENDLY_NAME}.md`);
	});

	it("multiple models selected — files placed at docs/{model_slug}/{friendly_name}.md (model subdirectories)", async () => {
		const path1 = buildRenderedDocumentPath({
			projectId: PROJECT_ID,
			sessionId: SESSION_ID,
			stageSlug: STAGE_SLUG,
			iteration: 1,
			modelSlug: MODEL_SLUG,
			attemptCount: 1,
			documentKey: DOC_KEY,
		});
		const path2 = buildRenderedDocumentPath({
			projectId: PROJECT_ID,
			sessionId: SESSION_ID,
			stageSlug: STAGE_SLUG,
			iteration: 1,
			modelSlug: "claude",
			attemptCount: 1,
			documentKey: DOC_KEY,
		});
		const resourceRow2 = {
			storage_bucket: BUCKET,
			storage_path: path2.storagePath,
			file_name: path2.fileName,
			resource_description: { document_key: DOC_KEY },
			source_contribution_id: "contrib-2",
		};
		const config = buildDefaultConfig({
			genericMockResults: {
				...buildDefaultConfig().genericMockResults,
				dialectic_project_resources: {
					select: {
						data: [
							{
								storage_bucket: BUCKET,
								storage_path: path1.storagePath,
								file_name: path1.fileName,
								resource_description: { document_key: DOC_KEY },
								source_contribution_id: "contrib-id",
							},
							resourceRow2,
						],
						error: null,
						count: 2,
						status: 200,
						statusText: "OK",
					},
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = {
			...DEFAULT_PAYLOAD,
			selectedModelIds: [MODEL_ID, "model-2"],
		};

		await syncToGitHub(deps, params, payload);

		const callArgs = pushFilesStub.calls[0]?.args;
		assertExists(callArgs);
		const pushPayload = callArgs[2];
		assert(pushPayload.files.some((f) => f.path.includes(MODEL_SLUG) && f.path.includes(FRIENDLY_NAME)));
		assert(pushPayload.files.some((f) => f.path.includes("claude") && f.path.includes(FRIENDLY_NAME)));
	});

	it("includeRulesFile = true — adds .cursor/rules/rules.md content to the push", async () => {
		mockSetup = createMockSupabaseClient(TEST_USER_ID, buildDefaultConfig());
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD, includeRulesFile: true };

		await syncToGitHub(deps, params, payload);

		const callArgs = pushFilesStub.calls[0]?.args;
		assertExists(callArgs);
		const pushPayload = callArgs[2];
		const rulesFile = pushPayload.files.find((f) => f.path === ".cursor/rules/rules.md");
		assertExists(rulesFile);
	});

	it("includeRulesFile = false — does not include rules file", async () => {
		mockSetup = createMockSupabaseClient(TEST_USER_ID, buildDefaultConfig());
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD, includeRulesFile: false };

		await syncToGitHub(deps, params, payload);

		const callArgs = pushFilesStub.calls[0]?.args;
		assertExists(callArgs);
		const pushPayload = callArgs[2];
		const rulesFile = pushPayload.files.find((f) => f.path === ".cursor/rules/rules.md");
		assertEquals(rulesFile, undefined);
	});

	it("converts downloaded file content to base64 and constructs GitHubPushFile[]", async () => {
		const docContent = new TextEncoder().encode("hello");
		mockSetup = createMockSupabaseClient(TEST_USER_ID, buildDefaultConfig());
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: toArrayBuffer(docContent) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		await syncToGitHub(deps, params, payload);

		const callArgs = pushFilesStub.calls[0]?.args;
		assertExists(callArgs);
		const pushPayload = callArgs[2];
		const docFile = pushPayload.files.find((f) => f.path.endsWith(".md") && f.path !== ".cursor/rules/rules.md");
		assertExists(docFile);
		assertEquals(docFile.encoding, "base64");
		assertExists(docFile.content);
	});

	it("calls adapter.pushFiles() with correct owner, repo, branch, files, and commit message", async () => {
		mockSetup = createMockSupabaseClient(TEST_USER_ID, buildDefaultConfig());
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		await syncToGitHub(deps, params, payload);

		assertEquals(pushFilesStub.calls.length, 1);
		const callArgs = pushFilesStub.calls[0]?.args;
		assertExists(callArgs);
		const pushParams = callArgs[1];
		assertEquals(pushParams.owner, DEFAULT_REPO_SETTINGS.owner);
		assertEquals(pushParams.repo, DEFAULT_REPO_SETTINGS.repo);
		assertEquals(pushParams.branch, DEFAULT_REPO_SETTINGS.branch);
		assertExists(callArgs[2].commitMessage);
	});

	it("updates dialectic_projects.repo_url with last_sync_at timestamp after successful push", async () => {
		mockSetup = createMockSupabaseClient(TEST_USER_ID, buildDefaultConfig());
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		await syncToGitHub(deps, params, payload);

		const updateSpies = mockSetup.spies.getLatestQueryBuilderSpies("dialectic_projects");
		assertExists(updateSpies?.update);
		assert(updateSpies.update.calls.length >= 1);
	});

	it("returns syncedDocumentKeys listing all document keys that were actually pushed", async () => {
		mockSetup = createMockSupabaseClient(TEST_USER_ID, buildDefaultConfig());
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.data);
		assertEquals(result.data.syncedDocumentKeys, [DOC_KEY]);
	});

	it("returns skippedDocumentKeys listing document keys that were selected but had no rendered resource", async () => {
		const config = buildDefaultConfig({
			genericMockResults: {
				...buildDefaultConfig().genericMockResults,
				dialectic_project_resources: {
					select: { data: [], error: null, count: 0, status: 200, statusText: "OK" },
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.data);
		assertEquals(result.data.syncedDocumentKeys.length, 0);
		assertEquals(result.data.skippedDocumentKeys, [DOC_KEY]);
	});

	it("pre-completion sync — user selects 10 docs but only 5 are rendered; response has filesUpdated: 5, syncedDocumentKeys with 5 entries, skippedDocumentKeys with 5 entries", async () => {
		const fiveKeys = ["a", "b", "c", "d", "e"];
		const tenKeys = [...fiveKeys, "f", "g", "h", "i", "j"];
		const fiveResources = fiveKeys.map((k, i) => {
			const path = buildRenderedDocumentPath({
				projectId: PROJECT_ID,
				sessionId: SESSION_ID,
				stageSlug: STAGE_SLUG,
				iteration: 1,
				modelSlug: MODEL_SLUG,
				attemptCount: 1,
				documentKey: k,
			});
			return {
				project_id: PROJECT_ID,
				resource_type: "rendered_document",
				storage_bucket: BUCKET,
				storage_path: path.storagePath,
				file_name: path.fileName,
				resource_description: { document_key: k },
				source_contribution_id: `contrib-${i}`,
			};
		});
		const syncMapData: SyncMapRow[] = tenKeys.map((k, i) => ({
			document_key: k,
			friendly_name: k,
			stage_group: "stage_group",
			layer: "research",
			audience: null,
			sort_order: i,
			created_at: new Date().toISOString(),
			id: crypto.randomUUID(),
			template_id: TEMPLATE_ID,
		}));
		const config = buildDefaultConfig({
			genericMockResults: {
				...buildDefaultConfig().genericMockResults,
				dialectic_sync_maps: {
					select: { data: syncMapData, error: null, count: 10, status: 200, statusText: "OK" },
				},
				dialectic_project_resources: {
					select: { data: fiveResources, error: null, count: 5, status: 200, statusText: "OK" },
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		pushFilesStub.restore();
		pushFilesStub = stub(mockAdapter, "pushFiles", async () => ({
			data: { ...MOCK_PUSH_RESULT, filesUpdated: 5 },
		}));
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = {
			...DEFAULT_PAYLOAD,
			selectedDocumentKeys: tenKeys,
			selectedModelIds: [MODEL_ID],
		};

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.data);
		assertEquals(result.data.filesUpdated, 5);
		assertEquals(result.data.syncedDocumentKeys.length, 5);
		assertEquals(
			result.data.syncedDocumentKeys.length + result.data.skippedDocumentKeys.length,
			payload.selectedDocumentKeys.length,
			"synced + skipped must partition selected keys",
		);
		assertEquals(result.data.skippedDocumentKeys.length, 5);

		pushFilesStub.restore();
		pushFilesStub = stub(mockAdapter, "pushFiles", async () => ({ data: MOCK_PUSH_RESULT }));
	});

	it("empty sync — all selected documents are unrendered; does NOT call pushFiles, does NOT update last_sync_at, returns commitSha: null, filesUpdated: 0, skippedDocumentKeys populated", async () => {
		const config = buildDefaultConfig({
			genericMockResults: {
				...buildDefaultConfig().genericMockResults,
				dialectic_project_resources: {
					select: { data: [], error: null, count: 0, status: 200, statusText: "OK" },
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		const result = await syncToGitHub(deps, params, payload);

		assertEquals(pushFilesStub.calls.length, 0);
		assertExists(result.data);
		assertEquals(result.data.commitSha, null);
		assertEquals(result.data.filesUpdated, 0);
		assertEquals(result.data.syncedDocumentKeys.length, 0);
		assertEquals(result.data.skippedDocumentKeys, [DOC_KEY]);
	});

	it("first sync — last_sync_at is null → commit message is \"docs: initial sync from Paynless ({n} documents)\"", async () => {
		mockSetup = createMockSupabaseClient(TEST_USER_ID, buildDefaultConfig());
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		await syncToGitHub(deps, params, payload);

		const callArgs = pushFilesStub.calls[0]?.args;
		assertExists(callArgs);
		const commitMessage: string = callArgs[2].commitMessage;
		assert(commitMessage.startsWith("docs: initial sync from Paynless ("));
		assert(commitMessage.includes("documents)"));
	});

	it("re-sync — last_sync_at is non-null → commit message is \"docs: sync update from Paynless ({n} documents)\"", async () => {
		const projectRow = buildProjectRow({ repo_url: REPO_SETTINGS_WITH_LAST_SYNC });
		const config = buildDefaultConfig({
			genericMockResults: {
				...buildDefaultConfig().genericMockResults,
				dialectic_projects: {
					select: { data: [projectRow], error: null, count: 1, status: 200, statusText: "OK" },
					update: { data: [], error: null, count: 1, status: 200, statusText: "OK" },
				},
			},
		});
		mockSetup = createMockSupabaseClient(TEST_USER_ID, config);
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		await syncToGitHub(deps, params, payload);

		const callArgs = pushFilesStub.calls[0]?.args;
		assertExists(callArgs);
		const commitMessage: string = callArgs[2].commitMessage;
		assert(commitMessage.startsWith("docs: sync update from Paynless ("));
		assert(commitMessage.includes("documents)"));
	});

	it("GitHub API 404 from pushFiles (deleted repo/branch) → returns actionable error \"The target repository or branch no longer exists. Please update your GitHub settings.\"", async () => {
		pushFilesStub.restore();
		stub(mockAdapter, "pushFiles", async () => ({
			error: { message: "Not Found", status: 404, code: "NOT_FOUND" },
		}));
		mockSetup = createMockSupabaseClient(TEST_USER_ID, buildDefaultConfig());
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.error);
		assertEquals(result.status, 404);
		assertEquals(
			result.error?.message,
			"The target repository or branch no longer exists. Please update your GitHub settings."
		);
	});

	it("GitHub API non-404 errors from pushFiles → returns generic sync error with status and message", async () => {
		pushFilesStub.restore();
		stub(mockAdapter, "pushFiles", async () => ({
			error: { message: "Server Error", status: 500, code: "INTERNAL" },
		}));
		mockSetup = createMockSupabaseClient(TEST_USER_ID, buildDefaultConfig());
		const deps = buildDeps(mockSetup, mockAdapter, { mode: "success", data: new ArrayBuffer(0) });
		const params = await getParamsFromSetup(mockSetup);
		const payload: SyncToGitHubPayload = { ...DEFAULT_PAYLOAD };

		const result = await syncToGitHub(deps, params, payload);

		assertExists(result.error);
		assertEquals(result.status, 500);
		assertEquals(result.error?.message, "Server Error");
	});
});
