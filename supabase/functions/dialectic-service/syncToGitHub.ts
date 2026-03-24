import type { SupabaseClient } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../types_db.ts";
import type {
	SyncToGitHubDeps,
	SyncToGitHubParams,
	SyncToGitHubPayload,
	SyncToGitHubResult,
	SyncToGitHubResponse,
	SyncToGitHubFn,
	GitHubRepoSettings,
	SyncMapRow,
	DialecticProjectRow,
	GitHubConnectionRow,
	DialecticSessionRow,
	DialecticProjectResourceRow,
} from "./dialectic.interface.ts";
import type {
	GitHubPushFile,
	PushFilesDeps,
	PushFilesParams,
	PushFilesPayload,
	PushFilesResult,
	GitHubPushResult,
} from "../_shared/types/github.types.ts";
import type { ServiceError } from "../_shared/types.ts";
import { isGitHubRepoSettings } from "../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isJson } from "../_shared/utils/type-guards/type_guards.common.ts";
import { deconstructStoragePath } from "../_shared/utils/path_deconstructor.ts";
import type { DeconstructedPathInfo } from "../_shared/utils/path_deconstructor.types.ts";

const RENDERED_RESOURCE_TYPE = "rendered_document";
const SUSPENDED_ERROR_MESSAGE = "GitHub App connection is suspended. Please reactivate at github.com.";
const REPO_OR_BRANCH_GONE_MESSAGE = "The target repository or branch no longer exists. Please update your GitHub settings.";

