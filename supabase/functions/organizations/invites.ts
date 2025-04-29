import { createErrorResponse, createSuccessResponse } from '../_shared/cors-headers.ts';
import { Database } from '../types_db.ts'; 
import { SupabaseClient, User } from '@supabase/supabase-js'; 
import { createClient } from '@supabase/supabase-js'; 

// --- Define interface for Admin Auth Lookup dependency ---
interface AdminAuthLookup { 
    getUserById: (userId: string) => Promise<{ data: { user: any } | null; error: any | null }>;
}

// --- Default implementation using environment variables --- 
const defaultAdminAuthLookup: AdminAuthLookup = {
    getUserById: async (userId: string) => {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !serviceRoleKey) {
            console.error('[invites.ts Default Admin Lookup] Admin Supabase credentials not found.');
            // Throw a specific error type or message that can be handled upstream if needed
            throw new Error('Server configuration error: Admin credentials missing.');
        }
        // Create temporary admin client ONLY for this lookup
        // NOTE: Consider potential performance impact if called very frequently.
        // Caching the admin client instance might be better in high-load scenarios,
        // but requires careful handling of potential stale state or errors.
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        console.log(`[invites.ts Default Admin Lookup] Looking up user ID: ${userId}`);
        const result = await adminClient.auth.admin.getUserById(userId);
        console.log(`[invites.ts Default Admin Lookup] Result for ${userId}:`, { error: result.error, hasUser: !!result.data?.user });
        return result;
    }
};

