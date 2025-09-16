import { type SupabaseClient } from "npm:@supabase/supabase-js@^2.39.7";
import type { 
    DialecticProject, 
    DialecticProjectResource, 
    DialecticSession, 
    DialecticContribution,
    ExportProjectResponse
} from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import {
    ZipWriter,
    TextReader,
    Uint8ArrayReader, // Use this if we have ArrayBuffer
    BlobWriter,
} from "jsr:@zip-js/zip-js";
// Removed direct import of storage functions
import { FileType, type IFileManager, type UploadContext } from "../_shared/types/file_manager.types.ts";
import type { IStorageUtils } from "../_shared/types/storage_utils.types.ts"; // Added import for the interface
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts'; // For converting ArrayBuffer to Buffer for FileManager
import { isContributionType } from "../_shared/utils/type_guards.ts";

// --- START: Constants ---
const SIGNED_URL_EXPIRES_IN = 3600; // 1 hour
// --- END: Constants ---

// --- START: Helper Functions ---
function slugify(text: string): string {
    if (!text) return 'untitled';
    const processedText = text
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
    if (!processedText) return 'untitled'; // Handle cases where all chars are removed
    return processedText;
}
// --- END: Helper Functions ---

interface ProjectManifest {
    project: DialecticProject;
    resources: DialecticProjectResource[];
    sessions: Array<DialecticSession & {
        contributions: DialecticContribution[];
    }>;
}

