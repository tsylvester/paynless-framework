// deno-lint-ignore-file no-explicit-any
import { 
  UpdateProjectDomainPayload,
  DialecticProject
} from "./dialectic.interface.ts";
import type { SupabaseClient, PostgrestError } from 'npm:@supabase/supabase-js';
import type { 
    ServiceError, 
    GetUserFn, 
    ILogger 
} from '../_shared/types.ts'; // Import shared types

console.log("updateProjectDomain function started");

// --- START: Added for DI --- (REMOVING THESE LOCAL DEFINITIONS)
// interface User {
//   id: string;
// }
// interface AuthError {
//     message: string;
//     status?: number;
// }
// interface GetUserFnResult {
//   data: { user: User | null };
//   error: AuthError | null;
// }
// interface GetUserFn {
//   (): Promise<GetUserFnResult>;
// }
// --- END: Added for DI ---

// IsValidDomainFn is specific to this service's DI, keep its definition local or move to dialectic.interface.ts if shared across dialectic actions
interface IsValidDomainFn {
  (dbClient: SupabaseClient, domainId: string): Promise<boolean>;
}

interface UpdateProjectDomainSuccessData {
  id: string;
  project_name: string;
  selected_domain_id: string | null;
  updated_at: string;
}

export async function updateProjectDomain(
    getUserFn: GetUserFn,
    dbAdminClient: SupabaseClient, 
    payload: UpdateProjectDomainPayload,
    logger: ILogger
  ): Promise<{ data?: DialecticProject; error?: ServiceError }> {
    const { projectId, selectedDomainId } = payload;
  
    if (!projectId) {
      logger.warn('updateProjectDomain: projectId is required', { payload });
      return { error: { message: "projectId is required", status: 400, code: "VALIDATION_ERROR" } };
    }

    if (!selectedDomainId) {
      logger.warn('updateProjectDomain: selectedDomainId is required', { payload });
      return { error: { message: "selectedDomainId is required", status: 400, code: "VALIDATION_ERROR" } };
    }
  
    const { data: { user }, error: userAuthError } = await getUserFn();
  
    if (userAuthError || !user) {
      logger.warn("User not authenticated for updateProjectDomain", { error: userAuthError });
      const errorResponse: ServiceError = userAuthError 
        ? { ...userAuthError, code: userAuthError.code || 'AUTH_ERROR' } 
        : { message: 'User not authenticated.', status: 401, code: 'AUTH_ERROR' };
      return { error: errorResponse };
    }

    // The foreign key constraint on dialectic_projects(selected_domain_id)
    // automatically validates that the domain ID exists in dialectic_domains.
    // No manual validation function is needed.
  
    const { data: projectData, error: projectDbError } = await dbAdminClient
      .from('dialectic_projects')
      .update({ selected_domain_id: selectedDomainId, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('user_id', user.id) 
      .select(`
        *,
        domain:dialectic_domains (
          name,
          description
        )
      `)
      .single();
  
    if (projectDbError) {
      logger.error("Error updating project domain in DB", { error: projectDbError, projectId, userId: user.id });
      const pgError = projectDbError as PostgrestError;
      
      if (pgError.code === '23503') { // foreign_key_violation
        return { error: { message: `Invalid domainId: "${selectedDomainId}"`, status: 400, code: "INVALID_DOMAIN_ID" } };
      }
      
      if (pgError.code === 'PGRST116') { // No rows found
          return { error: { message: "Project not found or access denied", status: 404, code: "NOT_FOUND_OR_FORBIDDEN" } };
      }
      return { error: { message: "Failed to update project domain", details: pgError.message, status: 500, code: "DB_UPDATE_ERROR" } };
    }
  
    if (!projectData) { 
      logger.error('Project not found after successful DB update attempt (unexpected)', { projectId, userId: user.id });
      return { error: { message: "Project not found after update attempt (unexpected)", status: 404, code: "UNEXPECTED_NOT_FOUND" } };
    }

    // Restructure the data to match the DialecticProject interface
    const { domain, ...rest } = projectData;
    const responseData: DialecticProject = {
      ...rest,
      domain_name: (domain as { name: string, description: string } | null)?.name,
      domain_description: (domain as { name: string, description: string } | null)?.description,
    };
    
    logger.info('Project domain updated successfully', { projectId, newDomainId: selectedDomainId });
    return { data: responseData };
  }
  