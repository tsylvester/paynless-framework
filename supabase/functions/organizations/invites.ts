import { createErrorResponse, createSuccessResponse } from '../_shared/cors-headers.ts';
import { Database } from '../types_db.ts'; 
import { SupabaseClient, User } from '@supabase/supabase-js'; 

// Handler for POST /organizations/:orgId/invites (Create Invite)
export async function handleCreateInvite(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User, 
    orgId: string,
    body: any
): Promise<Response> {
    console.log(`[invites.ts] Handling POST /organizations/${orgId}/invites...`);

    // 1. Validate payload
    const { email, role } = body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) { 
        return createErrorResponse('Invalid email address provided.', 400, req);
    }
    if (!role || (role !== 'admin' && role !== 'member')) {
        return createErrorResponse('Invalid role specified. Must be "admin" or "member".', 400, req);
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
        .eq('profiles.email', email) 
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
        .eq('invited_email', email)
        .eq('status', 'pending')
        .maybeSingle();
        
    if (inviteCheckErr) {
        console.error("[invites.ts] Error checking existing invite by email:", inviteCheckErr);
        // Decide if this should be a 500 or continue
    }

    if (existingMember || existingInvite) {
        console.warn(`[invites.ts] Attempted to invite existing member/invitee ${email} to org ${orgId}`);
        return createErrorResponse("User is already a member or has a pending invite.", 409, req); // Conflict
    }

    // 4. Generate invite token (delegated to DB via trigger/default)
    // const inviteToken = crypto.randomUUID(); // Not needed if DB handles it

    // 5. Insert invite
    const { data: newInvite, error: insertError } = await supabaseClient
        .from('invites')
        .insert({
            organization_id: orgId,
            invited_email: email,
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
        console.error(`[invites.ts] Error inserting invite for ${email} to org ${orgId}:`, insertError);
        return createErrorResponse(`Failed to create invitation: ${insertError.message}`, 500, req);
    }
    
    if (!newInvite) {
         console.error(`[invites.ts] Invite insert for ${email} to org ${orgId} succeeded but returned no data.`);
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
    // 5. Return success
    return createSuccessResponse({ message: "Invite accepted successfully.", membershipId: newMembership.id }, 200, req);
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