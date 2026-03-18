import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSupabaseClient } from "../_shared/auth.ts";
import { createSupabaseAdminClient } from "../_shared/auth.ts";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from "../_shared/cors-headers.ts";
import { logger } from "../_shared/logger.ts";
import { GitHubApiAdapter } from "../_shared/adapters/github_adapter.ts";
import { generateInstallationToken } from "../_shared/utils/github_token.ts";
import { isGithubServiceRequestBody } from "../_shared/utils/type-guards/type_guards.github.ts";
import type {
  GithubServiceDeps,
  GithubServiceRequestBody,
  GithubConnectionInsert,
  GitHubUser,
  GitHubRepo,
  GitHubBranch,
  GitHubCreateRepoPayload,
  GetInstallationTokenDeps,
  GetInstallationTokenParams,
  GetInstallationTokenPayload,
  GetInstallationTokenReturn,
  GetUserParams,
  GetUserPayload,
  IGetInstallationToken,
  ListBranchesParams,
  ListReposParams,
  ListReposPayload,
  ListBranchesPayload,
  CreateRepoParams,
  CreateRepoPayload,
  StoreInstallationPayload,
} from "../_shared/types/github.types.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUSPENDED_MESSAGE =
  "GitHub App connection is suspended. Please reactivate at github.com.";

const getInstallationToken: IGetInstallationToken = async (
  deps: GetInstallationTokenDeps,
  params: GetInstallationTokenParams,
  _payload: GetInstallationTokenPayload
): Promise<GetInstallationTokenReturn> => {
  const { data, error } = await deps.adminClient
    .from("github_connections")
    .select("installation_id, suspended_at")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error !== null || data === null) {
    return { error: { message: "No GitHub connection found" } };
  }

  if (data.suspended_at !== null && data.suspended_at !== undefined) {
    return { error: { message: SUSPENDED_MESSAGE } };
  }

  try {
    const token: string = await deps.generateInstallationToken(
      { appId: deps.appId, privateKey: deps.privateKey },
      { installationId: data.installation_id }
    );
    return { data: token };
  } catch (err) {
    const message: string =
      err instanceof Error ? err.message : "Token generation failed";
    return { error: { message } };
  }
};

