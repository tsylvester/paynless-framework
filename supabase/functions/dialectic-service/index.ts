// deno-lint-ignore-file no-explicit-any
import {
  DialecticServiceRequest,
  CreateProjectPayload,
  UpdateProjectDomainTagPayload,
  StartSessionPayload,
  GenerateThesisContributionsPayload,
  GetProjectDetailsPayload,
} from "./dialectic.interface.ts";
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from "../_shared/cors-headers.ts";
import { createSupabaseAdminClient, createSupabaseClient } from "../_shared/auth.ts"; // createSupabaseClient is used by imported functions
import { logger } from "../_shared/logger.ts";

// Import individual action handlers
// import { callUnifiedAIModel } from "./callModel.ts"; // Though not directly in switch, other functions might use it.
import { createProject } from "./createProject.ts";
import { listAvailableDomainTags } from "./listAvailableDomainTags.ts";
import { updateProjectDomainTag } from "./updateProjectDomainTag.ts";
import { getProjectDetails } from "./getProjectDetails.ts";
import { getContributionContentSignedUrlHandler } from "./getContributionContent.ts";
import { startSession } from "./startSession.ts";
import { generateStageContributions } from "./generateContribution.ts";
import { listProjects } from "./listProjects.ts"; // Ensure this is imported

console.log("dialectic-service function started");

const supabaseAdmin = createSupabaseAdminClient();

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  let authToken: string | null = null;
  try {
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
        authToken = authHeader.substring(7);
    }

    if (req.headers.get("content-type") !== "application/json") {
      return createErrorResponse("Invalid content type, expected application/json", 400, req);
    }

    const requestBody: DialecticServiceRequest = await req.json();
    const { action, payload } = requestBody;

    let result: {
      success?: boolean;
      data?: unknown;
      error?: { message: string; status?: number; details?: string };
    };

    switch (action) {
      case 'listAvailableDomainTags':
        result = await listAvailableDomainTags(supabaseAdmin);
        break;
      case 'updateProjectDomainTag':
        if (!payload) {
            result = { error: { message: "Payload is required for updateProjectDomainTag", status: 400 } };
        } else {
            result = await updateProjectDomainTag(req, supabaseAdmin, payload as unknown as UpdateProjectDomainTagPayload);
        }
        break;
      case 'createProject':
        if (!payload) {
            result = { error: { message: "Payload is required for createProject", status: 400 } };
        } else {
            result = await createProject(req, supabaseAdmin, payload as unknown as CreateProjectPayload);
        }
        break;
      case 'startSession':
        if (!payload) {
            result = { error: { message: "Payload is required for startSession", status: 400 } };
        } else {
            result = await startSession(req, supabaseAdmin, payload as unknown as StartSessionPayload);
        }
        break;
      case 'generateThesisContributions': 
        if (!payload) {
            result = { success: false, error: { message: "Payload is required for generateThesisContributions", status: 400 } };
        } else if (!authToken) {
             result = { success: false, error: { message: "User authentication token is required for generateThesisContributions", status: 401 } };
        }
        else {
            result = await generateStageContributions(supabaseAdmin, payload as GenerateStageContributionsPayload, authToken);
        }
        break;
      case 'getContributionContentSignedUrl':
        if (!payload || typeof payload !== 'object' || !('contributionId' in payload)) {
          result = { error: { message: "Invalid payload for getContributionContentSignedUrl. Expected { contributionId: string }", status: 400 } };
        } else {
          result = await getContributionContentSignedUrlHandler(req, supabaseAdmin, payload as { contributionId: string });
        }
        break;
      case 'listProjects':
        result = await listProjects(req, supabaseAdmin);
        break;
      case 'getProjectDetails':
        if (!payload || !("projectId" in payload) || typeof payload.projectId !== 'string') { 
            result = { error: { message: "Invalid or missing projectId in payload for getProjectDetails action.", status: 400 } };
        } else {
            result = await getProjectDetails(req, supabaseAdmin, payload as unknown as GetProjectDetailsPayload);
        }
        break;
      default:
        result = { error: { message: `Unknown action: ${action}`, status: 404 } };
    }

    if (result.error) {
      return createErrorResponse(
        result.error.message || "Action failed",
        result.error.status || 400,
        req,
        result.error.details ? new Error(result.error.details) : undefined
      );
    }
    return createSuccessResponse(result, 200, req);

  } catch (e: unknown) { 
    const error = e instanceof Error ? e : new Error(String(e));
    const getErrorProperty = (propName: string): unknown => {
      if (e && typeof e === 'object' && e !== null && propName in e) {
        return (e as Record<string, unknown>)[propName];
      }
      return undefined;
    };
    const errorCode = getErrorProperty('code');
    const errorStatus = getErrorProperty('status');
    logger.error("Error in dialectic-service main handler:", { 
      errorMessage: error.message, 
      errorName: error.name, 
      errorStack: error.stack, 
      errorCode: errorCode,
      errorStatus: typeof errorStatus === 'number' ? errorStatus : undefined, 
      reqUrl: req.url,
      reqMethod: req.method,
      origin: req.headers.get('Origin')
    });
    const errorNameValue = getErrorProperty('name');
    const errorName = error.name || (typeof errorNameValue === 'string' ? errorNameValue : undefined);
    const errorMessage = error.message || String(e);
    const errorNameStr = typeof errorName === 'string' ? errorName : '';
    const errorMessageStr = typeof errorMessage === 'string' ? errorMessage : '';
    if (errorNameStr === 'JWSInvalid' || 
        errorNameStr === 'JWSSignatureVerificationFailed' || 
        (errorNameStr === 'AuthApiError' && errorMessageStr.toLowerCase().includes('jwt'))) {
      return createErrorResponse("Invalid or malformed token", 401, req, errorMessageStr);
    }
    if (error instanceof SyntaxError && errorMessageStr.toLowerCase().includes("json")) {
      return createErrorResponse("Invalid JSON payload", 400, req, errorMessageStr);
    }
    const statusCode = typeof errorStatus === 'number' ? errorStatus : 500;
    const errorDetails = getErrorProperty('details');
    const details = errorDetails || error.stack;
    return createErrorResponse(
      errorMessageStr || "An unexpected error occurred in dialectic-service.",
      statusCode,
      req,
      details
    );
  }
});