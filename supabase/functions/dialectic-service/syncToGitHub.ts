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
} from "./dialectic.interface.ts";
import type { GitHubPushFile } from "../_shared/types/github.types.ts";
import { isGitHubRepoSettings } from "../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isJson } from "../_shared/utils/type-guards/type_guards.common.ts";

type ProjectRow = Pick<
	Database["public"]["Tables"]["dialectic_projects"]["Row"],
	"id" | "user_id" | "repo_url"
>;
type ResourceRow = Pick<
	Database["public"]["Tables"]["dialectic_project_resources"]["Row"],
	"storage_bucket" | "storage_path" | "file_name"
>;
type GithubConnectionRow = Pick<
	Database["public"]["Tables"]["github_connections"]["Row"],
	"installation_id"
>;

const RENDERED_RESOURCE_TYPE = "rendered_document";
const SYNC_COMMIT_MESSAGE = "docs: sync rendered documents from Dialectic";

export const syncToGitHub: SyncToGitHubFn = async (deps, params, payload) => {
	const { supabaseClient, adminClient, storageUtils, generateInstallationToken, createGitHubAdapter, appId, privateKey, logger }: SyncToGitHubDeps = deps;
	const { user }: SyncToGitHubParams = params;
	const { projectId }: SyncToGitHubPayload = payload;

	const { data: project, error: projectError } = await supabaseClient
		.from("dialectic_projects")
		.select("id, user_id, repo_url")
		.eq("id", projectId)
		.single();

	if (projectError || !project) {
		logger.error("syncToGitHub: project not found", { projectId, error: projectError });
		const result: SyncToGitHubResult = {
			error: { message: "Project not found", status: 404, code: "NOT_FOUND" },
			status: 404,
		};
		return result;
	}

	const projectRow: ProjectRow = project;
	if (projectRow.user_id !== user.id) {
		const result: SyncToGitHubResult = {
			error: { message: "Forbidden", status: 403, code: "FORBIDDEN" },
			status: 403,
		};
		return result;
	}

	const rawRepoUrl: unknown = projectRow.repo_url;
	if (rawRepoUrl === null || rawRepoUrl === undefined || !isGitHubRepoSettings(rawRepoUrl)) {
		const result: SyncToGitHubResult = {
			error: { message: "No GitHub repo configured for this project", status: 400, code: "NO_REPO_CONFIG" },
			status: 400,
		};
		return result;
	}

	const settings: GitHubRepoSettings = rawRepoUrl;

	const { data: connection, error: connError } = await adminClient
		.from("github_connections")
		.select("installation_id")
		.eq("user_id", user.id)
		.maybeSingle();

	if (connError || !connection) {
		logger.error("syncToGitHub: no GitHub connection", { userId: user.id, error: connError });
		const result: SyncToGitHubResult = {
			error: { message: "GitHub account not connected", status: 400, code: "NO_GITHUB_CONNECTION" },
			status: 400,
		};
		return result;
	}

	const connRow: GithubConnectionRow = connection;
	const token: string = await generateInstallationToken(
		{ appId, privateKey },
		{ installationId: connRow.installation_id }
	);
	const adapter = createGitHubAdapter(token);

	const { data: resources, error: resourcesError } = await supabaseClient
		.from("dialectic_project_resources")
		.select("storage_bucket, storage_path, file_name")
		.eq("project_id", projectId)
		.eq("resource_type", RENDERED_RESOURCE_TYPE);

	if (resourcesError) {
		logger.error("syncToGitHub: failed to fetch resources", { projectId, error: resourcesError });
		const result: SyncToGitHubResult = {
			error: { message: "Failed to fetch project resources", status: 500, code: "RESOURCES_FETCH_FAILED" },
			status: 500,
		};
		return result;
	}

	const resourceRows: ResourceRow[] = resources ?? [];
	const files: GitHubPushFile[] = [];

	for (const res of resourceRows) {
		const bucket: string = res.storage_bucket;
		const path: string = res.storage_path;
		const resultDownload = await storageUtils.downloadFromStorage(supabaseClient as SupabaseClient<Database>, bucket, path);
		if (resultDownload.error || !resultDownload.data) {
			logger.error("syncToGitHub: download failed", { bucket, path, error: resultDownload.error });
			const errResult: SyncToGitHubResult = {
				error: { message: "Failed to download file from storage", status: 500, code: "DOWNLOAD_FAILED" },
				status: 500,
			};
			return errResult;
		}
		const bytes = new Uint8Array(resultDownload.data);
		let base64: string;
		try {
			base64 = btoa(String.fromCharCode(...bytes));
		} catch {
			base64 = btoa(new TextDecoder().decode(bytes));
		}
		const filePath: string = `${settings.folder}/${res.file_name}`;
		files.push({ path: filePath, content: base64, encoding: "base64" });
	}

	const syncedAt: string = new Date().toISOString();
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
		const result: SyncToGitHubResult = {
			error: { message: "Invalid repo_url update", status: 500, code: "INVALID_REPO_URL_UPDATE" },
			status: 500,
		};
		return result;
	}
	if (files.length === 0) {
		const { error: updateError } = await supabaseClient
			.from("dialectic_projects")
			.update({ repo_url: repoUrlUpdate })
			.eq("id", projectId);

		if (updateError) {
			logger.error("syncToGitHub: failed to update last_sync_at", { projectId, error: updateError });
			const result: SyncToGitHubResult = {
				error: { message: "Failed to update project", status: 500, code: "UPDATE_FAILED" },
				status: 500,
			};
			return result;
		}

		const response: SyncToGitHubResponse = {
			commitSha: "",
			filesUpdated: 0,
			syncedAt,
		};
		return { data: response, status: 200 };
	}

	const pushResult = await adapter.pushFiles(
		settings.owner,
		settings.repo,
		settings.branch,
		files,
		SYNC_COMMIT_MESSAGE
	);

	const { error: updateError } = await supabaseClient
		.from("dialectic_projects")
		.update({ repo_url: repoUrlUpdate })
		.eq("id", projectId);

	if (updateError) {
		logger.error("syncToGitHub: failed to update last_sync_at after push", { projectId, error: updateError });
	}

	const response: SyncToGitHubResponse = {
		commitSha: pushResult.commitSha,
		filesUpdated: pushResult.filesUpdated,
		syncedAt,
	};
	return { data: response, status: 200 };
};
