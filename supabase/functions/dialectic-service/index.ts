// deno-lint-ignore-file no-explicit-any
import {
  DialecticServiceRequest,
  UpdateProjectDomainTagPayload,
  StartSessionPayload,
  GenerateStageContributionsPayload,
  GetProjectDetailsPayload,
  ListAvailableDomainOverlaysPayload,
  DialecticStage,
  DialecticProject,
  DialecticSession,
  DialecticContribution,
  DialecticProjectResource,
  DomainOverlayDescriptor,
  UpdateProjectDomainTagSuccessData,
  StartSessionSuccessResponse,
  GenerateStageContributionsSuccessResponse,
  UploadProjectResourceFileSuccessResponse,
  GetProjectResourceContentPayload,
  GetProjectResourceContentResponse,
  SaveContributionEditPayload,
  SubmitStageResponsesPayload,
  SubmitStageResponsesResponse,
  DialecticFeedback,
  SubmitStageResponsesDependencies
} from "./dialectic.interface.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from "../_shared/cors-headers.ts";
import { createSupabaseAdminClient } from "../_shared/auth.ts";
import { logger, Logger } from "../_shared/logger.ts";
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js';
import type {
  ServiceError,
  GetUserFnResult,
  GetUserFn,
  ILogger
} from '../_shared/types.ts';
import type { DomainTagDescriptor } from "./listAvailableDomainTags.ts";

import { createProject } from "./createProject.ts";
import { listAvailableDomainTags } from "./listAvailableDomainTags.ts";
import { updateProjectDomainTag } from "./updateProjectDomainTag.ts";
import { getProjectDetails } from "./getProjectDetails.ts";
import { getContributionContentSignedUrlHandler } from "./getContributionContent.ts";
import { startSession } from "./startSession.ts";
import { generateStageContributions } from "./generateContribution.ts";
import { listProjects } from "./listProjects.ts";
import { uploadProjectResourceFileHandler, type UploadProjectResourceFileResult } from "./uploadProjectResourceFile.ts";
import { listAvailableDomainOverlays } from "./listAvailableDomainOverlays.ts";
import { deleteProject } from './deleteProject.ts';
import { cloneProject, CloneProjectResult } from './cloneProject.ts';
import { exportProject } from './exportProject.ts';
import { getProjectResourceContent } from "./getProjectResourceContent.ts";
import { saveContributionEdit } from './saveContributionEdit.ts';
import { submitStageResponses } from './submitStageResponses.ts';
import { uploadToStorage, downloadFromStorage } from '../_shared/supabase_storage_utils.ts';
import { listDomains, type DialecticDomain } from './listDomains.ts';

console.log("dialectic-service function started");

// --- START: DI Helper Functions (AuthError replaced with ServiceError) ---
interface IsValidDomainTagFn { (dbClient: SupabaseClient, domainTag: string): Promise<boolean>; }
interface CreateSignedUrlFnResult { signedUrl: string | null; error: ServiceError | Error | null; }
interface CreateSignedUrlFn { (client: SupabaseClient, bucket: string, path: string, expiresIn: number): Promise<CreateSignedUrlFnResult>; }

export const isValidDomainTagDefaultFn: IsValidDomainTagFn = async (dbClient, domainTag) => {
  if (domainTag === null) return true;
  const { data, error } = await dbClient
    .from('domain_specific_prompt_overlays')
    .select('domain_tag')
    .eq('domain_tag', domainTag)
    .maybeSingle();
  if (error) {
    logger.error('Error validating domain tag in isValidDomainTagDefaultFn', { error, domainTag });
    return false;
  }
  return !!data;
};

export const createSignedUrlDefaultFn: CreateSignedUrlFn = async (client, bucket, path, expiresIn) => {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    const storageError = error as Error & { statusCode?: string; error?: string; message: string };
    const serviceError: ServiceError = {
        message: storageError.message || 'Storage error creating signed URL',
        status: storageError.statusCode ? parseInt(storageError.statusCode) : 500,
        code: storageError.error || 'STORAGE_OPERATION_ERROR', 
    };
    return { signedUrl: null, error: serviceError };
  }
  return { signedUrl: data?.signedUrl || null, error: null };
};
// --- END: DI Helper Functions ---

