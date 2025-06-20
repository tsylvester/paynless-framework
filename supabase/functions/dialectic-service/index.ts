// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@^2.43.4';
import {
  DialecticServiceRequest,
  UpdateProjectDomainPayload,
  StartSessionPayload,
  GenerateContributionsPayload,
  GetProjectDetailsPayload,
  DialecticProject,
  DialecticContribution,
  DomainOverlayDescriptor,
  StartSessionSuccessResponse,
  GenerateContributionsSuccessResponse,
  GetProjectResourceContentPayload,
  GetProjectResourceContentResponse,
  SaveContributionEditPayload,
  SubmitStageResponsesPayload,
  SubmitStageResponsesResponse,
  SubmitStageResponsesDependencies,
  FetchProcessTemplatePayload,
  DialecticProcessTemplate,
  UpdateSessionModelsPayload,
  DialecticSession,
  GetContributionContentDataResponse,
} from "./dialectic.interface.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from "../_shared/cors-headers.ts";
import { logger, Logger } from "../_shared/logger.ts";
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js';
import type {
  ServiceError,
  GetUserFnResult,
  GetUserFn,
  ILogger
} from '../_shared/types.ts';
import type { DomainDescriptor } from "./listAvailableDomains.ts";
import type { IFileManager } from "../_shared/types/file_manager.types.ts";
import type { DownloadStorageResult } from "../_shared/supabase_storage_utils.ts";
import type { IStorageUtils } from "../_shared/types/storage_utils.types.ts";
import { createProject } from "./createProject.ts";
import { listAvailableDomains } from "./listAvailableDomains.ts";
import { updateProjectDomain } from "./updateProjectDomain.ts";
import { getProjectDetails } from "./getProjectDetails.ts";
import { getContributionContentHandler } from "./getContributionContent.ts";
import { startSession } from "./startSession.ts";
import { generateContributions } from "./generateContribution.ts";
import { listProjects } from "./listProjects.ts";
import { listAvailableDomainOverlays } from "./listAvailableDomainOverlays.ts";
import { deleteProject } from './deleteProject.ts';
import { cloneProject, CloneProjectResult } from './cloneProject.ts';
import { exportProject } from './exportProject.ts';
import { getProjectResourceContent } from "./getProjectResourceContent.ts";
import { saveContributionEdit } from './saveContributionEdit.ts';
import { submitStageResponses } from './submitStageResponses.ts';
import { downloadFromStorage } from '../_shared/supabase_storage_utils.ts';
import { listDomains, type DialecticDomain } from './listDomains.ts';
import { fetchProcessTemplate } from './fetchProcessTemplate.ts';
import { FileManagerService } from '../_shared/services/file_manager.ts';
import { handleUpdateSessionModels } from './updateSessionModels.ts';

console.log("dialectic-service function started");

export interface DialecticServiceDependencies {
  dbClient: SupabaseClient;
  userClient: SupabaseClient;
  handlers: ActionHandlers;
  logger: ILogger;
  getUserFn: GetUserFn;
  authToken?: string | null;
}

// --- START: DI Helper Functions (AuthError replaced with ServiceError) ---
interface IsValidDomainFn { (dbClient: SupabaseClient, domainId: string): Promise<boolean>; }
interface CreateSignedUrlFnResult { signedUrl: string | null; error: Error | null; }
interface CreateSignedUrlFn { (client: SupabaseClient, bucket: string, path: string, expiresIn: number): Promise<CreateSignedUrlFnResult>; }

export const isValidDomainDefaultFn: IsValidDomainFn = async (dbClient, domainId) => {
  if (domainId === null) return true;
  const { data, error } = await dbClient
    .from('domain_specific_prompt_overlays')
    .select('domain_id')
    .eq('domain_id', domainId)
    .maybeSingle();
  if (error) {
    logger.error('Error validating domain id in isValidDomainDefaultFn', { error, domainId });
    return false;
  }
  return !!data;
};

