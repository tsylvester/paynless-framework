import { SupabaseClient } from 'npm:@supabase/supabase-js@^2.43.4'
import { constructStoragePath } from '../utils/path_constructor.ts'
import type {
  Database,
  TablesInsert
} from '../../types_db.ts'
import type { FileManagerResponse, UploadContext, PathContext, FileRecord } from '../types/file_manager.types.ts'

const MAX_UPLOAD_ATTEMPTS = 5; // Max attempts for filename collision resolution

/**
 * Determines the target database table based on the file type.
 * @param fileType The type of the file.
 * @returns The name of the table to use.
 */
function getTableForFileType(
  fileType: UploadContext['pathContext']['fileType'],
): 'dialectic_project_resources' | 'dialectic_contributions' | 'dialectic_feedback' {
  switch (fileType) {
    case 'model_contribution_main':
    case 'contribution_document':
      return 'dialectic_contributions'
    case 'user_feedback':
      return 'dialectic_feedback'
    default:
      return 'dialectic_project_resources'
  }
}

/**
 * The FileManagerService provides a unified API for all file operations
 * within the Dialectic feature, ensuring consistent pathing and database registration.
 */
export class FileManagerService {
  private supabase: SupabaseClient<Database>
  private storageBucket: string

  constructor(supabaseClient: SupabaseClient<Database>) {
    this.supabase = supabaseClient
    const bucket = Deno.env.get('SB_CONTENT_STORAGE_BUCKET')
    if (!bucket) {
      throw new Error('SB_CONTENT_STORAGE_BUCKET environment variable is not set.')
    }
    this.storageBucket = bucket
  }

