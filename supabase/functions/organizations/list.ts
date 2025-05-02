import { createErrorResponse, createSuccessResponse } from '../_shared/cors-headers.ts';
import { Database } from '../types_db.ts'; 
import { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2.43.4'; 

// Default values for pagination
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10; // Or whatever default page size makes sense

// Handler specifically for GET /organizations
export async function handleListOrganizations(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User 
): Promise<Response> {
    console.log('[list.ts] Handling GET /organizations (list user orgs)...');

    // --- Parse Pagination Query Params --- 
    const url = new URL(req.url);
    const pageParam = url.searchParams.get('page');
    const limitParam = url.searchParams.get('limit');
    // Always paginate, even if params missing, use defaults
    const page = parseInt(pageParam || `${DEFAULT_PAGE}`, 10);
    const limit = parseInt(limitParam || `${DEFAULT_LIMIT}`, 10);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit - 1;

    console.log(`[list.ts] Pagination - Page: ${page}, Limit: ${limit}, Range: ${startIndex}-${endIndex}`);

    // Fetch organization memberships for the user, requesting total count
    const { data: memberships, error: memError, count } = await supabaseClient
        .from('organization_members')
        .select(`
            organizations ( id, name, visibility, created_at )
        `, { count: 'exact' }) // <<< Request total count
        .eq('user_id', user.id)
        .eq('status', 'active') // Only active memberships
        .order('created_at', { referencedTable: 'organizations', ascending: true }) // Example sorting
        .range(startIndex, endIndex); // <<< Apply pagination range

    if (memError) {
        console.error('[list.ts] Error fetching user organizations:', memError);
        return createErrorResponse('Failed to retrieve organizations.', 500, req);
    }
    
    // Extract the organization data, filtering out any nulls
    const userOrgs = memberships?.map(m => m.organizations).filter(org => org !== null) || [];
    const totalCount = count ?? 0;

    console.log(`[list.ts] Found ${userOrgs.length} orgs for current page, total count: ${totalCount}`);

    // <<< Return the Paginated Structure >>>
    const responsePayload = {
        organizations: userOrgs,
        totalCount: totalCount,
    };

    return createSuccessResponse(responsePayload, 200, req);
} 