export const createSignedUrlDefaultFn: CreateSignedUrlFn = async (client, bucket, path, expiresIn): Promise<{ signedUrl: string | null; error: Error | null }> => {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    if (error instanceof Error) {
      return { signedUrl: null, error: error };
    }
    // If it's not an Error instance, create a new one.
    // This handles cases where 'error' might be a Supabase specific error object that isn't a JS Error.
    const storageError = error as { message?: string; error?: string; statusCode?: string };
    return { signedUrl: null, error: new Error(storageError.message || 'Storage error creating signed URL') };
  }
  return { signedUrl: data?.signedUrl || null, error: null };
};
// --- END: DI Helper Functions ---

// Define ActionHandlers interface
export interface ActionHandlers {
  createProject: (payload: FormData, dbClient: SupabaseClient, user: User) => Promise<{ data?: DialecticProject; error?: ServiceError; status?: number }>;
  listAvailableDomains: (dbClient: SupabaseClient, payload?: { stageAssociation?: string }) => Promise<DomainDescriptor[] | { error: ServiceError }>;
  updateProjectDomain: (getUserFn: GetUserFn, dbClient: SupabaseClient, payload: UpdateProjectDomainPayload, logger: ILogger) => Promise<{ data?: DialecticProject; error?: ServiceError }>;
  getProjectDetails: (payload: GetProjectDetailsPayload, dbClient: SupabaseClient, user: User) => Promise<{ data?: DialecticProject; error?: ServiceError; status?: number }>;
  getContributionContentHandler: (getUserFn: GetUserFn, dbClient: SupabaseClient, logger: ILogger, payload: { contributionId: string }) => Promise<{ data?: GetContributionContentDataResponse; error?: ServiceError; status?: number }>;
  startSession: (user: User, dbClient: SupabaseClient, payload: StartSessionPayload, dependencies: { logger: ILogger }) => Promise<{ data?: StartSessionSuccessResponse; error?: ServiceError }>;
  generateContributions: (dbClient: SupabaseClient, payload: GenerateContributionsPayload, authToken: string, dependencies: { logger: ILogger }) => Promise<{ success: boolean; data?: GenerateContributionsSuccessResponse; error?: ServiceError }>;
  listProjects: (user: User, dbClient: SupabaseClient) => Promise<{ data?: DialecticProject[]; error?: ServiceError; status?: number }>;
  listAvailableDomainOverlays: (stageAssociation: string, dbClient: SupabaseClient) => Promise<DomainOverlayDescriptor[]>;
  deleteProject: (dbClient: SupabaseClient, payload: { projectId: string }, userId: string) => Promise<{data?: null, error?: { message: string; details?: string | undefined; }, status?: number}>;
  cloneProject: (dbClient: SupabaseClient, fileManager: IFileManager, originalProjectId: string, newProjectName: string | undefined, cloningUserId: string) => Promise<CloneProjectResult>;
  exportProject: (dbClient: SupabaseClient, fileManager: IFileManager, storageUtils: IStorageUtils, projectId: string, userId: string) => Promise<{ data?: { export_url: string }; error?: ServiceError; status?: number }>;
  getProjectResourceContent: (payload: GetProjectResourceContentPayload, dbClient: SupabaseClient, user: User) => Promise<{ data?: GetProjectResourceContentResponse; error?: ServiceError; status?: number }>;
  saveContributionEdit: (payload: SaveContributionEditPayload, dbClient: SupabaseClient, user: User, logger: ILogger) => Promise<{ data?: DialecticContribution; error?: ServiceError; status?: number }>;
  submitStageResponses: (payload: SubmitStageResponsesPayload, dbClient: SupabaseClient, user: User, dependencies: SubmitStageResponsesDependencies) => Promise<{ data?: SubmitStageResponsesResponse; error?: ServiceError; status?: number }>;
  listDomains: (dbClient: SupabaseClient) => Promise<{ data?: DialecticDomain[]; error?: ServiceError }>;
  fetchProcessTemplate: (dbClient: SupabaseClient, payload: FetchProcessTemplatePayload) => Promise<{ data?: DialecticProcessTemplate; error?: ServiceError; status?: number }>;
  updateSessionModels: (dbClient: SupabaseClient, payload: UpdateSessionModelsPayload, userId: string) => Promise<{ data?: DialecticSession; error?: ServiceError; status?: number }>;
}

