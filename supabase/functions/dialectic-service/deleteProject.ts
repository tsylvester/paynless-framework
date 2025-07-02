import { SupabaseClient } from 'npm:@supabase/supabase-js';
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

    // Storage cleanup
    const filesToDelete: Array<{ storage_bucket: string; storage_path: string }> = [];

    // 2.a Get all project resources
    const { data: projectResources, error: resourceError } = await supabaseClient
        .from('dialectic_project_resources')
        .select('storage_bucket, storage_path')
        .eq('project_id', projectId);

    if (resourceError) {
        console.error(`Could not fetch project resources for project ${projectId}. Deletion might be incomplete. Error: ${resourceError.message}`);
        // Continue to attempt deletion of other assets and DB record
    } else if (projectResources) {
        projectResources.forEach(res => {
            if (res.storage_bucket && res.storage_path) {
                filesToDelete.push({ storage_bucket: res.storage_bucket, storage_path: res.storage_path });
            }
        });
    }

    // 2.b Get all contributions and their raw responses
    const { data: sessions, error: sessionError } = await supabaseClient
        .from('dialectic_sessions')
        .select('id')
        .eq('project_id', projectId);

    if (sessionError) {
        console.error(`Could not fetch sessions for project ${projectId}. Contribution file deletion might be incomplete. Error: ${sessionError.message}`);
    } else if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id);
        const { data: contributions, error: contribError } = await supabaseClient
            .from('dialectic_contributions')
            .select('storage_bucket, storage_path, raw_response_storage_path')
            .in('session_id', sessionIds);

        if (contribError) {
            console.error(`Could not fetch contributions for project ${projectId}. Contribution file deletion might be incomplete. Error: ${contribError.message}`);
        } else if (contributions) {
            contributions.forEach(c => {
                if (c.storage_bucket && c.storage_path) {
                    filesToDelete.push({ storage_bucket: c.storage_bucket, storage_path: c.storage_path });
                }
                if (c.storage_bucket && c.raw_response_storage_path) { // Assuming raw responses are in the same bucket
                    filesToDelete.push({ storage_bucket: c.storage_bucket, storage_path: c.raw_response_storage_path });
                }
            });
        }
    }

    // 2.c Loop through and delete each storage object
    if (filesToDelete.length > 0) {
        console.log(`Found ${filesToDelete.length} total files (project resources and contributions) to remove from storage for project ${projectId}.`);
        
        // Group files by bucket
        const filesByBucket: Record<string, string[]> = filesToDelete.reduce((acc, file) => {
            if (!acc[file.storage_bucket]) {
                acc[file.storage_bucket] = [];
            }
            acc[file.storage_bucket].push(file.storage_path);
            return acc;
        }, {} as Record<string, string[]>);

        const removalPromises = Object.entries(filesByBucket).map(([bucketName, paths]) => {
            console.log(`Queueing removal of ${paths.length} files from bucket ${bucketName}`);
            return supabaseClient.storage.from(bucketName).remove(paths);
        });

        const results = await Promise.all(removalPromises);

        const removalErrors = results.filter(res => res.error);
        if (removalErrors.length > 0) {
            console.error(`${removalErrors.length} errors occurred during storage cleanup for project ${projectId}.`);
            removalErrors.forEach(errDetail => console.error(errDetail.error)); // errDetail might be { data: null, error: ErrorObject }
            // Still proceed to delete the DB record. The errors are logged for observability.
        } else {
            console.log(`Successfully processed all storage removal requests for project ${projectId}.`);
        }
    } else {
        console.log(`No files found in database (project resources or contributions) for project ${projectId}. No storage cleanup needed.`);
    }

    // 3. Delete the project record from the database.
    // The database is set up with cascading deletes, so this will clean up
    // dialectic_sessions, dialectic_contributions, and dialectic_project_resources.
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