import { SupabaseClient } from 'npm:@supabase/supabase-js@^2.43.4'
import { constructStoragePath } from '../utils/path_constructor.ts'
import type {
  Database,
  TablesInsert,
} from '../../types_db.ts'
import type { FileManagerResponse, UploadContext, PathContext } from '../types/file_manager.types.ts'
import { FileType } from '../types/file_manager.types.ts'

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
    case 'pairwise_synthesis_chunk':
    case 'reduced_synthesis':
    case 'synthesis':
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
    //console.log('[FileManagerService] Received uploadAndRegisterFile context:', JSON.stringify(context, null, 2));
    if (context.contributionMetadata?.target_contribution_id) {
      // --- Continuation Logic ---
      if (!context.contributionMetadata) {
        return { record: null, error: { message: 'Contribution metadata is required for continuation uploads.' } };
      }

      const { fileContent } = context;
      const targetContributionId = context.contributionMetadata.target_contribution_id;

      // 1. Fetch the anchor contribution record to get its path and metadata
      const { data: anchorRecord, error: fetchError } = await this.supabase
        .from('dialectic_contributions')
        .select('*')
        .eq('id', targetContributionId)
        .single();

      if (fetchError || !anchorRecord) {
        return { record: null, error: { message: `Failed to fetch anchor contribution record: ${targetContributionId}`, details: fetchError?.message } };
      }

      // The worker now provides the full, combined content. No need to download and combine here.
      const combinedContent = typeof fileContent === 'string' ? fileContent : new TextDecoder().decode(fileContent);
      const fullPath = `${anchorRecord.storage_path!}/${anchorRecord.file_name!}`;
      
      // 2. Upload (overwrite) the combined content provided by the worker
      const { error: uploadError } = await this.supabase.storage
        .from(anchorRecord.storage_bucket!)
        .upload(fullPath, combinedContent, {
          contentType: anchorRecord.mime_type!,
          upsert: true,
        });

      if (uploadError) {
        return { record: null, error: { message: 'Failed to upload continued content.', details: uploadError.message } };
      }

      // 3. Create a new contribution record for this transaction
      const newRecordData: TablesInsert<'dialectic_contributions'> = {
          session_id: context.pathContext.sessionId!,
          model_id: context.contributionMetadata.modelIdUsed,
          model_name: context.contributionMetadata.modelNameDisplay,
          user_id: context.userId,
          stage: context.pathContext.stageSlug!, 
          iteration_number: context.contributionMetadata.iterationNumber,
          storage_bucket: this.storageBucket,
          storage_path: anchorRecord.storage_path,
          mime_type: context.mimeType,
          size_bytes: new TextEncoder().encode(combinedContent).length,
          file_name: anchorRecord.file_name, 
          raw_response_storage_path: null, // TODO: Handle raw JSON for continuations
          tokens_used_input: context.contributionMetadata.tokensUsedInput,
          tokens_used_output: context.contributionMetadata.tokensUsedOutput,
          processing_time_ms: context.contributionMetadata.processingTimeMs,
          seed_prompt_url: context.contributionMetadata.seedPromptStoragePath,
          prompt_template_id_used: context.contributionMetadata.promptTemplateIdUsed,
          citations: context.contributionMetadata.citations,
          contribution_type: context.contributionMetadata.contributionType,
          error: context.contributionMetadata.errorDetails,
          target_contribution_id: context.contributionMetadata.target_contribution_id,
          edit_version: (anchorRecord.edit_version ?? 1) + 1,
          is_latest_edit: true,
          original_model_contribution_id: anchorRecord.id,
          document_relationships: anchorRecord.document_relationships,
      };

      const { data: newRecord, error: insertError } = await this.supabase
        .from('dialectic_contributions')
        .insert(newRecordData)
        .select()
        .single();

      if (insertError) {
        return { record: null, error: { message: 'Failed to insert new contribution record for continuation.', details: insertError.message } };
      }

      // 6. Update the old record to no longer be the latest
      await this.supabase
        .from('dialectic_contributions')
        .update({ is_latest_edit: false })
        .eq('id', anchorRecord.id);

      // Invalidate the specific record in the cache if caching is implemented client-side
      // This is a placeholder for a potential cache invalidation strategy
      if (this.supabase.realtime) {
        this.supabase.channel('db-changes').send({
          type: 'broadcast',
          event: 'invalidate-contribution',
          payload: { id: anchorRecord.id },
        });
      }
      
      return { record: newRecord, error: null };

    } else {
      // --- Standard Upload Logic (Original function body) ---
      let finalMainContentFilePath = ""; 
      let finalFileName = "";
      let mainUploadError: { message: string; status?: number } | Error | null = null;
      let currentAttemptCount = 0;

      // This logic is restored from the original function to handle filename collisions for contributions
      if (context.pathContext.fileType === 'model_contribution_main' || context.pathContext.fileType === 'model_contribution_raw_json') {
        for (currentAttemptCount = 0; currentAttemptCount < MAX_UPLOAD_ATTEMPTS; currentAttemptCount++) {
          const attemptPathContext: PathContext = {
            ...context.pathContext,
            attemptCount: currentAttemptCount,
            modelSlug: context.pathContext.modelSlug!,
            stageSlug: context.pathContext.stageSlug!,
          };
          const pathParts = constructStoragePath(attemptPathContext);
          const fullPathForUpload = `${pathParts.storagePath}/${pathParts.fileName}`;

          //console.log(`[FileManagerService] Attempting to upload to: ${fullPathForUpload}`);
          //console.log(`[FileManagerService] Content snippet: ${(typeof context.fileContent === 'string' ? context.fileContent : new TextDecoder().decode(context.fileContent)).substring(0, 100)}`);

          const uploadResult = await this.supabase.storage
            .from(this.storageBucket)
            .upload(fullPathForUpload, context.fileContent, {
              contentType: context.mimeType,
              upsert: false, 
            });

          mainUploadError = uploadResult.error;

          if (mainUploadError) {
            console.error(`[FileManagerService] Storage upload failed for path ${fullPathForUpload}. Error:`, JSON.stringify(mainUploadError, null, 2));
          }

          if (!mainUploadError) {
            finalMainContentFilePath = pathParts.storagePath; // Directory path
            finalFileName = pathParts.fileName;          // Filename
            break; 
          } else if (mainUploadError.message && 
                    (mainUploadError.message.includes('The resource already exists') || 
                      ('status' in mainUploadError && mainUploadError.status === 409)
                    )
                    ) {
            if (currentAttemptCount === MAX_UPLOAD_ATTEMPTS - 1) {
              mainUploadError = new Error(`Failed to upload file after ${MAX_UPLOAD_ATTEMPTS} attempts due to filename collisions.`);
              break;
            }
            continue; 
          } else {
            break;
          }
        }
      } else {
        const pathParts = constructStoragePath(context.pathContext);
        const fullPathForUpload = `${pathParts.storagePath}/${pathParts.fileName}`;
        finalMainContentFilePath = pathParts.storagePath; // Directory path
        finalFileName = pathParts.fileName;          // Filename

        const { error } = await this.supabase.storage
          .from(this.storageBucket)
          .upload(fullPathForUpload, context.fileContent, {
            contentType: context.mimeType,
            upsert: true, 
          });
        mainUploadError = error;
      }

      if (mainUploadError) {
        return {
          record: null,
          error: { message: "Main content storage upload failed", details: mainUploadError.message || 'Unknown upload error' },
        }
      }
      
      let rawJsonResponseFullStoragePath: string | null = null; // Stores full path for DB
            const isModelContribution = getTableForFileType(context.pathContext.fileType) === 'dialectic_contributions' && context.pathContext.fileType !== 'contribution_document';

      if (isModelContribution && context.contributionMetadata?.rawJsonResponseContent) {
        try {
          const rawJsonPathContext: PathContext = {
            ...context.pathContext,
            fileType: FileType.ModelContributionRawJson,
            attemptCount: currentAttemptCount,
            modelSlug: context.pathContext.modelSlug!,
            stageSlug: context.pathContext.stageSlug!,
            // Explicitly copy over the dynamic properties
            sourceModelSlugs: context.pathContext.sourceModelSlugs,
            sourceAnchorType: context.pathContext.sourceAnchorType,
            sourceAnchorModelSlug: context.pathContext.sourceAnchorModelSlug,
          };
          const rawJsonPathParts = constructStoragePath(rawJsonPathContext);
          const fullPathForRawJsonUpload = `${rawJsonPathParts.storagePath}/${rawJsonPathParts.fileName}`;
          rawJsonResponseFullStoragePath = fullPathForRawJsonUpload; // Full path for DB

          const { error: rawJsonUploadError } = await this.supabase.storage
            .from(this.storageBucket)
            .upload(fullPathForRawJsonUpload, context.contributionMetadata.rawJsonResponseContent, {
              contentType: 'application/json',
              upsert: true, 
            });

          if (rawJsonUploadError) {
            console.warn(`Raw JSON response upload failed for ${finalFileName}: ${rawJsonUploadError.message}.`);
            rawJsonResponseFullStoragePath = null; 
          }
        } catch (e: unknown) {
          console.warn(`Error processing raw JSON for ${finalFileName}: ${e instanceof Error ? e.message : 'Unknown error'}`);
          rawJsonResponseFullStoragePath = null;
        }
      }

      const targetTable = getTableForFileType(context.pathContext.fileType)

      try {
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

          const recordData: TablesInsert<'dialectic_project_resources'> = {
            project_id: context.pathContext.projectId,
            user_id: context.userId!,
            file_name: finalFileName, 
            mime_type: context.mimeType,
            size_bytes: context.sizeBytes,
            storage_bucket: this.storageBucket,
            storage_path: finalMainContentFilePath,
            resource_description: finalDescriptionString,
          };
          const { data: newRecord, error: insertError } = await this.supabase
            .from(targetTable)
            .insert(recordData)
            .select()
            .single();

          if (insertError) {
            throw insertError;
          }
          return { record: newRecord, error: null };

        } else if (targetTable === 'dialectic_contributions') {
          if (!context.contributionMetadata || !context.pathContext.sessionId || context.contributionMetadata.iterationNumber === undefined || !context.pathContext.stageSlug || !context.pathContext.modelSlug) {
            const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`;
            if (!mainUploadError) { 
                await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove]);
                if (rawJsonResponseFullStoragePath) { await this.supabase.storage.from(this.storageBucket).remove([rawJsonResponseFullStoragePath]); }
            }
            return { record: null, error: { message: 'Missing required metadata for contribution.' }};
          }
          const meta = context.contributionMetadata;
          const recordData: TablesInsert<'dialectic_contributions'> = {
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
            raw_response_storage_path: rawJsonResponseFullStoragePath,
            tokens_used_input: meta.tokensUsedInput,
            tokens_used_output: meta.tokensUsedOutput,
            processing_time_ms: meta.processingTimeMs,
            seed_prompt_url: meta.seedPromptStoragePath,
            prompt_template_id_used: meta.promptTemplateIdUsed,
            citations: meta.citations,
            contribution_type: meta.contributionType,
            error: meta.errorDetails,
            target_contribution_id: meta.target_contribution_id,
            document_relationships: meta.document_relationships,
            edit_version: meta.editVersion ?? 1,
            is_latest_edit: meta.isLatestEdit ?? true,
            original_model_contribution_id: meta.originalModelContributionId,
          };
          //console.log('[FileManagerService] Inserting contribution recordData:', JSON.stringify(recordData, null, 2));
          const { data: newRecord, error: insertError } = await this.supabase
            .from(targetTable)
            .insert(recordData)
            .select()
            .single();
          
          if (insertError) {
            throw insertError;
          }
          return { record: newRecord, error: null };

        } else { // dialectic_feedback
          if (!context.pathContext.projectId || !context.userId || !context.pathContext.stageSlug || context.pathContext.iteration === undefined || !context.pathContext.sessionId ) {
            const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`;
            if (!mainUploadError) { await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove]); }
            return { record: null, error: { message: 'Missing required fields for feedback record.' } };
          }
    
          if (typeof context.feedbackTypeForDb !== 'string' || !context.feedbackTypeForDb) {
            const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`;
            if (!mainUploadError) { await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove]); }
            return { record: null, error: { message: "'feedbackTypeForDb' is missing in UploadContext for user_feedback."}};
          }
    
          const recordData: TablesInsert<'dialectic_feedback'> = {
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
            feedback_type: context.feedbackTypeForDb, 
            resource_description: (context.resourceDescriptionForDb) || null,
          };
          const { data: newRecord, error: insertError } = await this.supabase
            .from(targetTable)
            .insert(recordData) 
            .select()
            .single();
          
          if (insertError) {
            throw insertError;
          }
          return { record: newRecord, error: null };
        }
      } catch(e) {
        if (!mainUploadError) {
          const { data: files, error: listError } = await this.supabase.storage
            .from(this.storageBucket)
            .list(finalMainContentFilePath);

          if (listError) {
            console.error(`[FileManager] Failed to list files for cleanup at path: ${finalMainContentFilePath}. Manual cleanup may be required.`, listError);
          } else if (files && files.length > 0) {
            const pathsToRemove = files.map(file => `${finalMainContentFilePath}/${file.name}`);
            await this.supabase.storage.from(this.storageBucket).remove(pathsToRemove);
          }
        }
        const errorMessage = e instanceof Error ? e.message : 'Unknown database error';
        return {
          record: null,
          error: { message: "Database registration failed after successful upload.", details: errorMessage },
        }
      }
    }
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
