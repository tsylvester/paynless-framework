import { SupabaseClient } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../types_db.ts";
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';
import { 
    IFileManager, 
    UploadContext, 
    PathContext, 
    FileType,
    ModelContributionUploadContext,
    ResourceUploadContext,
    UserFeedbackUploadContext,
    ModelContributionFileTypes,
} from "../_shared/types/file_manager.types.ts";
import { downloadFromStorage } from "../_shared/supabase_storage_utils.ts";
import { deconstructStoragePath } from "../_shared/utils/path_deconstructor.ts";
import type { DialecticProjectRow, DialecticProjectInsert, DialecticSessionInsert, DialecticContributionRow, DialecticProjectResourceRow, DialecticFeedbackRow } from "../dialectic-service/dialectic.interface.ts";
import { isContributionType, isFileType } from "../_shared/utils/type_guards.ts";

function isModelContributionFileType(fileType: FileType): fileType is ModelContributionFileTypes {
    // This is a simplified check. A more robust implementation might involve
    // checking against a programmatically generated list of ModelContributionFileTypes.
    // For now, we assume that if it's not a resource or feedback type, it's a model contribution.
    // This logic may need refinement if more top-level FileType categories are added.
    const resourceOrFeedbackTypes = [
        FileType.ProjectReadme, FileType.PendingFile, FileType.CurrentFile, FileType.CompleteFile,
        FileType.InitialUserPrompt, FileType.ProjectSettingsFile, FileType.GeneralResource,
        FileType.SeedPrompt, FileType.ProjectExportZip, FileType.PlannerPrompt, FileType.TurnPrompt,
        FileType.AssembledDocumentJson, FileType.RenderedDocument, FileType.UserFeedback
    ];
    return !resourceOrFeedbackTypes.includes(fileType);
}

export interface CloneProjectError {
    message: string;
    details?: unknown;
    code?: string;
}
export interface CloneProjectResult {
    data: DialecticProjectRow | null;
    error: CloneProjectError | null;
}

type ProjectAsset = 
    | (DialecticProjectResourceRow & { sourceTable: 'dialectic_project_resources' })
    | (DialecticContributionRow & { sourceTable: 'dialectic_contributions' })
    | (DialecticFeedbackRow & { sourceTable: 'dialectic_feedback' });

function buildUploadContextForAsset(
    pathContext: PathContext,
    fileContent: Buffer,
    originalAsset: ProjectAsset,
    cloningUserId: string,
    rawJsonResponseContent: string | null
): UploadContext {
    const commonContext = {
        fileContent,
        mimeType: originalAsset.mime_type || 'application/octet-stream',
        sizeBytes: fileContent.length,
        userId: cloningUserId,
    };

    if (originalAsset.sourceTable === 'dialectic_contributions') {
        if (!isModelContributionFileType(pathContext.fileType)) {
             throw new Error(`Asset from contributions table has unexpected fileType: ${pathContext.fileType}`);
        }
        const context: ModelContributionUploadContext = {
            ...commonContext,
            pathContext: { ...pathContext, fileType: pathContext.fileType },
            description: `Cloned contribution for stage ${pathContext.stageSlug || originalAsset.stage}`,
            contributionMetadata: {
                sessionId: pathContext.sessionId!,
                modelIdUsed: originalAsset.model_id!,
                modelNameDisplay: originalAsset.model_name!,
                stageSlug: pathContext.stageSlug || originalAsset.stage,
                iterationNumber: pathContext.iteration!,
                rawJsonResponseContent: rawJsonResponseContent || '',
                tokensUsedInput: originalAsset.tokens_used_input ?? undefined,
                tokensUsedOutput: originalAsset.tokens_used_output ?? undefined,
                processingTimeMs: originalAsset.processing_time_ms ?? undefined,
                citations: originalAsset.citations ?? undefined,
                contributionType: (typeof originalAsset.contribution_type === 'string' && isContributionType(originalAsset.contribution_type)) ? originalAsset.contribution_type : null,
                errorDetails: originalAsset.error ?? undefined,
                promptTemplateIdUsed: originalAsset.prompt_template_id_used ?? undefined,
                target_contribution_id: originalAsset.target_contribution_id ?? undefined,
                editVersion: 1,
                isLatestEdit: true,
                originalModelContributionId: null,
                source_prompt_resource_id: originalAsset.source_prompt_resource_id ?? undefined,
                document_relationships: originalAsset.document_relationships ?? undefined,
            },
        };
        return context;
    }

    if (originalAsset.sourceTable === 'dialectic_feedback') {
        if (pathContext.fileType !== FileType.UserFeedback) {
            throw new Error(`Asset from feedback table has unexpected fileType: ${pathContext.fileType}`);
        }
        const context: UserFeedbackUploadContext = {
            ...commonContext,
            pathContext: { ...pathContext, fileType: pathContext.fileType },
            description: `Cloned feedback for stage ${pathContext.stageSlug || originalAsset.stage_slug}`,
            feedbackTypeForDb: originalAsset.feedback_type,
            resourceDescriptionForDb: originalAsset.resource_description ?? undefined,
        };
        return context;
    }

    if (originalAsset.sourceTable === 'dialectic_project_resources') {
        if (
            !isFileType(pathContext.fileType) || 
            (pathContext.fileType !== FileType.InitialUserPrompt && 
            pathContext.fileType !== FileType.GeneralResource && 
            pathContext.fileType !== FileType.PlannerPrompt &&
            pathContext.fileType !== FileType.ProjectReadme &&
            pathContext.fileType !== FileType.PendingFile &&
            pathContext.fileType !== FileType.CurrentFile &&
            pathContext.fileType !== FileType.CompleteFile)) {
            throw new Error(`Asset from resources table has unexpected fileType: ${pathContext.fileType}`);
        }
        
        const desc = originalAsset.resource_description;
        const originalDescription = (desc && typeof desc === 'object' && 'originalDescription' in desc && typeof desc.originalDescription === 'string')
            ? desc.originalDescription
            : '';

        const context: ResourceUploadContext = {
            ...commonContext,
            pathContext: {
                ...pathContext,
                fileType: pathContext.fileType,
            },
            description: originalDescription,
        };
        return context;
    }

    throw new Error(`Unknown asset source table`);
}

