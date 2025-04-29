import { createErrorResponse, createSuccessResponse } from '../_shared/cors-headers.ts';
import { Database } from '../types_db.ts'; 
import { SupabaseClient, User } from '@supabase/supabase-js'; 

// Handler for GET /organizations/:orgId
export async function handleGetOrgDetails(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User, 
    orgId: string
): Promise<Response> {
    console.log(`[details.ts] Handling GET /organizations/${orgId} (details)...`);
    
    // Fetch specific organization details
    // RLS policy on organizations should ensure user is a member (or it's public)
    const { data: orgDetails, error: detailsError } = await supabaseClient
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .maybeSingle(); // Use maybeSingle to handle not found case

    if (detailsError) {
         console.error(`[details.ts] Error fetching org ${orgId} details:`, detailsError);
         return createErrorResponse('Failed to retrieve organization details.', 500, req);
    }
    
    if (!orgDetails) {
        // This means either org doesn't exist OR RLS prevented access
        return createErrorResponse('Organization not found or access denied.', 404, req);
    }

    return createSuccessResponse(orgDetails, 200, req);
}

// Handler for PUT /organizations/:orgId
export async function handleUpdateOrgDetails(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User, 
    orgId: string,
    body: any
): Promise<Response> {
    console.log(`[details.ts] Handling PUT /organizations/${orgId} (update)...`);
     
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
     const { data: updatedOrg, error: updateError } = await supabaseClient
        .from('organizations')
        .update(updatePayload)
        .eq('id', orgId)
        .select() // Select updated data
        .maybeSingle(); 

     if (updateError) {
         if (updateError.code === '42501') { 
              console.warn(`[details.ts] Update forbidden (RLS) for user ${user.id} on org ${orgId}`);
              return createErrorResponse('Forbidden: You do not have permission to update this organization.', 403, req);
         }
         console.error(`[details.ts] Error updating org ${orgId}:`, updateError);
         return createErrorResponse(`Failed to update organization: ${updateError.message}`, 500, req);
     }
     
     if (!updatedOrg) { 
        const { data: checkOrg, error: checkError } = await supabaseClient
            .from('organizations')
            .select('id', { count: 'exact', head: true })
            .eq('id', orgId);
            
        if (checkError || !checkOrg) { 
             console.warn(`[details.ts] Update failed: Org ${orgId} not found.`);
             return createErrorResponse('Organization not found.', 404, req);
        } else {
             console.warn(`[details.ts] Update forbidden (likely RLS) for user ${user.id} on org ${orgId}`);
             return createErrorResponse('Forbidden: You do not have permission to update this organization.', 403, req);
        }
     }
     
     return createSuccessResponse(updatedOrg, 200, req);
}

// Handler for DELETE /organizations/:orgId
export async function handleDeleteOrg(
    req: Request, 
    supabaseClient: SupabaseClient<Database>,
    user: User, 
    orgId: string
): Promise<Response> {
    console.log(`[details.ts] Handling DELETE /organizations/${orgId} (soft delete)...`);
      
    // 1. Check if user is admin (explicit check)
    const { data: isAdmin, error: adminCheckError } = await supabaseClient.rpc(
        'is_org_admin', 
        { org_id: orgId } // Corrected parameter name to org_id
    );

    if (adminCheckError || !isAdmin) {
        console.warn(`[details.ts] Permission denied for user ${user.id} to delete org ${orgId}. Admin check failed or returned false.`);
        return createErrorResponse("Forbidden: You do not have permission to delete this organization.", 403, req);
    }
    
    // Check if the organization exists and is not already deleted
    const { data: orgCheck, error: checkError } = await supabaseClient
        .from('organizations')
        .select('id')
        .eq('id', orgId)
        .is('deleted_at', null) // Corrected: Use .is() for null check
        .maybeSingle();

    if (checkError) {
        console.error(`[details.ts DELETE /${orgId}] Error checking organization existence:`, checkError);
        return createErrorResponse('Error checking organization before deletion.', 500, req);
    }

    if (!orgCheck) {
        console.warn(`[details.ts DELETE /${orgId}] Organization not found or already deleted.`);
        return createErrorResponse('Organization not found or already deleted.', 404, req);
    }

    // 3. Check if the user is the last admin (if applicable, DB trigger might handle this)
    // Basic check: Count active admins in the org
    const { count: adminCount, error: adminCountError } = await supabaseClient
        .from('organization_members')
        .select('user_id', { count: 'exact', head: true }) // Efficiently count
        .eq('organization_id', orgId)
        .eq('role', 'admin')
        .eq('status', 'active');

    if (adminCountError) {
        console.error(`[details.ts DELETE /${orgId}] Error checking admin count:`, adminCountError);
        return createErrorResponse('Error checking organization admins before deletion.', 500, req);
    }
    
    const finalAdminCount = adminCount ?? 0; // Ensure adminCount is not null

    if (finalAdminCount === 1) {
         // Check if the current user is that last admin
         const { data: lastAdminCheck, error: lastAdminError } = await supabaseClient
            .from('organization_members')
            .select('id')
            .eq('organization_id', orgId)
            .eq('role', 'admin')
            .eq('status', 'active')
            .eq('user_id', user.id) // Is the current user the admin?
            .maybeSingle();
        
        if (lastAdminError) {
             console.error(`[details.ts DELETE /${orgId}] Error verifying if user is the last admin:`, lastAdminError);
             return createErrorResponse('Error verifying admin status before deletion.', 500, req);
        }

        if (lastAdminCheck) {
             console.warn(`[details.ts DELETE /${orgId}] Attempt by user ${user.id} to delete org with self as last admin.`);
             return createErrorResponse('Cannot delete organization: you are the last admin.', 409, req); // Conflict
        }
        // If the count is 1 but it's not the current user (shouldn't happen with RLS?), proceed cautiously or error.
        // Assuming RLS guarantees the deleter IS an admin.
    }
    
     if (finalAdminCount <= 0) {
         // This case should ideally not happen if RLS requires an admin to delete.
         console.warn(`[details.ts DELETE /${orgId}] Org has no active admins, proceeding with delete by user ${user.id}. Check RLS.`);
     }


    // 4. Perform soft delete (Set deleted_at)
    const { error: deleteError } = await supabaseClient
        .from('organizations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', orgId)
        .is('deleted_at', null); // Corrected: Use .is() for null check

    if (deleteError) {
        // Handle potential RLS violation (e.g., user lost admin role between checks)
        if (deleteError.code === '42501') {
             console.warn(`[details.ts DELETE /${orgId}] RLS violation during delete for user ${user.id}.`);
             return createErrorResponse("Forbidden: You do not have permission to delete this organization.", 403, req);
        }
        // Handle other potential errors (e.g., network issues)
        console.error(`[details.ts DELETE /${orgId}] Error soft-deleting organization:`, deleteError);
        return createErrorResponse(`Failed to delete organization: ${deleteError.message}`, 500, req);
    }
    
    console.log(`[details.ts DELETE /${orgId}] Organization successfully soft-deleted by user ${user.id}.`);
    
    // 5. Return success (No Content)
    return createSuccessResponse(null, 204, req); 
}

// ... existing code ...