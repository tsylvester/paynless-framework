import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.39.7";
import { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
// import { PassthroughStream } from "https://deno.land/std@0.208.0/streams/passthrough_stream.ts"; // Not needed with zip.js Blob output
import {
    ZipWriter,
    TextReader,
    BlobReader,
    BlobWriter,
} from "jsr:@zip-js/zip-js";
import { uploadToStorage, createSignedUrlForPath } from "../_shared/supabase_storage_utils.ts";
import type { ServiceError } from "../_shared/types.ts";

// --- START: Constants ---
const BUCKET_NAME = "dialectic-contributions";
const SIGNED_URL_EXPIRES_IN = 3600; // 1 hour
// --- END: Constants ---

// --- START: Helper Functions ---
function slugify(text: string): string {
    if (!text) return 'untitled';
    return text
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\\-]+/g, '')       // Remove all non-word chars (hyphen is allowed)
        .replace(/--+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}
// --- END: Helper Functions ---

type Project = Database['public']['Tables']['dialectic_projects']['Row'];
type Resource = Database['public']['Tables']['dialectic_project_resources']['Row'];
type Session = Database['public']['Tables']['dialectic_sessions']['Row'];
type Contribution = Database['public']['Tables']['dialectic_contributions']['Row'];
// type DialecticSessionModel = Database['public']['Tables']['dialectic_session_models']['Row']; // Not directly used in current export
// type DialecticPrompt = Database['public']['Tables']['dialectic_prompts']['Row']; // Not directly used in current export

interface ProjectManifest {
    project: Project;
    resources: Resource[];
    sessions: Array<Session & {
        contributions: Contribution[];
        // models: DialecticSessionModel[]; // Future: export models
        // prompts: DialecticPrompt[]; // Future: export prompts
    }>;
}

// The ZipTools interface and its parameter are removed as we use zip.js directly.