// Handler for POST /organizations/:orgId/invites (Create Invite)
export async function handleCreateInvite(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User, 
    orgId: string,
    body: { email?: string; invitedUserId?: string; role: string },
    // --- Inject dependency with default implementation --- 
    adminAuthLookup: AdminAuthLookup = defaultAdminAuthLookup 
): Promise<Response> {
    console.log(`[invites.ts] Handling POST /organizations/${orgId}/invites...`);

    // 1. Validate payload
    const { email, invitedUserId, role } = body || {};
    let targetEmail: string | undefined = email;

    // Check if exactly one identifier is provided
    if ((!email && !invitedUserId) || (email && invitedUserId)) {
        return createErrorResponse('Please provide either an email or a user ID to invite.', 400, req);
    }
    // Validate email format if provided
    if (email && (typeof email !== 'string' || !email.includes('@'))) { 
        return createErrorResponse('Invalid email address provided.', 400, req);
    }
    // Validate userId format if provided
    if (invitedUserId && typeof invitedUserId !== 'string') { 
        return createErrorResponse('Invalid user ID provided.', 400, req);
    }
    // Validate role
    if (!role || (role !== 'admin' && role !== 'member')) {
        return createErrorResponse('Invalid role specified. Must be "admin" or "member".', 400, req);
    }

    // 1b. If invitedUserId is provided, look up the email using injected dependency
    if (invitedUserId) {
        console.log(`[invites.ts] Inviting by user ID: ${invitedUserId}. Looking up email via injected lookup...`);
        try {
            // --- Use the injected dependency --- 
            const { data: invitedUserData, error: lookupError } = await adminAuthLookup.getUserById(invitedUserId);

            if (lookupError) {
                console.error(`[invites.ts] Error looking up user ID ${invitedUserId}:`, lookupError);
                // Handle specific errors like "User not found" vs. general errors
                // Check error structure based on actual Supabase client errors
                if ((lookupError as any)?.status === 404 || lookupError.message?.includes('User not found')) { 
                    return createErrorResponse('Invited user ID not found.', 404, req);
                }
                // Throw a generic error for other issues during lookup
                throw new Error('Failed to look up invited user.'); 
            }

            if (!invitedUserData?.user?.email) {
                 console.error(`[invites.ts] User found for ID ${invitedUserId}, but email is missing.`);
                 return createErrorResponse('Invited user does not have a valid email address.', 400, req);
            }
            
            targetEmail = invitedUserData.user.email;
            console.log(`[invites.ts] Found email for user ID ${invitedUserId}: ${targetEmail}`);
            
        } catch (lookupErr) { // Catch errors from the lookup function itself or the re-throw
            console.error('[invites.ts] Error during admin user lookup process:', lookupErr);
             // Cast lookupErr to Error to access message safely
             const errorMessage = lookupErr instanceof Error ? lookupErr.message : 'Failed to process user ID invitation.';
             // Avoid returning the generic "Failed to look up..." if a more specific one was thrown
             if (errorMessage === 'Failed to look up invited user.' && !(lookupErr instanceof Error && lookupErr.message === errorMessage)) {
                 // If it's the generic error message triggered by a non-404 lookupError, return 500
                 return createErrorResponse('Failed to process user ID invitation.', 500, req);
             }
             // Otherwise, return the specific error message (like config error)
             return createErrorResponse(errorMessage, 500, req); 
        }
    }
    
     if (!targetEmail) { // Should theoretically not happen if validation passed
         console.error('[invites.ts] Target email could not be determined.');
         return createErrorResponse('Failed to determine invitee email.', 500, req);
     }

    // 2. Check permissions (Is user an admin of this org?)
    const { data: isAdmin, error: adminCheckError } = await supabaseClient.rpc('is_org_admin', { org_id: orgId });

    if (adminCheckError || !isAdmin) {
        console.warn(`[invites.ts] Permission denied for user ${user.id} to invite to org ${orgId}. Admin check failed or returned false.`);
        return createErrorResponse("Forbidden: You do not have permission to invite members to this organization.", 403, req);
    }
    
    // 3. Check if user is already member or has pending invite
    const { data: existingMember, error: memberCheckErr } = await supabaseClient
        .from('organization_members')
        .select('user_id, status, profiles!inner(email)') 
        .eq('organization_id', orgId)
        .eq('profiles.email', targetEmail)
        .in('status', ['active', 'pending'])
        .maybeSingle();

    if (memberCheckErr) {
        console.error("[invites.ts] Error checking existing member by email:", memberCheckErr);
        // Decide if this should be a 500 or continue
    }

    const { data: existingInvite, error: inviteCheckErr } = await supabaseClient
        .from('invites')
        .select('id, status')
        .eq('organization_id', orgId)
        .eq('invited_email', targetEmail)
        .eq('status', 'pending')
        .maybeSingle();
        
    if (inviteCheckErr) {
        console.error("[invites.ts] Error checking existing invite by email:", inviteCheckErr);
        // Decide if this should be a 500 or continue
    }

    if (existingMember || existingInvite) {
        console.warn(`[invites.ts] Attempted to invite existing member/invitee ${targetEmail} to org ${orgId}`);
        return createErrorResponse("User is already a member or has a pending invite.", 409, req); // Conflict
    }

    // 4. Generate invite token (delegated to DB via trigger/default)
    // const inviteToken = crypto.randomUUID(); // Not needed if DB handles it

    // 5. Insert invite
    const { data: newInvite, error: insertError } = await supabaseClient
        .from('invites')
        .insert({
            organization_id: orgId,
            invited_email: targetEmail,
            role_to_assign: role,
            invited_by_user_id: user.id,
            invite_token: '', // Add empty string to satisfy type, DB likely generates/overwrites
            status: 'pending'
        })
        .select()
        .single();

    if (insertError) {
        if (insertError.code === '42501') { // RLS violation
            return createErrorResponse("Forbidden: You do not have permission to invite members to this organization.", 403, req);
        }
        // Handle unique constraint violation on invite_token if DB doesn't auto-retry
        // if (insertError.code === '23505') { ... handle collision ... }
        console.error(`[invites.ts] Error inserting invite for ${targetEmail} to org ${orgId}:`, insertError);
        return createErrorResponse(`Failed to create invitation: ${insertError.message}`, 500, req);
    }
    
    if (!newInvite) {
         console.error(`[invites.ts] Invite insert for ${targetEmail} to org ${orgId} succeeded but returned no data.`);
        return createErrorResponse('Failed to create invitation.', 500, req);
    }
    
    // 6. Return new invite details
    return createSuccessResponse(newInvite, 201, req);
}

