// deno-lint-ignore-file no-explicit-any
import { 
    GetProjectDetailsPayload,
    DialecticProject,
    DialecticContribution,
  } from "./dialectic.interface.ts";
  // import { createSupabaseClient } from "../_shared/auth.ts"; // Removed, user passed directly
  import { logger } from "../_shared/logger.ts";
  import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2"; // Added User import
  console.log("getProjectDetails function started");

  // interface GetProjectDetailsOptions { // Removed options
  //   createSupabaseClientOverride?: (req: Request) => SupabaseClient;
  // }

  export async function getProjectDetails(
    // req: Request, // Removed req
    payload: GetProjectDetailsPayload,
    dbClient: SupabaseClient,
    user: User // Added user parameter
    // options?: GetProjectDetailsOptions // Removed options
  ): Promise<{ data?: DialecticProject; error?: { message: string; status?: number; details?: string; code?: string } }> {
    const { projectId } = payload;
    if (!projectId) {
      return { error: { message: "projectId is required", code: "VALIDATION_ERROR", status: 400 } };
    }
  
    // const clientProvider = options?.createSupabaseClientOverride || createSupabaseClient; // Removed
    // const supabaseUserClient = clientProvider(req); // Removed
    // const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(); // Removed
    // if (userError || !user) { // User is now guaranteed by the caller or this function isn't called
    //   logger.warn("User not authenticated for getProjectDetails", { error: userError, projectId });
    //   return { error: { message: "User not authenticated", code: "AUTH_ERROR", status: 401 } };
    // }
  
    const { data: project, error: projectError } = await dbClient
      .from('dialectic_projects')
      .select(`
        *,
        dialectic_domains ( name ),
        dialectic_process_templates ( * ),
        dialectic_sessions (*,
          dialectic_contributions (*)
        )
      `)
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();
  
    if (projectError) {
      logger.error("Error fetching project details:", { error: projectError, projectId, userId: user.id });
      if (projectError.code === 'PGRST116') {
        return { error: { message: "Project not found or access denied", code: "NOT_FOUND", status: 404 } };
      }
      return { error: { message: "Failed to fetch project details", details: projectError.message, code: "DB_FETCH_ERROR", status: 500 } };
    }
  
    if (!project) {
      return { error: { message: "Project not found", code: "NOT_FOUND", status: 404 } };
    }
    
    if (project.dialectic_sessions) {
      for (const session of project.dialectic_sessions) {
        if (session.dialectic_contributions) {
          session.dialectic_contributions.sort(
            (a: DialecticContribution, b: DialecticContribution) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
      }
    }
  
    return { data: project as DialecticProject };
  }
  