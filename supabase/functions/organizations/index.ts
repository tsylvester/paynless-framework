import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'; // Match working function version
import { 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from '../_shared/cors-headers.ts'; // Updated CORS import
import { 
  createSupabaseClient, 
  createUnauthorizedResponse // Added for consistency
} from '../_shared/auth.ts'; // Updated Supabase client import
import { Database } from '../types_db.ts'; // Import the generated DB types
// Use npm: specifier for Supabase client, matching notifications function
import { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2.43.4'; 
import { handleCreateOrganization } from './create.ts';
import { handleListOrganizations } from './list.ts';
// Import the new details handlers
import { 
    handleGetOrgDetails,
    handleUpdateOrgDetails,
    handleDeleteOrg
} from './details.ts';
// Import the new member handlers
import { 
    handleListMembers,
    handleUpdateMemberRole,
    handleRemoveMember
} from './members.ts';
// Import the new invite handlers
import { 
    handleCreateInvite, 
    handleListPending,
    handleAcceptInvite,
    handleDeclineInvite,
    handleCancelInvite,
    handleGetInviteDetails
} from './invites.ts';
// Import the new request handlers
import {
    handleCreateJoinRequest,
    handleUpdateRequestStatus
} from './requests.ts';
// TODO: Remove placeholder imports if they were there

console.log('Organization function booting up...');

// Exported handler function for testing and serving
// Accepts an optional SupabaseClient for dependency injection in tests
export async function handleOrganizationRequest(
    req: Request,
    injectedSupabaseClient?: SupabaseClient<Database>
): Promise<Response> {
  console.log(`[organizations] Handler: Method: ${req.method}, URL: ${req.url}`);

  // 1. Handle CORS Preflight Request FIRST
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // 2. Create Supabase Client (needed for public route too)
  // Use injected client if provided (for tests), otherwise create a new one
  // Note: For public routes, client uses anon key if no Auth header
  const supabase = injectedSupabaseClient || createSupabaseClient(req);
  const typedSupabase = supabase as SupabaseClient<Database>; // Ensure correct typing

  // 3. Handle Public Routes BEFORE Auth Check
  const url = new URL(req.url);
  const pathname = url.pathname;
  const parts = pathname.split('/').filter(Boolean);

  let body: any = null;
  const contentType = req.headers.get('content-type');
  const contentLength = req.headers.get('content-length');

  // Only attempt to parse JSON body for POST/PUT if Content-Type is JSON and Content-Length > 0
  if ((req.method === 'POST' || req.method === 'PUT') && 
       contentType?.includes('application/json') &&
       contentLength && parseInt(contentLength) > 0 && // Check content length explicitly
       req.body) 
  {
    try {
      body = await req.json();
      console.log('[organizations] Handler: Request body parsed:', body);
    } catch (error) {
      console.error('[organizations] Handler: Error parsing request body:', error);
      return createErrorResponse('Invalid JSON body', 400, req);
    }
  } else if ((req.method === 'POST' || req.method === 'PUT') && contentType?.includes('application/json')) {
      console.log(`[organizations] Handler: Received ${req.method} with Content-Type JSON but no body (Content-Length: ${contentLength}). Proceeding without parsing body.`);
      // Body remains null, which is fine for handlers like accept/decline invite
  }

  try {
    // 4. Authenticate User for non-public routes
    const { data: { user }, error: userError } = await typedSupabase.auth.getUser();

    if (userError || !user) {
      console.error('[organizations] Handler: Auth error:', userError);
      // Pass req to createUnauthorizedResponse
      return createUnauthorizedResponse('Unauthorized', req); 
    }
    
    const authenticatedUser = user as User; // Cast to User type
    console.log(`[organizations] Handler: Authenticated user: ${authenticatedUser.id}`);

    // 5. Handle Authenticated Routes
    
    // --- Handle GET /organizations/invites/:token/details (Requires Auth) ---
    if (parts[0] === 'organizations' && parts[1] === 'invites' && parts.length === 4 && parts[3] === 'details' && req.method === 'GET') {
        const inviteToken = parts[2]; // Token is the 3rd part (index 2)
        console.log(`[index.ts] AUTH route: GET /organizations/invites/:token/details for token: ${inviteToken}`);
        // Pass the authenticated user to the handler
        return handleGetInviteDetails(req, typedSupabase, authenticatedUser, inviteToken);
    }
    // --- Handle POST /invites/:inviteToken/accept|decline (Requires Auth) ---
    // NOTE: This path starts directly with 'invites', not 'organizations/invites' - This comment is now INCORRECT
    // Adjust if your API client calls /organizations/invites/:token/accept instead - WE DID!
    // else if (parts[0] === 'invites' && parts.length === 3 && req.method === 'POST') { // Old incorrect check
    else if (parts[0] === 'organizations' && parts[1] === 'invites' && parts.length === 4 && req.method === 'POST') { // Correct check for /organizations/invites/:token/action
        const inviteToken = parts[2]; // Token is 3rd part (index 2)
        const action = parts[3];      // Action is 4th part (index 3)

        if (action === 'accept') {
            console.log(`[index.ts] AUTH route: POST /invites/:inviteToken/accept for token: ${inviteToken}`);
            return handleAcceptInvite(req, typedSupabase, authenticatedUser, inviteToken, body);
        } else if (action === 'decline') {
            console.log(`[index.ts] AUTH route: POST /invites/:inviteToken/decline for token: ${inviteToken}`);
             return handleDeclineInvite(req, typedSupabase, authenticatedUser, inviteToken, body);
        } else {
             console.warn(`[index.ts] Invalid action for /invites/:token/:action: ${action}`);
             // Use shared error response creator
             return createErrorResponse('Invalid action for invite.', 400, req); 
        }
    }

    // --- EXISTING /organizations/... routing logic ---
    // Helper function to extract path parameters
    // Example: /organizations/org123/members -> { orgId: 'org123', resourceType: 'members' }
    // Example: /organizations/org123/members/mem456 -> { orgId: 'org123', resourceType: 'members', resourceId: 'mem456' }
    // Example: /organizations/org123/members/mem456/role -> { orgId: 'org123', resourceType: 'members', resourceId: 'mem456', action: 'role' }
    function extractPathParams(pathname: string): {
      orgId?: string;
      resourceType?: 'members' | 'invites' | 'requests' | 'pending' | string;
      resourceId?: string;
      action?: string;
    } {
      const parts = pathname.split('/').filter(Boolean);
      let orgId: string | undefined;
      let resourceType: string | undefined;
      let resourceId: string | undefined;
      let action: string | undefined;

      if (parts[0] === 'organizations' && parts.length >= 2) {
        orgId = parts[1];
        if (parts.length >= 3) {
          resourceType = parts[2]; // e.g., 'members', 'invites'
          if (parts.length >= 4) {
            resourceId = parts[3]; // e.g., membershipId
            if (parts.length >= 5) {
              action = parts[4]; // e.g., 'role'
            }
          }
        }
      }
      return { orgId, resourceType, resourceId, action };
    }

    const pathParams = extractPathParams(pathname); // Only relevant if not handled by /invites route above
    const orgId = pathParams.orgId;
    const resourceType = pathParams.resourceType;
    const resourceId = pathParams.resourceId; 
    const action = pathParams.action;

    // --- Base /organizations routes (Requires Auth) ---
    if (req.method === 'POST' && !orgId && parts[0] === 'organizations') {
        return handleCreateOrganization(req, typedSupabase, authenticatedUser, body);
    } else if (req.method === 'GET' && !orgId && parts[0] === 'organizations') {
        return handleListOrganizations(req, typedSupabase, authenticatedUser);
    }
    // --- Routes for /organizations/:orgId (no further segments) ---
    else if (orgId && !resourceType && !resourceId && !action) {
         if (req.method === 'GET') {
            // Delegate to the specific handler
            return handleGetOrgDetails(req, typedSupabase, authenticatedUser, orgId);
         } else if (req.method === 'PUT') {
             // Delegate to the specific handler
             return handleUpdateOrgDetails(req, typedSupabase, authenticatedUser, orgId, body);
         } else if (req.method === 'DELETE') {
              // Delegate to the specific handler
              return handleDeleteOrg(req, typedSupabase, authenticatedUser, orgId);
         } else {
            console.warn(`[index.ts] Handler: Method ${req.method} not allowed for path /organizations/:orgId`);
            return createErrorResponse(`Method ${req.method} not allowed for this path`, 405, req);
         }
    }
    // --- Routes for /organizations/:orgId/members (Requires Auth) ---
    else if (orgId && resourceType === 'members' && !action) {
        if (req.method === 'GET' && !resourceId) { // LIST MEMBERS
             return handleListMembers(req, typedSupabase, authenticatedUser, orgId);
        } else if (req.method === 'DELETE' && resourceId) { // REMOVE MEMBER
             return handleRemoveMember(req, typedSupabase, authenticatedUser, orgId, resourceId);
        } else {
             // Method Not Allowed for /organizations/:orgId/members or /organizations/:orgId/members/:memberId (without action)
             const path = resourceId ? `/organizations/:orgId/members/:memberId` : `/organizations/:orgId/members`;
             console.warn(`[index.ts] Handler: Method ${req.method} not allowed for path ${path}`);
             return createErrorResponse(`Method ${req.method} not allowed for this path`, 405, req);
        }
    }
    // --- Routes for /organizations/:orgId/members/:membershipId/role (Requires Auth) ---
    else if (req.method === 'PUT' && orgId && resourceType === 'members' && resourceId && action === 'role') { // UPDATE MEMBER ROLE
        // Delegate to the specific handler
        return handleUpdateMemberRole(req, typedSupabase, authenticatedUser, orgId, resourceId, body);
    }
    // --- Routes for /organizations/members/:membershipId/status (approve/deny request) ---
    else if (req.method === 'PUT' && orgId && resourceType === 'members' && resourceId && action === 'status') { // APPROVE/DENY JOIN REQUEST
        // Needs membershipId, not orgId directly in path usually
        return handleUpdateRequestStatus(req, typedSupabase, authenticatedUser, resourceId, body); // resourceId is membershipId
    }
    // --- Routes for /organizations/:orgId/invites (Requires Auth) ---
    else if (req.method === 'POST' && orgId && resourceType === 'invites' && !resourceId && !action) { // CREATE INVITE
         // Delegate to the specific handler
         return handleCreateInvite(req, typedSupabase, authenticatedUser, orgId, body);
    }
    // --- Route for /organizations/:orgId/pending (list pending) ---
    else if (req.method === 'GET' && orgId && resourceType === 'pending' && !resourceId && !action) { // LIST PENDING
        return handleListPending(req, typedSupabase, authenticatedUser, orgId);
    }
    // --- Route for /organizations/:orgId/invites/:inviteId (cancel invite) ---
    else if (req.method === 'DELETE' && orgId && resourceType === 'invites' && resourceId && !action) {
        // Delegate to the specific handler
        return handleCancelInvite(req, typedSupabase, authenticatedUser, orgId, resourceId); // resourceId is the inviteId here
    }
    // --- Route for /organizations/:orgId/requests (create join request) ---
    else if (req.method === 'POST' && orgId && resourceType === 'requests' && !resourceId && !action) { // CREATE JOIN REQUEST
        return handleCreateJoinRequest(req, typedSupabase, authenticatedUser, orgId, body);
    }
    // --- Fallback for unhandled routes --- 
    else {
        // Check if it was an /invites/ path that didn't match accept/decline
        if (parts[0] === 'invites') {
             console.warn(`[index.ts] Unhandled /invites/ route: ${req.method} ${pathname}`);
             return createErrorResponse('Not Found or Invalid Method/Action for /invites/', 404, req);
        }
        // Original fallback
        console.warn(`[index.ts] Unhandled route: ${req.method} ${pathname}`);
        return createErrorResponse('Not Found', 404, req);
    }

  } catch (error) {
    console.error('[index.ts] Handler: Top-level error:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Internal Server Error',
      500,
      req,
      error
    );
  }
}

// Serve the handler only when the script is run directly
if (import.meta.main) {
  serve((req) => handleOrganizationRequest(req));
  console.log('Organization function handler registered and serving.');
} else {
  console.log('Organization function handler module loaded (not serving).');
}