async function handleGithubServiceRequest(
  req: Request,
  deps: GithubServiceDeps
): Promise<Response> {
  const corsResponse: Response | null = deps.handleCorsPreflightRequest(req);
  if (corsResponse !== null) {
    return corsResponse;
  }

  const userClient: SupabaseClient = deps.createSupabaseClient(req);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError !== null || authData.user === null) {
    deps.logger.warn("github-service: unauthenticated request");
    return deps.createErrorResponse("Unauthorized", 401, req);
  }

  const userId: string = authData.user.id;

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch (parseErr) {
    if (!(parseErr instanceof Error)) throw parseErr;
    return deps.createErrorResponse(parseErr.message, 400, req, parseErr);
  }

  if (!isGithubServiceRequestBody(bodyRaw)) {
    return deps.createErrorResponse(
      "Request body must have action (storeInstallation|getConnectionStatus|disconnectGitHub|listRepos|listBranches|createRepo) and matching payload",
      400,
      req
    );
  }

  const body: GithubServiceRequestBody = bodyRaw;

  const appIdEnv: string | undefined = Deno.env.get("GITHUB_APP_ID");
  const privateKeyEnv: string | undefined = Deno.env.get("GITHUB_APP_PRIVATE_KEY");
  if (typeof appIdEnv !== "string" || appIdEnv.trim() === "") {
    deps.logger.error("github-service: GITHUB_APP_ID missing or empty");
    return deps.createErrorResponse(
      "GITHUB_APP_ID missing or empty",
      500,
      req
    );
  }
  if (typeof privateKeyEnv !== "string" || privateKeyEnv.trim() === "") {
    deps.logger.error("github-service: GITHUB_APP_PRIVATE_KEY missing or empty");
    return deps.createErrorResponse(
      "GITHUB_APP_PRIVATE_KEY missing or empty",
      500,
      req
    );
  }
  const appId: string = appIdEnv;
  const privateKey: string = privateKeyEnv;

  const adminClient: SupabaseClient = deps.createSupabaseAdminClient();

  switch (body.action) {
    case "storeInstallation": {
      const pl: StoreInstallationPayload = body.payload;
      const installationId: number = pl.installationId;

      let token: string;
      try {
        token = await deps.generateInstallationToken(
          { appId, privateKey },
          { installationId }
        );
      } catch (err) {
        if (!(err instanceof Error)) throw err;
        deps.logger.error("github-service storeInstallation token error", {
          error: err.message,
        });
        return deps.createErrorResponse(err.message, 500, req, err);
      }

      const adapter = deps.createGitHubAdapter(token);
      const getUserParams: GetUserParams = {};
      const getUserPayload: GetUserPayload = {};
      const getUserResult = await adapter.getUser(
        { token },
        getUserParams,
        getUserPayload
      );
      if (getUserResult.error !== undefined) {
        deps.logger.error("github-service storeInstallation getUser error", {
          error: getUserResult.error.message,
        });
        return deps.createErrorResponse(
          getUserResult.error.message,
          500,
          req
        );
      }
      const ghUser: GitHubUser = getUserResult.data;

      const row: GithubConnectionInsert = {
        user_id: userId,
        installation_id: pl.installationId,
        github_user_id: String(ghUser.id),
        github_username: ghUser.login,
        installation_target_type: pl.installation_target_type,
        installation_target_id: pl.installation_target_id,
      };

      const { error: upsertError } = await adminClient
        .from("github_connections")
        .upsert(row, { onConflict: "user_id" });

      if (upsertError !== null) {
        deps.logger.error("github-service storeInstallation upsert error", {
          error: upsertError.message,
        });
        return deps.createErrorResponse(
          upsertError.message,
          500,
          req,
          upsertError
        );
      }

      return deps.createSuccessResponse(
        { connected: true, username: ghUser.login },
        200,
        req
      );
    }

    case "getConnectionStatus": {
      const { data: rows, error: selectError } = await adminClient
        .from("github_connections")
        .select("github_user_id, github_username, suspended_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (selectError !== null) {
        deps.logger.error("github-service getConnectionStatus select error", {
          error: selectError.message,
        });
        return deps.createErrorResponse(
          selectError.message,
          500,
          req,
          selectError
        );
      }

      if (rows === null) {
        return deps.createSuccessResponse({ connected: false }, 200, req);
      }

      return deps.createSuccessResponse(
        {
          connected: true,
          username: rows.github_username,
          github_user_id: rows.github_user_id,
          suspended: rows.suspended_at !== null && rows.suspended_at !== undefined,
        },
        200,
        req
      );
    }

    case "disconnectGitHub": {
      const { error: deleteError } = await adminClient
        .from("github_connections")
        .delete()
        .eq("user_id", userId);

      if (deleteError !== null) {
        deps.logger.error("github-service disconnectGitHub delete error", {
          error: deleteError.message,
        });
        return deps.createErrorResponse(
          deleteError.message,
          500,
          req,
          deleteError
        );
      }

      return deps.createSuccessResponse({ disconnected: true }, 200, req);
    }

    case "listRepos": {
      const payloadEmpty: GetInstallationTokenPayload = {};
      const installationToken: GetInstallationTokenReturn = await getInstallationToken(
        {
          adminClient,
          generateInstallationToken: deps.generateInstallationToken,
          appId,
          privateKey,
        },
        { userId },
        payloadEmpty
      );

      if (installationToken.error !== undefined) {
        return deps.createErrorResponse(
          installationToken.error.message,
          500,
          req
        );
      }

      const repoAdapter = deps.createGitHubAdapter(installationToken.data);
      const listReposParams: ListReposParams = {};
      const listReposPayload: ListReposPayload = {};
      const listReposResult = await repoAdapter.listRepos(
        { token: installationToken.data },
        listReposParams,
        listReposPayload
      );
      if (listReposResult.error !== undefined) {
        return deps.createErrorResponse(
          listReposResult.error.message,
          500,
          req
        );
      }
      const repos: GitHubRepo[] = listReposResult.data;
      return deps.createSuccessResponse(repos, 200, req);
    }

    case "listBranches": {
      const listBranchesPayload: ListBranchesParams = body.payload;
      const owner: string = listBranchesPayload.owner;
      const repo: string = listBranchesPayload.repo;

      const payloadEmpty: GetInstallationTokenPayload = {};
      const installationToken: GetInstallationTokenReturn = await getInstallationToken(
        {
          adminClient,
          generateInstallationToken: deps.generateInstallationToken,
          appId,
          privateKey,
        },
        { userId },
        payloadEmpty
      );

      if (installationToken.error !== undefined) {
        return deps.createErrorResponse(
          installationToken.error.message,
          500,
          req
        );
      }

      const branchAdapter = deps.createGitHubAdapter(installationToken.data);
      const listBranchesPayloadEmpty: ListBranchesPayload = {};
      const listBranchesResult = await branchAdapter.listBranches(
        { token: installationToken.data },
        { owner, repo },
        listBranchesPayloadEmpty
      );
      if (listBranchesResult.error !== undefined) {
        return deps.createErrorResponse(
          listBranchesResult.error.message,
          500,
          req
        );
      }
      const branches: GitHubBranch[] = listBranchesResult.data;
      return deps.createSuccessResponse(branches, 200, req);
    }

    case "createRepo": {
      const createRepoPayload: GitHubCreateRepoPayload = body.payload;

      const payloadEmpty: GetInstallationTokenPayload = {};
      const installationToken: GetInstallationTokenReturn = await getInstallationToken(
        {
          adminClient,
          generateInstallationToken: deps.generateInstallationToken,
          appId,
          privateKey,
        },
        { userId },
        payloadEmpty
      );

      if (installationToken.error !== undefined) {
        return deps.createErrorResponse(
          installationToken.error.message,
          500,
          req
        );
      }

      const createRepoAdapter = deps.createGitHubAdapter(installationToken.data);
      const createRepoParams: CreateRepoParams = {};
      const createRepoPayloadTyped: CreateRepoPayload = {
        name: createRepoPayload.name,
        description: createRepoPayload.description,
        private: createRepoPayload.private,
      };
      const createRepoResult = await createRepoAdapter.createRepo(
        { token: installationToken.data },
        createRepoParams,
        createRepoPayloadTyped
      );
      if (createRepoResult.error !== undefined) {
        return deps.createErrorResponse(
          createRepoResult.error.message,
          500,
          req
        );
      }
      const newRepo: GitHubRepo = createRepoResult.data;
      return deps.createSuccessResponse(newRepo, 200, req);
    }

    default: {
      const exhaustive: never = body;
      return deps.createErrorResponse(`Unknown action: ${JSON.stringify(exhaustive)}`, 400, req);
    }
  }
}

const defaultDeps: GithubServiceDeps = {
  createSupabaseClient: createSupabaseClient,
  createSupabaseAdminClient: createSupabaseAdminClient,
  handleCorsPreflightRequest: handleCorsPreflightRequest,
  createErrorResponse: createErrorResponse,
  createSuccessResponse: createSuccessResponse,
  logger,
  generateInstallationToken: generateInstallationToken,
  createGitHubAdapter: (token: string) => new GitHubApiAdapter(token),
};

export { handleGithubServiceRequest, defaultDeps };

serve((req: Request) => handleGithubServiceRequest(req, defaultDeps));
