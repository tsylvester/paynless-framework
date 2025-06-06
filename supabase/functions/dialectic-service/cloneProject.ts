import { SupabaseClient } from "npm:@supabase/supabase-js@^2.39.3";
import type { Database } from "../types_db.ts";
// import * as uuid from "https://deno.land/std@0.190.0/uuid/mod.ts"; // Replaced with crypto.randomUUID()
import type { FileObject } from "npm:@supabase/storage-js@^2.5.5"; // For deleteStorageFolder

type DialecticProjectRow = Database['public']['Tables']['dialectic_projects']['Row'];
type DialecticProjectInsert = Database['public']['Tables']['dialectic_projects']['Insert'];
type DialecticProjectResourceInsert = Database['public']['Tables']['dialectic_project_resources']['Insert'];
type DialecticSessionInsert = Database['public']['Tables']['dialectic_sessions']['Insert'];
type DialecticContributionRow = Database['public']['Tables']['dialectic_contributions']['Row'];
type DialecticContributionInsert = Database['public']['Tables']['dialectic_contributions']['Insert'];

export interface CloneProjectResult {
    data: DialecticProjectRow | null;
    error: { message: string; details?: unknown; code?: string } | null;
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
            const { error: removeError } = await supabaseClient.storage.from(bucket).remove(filePathsToRemove);
            if (removeError) {
                console.error(`[cloneProject-Rollback] Error removing files from ${bucket}/${folderPath}:`, removeError);
            }
        }
    }
}

