// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@^2.43.4';
import {
  DialecticServiceRequest,
  UpdateProjectDomainPayload,
  StartSessionPayload,
  GenerateContributionsPayload,
  GetProjectDetailsPayload,
  GetSessionDetailsPayload,
  DialecticProject,
  DomainOverlayDescriptor,
  StartSessionSuccessResponse,
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
  GetSessionDetailsResponse,
  GenerateContributionsDeps,
  GetContributionContentDataPayload,
  DeleteProjectPayload,
  CloneProjectPayload,
  ExportProjectPayload,
  StorageError,
  StageRecipeResponse,
  ListStageDocumentsPayload,
  ListStageDocumentsResponse,
  GetStageDocumentFeedbackPayload,
  GetStageDocumentFeedbackResponse,
  SubmitStageDocumentFeedbackPayload,
  GetAllStageProgressPayload,
  GetAllStageProgressResult,
} from "./dialectic.interface.ts";
import { getStageRecipe } from "./getStageRecipe.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from "../_shared/cors-headers.ts";
import { logger } from "../_shared/logger.ts";
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js';
import type {
  ServiceError,
  GetUserFnResult,
  GetUserFn,
  ILogger
} from '../_shared/types.ts';
import type { DomainDescriptor } from "./listAvailableDomains.ts";
import type { IFileManager } from "../_shared/types/file_manager.types.ts";
import type { IStorageUtils } from "../_shared/types/storage_utils.types.ts";
import { createProject } from "./createProject.ts";
import { listAvailableDomains } from "./listAvailableDomains.ts";
import { updateProjectDomain } from "./updateProjectDomain.ts";
import { getProjectDetails } from "./getProjectDetails.ts";
import { getSessionDetails } from "./getSessionDetails.ts";
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
import { downloadFromStorage, deleteFromStorage, createSignedUrlForPath } from '../_shared/supabase_storage_utils.ts';
import { listDomains, type DialecticDomain } from './listDomains.ts';
import { fetchProcessTemplate } from './fetchProcessTemplate.ts';
import { FileManagerService } from '../_shared/services/file_manager.ts';
import { handleUpdateSessionModels } from './updateSessionModels.ts';
import { listStageDocuments } from './listStageDocuments.ts';
import { submitStageDocumentFeedback, type SubmitStageDocumentFeedbackDeps } from './submitStageDocumentFeedback.ts';
import { getAllStageProgress } from './getAllStageProgress.ts';
import { topologicalSortSteps } from './topologicalSortSteps.ts';
import { deriveStepStatuses } from './deriveStepStatuses.ts';
import { computeExpectedCounts } from './computeExpectedCounts.ts';
import { buildDocumentDescriptors } from './buildDocumentDescriptors.ts';
import { getStageDocumentFeedback } from './getStageDocumentFeedback.ts';
import { callUnifiedAIModel } from './callModel.ts';
import { getExtensionFromMimeType } from '../_shared/path_utils.ts';
import { deconstructStoragePath } from '../_shared/utils/path_deconstructor.ts';
import { constructStoragePath } from '../_shared/utils/path_constructor.ts';
import type { IIndexingService, IEmbeddingClient } from '../_shared/services/indexing_service.interface.ts';
import type { DialecticServiceResponse, DialecticFeedbackRow, SaveContributionEditFn, SaveContributionEditContext, GetStageDocumentFeedbackDeps, GetAllStageProgressDeps } from './dialectic.interface.ts';
import type { Database } from '../types_db.ts';

console.log("dialectic-service function started");

// Minimal DI defaults for dependencies required by submitStageResponses
const indexingService: IIndexingService = {
  async indexDocument(_sessionId: string, _sourceContributionId: string, _documentContent: string, _metadata: Record<string, unknown>) {
    return { success: true, tokensUsed: 0 };
  }
};

const embeddingClient: IEmbeddingClient = {
  async getEmbedding(_text: string) {
    return { embedding: [], usage: { prompt_tokens: 0, total_tokens: 0 } };
  }
};

