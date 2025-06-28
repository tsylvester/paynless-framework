// deno-lint-ignore-file no-explicit-any
import { 
    ContributionWithNestedOwner,
    GetContributionContentDataResponse,
  } from "./dialectic.interface.ts";
import type { SupabaseClient } from '@supabase/supabase-js'; // Added import for SupabaseClient
import type { ServiceError, GetUserFn, ILogger } from '../_shared/types.ts';

console.log("getContributionContent function script loaded (data fetch version)");
  
export async function getContributionContentHandler(
    // req: Request, // For user authentication - replaced by getUser
    getUser: GetUserFn,
    dbClient: SupabaseClient, // Used SupabaseClient type
    logger: ILogger,
    payload: { contributionId: string }
  ): Promise<{ data?: GetContributionContentDataResponse; error?: { message: string; status?: number; details?: string, code?: string } }> {
    const { contributionId } = payload;
  
    if (!contributionId) {
      return { error: { message: "contributionId is required", code: "VALIDATION_ERROR", status: 400 } };
    }
  
    // const supabaseUserClient = createSupabaseClient(req); // Replaced
    // const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(); // Replaced
    const { data: { user }, error: userError } = await getUser();
  
    if (userError || !user) {
      // logger.warn("User not authenticated for getContributionContentHandler", { error: userError }); // Replaced
      logger.warn("User not authenticated for getContributionContentHandler", { error: userError });
      return { error: { message: "User not authenticated", code: "AUTH_ERROR", status: 401 } };
    }
  
    const { data: contributionData, error: contributionError } = await dbClient
      .from('dialectic_contributions')
      .select(`
        storage_bucket,
        storage_path,
        mime_type,
        size_bytes,
        file_name,
        dialectic_sessions (
          project_id,
          dialectic_projects ( user_id )
        )
      `)
      .eq('id', contributionId)
      .maybeSingle();
  
    if (contributionError) {
      // logger.error("Error fetching contribution details for content:", { error: contributionError, contributionId }); // Replaced
      logger.error("Error fetching contribution details for content:", { error: contributionError, contributionId });
      return { error: { message: "Failed to fetch contribution details.", details: contributionError.message, code: "DB_FETCH_ERROR", status: 500 } };
    }
  
    if (!contributionData) {
      // logger.warn("Contribution not found for content", { contributionId }); // Replaced
      logger.warn("Contribution not found for content", { contributionId });
      return { error: { message: "Contribution not found.", code: "NOT_FOUND", status: 404 } };
    }
  
    const typedContributionData = contributionData as unknown as ContributionWithNestedOwner;
    const projectOwnerUserId = typedContributionData.dialectic_sessions?.dialectic_projects?.user_id;
  
    if (!projectOwnerUserId || projectOwnerUserId !== user.id) {
      // logger.warn("User not authorized to access this contribution's content", { contributionId, userId: user.id, projectOwnerUserId }); // Replaced
      logger.warn("User not authorized to access this contribution's content", { contributionId, userId: user.id, projectOwnerUserId });
      return { error: { message: "User not authorized to access this contribution's content.", code: "AUTH_FORBIDDEN", status: 403 } };
    }
  
    const { storage_bucket, storage_path, file_name } = typedContributionData;

    if (!storage_bucket || !storage_path || !file_name) {
      logger.error("Contribution is missing storage bucket, path, or file_name information", { 
        contributionId, 
        bucket: storage_bucket, 
        path: storage_path, 
        file: file_name 
      });
      return { error: { message: "Contribution is missing essential storage information (bucket, path, or filename).", code: "INTERNAL_ERROR_INCOMPLETE_STORAGE_INFO", status: 500 } };
    }

    // Ensure no leading/trailing slashes on dir and no leading slash on filename to prevent double slashes or incorrect paths
    const cleanedDir = storage_path.endsWith('/') ? storage_path.slice(0, -1) : storage_path;
    const cleanedFileName = file_name.startsWith('/') ? file_name.slice(1) : file_name;
    
    const fullPathForDownload = `${cleanedDir}/${cleanedFileName}`;

    // Download the file content directly
    const { data: fileBlob, error: downloadError } = await dbClient.storage
      .from(storage_bucket)
      .download(fullPathForDownload);

    if (downloadError) {
      logger.error('Error downloading file from storage for contribution:', { contributionId, storagePath: fullPathForDownload, error: downloadError });
      return { error: { message: "Failed to download contribution content.", status: 500, details: downloadError.message, code: "STORAGE_DOWNLOAD_ERROR" } };
    }
    
    if (!fileBlob) {
      logger.error('No data returned from storage download for contribution:', { contributionId, storagePath: fullPathForDownload });
      return { error: { message: "Failed to retrieve contribution content (empty).", status: 500, code: "STORAGE_EMPTY_CONTENT" } };
    }

    const content = await fileBlob.text();
    logger.info(`Successfully fetched and read content for contributionId: ${contributionId}`);
  
    const responseData: GetContributionContentDataResponse = {
        content: content,
        mimeType: typedContributionData.mime_type || 'application/octet-stream',
        sizeBytes: typedContributionData.size_bytes || null,
        fileName: typedContributionData.file_name || null,
    };

    return { data: responseData };
  }
  