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
    // zipTools?: ZipTools, // Removed: zip.js will be used directly
): Promise<Response> {
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
                return new Response(JSON.stringify({ error: 'Project not found or database error.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ error: 'Database error fetching project.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

        if (!project) { // Should be caught by single() error, but as a safeguard
            logger.warn('Project not found after query.', { projectId });
            return new Response(JSON.stringify({ error: 'Project not found.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        if (project.user_id !== userId) {
            logger.warn('User not authorized to export project.', { projectId, userId, projectOwner: project.user_id });
            return new Response(JSON.stringify({ error: 'User not authorized to export this project.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
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
                            .from(resource.storage_bucket || 'dialectic-project-resources')
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
                                .from(contribution.content_storage_bucket || 'dialectic-contributions')
                                .download(contribution.content_storage_path);
                            if (downloadError) {
                                logger.warn('Failed to download contribution content for export. Skipping file.', { details: downloadError, contributionId: contribution.id, path: contribution.content_storage_path });
                            } else if (contentBlob) {
                                const contentFileName = `${contribution.id}_content.md`; // Assuming markdown, adjust if mime_type indicates otherwise
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
        
        const headers = new Headers({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="project_export_${projectId}.zip"`,
        });

        // Return the stream from the blob
        return new Response(zipBlob.stream(), { headers, status: 200 });

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
        return new Response(JSON.stringify({ error: 'Failed to export project due to an unexpected error.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

// Example usage (for local testing, not part of the function itself)
/*
async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const authHeader = req.headers.get("Authorization");

    if (!projectId) {
        return new Response("Missing projectId query parameter", { status: 400 });
    }
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response("Missing or invalid Authorization header", { status: 401 });
    }
    const token = authHeader.substring(7); // "Bearer ".length
    
    // Create a Supabase client with the user's token
    const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!, // Using anon key, RLS will be enforced by user's JWT
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Simulate fetching user ID from token or use a placeholder for testing
    // In a real Supabase Edge Function, you'd get this from the auth context
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    if (!user) {
        return new Response("Invalid token", { status: 401 });
    }
    
    return exportProject(supabaseClient, projectId, user.id);
}

// Deno.serve(handleRequest);
*/