export async function exportProject(
    supabaseClient: SupabaseClient<Database>,
    fileManager: IFileManager,
    storageUtils: IStorageUtils, // Added storageUtils parameter
    projectId: string,
    userId: string,
): Promise<ExportProjectResponse> {
    logger.info('Starting project export.', { projectId, userId });

    try {
        const { data: project, error: projectError } = await supabaseClient
            .from('dialectic_projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (projectError) {
            logger.error('Error fetching project for export.', { details: projectError, projectId });
            if (projectError.code === 'PGRST116') {
                return { error: { message: 'Project not found or database error.', status: 404, code: 'PROJECT_NOT_FOUND' } };
            }
            return { error: { message: 'Database error fetching project.', status: 500, code: 'DB_PROJECT_FETCH_ERROR', details: projectError.message } };
        }

        if (!project) {
            logger.warn('Project not found after query.', { projectId });
            return { error: { message: 'Project not found.', status: 404, code: 'PROJECT_NOT_FOUND' } };
        }

        if (project.user_id !== userId) {
            logger.warn('User not authorized to export project.', { projectId, userId, projectOwner: project.user_id });
            return { error: { message: 'User not authorized to export this project.', status: 403, code: 'AUTH_EXPORT_FORBIDDEN' } };
        }

        logger.info('Project details fetched. Fetching associated data.', { projectId });

        const { data: resources, error: resourcesError } = await supabaseClient
            .from('dialectic_project_resources')
            .select('*')
            .eq('project_id', projectId);

        if (resourcesError) {
            logger.error('Error fetching project resources.', { details: resourcesError, projectId });
            // Non-fatal, proceed with export but log the error
        }
        
        // Determine the export bucket from project resources. This is a hard requirement.
        // This bucket will be used by downloadFromStorage for individual files.
        // The FileManagerService used by fileManager will have its own configured bucket for the final ZIP upload.
        const downloadBucketName = resources?.[0]?.storage_bucket;

        if (!downloadBucketName && resources && resources.length > 0) {
             logger.warn('Could not determine a consistent storage bucket from project resources for downloading source files. Will attempt download if resource.storage_bucket is present.', { projectId });
             // This is not necessarily fatal for all resources if some have their bucket defined.
        } else if (!downloadBucketName && (!resources || resources.length === 0)) {
            // If there are no resources, we can still create an export with just the manifest.
            logger.info('Project has no resources. Export will contain manifest and any sessions.', { projectId });
        }


        const { data: sessionsData, error: sessionsError } = await supabaseClient
            .from('dialectic_sessions')
            .select('*')
            .eq('project_id', projectId);

        if (sessionsError) {
            logger.error('Error fetching project sessions.', { details: sessionsError, projectId });
            // Non-fatal
        }

        const manifest: ProjectManifest = {
            project,
            resources: resources?.map(r => {
                let desc: string | null = null;
                if (r.resource_description !== null && r.resource_description !== undefined) {
                    if (typeof r.resource_description === 'string') {
                        desc = r.resource_description;
                    } else {
                        try {
                            desc = JSON.stringify(r.resource_description);
                        } catch (e) {
                            logger.warn('Could not stringify resource_description for manifest.', { resourceId: r.id, error: e });
                            desc = '{"error": "Could not stringify description"}'; // Or keep as null
                        }
                    }
                }
                return {
                     ...r,
                     status: 'active', // Assuming status active for export
                     resource_description: desc 
                } as DialecticProjectResource; // Cast to ensure type alignment
            }) || [],
            sessions: [],
        };

        if (sessionsData) {
            for (const session of sessionsData) {
                const { data: contributionsSql, error: contributionsError } = await supabaseClient
                    .from('dialectic_contributions')
                    .select('*, dialectic_stages(*), parent_contribution_id:target_contribution_id')
                    .eq('session_id', session.id);

                if (contributionsError) {
                    logger.error('Error fetching contributions for session.', { details: contributionsError, sessionId: session.id });
                }

                const validContributions: DialecticContribution[] = [];
                if (contributionsSql) {
                    for (const c of contributionsSql) {
                        // Check if dialectic_stages is a valid stage object and not an error or null
                        // Supabase might return an error object if the relation isn't found, or null.
                        // We need to ensure it's a plain object with an 'id' property.
                        const stageObject = (c.dialectic_stages && typeof c.dialectic_stages === 'object' && 'id' in c.dialectic_stages)
                            ? c.dialectic_stages as Database['public']['Tables']['dialectic_stages']['Row']
                            : null;

                        if (!stageObject) {
                            logger.warn('Contribution found without a valid related stage object during export. Skipping contribution from manifest.', { contributionId: c.id, sessionId: session.id, stageData: c.dialectic_stages });
                            continue; // Skip this contribution
                        }

                        const mappedContribution: DialecticContribution = {
                            id: c.id,
                            session_id: c.session_id,
                            user_id: c.user_id,
                            stage: stageObject.slug, // Now validated
                            iteration_number: c.iteration_number,
                            model_id: c.model_id,
                            model_name: c.model_name,
                            prompt_template_id_used: c.prompt_template_id_used,
                            seed_prompt_url: c.seed_prompt_url, // Corrected mapping
                            edit_version: c.edit_version,
                            is_latest_edit: c.is_latest_edit,
                            original_model_contribution_id: c.original_model_contribution_id,
                            raw_response_storage_path: c.raw_response_storage_path,
                            target_contribution_id: c.target_contribution_id,
                            tokens_used_input: c.tokens_used_input,
                            tokens_used_output: c.tokens_used_output,
                            processing_time_ms: c.processing_time_ms,
                            error: c.error, // Corrected mapping
                            citations: c.citations as { text: string; url?: string }[] | null,
                            created_at: c.created_at,
                            updated_at: c.updated_at,
                            contribution_type: (c.contribution_type && isContributionType(c.contribution_type))
                                ? c.contribution_type
                                : (isContributionType(stageObject.slug) ? stageObject.slug : null),
                            file_name: c.file_name,
                            storage_bucket: c.storage_bucket,
                            storage_path: c.storage_path,
                            mime_type: c.mime_type,
                            size_bytes: c.size_bytes,
                        };
                        validContributions.push(mappedContribution);
                    }
                }
                
                manifest.sessions.push({
                    ...session,
                    contributions: validContributions,
                });
            }
        }
        
        const blobWriter = new BlobWriter("application/zip");
        const zipWriter = new ZipWriter(blobWriter);

        const manifestString = JSON.stringify(manifest, null, 2);
        await zipWriter.add('project_manifest.json', new TextReader(manifestString));
        logger.info('Added project_manifest.json to zip.', { projectId });

        if (manifest.resources) {
            for (const resource of manifest.resources) {
                if (resource.storage_path && resource.file_name) {
                    const currentResourceBucket = resource.storage_bucket || downloadBucketName;
                    if (!currentResourceBucket) {
                        logger.warn('Project resource is missing storage_bucket. Skipping file.', { resourceId: resource.id, fileName: resource.file_name });
                        continue;
                    }
                    try {
                        // Use downloadFromStorage from injected storageUtils
                        const { data: fileArrayBuffer, error: downloadError } = await storageUtils.downloadFromStorage(
                            supabaseClient,
                            currentResourceBucket,
                            `${resource.storage_path}/${resource.file_name}`
                        );

                        if (downloadError) {
                            logger.warn('Failed to download project resource for export. Skipping file.', { details: downloadError, resourceId: resource.id, path: resource.storage_path });
                        } else if (fileArrayBuffer) {
                            await zipWriter.add(`resources/${resource.file_name}`, new Uint8ArrayReader(new Uint8Array(fileArrayBuffer)));
                            logger.info('Added project resource to zip.', { projectId, resourceId: resource.id, fileName: resource.file_name });
                        }
                    } catch (err) {
                        logger.error('Catastrophic error downloading project resource. Skipping file.', { error: err, resourceId: resource.id, path: resource.storage_path });
                    }
                }
            }
        }

        if (manifest.sessions) {
            for (const session of manifest.sessions) {
                for (const contribution of session.contributions) {
                    // Add content file
                    if (contribution.storage_path && contribution.id) {
                        const currentContribBucket = contribution.storage_bucket || downloadBucketName;
                         if (!currentContribBucket) {
                            logger.warn('Contribution content is missing storage_bucket. Skipping file.', { contributionId: contribution.id, path: contribution.storage_path });
                        } else {
                            try {
                                // Use downloadFromStorage from injected storageUtils
                                const { data: contentArrayBuffer, error: downloadError } = await storageUtils.downloadFromStorage(
                                    supabaseClient,
                                    currentContribBucket,
                                    `${contribution.storage_path}/${contribution.file_name}`
                                );
                                if (downloadError) {
                                    logger.warn('Failed to download contribution content for export. Skipping file.', { details: downloadError, contributionId: contribution.id, path: contribution.storage_path });
                                } else if (contentArrayBuffer) {
                                    let extension = '.md'; // Default extension
                                    if (contribution.mime_type) {
                                        const typeParts = contribution.mime_type.split('/');
                                        if (typeParts.length === 2 && typeParts[1]) {
                                            extension = `.${typeParts[1].split('+')[0]}`;
                                        }
                                    } else if (contribution.storage_path) { // Fallback to storage_path
                                        const pathParts = contribution.storage_path.split('.');
                                        if (pathParts.length > 1) extension = `.${pathParts.pop()}`;
                                    }
                                    const contentFileName = `${contribution.id}_content${extension}`;
                                    await zipWriter.add(`sessions/${session.id}/contributions/${contentFileName}`, new Uint8ArrayReader(new Uint8Array(contentArrayBuffer)));
                                    logger.info('Added contribution content to zip.', { projectId, sessionId: session.id, contributionId: contribution.id, fileName: contentFileName });
                                }
                            } catch (err) {
                                logger.error('Catastrophic error downloading contribution content. Skipping file.', { error: err, contributionId: contribution.id, path: contribution.storage_path });
                            }
                        }
                    }

                    // Add raw response file
                    if (contribution.raw_response_storage_path && contribution.id) {
                         const currentRawRespBucket = contribution.storage_bucket || downloadBucketName; // Assuming same bucket as content or the general download bucket
                         if (!currentRawRespBucket) {
                            logger.warn('Contribution raw response is missing storage_bucket. Skipping file.', { contributionId: contribution.id, path: contribution.raw_response_storage_path });
                         } else {
                            try {
                                // Use downloadFromStorage from injected storageUtils
                                const { data: rawResponseArrayBuffer, error: downloadError } = await storageUtils.downloadFromStorage(
                                    supabaseClient,
                                    currentRawRespBucket,
                                    contribution.raw_response_storage_path
                                );
                                if (downloadError) {
                                    logger.warn('Failed to download contribution raw response for export. Skipping file.', { details: downloadError, contributionId: contribution.id, path: contribution.raw_response_storage_path });
                                } else if (rawResponseArrayBuffer) {
                                    const rawResponseFileName = `${contribution.id}_raw.json`;
                                    await zipWriter.add(`sessions/${session.id}/contributions/${rawResponseFileName}`, new Uint8ArrayReader(new Uint8Array(rawResponseArrayBuffer)));
                                    logger.info('Added contribution raw response to zip.', { projectId, sessionId: session.id, contributionId: contribution.id, fileName: rawResponseFileName });
                                }
                            } catch (err) {
                                 logger.error('Catastrophic error downloading contribution raw response. Skipping file.', { error: err, contributionId: contribution.id, path: contribution.raw_response_storage_path });
                            }
                        }
                    }
                }
            }
        }

        const zipBlob = await zipWriter.close();
        logger.info('Project export zip Blob created successfully.', { projectId, zipSize: zipBlob.size });
        
        const projectNameSlug = slugify(project.project_name);
        // Deterministic filename to support overwrite semantics and avoid race conditions
        const exportFileName = `project_export_${projectNameSlug}.zip`;
        
        // Convert Blob to ArrayBuffer, then to Buffer for FileManagerService
        const zipArrayBuffer = await zipBlob.arrayBuffer();
        const zipBuffer = Buffer.from(zipArrayBuffer);

        const uploadContext: UploadContext = {
            pathContext: {
                projectId: projectId,
                fileType: FileType.ProjectExportZip,
                originalFileName: exportFileName,
            },
            fileContent: zipBuffer,
            mimeType: "application/zip",
            sizeBytes: zipBuffer.length,
            userId: userId,
            description: JSON.stringify({ type: "project_export_zip", original_project_name: project.project_name })
        };

        logger.info('Attempting to upload and register export zip via FileManager.', { originalFileName: exportFileName, projectId });
        const { record: fileRecord, error: fmError } = await fileManager.uploadAndRegisterFile(uploadContext);

        if (fmError || !fileRecord) {
            logger.error('FileManager failed to upload/register project export zip.', { error: fmError, projectId, fileName: exportFileName });
            return { 
                error: { 
                    message: 'Failed to store project export file using FileManager.', 
                    status: 500, 
                    code: 'EXPORT_FM_UPLOAD_FAILED', 
                    details: fmError?.details || fmError?.message 
                } 
            };
        }
        logger.info('Project export zip uploaded and registered successfully by FileManager.', { fileRecordId: fileRecord.id, storagePath: fileRecord.storage_path });

        // Create signed URL using injected storageUtils
        const { signedUrl, error: signedUrlError } = await storageUtils.createSignedUrlForPath(
            supabaseClient,
            fileRecord.storage_bucket, // Use bucket from the file record
            `${fileRecord.storage_path}/${fileRecord.file_name}`,
            SIGNED_URL_EXPIRES_IN
        );

        if (signedUrlError || !signedUrl) {
            logger.error('Failed to create signed URL for project export.', { error: signedUrlError, projectId, storagePath: fileRecord.storage_path });
            return { 
                error: { 
                    message: 'Failed to create download link for project export.', 
                    status: 500, 
                    code: 'EXPORT_SIGNED_URL_FAILED', 
                    details: signedUrlError?.message 
                } 
            };
        } else {
            if (!fileRecord.file_name) {
                logger.error('Project export file name is missing.', { projectId });
                return { error: { message: 'Project export file name is missing.', status: 500, code: 'EXPORT_FILE_NAME_MISSING' } };
            }
            logger.info('Signed URL created for project export.', { projectId, signedUrlExpiry: SIGNED_URL_EXPIRES_IN });
            return { data: { export_url: signedUrl, file_name: fileRecord.file_name }, status: 200 };
        }

    } catch (error) {
        let errorMessage = 'An unknown error occurred.';
        let errorStack: string | undefined = undefined;
        let errorCause: unknown = undefined;

        if (error instanceof Error) {
            errorMessage = error.message;
            errorStack = error.stack;
            errorCause = error.cause;
        } else {
            try {
                errorMessage = JSON.stringify(error);
            } catch {
                errorMessage = String(error);
            }
        }
        logger.error('Unhandled error during project export.',{ error: errorMessage, stack: errorStack, cause: errorCause, projectId });
        return { error: { message: 'Failed to export project due to an unexpected error.', status: 500, code: 'EXPORT_UNHANDLED_ERROR', details: errorMessage } };
    }
}

