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

    // Helper function to extract path parameters
    // Example: /organizations/org123/members -> { orgId: 'org123' }
    // Example: /organizations/org123/members/mem456/role -> { orgId: 'org123', membershipId: 'mem456' }
    function extractPathParams(pathname: string): { orgId?: string; membershipId?: string; segment?: string } {
        const parts = pathname.split('/').filter(Boolean); // Remove empty segments
        let orgId: string | undefined;
        let membershipId: string | undefined;
        let segment: string | undefined;

        if (parts[0] === 'organizations' && parts.length >= 2) {
            orgId = parts[1];
            if (parts.length >= 3) {
                 if (parts[2] === 'members' && parts.length >= 4) {
                    membershipId = parts[3];
                    if (parts.length >= 5) {
                        segment = parts[4]; // e.g., 'role'
                    }
                 } else {
                     segment = parts[2]; // e.g., 'members', 'invites'
                 }
            }
        }
        return { orgId, membershipId, segment };
    }

    // --- Route based on HTTP method and path --- //
    const url = new URL(req.url);
    const pathParams = extractPathParams(url.pathname);
    const orgId = pathParams.orgId;
    const membershipId = pathParams.membershipId;
    const segment = pathParams.segment; // 'members', 'invites', 'role' etc.

    // --- Base /organizations routes ---
    if (!orgId) {
        if (req.method === 'POST') {
            console.log('[organizations] Logic: Handling POST /organizations...');
            
            // 1. Validate input
            const { name, visibility } = body || {};
            if (!name || typeof name !== 'string' || name.trim().length < 3) {
              return createErrorResponse('Organization name is required and must be at least 3 characters long.', 400, req);
            }
            const orgVisibility = visibility === 'public' ? 'public' : 'private';

            // Call the PostgreSQL function using the (potentially injected) client
            const rpcPayload = {
                p_user_id: authenticatedUser.id,
                p_org_name: name.trim(),
                p_org_visibility: orgVisibility
            };
            const { data: newOrg, error: rpcError } = await typedSupabase.rpc(
                'create_org_and_admin_member',
                rpcPayload
            );

            if (rpcError) {
                console.error('[organizations] Logic: Error calling create_org_and_admin_member RPC:', rpcError);
                return createErrorResponse(`Failed to create organization: ${rpcError.message}`, 500, req);
            }

            if (!newOrg || typeof newOrg !== 'string') {
                console.error('[organizations] Logic: RPC did not return a valid organization ID.');
                return createErrorResponse('Failed to retrieve organization details after creation.', 500, req);
            }
            
            const newOrgId = newOrg;

            // Fetch the newly created organization details
            const { data: createdOrgDetails, error: fetchError } = await typedSupabase
                .from('organizations')
                .select('*')
                .eq('id', newOrgId)
                .single();

            if (fetchError || !createdOrgDetails) {
                console.error(`[organizations] Logic: Error fetching details for new org ${newOrgId}:`, fetchError);
                return createErrorResponse('Organization created, but failed to fetch details.', 500, req);
            }

            console.log('[organizations] Logic: Organization created successfully:', createdOrgDetails);
            return createSuccessResponse(createdOrgDetails, 201, req);
        }
        
        if (req.method === 'GET') {
            console.log('[organizations] Logic: Handling GET /organizations (list user orgs)...');
            // Fetch organizations where the user is an active member
            // RLS policy on organization_members should handle filtering for the current user
            const { data: memberships, error: memError } = await typedSupabase
                .from('organization_members')
                .select(`
                    organizations ( id, name, visibility, created_at ) 
                `)
                .eq('user_id', authenticatedUser.id)
                .eq('status', 'active'); // Only active memberships

            if (memError) {
                console.error('[organizations] Error fetching user organizations:', memError);
                return createErrorResponse('Failed to retrieve organizations.', 500, req);
            }
            
            // Extract the organization data, filtering out any nulls in case of unexpected join results
            const userOrgs = memberships?.map(m => m.organizations).filter(org => org !== null) || [];

            return createSuccessResponse(userOrgs, 200, req);
        }
    } 
    // --- Routes with /organizations/:orgId ---
    else if (orgId && !segment && !membershipId) { // Matches /organizations/:orgId exactly
         if (req.method === 'GET') {
            console.log(`[organizations] Logic: Handling GET /organizations/${orgId} (details)...`);
            // Fetch specific organization details
            // RLS policy on organizations should ensure user is a member (or it's public)
            const { data: orgDetails, error: detailsError } = await typedSupabase
                .from('organizations')
                .select('*')
                .eq('id', orgId)
                .maybeSingle(); // Use maybeSingle to handle not found case

            if (detailsError) {
                 console.error(`[organizations] Error fetching org ${orgId} details:`, detailsError);
                 return createErrorResponse('Failed to retrieve organization details.', 500, req);
            }
            
            if (!orgDetails) {
                // This means either org doesn't exist OR RLS prevented access
                return createErrorResponse('Organization not found or access denied.', 404, req);
            }

            return createSuccessResponse(orgDetails, 200, req);
         }
         
         if (req.method === 'PUT') {
             console.log(`[organizations] Logic: Handling PUT /organizations/${orgId} (update)...`);
             // 1. Validate payload
             const { name, visibility } = body || {};
             if (name !== undefined && (typeof name !== 'string' || name.trim().length < 3)) {
                 return createErrorResponse('Invalid update payload. Name must be at least 3 characters.', 400, req);
             }
             if (visibility !== undefined && visibility !== 'public' && visibility !== 'private') {
                  return createErrorResponse('Invalid update payload. Visibility must be "public" or "private".', 400, req);
             }
             const updatePayload: Partial<Database['public']['Tables']['organizations']['Update']> = {};
             if (name !== undefined) updatePayload.name = name.trim();
             if (visibility !== undefined) updatePayload.visibility = visibility;

             if (Object.keys(updatePayload).length === 0) {
                return createErrorResponse('No valid fields provided for update.', 400, req);
             }

             // 2. Attempt update (RLS policy must check for admin role)
             const { data: updatedOrg, error: updateError, count } = await typedSupabase
                .from('organizations')
                .update(updatePayload)
                .eq('id', orgId)
                .select() // Select updated data
                .single(); // Expecting one row to be updated

             if (updateError) {
                 // Check if it's a permission error (e.g., RLS failed) - typically results in count 0, but error might occur
                 if (updateError.code === '42501' || count === 0) { // Check for RLS violation code or 0 count
                      console.warn(`[organizations] Update forbidden or org not found for user ${authenticatedUser.id} on org ${orgId}`);
                      return createErrorResponse('Forbidden: You do not have permission to update this organization.', 403, req);
                 }
                 console.error(`[organizations] Error updating org ${orgId}:`, updateError);
                 return createErrorResponse(`Failed to update organization: ${updateError.message}`, 500, req);
             }
              if (!updatedOrg) {
                  // Should not happen if count was > 0 and no error, but handle defensively
                  console.error(`[organizations] Update successful for org ${orgId} but no data returned.`);
                  return createErrorResponse('Update succeeded but failed to retrieve updated data.', 500, req);
              }

             return createSuccessResponse(updatedOrg, 200, req);
         }
         
         if (req.method === 'DELETE') {
              console.log(`[organizations] Logic: Handling DELETE /organizations/${orgId} (soft delete)...`);
              
              // 1. Check if user is admin (RLS *should* handle, but explicit check is clearer)
              const { data: isAdmin, error: adminCheckError } = await typedSupabase.rpc(
                  'is_org_admin', { org_id: orgId } // Corrected parameter name
              );

              if (adminCheckError || !isAdmin) {
                  console.warn(`[organizations] Permission denied for user ${authenticatedUser.id} to delete org ${orgId}. Admin check failed or returned false.`);
                  return createErrorResponse("Forbidden: You do not have permission to delete this organization.", 403, req);
              }
              
              // 2. Check if user is the last admin
               const { data: adminMembers, error: adminCountError } = await typedSupabase
                   .from('organization_members')
                   .select('user_id')
                   .eq('organization_id', orgId)
                   .eq('role', 'admin')
                   .eq('status', 'active'); // Only count active admins

               if (adminCountError) {
                   console.error(`[organizations] Error checking admin count for org ${orgId}:`, adminCountError);
                   return createErrorResponse('Failed to verify organization admin status.', 500, req);
               }

               if (adminMembers && adminMembers.length === 1 && adminMembers[0].user_id === authenticatedUser.id) {
                   console.warn(`[organizations] Attempted delete of org ${orgId} by last admin ${authenticatedUser.id}`);
                   return createErrorResponse('Conflict: Cannot delete organization as you are the only administrator.', 409, req);
               }
               
              // 3. Perform soft delete via update
              const { error: updateError, count } = await typedSupabase
                .from('organizations')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', orgId)
                .is('deleted_at', null); // Only delete if not already deleted

              if (updateError) {
                   // Handle potential errors during update
                   console.error(`[organizations] Error soft deleting org ${orgId}:`, updateError);
                   // RLS violation could still occur if the initial admin check passed but update fails RLS
                   if (updateError.code === '42501') { 
                        return createErrorResponse('Forbidden: Permission denied during delete operation.', 403, req);
                   }
                   return createErrorResponse(`Failed to delete organization: ${updateError.message}`, 500, req);
              }

              if (count === 0) {
                  // This means org was not found OR it was already deleted OR RLS blocked (though less likely after explicit check)
                  // Check if it exists first to differentiate 404 vs 403/other
                   const { data: orgExists, error: existsError } = await typedSupabase
                        .from('organizations')
                        .select('id')
                        .eq('id', orgId)
                        .maybeSingle();
                        
                  if (existsError) {
                      console.error(`[organizations] Error checking existence of org ${orgId} after failed delete:`, existsError);
                      // Fallback to generic error
                  } else if (!orgExists) {
                     console.warn(`[organizations] Delete failed: Org ${orgId} not found.`);
                     return createErrorResponse('Not Found: Organization not found.', 404, req);
                  }
                  // If it exists, assume RLS or already deleted status prevented update
                  console.warn(`[organizations] Soft delete failed for org ${orgId}, count was 0. Org might be already deleted or access issue occurred.`);
                  // Could return 403, 404, or 409 depending on assumed reason
                  // For simplicity, let's return 404 as the most likely cause if the admin check passed.
                  return createErrorResponse('Organization not found or already deleted.', 404, req); 
              }
              
              // Success
              return createSuccessResponse(null, 204, req);
         }
    }
    // --- Routes for /organizations/:orgId/members ---
    else if (orgId && segment === 'members' && !membershipId) {
        if (req.method === 'GET') {
            console.log(`[organizations] Logic: Handling GET /organizations/${orgId}/members (list)...`);
            // RLS on organization_members should ensure user is part of the org
            // Need to join with profiles to get names etc.
            const { data: members, error: membersError } = await typedSupabase
                .from('organization_members')
                .select(`
                    id, 
                    user_id, 
                    role, 
                    status,
                    created_at,
                    profiles ( full_name, avatar_url ) 
                `)
                .eq('organization_id', orgId);

             if (membersError) {
                console.error(`[organizations] Error fetching members for org ${orgId}:`, membersError);
                return createErrorResponse('Failed to retrieve members.', 500, req);
             }
             
             // If the query succeeds but returns empty, it might be due to RLS.
             // The test expects 403 in this case. We need a way to differentiate RLS vs. truly empty org.
             // One way is a preliminary check if the user is a member.
             const { count: memberCheckCount, error: checkError } = await typedSupabase
                .from('organization_members')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', orgId)
                .eq('user_id', authenticatedUser.id)
                .eq('status', 'active');
                
             if (checkError){
                 console.error(`[organizations] Error checking membership for org ${orgId}:`, checkError);
                 // Fall through to return potentially empty members list or handle differently
             }

             if (memberCheckCount === 0) {
                 console.warn(`[organizations] User ${authenticatedUser.id} forbidden to view members for org ${orgId}`);
                 return createErrorResponse("Forbidden: You do not have permission to view members of this organization.", 403, req);
             }

             return createSuccessResponse(members || [], 200, req);
        }
    }
    // --- Routes for /organizations/:orgId/invites ---
    else if (orgId && segment === 'invites' && !membershipId) {
         if (req.method === 'POST') {
             console.log(`[organizations] Logic: Handling POST /organizations/${orgId}/invites...`);
             // 1. Validate payload
             const { email, role } = body || {};
             if (!email || typeof email !== 'string' || !email.includes('@')) { // Basic email check
                  return createErrorResponse('Invalid email address provided.', 400, req);
             }
             if (!role || (role !== 'admin' && role !== 'member')) {
                  return createErrorResponse('Invalid role specified. Must be "admin" or "member".', 400, req);
             }

             // 2. Check permissions (Is user an admin of this org? RLS *should* handle this on insert, but an explicit check is safer)
             // Using the helper function (assumes it exists and is callable via RPC or directly if helper available)
             const { data: isAdmin, error: adminCheckError } = await typedSupabase.rpc('is_org_admin', { org_id: orgId }); // Corrected parameter name

             if (adminCheckError || !isAdmin) {
                 console.warn(`[organizations] Permission denied for user ${authenticatedUser.id} to invite to org ${orgId}. Admin check failed or returned false.`);
                 return createErrorResponse("Forbidden: You do not have permission to invite members to this organization.", 403, req);
             }
             
             // 3. Check if user is already member or has pending invite (combine checks)
             const { data: existingMember, error: memberCheckErr } = await typedSupabase
                .from('organization_members')
                .select('user_id, status')
                .eq('organization_id', orgId)
                .eq('profiles!inner(email)', email) // Join profiles to check email
                .in('status', ['active', 'pending'])
                .maybeSingle();

            if (memberCheckErr) console.error("[organizations] Error checking existing member by email:", memberCheckErr); // Log but continue check

            const { data: existingInvite, error: inviteCheckErr } = await typedSupabase
                .from('invites')
                .select('id, status')
                .eq('organization_id', orgId)
                .eq('invited_email', email)
                .eq('status', 'pending')
                .maybeSingle();
                
            if (inviteCheckErr) console.error("[organizations] Error checking existing invite by email:", inviteCheckErr); // Log but continue check

            if (existingMember || existingInvite) {
                console.warn(`[organizations] Attempted to invite existing member/invitee ${email} to org ${orgId}`);
                return createErrorResponse("User is already a member or has a pending invite.", 409, req); // Conflict
            }

             // 4. Generate invite token (simple UUID for now)
             const inviteToken = crypto.randomUUID();

             // 5. Insert invite
             const { data: newInvite, error: insertError } = await typedSupabase
                .from('invites')
                .insert({
                    organization_id: orgId,
                    invited_email: email,
                    role_to_assign: role,
                    invited_by_user_id: authenticatedUser.id,
                    invite_token: inviteToken,
                    status: 'pending'
                })
                .select()
                .single();

            if (insertError) {
                // RLS could also cause insert failure - map 42501 to 403?
                if (insertError.code === '42501') {
                    return createErrorResponse("Forbidden: You do not have permission to invite members to this organization.", 403, req);
                }
                console.error(`[organizations] Error inserting invite for ${email} to org ${orgId}:`, insertError);
                return createErrorResponse(`Failed to create invitation: ${insertError.message}`, 500, req);
            }
            
            if (!newInvite) {
                 console.error(`[organizations] Invite insert for ${email} to org ${orgId} succeeded but returned no data.`);
                return createErrorResponse('Failed to create invitation.', 500, req);
            }
            
            // Trigger notification happens via DB trigger, no extra step needed here.

            // 6. Return new invite details (or just 201/204)
            return createSuccessResponse(newInvite, 201, req);
         }
    }
    // --- Routes for /organizations/:orgId/members/:membershipId ---
    else if (orgId && segment === 'members' && membershipId) {
        // --- Routes for /organizations/:orgId/members/:membershipId/role ---
        if (url.pathname.endsWith('/role') && req.method === 'PUT') {
            console.log(`[organizations] Logic: Handling PUT /organizations/${orgId}/members/${membershipId}/role...`);
            // 1. Validate payload
            const { role } = body || {};
             if (!role || (role !== 'admin' && role !== 'member')) {
                  return createErrorResponse('Invalid role specified. Must be "admin" or "member".', 400, req);
             }
             
            // 2. Attempt update (RLS must check admin status, DB trigger must check last admin)
            const { data: updatedMember, error: updateError, count } = await typedSupabase
                .from('organization_members')
                .update({ role: role })
                .eq('id', membershipId)
                .eq('organization_id', orgId) // Ensure targeting the correct org
                .select('id, role') // Select only relevant fields
                .maybeSingle(); // Use maybeSingle as update might affect 0 rows due to RLS

            if (updateError) {
                // Check for specific DB error from trigger (e.g., last admin check)
                if (updateError.message.includes("last admin")) { // Example check
                    console.warn(`[organizations] Attempted role change for last admin on membership ${membershipId}`);
                    return createErrorResponse(`Conflict: ${updateError.message}`, 409, req);
                }
                 if (updateError.code === '42501') {
                    console.warn(`[organizations] Role update forbidden for user ${authenticatedUser.id} on membership ${membershipId}`);
                    return createErrorResponse("Forbidden: You do not have permission to update member roles.", 403, req);
                }
                console.error(`[organizations] Error updating role for membership ${membershipId}:`, updateError);
                return createErrorResponse(`Failed to update member role: ${updateError.message}`, 500, req);
            }
            
            // If count is 0 and no error, it implies RLS blocked or member not found
            if (count === 0) {
                 console.warn(`[organizations] Role update forbidden or member not found for user ${authenticatedUser.id} on membership ${membershipId}`);
                 return createErrorResponse("Forbidden: You do not have permission to update member roles.", 403, req); // Or 404
            }

            // Return 204 No Content or 200 OK with updated data
            return createSuccessResponse(null, 204, req); // Correct: Use helper for CORS
        }
        
        // --- Routes for /organizations/:orgId/members/:membershipId (DELETE) ---
        if (req.method === 'DELETE') {
             console.log(`[organizations] Logic: Handling DELETE /organizations/${orgId}/members/${membershipId}...`);
             // Attempt delete (RLS must check admin or self, DB trigger must check last admin)
              const { error: deleteError, count } = await typedSupabase
                .from('organization_members')
                .delete()
                .eq('id', membershipId)
                .eq('organization_id', orgId); // Ensure targeting the correct org

              if (deleteError) {
                  // Check for specific DB error from trigger (e.g., last admin check)
                  if (deleteError.message.includes("last admin")) { // Example check
                      console.warn(`[organizations] Attempted removal of last admin membership ${membershipId}`);
                      return createErrorResponse(`Conflict: ${deleteError.message}`, 409, req);
                  }
                   if (deleteError.code === '42501') {
                       console.warn(`[organizations] Member removal forbidden for user ${authenticatedUser.id} on membership ${membershipId}`);
                      return createErrorResponse("Forbidden: You do not have permission to remove this member.", 403, req);
                  }
                  console.error(`[organizations] Error removing membership ${membershipId}:`, deleteError);
                  return createErrorResponse(`Failed to remove member: ${deleteError.message}`, 500, req);
              }
              
               // If count is 0 and no error, it implies RLS blocked or member not found
               if (count === 0) {
                   console.warn(`[organizations] Member removal forbidden or member not found for user ${authenticatedUser.id} on membership ${membershipId}`);
                   return createErrorResponse("Forbidden: You do not have permission to remove this member.", 403, req); // Or 404
               }
               
               return createSuccessResponse(null, 204, req); // Correct: Use helper for CORS
        }
    }

    // Fallback for unhandled methods/paths within the organization scope
    console.warn(`[organizations] Handler: Method ${req.method} not allowed for ${url.pathname}`);
    return createErrorResponse(`Method ${req.method} not allowed for this path`, 405, req);

  } catch (error) {
    console.error('[organizations] Handler: Top-level error:', error);
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