// deno-lint-ignore-file no-explicit-any
import { 
    ContributionWithNestedOwner,
  } from "./dialectic.interface.ts";
import type { SupabaseClient } from '@supabase/supabase-js'; // Added import for SupabaseClient
import type { ServiceError, GetUserFn } from '../_shared/types.ts';

interface CreateSignedUrlFnResult {
  signedUrl: string | null;
  error: ServiceError | Error | null; // Allow for ServiceError or generic Error
}

interface CreateSignedUrlFn {
  (client: SupabaseClient, bucket: string, path: string, expiresIn: number): Promise<CreateSignedUrlFnResult>; 
}

interface Logger {
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

  
console.log("getContributionContent function started");
  
export async function getContributionContentSignedUrlHandler(
    // req: Request, // For user authentication - replaced by getUser
    getUser: GetUserFn,
    dbClient: SupabaseClient, // Used SupabaseClient type
    createSignedUrl: CreateSignedUrlFn,
    loggerInstance: Logger,
    payload: { contributionId: string }
  ): Promise<{ data?: { signedUrl: string; mimeType: string; sizeBytes: number | null }; error?: { message: string; status?: number; details?: string, code?: string } }> {
    const { contributionId } = payload;
  
    if (!contributionId) {
      return { error: { message: "contributionId is required", code: "VALIDATION_ERROR", status: 400 } };
    }
  
    // const supabaseUserClient = createSupabaseClient(req); // Replaced
    // const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(); // Replaced
    const { data: { user }, error: userError } = await getUser();
  
    if (userError || !user) {
      // logger.warn("User not authenticated for getContributionContentSignedUrl", { error: userError }); // Replaced
      loggerInstance.warn("User not authenticated for getContributionContentSignedUrl", { error: userError });
      return { error: { message: "User not authenticated", code: "AUTH_ERROR", status: 401 } };
    }
  
    const { data: contributionData, error: contributionError } = await dbClient
      .from('dialectic_contributions')
      .select(`
        content_storage_bucket,
        content_storage_path,
        content_mime_type,
        content_size_bytes,
        dialectic_sessions (
          project_id,
          dialectic_projects ( user_id )
        )
      `)
      .eq('id', contributionId)
      .maybeSingle();
  
    if (contributionError) {
      // logger.error("Error fetching contribution details for signed URL:", { error: contributionError, contributionId }); // Replaced
      loggerInstance.error("Error fetching contribution details for signed URL:", { error: contributionError, contributionId });
      return { error: { message: "Failed to fetch contribution details.", details: contributionError.message, code: "DB_FETCH_ERROR", status: 500 } };
    }
  
    if (!contributionData) {
      // logger.warn("Contribution not found for signed URL", { contributionId }); // Replaced
      loggerInstance.warn("Contribution not found for signed URL", { contributionId });
      return { error: { message: "Contribution not found.", code: "NOT_FOUND", status: 404 } };
    }
  
    const typedContributionData = contributionData as unknown as ContributionWithNestedOwner;
    const projectOwnerUserId = typedContributionData.dialectic_sessions?.dialectic_projects?.user_id;
  
    if (!projectOwnerUserId || projectOwnerUserId !== user.id) {
      // logger.warn("User not authorized to access this contribution for signed URL", { contributionId, userId: user.id, projectOwnerUserId }); // Replaced
      loggerInstance.warn("User not authorized to access this contribution for signed URL", { contributionId, userId: user.id, projectOwnerUserId });
      return { error: { message: "User not authorized to access this contribution.", code: "AUTH_FORBIDDEN", status: 403 } };
    }
  
    if (!typedContributionData.content_storage_bucket || !typedContributionData.content_storage_path) {
      // logger.error("Contribution is missing storage bucket or path information", { contributionId }); // Replaced
      loggerInstance.error("Contribution is missing storage bucket or path information", { contributionId });
      return { error: { message: "Contribution is missing storage information.", code: "INTERNAL_ERROR", status: 500 } };
    }
  
    // const { signedUrl, error: signedUrlError } = await createSignedUrlForPath( // Replaced
    //   dbClient,
    //   typedContributionData.content_storage_bucket,
    //   typedContributionData.content_storage_path,
    //   60 * 5 // 5 minutes expiry
    // );
    const { signedUrl, error: signedUrlError } = await createSignedUrl(
      dbClient, 
      typedContributionData.content_storage_bucket,
      typedContributionData.content_storage_path,
      60 * 5 // 5 minutes expiry
    );
  
    if (signedUrlError) {
      // logger.error("Error generating signed URL for contribution:", { error: signedUrlError, contributionId }); // Replaced
      loggerInstance.error("Error generating signed URL for contribution:", { error: signedUrlError, contributionId });
      // Check if signedUrlError has a message property before accessing it
      const details = typeof signedUrlError === 'object' && signedUrlError !== null && 'message' in signedUrlError ? (signedUrlError as Error).message : 'Unknown error';
      return { error: { message: "Failed to generate signed URL.", details: details, code: "STORAGE_ERROR", status: 500 } };
    }
  
    if (!signedUrl) {
      // logger.error("Failed to generate signed URL, received null", { contributionId }); // Replaced
      loggerInstance.error("Failed to generate signed URL, received null", { contributionId });
      return { error: { message: "Failed to generate signed URL, received null.", code: "STORAGE_ERROR", status: 500 } };
    }
  
    return {
      data: {
        signedUrl: signedUrl,
        mimeType: typedContributionData.content_mime_type || 'application/octet-stream',
        sizeBytes: typedContributionData.content_size_bytes
      }
    };
  }
  