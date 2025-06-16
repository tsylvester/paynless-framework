// import { createSupabaseClient } from "../_shared/auth.ts"; // Removed
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2"; // Added User
import type { DialecticProject } from "./dialectic.interface.ts";

console.log("listProjects function started");

// interface ListProjectsOptions { // Removed
//   createSupabaseClientOverride?: (req: Request) => SupabaseClient;
// }

export async function listProjects(
  // req: Request, // Removed req
  user: User, // Added user
  dbClient: SupabaseClient // Changed type from typeof supabaseAdmin
  // options?: ListProjectsOptions // Removed options
): Promise<{ data?: DialecticProject[]; error?: { message: string; status?: number; code?: string; details?: string } }> {
  // const effectiveCreateSupabaseClient = options?.createSupabaseClientOverride || createSupabaseClient; // Removed
  // const supabaseUserClient = effectiveCreateSupabaseClient(req); // Removed
  // const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(); // Removed

  // if (userError || !user) { // User is now guaranteed by the caller or this function isn't called
  //   logger.warn("User not authenticated for listProjects", { error: userError });
  //   return { error: { message: "User not authenticated", status: 401, code: "AUTH_ERROR" } };
  // }

  const { data: projectsData, error: projectsError } = await dbClient
    .from('dialectic_projects')
    .select('*, dialectic_domains(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }); // Optional: order by creation date

  if (projectsError) {
    logger.error("Error fetching projects:", { error: projectsError, userId: user.id });
    // Standardize error response
    return { error: { message: "Failed to fetch projects", details: projectsError.message, status: 500, code: "DB_ERROR" } };
  }

  const projectsWithDomainName = projectsData?.map(p => ({
    ...p,
    dialectic_domains: undefined, // remove the nested object
    domain_name: p.dialectic_domains?.name || null,
  })) || [];

  return { data: projectsWithDomainName as DialecticProject[] };
}
  