export async function handleRequest(
  req: Request,
  handlers: ActionHandlers,
  userClient: SupabaseClient,
  adminClient: SupabaseClient
): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  let authToken: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    authToken = authHeader.substring(7);
  }

  const getUserFnForRequest: GetUserFn = async (): Promise<GetUserFnResult> => {
    if (!authHeader) {
      return { data: { user: null }, error: { message: "User not authenticated", status: 401, code: 'AUTH_TOKEN_MISSING' } };
    }
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error) {
      return { data: { user: null }, error: { message: error.message, status: error.status || 500, code: error.name || 'AUTH_ERROR' } };
    }
    return { data: { user: user as User | null }, error: null };
  };

  try {
    const contentType = req.headers.get("content-type");

    if (req.method === 'POST' && contentType?.startsWith("multipart/form-data")) {
      const formData = await req.formData();
      const action = formData.get('action') as string | null;
      logger.info('Multipart POST request received', { actionFromFormData: action });

      const { data: userData, error: userError } = await getUserFnForRequest();
      if (userError || !userData?.user) {
        const err = userError || { message: "User not authenticated for this multipart action.", status: 401, code: 'USER_AUTH_FAILED' };
        return createErrorResponse(err.message, err.status || 401, req, err);
      }
      const userForMultipart = userData.user;

      switch (action) {
        case 'createProject': {
          const { data, error, status } = await handlers.createProject(formData, adminClient, userForMultipart);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 201, req);
        }
        default: {
          const errorMessage = `Unknown action '${action}' for multipart/form-data.`;
          logger.warn(errorMessage, { action });
          return createErrorResponse(errorMessage, 400, req, { message: errorMessage, status: 400, code: 'INVALID_MULTIPART_ACTION' });
        }
      }
    } else if (contentType?.startsWith("application/json")) {
      const requestBody: DialecticServiceRequest = await req.json();
      const action = requestBody.action;
      logger.info('JSON request received', { action, payloadExists: 'payload' in requestBody });

      const actionsRequiringAuth = [
        'listProjects', 'getProjectDetails', 'updateProjectDomain', 
        'startSession', 'generateContributions', 'getContributionContentSignedUrl',
        'deleteProject', 'cloneProject', 'exportProject', 'getProjectResourceContent',
        'saveContributionEdit', 'submitStageResponses', 'fetchProcessTemplate',
        'updateSessionModels'
      ];

      let userForJson: User | null = null;
      if (actionsRequiringAuth.includes(action)) {
        const { data: userData, error: userError } = await getUserFnForRequest();
        if (userError || !userData?.user) {
          const err = userError || { message: `User not authenticated for action: ${action}.`, status: 401, code: 'USER_AUTH_FAILED' };
          return createErrorResponse(err.message, err.status || 401, req, err);
        }
        userForJson = userData.user;
      }

      const fileManager = new FileManagerService(adminClient);

      // Route to the appropriate handler
      switch (requestBody.action) {
        // --- Unauthenticated Actions ---
        case "listAvailableDomains": {
          const result = await handlers.listAvailableDomains(adminClient, requestBody.payload);
          if (result && 'error' in result) {
            return createErrorResponse(result.error.message, result.error.status, req, result.error);
          }
          return createSuccessResponse(result, 200, req);
        }
        case "listAvailableDomainOverlays": {
          if (!requestBody.payload || typeof requestBody.payload.stageAssociation !== 'string') {
            return createErrorResponse("stageAssociation is required.", 400, req, { message: "stageAssociation is required.", status: 400 });
          }
          const data = await handlers.listAvailableDomainOverlays(requestBody.payload.stageAssociation, adminClient);
          return createSuccessResponse(data, 200, req);
        }
        case "listDomains": {
            const { data, error } = await handlers.listDomains(adminClient);
            if (error) {
              return createErrorResponse(error.message, error.status, req, error);
            }
            return createSuccessResponse(data, 200, req);
        }
        case "fetchProcessTemplate": {
          const { data, error, status } = await handlers.fetchProcessTemplate(userClient, requestBody.payload as FetchProcessTemplatePayload);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 200, req);
        }

        // --- Authenticated Actions ---
        case "listProjects": {
          const { data, error, status } = await handlers.listProjects(userForJson!, userClient);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, 200, req);
        }
        case "getProjectDetails": {
          if (!requestBody.payload || !requestBody.payload.projectId) {
            return createErrorResponse("projectId is required.", 400, req, { message: "projectId is required.", status: 400 });
          }
          const { data, error, status } = await handlers.getProjectDetails(requestBody.payload, adminClient, userForJson!);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, 200, req);
        }
        case "updateProjectDomain": {
          const payload = requestBody.payload as UpdateProjectDomainPayload;
          if (!payload || !payload.projectId || !payload.selectedDomainId) {
            return createErrorResponse("projectId and domainId are required.", 400, req, { message: "projectId and domainId are required.", status: 400 });
          }
          const { data, error } = await handlers.updateProjectDomain(getUserFnForRequest, adminClient, payload, logger);
          if (error) {
            return createErrorResponse(error.message, error.status, req, error);
          }
          return createSuccessResponse(data, 200, req);
        }
        case "startSession": {
          const payload = requestBody.payload as StartSessionPayload;
          if (!payload || !payload.projectId) {
            return createErrorResponse("projectId is required.", 400, req, { message: "projectId is required.", status: 400 });
          }
          const { data, error } = await handlers.startSession(userForJson!, adminClient, payload, { logger });
          if (error) {
            return createErrorResponse(error.message, error.status, req, error);
          }
          return createSuccessResponse(data, 200, req);
        }
        case "generateContributions": {
          const payload = requestBody.payload as GenerateContributionsPayload;
           if (!payload || !payload.sessionId) {
            return createErrorResponse("sessionId is required for generateContributions.", 400, req, { message: "sessionId is required for generateContributions.", status: 400 });
          }
          const { success, data, error } = await handlers.generateContributions(adminClient, payload, authToken!, { logger });
          if (!success || error) {
            return createErrorResponse(error?.message || "Generation failed", error?.status || 500, req, error);
          }
          return createSuccessResponse(data, 202, req);
        }
        case "getContributionContentData": {
          const payload = requestBody.payload as { contributionId: string };
          if (!payload || !payload.contributionId) {
            return createErrorResponse("contributionId is required.", 400, req, { message: "contributionId is required.", status: 400 });
          }
          const { data, error, status } = await handlers.getContributionContentHandler(getUserFnForRequest, adminClient, logger, payload);
          if (error) {
            return createErrorResponse(error.message, status, req, error);
          }
          return createSuccessResponse(data, 200, req);
        }
        case "deleteProject": {
          const payload = requestBody.payload as { projectId: string };
          if (!payload || !payload.projectId) {
            return createErrorResponse("projectId is required for deleteProject.", 400, req, { message: "projectId is required for deleteProject.", status: 400 });
          }
          const { data, error, status } = await handlers.deleteProject(adminClient, payload, userForJson!.id);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 204, req);
        }
        case "cloneProject": {
          const payload = requestBody.payload as { projectId: string, newProjectName?: string };
          if (!payload || !payload.projectId) {
              return createErrorResponse("projectId is required for cloneProject.", 400, req, { message: "projectId is required for cloneProject.", status: 400 });
          }
          const { data, error } = await handlers.cloneProject(adminClient, fileManager, payload.projectId, payload.newProjectName, userForJson!.id);
          if (error) {
              return createErrorResponse(error.message, 500, req, error);
          }
          return createSuccessResponse(data, 201, req);
        }
        case "exportProject": {
          const payload = requestBody.payload as { projectId: string };
          if (!payload || !payload.projectId) {
            return createErrorResponse("projectId is required for exportProject.", 400, req, { message: "projectId is required for exportProject.", status: 400 });
          }
          const storageUtils: IStorageUtils = {
            downloadFromStorage,
            createSignedUrlForPath: createSignedUrlDefaultFn // Assuming createSignedUrlDefaultFn matches the required signature
          };
          const { data, error, status } = await handlers.exportProject(adminClient, fileManager, storageUtils, payload.projectId, userForJson!.id);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 200, req);
        }
        case "getProjectResourceContent": {
          const payload = requestBody.payload as GetProjectResourceContentPayload;
          if (!payload || !payload.resourceId) {
            return createErrorResponse("resourceId is required.", 400, req, { message: "resourceId is required.", status: 400 });
          }
          const { data, error, status } = await handlers.getProjectResourceContent(payload, adminClient, userForJson!);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, 200, req);
        }
        case "saveContributionEdit": {
          const { data, error, status } = await handlers.saveContributionEdit(requestBody.payload as SaveContributionEditPayload, userClient, userForJson!, logger);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 200, req);
        }
        case "submitStageResponses": {
          const dependencies: SubmitStageResponsesDependencies = {
            logger,
            fileManager,
            downloadFromStorage,
          };
          const { data, error, status } = await handlers.submitStageResponses(requestBody.payload as SubmitStageResponsesPayload, adminClient, userForJson!, dependencies);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 200, req);
        }
        case "updateSessionModels": {
          if (!userForJson) {
            return createErrorResponse('User not authenticated for updateSessionModels', 401, req, { message: "User not authenticated", status: 401, code: 'USER_AUTH_FAILED' });
          }
          const { data, error, status } = await handlers.updateSessionModels(adminClient, requestBody.payload as UpdateSessionModelsPayload, userForJson.id);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 200, req);
        }
        default: {
          const errorMessage = `Unknown action for application/json.`;
          logger.warn(errorMessage, { action: (requestBody as { action?: string }).action });
          return createErrorResponse(errorMessage, 400, req, { message: errorMessage, status: 400, code: 'INVALID_JSON_ACTION' });
        }
      }
    } else {
      return createErrorResponse(
        `Unsupported Content-Type: ${req.headers.get("content-type")}`,
        415,
        req,
        { message: `Unsupported Content-Type: ${req.headers.get("content-type")}`, status: 415, code: 'UNSUPPORTED_CONTENT_TYPE' }
      );
    }
  } catch (e) {
    const error = e as Error;
    logger.error("A critical error occurred in the main request handler:", {
      errorMessage: error.message,
      stack: error.stack,
      cause: (error as unknown as { cause: unknown }).cause
    });
    return createErrorResponse("An internal server error occurred.", 500, req, { message: error.message, status: 500, code: 'UNHANDLED_EXCEPTION' });
  }
}

const handlers: ActionHandlers = {
  createProject,
  listAvailableDomains,
  updateProjectDomain,
  getProjectDetails,
  getContributionContentHandler,
  startSession,
  generateContributions,
  listProjects,
  listAvailableDomainOverlays,
  deleteProject,
  cloneProject,
  exportProject,
  getProjectResourceContent,
  saveContributionEdit,
  submitStageResponses,
  listDomains,
  fetchProcessTemplate,
  updateSessionModels: handleUpdateSessionModels,
};

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    logger.error("Missing critical Supabase environment variables.");
    return createErrorResponse("Server configuration error.", 500, req, { message: "Server configuration error.", status: 500, code: 'CONFIG_ERROR' });
  }

  const authHeader = req.headers.get("Authorization");

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { ...(authHeader ? { Authorization: authHeader } : {}) } },
  });

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return await handleRequest(req, handlers, userClient, adminClient);
});
