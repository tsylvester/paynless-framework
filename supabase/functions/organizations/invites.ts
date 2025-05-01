import { createErrorResponse, createSuccessResponse } from '../_shared/cors-headers.ts';
import { Database } from '../types_db.ts'; 
import { SupabaseClient, User, createClient } from 'npm:@supabase/supabase-js@^2.43.4'; 

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

// Helper function to lookup user by email using Service Role
// Returns { user: { id: string, email: string } | null, error: any | null }
async function getUserByEmailServiceRole(email: string): Promise<{ data: { user: { id: string; email: string; } | null }; error: any | null }> {
    console.log(`[invites.ts getUserByEmailServiceRole] Looking up email: ${email}`);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
        console.error('[invites.ts getUserByEmailServiceRole] Admin Supabase credentials not found.');
        return { data: { user: null }, error: new Error('Server configuration error: Admin credentials missing.') };
    }
    try {
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        // Fetch the first user. We can't directly filter by email in the listUsers call param in v2.
        // We need to fetch and then check the result.
        // WARNING: This is inefficient if you have many users. Consider a DB function for production.
        const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({ 
            page: 1, 
            perPage: 1000 // Fetch a larger batch to increase chance of finding email if not first
            // No direct email filter here
        });

        if (listError) {
             console.error(`[invites.ts getUserByEmailServiceRole] Error listing users:`, listError);
             return { data: { user: null }, error: listError };
        }
        
        // Manually filter the results for the email
        const existingUser = listData.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

        if (existingUser) {
            console.log(`[invites.ts getUserByEmailServiceRole] Found user ID: ${existingUser.id} for email: ${email}`);
            // Ensure the returned user object has id and email
            return { data: { user: { id: existingUser.id, email: existingUser.email ?? email } }, error: null }; 
        } else {
            console.log(`[invites.ts getUserByEmailServiceRole] No user found for email: ${email}`);
            return { data: { user: null }, error: null }; // No user found is not an error in this context
        }
    } catch (catchError) {
         console.error(`[invites.ts getUserByEmailServiceRole] Caught exception looking up email ${email}:`, catchError);
         return { data: { user: null }, error: catchError instanceof Error ? catchError : new Error(String(catchError)) };
    }
}