// --- Invite Action Handlers ---

// Accept an invite
export async function handleAcceptInvite(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User, 
    inviteToken: string,
    _body: any // Body is not used for accept
): Promise<Response> {
    console.log(`[invites.ts] Handling ACCEPT invite for token: ${inviteToken}`);

    // 1. Find invite by token
    const { data: invite, error: findError } = await supabaseClient
        .from('invites')
        .select('id, organization_id, invited_email, role_to_assign, status')
        .eq('invite_token', inviteToken)
        .maybeSingle();

    if (findError) {
        console.error('[invites.ts Accept] Error finding invite:', findError);
        return createErrorResponse('Error processing invite.', 500, req);
    }
    if (!invite) {
        return createErrorResponse('Invite not found or is invalid.', 404, req);
    }
    if (invite.status !== 'pending') {
        return createErrorResponse('Invite is no longer valid (already used or expired).', 410, req); // Gone
    }

    // 2. Validate user email matches invite email
    // Ensure user object has email, might need adjustment if email isn't always present
    if (!user.email || user.email.toLowerCase() !== invite.invited_email.toLowerCase()) { 
        console.warn(`[invites.ts Accept] User ${user.id} (${user.email}) attempted to accept invite for ${invite.invited_email}`);
        return createErrorResponse('Forbidden: You cannot accept this invite.', 403, req);
    }

    // 3. Check if user is already an active/pending member of the org
    const { data: existingMembership, error: memberCheckError } = await supabaseClient
        .from('organization_members')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('organization_id', invite.organization_id)
        .in('status', ['active', 'pending']) // Check for both active and pending join requests
        .maybeSingle();

    if (memberCheckError) {
        console.error('[invites.ts Accept] Error checking existing membership:', memberCheckError);
        return createErrorResponse('Error checking membership status.', 500, req);
    }
    if (existingMembership) {
        console.warn(`[invites.ts Accept] User ${user.id} is already a member (status: ${existingMembership.status}) of org ${invite.organization_id}`);
        return createErrorResponse('Conflict: User is already a member of this organization.', 409, req);
    }

    // 4. If valid, update invite and create membership 
    // Note: Ideally, this would be a DB transaction, but edge functions make that complex.
    // Proceeding sequentially, accepting risk of partial success.

    // 4a. Update invite status to 'accepted'
    const { error: updateInviteError } = await supabaseClient
        .from('invites')
        .update({ status: 'accepted' })
        .eq('id', invite.id);

    if (updateInviteError) {
        console.error('[invites.ts Accept] Error updating invite status:', updateInviteError);
        // Consider potential rollback or compensating action if possible/needed
        return createErrorResponse('Failed to update invite status.', 500, req);
    }

    // 4b. Insert new organization member record
    const { data: newMembership, error: insertMemberError } = await supabaseClient
        .from('organization_members')
        .insert({
            user_id: user.id,
            organization_id: invite.organization_id,
            role: invite.role_to_assign, // Role comes from the invite itself
            status: 'active' // User is immediately active upon accepting invite
        })
        .select('id') // Select the ID of the newly created membership
        .single(); // Expect a single row back

    if (insertMemberError) {
        console.error('[invites.ts Accept] Error inserting new member:', insertMemberError);
        // Consider potential rollback (e.g., setting invite back to pending?)
        return createErrorResponse('Failed to add user to organization.', 500, req);
    }
    
    if (!newMembership || !newMembership.id) {
         console.error('[invites.ts Accept] Membership insert succeeded but returned no ID.');
        return createErrorResponse('Failed to finalize membership.', 500, req);
    }

    console.log(`[invites.ts Accept] User ${user.id} successfully accepted invite ${invite.id} and joined org ${invite.organization_id} with membership ID ${newMembership.id}`);
    // 5. Return success, including organizationId
    return createSuccessResponse(
        { 
            message: "Invite accepted successfully.", 
            membershipId: newMembership.id, 
            organizationId: invite.organization_id // Add orgId here
        }, 
        200, 
        req
    );
}

