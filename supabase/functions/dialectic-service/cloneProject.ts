import { SupabaseClient } from "npm:@supabase/supabase-js@^2.43.4";
import type { Database, Json } from "../types_db.ts";
// import * as uuid from "https://deno.land/std@0.190.0/uuid/mod.ts"; // Replaced with crypto.randomUUID()
import type { FileObject } from "npm:@supabase/storage-js@^2.5.5"; // For deleteStorageFolder
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';
import type { 
    IFileManager, 
    UploadContext, 
    PathContext, 
    FileType,
} from "../_shared/types/file_manager.types.ts";

type DialecticProjectRow = Database['public']['Tables']['dialectic_projects']['Row'];
type DialecticProjectInsert = Database['public']['Tables']['dialectic_projects']['Insert'];
type DialecticProjectResourceRow = Database['public']['Tables']['dialectic_project_resources']['Row']; // For typing original resources
type DialecticSessionInsert = Database['public']['Tables']['dialectic_sessions']['Insert'];
type DialecticContributionRow = Database['public']['Tables']['dialectic_contributions']['Row'];

export interface CloneProjectResult {
    data: DialecticProjectRow | null;
    error: { message: string; details?: unknown; code?: string } | null;
}

// List of all known FileType literals for validation.
// Keep this in sync with the actual FileType definition in _shared/types/file_manager.types.ts
const AllKnownFileTypes: FileType[] = [
    'project_readme', 'initial_user_prompt', 'user_prompt', 'system_settings', 'seed_prompt',
    'model_contribution_main', 'model_contribution_raw_json', 'user_feedback',
    'contribution_document', 'general_resource', 'iteration_summary_md'
];

function getFileTypeFromResourceDescription(
    descriptionJson: Json | null | undefined,
    defaultType: FileType = 'general_resource'
): FileType {
    let descriptionString: string | null = null;
    if (typeof descriptionJson === 'string') {
        descriptionString = descriptionJson;
    } else if (descriptionJson !== null && descriptionJson !== undefined) {
        descriptionString = JSON.stringify(descriptionJson);
    }

    if (typeof descriptionString === 'string' && descriptionString.trim() !== '') {
        try {
            const parsed = JSON.parse(descriptionString);
            if (parsed && typeof parsed.type === 'string' && AllKnownFileTypes.includes(parsed.type as FileType)) {
                return parsed.type as FileType;
            }
        } catch (e) {
            console.warn('[cloneProject] Could not parse resource_description string to determine FileType, defaulting.', descriptionString, e);
        }
    }
    return defaultType;
}

async function deleteStorageFolder(supabaseClient: SupabaseClient<Database>, bucket: string, folderPath: string) {
    const { data: files, error: listError } = await supabaseClient.storage.from(bucket).list(folderPath);
    if (listError) {
        console.error(`[cloneProject-Rollback] Error listing files in ${bucket}/${folderPath}:`, listError);
        return;
    }
    if (files && files.length > 0) {
        const filePathsToRemove = files.map((file: FileObject) => `${folderPath}/${file.name}`);
        if (filePathsToRemove.length > 0) {
            const validFilePaths = filePathsToRemove.filter(p => p && p !== folderPath);
            if (validFilePaths.length === 0 && files.length > 0 && files[0].name === null && folderPath) { 
                 console.warn(`[cloneProject-Rollback] Attempting to remove folder content for ${bucket}/${folderPath}, but derived file paths are empty. Original files:`, files)
            }

            if (validFilePaths.length > 0) {
                const { error: removeError } = await supabaseClient.storage.from(bucket).remove(validFilePaths);
                if (removeError) {
                    console.error(`[cloneProject-Rollback] Error removing files from ${bucket}/${folderPath}:`, removeError);
                } else {
                    console.log(`[cloneProject-Rollback] Successfully removed files from ${bucket}/${folderPath}:`, validFilePaths);
                }
            } else {
                 console.log(`[cloneProject-Rollback] No valid file paths to remove in ${bucket}/${folderPath}. files: ${JSON.stringify(files)}`);
            }
        }
    }
}

