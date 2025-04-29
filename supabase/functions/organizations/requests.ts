import { createErrorResponse, createSuccessResponse } from '../_shared/cors-headers.ts';
import { Database } from '../types_db.ts';
import { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2.43.4';

// Handler for POST /organizations/:orgId/requests (Create Join Request)
export async function handleCreateJoinRequest(
    req: Request,
    supabaseClient: SupabaseClient<Database>,
    user: User,
    orgId: string,
    _body: any // Body is not expected for a join request
): Promise<Response> {
    console.log(`[requests.ts] Handling POST /organizations/${orgId}/requests by user ${user.id}...`);

    // 1. Check if organization exists and is public/accepting requests (if applicable)
    //    For now, we assume RLS handles if the org exists and is visible.
    //    A check for a specific 'allow_requests' flag could be added later.
    // const { data: orgData, error: orgError } = await supabaseClient
    //     .from('organizations')
    //     .select('id, visibility') // Add 'allow_requests' if implemented
    //     .eq('id', orgId)
    //     .eq('deleted_at', null) // Ensure not deleted
    //     .maybeSingle();
    // if (orgError || !orgData) { ... handle error or not found ... }
    // if (orgData.visibility !== 'public' && !orgData.allow_requests) {
    //     return createErrorResponse("This organization is not accepting join requests.", 403, req);
    // }

    // 2. Check if user is already a member or has a pending request
    const { data: existingMembership, error: memberCheckError } = await supabaseClient
        .from('organization_members')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('organization_id', orgId)
        .in('status', ['active', 'pending'])
        .maybeSingle();

    if (memberCheckError) {
        console.error(`[requests.ts Create] Error checking existing membership for user ${user.id} in org ${orgId}:`, memberCheckError);
        return createErrorResponse("Error checking membership status.", 500, req);
    }
    if (existingMembership) {
        if (existingMembership.status === 'active') {
            return createErrorResponse("You are already a member of this organization.", 409, req); // Conflict
        } else { // status === 'pending'
            return createErrorResponse("You already have a pending request to join this organization.", 409, req); // Conflict
        }
    }

    // 3. Create the membership request (insert with status 'pending')
    const { data: newRequest, error: insertError } = await supabaseClient
        .from('organization_members')
        .insert({
            user_id: user.id,
            organization_id: orgId,
            role: 'member', // Default role for join requests
            status: 'pending'
        })
        .select('id, created_at, status') // Return some info about the request
        .single();

    if (insertError) {
        // RLS could block insertion if the user doesn't have SELECT access on the org? Check RLS.
        if (insertError.code === '42501') {
             console.warn(`[requests.ts Create] RLS prevented user ${user.id} from creating join request for org ${orgId}`);
             // This might indicate the org doesn't exist or user can't see it.
             return createErrorResponse("Cannot request to join this organization.", 404, req); // Or 403?
        }
        console.error(`[requests.ts Create] Error inserting join request for user ${user.id} to org ${orgId}:`, insertError);
        return createErrorResponse(`Failed to create join request: ${insertError.message}`, 500, req);
    }

    if (!newRequest) {
        console.error(`[requests.ts Create] Join request insert for user ${user.id} to org ${orgId} succeeded but returned no data.`);
        return createErrorResponse('Failed to create join request.', 500, req);
    }

    console.log(`[requests.ts Create] User ${user.id} successfully requested to join org ${orgId}. Request ID: ${newRequest.id}`);
    // 4. Return success (201 Created)
    return createSuccessResponse(newRequest, 201, req);
}


// Handler for PUT /organizations/members/:membershipId/status (Approve/Deny Join Request)
export async function handleUpdateRequestStatus(
    req: Request,
    supabaseClient: SupabaseClient<Database>,
    user: User,
    membershipId: string,
    body: { status: 'active' | 'removed' } // Expect 'active' to approve, 'removed' to deny/remove
): Promise<Response> {
    console.log(`[requests.ts] Handling PUT /organizations/members/${membershipId}/status by user ${user.id}...`);

    const newStatus = body?.status;

    // 1. Validate payload
    if (!newStatus || (newStatus !== 'active' && newStatus !== 'removed')) {
        return createErrorResponse('Invalid status provided. Must be "active" or "removed".', 400, req);
    }

    // 2. Get the organization ID associated with the membershipId
    //    And verify the requesting user is an admin of THAT organization.
    //    This is crucial to prevent admins of one org from managing members of another.
    const { data: membership, error: fetchError } = await supabaseClient
        .from('organization_members')
        .select('organization_id, user_id, status, role') // Select role to check if denying last admin
        .eq('id', membershipId)
        .maybeSingle();

    if (fetchError) {
        console.error(`[requests.ts UpdateStatus] Error fetching membership ${membershipId}:`, fetchError);
        return createErrorResponse("Error retrieving membership details.", 500, req);
    }
    if (!membership) {
        return createErrorResponse("Membership record not found.", 404, req);
    }

    const targetOrgId = membership.organization_id;

    // 3. Check permissions: Is the current user an admin of the target organization?
    const { data: isAdmin, error: adminCheckError } = await supabaseClient.rpc('is_org_admin', { org_id: targetOrgId });

    if (adminCheckError) {
         console.error(`[requests.ts UpdateStatus] Error checking admin status for user ${user.id} on org ${targetOrgId}:`, adminCheckError);
        return createErrorResponse("Error checking permissions.", 500, req);
    }
    if (!isAdmin) {
        console.warn(`[requests.ts UpdateStatus] Permission denied for user ${user.id} to manage membership ${membershipId} in org ${targetOrgId}.`);
        return createErrorResponse("Forbidden: You do not have permission to manage members in this organization.", 403, req);
    }

    // 4. Validate current status (can only approve 'pending', can only deny 'pending'?)
    //    Or should deny work on 'active' members too (effectively removing them)?
    //    Let's assume for now we only approve/deny 'pending' requests via this endpoint.
    //    Removing active members might be DELETE /organizations/:orgId/members/:membershipId
    if (membership.status !== 'pending') {
         return createErrorResponse(`Cannot ${newStatus === 'active' ? 'approve' : 'deny'} a request that is not pending (current status: ${membership.status}).`, 409, req); // Conflict
    }

    // 5. Perform Update (or Delete for 'removed' status?)
    // Option A: Update status to 'active' or 'removed'
    const { data: updatedMembership, error: updateError } = await supabaseClient
        .from('organization_members')
        .update({ status: newStatus })
        .eq('id', membershipId)
        .select('id, status') // Return updated status
        .single();

    // Option B: Delete if status is 'removed'
    // if (newStatus === 'removed') {
    //     const { error: deleteError } = await supabaseClient
    //         .from('organization_members')
    //         .delete()
    //         .eq('id', membershipId);
    //     if (deleteError) { /* handle error */ }
    //     // Return 204 No Content if delete successful
    // } else { // status === 'active'
    //     const { data: updatedMembership, error: updateError } = await supabaseClient
    //         .from('organization_members')
    //         .update({ status: newStatus })
    //         .eq('id', membershipId)
    //         .select('id, status')
    //         .single();
    //      if (updateError) { /* handle error */ }
    //      if (!updatedMembership) { /* handle error */ }
    //      return createSuccessResponse(updatedMembership, 200, req);
    // }

    if (updateError) {
        // Check for trigger violations (e.g., last admin check if removing an admin - though we blocked non-pending)
        if (updateError.message.includes('violates constraint') || updateError.message.includes('violates policy')) { // Adjust based on actual trigger error messages
             console.warn(`[requests.ts UpdateStatus] Update failed for membership ${membershipId} due to constraint/policy: ${updateError.message}`);
             // Could be last admin rule, or other DB constraint
             return createErrorResponse(`Failed to update status: ${updateError.message}`, 409, req); // Conflict
         }
        console.error(`[requests.ts UpdateStatus] Error updating membership ${membershipId} status to ${newStatus}:`, updateError);
        return createErrorResponse(`Failed to update membership status: ${updateError.message}`, 500, req);
    }

    if (!updatedMembership && newStatus === 'active') { // If we expect data back for 'active' status
         console.error(`[requests.ts UpdateStatus] Membership update for ${membershipId} to 'active' succeeded but returned no data.`);
        return createErrorResponse('Failed to confirm membership update.', 500, req);
    }

    console.log(`[requests.ts UpdateStatus] Membership ${membershipId} status successfully updated to ${newStatus} by user ${user.id}.`);
    // 6. Return success
    // For 'removed', 204 No Content might be better than returning the object.
     if (newStatus === 'removed') {
        const res = createSuccessResponse(null, 200, req); // Base response
        return new Response(null, { status: 204, headers: res.headers }); // Override status and body
     } else {
        return createSuccessResponse(updatedMembership, 200, req);
     }
} 