import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import { isResourceDescription } from '../../dialectic-service/dialectic.interface.ts';
import type { DownloadFromStorageFn } from '../supabase_storage_utils.ts';

export type SeedPromptData = {
  content: string;
  fullPath: string;
  bucket: string;
  path: string;
  fileName: string;
};

export async function getSeedPromptForStage(
  dbClient: SupabaseClient<Database>,
  projectId: string,
  sessionId: string,
  stageSlug: string,
  iterationNumber: number,
  downloadFromStorage: DownloadFromStorageFn
): Promise<SeedPromptData> {
  const { data: projectResources, error: projectResourcesError } = await dbClient
    .from('dialectic_project_resources')
    .select('storage_bucket, storage_path, resource_description, file_name')
    .eq('project_id', projectId);

  if (projectResourcesError) {
    throw new Error(`Could not fetch project resources: ${projectResourcesError.message}`);
  }

  const seedPromptResource = projectResources.find(resource => {
    if (typeof resource.resource_description !== 'string') {
      if (resource.resource_description && typeof resource.resource_description === 'object' && !Array.isArray(resource.resource_description)) {
        const desc = resource.resource_description; // No cast needed
        if (isResourceDescription(desc)) {
          return desc.type === 'seed_prompt' &&
                 desc.session_id === sessionId &&
                 desc.stage_slug === stageSlug &&
                 desc.iteration === iterationNumber;
        }
      }
      return false;
    }
    try {
      const desc = JSON.parse(resource.resource_description);
      if (isResourceDescription(desc)) {
        return desc.type === 'seed_prompt' &&
               desc.session_id === sessionId &&
               desc.stage_slug === stageSlug &&
               desc.iteration === iterationNumber;
      }
      return false;
    } catch (e) {
      // Log parsing failure but continue search
      console.debug(`Failed to parse resource_description for resource ${resource.file_name}`, { error: e });
      return false;
    }
  });

  if (!seedPromptResource) {
    throw new Error(`No specific seed prompt resource found matching criteria for session ${sessionId}, project ${projectId}, stage ${stageSlug}, iteration ${iterationNumber}`);
  }

  const {
    storage_bucket: seedPromptBucketName,
    storage_path: seedPromptDir,
    file_name: seedPromptFileName,
  } = seedPromptResource;

  if (!seedPromptDir || !seedPromptFileName || !seedPromptBucketName) {
    throw new Error('Seed prompt resource metadata is incomplete (missing path, filename, or bucket).');
  }

  const cleanedDir = seedPromptDir.endsWith('/') ? seedPromptDir.slice(0, -1) : seedPromptDir;
  const cleanedFileName = seedPromptFileName.startsWith('/') ? seedPromptFileName.slice(1) : seedPromptFileName;
  const fullSeedPromptPath = `${cleanedDir}/${cleanedFileName}`;

  const { data: promptContentBuffer, error: promptDownloadError } = await downloadFromStorage(dbClient, seedPromptBucketName, fullSeedPromptPath);

  if (promptDownloadError || !promptContentBuffer) {
    throw new Error(`Could not retrieve the seed prompt for this stage. Details: ${promptDownloadError?.message}`);
  }

  const renderedPrompt = new TextDecoder().decode(promptContentBuffer);

  if (!renderedPrompt || renderedPrompt.trim() === "") {
    throw new Error('Rendered seed prompt is empty. Cannot proceed.');
  }

  return { 
      content: renderedPrompt, 
      fullPath: fullSeedPromptPath,
      bucket: seedPromptBucketName,
      path: seedPromptDir,
      fileName: seedPromptFileName,
  };
} 