// Decline an invite
export async function handleDeclineInvite(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User, 
    inviteToken: string,
    _body: any // Body is not used for decline
): Promise<Response> {
    console.log(`[invites.ts] Handling DECLINE invite for token: ${inviteToken}`);

    // 1. Find invite by token
    const { data: invite, error: findError } = await supabaseClient
        .from('invites')
        .select('id, invited_email, status') // Only need ID, email for validation, and status
        .eq('invite_token', inviteToken)
        .maybeSingle();

    if (findError) {
        console.error('[invites.ts Decline] Error finding invite:', findError);
        return createErrorResponse('Error processing invite.', 500, req);
    }
    if (!invite) {
        return createErrorResponse('Invite not found or is invalid.', 404, req);
    }
    if (invite.status !== 'pending') {
        return createErrorResponse('Invite is no longer valid (already used or expired).', 410, req); // Gone
    }

    // 2. Validate user email matches invite email
    if (!user.email || user.email.toLowerCase() !== invite.invited_email.toLowerCase()) {
        console.warn(`[invites.ts Decline] User ${user.id} (${user.email}) attempted to decline invite for ${invite.invited_email}`);
        return createErrorResponse('Forbidden: You cannot decline this invite.', 403, req);
    }

    // 3. If valid, update invite status to 'declined'
    const { error: updateError } = await supabaseClient
        .from('invites')
        .update({ status: 'declined' })
        .eq('id', invite.id);

    if (updateError) {
        console.error('[invites.ts Decline] Error updating invite status:', updateError);
        return createErrorResponse('Failed to decline invite.', 500, req);
    }

    console.log(`[invites.ts Decline] User ${user.id} successfully declined invite ${invite.id}`);
    // 4. Return success (204 No Content is suitable here)
    // Use createSuccessResponse but force status 204 and provide null body
    const res = createSuccessResponse(null, 200, req); // Base response
    return new Response(null, { status: 204, headers: res.headers }); // Override status and body
}

// Cancel/Delete an invite (by Admin)
export async function handleCancelInvite(
    req: Request,
    supabaseClient: SupabaseClient<Database>,
    user: User,
    orgId: string,
    inviteId: string // Get this from the URL path
): Promise<Response> {
    console.log(`[invites.ts] Handling CANCEL invite ${inviteId} for org ${orgId}...`);

    // 1. Check permissions (Is user an admin of this org?)
    const { data: isAdmin, error: adminCheckError } = await supabaseClient.rpc('is_org_admin', { org_id: orgId });
    
    // Explicitly handle RPC error first
    if (adminCheckError) {
        console.error(`[invites.ts Cancel] Error checking admin status for user ${user.id} on org ${orgId}:`, adminCheckError);
        return createErrorResponse("Error checking permissions.", 500, req);
    }
    
    // Then handle the case where the user is not an admin
    if (!isAdmin) {
        console.warn(`[invites.ts Cancel] Permission denied for user ${user.id} to cancel invites in org ${orgId}. Admin check failed or returned false.`);
        return createErrorResponse("Forbidden: You do not have permission to cancel invites for this organization.", 403, req);
    }

    // 2. Delete the invite if it exists, belongs to the org, and is pending
    const { count, error: deleteError } = await supabaseClient
        .from('invites')
        .delete({ count: 'exact' }) // Use 'exact' count to know if a row was deleted
        .eq('id', inviteId)
        .eq('organization_id', orgId)
        .eq('status', 'pending'); // Only delete pending invites

    if (deleteError) {
        if (deleteError.code === '42501') { // RLS violation (shouldn't happen if admin check passes, but good practice)
            return createErrorResponse("Forbidden: You do not have permission to cancel this invite.", 403, req);
        }
        console.error(`[invites.ts Cancel] Error deleting invite ${inviteId} for org ${orgId}:`, deleteError);
        return createErrorResponse(`Failed to cancel invitation: ${deleteError.message}`, 500, req);
    }

    // 3. Check if the delete operation affected any rows
    if (count === 0) {
        // Invite wasn't found, didn't belong to the org, or wasn't pending
        console.warn(`[invites.ts Cancel] Invite ${inviteId} not found or not eligible for cancellation in org ${orgId}.`);
        return createErrorResponse("Invite not found, not pending, or does not belong to this organization.", 404, req);
    }

    // 4. Return success (204 No Content)
    console.log(`[invites.ts Cancel] Invite ${inviteId} successfully cancelled by user ${user.id} in org ${orgId}.`);
    const res = createSuccessResponse(null, 200, req); // Base response
    return new Response(null, { status: 204, headers: res.headers }); // Override status and body
}

