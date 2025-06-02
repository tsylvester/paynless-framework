// deno-lint-ignore-file no-explicit-any
import { 
    UpdateProjectDomainTagPayload, 
  } from "./dialectic.interface.ts";
import type { SupabaseClient, PostgrestError } from 'npm:@supabase/supabase-js'; // Import User and PostgrestError
import type { 
    ServiceError, 
    GetUserFn, 
    ILogger 
} from '../_shared/types.ts'; // Import shared types

console.log("updateProjectDomainTag function started");

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

// IsValidDomainTagFn is specific to this service's DI, keep its definition local or move to dialectic.interface.ts if shared across dialectic actions
interface IsValidDomainTagFn {
  (dbClient: SupabaseClient, domainTag: string): Promise<boolean>;
}

interface UpdateProjectDomainTagSuccessData {
  id: string;
  project_name: string;
  selected_domain_tag: string | null;
  updated_at: string;
}

export async function updateProjectDomainTag(
    getUserFn: GetUserFn, // Use imported GetUserFn
    dbAdminClient: SupabaseClient, 
    isValidDomainTagFn: IsValidDomainTagFn, 
    payload: UpdateProjectDomainTagPayload,
    logger: ILogger // Add ILogger parameter
  ): Promise<{ data?: UpdateProjectDomainTagSuccessData; error?: ServiceError }> { // Return type uses ServiceError and specific data type
    const { projectId, domainTag } = payload;
  
    if (!projectId) {
      logger.warn('updateProjectDomainTag: projectId is required', { payload });
      return { error: { message: "projectId is required", status: 400, code: "VALIDATION_ERROR" } };
    }
  
    const { data: { user }, error: userAuthError } = await getUserFn(); // userAuthError will be ServiceError | null
  
    if (userAuthError || !user) {
      logger.warn("User not authenticated for updateProjectDomainTag", { error: userAuthError });
      const errorResponse: ServiceError = userAuthError 
        ? { ...userAuthError, code: userAuthError.code || 'AUTH_ERROR' } 
        : { message: 'User not authenticated.', status: 401, code: 'AUTH_ERROR' };
      return { error: errorResponse };
    }
    // user is now of type User (from npm:@supabase/supabase-js)
  
    if (domainTag !== null && domainTag !== undefined) { // Check for undefined too, if null means clear, empty string might be invalid
      const tagIsValid = await isValidDomainTagFn(dbAdminClient, domainTag);
      if (!tagIsValid) {
        logger.warn('updateProjectDomainTag: Invalid domainTag', { domainTag, projectId });
        return { error: { message: `Invalid domainTag: "${domainTag}"`, status: 400, code: "INVALID_DOMAIN_TAG" } };
      }
    }
  
    const { data: projectData, error: projectDbError } = await dbAdminClient
      .from('dialectic_projects')
      .update({ selected_domain_tag: domainTag, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('user_id', user.id) 
      .select('id, project_name, selected_domain_tag, updated_at')
      .single(); 
  
    if (projectDbError) {
      logger.error("Error updating project domain tag in DB", { error: projectDbError, projectId, userId: user.id });
      const pgError = projectDbError as PostgrestError; // Type cast to PostgrestError
      if (pgError.code === 'PGRST116') { 
          return { error: { message: "Project not found or access denied", status: 404, code: "NOT_FOUND_OR_FORBIDDEN" } };
      }
      return { error: { message: "Failed to update project domain tag", details: pgError.message, status: 500, code: "DB_UPDATE_ERROR" } };
    }
  
    if (!projectData) { 
      logger.error('Project not found after successful DB update attempt (unexpected)', { projectId, userId: user.id });
      return { error: { message: "Project not found after update attempt (unexpected)", status: 404, code: "UNEXPECTED_NOT_FOUND" } };
    }
    
    logger.info('Project domain tag updated successfully', { projectId, newDomainTag: domainTag });
    return { data: projectData };
  }
  