// Example usage (for local testing, not part of the function itself)
/*
async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const authHeader = req.headers.get("Authorization");

    if (!projectId) {
        // This should be handled by the main router now by returning a proper JSON error
        return new Response(JSON.stringify({ error: "Missing projectId query parameter" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const token = authHeader.substring(7); // "Bearer ".length
    
    // Create a Supabase client with the user's token
    const supabaseClientWithAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!, // Using anon key, RLS will be enforced by user's JWT
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Fetch the user ID using the token -- this is crucial for RLS in exportProject
    const { data: { user } , error: userError } = await supabaseClientWithAuth.auth.getUser();
    if (userError || !user) {
        return new Response(
            JSON.stringify({ error: userError ? userError.message : "User not found or token invalid" }), 
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Call the refactored exportProject function
    const result = await exportProject(supabaseClientWithAuth, projectId, user.id);

    // The calling function (like the main router in index.ts) would then handle this result:
    if (result.error) {
        return new Response(JSON.stringify({ error: result.error.message, details: result.error.details, code: result.error.code }), { status: result.error.status || 500, headers: { 'Content-Type': 'application/json' } });
    }
    if (result.data && result.data.export_url) {
        // For testing, you might log the URL or return it in a JSON response
        // In a real client, it would likely initiate a download or present the link.
        // return new Response(JSON.stringify(result.data), { status: result.status || 200, headers: { 'Content-Type': 'application/json' } });
        
        // If you want to redirect for immediate download (browser behavior):
        return Response.redirect(result.data.export_url, 302); // 302 Found - standard for redirect after POST if GET is desired
    } else {
        return new Response(JSON.stringify({ error: 'Export completed but no URL was provided.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
*/
