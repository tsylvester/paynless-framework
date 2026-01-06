import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
	GetSeedPromptForStageFn,
	isResourceDescription,
	SeedPromptData,
} from '../../dialectic-service/dialectic.interface.ts';
import type { Database } from '../../types_db.ts';
import type { DownloadStorageResult } from '../supabase_storage_utils.ts';


export const getSeedPromptForStage: GetSeedPromptForStageFn = async (
  dbClient: SupabaseClient<Database>,
  projectId: string,
  sessionId: string,
  stageSlug: string,
  iterationNumber: number,
  downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>
): Promise<SeedPromptData> => {
  const { data: projectResources, error: projectResourcesError } = await dbClient
    .from('dialectic_project_resources')
    .select('storage_bucket, storage_path, resource_description, file_name')
    .eq('project_id', projectId);

  if (projectResourcesError) {
    throw new Error(`Could not fetch project resources: ${projectResourcesError.message}`);
  }

  const seedPromptResource = projectResources.find(resource => {
    const desc = resource.resource_description;
    if (desc && typeof desc === 'object' && !Array.isArray(desc) && isResourceDescription(desc)) {
      return desc.type === 'seed_prompt' &&
             desc.session_id === sessionId &&
             desc.stage_slug === stageSlug &&
             desc.iteration === iterationNumber;
    }
    return false;
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

  const { data: promptContentBuffer, error: promptDownloadError } = await downloadFromStorage(seedPromptBucketName, fullSeedPromptPath);

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

export async function getSourceStage(
  dbClient: SupabaseClient<Database>,
  sessionId: string,
  currentTargetStageId: string
): Promise<Database['public']['Tables']['dialectic_stages']['Row']> {
  // 1. Get the project_id from the session
  const { data: sessionData, error: sessionError } = await dbClient
    .from('dialectic_sessions')
    .select('project_id')
    .eq('id', sessionId)
    .single();

  if (sessionError) {
    throw new Error(`Could not fetch session details: ${sessionError.message}`);
  }
  if (!sessionData) {
    throw new Error(`Session with id ${sessionId} not found.`);
  }

  const { project_id: projectId } = sessionData;

  // 2. Get the process_template_id from the project
  const { data: projectData, error: projectError } = await dbClient
    .from('dialectic_projects')
    .select('process_template_id')
    .eq('id', projectId)
    .single();

  if (projectError) {
    throw new Error(`Could not fetch project details: ${projectError.message}`);
  }
  if (!projectData || !projectData.process_template_id) {
    throw new Error(`Project with id ${projectId} not found or has no process template.`);
  }

  const { process_template_id: processTemplateId } = projectData;

  // 3. Find the transition where the current stage is the target
  const { data: transitionData, error: transitionError } = await dbClient
    .from('dialectic_stage_transitions')
    .select('source_stage_id')
    .eq('process_template_id', processTemplateId)
    .eq('target_stage_id', currentTargetStageId)
    .single();

  if (transitionError && transitionError.code !== 'PGRST116') {
    throw new Error(`Error fetching stage transition: ${transitionError.message}`);
  }
  if (!transitionData) {
    throw new Error(
      `No source stage found for target stage ${currentTargetStageId} in process template ${processTemplateId}.`
    );
  }

  const { source_stage_id: sourceStageId } = transitionData;

  // 4. Fetch the full source stage details
  const { data: sourceStageData, error: sourceStageError } = await dbClient
    .from('dialectic_stages')
    .select('*')
    .eq('id', sourceStageId)
    .single();

  if (sourceStageError) {
    throw new Error(`Error fetching source stage details: ${sourceStageError.message}`);
  }
  if (!sourceStageData) {
    throw new Error(`Source stage with id ${sourceStageId} not found.`);
  }

  return sourceStageData;
} 