// Handler for POST /organizations/:orgId/invites (Create Invite - Unified Flow)
export async function handleCreateInvite(
    req: Request, 
    supabaseClient: SupabaseClient<Database>, // Inviting user's client
    invitingUser: User, 
    orgId: string,
    body: { email: string; role: string } // Only email and role expected
    // adminAuthLookup is no longer needed here, we use getUserByEmailServiceRole
): Promise<Response> {
    console.log(`[invites.ts handleCreateInvite] Handling POST /organizations/${orgId}/invites...`);

    // 1. Validate payload
    const { email, role } = body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) { 
        return createErrorResponse('Valid email address is required.', 400, req);
    }
    if (!role || (role !== 'admin' && role !== 'member')) {
        return createErrorResponse('Invalid role specified. Must be "admin" or "member".', 400, req);
    }

    // 2. Check inviter permissions (Is user an admin of this org?)
    // Use the client passed in (which belongs to the invoking user)
    const { data: isAdmin, error: adminCheckError } = await supabaseClient.rpc('is_org_admin', { org_id: orgId });

    if (adminCheckError) {
        console.error(`[invites.ts handleCreateInvite] Error checking admin status for user ${invitingUser.id}:`, adminCheckError);
        return createErrorResponse('Error checking permissions.', 500, req);
    }
    if (!isAdmin) {
        console.warn(`[invites.ts handleCreateInvite] Permission denied for user ${invitingUser.id} to invite to org ${orgId}.`);
        return createErrorResponse("Forbidden: You do not have permission to invite members to this organization.", 403, req);
    }
    
    // 3. Check if target user exists using Service Role
    let targetUserId: string | null = null;
    const { data: targetUserData, error: lookupError } = await getUserByEmailServiceRole(email);

    if (lookupError) {
        // Handle specific errors like config error vs. Supabase API error
        const errorMessage = lookupError.message?.includes('Server configuration error') 
                           ? lookupError.message 
                           : 'Failed to look up user information.';
        console.error(`[invites.ts handleCreateInvite] Error during service role lookup for email ${email}:`, lookupError);                 
        return createErrorResponse(errorMessage, 500, req); // Return 500 for lookup issues
    }

    if (targetUserData?.user) {
        targetUserId = targetUserData.user.id;
        console.log(`[invites.ts handleCreateInvite] User ${targetUserId} exists for email ${email}.`);
    } else {
        console.log(`[invites.ts handleCreateInvite] User with email ${email} does not exist yet.`);
    }

    // 4. Perform Conflict Checks (using inviter's client / RLS context)
    
    // 4a. Check for existing PENDING invites for this email OR user ID
    const inviteCheckQuery = supabaseClient
        .from('invites')
        .select('id')
        .eq('organization_id', orgId)
        .eq('status', 'pending');
        
    if (targetUserId) {
        // If user exists, check primarily by user ID, but also email just in case
         inviteCheckQuery.or(`invited_user_id.eq.${targetUserId},invited_email.eq.${email}`);
    } else {
        // If user doesn't exist, only check by email
         inviteCheckQuery.eq('invited_email', email);
    }

    const { data: existingInvite, error: inviteCheckErr } = await inviteCheckQuery.maybeSingle();
        
    if (inviteCheckErr) {
        console.error("[invites.ts handleCreateInvite] Error checking existing invite:", inviteCheckErr);
        return createErrorResponse("Server error checking existing invites.", 500, req);
    }
    if (existingInvite) { 
        console.warn(`[invites.ts handleCreateInvite] Attempted to invite user ${email} (ID: ${targetUserId ?? 'N/A'}) who already has a pending invite to org ${orgId}`);
        return createErrorResponse("User already has a pending invitation for this organization.", 409, req); // Conflict
    }

    // 4b. Check for existing ACTIVE/PENDING membership (using email OR user ID)
    // TODO: Update or replace 'check_existing_member_by_email' RPC 
    //       to accept either email or user_id, or perform the check here.
    // TEMPORARY: Using existing email-based check. Need to enhance this.
    if (targetUserId) {
        // If we have a user ID, check membership directly by ID
        console.log(`[invites.ts handleCreateInvite] Checking membership for existing user ID: ${targetUserId}`);
        const { data: existingMember, error: memberCheckError } = await supabaseClient
            .from('organization_members')
            .select('status') // Only need status to know if they exist
            .eq('user_id', targetUserId)
            .eq('organization_id', orgId)
            .in('status', ['active', 'pending']) // Check for active or pending join requests
            .maybeSingle(); // Expect 0 or 1

        if (memberCheckError) {
            console.error(`[invites.ts handleCreateInvite] Error checking membership by ID for user ${targetUserId}:`, memberCheckError);
            return createErrorResponse("Server error checking existing membership.", 500, req);
        }

        if (existingMember) {
            console.warn(`[invites.ts handleCreateInvite] User ${targetUserId} (${email}) is already a member/pending (status: ${existingMember.status}) of org ${orgId}`);
            return createErrorResponse(`User is already ${existingMember.status} in this organization.`, 409, req);
        }
        // If no membership found by ID, proceed to create invite

    } else {
         // If no user ID (new user), check membership by email using the RPC
         console.log(`[invites.ts handleCreateInvite] Checking membership for new user via email: ${email}`);
         const { data: memberStatusEmail, error: rpcErrorEmail } = await supabaseClient.rpc(
            'check_existing_member_by_email', { target_org_id: orgId, target_email: email }
         );
         if (rpcErrorEmail) {
            console.error("[invites.ts handleCreateInvite] RPC error checking member by email:", rpcErrorEmail);
            return createErrorResponse("Server error checking existing members.", 500, req);
         }
         if (memberStatusEmail && memberStatusEmail.length > 0) {
             const status = memberStatusEmail[0].membership_status;
              console.warn(`[invites.ts handleCreateInvite] Email ${email} already associated with member/pending (status: ${status})`);
             return createErrorResponse(`Email already associated with a ${status} member/request.`, 409, req);
         }
         // If no membership found by email, proceed to create invite
    }

    // 5. Generate invite token
    const inviteToken = crypto.randomUUID(); 

    // 6. Insert invite (using inviter's client)
    const { data: newInvite, error: insertError } = await supabaseClient
        .from('invites')
        .insert({
            organization_id: orgId,
            invited_email: email,
            invited_user_id: targetUserId, // Will be null if user doesn't exist yet
            role_to_assign: role,
            invited_by_user_id: invitingUser.id,
            invite_token: inviteToken, 
            status: 'pending'
        })
        .select()
        .single();

    if (insertError) {
        console.error(`[invites.ts handleCreateInvite] Error inserting invite for ${email} to org ${orgId}:`, JSON.stringify(insertError, null, 2));
        if (insertError.code === '42501') { // RLS violation
            return createErrorResponse("Forbidden: You do not have permission to invite members to this organization.", 403, req);
        }
        // Handle other specific DB errors if needed
        return createErrorResponse(`Failed to create invitation: ${insertError.message}`, 500, req);
    }
    
    if (!newInvite) {
         console.error(`[invites.ts handleCreateInvite] Invite insert for ${email} to org ${orgId} succeeded but returned no data.`);
        return createErrorResponse('Failed to create invitation.', 500, req);
    }
    
    // 7. Return new invite details (Trigger handles notifications)
    console.log(`[invites.ts handleCreateInvite] Successfully created invite ${newInvite.id} for email ${email}`);
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

    // Pre-Update Check: Log emails for comparison
    console.log(`[invites.ts Accept] PRE-UPDATE CHECK - User Email: ${user.email}, Invite Email: ${invite.invited_email}, Invite ID: ${invite.id}, Current Status: ${invite.status}`);

    // 4a. Update invite status to 'accepted'
    console.log(`[invites.ts Accept] Attempting to update invite ID: ${invite.id} to status 'accepted' using service role.`);
    let membershipId: string | null = null;
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !serviceRoleKey) {
            console.error('[invites.ts Accept] Service role credentials missing for status update.');
            // Throw an error that will be caught below
            throw new Error('Server configuration error: Service role key not found.');
        }
        const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);

        // 4a. Update invite status to 'accepted'
        const { error: updateError } = await adminClient
            .from('invites')
            .update({ status: 'accepted' })
            .eq('id', invite.id); // Service role bypasses RLS
        
        if (updateError) {
            // Throw error to be caught by the outer catch block
            console.error('[invites.ts Accept] Error updating invite status using service role:', updateError);
            throw new Error('Failed to update invite status.');
        }

        // 4b. Insert new organization member record
        console.log(`[invites.ts Accept] Invite status updated. Inserting member using service role client.`);
        const { data: newMembership, error: insertError } = await adminClient // Still using adminClient
            .from('organization_members')
            .insert({
                user_id: user.id,
                organization_id: invite.organization_id,
                role: invite.role_to_assign, // Role comes from the invite itself
                status: 'active' // User is immediately active upon accepting invite
            })
            .select('id') // Select the ID of the newly created membership
            .single(); // Expect a single row back

        if (insertError) {
             // Throw error to be caught by the outer catch block
            console.error('[invites.ts Accept] Error inserting new member using service role:', insertError);
            throw new Error('Failed to add user to organization.');
        }

        if (!newMembership || !newMembership.id) {
             console.error('[invites.ts Accept] Membership insert (service role) succeeded but returned no ID.');
            throw new Error('Failed to finalize membership.');
        }
        
        // If both operations succeeded, log and prepare success response data
        console.log(`[invites.ts Accept] User ${user.id} successfully accepted invite ${invite.id} and joined org ${invite.organization_id} with membership ID ${newMembership.id}`);
        
        // Store necessary data for success response outside the try block
        membershipId = newMembership.id;
        // organizationId is already available from the initial `invite` fetch
        
    } catch (serviceOperationError) {
        console.error('[invites.ts Accept] Exception during service role operation (update or insert):', serviceOperationError);
        // Determine the message based on the caught error
        const message = serviceOperationError instanceof Error 
                        ? (serviceOperationError.message.includes('Server configuration error') 
                            ? 'Internal server error processing invite.' 
                            : serviceOperationError.message) // Use specific error message if available
                        : 'Internal server error during invite acceptance.'; // Generic fallback
        return createErrorResponse(message, 500, req);
    }

    // 5. Return success, including organizationId and membershipId
    // Ensure membershipId was set
    if (!membershipId) {
        // Should not happen if catch block logic is correct, but safeguard
        console.error('[invites.ts Accept] Critical error: Membership ID not set after successful service operations.');
        return createErrorResponse('Internal server error finalizing acceptance.', 500, req);
    }
    
    return createSuccessResponse(
        { 
            message: "Invite accepted successfully.", 
            membershipId: membershipId, // Use the variable set in the try block
            organizationId: invite.organization_id 
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

    // 2. Fetch pending invites (from invites where status = 'pending')
    const { data: invites, error: invitesError } = await supabaseClient
        .from('invites')
        // --- Select inviter profile details --- 
        .select(`
            *,
            invited_by_profile:user_profiles!invites_invited_by_user_id_fkey ( first_name, last_name )
        `)
        // --- End Select --- 
        .eq('organization_id', orgId)
        .eq('status', 'pending');

    if (invitesError) {
        console.error(`[invites.ts List Pending] Error fetching pending invites for org ${orgId}:`, invitesError);
        return createErrorResponse("Error fetching pending invites.", 500, req);
    }

    // +++ ADD DEFAULTING FOR INVITES +++
    const invitesData = invites || []; 
    // +++++++++++++++++++++++++++++++++++

    // 3. Fetch pending join requests (from the new view)
    const { data: pendingRequests, error: requestsError } = await supabaseClient
        .from('v_pending_membership_requests') // <<< Use the VIEW name
        .select(` 
            id, 
            user_id, 
            organization_id, 
            status, 
            created_at,
            role, 
            first_name, 
            last_name,
            user_email
        `) // <<< Select columns from the VIEW
        .eq('organization_id', orgId);
        // No need for .eq('status', 'pending_approval') as the VIEW is already filtered

    if (requestsError) {
        console.error(`[invites.ts List Pending] Error fetching pending requests for org ${orgId}:`, requestsError);
        return createErrorResponse("Error fetching pending requests.", 500, req);
    }

    // Ensure we return arrays even if data is null
    const pendingRequestsData = pendingRequests || [];

    // +++ USE THE DEFAULTED VARIABLE and CORRECT KEY NAME +++
    console.log(`[invites.ts List Pending] Found ${invitesData.length} invites and ${pendingRequestsData.length} requests for org ${orgId}.`);
    return createSuccessResponse({ invites: invitesData, pendingRequests: pendingRequestsData }, 200, req); // Changed invites key to invitesData
    // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++
}

// --- New Handler: Get Invite Details (for AcceptInvitePage) ---
export async function handleGetInviteDetails(
    req: Request,
    supabaseClient: SupabaseClient<Database>, // User's client
    user: User, // User is REQUIRED for authenticated endpoint access logic
    inviteToken: string
): Promise<Response> {
    console.log(`[invites.ts] Handling GET invite details for token: ${inviteToken}`);
    if (user) {
      console.log(`[invites.ts Get Details] Request by authenticated user: ${user.id}`);
    } else {
      // Should not happen due to index.ts auth check, but defensive coding
      console.error(`[invites.ts Get Details] Critical Error: Handler called without authenticated user.`);
      return createErrorResponse('Authentication required', 401, req);
    }

    // 1. Find the invite using the USER'S client (respects RLS on invites table)
    const { data: invite, error: findInviteError } = await supabaseClient
        .from('invites')
        .select('id, invited_email, role_to_assign, status, organization_id') // Select required fields, NO JOIN yet
        .eq('invite_token', inviteToken)
        .maybeSingle();

    if (findInviteError) {
        console.error('[invites.ts Get Details] Error finding invite:', findInviteError);
        return createErrorResponse('Error processing invite details.', 500, req);
    }

    if (!invite) {
        console.warn(`[invites.ts Get Details] Invite token not found: ${inviteToken}`);
        return createErrorResponse('Invite not found or is invalid.', 404, req);
    }
    
    // Optional: Check if invite is still pending 
    if (invite.status !== 'pending') {
        console.warn(`[invites.ts Get Details] Invite token ${inviteToken} is no longer pending (status: ${invite.status}).`);
        return createErrorResponse('Invite is no longer valid.', 410, req); // 410 Gone
    }
    
    // Optional: Verify the authenticated user is the one invited (extra security layer)
    if (user.email?.toLowerCase() !== invite.invited_email.toLowerCase()) {
        console.warn(`[invites.ts Get Details] Auth user ${user.email} does not match invited email ${invite.invited_email} for token ${inviteToken}`);
        // Return 404 to avoid revealing invite existence to wrong user
        return createErrorResponse('Invite not found or is invalid.', 404, req); 
    }

    // 2. Fetch Organization Name using SERVICE ROLE client (bypasses RLS on organizations table)
    let organizationName: string | null = null;
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !serviceRoleKey) {
            console.error('[invites.ts Get Details] Service role credentials missing.');
            throw new Error('Server configuration error.'); // Throw internal error
        }
        // Create temporary admin client ONLY for this lookup
        const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);
        
        const { data: orgData, error: orgError } = await adminClient
            .from('organizations')
            .select('name')
            .eq('id', invite.organization_id)
            .single(); // Use single() as org ID must exist
            
        if (orgError) {
            console.error(`[invites.ts Get Details] Error fetching org name (ID: ${invite.organization_id}) with service role:`, orgError);
            // Throw internal error, don't expose DB details
            throw new Error('Failed to retrieve organization information.'); 
        }
        if (!orgData) {
             console.error(`[invites.ts Get Details] Organization not found with service role (ID: ${invite.organization_id}). Data integrity issue?`);
             throw new Error('Could not find associated organization.');
        }
        
        organizationName = orgData.name;
        console.log(`[invites.ts Get Details] Successfully fetched org name "${organizationName}" using service role.`);

    } catch (serviceError) {
        console.error('[invites.ts Get Details] Error during service role operation:', serviceError);
        // Return a generic 500 error to the client
        const message = serviceError instanceof Error ? serviceError.message : 'Internal server error retrieving organization details.';
        // Avoid leaking specifics like "Server configuration error"
        const safeMessage = message.includes('Server configuration error') ? 'Internal server error.' : message;
        return createErrorResponse(safeMessage, 500, req);
    }
    
    // If we get here, orgName should be populated
    if (!organizationName) {
        // This case should be caught by errors above, but as a safeguard:
        console.error(`[invites.ts Get Details] Failed to resolve organization name for org ID ${invite.organization_id}`);
        return createErrorResponse('Internal server error resolving organization.', 500, req);
    }

    // 3. Return the necessary details
    const responsePayload = {
        // Include details needed by frontend, excluding sensitive ones like invite token unless needed
        // id: invite.id, // Probably not needed by frontend page
        invitedEmail: invite.invited_email,
        roleToAssign: invite.role_to_assign,
        status: invite.status,
        organizationId: invite.organization_id,
        organizationName: organizationName, // Fetched via service role
    };

    console.log(`[invites.ts Get Details] Successfully fetched details for invite token ${inviteToken}:`, responsePayload);
    return createSuccessResponse(responsePayload, 200, req);
}

// TODO: Implement handleCancelInvite (for admins)
// export async function handleCancelInvite(...) { ... } 