export interface RequestEvent {
  waitUntil: (promise: Promise<unknown>) => void;
}

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
    const storageError: StorageError = error;
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
  getSessionDetails: (payload: GetSessionDetailsPayload, dbClient: SupabaseClient, user: User) => Promise<{ data?: GetSessionDetailsResponse; error?: ServiceError; status?: number }>;
  getContributionContentHandler: (getUserFn: GetUserFn, dbClient: SupabaseClient, logger: ILogger, payload: { contributionId: string }) => Promise<{ data?: GetContributionContentDataResponse; error?: ServiceError; status?: number }>;
  startSession: (user: User, dbClient: SupabaseClient, payload: StartSessionPayload, dependencies: { logger: ILogger }) => Promise<{ data?: StartSessionSuccessResponse; error?: ServiceError }>;
  generateContributions: (
    dbClient: SupabaseClient,
    payload: GenerateContributionsPayload,
    user: User,
    deps: GenerateContributionsDeps,
    authToken: string
  ) => Promise<{
    success: boolean;
    data?: { job_ids: string[] };
    error?: {
      message: string;
      status?: number;
      details?: unknown;
      code?: string;
    };
  }>;
  listProjects: (user: User, dbClient: SupabaseClient) => Promise<{ data?: DialecticProject[]; error?: ServiceError; status?: number }>;
  listAvailableDomainOverlays: (stageAssociation: string, dbClient: SupabaseClient) => Promise<DomainOverlayDescriptor[]>;
  deleteProject: (dbClient: SupabaseClient, payload: { projectId: string }, userId: string) => Promise<{data?: null, error?: { message: string; details?: string | undefined; }, status?: number}>;
  cloneProject: (dbClient: SupabaseClient, fileManager: IFileManager, originalProjectId: string, newProjectName: string | undefined, cloningUserId: string) => Promise<CloneProjectResult>;
  exportProject: (dbClient: SupabaseClient, fileManager: IFileManager, storageUtils: IStorageUtils, projectId: string, userId: string) => Promise<{ data?: { export_url: string }; error?: ServiceError; status?: number }>;
  getProjectResourceContent: (payload: GetProjectResourceContentPayload, dbClient: SupabaseClient, user: User) => Promise<{ data?: GetProjectResourceContentResponse; error?: ServiceError; status?: number }>;
  saveContributionEdit: SaveContributionEditFn;
  submitStageResponses: (payload: SubmitStageResponsesPayload, dbClient: SupabaseClient, user: User, dependencies: SubmitStageResponsesDependencies) => Promise<{ data?: SubmitStageResponsesResponse; error?: ServiceError; status?: number }>;
  listDomains: (dbClient: SupabaseClient) => Promise<{ data?: DialecticDomain[]; error?: ServiceError }>;
  fetchProcessTemplate: (dbClient: SupabaseClient, payload: FetchProcessTemplatePayload) => Promise<{ data?: DialecticProcessTemplate; error?: ServiceError; status?: number }>;
  updateSessionModels: (dbClient: SupabaseClient, payload: UpdateSessionModelsPayload, userId: string) => Promise<{ data?: DialecticSession; error?: ServiceError; status?: number }>;
  getStageRecipe: (payload: { stageSlug: string }, dbClient: SupabaseClient) => Promise<{ data?: StageRecipeResponse; error?: ServiceError; status?: number }>;
  listStageDocuments: (payload: ListStageDocumentsPayload, dbClient: SupabaseClient) => Promise<{ status: number; data?: ListStageDocumentsResponse; error?: { message: string } }>;
  submitStageDocumentFeedback: (payload: SubmitStageDocumentFeedbackPayload, dbClient: SupabaseClient, deps: SubmitStageDocumentFeedbackDeps) => Promise<DialecticServiceResponse<DialecticFeedbackRow>>;
  getStageDocumentFeedback: (payload: GetStageDocumentFeedbackPayload, dbClient: SupabaseClient<Database>, deps: GetStageDocumentFeedbackDeps) => Promise<DialecticServiceResponse<GetStageDocumentFeedbackResponse>>;
  getAllStageProgress: (payload: GetAllStageProgressPayload, dbClient: SupabaseClient<Database>, user: User) => Promise<GetAllStageProgressResult>;
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

  const FileManagerDependencies = {
    constructStoragePath: constructStoragePath,
    logger: logger,
  };

  const getUserFnForRequest: GetUserFn = async (): Promise<GetUserFnResult> => {
    if (!authHeader) {
      return { data: { user: null }, error: { message: "User not authenticated", status: 401, code: 'AUTH_TOKEN_MISSING' } };
    }
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error) {
      return { data: { user: null }, error: { message: error.message, status: error.status || 500, code: error.name || 'AUTH_ERROR' } };
    }
    if (!user) {
      return { data: { user: null }, error: { message: "User not authenticated", status: 401, code: 'AUTH_TOKEN_MISSING' } };
    }
    return { data: { user: user }, error: null };
  };

  try {
    const contentType = req.headers.get("content-type");

    if (req.method === 'POST' && contentType?.startsWith("multipart/form-data")) {
      const formData = await req.formData();
      const action: FormDataEntryValue | null = formData.get('action');
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
        'updateSessionModels',
        'getSessionDetails',
        'listStageDocuments',
        'submitStageDocumentFeedback',
        'getStageDocumentFeedback',
        'getAllStageProgress',
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

      const fileManager = new FileManagerService(adminClient, FileManagerDependencies);

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
          const payload: FetchProcessTemplatePayload = requestBody.payload;
          const { data, error, status } = await handlers.fetchProcessTemplate(userClient, payload);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 200, req);
        }
        case "getStageRecipe": {
          const payload: { stageSlug: string } = requestBody.payload;
          if (!payload || typeof payload.stageSlug !== 'string' || payload.stageSlug.length === 0) {
            return createErrorResponse("stageSlug is required", 400, req, { message: "stageSlug is required", status: 400 });
          }
          const { data, error, status } = await handlers.getStageRecipe({ stageSlug: payload.stageSlug }, userClient);
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
          const payload: GetProjectDetailsPayload = requestBody.payload;
          if (!payload || !payload.projectId) {
            return createErrorResponse("projectId is required for getProjectDetails", 400, req, { message: "projectId is required for getProjectDetails", code: "VALIDATION_ERROR" });
          }
          const { data, error, status } = await handlers.getProjectDetails(payload, userClient, userForJson!);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 200, req);
        }
        case "getSessionDetails": {
          const payload: GetSessionDetailsPayload = requestBody.payload;
          if (!payload || !payload.sessionId) {
            return createErrorResponse("sessionId is required for getSessionDetails", 400, req, { message: "sessionId is required for getSessionDetails", code: "VALIDATION_ERROR"});
          }
          const { data, error, status } = await handlers.getSessionDetails(payload, adminClient, userForJson!);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 200, req);
        }
        case "updateProjectDomain": {
          const payload: UpdateProjectDomainPayload = requestBody.payload;
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
          const payload: StartSessionPayload = requestBody.payload;
          if (!payload || !payload.projectId) {
            return createErrorResponse("projectId is required.", 400, req, { message: "projectId is required.", status: 400 });
          }
          const { data, error } = await handlers.startSession(
            userForJson!,
            adminClient,
            payload,
            { logger }
          );
          if (error) {
            return createErrorResponse(error.message, error.status, req, error);
          }
          return createSuccessResponse(data, 200, req);
        }
        case "generateContributions": {
          logger.info("[generateContributions handler] Entered handler.");
          if (!userForJson) {
            logger.error("[generateContributions handler] User object missing.");
            return createErrorResponse("User is required for generateContributions.", 401, req);
          }

          if (!authToken) {
            logger.error("[generateContributions handler] Auth token missing.");
            return createErrorResponse("Authentication token is required for generateContributions.", 401, req);
          }

          if (requestBody.action !== "generateContributions") {
            // This check is for type-narrowing and should not be hit in practice.
            return createErrorResponse("Internal server error: action mismatch.", 500, req);
          }
          const payload = requestBody.payload;

          logger.info("[generateContributions handler] Creating dependencies.");
          const deps: GenerateContributionsDeps = {
            callUnifiedAIModel: callUnifiedAIModel,
            downloadFromStorage: (_supabase: SupabaseClient, bucket: string, path: string) => downloadFromStorage(adminClient as SupabaseClient<Database>, bucket, path),
            getExtensionFromMimeType: getExtensionFromMimeType,
            logger: logger,
            randomUUID: crypto.randomUUID.bind(crypto),
            fileManager: fileManager,
            deleteFromStorage: (_supabase: SupabaseClient, bucket: string, paths: string[]) => deleteFromStorage(adminClient, bucket, paths)
          };

          logger.info("[generateContributions handler] Awaiting job creation...");
          const result = await handlers.generateContributions(
            adminClient,
            payload,
            userForJson,
            deps,
            authToken,
          );

          if (result.success) {
            logger.info("[generateContributions handler] Successfully created jobs. Returning 200 OK.", { job_ids: result.data?.job_ids });
            return createSuccessResponse(result.data, 200, req);
          } else {
            logger.error("[generateContributions handler] Failed to create jobs.", { error: result.error });
            return createErrorResponse(result.error?.message || 'Failed to generate contributions', result.error?.status || 500, req, result.error);
          }
        }
        case "getContributionContentData": {
          const payload: GetContributionContentDataPayload = requestBody.payload;
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
          const payload: DeleteProjectPayload = requestBody.payload;
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
          const payload: CloneProjectPayload = requestBody.payload;
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
          const payload: ExportProjectPayload = requestBody.payload;
          if (!payload || !payload.projectId) {
            return createErrorResponse("projectId is required for exportProject.", 400, req, { message: "projectId is required for exportProject.", status: 400 });
          }
          const storageUtils: IStorageUtils = {
            downloadFromStorage,
            createSignedUrlForPath
          };
          const { data, error, status } = await handlers.exportProject(adminClient, fileManager, storageUtils, payload.projectId, userForJson!.id);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 200, req);
        }
        case "getProjectResourceContent": {
          const payload: GetProjectResourceContentPayload = requestBody.payload;
          logger.info('[getProjectResourceContent handler] Received request', { payload, userId: userForJson?.id });
          if (!payload || !payload.resourceId) {
            logger.warn('[getProjectResourceContent handler] Missing resourceId', { payload });
            return createErrorResponse("resourceId is required.", 400, req, { message: "resourceId is required.", status: 400 });
          }
          const { data, error, status } = await handlers.getProjectResourceContent(payload, adminClient, userForJson!);
          if (error) {
            logger.error('[getProjectResourceContent handler] Function returned error', { 
              error, 
              errorMessage: error.message, 
              errorStatus: status || 500,
              errorCode: error.code,
              errorDetails: error.details,
              errorString: JSON.stringify(error),
            });
            return createErrorResponse(error.message, status || 500, req, error);
          }
          logger.info('[getProjectResourceContent handler] Function returned success', { 
            data,
            hasData: !!data,
            dataKeys: data ? Object.keys(data) : [],
            sourceContributionId: data?.sourceContributionId,
            sourceContributionIdType: data ? typeof data.sourceContributionId : 'undefined',
          });
          return createSuccessResponse(data, 200, req);
        }
        case "saveContributionEdit": {
          if (!userForJson) {
            return createErrorResponse('User not authenticated for saveContributionEdit', 401, req, { message: 'User not authenticated', status: 401, code: 'USER_AUTH_FAILED' });
          }
          const payload: SaveContributionEditPayload = requestBody.payload;
          const context: SaveContributionEditContext = {
            dbClient: userClient as SupabaseClient<Database>,
            user: userForJson,
            logger,
            fileManager: fileManager,
            pathDeconstructor: deconstructStoragePath,
          };
          const { data, error, status } = await handlers.saveContributionEdit(payload, userForJson, context);
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
            indexingService: indexingService,
            embeddingClient: embeddingClient,
          };
          const payload: SubmitStageResponsesPayload = requestBody.payload;
          const { data, error, status } = await handlers.submitStageResponses(payload, adminClient, userForJson!, dependencies);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 200, req);
        }
        case "updateSessionModels": {
          if (!userForJson) {
            return createErrorResponse('User not authenticated for updateSessionModels', 401, req, { message: "User not authenticated", status: 401, code: 'USER_AUTH_FAILED' });
          }
          const payload: UpdateSessionModelsPayload = requestBody.payload;
          const { data, error, status } = await handlers.updateSessionModels(adminClient, payload, userForJson.id);
          if (error) {
            return createErrorResponse(error.message, status || 500, req, error);
          }
          return createSuccessResponse(data, status || 200, req);
        }
        case "listStageDocuments": {
          const payload: ListStageDocumentsPayload = requestBody.payload;
          const result = await handlers.listStageDocuments(payload, adminClient);
          if (result.error) {
            return createErrorResponse(result.error.message, result.status, req, result.error);
          }
          return createSuccessResponse(result.data, result.status, req);
        }
        case "submitStageDocumentFeedback": {
          const payload: SubmitStageDocumentFeedbackPayload = requestBody.payload;
          const deps: SubmitStageDocumentFeedbackDeps = {
            fileManager: fileManager,
            logger: logger,
          };
          const { data, error } = await handlers.submitStageDocumentFeedback(payload, adminClient, deps);
          if (error) {
            return createErrorResponse(error.message, 500, req, error);
          }
          return createSuccessResponse(data, 200, req);
        }
        case "getStageDocumentFeedback": {
          const payload: GetStageDocumentFeedbackPayload = requestBody.payload;
          const deps: GetStageDocumentFeedbackDeps = { logger: logger };
          const { data, error } = await handlers.getStageDocumentFeedback(payload, adminClient as SupabaseClient<Database>, deps);
          if (error) {
            return createErrorResponse(error.message, error.status || 500, req, error);
          }
          return createSuccessResponse(data, 200, req);
        }
        case "getAllStageProgress": {
          if (!userForJson) {
            return createErrorResponse('User not authenticated for getAllStageProgress', 401, req, { message: 'User not authenticated', status: 401, code: 'USER_AUTH_FAILED' });
          }
          const payload: GetAllStageProgressPayload = requestBody.payload;
          const result = await handlers.getAllStageProgress(payload, adminClient as SupabaseClient<Database>, userForJson);
          if (result.error) {
            return createErrorResponse(result.error.message, result.status || 500, req, result.error);
          }
          return createSuccessResponse(result.data, result.status || 200, req);
        }
        default: {
          const errorMessage = `Unknown action for application/json.`;
          logger.warn(errorMessage, { action });
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
  } catch (err) {
    if (err instanceof Error) {
      logger.error('An unexpected error occurred in the main request handler.', { error: err.message, stack: err.stack });
      return createErrorResponse('An internal server error occurred.', 500, req, { message: err.message, code: 'UNHANDLED_EXCEPTION' });
    }
    // Add a return for the non-Error case to satisfy the linter
    return createErrorResponse('An unexpected error occurred.', 500, req, { message: 'An unexpected error occurred that was not an instance of Error.' });
  }
}

