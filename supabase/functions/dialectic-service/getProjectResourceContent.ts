// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { logger } from "../_shared/logger.ts";
import type { Database } from "../types_db.ts";
import type { 
  GetProjectResourceContentPayload,
  GetProjectResourceContentResponse 
} from "./dialectic.interface.ts";

console.log("getProjectResourceContent function script loaded");

export async function getProjectResourceContent(
  payload: GetProjectResourceContentPayload,
  dbClient: SupabaseClient<Database>,
  user: User
): Promise<{ data?: GetProjectResourceContentResponse; error?: { message: string; status?: number; details?: string; code?: string } }> {
  const { resourceId } = payload;
  logger.info(`[getProjectResourceContent] Attempting to fetch content for resourceId: ${resourceId}`);

  if (!resourceId) {
    return { error: { message: "resourceId is required", status: 400, code: "VALIDATION_ERROR" } };
  }

  try {
    // 1. Fetch the resource record to get storage path and verify ownership
    const { data: resource, error: resourceError } = await dbClient
      .from('dialectic_project_resources')
      .select('project_id, user_id, file_name, mime_type, storage_bucket, storage_path')
      .eq('id', resourceId)
      .single();

    if (resourceError) {
      logger.error('[getProjectResourceContent] Error fetching resource record:', { resourceId, error: resourceError });
      if (resourceError.code === 'PGRST116') { // Not found
        return { error: { message: "Resource not found.", status: 404, code: "NOT_FOUND" } };
      }
      return { error: { message: "Failed to fetch resource details.", status: 500, details: resourceError.message, code: "DB_ERROR" } };
    }

    if (!resource) {
      // Should be caught by PGRST116, but as a safeguard
      return { error: { message: "Resource not found (no data).", status: 404, code: "NOT_FOUND" } };
    }

    // 2. Verify ownership (user who created the resource or owns the project)
    // For simplicity, we'll check if the resource's user_id matches the authenticated user.
    // A more complex check might involve fetching the project via resource.project_id and checking project ownership.
    if (resource.user_id !== user.id) {
      // Secondary check: verify if user owns the project this resource belongs to
      const { data: projectOwner, error: projectOwnerError } = await dbClient
        .from('dialectic_projects')
        .select('user_id')
        .eq('id', resource.project_id)
        .single();

      if (projectOwnerError || !projectOwner || projectOwner.user_id !== user.id) {
        logger.warn('[getProjectResourceContent] Access denied for resource:', { resourceId, resourceUserId: resource.user_id, authenticatedUserId: user.id, projectOwnerError });
        return { error: { message: "Access denied to this resource.", status: 403, code: "FORBIDDEN" } };
      }
    }
    
    logger.info('[getProjectResourceContent] Resource record fetched:', { resourceId, storagePath: resource.storage_path, bucket: resource.storage_bucket });


    // 3. Download the file content from storage
    if (!resource.storage_bucket || !resource.storage_path) {
        logger.error('[getProjectResourceContent] Resource record is missing storage_bucket or storage_path', { resourceId });
        return { error: { message: "Resource storage information is incomplete.", status: 500, code: "STORAGE_INFO_MISSING" }};
    }

    const { data: fileBlob, error: downloadError } = await dbClient.storage
      .from(resource.storage_bucket)
      .download(resource.storage_path);

    if (downloadError) {
      logger.error('[getProjectResourceContent] Error downloading file from storage:', { resourceId, storagePath: resource.storage_path, error: downloadError });
      return { error: { message: "Failed to download resource content.", status: 500, details: downloadError.message, code: "STORAGE_DOWNLOAD_ERROR" } };
    }
    
    if (!fileBlob) {
      logger.error('[getProjectResourceContent] No data returned from storage download:', { resourceId, storagePath: resource.storage_path });
      return { error: { message: "Failed to retrieve resource content (empty).", status: 500, code: "STORAGE_EMPTY_CONTENT" } };
    }

    const content = await fileBlob.text();
    logger.info(`[getProjectResourceContent] Successfully fetched and read content for resourceId: ${resourceId}`);

    const responseData: GetProjectResourceContentResponse = {
      fileName: resource.file_name,
      mimeType: resource.mime_type,
      content: content,
    };

    logger.info(`[getProjectResourceContent] Preparing to return response data.`, { responseData });

    return {
      data: responseData,
    };

  } catch (e: unknown) {
    const error = e as Error;
    logger.error('[getProjectResourceContent] Unexpected error:', { resourceId, error: error.message, stack: error.stack });
    return { error: { message: "An unexpected error occurred while fetching resource content.", status: 500, details: error.message, code: "UNEXPECTED_ERROR" } };
  }
} 