import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'; // Updated Deno version
import "jsr:@supabase/functions-js/edge-runtime.d.ts"; // Added edge runtime types
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
import { SupabaseClient, User } from '@supabase/supabase-js'; // Import User type
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
// Import the new invite handler
import { handleCreateInvite, handleListPending } from './invites.ts';
// TODO: Import actual handlers later
// import { handleAcceptInvite, handleDeclineInvite } from './invites_actions.ts';

console.log('Organization function booting up...');

// Exported handler function for testing and serving
// Accepts an optional SupabaseClient for dependency injection in tests
export async function handleOrganizationRequest(
    req: Request,
    injectedSupabaseClient?: SupabaseClient<Database> 
): Promise<Response> {
  console.log(`[organizations] Handler: Method: ${req.method}, URL: ${req.url}`);

  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  let body: any = null;
  if (req.body && req.headers.get('content-type')?.includes('application/json')) {
    try {
      body = await req.json();
      console.log('[organizations] Handler: Request body parsed:', body);
    } catch (error) {
      console.error('[organizations] Handler: Error parsing request body:', error);
      return createErrorResponse('Invalid JSON body', 400, req);
    }
  }

  try {
    // Use injected client if provided (for tests), otherwise create a new one
    const supabase = injectedSupabaseClient || createSupabaseClient(req);
    const typedSupabase = supabase as SupabaseClient<Database>; // Ensure correct typing

    const { data: { user }, error: userError } = await typedSupabase.auth.getUser();

    if (userError || !user) {
      console.error('[organizations] Handler: Auth error:', userError);
      return createUnauthorizedResponse('Unauthorized');
    }
    
    const authenticatedUser = user as User; // Cast to User type
    console.log(`[organizations] Handler: Authenticated user: ${authenticatedUser.id}`);

    const url = new URL(req.url);
    const pathname = url.pathname;
    const parts = pathname.split('/').filter(Boolean);

    // --- Handle /invites/:inviteToken/accept|decline routes FIRST ---
    if (parts[0] === 'invites' && parts.length === 3 && req.method === 'POST') {
        const inviteToken = parts[1];
        const action = parts[2]; // 'accept' or 'decline'

        if (action === 'accept') {
            console.log(`[index.ts] Routing to ACCEPT invite: ${inviteToken}`);
            // TODO: Replace with actual handler call:
            // return handleAcceptInvite(req, typedSupabase, authenticatedUser, inviteToken, body);
             return createSuccessResponse({ message: `Placeholder: Accepted invite ${inviteToken}` }, 200, req);
        } else if (action === 'decline') {
            console.log(`[index.ts] Routing to DECLINE invite: ${inviteToken}`);
             // TODO: Replace with actual handler call:
             // return handleDeclineInvite(req, typedSupabase, authenticatedUser, inviteToken, body);
             return createSuccessResponse({ message: `Placeholder: Declined invite ${inviteToken}` }, 200, req); // Or 204
        } else {
             console.warn(`[index.ts] Invalid action for /invites/:token/:action: ${action}`);
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
      resourceType?: 'members' | 'invites' | string; // 'members', 'invites', or potentially others
      resourceId?: string; // e.g., membershipId, inviteId
      action?: string; // e.g., 'role', 'accept', 'decline'
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
      // Ensure all paths return explicitly
      return { orgId, resourceType, resourceId, action };
    }

    const pathParams = extractPathParams(pathname); // Only relevant if not handled by /invites route above
    const orgId = pathParams.orgId;
    const resourceType = pathParams.resourceType;
    const resourceId = pathParams.resourceId; 
    const action = pathParams.action;

    // --- Base /organizations routes ---
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
    // --- Routes for /organizations/:orgId/members ---
    else if (orgId && resourceType === 'members' && !action) {
        if (req.method === 'GET' && !resourceId) { // LIST MEMBERS
             // Delegate to the specific handler
             return handleListMembers(req, typedSupabase, authenticatedUser, orgId);
        } else if (req.method === 'DELETE' && resourceId) { // REMOVE MEMBER
             // Delegate to the specific handler
             return handleRemoveMember(req, typedSupabase, authenticatedUser, orgId, resourceId);
        } else {
             // Method Not Allowed for /organizations/:orgId/members or /organizations/:orgId/members/:memberId (without action)
             const path = resourceId ? `/organizations/:orgId/members/:memberId` : `/organizations/:orgId/members`;
             console.warn(`[index.ts] Handler: Method ${req.method} not allowed for path ${path}`);
             return createErrorResponse(`Method ${req.method} not allowed for this path`, 405, req);
        }
    }
    // --- Routes for /organizations/:orgId/members/:membershipId/role (update) ---
    else if (req.method === 'PUT' && orgId && resourceType === 'members' && resourceId && action === 'role') { // UPDATE MEMBER ROLE
        // Delegate to the specific handler
        return handleUpdateMemberRole(req, typedSupabase, authenticatedUser, orgId, resourceId, body);
    }
    // --- Routes for /organizations/:orgId/invites (create) ---
    else if (req.method === 'POST' && orgId && resourceType === 'invites' && !resourceId && !action) { // CREATE INVITE
         // Delegate to the specific handler
         return handleCreateInvite(req, typedSupabase, authenticatedUser, orgId, body);
    }
    // --- Route for /organizations/:orgId/pending (list pending) ---
    else if (req.method === 'GET' && orgId && resourceType === 'pending' && !resourceId && !action) { // LIST PENDING
        return handleListPending(req, typedSupabase, authenticatedUser, orgId);
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