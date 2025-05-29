// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import {
  baseCorsHeaders, // For direct use if needed, though helper functions are preferred
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from "../_shared/cors-headers.ts";
import { createSupabaseAdminClient, createSupabaseClient } from "../_shared/auth.ts";
import { Database } from "../types_db.ts";
import { DomainOverlayItem, extractDistinctDomainTags, isValidDomainTag } from "../_shared/domain-utils.ts";

console.log("dialectic-service function started");

// Initialize Supabase admin client once
const supabaseAdmin = createSupabaseAdminClient();

interface DialecticServiceRequest {
  action: string;
  payload?: Record<string, unknown>;
}

interface CreateProjectPayload {
  projectName: string;
  initialUserPrompt: string;
  selectedDomainTag?: string | null;
}

// DomainOverlayItem and extractDistinctDomainTags are now imported

async function listAvailableDomainTags(dbClient: typeof supabaseAdmin) {
  const { data, error } = await dbClient
    .from('domain_specific_prompt_overlays')
    .select('domain_tag')
    .neq('domain_tag', null);

  if (error) {
    console.error("Error fetching domain tags:", error);
    return { error: { message: "Failed to fetch domain tags", details: error.message, status: 500 } };
  }

  // Use the imported utility function
  const distinctTags = extractDistinctDomainTags(data as DomainOverlayItem[]);
  return { data: distinctTags };
}

interface UpdateProjectDomainTagPayload {
  projectId: string;
  domainTag: string | null;
}

async function updateProjectDomainTag(
  req: Request,
  dbAdminClient: typeof supabaseAdmin,
  payload: UpdateProjectDomainTagPayload
) {
  const { projectId, domainTag } = payload;

  if (!projectId) {
    return { error: { message: "projectId is required", status: 400 } };
  }

  const supabaseUserClient = createSupabaseClient(req);
  const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

  if (userError || !user) {
    console.warn("User not authenticated for updateProjectDomainTag", userError);
    return { error: { message: "User not authenticated", status: 401 } };
  }

  if (domainTag !== null) {
    const tagIsValid = await isValidDomainTag(dbAdminClient, domainTag);
    if (!tagIsValid) {
      return { error: { message: `Invalid domainTag: "${domainTag}"`, status: 400 } };
    }
  }

  const { data: projectData, error: projectError } = await dbAdminClient
    .from('dialectic_projects')
    .update({ selected_domain_tag: domainTag, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', user.id)
    .select('id, project_name, selected_domain_tag, updated_at')
    .single();

  if (projectError) {
    console.error("Error updating project domain tag:", projectError);
    if (projectError.code === 'PGRST116') {
        return { error: { message: "Project not found or access denied", status: 404 } };
    }
    return { error: { message: "Failed to update project domain tag", details: projectError.message, status: 500 } };
  }

  if (!projectData) {
    return { error: { message: "Project not found or access denied after update attempt", status: 404 } };
  }

  return { data: projectData };
}

async function createProject(
  req: Request,
  dbAdminClient: typeof supabaseAdmin,
  payload: CreateProjectPayload
) {
  const { projectName, initialUserPrompt, selectedDomainTag } = payload;

  if (!projectName || !initialUserPrompt) {
    return { error: { message: "projectName and initialUserPrompt are required", status: 400 } };
  }

  const supabaseUserClient = createSupabaseClient(req);
  const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

  if (userError || !user) {
    console.warn("User not authenticated for createProject", userError);
    return { error: { message: "User not authenticated", status: 401 } };
  }

  if (selectedDomainTag) { // if null or undefined, we don't need to validate
    const tagIsValid = await isValidDomainTag(dbAdminClient, selectedDomainTag);
    if (!tagIsValid) {
      return { error: { message: `Invalid selectedDomainTag: "${selectedDomainTag}"`, status: 400 } };
    }
  }

  const { data: newProjectData, error: createError } = await dbAdminClient
    .from('dialectic_projects')
    .insert({
      user_id: user.id,
      project_name: projectName,
      initial_user_prompt: initialUserPrompt,
      selected_domain_tag: selectedDomainTag,
      // status is 'active' by default due to table definition
      // created_at and updated_at are handled by default in table definition
    })
    .select() // Select all columns of the new project
    .single();

  if (createError) {
    console.error("Error creating project:", createError);
    // Check for specific DB errors if needed, e.g., unique constraint violation
    return { error: { message: "Failed to create project", details: createError.message, status: 500 } };
  }

  if (!newProjectData) {
    // This case should ideally not be reached if insert was successful without error
    // but as a safeguard.
    return { error: { message: "Failed to create project, no data returned.", status: 500 }};
  }
  
  return { data: newProjectData };
}

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    if (req.headers.get("content-type") !== "application/json") {
      return createErrorResponse("Invalid content type, expected application/json", 400, req);
    }

    const requestBody: DialecticServiceRequest = await req.json();
    const { action, payload } = requestBody;

    // Check for user authentication if required by specific actions later
    // For now, listAvailableDomainTags can be public or auth'd user
    // const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser();
    // if (userError || !user) {
    //   console.warn("User not authenticated for dialectic-service", userError);
    //   return new Response(JSON.stringify({ error: "User not authenticated" }), {
    //     status: 401,
    //     headers: { ...corsHeaders, "Content-Type": "application/json" },
    //   });
    // }

    let result: { data?: unknown, error?: { message: string, status?: number, details?: string } };

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
      // Add other actions here later, e.g.:
      // case 'createProject':
      //   result = await createProject(supabaseAdmin, user, payload);
      //   break;
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

    return createSuccessResponse({ data: result.data }, 200, req);

  } catch (e) {
    console.error("Critical error in dialectic-service:", e);
    const error = e instanceof Error ? e : new Error(String(e));
    return createErrorResponse("Internal Server Error", 500, req, error);
  }
}); 