export async function cloneProject(
    supabaseClient: SupabaseClient<Database>,
    originalProjectId: string,
    newProjectName: string | undefined,
    cloningUserId: string
): Promise<CloneProjectResult> {
    console.log(`[cloneProject] Initiated for original project ID: ${originalProjectId} by user: ${cloningUserId}`);

    let actualClonedProjectId: string | null = null; 
    const newStorageFilesCreated: { bucket: string, path: string }[] = [];

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
            selected_domain_tag: originalProject.selected_domain_tag ?? undefined,
            selected_domain_overlay_id: originalProject.selected_domain_overlay_id ?? undefined,
            user_domain_overlay_values: originalProject.user_domain_overlay_values ?? undefined,
            repo_url: originalProject.repo_url ?? undefined,
            status: originalProject.status || 'draft',
            created_at: now,
            updated_at: now,
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

        const { data: originalResources, error: fetchResourcesError } = await supabaseClient
            .from('dialectic_project_resources')
            .select('*')
            .eq('project_id', originalProjectId);

        if (fetchResourcesError) console.warn('[cloneProject] Error fetching project resources:', fetchResourcesError);

        if (originalResources && originalResources.length > 0) {
            console.log(`[cloneProject] Cloning ${originalResources.length} project resources.`);
            const newClonedResources: DialecticProjectResourceInsert[] = [];
            for (const res of originalResources) {
                const newResId = crypto.randomUUID();
                const newStoragePath = `projects/${actualClonedProjectId!}/resources/${res.file_name}`;
                if (res.storage_bucket && res.storage_path) {
                    console.log(`[cloneProject] Copying resource file from ${res.storage_path} to ${newStoragePath}`);
                    const { error: storageCopyError } = await supabaseClient.storage
                        .from(res.storage_bucket)
                        .copy(res.storage_path, newStoragePath);
                    if (storageCopyError) {
                        console.error('[cloneProject] Storage copy failed for project resource:', res.storage_path, storageCopyError);
                        throw new Error('Failed to copy project resource files to storage during clone.');
                    }
                    newStorageFilesCreated.push({ bucket: res.storage_bucket, path: newStoragePath });
                }
                newClonedResources.push({
                    id: newResId,
                    project_id: actualClonedProjectId!,
                    user_id: cloningUserId, 
                    file_name: res.file_name,
                    storage_bucket: res.storage_bucket,
                    storage_path: newStoragePath,
                    mime_type: res.mime_type,
                    size_bytes: res.size_bytes,
                    resource_description: res.resource_description ?? undefined,
                    created_at: now,
                    updated_at: now,
                });
            }
            if (newClonedResources.length > 0) {
                const { error: insertResourcesError } = await supabaseClient
                    .from('dialectic_project_resources')
                    .insert(newClonedResources);
                if (insertResourcesError) {
                    console.error('[cloneProject] Error inserting new project resources:', insertResourcesError);
                    throw new Error('Failed to insert new project resource entries.');
                }
                console.log(`[cloneProject] ${newClonedResources.length} project resources cloned successfully.`);
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
                const newSessionIdInternal = crypto.randomUUID(); // Renamed to avoid confusion with the actual ID from DB
                console.log(`[cloneProject] Cloning session ${originalSession.id} to new internal ID ${newSessionIdInternal}, will use DB returned ID after insert.`);

                const newSessionInsert: DialecticSessionInsert = {
                    id: newSessionIdInternal, // Use the generated UUID for the initial insert attempt
                    project_id: actualClonedProjectId!,
                    session_description: originalSession.session_description ?? undefined,
                    iteration_count: originalSession.iteration_count,
                    selected_model_catalog_ids: originalSession.selected_model_catalog_ids ?? undefined,
                    user_input_reference_url: originalSession.user_input_reference_url ?? undefined,
                    stage: originalSession.stage,
                    status: originalSession.status,
                    associated_chat_id: originalSession.associated_chat_id ?? undefined,
                    created_at: now,
                    updated_at: now,
                };
                const { data: newSessionData, error: insertSessionError } = await supabaseClient
                    .from('dialectic_sessions')
                    .insert([newSessionInsert])
                    .select('id') // Select the ID of the inserted row
                    .single(); // Expect a single row back

                if (insertSessionError || !newSessionData) {
                    console.error(`[cloneProject] Error inserting new session for ${originalSession.id}:`, insertSessionError);
                    throw new Error('Failed to insert new session entry or retrieve its ID.');
                }
                const actualNewSessionId = newSessionData.id; // Use the ID returned by the database/mock
                console.log(`[cloneProject] New session entry created successfully with actual ID: ${actualNewSessionId}`);

                const { data: originalContributions, error: fetchContError } = await supabaseClient
                    .from('dialectic_contributions')
                    .select('*')
                    .eq('session_id', originalSession.id);
                
                if (fetchContError) console.warn(`[cloneProject] Error fetching contributions for ${originalSession.id}:`, fetchContError);

                if (originalContributions && originalContributions.length > 0) {
                    for (const originalContrib of originalContributions as DialecticContributionRow[]) {
                        const newContribId = crypto.randomUUID();

                        let newContentPath: string | undefined = undefined;
                        if (originalContrib.content_storage_bucket && originalContrib.content_storage_path) {
                            const extension = originalContrib.content_storage_path.split('.').pop() || 'bin';
                            newContentPath = `projects/${actualClonedProjectId!}/${actualNewSessionId}/${newContribId}.${extension}`;
                            const { error: copyContentError } = await supabaseClient.storage
                                .from(originalContrib.content_storage_bucket)
                                .copy(originalContrib.content_storage_path, newContentPath);
                            if (copyContentError) {
                                console.error(`[cloneProject] Storage copy failed for contrib content ${originalContrib.content_storage_path}:`, copyContentError);
                                throw new Error('Failed to copy contribution content to storage.');
                            }
                             newStorageFilesCreated.push({ bucket: originalContrib.content_storage_bucket, path: newContentPath });
                        }

                        let newRawResponsePath: string | undefined = undefined;
                        if (originalContrib.raw_response_storage_path) {
                            const bucket = originalContrib.content_storage_bucket || 'dialectic-contributions'; // Assuming same bucket or a default
                            newRawResponsePath = `projects/${actualClonedProjectId!}/${actualNewSessionId}/${newContribId}_raw.json`;
                             const { error: copyRawError } = await supabaseClient.storage
                                .from(bucket)
                                .copy(originalContrib.raw_response_storage_path, newRawResponsePath);
                            if (copyRawError) {
                                console.error(`[cloneProject] Storage copy failed for contrib raw resp ${originalContrib.raw_response_storage_path}:`, copyRawError);
                                throw new Error('Failed to copy contribution raw response to storage.');
                            }
                            newStorageFilesCreated.push({ bucket: bucket, path: newRawResponsePath });
                        }
                        
                        const newContribToInsert: DialecticContributionInsert = {
                            id: newContribId,
                            session_id: actualNewSessionId,
                            model_id: originalContrib.model_id, // Use model_id directly from original contribution
                            content_storage_bucket: originalContrib.content_storage_bucket,
                            content_storage_path: newContentPath || '',
                            content_mime_type: originalContrib.content_mime_type,
                            content_size_bytes: originalContrib.content_size_bytes,
                            raw_response_storage_path: newRawResponsePath,
                            tokens_used_input: originalContrib.tokens_used_input,
                            tokens_used_output: originalContrib.tokens_used_output,
                            processing_time_ms: originalContrib.processing_time_ms,
                            iteration_number: originalContrib.iteration_number,
                            citations: originalContrib.citations ?? undefined,
                            created_at: now,
                            updated_at: now,
                            stage: originalContrib.stage,
                            model_name: originalContrib.model_name,
                            seed_prompt_url: originalContrib.seed_prompt_url ?? undefined,
                        };

                        const { error: insertContribError } = await supabaseClient
                            .from('dialectic_contributions')
                            .insert([newContribToInsert]);
                        if (insertContribError) {
                             console.error(`[cloneProject] Error inserting new contribution for ${originalContrib.id}:`, insertContribError);
                            throw new Error('Failed to insert new contribution entry.');
                        }
                    }
                }
            }
            console.log(`[cloneProject] Sessions and their related data cloned successfully.`);
        }
        
        console.log(`[cloneProject] Project ${originalProjectId} successfully cloned to ${actualClonedProjectId!}`);
        const { data: finalClonedProject, error: finalFetchError } = await supabaseClient
            .from('dialectic_projects')
            .select('*')
            .eq('id', actualClonedProjectId!)
            .single();

        if (finalFetchError || !finalClonedProject) {
            console.error('[cloneProject] Failed to refetch the cloned project details:', finalFetchError);
            return { data: newProjectData, error: { message: "Clone completed but failed to refetch final details."} };
        }

        return { data: finalClonedProject, error: null };

    } catch (e) {
        const error = e as Error;
        console.error('[cloneProject] Unhandled error during clone:', error.message, error.stack);
        if (actualClonedProjectId) {
            console.log(`[cloneProject] Attempting rollback for new project ID: ${actualClonedProjectId}`);
            
            // Rollback new storage files
            for (const item of newStorageFilesCreated) {
                 console.log(`[cloneProject-Rollback] Attempting to delete ${item.bucket}/${item.path}`);
                const { error: deleteStorageError } = await supabaseClient.storage.from(item.bucket).remove([item.path]);
                if (deleteStorageError) {
                    console.error(`[cloneProject-Rollback] Failed to delete ${item.bucket}/${item.path}:`, deleteStorageError.message);
                }
            }
            
            // Rollback database entries for the new project
            // Order of deletion matters due to foreign key constraints.
            // Start with tables that are referenced by others or have fewer dependencies.

            // 1. Delete contributions (depend on sessions and session_models)
            // We need to get all session IDs for the cloned project first.
            const { data: clonedSessionsForRollback, error: fetchSessionsRollbackError } = await supabaseClient
                .from('dialectic_sessions')
                .select('id')
                .eq('project_id', actualClonedProjectId);

            if (fetchSessionsRollbackError) {
                console.error(`[cloneProject-Rollback] Error fetching sessions for project ${actualClonedProjectId} during rollback:`, fetchSessionsRollbackError);
            } else if (clonedSessionsForRollback && clonedSessionsForRollback.length > 0) {
                const clonedSessionIds = clonedSessionsForRollback.map(s => s.id);
                
                const { error: deleteContributionsError } = await supabaseClient
                    .from('dialectic_contributions')
                    .delete()
                    .in('session_id', clonedSessionIds);
                if (deleteContributionsError) {
                    console.error(`[cloneProject-Rollback] Failed to delete contributions for project ${actualClonedProjectId}:`, deleteContributionsError);
                } else {
                    console.log(`[cloneProject-Rollback] Deleted contributions for project ${actualClonedProjectId}`);
                }

                // 2. Delete sessions (depend on project)
                const { error: deleteSessionsError } = await supabaseClient
                    .from('dialectic_sessions')
                    .delete()
                    .eq('project_id', actualClonedProjectId);
                if (deleteSessionsError) {
                    console.error(`[cloneProject-Rollback] Failed to delete sessions for project ${actualClonedProjectId}:`, deleteSessionsError);
                } else {
                    console.log(`[cloneProject-Rollback] Deleted sessions for project ${actualClonedProjectId}`);
                }
            }
            
            // 5. Delete project_resources (depend on project)
            const { error: deleteResourcesError } = await supabaseClient
                .from('dialectic_project_resources')
                .delete()
                .eq('project_id', actualClonedProjectId);
            if (deleteResourcesError) {
                console.error(`[cloneProject-Rollback] Failed to delete project resources for project ${actualClonedProjectId}:`, deleteResourcesError);
            } else {
                console.log(`[cloneProject-Rollback] Deleted project resources for project ${actualClonedProjectId}`);
            }

            // Optional: Attempt to delete entire folders if they were implicitly created.
            // These should bebucket-specific.
            // await deleteStorageFolder(supabaseClient, 'dialectic-project-resources', `projects/${actualClonedProjectId}/resources`); // More specific path
            // await deleteStorageFolder(supabaseClient, 'dialectic-contributions', `projects/${actualClonedProjectId}`); // Path for contributions often includes session IDs

            // 6. Delete the project itself
            const { error: deleteProjectError } = await supabaseClient
                .from('dialectic_projects')
                .delete()
                .eq('id', actualClonedProjectId);
            if (deleteProjectError) {
                console.error(`[cloneProject-Rollback] Rollback failed for project ${actualClonedProjectId}:`, deleteProjectError);
            } else {
                console.log(`[cloneProject-Rollback] Rollback successful: Deleted project entry ${actualClonedProjectId}`);
            }
        }
        return { data: null, error: { message: error.message || 'An unexpected error occurred during cloning.', details: error } };
    }
}
