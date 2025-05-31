// deno-lint-ignore-file no-explicit-any
import { 
    UpdateProjectDomainTagPayload, 
  } from "./dialectic.interface.ts";
// import { createSupabaseClient } from "../_shared/auth.ts"; // To be replaced by DI
import type { SupabaseClient } from '@supabase/supabase-js';

console.log("updateProjectDomainTag function started");

// --- START: Added for DI ---
interface User {
  id: string;
  // Add other user properties if needed by the function
}

interface AuthError {
    message: string;
    status?: number;
    // Add other relevant Supabase auth error properties if needed
}

interface GetUserFnResult {
  data: { user: User | null };
  error: AuthError | null;
}

interface GetUserFn {
  (): Promise<GetUserFnResult>;
}

interface IsValidDomainTagFn {
  (dbClient: SupabaseClient, domainTag: string): Promise<boolean>;
}
// --- END: Added for DI ---

// Placeholder for isValidDomainTag - this should be implemented or imported properly
// For now, to make the function runnable, we'll create a dummy one.
// In a real scenario, this would interact with the DB or a predefined list.
async function dummyIsValidDomainTag(dbClient: SupabaseClient, domainTag: string): Promise<boolean> {
  console.warn(`dummyIsValidDomainTag called with: ${domainTag}. Returning true by default.`);
  // In a real implementation, you would query `domain_specific_prompt_overlays`
  // to see if the tag exists, e.g.:
  // const { data, error } = await dbClient.from('domain_specific_prompt_overlays').select('domain_tag').eq('domain_tag', domainTag).maybeSingle();
  // return !error && !!data;
  return true; // Returning true for now so refactoring can proceed.
}

export async function updateProjectDomainTag(
    // req: Request, // Replaced by getUserFn
    getUserFn: GetUserFn,
    dbAdminClient: SupabaseClient, // Typed as SupabaseClient
    isValidDomainTagFn: IsValidDomainTagFn, // Injected
    payload: UpdateProjectDomainTagPayload
  ) {
    const { projectId, domainTag } = payload;
  
    if (!projectId) {
      return { error: { message: "projectId is required", status: 400, code: "VALIDATION_ERROR" } };
    }
  
    // const supabaseUserClient = createSupabaseClient(req); // Replaced
    // const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(); // Replaced
    const { data: { user }, error: userError } = await getUserFn();
  
    if (userError || !user) {
      console.warn("User not authenticated for updateProjectDomainTag", userError);
      return { error: { message: "User not authenticated", status: 401, code: "AUTH_ERROR" } };
    }
  
    if (domainTag !== null) {
      // const tagIsValid = await isValidDomainTag(dbAdminClient, domainTag); // Original call
      const tagIsValid = await isValidDomainTagFn(dbAdminClient, domainTag); // Use injected function
      if (!tagIsValid) {
        return { error: { message: `Invalid domainTag: "${domainTag}"`, status: 400, code: "INVALID_DOMAIN_TAG" } };
      }
    }
  
    const { data: projectData, error: projectError } = await dbAdminClient
      .from('dialectic_projects')
      .update({ selected_domain_tag: domainTag, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('user_id', user.id) // Security: ensure user owns the project
      .select('id, project_name, selected_domain_tag, updated_at')
      .single(); // Use single() to expect one row or throw PGRST116 if not found/not unique
  
    if (projectError) {
      console.error("Error updating project domain tag:", projectError);
      if (projectError.code === 'PGRST116') { // PGRST116: "Searched for a single row, but 0 or more than 1 rows were found"
          return { error: { message: "Project not found or access denied", status: 404, code: "NOT_FOUND_OR_FORBIDDEN" } };
      }
      return { error: { message: "Failed to update project domain tag", details: projectError.message, status: 500, code: "DB_UPDATE_ERROR" } };
    }
  
    // .single() should guarantee projectData is not null if no error occurred.
    // However, an explicit check for !projectData is fine for robustness, though typically PGRST116 would cover it.
    // If .single() succeeds, projectData will be an object. If it fails (0 or >1 rows), projectError will be set.
    // So, this explicit !projectData check might be redundant if PGRST116 handling is comprehensive.
    // For now, keeping it as in the original, but noting .single() behavior.
    if (!projectData) { 
      // This case should ideally be caught by projectError.code === 'PGRST116' from .single()
      return { error: { message: "Project not found or access denied after update attempt (unexpected)", status: 404, code: "UNEXPECTED_NOT_FOUND" } };
    }
  
    return { data: projectData };
  }
  