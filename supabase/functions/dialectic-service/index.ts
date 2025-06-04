// deno-lint-ignore-file no-explicit-any
import {
  DialecticServiceRequest,
  CreateProjectPayload,
  UpdateProjectDomainTagPayload,
  StartSessionPayload,
  GenerateStageContributionsPayload,
  GetProjectDetailsPayload,
  ListAvailableDomainOverlaysPayload,
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
} from '../_shared/types.ts';

// Import individual action handlers
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

console.log("dialectic-service function started");

const supabaseAdmin = createSupabaseAdminClient();

// --- START: DI Helper Functions (AuthError replaced with ServiceError) ---
interface IsValidDomainTagFn { (dbClient: SupabaseClient, domainTag: string): Promise<boolean>; }
interface CreateSignedUrlFnResult { signedUrl: string | null; error: ServiceError | Error | null; }
interface CreateSignedUrlFn { (client: SupabaseClient, bucket: string, path: string, expiresIn: number): Promise<CreateSignedUrlFnResult>; }

const isValidDomainTagDefaultFn: IsValidDomainTagFn = async (dbClient, domainTag) => {
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

const createSignedUrlDefaultFn: CreateSignedUrlFn = async (client, bucket, path, expiresIn) => {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    // Common Supabase storage error structure (error is an Error instance with added fields)
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

serve(async (req: Request) => {
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
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(authToken);
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
  };

  try {
    // Handle multipart/form-data for file uploads first
    if (req.method === 'POST' && req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      // Assuming 'uploadProjectResourceFile' is the only action using multipart/form-data
      // A more robust way would be to check an 'action' field in FormData or part of the URL path
      // if multiple multipart actions were supported by this single Edge Function.
      // For now, if it's multipart, it must be for uploadProjectResourceFile.
      result = await uploadProjectResourceFileHandler(req, supabaseAdmin, getUserFnForRequest, logger);
    } else if (req.headers.get("content-type")?.startsWith("application/json")) {
      // Handle application/json requests
      const requestBody: DialecticServiceRequest = await req.json();
      const { action, payload } = requestBody;

      switch (action) {
        case 'listAvailableDomainTags': {
          const listTagsOutcome = await listAvailableDomainTags(supabaseAdmin);
          if (listTagsOutcome && typeof listTagsOutcome === 'object' && 'error' in listTagsOutcome) {
            // It's an error object returned by listAvailableDomainTags itself (e.g., DB fetch error)
            result = listTagsOutcome as { error: ServiceError };
          } else {
            // It's the array of descriptors on success
            result = { data: listTagsOutcome, success: true };
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
              const descriptors = await listAvailableDomainOverlays(
                (payload as unknown as ListAvailableDomainOverlaysPayload).stageAssociation, 
                supabaseAdmin
              );
              result = { data: descriptors, success: true };
            } catch (e) {
              logger.error('Error in listAvailableDomainOverlays action', { error: e });
              result = { 
                error: { 
                  message: e instanceof Error ? e.message : "Failed to list available domain overlay details", 
                  status: 500, 
                  code: 'ACTION_HANDLER_ERROR' 
                } 
              };
            }
          }
          break;
        case 'updateProjectDomainTag':
          if (!payload) {
              result = { error: { message: "Payload is required for updateProjectDomainTag", status: 400, code: 'PAYLOAD_MISSING' } };
          } else {
              result = await updateProjectDomainTag(
                  getUserFnForRequest, 
                  supabaseAdmin, 
                  isValidDomainTagDefaultFn, 
                  payload as unknown as UpdateProjectDomainTagPayload,
                  logger
              );
          }
          break;
        case 'createProject':
          if (!payload) {
              result = { error: { message: "Payload is required for createProject", status: 400, code: 'PAYLOAD_MISSING' } };
          } else {
              result = await createProject(req, supabaseAdmin, payload as unknown as CreateProjectPayload);
          }
          break;
        case 'startSession':
          if (!payload) {
              result = { error: { message: "Payload is required for startSession", status: 400, code: 'PAYLOAD_MISSING' } };
          } else {
              result = await startSession(req, supabaseAdmin, payload as unknown as StartSessionPayload, { logger });
          }
          break;
        case 'generateThesisContributions': 
          if (!payload || typeof payload !== 'object' || typeof (payload as Partial<GenerateStageContributionsPayload>).sessionId !== 'string') {
              result = { success: false, error: { message: "Payload with 'sessionId' (string) is required for generateThesisContributions", status: 400, code: 'INVALID_PAYLOAD' } };
          } else if (!authToken) {
               result = { success: false, error: { message: "User authentication token is required for generateThesisContributions", status: 401, code: 'AUTH_TOKEN_MISSING' } };
          } else {
              const currentSessionId = (payload as { sessionId: string }).sessionId;
              const stagePayload: GenerateStageContributionsPayload = {
                  sessionId: currentSessionId,
                  stage: "thesis",
              };
              result = await generateStageContributions(supabaseAdmin, stagePayload, authToken, { logger });
          }
          break;
        case 'getContributionContentSignedUrl':
          if (!payload || typeof payload !== 'object' || typeof (payload as Partial<{ contributionId: string }>).contributionId !== 'string') {
            result = { error: { message: "Invalid payload for getContributionContentSignedUrl. Expected { contributionId: string }", status: 400, code: 'INVALID_PAYLOAD' } };
          } else {
            result = await getContributionContentSignedUrlHandler(
              getUserFnForRequest, 
              supabaseAdmin, 
              createSignedUrlDefaultFn, 
              logger,
              payload as { contributionId: string }
            );
          }
          break;
        case 'listProjects':
          result = await listProjects(req, supabaseAdmin);
          break;
        case 'getProjectDetails':
          if (!payload || !("projectId" in payload) || typeof payload.projectId !== 'string') { 
              result = { error: { message: "Invalid or missing projectId in payload for getProjectDetails action.", status: 400, code: 'INVALID_PAYLOAD' } };
          } else {
              result = await getProjectDetails(req, supabaseAdmin, payload as unknown as GetProjectDetailsPayload);
          }
          break;
        case 'uploadProjectResourceFile': // This case should ideally not be hit if multipart/form-data is used
          result = { 
            error: { 
              message: "This action expects multipart/form-data, not application/json. Please use the correct endpoint/client for file uploads.", 
              status: 415, // Unsupported Media Type
              code: 'UNSUPPORTED_MEDIA_TYPE_FOR_ACTION'
            } 
          };
          break;
        case 'deleteProject': {
          if (!authToken) {
            result = { error: { message: "User authentication is required to delete a project.", status: 401, code: 'AUTH_TOKEN_MISSING' } };
            break;
          }
          const deletePayload = payload as { projectId: string };
          if (!deletePayload || typeof deletePayload.projectId !== 'string') {
            result = { error: { message: "Invalid or missing projectId in payload for deleteProject action.", status: 400, code: 'INVALID_PAYLOAD' } };
            break;
          }
          result = await deleteProject(supabaseAdmin, deletePayload, authToken);
          break;
        }
        default:
          result = { error: { message: `Unknown action: ${action}`, status: 404, code: 'UNKNOWN_ACTION' } };
      }
    } else {
      // Neither multipart/form-data nor application/json
      return createErrorResponse("Unsupported content type. Please use multipart/form-data for file uploads or application/json for other actions.", 415, req);
    }

    // Common response handling
    if (result.error) {
        let errorMessage = result.error.message || "Action failed";
        if (result.error.code) {
            errorMessage = `[${result.error.code}] ${errorMessage}`;
        }
        if (result.error.details) {
            errorMessage = `${errorMessage} (Details: ${result.error.details})`;
        }
      return createErrorResponse(
        errorMessage,
        result.error.status || 400,
        req
      );
    }
    return createSuccessResponse(result.data, 200, req);

  } catch (e: unknown) { 
    const err = e instanceof Error ? e : new Error(String(e));
    let responseMessage = err.message || "An unexpected error occurred in dialectic-service.";
    let responseStatus = 500;
    let responseCode: string | undefined = 'UNEXPECTED_ERROR';
    const originalErrorForLogging: Error | unknown = e;

    if (e && typeof e === 'object' && e !== null) {
        const errObj = e as Record<string, unknown>;
        responseStatus = typeof errObj.status === 'number' ? errObj.status : responseStatus;
        if (typeof errObj.code === 'string') responseCode = errObj.code;
        else if (typeof errObj.error === 'string') responseCode = errObj.error;
        else if (errObj.name === 'AuthApiError') responseCode = 'AUTH_API_ERROR';
        
        if (errObj.name === 'AuthApiError' || errObj.message?.toString().toLowerCase().includes('jwt')) {
            responseMessage = "Invalid or malformed token";
            responseStatus = 401;
            responseCode = 'AUTH_INVALID_TOKEN';
        }
    }
    if (err instanceof SyntaxError && err.message.toLowerCase().includes("json")) {
        responseMessage = "Invalid JSON payload";
        responseStatus = 400;
        responseCode = 'INVALID_JSON';
    }
    
    logger.error('Error in dialectic-service request', { 
        message: responseMessage, 
        status: responseStatus, 
        code: responseCode, 
        originalError: originalErrorForLogging,
        path: new URL(req.url).pathname,
        method: req.method,
    });

    return createErrorResponse(
        `[${responseCode || 'ERROR'}] ${responseMessage}`, 
        responseStatus, 
        req
    );
  }
});