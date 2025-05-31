import { createSupabaseClient } from "../_shared/auth.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

console.log("listProjects function started");

interface ListProjectsOptions {
  createSupabaseClientOverride?: (req: Request) => SupabaseClient;
}

export async function listProjects(
  req: Request, // For user authentication
  dbClient: SupabaseClient, // Changed type from typeof supabaseAdmin
  options?: ListProjectsOptions // Added options parameter
): Promise<{ data?: Database['public']['Tables']['dialectic_projects']['Row'][]; error?: { message: string; status?: number; code?: string; details?: string } }> {
  const effectiveCreateSupabaseClient = options?.createSupabaseClientOverride || createSupabaseClient;
  const supabaseUserClient = effectiveCreateSupabaseClient(req);
  const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

  if (userError || !user) {
    logger.warn("User not authenticated for listProjects", { error: userError });
    return { error: { message: "User not authenticated", status: 401, code: "AUTH_ERROR" } };
  }

  const { data: projectsData, error: projectsError } = await dbClient
    .from('dialectic_projects')
    .select('*') // Select all columns for now, can be refined later if needed
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }); // Optional: order by creation date

  if (projectsError) {
    logger.error("Error fetching projects:", { error: projectsError, userId: user.id });
    // Standardize error response
    return { error: { message: "Failed to fetch projects", details: projectsError.message, status: 500, code: "DB_ERROR" } };
  }

  return { data: projectsData || [] }; // Return empty array if projectsData is null (no projects found)
}
  