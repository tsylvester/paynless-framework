import { createErrorResponse, createSuccessResponse } from '../_shared/cors-headers.ts';
import { Database } from '../types_db.ts'; 
import { SupabaseClient, User } from '@supabase/supabase-js'; 

// Handler specifically for GET /organizations
export async function handleListOrganizations(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User 
): Promise<Response> {
    console.log('[list.ts] Handling GET /organizations (list user orgs)...');
    
    // Fetch organizations where the user is an active member
    // RLS policy on organization_members should handle filtering for the current user
    const { data: memberships, error: memError } = await supabaseClient
        .from('organization_members')
        .select(`
            organizations ( id, name, visibility, created_at ) 
        `)
        .eq('user_id', user.id)
        .eq('status', 'active'); // Only active memberships

    if (memError) {
        console.error('[list.ts] Error fetching user organizations:', memError);
        return createErrorResponse('Failed to retrieve organizations.', 500, req);
    }
    
    // Extract the organization data, filtering out any nulls in case of unexpected join results
    const userOrgs = memberships?.map(m => m.organizations).filter(org => org !== null) || [];

    return createSuccessResponse(userOrgs, 200, req);
} 