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

    // New logic: Delete the entire project folder from storage
    const projectFolderPath = `projects/${projectId}`;
    console.log(`Listing files in folder: ${projectFolderPath} for deletion.`);

    const { data: fileList, error: listError } = await supabaseClient.storage
      .from('dialectic-contributions') // Assuming this is the correct bucket
      .list(projectFolderPath, {
        limit: 1000, // Adjust limit as needed, consider pagination for very large projects
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (listError) {
      console.error(`Error listing files for project deletion: ${listError.message}`);
      // Non-fatal, proceed to delete the project record from the DB anyway.
      // The files will be orphaned, but the project will be gone from the UI.
    }

    if (fileList && fileList.length > 0) {
      const filesToRemove = fileList.map((file) => `${projectFolderPath}/${file.name}`);
      // Also remove the folder itself if it's empty after removing files,
      // or if the API needs an explicit folder marker. Often, removing all files effectively removes the folder.
      // For Supabase, removing all objects within a path is sufficient.
      
      console.log(`Found ${filesToRemove.length} files to remove.`);
      
      const { error: removeError } = await supabaseClient.storage
        .from('dialectic-contributions')
        .remove(filesToRemove);
      
      if (removeError) {
        console.error(`Error removing files from storage: ${removeError.message}`);
        // Non-fatal, proceed to delete the project record from the DB.
      } else {
        console.log(`Successfully removed files for project: ${projectId}`);
      }
    } else {
      console.log(`No files found in storage for project: ${projectId}. Nothing to remove.`);
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