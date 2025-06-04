import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types_db.ts';
import { DeleteProjectPayload } from './dialectic.interface.ts';

// Define a helper type for the expected return structure
type HandlerResponse<T = null> = {
  status: number;
  data?: T;
  error?: {
    message: string;
    details?: string | undefined;
  };
};

export async function deleteProject(
  supabaseClient: SupabaseClient<Database>,
  payload: DeleteProjectPayload,
  userId: string
): Promise<HandlerResponse> {
  const { projectId } = payload;

  try {
    // 1. Verify project ownership
    const { data: project, error: projectError } = await supabaseClient
      .from('dialectic_projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('Error fetching project for deletion:', projectError);
      if (projectError.code === 'PGRST116') { // Not found
        return { error: {message: `Project with ID ${projectId} not found.`}, status: 404 };
      }
      return { error: {message: `Error fetching project: ${projectError.message}`, details: JSON.stringify(projectError)}, status: 500 };
    }

    if (project.user_id !== userId) {
      return { error: {message: 'User is not authorized to delete this project.'}, status: 403 };
    }

    const pathsToClean: { bucket: string, paths: string[] }[] = [];

    // 2. Collect contribution storage paths
    // First, get all session IDs for the project
    const { data: sessions, error: sessionsError } = await supabaseClient
      .from('dialectic_sessions')
      .select('id')
      .eq('project_id', projectId);

    if (sessionsError) {
      console.error('Error fetching sessions for project deletion:', sessionsError);
      // Non-fatal, proceed to delete project record, storage cleanup might be partial
    } else if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);

      const { data: contributions, error: contributionsError } = await supabaseClient
        .from('dialectic_contributions')
        .select('id, session_id, content_storage_path, raw_response_storage_path, content_storage_bucket')
        .in('session_id', sessionIds);

      if (contributionsError) {
        console.error('Error fetching contributions for project deletion:', contributionsError);
        // Non-fatal, proceed to delete project record, storage cleanup might be partial
      } else if (contributions && contributions.length > 0) {
        const contributionPathsByBucket: Record<string, string[]> = {};
        contributions.forEach(c => {
          const bucket = c.content_storage_bucket;
          if (bucket) {
            if (!contributionPathsByBucket[bucket]) {
              contributionPathsByBucket[bucket] = [];
            }
            if (c.content_storage_path) contributionPathsByBucket[bucket].push(c.content_storage_path);
            if (c.raw_response_storage_path) contributionPathsByBucket[bucket].push(c.raw_response_storage_path);
          } else if (c.content_storage_path || c.raw_response_storage_path) {
            console.warn(`Contribution ${c.id} has storage paths but no defined storage bucket. Skipping cleanup for these paths.`);
          }
        });
        for (const bucket in contributionPathsByBucket) {
          if (contributionPathsByBucket[bucket].length > 0) {
            pathsToClean.push({ bucket, paths: contributionPathsByBucket[bucket] });
          }
        }
      }
    }
    
    // 3. Collect project resource storage paths
    const { data: projectResources, error: projectResourcesError } = await supabaseClient
      .from('dialectic_project_resources')
      .select('storage_path, storage_bucket')
      .eq('project_id', projectId);

    if (projectResourcesError) {
      console.error('Error fetching project resources for deletion:', projectResourcesError);
      // Non-fatal, proceed to delete project record
    }

    if (projectResources && projectResources.length > 0) {
        const resourcePathsByBucket: Record<string, string[]> = {};
        projectResources.forEach(pr => {
            if (pr.storage_path && pr.storage_bucket) {
                if (!resourcePathsByBucket[pr.storage_bucket]) {
                    resourcePathsByBucket[pr.storage_bucket] = [];
                }
                resourcePathsByBucket[pr.storage_bucket].push(pr.storage_path);
            }
        });
        for (const bucket in resourcePathsByBucket) {
            pathsToClean.push({ bucket, paths: resourcePathsByBucket[bucket] });
        }
    }

    // 4. Call storage-cleanup-service for each bucket
    for (const { bucket, paths } of pathsToClean) {
        if (paths.length > 0) {
            const { error: cleanupError } = await supabaseClient.functions.invoke('storage-cleanup-service', {
                body: { bucket, paths },
            });
            if (cleanupError) {
                console.error(`Error cleaning storage for bucket ${bucket}:`, cleanupError);
                // Non-fatal, log and continue with project deletion from DB
            }
        }
    }

    // 5. Delete the project record from dialectic_projects table
    // RLS should allow this if user_id matches. Cascading deletes are configured in DB.
    const { error: deleteError } = await supabaseClient
      .from('dialectic_projects')
      .delete()
      .eq('id', projectId);

    if (deleteError) {
      console.error('Error deleting project record:', deleteError);
      return { error: {message: `Failed to delete project ${projectId} from database.`, details: JSON.stringify(deleteError) }, status: 500 };
    }

    return { status: 204 }; // Success
  } catch (e) {
    console.error('Unexpected error in deleteProject:', e);
    const error = e as Error;
    return { error: {message: `An unexpected error occurred while deleting the project.`, details: JSON.stringify({ name: error.name, message: error.message, stack: error.stack }) }, status: 500 };
  }
} 