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

    // 1. Get all project resources to clean up from storage
    const { data: resources, error: resourceError } = await supabaseClient
        .from('dialectic_project_resources')
        .select('storage_bucket, storage_path')
        .eq('project_id', projectId);

    if (resourceError) {
        console.error(`Could not fetch project resources for project ${projectId}. Deletion aborted. Error: ${resourceError.message}`);
        return { error: { message: "Could not clean up project resources, aborting deletion.", details: resourceError.message }, status: 500 };
    }

    // 2. Loop through and delete each storage object
    if (resources && resources.length > 0) {
        console.log(`Found ${resources.length} project resources to remove from storage.`);
        const removalPromises = resources.map(resource => {
            if (resource.storage_bucket && resource.storage_path) {
                console.log(`Queueing removal of ${resource.storage_path} from bucket ${resource.storage_bucket}`);
                return supabaseClient.storage.from(resource.storage_bucket).remove([resource.storage_path]);
            }
            return Promise.resolve({ data: null, error: null }); // Return a resolved promise for resources with no storage path
        });

        const results = await Promise.all(removalPromises);

        const removalErrors = results.filter(res => res.error);
        if (removalErrors.length > 0) {
            console.error(`${removalErrors.length} errors occurred during storage cleanup for project ${projectId}.`);
            removalErrors.forEach(err => console.error(err.error));
            // Still proceed to delete the DB record. The errors are logged for observability.
        } else {
            console.log(`Successfully removed all storage objects for project ${projectId}.`);
        }
    } else {
        console.log(`No project resources found in database for project ${projectId}. No storage cleanup needed.`);
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