import { SupabaseClient } from 'npm:@supabase/supabase-js';
import { Database } from '../types_db.ts';
import { DeleteProjectPayload } from './dialectic.interface.ts';

type HandlerResponse<T = null> = {
  status: number;
  data?: T;
  error?: {
    message: string;
    details?: string | undefined;
  };
};

async function recursivelyDeleteStorageFolder(
  supabaseClient: SupabaseClient<Database>,
  bucketName: string,
  folderPath: string
) {
  const { data: files, error: listError } = await supabaseClient.storage
    .from(bucketName)
    .list(folderPath, { limit: 1000 });

  if (listError) {
    console.error(`Error listing files in ${bucketName}/${folderPath} for deletion:`, listError);
    return;
  }

  if (files && files.length > 0) {
    const filesToRemove = files.filter(file => file.id).map(file => `${folderPath}/${file.name}`);
    
    if (filesToRemove.length > 0) {
      const { error: removeError } = await supabaseClient.storage.from(bucketName).remove(filesToRemove);
      if (removeError) {
        console.error(`Error removing files from ${bucketName}/${folderPath}:`, removeError);
      }
    }

    const foldersToRemove = files.filter(file => !file.id);
    for (const folder of foldersToRemove) {
      await recursivelyDeleteStorageFolder(supabaseClient, bucketName, `${folderPath}/${folder.name}`);
    }
  }
}

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

    // 2. New Storage Cleanup: Recursively delete project folder from storage
    console.log(`Starting robust storage cleanup for project ${projectId}.`);
    
    const buckets = new Set<string>();

    // 2.a Get buckets from project resources
    const { data: projectResources } = await supabaseClient
        .from('dialectic_project_resources')
        .select('storage_bucket')
        .eq('project_id', projectId);
        
    if (projectResources) projectResources.forEach(r => buckets.add(r.storage_bucket));

    // 2.b Get buckets from contributions via sessions
    const { data: sessions } = await supabaseClient
        .from('dialectic_sessions')
        .select('id')
        .eq('project_id', projectId);

    if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id);
        const { data: contributions } = await supabaseClient
            .from('dialectic_contributions')
            .select('storage_bucket')
            .in('session_id', sessionIds);
        
        if (contributions) contributions.forEach(c => c.storage_bucket && buckets.add(c.storage_bucket));
    }
    
    // The folder path convention is assumed to be `projects/{projectId}`.
    // This is consistent with `cloneProject` and other parts of the application.
    const projectFolderPath = `projects/${projectId}`;
    console.log(`Found buckets to clean for project ${projectId}:`, Array.from(buckets));

    const cleanupPromises = Array.from(buckets).map(bucketName => {
        console.log(`Recursively deleting contents from bucket '${bucketName}' in folder '${projectFolderPath}'...`);
        return recursivelyDeleteStorageFolder(supabaseClient, bucketName, projectFolderPath);
    });

    await Promise.all(cleanupPromises);
    console.log(`Completed storage cleanup for project ${projectId}.`);

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
    if (e instanceof Error) {
        return { error: {message: `An unexpected error occurred while deleting the project.`, details: JSON.stringify({ name: e.name, message: e.message, stack: e.stack }) }, status: 500 };
    }
    return { error: {message: `An unexpected and non-error object was caught during project deletion.`, details: JSON.stringify(e) }, status: 500 };
  }
} 