async function handleGetAllStageProgress(
  payload: GetAllStageProgressPayload,
  dbClient: SupabaseClient<Database>,
  user: User
): Promise<GetAllStageProgressResult> {
  const deps: GetAllStageProgressDeps = {
    dbClient,
    user,
    topologicalSortSteps,
    deriveStepStatuses,
    computeExpectedCounts,
    buildDocumentDescriptors,
  };
  return getAllStageProgress(deps, { payload });
}

export const defaultHandlers: ActionHandlers = {
  createProject,
  listAvailableDomains,
  updateProjectDomain,
  getProjectDetails,
  getSessionDetails,
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
  getStageRecipe,
  listStageDocuments,
  submitStageDocumentFeedback,
  getStageDocumentFeedback,
  getAllStageProgress: handleGetAllStageProgress,
};

export function createDialecticServiceHandler(
  handlers: ActionHandlers,
  getSupabaseClient: (token: string | null) => SupabaseClient,
  adminClient: SupabaseClient,
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return handleCorsPreflightRequest(req) ?? new Response(null, { status: 204 });
    }
    
    const authHeader = req.headers.get("Authorization");
    const authToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const userClient = getSupabaseClient(authToken);

    return await handleRequest(req, handlers, userClient, adminClient);
  };
}


serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreflightRequest(req) ?? new Response(null, { status: 204 });
  }

  const getSupabaseClient = (token: string | null) => createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        persistSession: false,
      },
    }
  );

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const handler = createDialecticServiceHandler(defaultHandlers, getSupabaseClient, adminClient);
  return await handler(req);
});