// Define ActionHandlers interface
export interface ActionHandlers {
  createProject: (payload: FormData, dbClient: SupabaseClient, user: User) => Promise<{ data?: DialecticProject; error?: ServiceError; status?: number }>;
  listAvailableDomainTags: (dbClient: SupabaseClient, payload?: { stageAssociation?: DialecticStage }) => Promise<DomainTagDescriptor[] | { error: ServiceError }>;
  updateProjectDomainTag: (getUserFn: GetUserFn, dbClient: SupabaseClient, isValidDomainTagFn: IsValidDomainTagFn, payload: UpdateProjectDomainTagPayload, logger: ILogger) => Promise<{ data?: UpdateProjectDomainTagSuccessData; error?: ServiceError }>;
  getProjectDetails: (payload: GetProjectDetailsPayload, dbClient: SupabaseClient, user: User) => Promise<{ data?: DialecticProject; error?: ServiceError; status?: number }>;
  getContributionContentSignedUrlHandler: (getUserFn: GetUserFn, dbClient: SupabaseClient, createSignedUrlFn: CreateSignedUrlFn, logger: ILogger, payload: { contributionId: string }) => Promise<{ data?: { signedUrl: string }; error?: ServiceError; status?: number }>;
  startSession: (user: User, dbClient: SupabaseClient, payload: StartSessionPayload, dependencies: { logger: ILogger }) => Promise<{ data?: StartSessionSuccessResponse; error?: ServiceError }>;
  generateStageContributions: (dbClient: SupabaseClient, payload: GenerateStageContributionsPayload, authToken: string, dependencies: { logger: ILogger }) => Promise<{ success: boolean; data?: GenerateStageContributionsSuccessResponse; error?: ServiceError }>;
  listProjects: (user: User, dbClient: SupabaseClient) => Promise<{ data?: DialecticProject[]; error?: ServiceError; status?: number }>;
  uploadProjectResourceFileHandler: (payload: FormData, dbClient: SupabaseClient, user: User, logger: Logger) => Promise<UploadProjectResourceFileResult>;
  listAvailableDomainOverlays: (stageAssociation: DialecticStage, dbClient: SupabaseClient) => Promise<DomainOverlayDescriptor[]>;
  deleteProject: (dbClient: SupabaseClient, payload: { projectId: string }, userId: string) => Promise<{data?: null, error?: { message: string; details?: string | undefined; }, status?: number}>;
  cloneProject: (dbClient: SupabaseClient, originalProjectId: string, newProjectName: string | undefined, cloningUserId: string) => Promise<CloneProjectResult>;
  exportProject: (dbClient: SupabaseClient, projectId: string, userId: string) => Promise<{ data?: { export_url: string }; error?: ServiceError; status?: number }>;
  getProjectResourceContent: (payload: GetProjectResourceContentPayload, dbClient: SupabaseClient, user: User) => Promise<{ data?: GetProjectResourceContentResponse; error?: ServiceError; status?: number }>;
  saveContributionEdit: (payload: SaveContributionEditPayload, dbClient: SupabaseClient, user: User, logger: ILogger) => Promise<{ data?: DialecticContribution; error?: ServiceError; status?: number }>;
  submitStageResponses: (payload: SubmitStageResponsesPayload, dbClient: SupabaseClient, user: User, dependencies: SubmitStageResponsesDependencies) => Promise<{ data?: SubmitStageResponsesResponse; error?: ServiceError; status?: number }>;
  listDomains: (dbClient: SupabaseClient) => Promise<{ data?: DialecticDomain[]; error?: ServiceError }>;
}

