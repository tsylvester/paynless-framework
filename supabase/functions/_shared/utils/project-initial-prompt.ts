import type { Database } from '../../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { ProjectContext } from '../prompt-assembler.ts';
import type { ILogger } from '../types.ts';

export async function getInitialPromptContent(
    dbClient: SupabaseClient<Database>,
    project: ProjectContext,
    logger: ILogger
): Promise<{ content?: string; storagePath?: string; error?: string } | undefined> {
    if (project.initial_user_prompt) {
        logger.info(`[getInitialPromptContent] Using direct initial_user_prompt for project ${project.id}.`);
        return { content: project.initial_user_prompt };
    }

    if (project.initial_prompt_resource_id) {
        logger.info(`[getInitialPromptContent] No direct prompt, attempting to fetch from resource ID ${project.initial_prompt_resource_id} for project ${project.id}.`);
        const { data: resource, error: resourceError } = await dbClient
            .from('dialectic_project_resources')
            .select('storage_bucket, storage_path')
            .eq('id', project.initial_prompt_resource_id)
            .single();

        if (resourceError || !resource) {
            logger.error(`[getInitialPromptContent] Could not find dialectic_project_resources record for ID ${project.initial_prompt_resource_id}.`, { dbError: resourceError });
            return { error: `Could not find prompt resource details for ID ${project.initial_prompt_resource_id}.` };
        }
        
        // We don't download the content anymore, we pass the path for the service to copy
        return { content: '', storagePath: resource.storage_path };
    }

    logger.warn(`[getInitialPromptContent] Project ${project.id} has neither a direct prompt nor a resource file.`);
    return { content: 'No prompt provided.' }; // Fallback content
} 