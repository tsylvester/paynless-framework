import type { Database } from '../../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { ProjectContext } from '../prompt-assembler.interface.ts';
import type { ILogger } from '../types.ts';
import type { DownloadFromStorageFn } from '../../_shared/supabase_storage_utils.ts';

export async function getInitialPromptContent(
    dbClient: SupabaseClient<Database>,
    project: ProjectContext,
    logger: ILogger,
    downloadFromStorage: DownloadFromStorageFn
): Promise<{ content?: string; storagePath?: string; error?: string } | undefined> {
    if (project.initial_user_prompt) {
        logger.info(`[getInitialPromptContent] Using direct initial_user_prompt for project ${project.id}.`);
        return { content: project.initial_user_prompt };
    }

    if (project.initial_prompt_resource_id) {
        logger.info(`[getInitialPromptContent] No direct prompt, attempting to fetch from resource ID ${project.initial_prompt_resource_id} for project ${project.id}.`);
        const { data: resource, error: resourceError } = await dbClient
            .from('dialectic_project_resources')
            .select('storage_bucket, storage_path, file_name')
            .eq('id', project.initial_prompt_resource_id)
            .single();

        if (resourceError || !resource) {
            logger.error(`[getInitialPromptContent] Could not find dialectic_project_resources record for ID ${project.initial_prompt_resource_id}.`, { dbError: resourceError });
            return { error: `Could not find prompt resource details for ID ${project.initial_prompt_resource_id}.` };
        }
        
        if (!resource.storage_bucket || !resource.storage_path || !resource.file_name) {
            logger.error(`[getInitialPromptContent] Resource record ${project.initial_prompt_resource_id} is missing storage bucket, path, or file name.`);
            return { error: `Resource record for prompt is incomplete.` };
        }

        const fullPath = `${resource.storage_path}/${resource.file_name}`;

        const { data: fileContent, error: downloadError } = await downloadFromStorage(
            dbClient,
            resource.storage_bucket,
            fullPath
        );

        if (downloadError || !fileContent) {
            logger.error(`[getInitialPromptContent] Failed to download initial prompt from storage for resource ID ${project.initial_prompt_resource_id}.`, { error: downloadError });
            return { error: `Failed to download initial prompt from storage.` };
        }

        const promptText = new TextDecoder().decode(fileContent);
        logger.info(`[getInitialPromptContent] Successfully downloaded and decoded initial prompt for project ${project.id}.`);
        return { content: promptText, storagePath: fullPath };
    }

    logger.warn(`[getInitialPromptContent] Project ${project.id} has neither a direct prompt nor a resource file.`);
    return { error: 'No prompt provided.' };
} 