export async function cloneProject(
    supabaseClient: SupabaseClient<Database>,
    fileManager: IFileManager,
    originalProjectId: string,
    newProjectName: string | undefined,
    cloningUserId: string
): Promise<CloneProjectResult> {
    console.log(`[cloneProject] Initiated for original project ID: ${originalProjectId} by user: ${cloningUserId}.`);

    let actualClonedProjectId: string | null = null; 
    const originalAssetIdToNewIdMap = new Map<string, string>();

    try {
        // --- 1. Fetch Original Project and Check Authorization ---
        const { data: originalProject, error: fetchError } = await supabaseClient
            .from('dialectic_projects')
            .select('*')
            .eq('id', originalProjectId)
            .single();

        if (fetchError || !originalProject) {
            return { data: null, error: { message: 'Original project not found or database error.', details: fetchError } };
        }
        if (originalProject.user_id !== cloningUserId) {
            return { data: null, error: { message: 'Original project not found or not accessible.' } };
        }

        // --- 2. Create New Project Entry ---
        const generatedProjectId = crypto.randomUUID();
        const now = new Date().toISOString();
        const newProjectInsertData: DialecticProjectInsert = {
            id: generatedProjectId,
            user_id: cloningUserId,
            project_name: newProjectName || `[CLONE] ${originalProject.project_name}`,
            initial_user_prompt: originalProject.initial_user_prompt,
            process_template_id: originalProject.process_template_id,
            selected_domain_id: originalProject.selected_domain_id,
            selected_domain_overlay_id: originalProject.selected_domain_overlay_id ?? undefined,
            user_domain_overlay_values: originalProject.user_domain_overlay_values ?? undefined,
            repo_url: originalProject.repo_url ?? undefined,
            status: originalProject.status || 'draft',
            created_at: now,
            updated_at: now,
        };

        const { data: newProjectData, error: insertProjectError } = await supabaseClient
            .from('dialectic_projects')
            .insert(newProjectInsertData)
            .select()
            .single();

        if (insertProjectError || !newProjectData) {
            throw new Error('Failed to create new project entry.');
        }
        actualClonedProjectId = newProjectData.id;
        console.log(`[cloneProject] New project created with ID: ${actualClonedProjectId}`);

        // --- 3. Session Cloning and ID Mapping ---
        const { data: originalSessions, error: fetchSessionsError } = await supabaseClient
            .from('dialectic_sessions')
            .select('*')
            .eq('project_id', originalProjectId);
        
        if (fetchSessionsError) throw new Error('Failed to fetch original sessions.');

        const originalFullSessionIdToNewFullSessionIdMap = new Map<string, string>();
        if (originalSessions && originalSessions.length > 0) {
            for (const originalSession of originalSessions) {
                const newSessionId = crypto.randomUUID();
                originalFullSessionIdToNewFullSessionIdMap.set(originalSession.id, newSessionId);
                const newSessionInsert: DialecticSessionInsert = {
                    id: newSessionId,
                    project_id: actualClonedProjectId,
                    session_description: originalSession.session_description ?? undefined,
                    iteration_count: originalSession.iteration_count,
                    selected_model_ids: originalSession.selected_model_ids ?? undefined,
                    user_input_reference_url: originalSession.user_input_reference_url ?? undefined,
                    current_stage_id: originalSession.current_stage_id,
                    status: originalSession.status,
                    associated_chat_id: originalSession.associated_chat_id ?? undefined,
                };
                const { error: insertSessionError } = await supabaseClient.from('dialectic_sessions').insert(newSessionInsert);
                if (insertSessionError) throw new Error(`Failed to clone session ${originalSession.id}.`);
            }
        }

        // --- 4. Unified Asset Discovery (Type-Safe) ---
        console.log('[cloneProject] Starting unified asset discovery...');
        const allAssetsToClone: ProjectAsset[] = [];

        const { data: resources, error: resourcesError } = await supabaseClient.from('dialectic_project_resources').select('*').eq('project_id', originalProjectId);
        if (resourcesError) console.warn(`Could not fetch assets from dialectic_project_resources: ${resourcesError.message}`);
        if (resources) {
            for (const asset of resources) {
                allAssetsToClone.push({ ...asset, sourceTable: 'dialectic_project_resources' });
            }
        }

        const originalSessionIds = Array.from(originalFullSessionIdToNewFullSessionIdMap.keys());
        if (originalSessionIds.length > 0) {
            const { data: contributions, error: contributionsError } = await supabaseClient.from('dialectic_contributions').select('*').in('session_id', originalSessionIds);
            if (contributionsError) console.warn(`Could not fetch assets from dialectic_contributions: ${contributionsError.message}`);
            if (contributions) {
                for (const asset of contributions) {
                    allAssetsToClone.push({ ...asset, sourceTable: 'dialectic_contributions' });
                }
            }
            const { data: feedbacks, error: feedbacksError } = await supabaseClient.from('dialectic_feedback').select('*').in('session_id', originalSessionIds);
            if (feedbacksError) console.warn(`Could not fetch assets from dialectic_feedback: ${feedbacksError.message}`);
            if (feedbacks) {
                for (const asset of feedbacks) {
                    allAssetsToClone.push({ ...asset, sourceTable: 'dialectic_feedback' });
                }
            }
        }
        console.log(`[cloneProject] Discovered ${allAssetsToClone.length} total file assets to clone.`);

        // --- 5. Unified Asset Cloning Loop ---
        for (const asset of allAssetsToClone) {
            if (!asset.storage_bucket || !asset.storage_path || !asset.file_name) {
                console.warn(`[cloneProject] Skipping asset ${asset.id} from table ${asset.sourceTable} due to missing storage details.`);
                continue;
            }

            const { data: fileArrayBuffer, error: downloadError } = await downloadFromStorage(supabaseClient, asset.storage_bucket, `${asset.storage_path}/${asset.file_name}`);
            if (downloadError || !fileArrayBuffer) {
                throw new Error(`Failed to download asset ${asset.id} from ${asset.storage_path}/${asset.file_name}.`);
            }
            const fileContentBuffer = Buffer.from(fileArrayBuffer);
            
            let rawJsonResponseContent: string | null = null;
            if (asset.sourceTable === 'dialectic_contributions' && asset.raw_response_storage_path) {
                const { data: rawData, error: rawError } = await downloadFromStorage(supabaseClient, asset.storage_bucket, asset.raw_response_storage_path);
                if (rawData) rawJsonResponseContent = new TextDecoder().decode(rawData);
                else console.warn(`Could not download raw JSON for asset ${asset.id} from ${asset.raw_response_storage_path}`, rawError);
            }

            const deconstructed = deconstructStoragePath({ storageDir: asset.storage_path, fileName: asset.file_name });
            if (deconstructed.error) throw new Error(`Failed to deconstruct path for asset ${asset.id}: ${deconstructed.error}`);
            
            let fileType = deconstructed.fileTypeGuess;
            if (!fileType) {
                if (asset.sourceTable === 'dialectic_contributions') {
                    const type = asset.contribution_type;
                    if (type === 'pairwise_synthesis_chunk') {
                        fileType = FileType.PairwiseSynthesisChunk;
                    } else if (type && isFileType(type)) {
                        fileType = type;
                    }
                } else if (asset.sourceTable === 'dialectic_feedback') {
                    fileType = FileType.UserFeedback;
                }
            }
            
            console.log('--- Debugging Asset ---');
            console.log('Asset:', JSON.stringify(asset, null, 2));
            console.log('Deconstructed Path:', JSON.stringify(deconstructed, null, 2));

            const newSessionId = asset.session_id ? originalFullSessionIdToNewFullSessionIdMap.get(asset.session_id) : undefined;
            if (asset.session_id && !newSessionId) throw new Error(`Could not find new session ID for asset ${asset.id}`);

            if (!fileType) throw new Error(`Could not determine fileType for asset ${asset.id}`);
            const pathContext: PathContext = {
                projectId: actualClonedProjectId,
                fileType: fileType,
                originalFileName: deconstructed.parsedFileNameFromPath || asset.file_name,
                sessionId: newSessionId,
                iteration: deconstructed.iteration,
                stageSlug: deconstructed.stageSlug,
                modelSlug: deconstructed.modelSlug,
                attemptCount: deconstructed.attemptCount,
                contributionType: (typeof deconstructed.contributionType === 'string' && isContributionType(deconstructed.contributionType)) ? deconstructed.contributionType : undefined,
                documentKey: deconstructed.documentKey,
                stepName: deconstructed.stepName,
                sourceModelSlugs: deconstructed.sourceModelSlug ? [deconstructed.sourceModelSlug] : deconstructed.sourceModelSlugs,
                sourceAnchorType: deconstructed.sourceAnchorType || deconstructed.sourceContributionType,
                sourceAnchorModelSlug: deconstructed.sourceAnchorModelSlug,
                sourceAttemptCount: deconstructed.sourceAttemptCount,
                pairedModelSlug: deconstructed.pairedModelSlug,
                isContinuation: deconstructed.isContinuation,
                turnIndex: deconstructed.turnIndex,
                ...(asset.sourceTable === 'dialectic_project_resources' && { sourceContributionId: asset.source_contribution_id }),
            };

            const uploadContext = buildUploadContextForAsset(pathContext, fileContentBuffer, asset, cloningUserId, rawJsonResponseContent);
            const { record: newAssetRecord, error: fmError } = await fileManager.uploadAndRegisterFile(uploadContext);

            if (fmError || !newAssetRecord) throw new Error(`FileManager failed for asset ${asset.id}: ${fmError?.message}`);
            
            originalAssetIdToNewIdMap.set(asset.id, newAssetRecord.id);
            console.log(`[cloneProject] Cloned asset ${asset.id} to new ID ${newAssetRecord.id}`);
        }

        // --- 6. Relational Data Cloning (Memory) ---
        if (originalSessions && originalSessions.length > 0) {
            for (const originalSession of originalSessions) {
                    const { data: originalMemoryRows, error: memFetchError } = await supabaseClient
                        .from('dialectic_memory')
                        .select('*')
                        .eq('session_id', originalSession.id);
                
                if (memFetchError) console.warn(`[cloneProject] Error fetching memory for session ${originalSession.id}:`, memFetchError);
                if (originalMemoryRows && originalMemoryRows.length > 0) {
                    const newSessionId = originalFullSessionIdToNewFullSessionIdMap.get(originalSession.id)!;
                    const memoryInserts = originalMemoryRows.map(m => ({
                        ...m,
                        id: undefined, // Let DB generate new ID
                        session_id: newSessionId,
                        source_contribution_id: m.source_contribution_id ? (originalAssetIdToNewIdMap.get(m.source_contribution_id) || null) : null,
                    }));
                    const { error: memInsertError } = await supabaseClient.from('dialectic_memory').insert(memoryInserts);
                    if (memInsertError) console.warn(`[cloneProject] Failed to insert cloned memory for new session ${newSessionId}:`, memInsertError);
                }
            }
        }

        // --- 7. Finalize and Return ---
        const { data: finalClonedProject, error: finalFetchError } = await supabaseClient
            .from('dialectic_projects')
            .select('*')
            .eq('id', actualClonedProjectId)
            .single();

        if (finalFetchError || !finalClonedProject) {
            return { data: newProjectData, error: { message: 'Clone completed but failed to re-fetch final project data.' } };
        }

        console.log(`[cloneProject] Clone process completed successfully for project: ${actualClonedProjectId}`);
        return { data: finalClonedProject, error: null };

    } catch (error) {
        console.error('[cloneProject] Unhandled error during clone process:', error);
        if (actualClonedProjectId) {
            console.warn(`[cloneProject-Rollback] Attempting to delete partially cloned project ID: ${actualClonedProjectId}`);
            await supabaseClient.from('dialectic_projects').delete().eq('id', actualClonedProjectId);
            // A more robust rollback would also delete storage artifacts.
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