export const syncToGitHub: SyncToGitHubFn = async (deps, params, payload) => {
	const { supabaseClient, adminClient, storageUtils, generateInstallationToken, createGitHubAdapter, appId, privateKey, logger }: SyncToGitHubDeps = deps;
	const { user }: SyncToGitHubParams = params;
	const { projectId, selectedDocumentKeys, includeRulesFile }: SyncToGitHubPayload = payload;

	const selectedSet: Set<string> = new Set(selectedDocumentKeys);

	const { data: project, error: projectError } = await supabaseClient
		.from("dialectic_projects")
		.select("*")
		.eq("id", projectId)
		.single();

	if (projectError || !project) {
		logger.error("syncToGitHub: project not found", { projectId, error: projectError });
		const error: ServiceError = { message: "Project not found", status: 404, code: "NOT_FOUND" };
		const result: SyncToGitHubResult = { error, status: 404 };
		return result;
	}

	const projectRow: DialecticProjectRow = project;
	if (projectRow.user_id !== user.id) {
		const error: ServiceError = { message: "Forbidden", status: 403, code: "FORBIDDEN" };
		const result: SyncToGitHubResult = { error, status: 403 };
		return result;
	}

	const rawRepoUrl: unknown = projectRow.repo_url;
	if (rawRepoUrl === null || rawRepoUrl === undefined || !isGitHubRepoSettings(rawRepoUrl)) {
		const error: ServiceError = { message: "No GitHub repo configured for this project", status: 400, code: "NO_REPO_CONFIG" };
		const result: SyncToGitHubResult = { error, status: 400 };
		return result;
	}

	const settings: GitHubRepoSettings = rawRepoUrl;

	const { data: connection, error: connError } = await adminClient
		.from("github_connections")
		.select("*")
		.eq("user_id", user.id)
		.maybeSingle();

	if (connError || !connection) {
		logger.error("syncToGitHub: no GitHub connection", { userId: user.id, error: connError });
		const error: ServiceError = { message: "GitHub account not connected", status: 400, code: "NO_GITHUB_CONNECTION" };
		const result: SyncToGitHubResult = { error, status: 400 };
		return result;
	}

	const connRow: GitHubConnectionRow = connection;
	if (connRow.suspended_at !== null && connRow.suspended_at !== undefined) {
		const error: ServiceError = { message: SUSPENDED_ERROR_MESSAGE, status: 400, code: "GITHUB_CONNECTION_SUSPENDED" };
		const result: SyncToGitHubResult = { error, status: 400 };
		return result;
	}

	const token: string = await generateInstallationToken(
		{ appId, privateKey },
		{ installationId: connRow.installation_id }
	);
	const adapter = createGitHubAdapter(token);

	const { data: sessionRow }: { data: DialecticSessionRow | null; error: ServiceError | null } = await adminClient
		.from("dialectic_sessions")
		.select("current_stage_id")
		.eq("project_id", projectId)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	let templateId: string | null = null;
	if (sessionRow !== null && sessionRow.current_stage_id !== null) {
		const { data: stageRow } = await adminClient
			.from("dialectic_stages")
			.select("recipe_template_id")
			.eq("id", sessionRow.current_stage_id)
			.maybeSingle();
		if (stageRow !== null && stageRow.recipe_template_id !== null) {
			templateId = stageRow.recipe_template_id;
		}
	}

	const friendlyNameByKey: Map<string, string> = new Map();
	if (templateId) {
		const { data: syncMapRows, error: syncMapError } = await adminClient
			.from("dialectic_sync_maps")
			.select("*")
			.eq("template_id", templateId)
			.order("sort_order", { ascending: true });
		if (!syncMapError && syncMapRows) {
			const rows: SyncMapRow[] = syncMapRows;
			for (const row of rows) {
				friendlyNameByKey.set(row.document_key, row.friendly_name);
			}
		}
	}

	const { data: resourcesData, error: resourcesError } = await supabaseClient
		.from("dialectic_project_resources")
		.select(`*`)
		.eq("project_id", projectId)
		.eq("resource_type", RENDERED_RESOURCE_TYPE);

	if (resourcesError) {
		logger.error("syncToGitHub: failed to fetch resources", { projectId, error: resourcesError });
		const error: ServiceError = { message: "Failed to fetch project resources", status: 500, code: "RESOURCES_FETCH_FAILED" };
		const result: SyncToGitHubResult = { error, status: 500 };
		return result;
	}

	const rawRows: DialecticProjectResourceRow[] = resourcesData;
	const matched: Array<{
		documentKey: string;
		friendlyName: string;
		modelSlug: string;
		storage_bucket: string;
		storage_path: string;
	}> = [];

	for (const row of rawRows) {
		const r: DialecticProjectResourceRow = row;
		const info: DeconstructedPathInfo = deconstructStoragePath({
			storageDir: r.storage_path,
			fileName: r.file_name,
		});
		if (info.documentKey === undefined) {
			logger.error("syncToGitHub: deconstructStoragePath did not set documentKey", { storage_path: r.storage_path, file_name: r.file_name });
			const error: ServiceError = {
				message: "Resource path could not be parsed (missing documentKey)",
				status: 500,
				code: "PATH_PARSE_FAILED",
			};
			const result: SyncToGitHubResult = { error, status: 500 };
			return result;
		}
		if (!selectedSet.has(info.documentKey)) {
			// User did not select this document type; skip this resource.
			continue;
		}
		if (info.modelSlug === undefined) {
			logger.error("syncToGitHub: deconstructStoragePath did not set modelSlug", { storage_path: r.storage_path, file_name: r.file_name });
			const error: ServiceError = {
				message: "Resource path could not be parsed (missing modelSlug)",
				status: 500,
				code: "PATH_PARSE_FAILED",
			};
			const result: SyncToGitHubResult = { error, status: 500 };
			return result;
		}
		const friendlyName: string | undefined = friendlyNameByKey.get(info.documentKey);
		if (friendlyName === undefined) {
			logger.error("syncToGitHub: no friendly_name in sync map for documentKey", { documentKey: info.documentKey });
			const error: ServiceError = {
				message: "Sync map has no friendly_name for document key",
				status: 500,
				code: "SYNC_MAP_MISSING",
			};
			const result: SyncToGitHubResult = { error, status: 500 };
			return result;
		}
		const fullStoragePath: string = `${r.storage_path}/${r.file_name}`;
		matched.push({
			documentKey: info.documentKey,
			friendlyName,
			modelSlug: info.modelSlug,
			storage_bucket: r.storage_bucket,
			storage_path: fullStoragePath,
		});
	}

	const syncedDocumentKeys: string[] = [...new Set(matched.map((m) => m.documentKey))];
	const skippedDocumentKeys: string[] = selectedDocumentKeys.filter((k) => !syncedDocumentKeys.includes(k));
	const syncedAt: string = new Date().toISOString();

	const distinctModelSlugs: Set<string> = new Set(matched.map((m) => m.modelSlug));
	const singleModel: boolean = distinctModelSlugs.size <= 1;

	if (matched.length === 0) {
		const response: SyncToGitHubResponse = {
			commitSha: null,
			filesUpdated: 0,
			syncedAt,
			syncedDocumentKeys: [],
			skippedDocumentKeys,
		};
		return { data: response, status: 200 };
	}

	const basePath: string = settings.folder.replace(/\/$/, "");
	const files: GitHubPushFile[] = [];

	for (const m of matched) {
		const resultDownload = await storageUtils.downloadFromStorage(
			supabaseClient as SupabaseClient<Database>,
			m.storage_bucket,
			m.storage_path
		);
		if (resultDownload.error || !resultDownload.data) {
			logger.error("syncToGitHub: download failed", { bucket: m.storage_bucket, path: m.storage_path, error: resultDownload.error });
			const error: ServiceError = { message: "Failed to download file from storage", status: 500, code: "DOWNLOAD_FAILED" };
			const errResult: SyncToGitHubResult = { error, status: 500 };
			return errResult;
		}
		const bytes = new Uint8Array(resultDownload.data);
		let base64: string;
		try {
			base64 = btoa(String.fromCharCode(...bytes));
		} catch (e) {
			logger.error("syncToGitHub: btoa(String.fromCharCode) failed, using TextDecoder", { path: m.storage_path, error: e });
			base64 = btoa(new TextDecoder().decode(bytes));
		}
		let relPath: string;
		if (singleModel) {
			relPath = `${basePath}/${m.friendlyName}.md`;
		} else {
			relPath = `${basePath}/${m.modelSlug}/${m.friendlyName}.md`;
		}
		files.push({ path: relPath, content: base64, encoding: "base64" });
	}

	if (includeRulesFile) {
		const rulesContent: string = "# Project rules\n";
		const rulesBase64: string = btoa(rulesContent);
		files.push({ path: ".cursor/rules/rules.md", content: rulesBase64, encoding: "base64" });
	}

	const isFirstSync: boolean = settings.last_sync_at === null || settings.last_sync_at === undefined;
	let commitMessage: string;
	if (isFirstSync) {
		commitMessage = `docs: initial sync from Paynless (${files.length} documents)`;
	} else {
		commitMessage = `docs: sync update from Paynless (${files.length} documents)`;
	}

	const pushDeps: PushFilesDeps = { token };
	const pushParams: PushFilesParams = {
		owner: settings.owner,
		repo: settings.repo,
		branch: settings.branch,
	};
	const pushPayload: PushFilesPayload = { files, commitMessage };

	const pushResult: PushFilesResult = await adapter.pushFiles(pushDeps, pushParams, pushPayload);

	if (pushResult.error) {
		const err: ServiceError = pushResult.error;
		const status: number | undefined = err.status;
		let message: string;
		if (status === 404) {
			message = REPO_OR_BRANCH_GONE_MESSAGE;
		} else if (typeof err.message === "string") {
			message = err.message;
		} else {
			message = "Adapter returned an error with no message.";
		}
		const error: ServiceError = { message, status, code: err.code };
		const result: SyncToGitHubResult = { error, status };
		return result;
	}

	const pushData: GitHubPushResult = pushResult.data;

	const repoUrlWithSync: GitHubRepoSettings = { ...settings, last_sync_at: syncedAt };
	const repoUrlUpdate: GitHubRepoSettings = {
		provider: repoUrlWithSync.provider,
		owner: repoUrlWithSync.owner,
		repo: repoUrlWithSync.repo,
		branch: repoUrlWithSync.branch,
		folder: repoUrlWithSync.folder,
		last_sync_at: repoUrlWithSync.last_sync_at,
	};

	if (!isJson(repoUrlUpdate)) {
		logger.error("syncToGitHub: invalid repo_url update", { projectId, repoUrlUpdate });
		const error: ServiceError = { message: "Invalid repo_url update", status: 500, code: "INVALID_REPO_URL_UPDATE" };
		const result: SyncToGitHubResult = { error, status: 500 };
		return result;
	}

	const { error: updateError } = await supabaseClient
		.from("dialectic_projects")
		.update({ repo_url: repoUrlUpdate })
		.eq("id", projectId);

	if (updateError) {
		logger.error("syncToGitHub: failed to update last_sync_at after push", { projectId, error: updateError });
		const error: ServiceError = {
			message: "Sync succeeded but failed to update last_sync_at",
			status: 500,
			code: "REPO_URL_UPDATE_FAILED",
		};
		const result: SyncToGitHubResult = { error, status: 500 };
		return result;
	}

	const response: SyncToGitHubResponse = {
		commitSha: pushData.commitSha,
		filesUpdated: pushData.filesUpdated,
		syncedAt,
		syncedDocumentKeys,
		skippedDocumentKeys,
	};
	return { data: response, status: 200 };
};
