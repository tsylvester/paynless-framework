// supabase/functions/organizations/create.ts
import { createErrorResponse, createSuccessResponse } from '../_shared/cors-headers.ts';
import { Database } from '../types_db.ts';
// Use npm: specifier for Supabase client
import { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2.43.4';

// Handler specifically for POST /organizations
export async function handleCreateOrganization(
    req: Request, // Keep req for potential header/context access
    supabaseClient: SupabaseClient<Database>,
    user: User, // Pass the authenticated user directly
    body: any // Pass the parsed body directly
): Promise<Response> {
    console.log('[create.ts] Handling POST /organizations...');
    
    // 1. Validate input (already parsed body is passed in)
    const { name, visibility } = body || {};
    if (!name || typeof name !== 'string' || name.trim().length < 3) {
        return createErrorResponse('Organization name is required and must be at least 3 characters long.', 400, req);
    }
    const orgVisibility = visibility === 'public' ? 'public' : 'private';

    // 2. Call the PostgreSQL function
    const rpcPayload = {
        p_user_id: user.id,
        p_org_name: name.trim(),
        p_org_visibility: orgVisibility
    };
    const { data: newOrgId, error: rpcError } = await supabaseClient.rpc(
        'create_org_and_admin_member',
        rpcPayload
    );

    if (rpcError) {
        console.error('[create.ts] Error calling create_org_and_admin_member RPC:', rpcError);
        return createErrorResponse(`Failed to create organization: ${rpcError.message}`, 500, req);
    }

    if (!newOrgId || typeof newOrgId !== 'string') {
        console.error('[create.ts] RPC did not return a valid organization ID.');
        return createErrorResponse('Failed to retrieve organization details after creation.', 500, req);
    }

    // 3. Fetch the newly created organization details
    const { data: createdOrgDetails, error: fetchError } = await supabaseClient
        .from('organizations')
        .select('*')
        .eq('id', newOrgId)
        .single();

    if (fetchError || !createdOrgDetails) {
        console.error(`[create.ts] Error fetching details for new org ${newOrgId}:`, fetchError);
        // Provide the request object to createErrorResponse for CORS headers
        return createErrorResponse('Organization created, but failed to fetch details.', 500, req); 
    }

    console.log('[create.ts] Organization created successfully:', createdOrgDetails);
    // Provide the request object to createSuccessResponse for CORS headers
    return createSuccessResponse(createdOrgDetails, 201, req); 
} 