export async function exportProject(
    supabaseClient: SupabaseClient<Database>,
    projectId: string,
    userId: string,
): Promise<{ data?: { export_url: string }; error?: ServiceError; status?: number }> {
    logger.info('Starting project export.', { projectId, userId });

    try {
        const { data: project, error: projectError } = await supabaseClient
            .from('dialectic_projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (projectError) {
            logger.error('Error fetching project for export.', { details: projectError, projectId });
            if (projectError.code === 'PGRST116') { // "Not found"
                return { error: { message: 'Project not found or database error.', status: 404, code: 'PROJECT_NOT_FOUND' } };
            }
            return { error: { message: 'Database error fetching project.', status: 500, code: 'DB_PROJECT_FETCH_ERROR', details: projectError.message } };
        }

        if (!project) { // Should be caught by single() error, but as a safeguard
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
            resources: resources || [],
            sessions: [],
        };

        if (sessionsData) {
            for (const session of sessionsData) {
                const { data: contributions, error: contributionsError } = await supabaseClient
                    .from('dialectic_contributions')
                    .select('*')
                    .eq('session_id', session.id);

                if (contributionsError) {
                    logger.error('Error fetching contributions for session.', { details: contributionsError, sessionId: session.id });
                    // Non-fatal for this session's contributions
                }
                
                // TODO: Fetch session models and prompts in the future
                manifest.sessions.push({
                    ...session,
                    contributions: contributions || [],
                });
            }
        }
        
        const blobWriter = new BlobWriter("application/zip");
        const zipWriter = new ZipWriter(blobWriter);

        // Add project_manifest.json
        const manifestString = JSON.stringify(manifest, null, 2);
        await zipWriter.add('project_manifest.json', new TextReader(manifestString));
        logger.info('Added project_manifest.json to zip.', { projectId });

        // Add project resources
        if (manifest.resources) {
            for (const resource of manifest.resources) {
                if (resource.storage_path && resource.file_name) {
                    try {
                        const { data: fileBlob, error: downloadError } = await supabaseClient.storage
                            .from(resource.storage_bucket || 'dialectic-project-resources') // Fallback bucket
                            .download(resource.storage_path);

                        if (downloadError) {
                            logger.warn('Failed to download project resource for export. Skipping file.', { details: downloadError, resourceId: resource.id, path: resource.storage_path });
                        } else if (fileBlob) {
                            await zipWriter.add(`resources/${resource.file_name}`, new BlobReader(fileBlob));
                            logger.info('Added project resource to zip.', { projectId, resourceId: resource.id, fileName: resource.file_name });
                        }
                    } catch (err) {
                        logger.error('Catastrophic error downloading project resource. Skipping file.', { error: err, resourceId: resource.id, path: resource.storage_path });
                    }
                }
            }
        }

        // Add contributions (content and raw response)
        if (manifest.sessions) {
            for (const session of manifest.sessions) {
                for (const contribution of session.contributions) {
                    // Add content file
                    if (contribution.content_storage_path && contribution.id) {
                        try {
                            const { data: contentBlob, error: downloadError } = await supabaseClient.storage
                                .from(contribution.content_storage_bucket || 'dialectic-contributions') // Fallback bucket
                                .download(contribution.content_storage_path);
                            if (downloadError) {
                                logger.warn('Failed to download contribution content for export. Skipping file.', { details: downloadError, contributionId: contribution.id, path: contribution.content_storage_path });
                            } else if (contentBlob) {
                                // Infer extension from mime_type or path, default to .md
                                let extension = '.md';
                                if (contribution.content_mime_type) {
                                    const typeParts = contribution.content_mime_type.split('/');
                                    if (typeParts.length === 2 && typeParts[1]) {
                                        extension = `.${typeParts[1].split('+')[0]}`; // e.g. text/markdown -> .markdown, application/json -> .json
                                    }
                                } else if (contribution.content_storage_path) {
                                    const pathParts = contribution.content_storage_path.split('.');
                                    if (pathParts.length > 1) extension = `.${pathParts.pop()}`;
                                }
                                const contentFileName = `${contribution.id}_content${extension}`;
                                await zipWriter.add(`sessions/${session.id}/contributions/${contentFileName}`, new BlobReader(contentBlob));
                                logger.info('Added contribution content to zip.', { projectId, sessionId: session.id, contributionId: contribution.id, fileName: contentFileName });
                            }
                        } catch (err) {
                            logger.error('Catastrophic error downloading contribution content. Skipping file.', { error: err, contributionId: contribution.id, path: contribution.content_storage_path });
                        }
                    }

                    // Add raw response file
                    if (contribution.raw_response_storage_path && contribution.id) {
                         try {
                            const { data: rawResponseBlob, error: downloadError } = await supabaseClient.storage
                                .from(contribution.content_storage_bucket || 'dialectic-contributions') // Assuming same bucket as content
                                .download(contribution.raw_response_storage_path);
                            if (downloadError) {
                                logger.warn('Failed to download contribution raw response for export. Skipping file.', { details: downloadError, contributionId: contribution.id, path: contribution.raw_response_storage_path });
                            } else if (rawResponseBlob) {
                                const rawResponseFileName = `${contribution.id}_raw.json`; // Assuming json
                                await zipWriter.add(`sessions/${session.id}/contributions/${rawResponseFileName}`, new BlobReader(rawResponseBlob));
                                logger.info('Added contribution raw response to zip.', { projectId, sessionId: session.id, contributionId: contribution.id, fileName: rawResponseFileName });
                            }
                        } catch (err) {
                             logger.error('Catastrophic error downloading contribution raw response. Skipping file.', { error: err, contributionId: contribution.id, path: contribution.raw_response_storage_path });
                        }
                    }
                }
            }
        }

        // Finalize the zip
        const zipBlob = await zipWriter.close(); // This returns the Blob from the BlobWriter
        logger.info('Project export zip created successfully.', { projectId, zipSize: zipBlob.size });
        
        const projectNameSlug = slugify(project.project_name);
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z'); // URL-friendly timestamp
        const exportFileName = `project_export_${projectNameSlug}_${timestamp}.zip`;
        const storagePath = `project_exports/${projectId}/${exportFileName}`; // Store in a subfolder for clarity

        logger.info('Attempting to upload export zip to storage.', { bucket: BUCKET_NAME, path: storagePath });
        const { path: uploadedPath, error: uploadError } = await uploadToStorage(
            supabaseClient, // Using the passed client, which should have user context for RLS if storage policies require it.
                            // If strict admin write is needed, this should be supabaseAdmin. For now, assume user client is okay.
            BUCKET_NAME,
            storagePath,
            zipBlob,
            { contentType: "application/zip", upsert: false } // upsert: false to avoid accidental overwrites if somehow path collides
        );

        if (uploadError || !uploadedPath) {
            logger.error('Failed to upload project export zip to storage.', { error: uploadError, projectId, storagePath });
            return { 
                error: { 
                    message: 'Failed to store project export file.', 
                    status: 500, 
                    code: 'EXPORT_STORAGE_UPLOAD_FAILED', 
                    details: uploadError?.message 
                } 
            };
        }
        logger.info('Project export zip uploaded successfully.', { path: uploadedPath });

        const { signedUrl, error: signedUrlError } = await createSignedUrlForPath(
            supabaseClient, // Same client context as upload
            BUCKET_NAME,
            uploadedPath,
            SIGNED_URL_EXPIRES_IN
        );

        if (signedUrlError || !signedUrl) {
            logger.error('Failed to create signed URL for project export.', { error: signedUrlError, projectId, storagePath });
            return { 
                error: { 
                    message: 'Failed to create download link for project export.', 
                    status: 500, 
                    code: 'EXPORT_SIGNED_URL_FAILED', 
                    details: signedUrlError?.message 
                } 
            };
        }

        logger.info('Signed URL created for project export.', { projectId, signedUrlExpiry: SIGNED_URL_EXPIRES_IN });
        return { data: { export_url: signedUrl }, status: 200 };

    } catch (error) {
        // Safely access error properties
        let errorMessage = 'An unknown error occurred.';
        let errorStack: string | undefined = undefined;
        let errorCause: unknown = undefined;

        if (error instanceof Error) {
            errorMessage = error.message;
            errorStack = error.stack;
            errorCause = error.cause;
        } else {
            // If it's not an Error instance, try to stringify it
            try {
                errorMessage = JSON.stringify(error);
            } catch {
                // Fallback if stringification fails
                errorMessage = String(error);
            }
        }

        logger.error(
            'Unhandled error during project export.',
            { 
                error: errorMessage, 
                stack: errorStack, 
                cause: errorCause, // Include the cause if available
                projectId 
            }
        );
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