  /**
   * Uploads a file to storage and creates a corresponding metadata record in the database.
   * This is the primary method for adding new files to the system.
   *
   * @param context The full context for the file upload.
   * @returns An object containing the created database record or an error.
   */
  async uploadAndRegisterFile(
    context: UploadContext,
  ): Promise<FileManagerResponse> {
    let finalMainContentFilePath = ""; 
    let finalFileName = "";
    let mainUploadError: { message: string; status?: number } | Error | null = null;
    let currentAttemptCount = 0;

    if (context.pathContext.fileType === 'model_contribution_main' || context.pathContext.fileType === 'model_contribution_raw_json') {
      // Retry loop for model contributions to handle potential filename collisions
      for (currentAttemptCount = 0; currentAttemptCount < MAX_UPLOAD_ATTEMPTS; currentAttemptCount++) {
        const attemptPathContext: PathContext = {
          ...context.pathContext,
          attemptCount: currentAttemptCount,
          modelSlug: context.pathContext.modelSlug!,
          stageSlug: context.pathContext.stageSlug!,
        };
        const attemptPath = constructStoragePath(attemptPathContext);
        const uploadResult = await this.supabase.storage
          .from(this.storageBucket)
          .upload(attemptPath, context.fileContent, {
            contentType: context.mimeType,
            upsert: false, // Important: do not overwrite existing files
          });

        mainUploadError = uploadResult.error;

        if (!mainUploadError) {
          finalMainContentFilePath = attemptPath;
          finalFileName = attemptPath.split('/').pop() || context.pathContext.originalFileName; // Derive filename from path
          break; // Successful upload
        } else if (mainUploadError.message && 
                   (mainUploadError.message.includes('The resource already exists') || 
                    ('status' in mainUploadError && mainUploadError.status === 409)
                   )
                  ) {
          // File already exists, try next attemptCount
          if (currentAttemptCount === MAX_UPLOAD_ATTEMPTS - 1) {
            // Last attempt failed due to collision
            mainUploadError = new Error(`Failed to upload file after ${MAX_UPLOAD_ATTEMPTS} attempts due to filename collisions.`);
            break;
          }
          continue; // Next attempt
        } else {
          // Different error, break and report it
          break;
        }
      }
    } else {
      // For other file types, upload directly (no retry loop for now)
      finalMainContentFilePath = constructStoragePath(context.pathContext);
      finalFileName = context.pathContext.originalFileName; // Or derive from path if more robust
      const { error } = await this.supabase.storage
        .from(this.storageBucket)
        .upload(finalMainContentFilePath, context.fileContent, {
          contentType: context.mimeType,
          upsert: true, // Original behavior for non-contribution files
        });
      mainUploadError = error;
    }

    if (mainUploadError) {
      return {
        record: null,
        error: { message: "Main content storage upload failed", details: mainUploadError.message || 'Unknown upload error' },
      }
    }
    
    let rawJsonResponseFilePath: string | null = null;
    if (context.pathContext.fileType === 'model_contribution_main' && context.contributionMetadata?.rawJsonResponseContent) {
      // This raw JSON upload needs to respect the main file's successful attemptCount.
      // And its own retry logic if we want to number raw JSONs independently (e.g. _0_raw.json, _1_raw.json)
      // For now, let's assume it uses the same attemptCount as the main file.
      try {
        const rawJsonPathContext: PathContext = {
          ...context.pathContext, 
          fileType: 'model_contribution_raw_json',
          // finalFileName here is the one from the successful main upload, e.g., "model_0_stage.md"
          // path_constructor will build "model_0_stage_raw.json"
          originalFileName: finalFileName.replace(/(\.\w+)$/, '_raw.json'), 
          attemptCount: currentAttemptCount, // Use the successful attemptCount from main file upload
          modelSlug: context.pathContext.modelSlug!, 
          stageSlug: context.pathContext.stageSlug!,
        };
        rawJsonResponseFilePath = constructStoragePath(rawJsonPathContext);

        // TODO: This raw JSON upload might also need its own collision check if we allow multiple raw JSONs per main attempt
        // For now, using upsert:true, but ideally should be upsert:false and part of a retry strategy if needed.
        const { error: rawJsonUploadError } = await this.supabase.storage
          .from(this.storageBucket)
          .upload(rawJsonResponseFilePath, context.contributionMetadata.rawJsonResponseContent, {
            contentType: 'application/json',
            upsert: true, // Change to false and add retry if raw JSON also needs collision handling based on its own attempts
          });

        if (rawJsonUploadError) {
          console.warn(`Raw JSON response upload failed for ${finalFileName}: ${rawJsonUploadError.message}.`);
          rawJsonResponseFilePath = null; 
        }
      } catch (e: unknown) {
         console.warn(`Error processing raw JSON for ${finalFileName}: ${(e as Error).message}.`);
         rawJsonResponseFilePath = null;
      }
    }

    const targetTable = getTableForFileType(context.pathContext.fileType)

    let recordData:
      | TablesInsert<'dialectic_project_resources'>
      | TablesInsert<'dialectic_contributions'>
      | TablesInsert<'dialectic_feedback'>;

    if (targetTable === 'dialectic_project_resources') {
      let finalDescriptionString: string | null = null;
      if (typeof context.description === 'string') {
        try {
          const parsedJson = JSON.parse(context.description);
          const descriptionObject = typeof parsedJson === 'object' && parsedJson !== null 
            ? { ...parsedJson, type: context.pathContext.fileType }
            : { type: context.pathContext.fileType, originalDescription: context.description };
          finalDescriptionString = JSON.stringify(descriptionObject);
        } catch (e) {
          finalDescriptionString = JSON.stringify({ type: context.pathContext.fileType, originalDescription: context.description });
        }
      } else {
        finalDescriptionString = null;
      }

      recordData = {
        project_id: context.pathContext.projectId,
        user_id: context.userId!,
        file_name: finalFileName, 
        mime_type: context.mimeType,
        size_bytes: context.sizeBytes,
        storage_bucket: this.storageBucket,
        storage_path: finalMainContentFilePath, 
        resource_description: finalDescriptionString,
      };
    } else if (targetTable === 'dialectic_contributions') {
      if (!context.contributionMetadata || !context.pathContext.sessionId || context.contributionMetadata.iterationNumber === undefined || !context.pathContext.stageSlug || !context.pathContext.modelSlug) {
        // No need to remove file if upload failed already and mainUploadError is set
        if (!mainUploadError) { // Only remove if main upload succeeded but this check fails
            await this.supabase.storage.from(this.storageBucket).remove([finalMainContentFilePath]);
            if (rawJsonResponseFilePath) { await this.supabase.storage.from(this.storageBucket).remove([rawJsonResponseFilePath]); }
        }
        return { record: null, error: { message: 'Missing required metadata for contribution.' }};
      }
      const meta = context.contributionMetadata;
      recordData = {
        session_id: context.pathContext.sessionId,
        model_id: meta.modelIdUsed,
        model_name: meta.modelNameDisplay,
        user_id: context.userId,
        stage: context.pathContext.stageSlug, 
        iteration_number: meta.iterationNumber,
        storage_bucket: this.storageBucket,
        storage_path: finalMainContentFilePath, 
        mime_type: context.mimeType,
        size_bytes: context.sizeBytes,
        file_name: finalFileName, 
        raw_response_storage_path: rawJsonResponseFilePath,
        tokens_used_input: meta.tokensUsedInput,
        tokens_used_output: meta.tokensUsedOutput,
        processing_time_ms: meta.processingTimeMs,
        seed_prompt_url: meta.seedPromptStoragePath,
        prompt_template_id_used: meta.promptTemplateIdUsed,
        citations: meta.citations,
        contribution_type: meta.contributionType,
        error: meta.errorDetails,
        target_contribution_id: meta.targetContributionId,
        edit_version: meta.editVersion ?? 1,
        is_latest_edit: meta.isLatestEdit ?? true,
        original_model_contribution_id: meta.originalModelContributionId,
      };
    } else { // targetTable === 'dialectic_feedback'
      if (!context.pathContext.projectId || !context.userId || !context.pathContext.stageSlug || context.pathContext.iteration === undefined || !context.pathContext.sessionId ) {
        if (!mainUploadError) { await this.supabase.storage.from(this.storageBucket).remove([finalMainContentFilePath]); }
        return { record: null, error: { message: 'Missing required fields for feedback record.' } };
      }

      const feedbackTypeFromContext = context.customMetadata?.feedbackType;
      if (!feedbackTypeFromContext) {
        if (!mainUploadError) { await this.supabase.storage.from(this.storageBucket).remove([finalMainContentFilePath]); }
        return { record: null, error: { message: "'feedbackType' is missing in customMetadata for user_feedback."}};
      }

      const feedbackInsertData: TablesInsert<'dialectic_feedback'> = {
        project_id: context.pathContext.projectId, 
        session_id: context.pathContext.sessionId,
        user_id: context.userId, 
        stage_slug: context.pathContext.stageSlug,
        iteration_number: context.pathContext.iteration,
        storage_bucket: this.storageBucket,
        storage_path: finalMainContentFilePath, 
        file_name: finalFileName, 
        mime_type: context.mimeType,
        size_bytes: context.sizeBytes,
        feedback_type: feedbackTypeFromContext, 
        resource_description: context.customMetadata?.resourceDescription || null, 
      };
      recordData = feedbackInsertData;
    }

    let newRecordResult;
    if (targetTable === 'dialectic_project_resources') {
      newRecordResult = await this.supabase
        .from(targetTable)
        .insert(recordData as TablesInsert<'dialectic_project_resources'>)
        .select()
        .single();
    } else if (targetTable === 'dialectic_contributions') {
      newRecordResult = await this.supabase
        .from(targetTable)
        .insert(recordData as TablesInsert<'dialectic_contributions'>)
        .select()
        .single();
    } else { // dialectic_feedback
      newRecordResult = await this.supabase
        .from(targetTable)
        .insert(recordData as TablesInsert<'dialectic_feedback'>) 
        .select()
        .single();
    }

    const { data: newRecord, error: insertError } = newRecordResult;

    if (insertError) {
      // Only remove if main upload succeeded but DB insert failed.
      // If mainUploadError was already set, the file might not have been uploaded or the path is wrong.
      if (!mainUploadError) {
          await this.supabase.storage.from(this.storageBucket).remove([finalMainContentFilePath]);
          if (rawJsonResponseFilePath) {
            await this.supabase.storage.from(this.storageBucket).remove([rawJsonResponseFilePath]);
          }
      }
      return {
        record: null,
        error: { message: "Database insert failed", details: insertError.message },
      }
    }

    return { record: newRecord as FileRecord, error: null }
  }

  /**
   * Retrieves a temporary signed URL for a file, allowing secure access.
   *
   * @param fileId The UUID of the file record.
   * @param table The table where the file record is stored.
   * @returns An object containing the signed URL or an error.
   */
  async getFileSignedUrl(
    fileId: string,
    table: 'dialectic_project_resources' | 'dialectic_contributions' | 'dialectic_feedback',
  ): Promise<{ signedUrl: string | null; error: Error | null }> {
    const { data: fileRecord, error: fetchError } = await this.supabase
      .from(table)
      .select('storage_path') 
      .eq('id', fileId)
      .single<{ storage_path: string }>()

    if (fetchError || !fileRecord) {
      return { signedUrl: null, error: new Error('File record not found.') }
    }
    
    const { data, error: signedUrlError } = await this.supabase.storage
      .from(this.storageBucket)
      .createSignedUrl(fileRecord.storage_path, 60 * 60) // 1-hour expiry

    if (signedUrlError) {
      return { signedUrl: null, error: signedUrlError }
    }

    return { signedUrl: data.signedUrl, error: null }
  }
} 