export async function handleRequest(
  req: Request, 
  dbAdminClient: SupabaseClient,
  handlers: ActionHandlers
): Promise<Response> {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  let authToken: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
      authToken = authHeader.substring(7);
  }

  const getUserFnForRequest: GetUserFn = async (): Promise<GetUserFnResult> => {
      if (!authToken) {
          return { data: { user: null }, error: { message: "User not authenticated", status: 401, code: 'AUTH_TOKEN_MISSING' } };
      }
      const { data: { user }, error } = await dbAdminClient.auth.getUser(authToken);
      let serviceError: ServiceError | null = null;
      if (error) {
          serviceError = { 
              message: error.message, 
              status: error.status, 
              code: error.name || 'AUTH_ERROR' 
          };
      }
      return { data: { user: user as User | null }, error: serviceError };
  };

  let result: {
    success?: boolean;
    data?: unknown;
    error?: ServiceError;
    status?: number;
  };
  let action: string | null = null;

  try {
    const contentType = req.headers.get("content-type");

    if (req.method === 'POST' && contentType?.startsWith("multipart/form-data")) {
      const formData = await req.formData();
      action = formData.get('action') as string | null;
      
      logger.info('Multipart POST request received', { actionFromFormData: action });

      let userForMultipart: User | null = null;
      if (action === 'createProject' || action === 'uploadProjectResourceFile') {
        const { data: userData, error: userError } = await getUserFnForRequest();
        if (userError || !userData?.user) {
          const err = userError || { message: "User not authenticated for this multipart action.", status: 401, code: 'USER_AUTH_FAILED' };
          return createErrorResponse(err.message, err.status || 401, req, err);
        }
        userForMultipart = userData.user;
      }

      switch (action) {
        case 'createProject':
          if (!userForMultipart) { 
            // This case should ideally not be reached if auth check above is comprehensive
            return createErrorResponse("User authentication failed for createProject.", 401, req, { message: "User authentication failed.", status: 401, code: 'USER_AUTH_FAILED' });
          }
          result = await handlers.createProject(formData, dbAdminClient, userForMultipart);
          break;
        case 'uploadProjectResourceFile':
          if (!userForMultipart) {
            // This case should ideally not be reached
            return createErrorResponse("User authentication failed for uploadProjectResourceFile.", 401, req, { message: "User authentication failed.", status: 401, code: 'USER_AUTH_FAILED' });
          }
          result = await handlers.uploadProjectResourceFileHandler(formData, dbAdminClient, userForMultipart, logger);
          break;
        default:
          logger.warn('Unknown action for multipart/form-data', { action });
          result = { 
            error: { 
              message: `Unknown action '${action}' for multipart/form-data.`, 
              status: 400, 
              code: 'INVALID_MULTIPART_ACTION' 
            } 
          };
      }
    } else if (contentType?.startsWith("application/json")) {
      const requestBody: DialecticServiceRequest = await req.json();
      action = requestBody.action;
      const { payload } = requestBody;
      logger.info('JSON request received', { action, payloadExists: !!payload });

      let userForJson: User | null = null;
      // List actions that require user authentication for JSON payloads
      const actionsRequiringAuth = [
        'listProjects', 'getProjectDetails', 'updateProjectDomainTag', 
        'startSession', 'generateContributions', 'getContributionContentSignedUrl',
        'deleteProject', 'cloneProject', 'exportProject', 'getProjectResourceContent',
        'saveContributionEdit', 'submitStageResponses'
      ];
      const noAuthActions = [
        "listAvailableDomainTags", 
        "listAvailableDomainOverlays",
        "listDomains"
      ];
        
      if (actionsRequiringAuth.includes(action)) {
        const { data: userData, error: userError } = await getUserFnForRequest();
        if (userError || !userData?.user) {
          const err = userError || { message: `User not authenticated for action: ${action}.`, status: 401, code: 'USER_AUTH_FAILED' };
          return createErrorResponse(err.message, err.status || 401, req, err);
        }
        userForJson = userData.user;
      }
      if (noAuthActions.includes(action)) {
        switch (action) {
          case "listAvailableDomainTags": {
            const result = await handlers.listAvailableDomainTags(dbAdminClient, payload);
            if (result && 'error' in result) {
              return createErrorResponse(result.error.message, result.error.status, req, result.error);
            }
            return createSuccessResponse(result, 200, req);
          }
          case "listAvailableDomainOverlays": {
            if (!payload || typeof (payload as unknown as ListAvailableDomainOverlaysPayload).stageAssociation !== 'string') {
              return createErrorResponse("Payload with 'stageAssociation' (string) is required for listAvailableDomainOverlays", 400, req, { code: 'INVALID_PAYLOAD' });
            }
            const result = await handlers.listAvailableDomainOverlays((payload as unknown as ListAvailableDomainOverlaysPayload).stageAssociation as DialecticStage, dbAdminClient);
            return createSuccessResponse(result, 200, req);
          }
          case "listDomains": {
            const { data, error } = await handlers.listDomains(dbAdminClient);
            if (error) {
              return createErrorResponse(error.message, error.status, req, error);
            }
            return createSuccessResponse(data, 200, req);
          }
        }
      }

      switch (action) {
        case 'listDomains':
            result = await handlers.listDomains(dbAdminClient);
            break;
        case 'listAvailableDomainTags': {
          const listTagsOutcome = await handlers.listAvailableDomainTags(dbAdminClient, payload as { stageAssociation?: DialecticStage } | undefined);
          if (listTagsOutcome && typeof listTagsOutcome === 'object' && 'error' in listTagsOutcome && listTagsOutcome.error) {
            result = { error: listTagsOutcome.error };
          } else {
            result = { data: listTagsOutcome as DomainTagDescriptor[] };
          }
          break;
        }
        case 'listAvailableDomainOverlays':
          if (!payload || typeof (payload as unknown as ListAvailableDomainOverlaysPayload).stageAssociation !== 'string') {
            result = { 
              error: { 
                message: "Payload with 'stageAssociation' (string) is required for listAvailableDomainOverlays", 
                status: 400, 
                code: 'INVALID_PAYLOAD' 
              } 
            };
          } else {
            try {
              const descriptors = await handlers.listAvailableDomainOverlays(
                (payload as unknown as ListAvailableDomainOverlaysPayload).stageAssociation as DialecticStage,
                dbAdminClient
              );
              result = { data: descriptors, success: true };
            } catch (e) {
              logger.error('Error in listAvailableDomainOverlays action', { error: e });
              let serviceErr: ServiceError;
              if (e && typeof e === 'object' && 'message' in e && 'status' in e) {
                serviceErr = e as ServiceError;
              } else {
                serviceErr = { message: 'Internal server error processing listAvailableDomainOverlays', status: 500, code: 'INTERNAL_ERROR' };
              }
              result = { error: serviceErr };
            }
          }
          break;
        case 'updateProjectDomainTag':
          if (!payload) {
              result = { error: { message: "Payload is required for updateProjectDomainTag", status: 400, code: 'PAYLOAD_MISSING' } };
          } else if (!userForJson) { // Should be caught by auth block if made mandatory for this action
              return createErrorResponse("User authentication failed for updateProjectDomainTag.", 401, req, { message: "User authentication failed.", status: 401, code: 'USER_AUTH_FAILED' });
          } else {
              // updateProjectDomainTag still uses getUserFn internally, keeping as is for now unless refactoring its internal auth too.
              // For now, the userForJson check above is a safeguard if we make it mandatory at this level.
              result = await handlers.updateProjectDomainTag(
                  getUserFnForRequest, // Kept as is, as handler expects getUserFn
                  dbAdminClient, 
                  isValidDomainTagDefaultFn, 
                  payload as unknown as UpdateProjectDomainTagPayload,
                  logger
              );
          }
          break;
        case 'startSession':
          if (!payload) {
              result = { error: { message: "Payload is required for startSession", status: 400, code: 'PAYLOAD_MISSING' } };
          } else if (!userForJson) {
              // This case should ideally not be reached due to actionsRequiringAuth check
              return createErrorResponse("User authentication failed for startSession.", 401, req, { message: "User authentication failed.", status: 401, code: 'USER_AUTH_FAILED' });
          } else {
              result = await handlers.startSession(userForJson, dbAdminClient, payload as unknown as StartSessionPayload, { logger });
          }
          break;
        case 'generateContributions':
          if (!userForJson) { /* This case is for type-safety, should be handled by the auth check above */
            return createErrorResponse("User not authenticated for generateContributions.", 401, req);
          }
          if (!authToken) { // Also ensure authToken is present for passing down
            return createErrorResponse("Auth token is missing for generateContributions.", 401, req);
          }
          if (!payload || typeof (payload as unknown as GenerateStageContributionsPayload).sessionId !== 'string') {
            result = { 
              error: { 
                message: "Payload with 'sessionId' (string) is required for generateContributions", 
                status: 400, 
                code: 'INVALID_PAYLOAD' 
              } 
            };
          } else {
            const { sessionId, iterationNumber, stageSlug } = payload as unknown as GenerateStageContributionsPayload;
            result = await handlers.generateStageContributions(
              dbAdminClient,
              { sessionId, iterationNumber, stageSlug },
              authToken,
              { logger }
            );
          }
          break;
        case 'getContributionContentSignedUrl':
          if (!userForJson) { /* ... */ }
          if (!payload || typeof (payload as Partial<{ contributionId: string }>).contributionId !== 'string') {
            result = { error: { message: "Invalid payload for getContributionContentSignedUrl. Expected { contributionId: string }", status: 400, code: 'INVALID_PAYLOAD' } };
          } else {
            result = await handlers.getContributionContentSignedUrlHandler(
              getUserFnForRequest, // Kept as is
              dbAdminClient, 
              createSignedUrlDefaultFn, 
              logger,
              payload as { contributionId: string }
            );
          }
          break;
        case 'listProjects':
          if (!userForJson) { 
            // This case should ideally not be reached if auth check above is comprehensive
            return createErrorResponse("User authentication failed for listProjects.", 401, req, { message: "User authentication failed for listProjects.", status: 401, code: 'USER_AUTH_FAILED' });
          }
          result = await handlers.listProjects(userForJson, dbAdminClient);
          break;
        case 'getProjectDetails':
          if (!payload || !("projectId" in payload) || typeof payload.projectId !== 'string') { 
              result = { error: { message: "Invalid or missing projectId in payload for getProjectDetails action.", status: 400, code: 'INVALID_PAYLOAD' } };
          } else if (!userForJson) {
            return createErrorResponse("User authentication failed for getProjectDetails.", 401, req, { message: "User authentication failed for getProjectDetails.", status: 401, code: 'USER_AUTH_FAILED' });
          } else {
              result = await handlers.getProjectDetails(payload as unknown as GetProjectDetailsPayload, dbAdminClient, userForJson);
          }
          break;
        case 'getProjectResourceContent':
          if (!userForJson) { /* This case is for type-safety, should be handled by the auth check above */
            return createErrorResponse("User not authenticated for getProjectResourceContent.", 401, req);
          }
          if (!payload || typeof (payload as unknown as GetProjectResourceContentPayload).resourceId !== 'string') {
            result = { 
              error: { 
                message: "Invalid or missing 'resourceId' (string) in payload for getProjectResourceContent action.", 
                status: 400, 
                code: 'INVALID_PAYLOAD' 
              } 
            };
          } else {
            const { resourceId, fileName } = payload as unknown as GetProjectResourceContentPayload;
            result = await handlers.getProjectResourceContent(
              { resourceId, fileName },
              dbAdminClient,
              userForJson
            );
          }
          break;
        case 'deleteProject': { 
          if (!userForJson) { // Check if userForJson (which should hold the authenticated user) is available
            return createErrorResponse("User not authenticated for deleteProject.", 401, req, { message: "User not authenticated for deleteProject.", status: 401, code: 'USER_AUTH_FAILED' });
          } else if (!payload || typeof (payload as Partial<{ projectId: string }>).projectId !== 'string') {
            result = { error: { message: "Invalid payload for deleteProject. Expected { projectId: string }", status: 400, code: 'INVALID_PAYLOAD' } };
          } else {
            const projectId = (payload as { projectId: string }).projectId;
            const deleteHandlerResponse = await handlers.deleteProject(
              dbAdminClient, 
              { projectId }, 
              userForJson.id // Pass userForJson.id
            );
            if (deleteHandlerResponse.error) {
              result = { 
                error: { 
                  message: deleteHandlerResponse.error.message,
                  details: deleteHandlerResponse.error.details,
                  status: deleteHandlerResponse.status, 
                  code: 'DELETE_PROJECT_FAILED' 
                }
              };
            } else {
              result = { data: deleteHandlerResponse.data, status: deleteHandlerResponse.status, success: true };
            }
          }
          break;
        }
        case 'cloneProject': { 
          if (!userForJson) { // Check if userForJson is available
            return createErrorResponse("User not authenticated for cloneProject.", 401, req, { message: "User not authenticated for cloneProject.", status: 401, code: 'USER_AUTH_FAILED' });
          } else if (!payload || typeof (payload as Partial<{ projectId: string; newProjectName?: string }>).projectId !== 'string') {
             result = { error: { message: "Invalid payload for cloneProject. Expected { projectId: string, newProjectName?: string }", status: 400, code: 'INVALID_PAYLOAD' } };
          } else {
            const clonePayload = payload as { projectId: string; newProjectName?: string };
            const cloneHandlerResponse = await handlers.cloneProject(
              dbAdminClient, 
              clonePayload.projectId,
              clonePayload.newProjectName,
              userForJson.id // Pass userForJson.id
            );
            if (cloneHandlerResponse.error) {
              let status = 500;
              if (cloneHandlerResponse.error.message.toLowerCase().includes('not found')) {
                status = 404;
              }
              result = { 
                error: { 
                  message: cloneHandlerResponse.error.message,
                  details: cloneHandlerResponse.error.details as string | undefined, 
                  status: status, 
                  code: cloneHandlerResponse.error.code || 'CLONE_PROJECT_FAILED'
                }
              };
            } else {
              result = { data: cloneHandlerResponse.data, status: 201, success: true }; 
            }
          }
          break;
        }
        case 'exportProject': { 
          if (!userForJson) { // Check if userForJson is available
            return createErrorResponse("User not authenticated for exportProject.", 401, req, { message: "User not authenticated for exportProject.", status: 401, code: 'USER_AUTH_FAILED' });
          } else if (!payload || typeof (payload as Partial<{ projectId: string }>).projectId !== 'string') {
             result = { error: { message: "Invalid payload for exportProject. Expected { projectId: string }", status: 400, code: 'INVALID_PAYLOAD' } };
          } else {
            const projectId = (payload as { projectId: string }).projectId;
            result = await handlers.exportProject(
              dbAdminClient, 
              projectId,
              userForJson.id // Pass userForJson.id
           );
          }
          break;
        }
        case 'saveContributionEdit':
          if (!userForJson) { /* This case is for type-safety, should be handled by the auth check above */
            return createErrorResponse("User authentication failed for saveContributionEdit.", 401, req, { message: "User authentication failed.", status: 401, code: 'USER_AUTH_FAILED' });
          }
          result = await handlers.saveContributionEdit(payload as unknown as SaveContributionEditPayload, dbAdminClient, userForJson, logger);
          break;
        case 'submitStageResponses':
          if (!userForJson) {
            return createErrorResponse("User authentication required for submitStageResponses.", 401, req);
          }
          result = await handlers.submitStageResponses(payload as unknown as SubmitStageResponsesPayload, dbAdminClient, userForJson, { uploadToStorage, downloadFromStorage, logger });
          break;
        default:
          logger.warn('Unknown action for application/json', { action });
          result = { error: { message: `Unknown action '${action}' for application/json.`, status: 400, code: 'INVALID_JSON_ACTION' } };
      }

    } else {
      logger.warn('Unsupported request method or content type', { method: req.method, contentType });
      result = { 
        error: { 
          message: "Unsupported request method or content type. Please use POST with application/json or multipart/form-data.", 
          status: 415, 
          code: 'UNSUPPORTED_MEDIA_TYPE' 
        } 
      };
    }
  } catch (error) {
    logger.error("Unhandled error in dialectic-service function", { error });
    if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
        result = { error: error as ServiceError };
    } else {
        result = { error: { message: error instanceof Error ? error.message : "An unexpected error occurred.", status: 500, code: 'UNHANDLED_EXCEPTION' } };
    }
  }

  if (result.error) {
    return createErrorResponse(result.error.message, result.error.status || 500, req, result.error);
  } else {
    // For listAvailableDomainTags, if the handler returns an array directly, wrap it in a data object
    if (action === 'listAvailableDomainTags' && Array.isArray(result.data)) {
      return createSuccessResponse({ data: result.data, success: true }, result.status || 200, req);
    }
    // Default success response construction
    return createSuccessResponse({ data: result.data, success: result.success === undefined ? true : result.success }, result.status || 200, req);
  }
}

