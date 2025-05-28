// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import {
  baseCorsHeaders, // For direct use if needed, though helper functions are preferred
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from "../_shared/cors-headers.ts";
import { createSupabaseAdminClient } from "../_shared/auth.ts";
import { Database } from "../types_db.ts";
import { DomainOverlayItem, extractDistinctDomainTags } from "../_shared/domain-utils.ts";

console.log("dialectic-service function started");

// Initialize Supabase admin client once
const supabaseAdmin = createSupabaseAdminClient();

interface DialecticServiceRequest {
  action: string;
  payload?: Record<string, unknown>;
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