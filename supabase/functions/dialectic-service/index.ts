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
} from "./dialectic.interface.ts";
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from "../_shared/cors-headers.ts";
import { createSupabaseAdminClient } from "../_shared/auth.ts";
import { logger } from "../_shared/logger.ts";
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
import { uploadProjectResourceFileHandler } from "./uploadProjectResourceFile.ts";
import { listAvailableDomainOverlays } from "./listAvailableDomainOverlays.ts";
import { deleteProject } from './deleteProject.ts';
import { cloneProject, CloneProjectResult } from './cloneProject.ts';
import { exportProject } from './exportProject.ts';

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
  createProject: (req: Request, dbClient: SupabaseClient) => Promise<{ data?: DialecticProject; error?: ServiceError; status?: number }>;
  listAvailableDomainTags: (dbClient: SupabaseClient, payload?: { stageAssociation?: DialecticStage }) => Promise<DomainTagDescriptor[] | { error: ServiceError }>;
  updateProjectDomainTag: (getUserFn: GetUserFn, dbClient: SupabaseClient, isValidDomainTagFn: IsValidDomainTagFn, payload: UpdateProjectDomainTagPayload, logger: ILogger) => Promise<{ data?: UpdateProjectDomainTagSuccessData; error?: ServiceError }>;
  getProjectDetails: (req: Request, dbClient: SupabaseClient, payload: GetProjectDetailsPayload) => Promise<{ data?: DialecticProject; error?: ServiceError; status?: number }>;
  getContributionContentSignedUrlHandler: (getUserFn: GetUserFn, dbClient: SupabaseClient, createSignedUrlFn: CreateSignedUrlFn, logger: ILogger, payload: { contributionId: string }) => Promise<{ data?: { signedUrl: string }; error?: ServiceError; status?: number }>;
  startSession: (req: Request, dbClient: SupabaseClient, payload: StartSessionPayload, dependencies: { logger: ILogger }) => Promise<{ data?: StartSessionSuccessResponse; error?: ServiceError }>;
  generateStageContributions: (dbClient: SupabaseClient, payload: GenerateStageContributionsPayload, authToken: string, dependencies: { logger: ILogger }) => Promise<{ success: boolean; data?: GenerateStageContributionsSuccessResponse; error?: ServiceError }>;
  listProjects: (req: Request, dbClient: SupabaseClient) => Promise<{ data?: DialecticProject[]; error?: ServiceError; status?: number }>;
  uploadProjectResourceFileHandler: (req: Request, dbClient: SupabaseClient, getUserFn: GetUserFn, logger: ILogger) => Promise<{ data?: UploadProjectResourceFileSuccessResponse; error?: ServiceError }>;
  listAvailableDomainOverlays: (stageAssociation: DialecticStage, dbClient: SupabaseClient) => Promise<DomainOverlayDescriptor[]>;
  deleteProject: (dbClient: SupabaseClient, payload: { projectId: string }, userId: string) => Promise<{data?: null, error?: { message: string; details?: string | undefined; }, status: number}>;
  cloneProject: (dbClient: SupabaseClient, originalProjectId: string, newProjectName: string | undefined, cloningUserId: string) => Promise<CloneProjectResult>;
  exportProject: (dbClient: SupabaseClient, projectId: string, userId: string) => Promise<{ data?: { export_url: string }; error?: ServiceError; status?: number }>;
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

  try {
    const contentType = req.headers.get("content-type");

    if (req.method === 'POST' && contentType?.startsWith("multipart/form-data")) {
      const formData = await req.formData();
      const action = formData.get('action') as string | null;
      
      logger.info('Multipart POST request received', { actionFromFormData: action });

      switch (action) {
        case 'createProject':
          result = await handlers.createProject(req, dbAdminClient);
          break;
        case 'uploadProjectResourceFile':
          result = await handlers.uploadProjectResourceFileHandler(req, dbAdminClient, getUserFnForRequest, logger);
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
      const { action, payload } = requestBody;
      logger.info('JSON request received', { action, payloadExists: !!payload });

      switch (action) {
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
                serviceErr = { 
                  message: e instanceof Error ? e.message : "Failed to list available domain overlay details", 
                  status: 500, 
                  code: 'ACTION_HANDLER_ERROR' 
                }; 
              }
              result = { error: serviceErr };
            }
          }
          break;
        case 'updateProjectDomainTag':
          if (!payload) {
              result = { error: { message: "Payload is required for updateProjectDomainTag", status: 400, code: 'PAYLOAD_MISSING' } };
          } else {
              result = await handlers.updateProjectDomainTag(
                  getUserFnForRequest, 
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
          } else {
              result = await handlers.startSession(req, dbAdminClient, payload as unknown as StartSessionPayload, { logger });
          }
          break;
        case 'generateContributions': 
          if (!payload || typeof payload !== 'object' || typeof (payload as Partial<GenerateStageContributionsPayload>).sessionId !== 'string') {
              result = { success: false, error: { message: "Payload with 'sessionId' (string) is required for generateContributions", status: 400, code: 'INVALID_PAYLOAD' } };
          } else if (!authToken) {
               result = { success: false, error: { message: "User authentication token is required for generateContributions", status: 401, code: 'AUTH_TOKEN_MISSING' } };
          } else {
              const currentSessionId = (payload as { sessionId: string }).sessionId;
              const stagePayload: GenerateStageContributionsPayload = {
                  sessionId: currentSessionId,
                  stage: "thesis",
              };
              result = await handlers.generateStageContributions(dbAdminClient, stagePayload, authToken, { logger });
          }
          break;
        case 'getContributionContentSignedUrl':
          if (!payload || typeof payload !== 'object' || typeof (payload as Partial<{ contributionId: string }>).contributionId !== 'string') {
            result = { error: { message: "Invalid payload for getContributionContentSignedUrl. Expected { contributionId: string }", status: 400, code: 'INVALID_PAYLOAD' } };
          } else {
            result = await handlers.getContributionContentSignedUrlHandler(
              getUserFnForRequest, 
              dbAdminClient, 
              createSignedUrlDefaultFn, 
              logger,
              payload as { contributionId: string }
            );
          }
          break;
        case 'listProjects':
          result = await handlers.listProjects(req, dbAdminClient);
          break;
        case 'getProjectDetails':
          if (!payload || !("projectId" in payload) || typeof payload.projectId !== 'string') { 
              result = { error: { message: "Invalid or missing projectId in payload for getProjectDetails action.", status: 400, code: 'INVALID_PAYLOAD' } };
          } else {
              result = await handlers.getProjectDetails(req, dbAdminClient, payload as unknown as GetProjectDetailsPayload);
          }
          break;
        case 'deleteProject': {
          if (!authToken) {
            result = { error: { message: "User authentication required for deleteProject.", status: 401, code: 'AUTH_TOKEN_MISSING' } };
          } else if (!payload || typeof (payload as Partial<{ projectId: string }>).projectId !== 'string') {
            result = { error: { message: "Invalid payload for deleteProject. Expected { projectId: string }", status: 400, code: 'INVALID_PAYLOAD' } };
          } else {
            const { data: userData, error: userError } = await getUserFnForRequest();
            if (userError || !userData?.user) {
              result = { error: userError || { message: "User not found or authentication failed for deleteProject.", status: 401, code: 'USER_AUTH_FAILED' } };
            } else {
              const projectId = (payload as { projectId: string }).projectId;
              const deleteHandlerResponse = await handlers.deleteProject(
                dbAdminClient, 
                { projectId }, 
                userData.user.id
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
          }
          break;
        }
        case 'cloneProject': {
          if (!authToken) {
             result = { error: { message: "User authentication required for cloneProject.", status: 401, code: 'AUTH_TOKEN_MISSING' } };
          } else if (!payload || typeof (payload as Partial<{ projectId: string; newProjectName?: string }>).projectId !== 'string') {
             result = { error: { message: "Invalid payload for cloneProject. Expected { projectId: string, newProjectName?: string }", status: 400, code: 'INVALID_PAYLOAD' } };
          } else {
            const { data: userData, error: userError } = await getUserFnForRequest();
            if (userError || !userData?.user) {
              result = { error: userError || { message: "User not found or authentication failed for cloneProject.", status: 401, code: 'USER_AUTH_FAILED' } };
            } else {
              const clonePayload = payload as { projectId: string; newProjectName?: string };
              const cloneHandlerResponse = await handlers.cloneProject(
                dbAdminClient, 
                clonePayload.projectId,
                clonePayload.newProjectName,
                userData.user.id
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
          }
          break;
        }
        case 'exportProject': {
          if (!authToken) {
             result = { error: { message: "User authentication required for exportProject.", status: 401, code: 'AUTH_TOKEN_MISSING' } };
          } else if (!payload || typeof (payload as Partial<{ projectId: string }>).projectId !== 'string') {
             result = { error: { message: "Invalid payload for exportProject. Expected { projectId: string }", status: 400, code: 'INVALID_PAYLOAD' } };
          } else {
            const { data: userData, error: userError } = await getUserFnForRequest();
            if (userError || !userData?.user) {
              result = { error: userError || { message: "User not found or authentication failed for exportProject.", status: 401, code: 'USER_AUTH_FAILED' } };
            } else {
              const projectId = (payload as { projectId: string }).projectId;
              result = await handlers.exportProject(
                dbAdminClient, 
                projectId,
                userData.user.id
             );
            }
          }
          break;
        }
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
    const status = result.error.status || 500;
    return createErrorResponse(result.error.message, status, req, result.error);
  } else {
    const status = result.status || 200;
    return createSuccessResponse(result.data, status, req);
  }
}

const supabaseAdmin = createSupabaseAdminClient();

// Create the actual handlers map
const actualHandlers: ActionHandlers = {
  createProject,
  listAvailableDomainTags,
  updateProjectDomainTag,
  getProjectDetails,
  getContributionContentSignedUrlHandler,
  startSession,
  generateStageContributions,
  listProjects,
  uploadProjectResourceFileHandler,
  listAvailableDomainOverlays,
  deleteProject,
  cloneProject,
  exportProject,
};

serve(async (req: Request) => {
  return await handleRequest(req, supabaseAdmin, actualHandlers);
});

// For testing purposes, you might want to export your handlers if they are not already.
// This is already done for createProject, listAvailableDomainTags etc. at the top.