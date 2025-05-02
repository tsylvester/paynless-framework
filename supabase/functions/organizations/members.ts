import { createErrorResponse, createSuccessResponse } from '../_shared/cors-headers.ts';
import { Database } from '../types_db.ts'; 
import { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2.43.4'; 

// Handler for GET /organizations/:orgId/members (List Members)
export async function handleListMembers(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User, 
    orgId: string
): Promise<Response> {
    console.log(`[members.ts] Handling GET /organizations/${orgId}/members (list)...`);

    // 1. Extract Pagination Params
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10'); // Default limit 10
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    console.log(`[members.ts] Pagination: page=${page}, limit=${limit}, from=${from}, to=${to}`);

    // 2. RLS on organization_members should ensure user is part of the org
    // Preliminary check if user is an active member to return 403 if not
    const { count: memberCheckCount, error: checkError } = await supabaseClient
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('user_id', user.id)
        .eq('status', 'active');
        
    if (checkError){ 
        console.error(`[members.ts] Error checking membership for org ${orgId}:`, checkError);
        return createErrorResponse('Failed to verify membership.', 500, req); 
    }

    if (memberCheckCount === 0) { 
        console.warn(`[members.ts] User ${user.id} forbidden to view members for org ${orgId}`);
        return createErrorResponse("Forbidden: You do not have permission to view members of this organization.", 403, req);
    }
    
    // 3. Fetch paginated members with profile details and total count
    const { data: members, error: membersError, count: totalCount } = await supabaseClient
        .from('organization_members')
        .select(`
            id, 
            user_id, 
            role, 
            status,
            created_at,
            user_profiles ( first_name, last_name )
        `, { count: 'exact' })
        .eq('organization_id', orgId)
        .range(from, to);

    if (membersError) {
        console.error(`[members.ts] Error fetching members for org ${orgId}:`, membersError);
        return createErrorResponse('Failed to retrieve members.', 500, req);
    }

    // 4. Structure and return paginated response
    const responsePayload = {
        members: members || [],
        totalCount: totalCount || 0,
    };
    return createSuccessResponse(responsePayload, 200, req);
}

// Handler for PUT /organizations/:orgId/members/:membershipId/role (Update Role)
export async function handleUpdateMemberRole(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User, 
    orgId: string,
    membershipId: string,
    body: any
): Promise<Response> {
     console.log(`[members.ts] Handling PUT /organizations/${orgId}/members/${membershipId}/role...`);
     
     // 1. Validate payload
     const { role } = body || {};
     if (!role || (role !== 'admin' && role !== 'member')) {
          return createErrorResponse('Invalid role specified. Must be "admin" or "member".', 400, req);
     }
     
    // 2. Attempt update (RLS must check admin status, DB trigger must check last admin)
    const { data: updatedMember, error: updateError } = await supabaseClient
        .from('organization_members')
        .update({ role: role })
        .eq('id', membershipId)
        .eq('organization_id', orgId) 
        .select('id, role')
        .maybeSingle(); 

    if (updateError) {
        if (updateError.message.includes("last admin")) { 
            console.warn(`[members.ts] Attempted role change for last admin on membership ${membershipId}`);
            return createErrorResponse(`Conflict: ${updateError.message}`, 409, req);
        }
         if (updateError.code === '42501') {
            console.warn(`[members.ts] Role update forbidden for user ${user.id} on membership ${membershipId}`);
            return createErrorResponse("Forbidden: You do not have permission to update member roles.", 403, req);
        }
        console.error(`[members.ts] Error updating role for membership ${membershipId}:`, updateError);
        return createErrorResponse(`Failed to update member role: ${updateError.message}`, 500, req);
    }
    
    if (!updatedMember) { 
        const { data: memberExists, error: checkError } = await supabaseClient
            .from('organization_members')
            .select('id', { count: 'exact', head: true })
            .eq('id', membershipId)
            .eq('organization_id', orgId);
            
        if (checkError || !memberExists) {
             console.warn(`[members.ts] Role update failed: Membership ${membershipId} not found in org ${orgId}.`);
             return createErrorResponse("Membership not found.", 404, req); 
        } else {
            console.warn(`[members.ts] Role update forbidden (likely RLS) for user ${user.id} on membership ${membershipId}`);
            return createErrorResponse("Forbidden: You do not have permission to update member roles.", 403, req);
        }
    }

    return createSuccessResponse(null, 204, req);
}

// Handler for DELETE /organizations/:orgId/members/:membershipId (Remove Member)
export async function handleRemoveMember(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User, 
    orgId: string,
    membershipId: string
): Promise<Response> {
    console.log(`[members.ts] Handling DELETE /organizations/${orgId}/members/${membershipId}...`);
    
     // Attempt delete (RLS must check admin or self, DB trigger must check last admin)
     const { error: deleteError, count } = await supabaseClient
       .from('organization_members')
       .delete()
       .eq('id', membershipId)
       .eq('organization_id', orgId); 

     if (deleteError) {
         if (deleteError.message.includes("last admin")) { 
             console.warn(`[members.ts] Attempted removal of last admin membership ${membershipId}`);
             return createErrorResponse(`Conflict: ${deleteError.message}`, 409, req);
         }
          if (deleteError.code === '42501') {
              console.warn(`[members.ts] Member removal forbidden for user ${user.id} on membership ${membershipId}`);
             return createErrorResponse("Forbidden: You do not have permission to remove this member.", 403, req);
         }
         console.error(`[members.ts] Error removing membership ${membershipId}:`, deleteError);
         return createErrorResponse(`Failed to remove member: ${deleteError.message}`, 500, req);
     }
     
      if (count === 0) {
          // Need to differentiate 404 vs 403
         const { data: memberExists, error: checkError } = await supabaseClient
            .from('organization_members')
            .select('id', { head: true })
            .eq('id', membershipId)
            .eq('organization_id', orgId)
            .maybeSingle();
            
         if (checkError || !memberExists) {
             console.warn(`[members.ts] Member removal failed: Membership ${membershipId} not found in org ${orgId}.`);
             return createErrorResponse("Membership not found.", 404, req); 
         } else {
            console.warn(`[members.ts] Member removal forbidden (count 0) for user ${user.id} on membership ${membershipId}`);
            return createErrorResponse("Forbidden: You do not have permission to remove this member.", 403, req); // RLS likely blocked
         }
      }
      
      return createSuccessResponse(null, 204, req); 
} 