const supabaseAdmin = createSupabaseAdminClient();

// Create the actual handlers map
const actualHandlers: ActionHandlers = {
  createProject,
  listAvailableDomainTags,
  updateProjectDomainTag: (getUserFn, dbClient, isValidDomainTagFn, payload, logger) => 
    updateProjectDomainTag(getUserFn, dbClient, isValidDomainTagFn, payload, logger),
  getProjectDetails,
  getContributionContentSignedUrlHandler: (getUserFn, dbClient, createSignedUrlFn, logger, payload) =>
    getContributionContentSignedUrlHandler(getUserFn, dbClient, createSignedUrlFn, logger, payload),
  startSession: (user, dbClient, payload, dependencies) => 
    startSession(user, dbClient, payload, dependencies),
  generateStageContributions: (dbClient, payload, authToken, dependencies) =>
    generateStageContributions(dbClient, payload, authToken, dependencies),
  listProjects,
  uploadProjectResourceFileHandler: (payload, dbClient, user, logger) => 
    uploadProjectResourceFileHandler(payload, dbClient, user, logger),
  listAvailableDomainOverlays: (stageAssociation, dbClient) => 
    listAvailableDomainOverlays(stageAssociation, dbClient),
  deleteProject,
  cloneProject,
  exportProject,
  getProjectResourceContent,
  saveContributionEdit,
  submitStageResponses: (payload, dbClient, user, dependencies) =>
    submitStageResponses(payload, dbClient, user, dependencies),
  listDomains: (dbClient) => listDomains(dbClient)
};

serve(async (req: Request) => {
  return await handleRequest(req, supabaseAdmin, actualHandlers);
});

// For testing purposes, you might want to export your handlers if they are not already.
// This is already done for createProject, listAvailableDomainTags etc. at the top.