export async function cloneProject(
    supabaseClient: SupabaseClient<Database>,
    fileManager: IFileManager,
    originalProjectId: string,
    newProjectName: string | undefined,
    cloningUserId: string
): Promise<CloneProjectResult> {
    console.log(`[cloneProject] Initiated for original project ID: ${originalProjectId} by user: ${cloningUserId} using FileManager.`);

    let actualClonedProjectId: string | null = null; 
    // newStorageFilesCreated is removed as FileManagerService handles file registration and paths.

    try {
        const { data: originalProject, error: fetchError } = await supabaseClient
            .from('dialectic_projects')
            .select('*')
            .eq('id', originalProjectId)
            .single();

        if (fetchError || !originalProject) {
            console.error('[cloneProject] Error fetching original project:', fetchError);
            return { data: null, error: { message: 'Original project not found or database error.', details: fetchError } };
        }

        if (originalProject.user_id !== cloningUserId) {
            console.warn(`[cloneProject] Authorization failed: User ${cloningUserId} does not own project ${originalProjectId}`);
            return { data: null, error: { message: 'Original project not found or not accessible.' } };
        }

        const generatedProjectId = crypto.randomUUID();
        const actualNewProjectName = newProjectName || `[CLONE] ${originalProject.project_name}`;
        const now = new Date().toISOString();

        console.log(`[cloneProject] Cloning project '${originalProject.project_name}' to '${actualNewProjectName}' with generated ID: ${generatedProjectId}`);

        const newProjectInsertData: DialecticProjectInsert = {
            id: generatedProjectId,
            user_id: cloningUserId,
            project_name: actualNewProjectName,
            initial_user_prompt: originalProject.initial_user_prompt,
            process_template_id: originalProject.process_template_id,
            selected_domain_id: originalProject.selected_domain_id,
            selected_domain_overlay_id: originalProject.selected_domain_overlay_id ?? undefined,
            user_domain_overlay_values: originalProject.user_domain_overlay_values ?? undefined,
            repo_url: originalProject.repo_url ?? undefined,
            status: originalProject.status || 'draft',
            created_at: now,
            updated_at: now,
            // initial_prompt_resource_id will be updated if an initial_user_prompt type resource is cloned.
        };

        const { data: newProjectData, error: insertProjectError } = await supabaseClient
            .from('dialectic_projects')
            .insert([newProjectInsertData])
            .select()
            .single();

        if (insertProjectError || !newProjectData) {
            console.error('[cloneProject] Error inserting new project:', insertProjectError);
            return { data: null, error: { message: 'Failed to create new project entry.', details: insertProjectError } };
        }
        
        actualClonedProjectId = newProjectData.id;
        console.log(`[cloneProject] New project entry created successfully with actual ID: ${actualClonedProjectId}`);

        const { data: originalResourcesTyped, error: fetchResourcesError } = await supabaseClient
            .from('dialectic_project_resources')
            .select('*')
            .eq('project_id', originalProjectId);

        if (fetchResourcesError) console.warn('[cloneProject] Error fetching project resources:', fetchResourcesError);
        const originalResources = originalResourcesTyped as DialecticProjectResourceRow[] | null;

        if (originalResources && originalResources.length > 0) {
            console.log(`[cloneProject] Cloning ${originalResources.length} project resources using FileManager.`);
            for (const res of originalResources) {
                if (!res.storage_bucket || !res.storage_path || !res.file_name) {
                    console.warn(`[cloneProject] Skipping resource ${res.id} due to missing storage details or file name.`);
                    continue;
                }

                console.log(`[cloneProject] Downloading original resource file: ${res.storage_bucket}/${res.storage_path}`);
                const { data: fileBlob, error: downloadError } = await supabaseClient.storage
                    .from(res.storage_bucket)
                    .download(res.storage_path);

                if (downloadError || !fileBlob) {
                    console.error('[cloneProject] Failed to download project resource content:', res.storage_path, downloadError);
                    throw new Error(`Failed to download project resource ${res.file_name}.`);
                }
                const fileContentBuffer = Buffer.from(await fileBlob.arrayBuffer());

                const resourceFileType = getFileTypeFromResourceDescription(res.resource_description);
                
                let stringifiedDescription: string | undefined = undefined;
                if (res.resource_description !== null && res.resource_description !== undefined) {
                    stringifiedDescription = typeof res.resource_description === 'string' ? res.resource_description : JSON.stringify(res.resource_description);
                }

                const pathContext: PathContext = {
                    projectId: actualClonedProjectId!,
                    fileType: resourceFileType,
                    originalFileName: res.file_name,
                    // sessionId, iteration, stageSlug, modelSlug are not typically applicable for project-level resources
                };

                const uploadContext: UploadContext = {
                    pathContext,
                    fileContent: fileContentBuffer,
                    mimeType: res.mime_type || 'application/octet-stream',
                    sizeBytes: fileContentBuffer.length, // Use actual downloaded buffer length
                    userId: cloningUserId,
                    description: stringifiedDescription,
                };
                
                console.log(`[cloneProject] Uploading resource ${res.file_name} via FileManager for new project ${actualClonedProjectId}`);
                const { record: newResourceRecord, error: fmError } = await fileManager.uploadAndRegisterFile(uploadContext);

                if (fmError || !newResourceRecord) {
                    console.error('[cloneProject] FileManager failed to upload/register project resource:', res.file_name, fmError);
                    throw new Error(`FileManager failed for project resource ${res.file_name}: ${fmError?.message}`);
                }
                console.log(`[cloneProject] Resource ${res.file_name} cloned successfully by FileManager. New record ID: ${newResourceRecord.id}`);
                 // If the cloned resource was the initial prompt for the original project, update the new project
                if (originalProject.initial_prompt_resource_id === res.id && resourceFileType === 'initial_user_prompt') {
                    const { error: updatePromptIdError } = await supabaseClient
                        .from('dialectic_projects')
                        .update({ initial_prompt_resource_id: newResourceRecord.id })
                        .eq('id', actualClonedProjectId!);
                    if (updatePromptIdError) {
                        console.warn(`[cloneProject] Failed to update initial_prompt_resource_id for new project:`, updatePromptIdError);
                        // Non-critical, but log it.
                    } else {
                        console.log(`[cloneProject] Successfully updated initial_prompt_resource_id on new project to ${newResourceRecord.id}`);
                    }
                }
            }
        }

        const { data: originalSessions, error: fetchSessionsError } = await supabaseClient
            .from('dialectic_sessions')
            .select('*')
            .eq('project_id', originalProjectId);

        if (fetchSessionsError) console.warn('[cloneProject] Error fetching sessions:', fetchSessionsError);

        if (originalSessions && originalSessions.length > 0) {
            console.log(`[cloneProject] Cloning ${originalSessions.length} sessions.`);
            for (const originalSession of originalSessions) {
                const newSessionIdInternal = crypto.randomUUID();
                console.log(`[cloneProject] Cloning session ${originalSession.id} to new internal ID ${newSessionIdInternal}`);

                const newSessionInsert: DialecticSessionInsert = {
                    id: newSessionIdInternal,
                    project_id: actualClonedProjectId!,
                    session_description: originalSession.session_description ?? undefined,
                    iteration_count: originalSession.iteration_count,
                    selected_model_catalog_ids: originalSession.selected_model_catalog_ids ?? undefined,
                    user_input_reference_url: originalSession.user_input_reference_url ?? undefined,
                    current_stage_id: originalSession.current_stage_id,
                    status: originalSession.status,
                    associated_chat_id: originalSession.associated_chat_id ?? undefined,
                    created_at: now,
                    updated_at: now,
                };
                const { data: newSessionData, error: insertSessionError } = await supabaseClient
                    .from('dialectic_sessions')
                    .insert([newSessionInsert])
                    .select('id') 
                    .single();

                if (insertSessionError || !newSessionData) {
                    console.error(`[cloneProject] Error inserting new session for ${originalSession.id}:`, insertSessionError);
                    throw new Error('Failed to insert new session entry or retrieve its ID.');
                }
                const actualNewSessionId = newSessionData.id;
                console.log(`[cloneProject] New session entry created successfully with actual ID: ${actualNewSessionId}`);

                const { data: originalContributionsRows, error: fetchContError } = await supabaseClient
                    .from('dialectic_contributions')
                    .select('*')
                    .eq('session_id', originalSession.id);
                
                if (fetchContError) console.warn(`[cloneProject] Error fetching contributions for ${originalSession.id}:`, fetchContError);
                const originalContributions = originalContributionsRows as DialecticContributionRow[] | null;

                if (originalContributions && originalContributions.length > 0) {
                    console.log(`[cloneProject] Cloning ${originalContributions.length} contributions for session ${actualNewSessionId} using FileManager.`);
                    for (const originalContrib of originalContributions) {
                        
                        let mainFileContentBuffer: Buffer | undefined = undefined;
                        let mainFileOriginalName = originalContrib.file_name || `${originalContrib.id}.md`; // Default if file_name is null/empty
                        const mainFileMimeType = originalContrib.mime_type || 'application/octet-stream';
                        
                        if (originalContrib.storage_bucket && originalContrib.storage_path) {
                            console.log(`[cloneProject] Downloading original main contribution content: ${originalContrib.storage_bucket}/${originalContrib.storage_path}`);
                            const { data: mainBlob, error: downloadMainError } = await supabaseClient.storage
                                .from(originalContrib.storage_bucket)
                                .download(originalContrib.storage_path);
                            if (downloadMainError || !mainBlob) {
                                console.error('[cloneProject] Failed to download main contribution content:', originalContrib.storage_path, downloadMainError);
                                // Decide if this is a fatal error or if we can proceed without it
                                // For now, let's treat it as fatal for the contribution
                                throw new Error(`Failed to download main content for contribution ${originalContrib.id}`);
                            }
                            mainFileContentBuffer = Buffer.from(await mainBlob.arrayBuffer());
                            if (!originalContrib.file_name) { // If filename was missing, infer from path
                                const pathParts = originalContrib.storage_path.split('/');
                                mainFileOriginalName = pathParts[pathParts.length -1] || `${originalContrib.id}.bin`;
                            }
                        }

                        let rawJsonResponseString: string = ""; // Initialize as empty string
                        if (originalContrib.raw_response_storage_path) {
                            const rawBucket = originalContrib.storage_bucket || 'dialectic-contributions'; // Assume same bucket or a default
                             console.log(`[cloneProject] Downloading original raw JSON response: ${rawBucket}/${originalContrib.raw_response_storage_path}`);
                            const { data: rawBlob, error: downloadRawError } = await supabaseClient.storage
                                .from(rawBucket)
                                .download(originalContrib.raw_response_storage_path);
                            if (downloadRawError || !rawBlob) {
                                console.warn('[cloneProject] Failed to download raw JSON response, proceeding with caution (raw content will be empty string):', originalContrib.raw_response_storage_path, downloadRawError);
                                // rawJsonResponseString remains "" as initialized
                            } else {
                                rawJsonResponseString = await rawBlob.text();
                            }
                        } 
                        // No else needed here, rawJsonResponseString is already initialized to ""
                        
                        // If there's no main content, but there is raw JSON, the primary fileType should reflect the raw JSON.
                        // However, UploadContext is structured for a main file + optional raw in metadata.
                        // Let's assume for now that if mainFileContentBuffer is undefined, we can't make a valid 'model_contribution_main'
                        // This might require a more nuanced approach if contributions can be *only* raw JSON.
                        // For now, if no main content, we might skip or log an error.
                        // The design of FileManagerService expects `fileContent` in UploadContext for the primary file.
                        if (!mainFileContentBuffer && rawJsonResponseString === "") {
                             console.warn(`[cloneProject] Skipping contribution ${originalContrib.id} as it has no main content AND no raw JSON content to clone.`);
                             continue;
                        }
                        
                        // If only raw JSON is present, and no main content, how to handle PathContext.fileType and UploadContext.fileContent?
                        // Option: Use 'model_contribution_raw_json' as fileType, and put rawJSON as fileContent.
                        // However, UploadContext.contributionMetadata.rawJsonResponseContent is for the *associated* raw.
                        // For now, if main content is missing, we make the raw JSON the "main" content for the purpose of FM upload.
                        let effectiveFileType: FileType = 'model_contribution_main';
                        let effectiveFileContent: Buffer;
                        let effectiveMimeType = mainFileMimeType;
                        let effectiveFileName = mainFileOriginalName;

                        if (!mainFileContentBuffer && rawJsonResponseString !== "") {
                            console.warn(`[cloneProject] Main content missing for ${originalContrib.id}, using raw JSON as main for FileManager upload.`);
                            effectiveFileType = 'model_contribution_raw_json';
                            effectiveFileContent = Buffer.from(rawJsonResponseString);
                            effectiveMimeType = 'application/json';
                            effectiveFileName = `${originalContrib.id}_raw.json`;
                        } else if (!mainFileContentBuffer) { // Should have been caught by the check above
                            console.error(`[cloneProject] Critical: No main content for contribution ${originalContrib.id} and raw JSON is also empty, cannot proceed.`);
                            throw new Error(`No main content or raw JSON for contribution ${originalContrib.id}.`);
                        }
                        else {
                            effectiveFileContent = mainFileContentBuffer;
                        }

                        if (!originalContrib.model_id) {
                            console.error(`[cloneProject] Critical: model_id is null for original contribution ${originalContrib.id}. Cannot clone.`);
                            throw new Error(`Original contribution ${originalContrib.id} has a null model_id.`);
                        }
                        if (!originalContrib.model_name) {
                            console.error(`[cloneProject] Critical: model_name is null for original contribution ${originalContrib.id}. Cannot clone.`);
                            throw new Error(`Original contribution ${originalContrib.id} has a null model_name.`);
                        }

                        const contribPathContext: PathContext = {
                            projectId: actualClonedProjectId!,
                            sessionId: actualNewSessionId,
                            fileType: effectiveFileType, 
                            originalFileName: effectiveFileName,
                            iteration: originalContrib.iteration_number,
                            stageSlug: originalContrib.stage,
                            // modelSlug might be derivable if needed by PathConstructor
                        };

                        const contribUploadContext: UploadContext = {
                            pathContext: contribPathContext,
                            fileContent: effectiveFileContent,
                            mimeType: effectiveMimeType,
                            sizeBytes: effectiveFileContent.length,
                            userId: originalContrib.user_id || cloningUserId, // Prefer original user_id if available, else cloning user
                            contributionMetadata: {
                                sessionId: actualNewSessionId,
                                modelIdUsed: originalContrib.model_id, // This is ai_models.id
                                modelNameDisplay: originalContrib.model_name,
                                stageSlug: originalContrib.stage,
                                iterationNumber: originalContrib.iteration_number,
                                rawJsonResponseContent: rawJsonResponseString, // Rely on rawJsonResponseString being string due to initialization and assignments
                                tokensUsedInput: originalContrib.tokens_used_input ?? undefined,
                                tokensUsedOutput: originalContrib.tokens_used_output ?? undefined,
                                processingTimeMs: originalContrib.processing_time_ms ?? undefined,
                                citations: originalContrib.citations ?? undefined,
                                contributionType: originalContrib.contribution_type ?? undefined,
                                errorDetails: originalContrib.error ?? undefined, // Corrected from error_details
                                promptTemplateIdUsed: originalContrib.prompt_template_id_used ?? undefined,
                                targetContributionId: originalContrib.target_contribution_id ?? undefined,
                                editVersion: 1, // New clone is version 1
                                isLatestEdit: true,
                                originalModelContributionId: null, // This is a new contribution in the cloned project
                                // seedPromptStoragePath: originalContrib.seed_prompt_url - this needs careful handling if it refers to old project paths
                            }
                        };
                        // If the main file IS the raw_json, then metadata.rawJsonResponseContent should be an empty string
                        if (effectiveFileType === 'model_contribution_raw_json' && contribUploadContext.contributionMetadata) {
                            contribUploadContext.contributionMetadata.rawJsonResponseContent = "";
                        }


                        console.log(`[cloneProject] Uploading contribution ${originalContrib.id} via FileManager for new session ${actualNewSessionId}`);
                        const { record: newContribRecord, error: fmContribError } = await fileManager.uploadAndRegisterFile(contribUploadContext);

                        if (fmContribError || !newContribRecord) {
                            console.error('[cloneProject] FileManager failed to upload/register contribution:', originalContrib.id, fmContribError);
                            throw new Error(`FileManager failed for contribution ${originalContrib.id}: ${fmContribError?.message}`);
                        }
                        console.log(`[cloneProject] Contribution ${originalContrib.id} cloned successfully by FileManager. New record ID: ${(newContribRecord as DialecticContributionRow).id}`);
                    }
                }
            }
        }

        // Fetch the fully cloned project to return
        const { data: finalClonedProject, error: finalFetchError } = await supabaseClient
            .from('dialectic_projects')
            .select('*')
            .eq('id', actualClonedProjectId!)
            .single();

        if (finalFetchError || !finalClonedProject) {
            console.error('[cloneProject] Failed to fetch the fully cloned project for return:', finalFetchError);
            // Non-fatal for the clone itself if previous steps succeeded, but indicates an issue.
            // Return what we have from newProjectData if available, otherwise an error.
             if (newProjectData) return { data: newProjectData, error: null }; // Return the initially inserted project data
            return { data: null, error: { message: 'Clone completed but failed to re-fetch final project data.', details: finalFetchError } };
        }

        console.log(`[cloneProject] Clone process completed successfully for project: ${actualClonedProjectId}`);
        return { data: finalClonedProject, error: null };

    } catch (error) {
        console.error('[cloneProject] Unhandled error during clone process:', error);
        if (actualClonedProjectId) {
            console.warn(`[cloneProject-Rollback] Attempting to delete partially cloned project ID: ${actualClonedProjectId}`);
            try {
                const { error: deleteProjectError } = await supabaseClient
                    .from('dialectic_projects')
                    .delete()
                    .eq('id', actualClonedProjectId);
                if (deleteProjectError) {
                    console.error('[cloneProject-Rollback] Failed to delete project entry:', deleteProjectError);
                } else {
                    console.log(`[cloneProject-Rollback] Successfully deleted project entry: ${actualClonedProjectId}`);
                }
                
                // Best-effort storage cleanup for the new project's folder.
                // FileManagerService should ideally handle its own orphans if its operations fail mid-way.
                // This targets the main project folder. Buckets might differ for resources/contributions.
                // For now, assuming a primary 'projects' bucket or similar convention for the root.
                // The actual bucket name for project resources/contributions is determined by FileManagerService.
                // A more robust rollback would need to know all buckets used by FM for this project.
                // This is a simplified best-effort.
                console.log(`[cloneProject-Rollback] Attempting best-effort storage cleanup for folder projects/${actualClonedProjectId}`);
                await deleteStorageFolder(supabaseClient, 'projects', `projects/${actualClonedProjectId}`); // Assuming 'projects' bucket as a common root
                // For contributions, paths might be like `projects/PROJECT_ID/SESSION_ID/...`
                // These would need more specific targeting if `deleteStorageFolder` were to be fully effective.
                // However, without knowing session IDs created under the new project if they failed partway, this is hard.

            } catch (rollbackError) {
                console.error('[cloneProject-Rollback] Critical error during rollback process:', rollbackError);
            }
        }
        return { 
            data: null, 
            error: { 
                message: error instanceof Error ? error.message : 'An unexpected error occurred during cloning.', 
                details: error 
            } 
        };
    }
}