// List pending invites and requests for an organization (Admin only)
export async function handleListPending(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User, 
    orgId: string
): Promise<Response> {
    console.log(`[invites.ts] Handling LIST PENDING for org: ${orgId}`);

    // 1. Check permissions (Is user an admin of this org?)
    // Note: Using RPC is slightly less secure if RLS isn't perfect,
    // but simpler than joining organization_members here.
    const { data: isAdmin, error: adminCheckError } = await supabaseClient.rpc('is_org_admin', { org_id: orgId });

    if (adminCheckError) {
        console.error(`[invites.ts List Pending] Error checking admin status for user ${user.id} on org ${orgId}:`, adminCheckError);
        return createErrorResponse("Error checking permissions.", 500, req);
    }
    if (!isAdmin) {
        console.warn(`[invites.ts List Pending] Permission denied for user ${user.id} on org ${orgId}.`);
        return createErrorResponse("Forbidden: You do not have permission to view pending items for this organization.", 403, req);
    }

    // 2. Fetch pending invites
    const { data: pendingInvitesData, error: invitesError } = await supabaseClient
        .from('invites')
        .select(`
            id,
            invited_email,
            role_to_assign,
            status,
            created_at,
            invited_by_user_id,
            profiles:invited_by_user_id ( full_name, avatar_url ) 
        `)
        .eq('organization_id', orgId)
        .eq('status', 'pending');

    if (invitesError) {
        console.error(`[invites.ts List Pending] Error fetching pending invites for org ${orgId}:`, invitesError);
        return createErrorResponse("Error fetching pending invites.", 500, req);
    }

    // 3. Fetch pending member requests (members with status='pending')
    const { data: pendingRequestsData, error: requestsError } = await supabaseClient
        .from('organization_members')
        .select(`
            id, 
            user_id, 
            role, 
            status,
            created_at,
            profiles ( full_name, avatar_url, email )
        `)
        .eq('organization_id', orgId)
        .eq('status', 'pending');

    if (requestsError) {
        console.error(`[invites.ts List Pending] Error fetching pending requests for org ${orgId}:`, requestsError);
        return createErrorResponse("Error fetching pending requests.", 500, req);
    }

    // Ensure we return arrays even if data is null
    const pendingInvites = pendingInvitesData || [];
    const pendingRequests = pendingRequestsData || [];

    console.log(`[invites.ts List Pending] Found ${pendingInvites.length} invites and ${pendingRequests.length} requests for org ${orgId}.`);
    return createSuccessResponse({ pendingInvites, pendingRequests }, 200, req);
}

// TODO: Implement handleCancelInvite (for admins)
// export async function handleCancelInvite(...) { ... } 