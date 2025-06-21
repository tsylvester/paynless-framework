// deno-lint-ignore-file no-explicit-any
import { 
    GetProjectDetailsPayload,
    DialecticProject,
    DialecticContribution,
    DialecticStage,
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
        resources:dialectic_project_resources!dialectic_project_resources_project_id_fkey (*),
        dialectic_sessions (*,
          dialectic_contributions (*),
          dialectic_feedback (*)
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
    
    // Sort contributions by creation date
    if (project.dialectic_sessions) {
      for (const session of project.dialectic_sessions) {
        if (session.dialectic_contributions) {
          session.dialectic_contributions.sort(
            (a: DialecticContribution, b: DialecticContribution) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
      }
    }

    // Populate full stage objects in contributions
    if (project.process_template_id && project.dialectic_sessions) {
      try {
        // 1. Fetch stage transitions for the process template
        const { data: transitions, error: transitionsError } = await dbClient
          .from('dialectic_stage_transitions')
          .select('source_stage_id, target_stage_id')
          .eq('process_template_id', project.process_template_id);

        if (transitionsError) {
          logger.error("Error fetching stage transitions:", { error: transitionsError, projectId });
          // Decide if this is a critical error or if we can proceed without full stage info
          // For now, let's log and proceed, contributions might lack full stage context.
        }

        const stagesMap = new Map<string, DialecticStage>(); // Using 'any' for DialecticStage temporarily

        if (transitions && transitions.length > 0) {
          const stageIds = new Set<string>();
          transitions.forEach(t => {
            if (t.source_stage_id) stageIds.add(t.source_stage_id);
            if (t.target_stage_id) stageIds.add(t.target_stage_id);
          });

          if (stageIds.size > 0) {
            // 2. Fetch details for these unique stages
            const { data: stagesData, error: stagesError } = await dbClient
              .from('dialectic_stages')
              .select('*')
              .in('id', Array.from(stageIds));

            if (stagesError) {
              logger.error("Error fetching stage details:", { error: stagesError, projectId });
              // Log and proceed
            } else if (stagesData) {
              // 3. Create a lookup map (slug -> stage object)
              stagesData.forEach(stage => {
                stagesMap.set(stage.slug, stage);
              });
            }
          }
        }
        
        // 4. Transform contributions
        for (const session of project.dialectic_sessions) {
          if (session.dialectic_contributions) {
            for (const contribution of session.dialectic_contributions) {
              const stageSlug = contribution.stage; // stage is initially a string slug
              if (typeof stageSlug === 'string' && stagesMap.has(stageSlug)) {
                contribution.stage = stagesMap.get(stageSlug);
              } else if (typeof stageSlug === 'string') {
                logger.warn("Stage object not found in map for slug:", { stageSlug, projectId, contributionId: contribution.id });
                // Optionally, leave stage as slug or set to a default/null object
                // For now, it remains the slug if not found, frontend needs to be robust.
              }
            }
          }
        }
      } catch (e) {
        logger.error("Error during stage transformation in getProjectDetails:", { error: e, projectId });
        // Non-critical, proceed with potentially untransformed data
      }
    }
  
    return { data: project as DialecticProject };
  }
  