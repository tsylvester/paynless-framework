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
  IGetInstallationToken,
  ListBranchesParams,
  StoreInstallationPayload,
} from "../_shared/types/github.types.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const getInstallationToken: IGetInstallationToken = async (
  deps: GetInstallationTokenDeps,
  params: GetInstallationTokenParams,
  _payload: GetInstallationTokenPayload
): Promise<GetInstallationTokenReturn> => {
  const { data, error } = await deps.adminClient
    .from("github_connections")
    .select("installation_id")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  try {
    const token: string = await deps.generateInstallationToken(
      { appId: deps.appId, privateKey: deps.privateKey },
      { installationId: data.installation_id }
    );
    return token;
  } catch {
    return null;
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
      let ghUser: GitHubUser;
      try {
        ghUser = await adapter.getUser();
      } catch (err) {
        if (!(err instanceof Error)) throw err;
        deps.logger.error("github-service storeInstallation getUser error", {
          error: err.message,
        });
        return deps.createErrorResponse(err.message, 500, req, err);
      }

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
        .select("github_user_id, github_username")
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

      if (installationToken === null) {
        return deps.createErrorResponse(
          "No GitHub connection found",
          500,
          req
        );
      }

      const repoAdapter = deps.createGitHubAdapter(installationToken);
      let repos: GitHubRepo[];
      try {
        repos = await repoAdapter.listRepos();
      } catch (err) {
        if (!(err instanceof Error)) throw err;
        return deps.createErrorResponse(err.message, 500, req, err);
      }

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

      if (installationToken === null) {
        return deps.createErrorResponse(
          "No GitHub connection found",
          500,
          req
        );
      }

      const branchAdapter = deps.createGitHubAdapter(installationToken);
      let branches: GitHubBranch[];
      try {
        branches = await branchAdapter.listBranches(owner, repo);
      } catch (err) {
        if (!(err instanceof Error)) throw err;
        return deps.createErrorResponse(err.message, 500, req, err);
      }

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

      if (installationToken === null) {
        return deps.createErrorResponse(
          "No GitHub connection found",
          500,
          req
        );
      }

      const createRepoAdapter = deps.createGitHubAdapter(installationToken);
      let newRepo: GitHubRepo;
      try {
        newRepo = await createRepoAdapter.createRepo(createRepoPayload);
      } catch (err) {
        if (!(err instanceof Error)) throw err;
        return deps.createErrorResponse(err.message, 500, req, err);
      }

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
