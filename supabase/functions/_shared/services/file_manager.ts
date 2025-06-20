import { SupabaseClient } from 'npm:@supabase/supabase-js@^2.43.4'
import { constructStoragePath } from '../utils/path_constructor.ts'
import type {
  Database,
  TablesInsert,
} from '../../types_db.ts'
import type { FileManagerResponse, UploadContext, PathContext } from '../types/file_manager.types.ts'

/**
 * Determines the target database table based on the file type.
 * @param fileType The type of the file.
 * @returns The name of the table to use.
 */
function getTableForFileType(
  fileType: UploadContext['pathContext']['fileType'],
): 'dialectic_project_resources' | 'dialectic_contributions' {
  switch (fileType) {
    case 'model_contribution_main':
    case 'contribution_document':
      return 'dialectic_contributions'
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
    const mainContentFilePath = constructStoragePath(context.pathContext)
    let rawJsonResponseFilePath: string | null = null;

    // 1. Upload main file content to Storage
    const { error: mainUploadError } = await this.supabase.storage
      .from(this.storageBucket)
      .upload(mainContentFilePath, context.fileContent, {
        contentType: context.mimeType,
        upsert: true, 
      })

    if (mainUploadError) {
      return {
        record: null,
        error: { message: "Main content storage upload failed", details: mainUploadError.message },
      }
    }

    // 2. If this is a model contribution and raw JSON response content is provided, upload it
    if (context.pathContext.fileType === 'model_contribution_main' && context.contributionMetadata?.rawJsonResponseContent) {
      try {
        const mainOriginalFileName = context.pathContext.originalFileName;
        const rawOriginalFileName = mainOriginalFileName.replace(/(\.\w+)$/, '_raw.json'); // E.g., "model_hyp.md" -> "model_hyp_raw.json"
        
        const rawJsonPathContext: PathContext = {
          ...context.pathContext, // projectId, sessionId, iteration, stageSlug, modelSlug
          fileType: 'model_contribution_raw_json',
          originalFileName: rawOriginalFileName,
        };
        rawJsonResponseFilePath = constructStoragePath(rawJsonPathContext);

        const { error: rawJsonUploadError } = await this.supabase.storage
          .from(this.storageBucket)
          .upload(rawJsonResponseFilePath, context.contributionMetadata.rawJsonResponseContent, {
            contentType: 'application/json',
            upsert: true,
          });

        if (rawJsonUploadError) {
          // Log warning but don't necessarily fail the whole operation,
          // as per behavior in original generateContribution.ts for raw response.
          // The main contribution record will have a null raw_response_storage_path.
          console.warn(`Raw JSON response upload failed for ${mainOriginalFileName}: ${rawJsonUploadError.message}. Proceeding without raw JSON path.`);
          rawJsonResponseFilePath = null; 
        }
      } catch (e: unknown) {
         console.warn(`Error processing or uploading raw JSON response for ${context.pathContext.originalFileName}: ${(e as Error).message}. Proceeding without raw JSON path.`);
         rawJsonResponseFilePath = null;
      }
    }

    // 3. Insert record into the appropriate database table
    const targetTable = getTableForFileType(context.pathContext.fileType)
    const fileName = context.pathContext.originalFileName // This is the main content's original file name

    let recordData:
      | TablesInsert<'dialectic_project_resources'>
      | TablesInsert<'dialectic_contributions'>

    if (targetTable === 'dialectic_project_resources') {
      let finalDescriptionString: string | null = null;
      if (typeof context.description === 'string') {
        try {
          const parsedJson = JSON.parse(context.description);
          if (typeof parsedJson === 'object' && parsedJson !== null) {
            // Parsed successfully into an object, merge fileType
            const descriptionObject = { ...parsedJson, type: context.pathContext.fileType };
            finalDescriptionString = JSON.stringify(descriptionObject);
          } else {
            // Parsed, but not an object (e.g., a stringified number/boolean) or was null
            finalDescriptionString = JSON.stringify({ type: context.pathContext.fileType, originalDescription: context.description });
          }
        } catch (e) {
          // Not valid JSON, treat as a literal string description
          finalDescriptionString = JSON.stringify({ type: context.pathContext.fileType, originalDescription: context.description });
        }
      } else if (context.description === null || context.description === undefined) {
        finalDescriptionString = null;
      } else {
        // This case should ideally not be hit if context.description is typed as string | undefined | null
        // However, to be safe, if it's some other type, we'll stringify it directly within the wrapper
        console.warn('Unexpected type for context.description:', typeof context.description);
        finalDescriptionString = JSON.stringify({ type: context.pathContext.fileType, originalDescription: String(context.description) });
      }

      recordData = {
        project_id: context.pathContext.projectId,
        user_id: context.userId!,
        file_name: fileName,
        mime_type: context.mimeType,
        size_bytes: context.sizeBytes,
        storage_bucket: this.storageBucket,
        storage_path: mainContentFilePath,
        resource_description: finalDescriptionString,
      }
    } else { // This case is for 'dialectic_contributions'
      if (!context.contributionMetadata) {
        // This should be caught by stricter typing or validation before calling
        await this.supabase.storage.from(this.storageBucket).remove([mainContentFilePath]);
        if (rawJsonResponseFilePath) {
            await this.supabase.storage.from(this.storageBucket).remove([rawJsonResponseFilePath]);
        }
        return { record: null, error: { message: 'Internal Server Error: Contribution metadata is missing for a dialectic_contributions record.' }};
      }
      if (!context.pathContext.sessionId || context.contributionMetadata.iterationNumber === undefined || !context.pathContext.stageSlug) {
         await this.supabase.storage.from(this.storageBucket).remove([mainContentFilePath]);
        if (rawJsonResponseFilePath) {
            await this.supabase.storage.from(this.storageBucket).remove([rawJsonResponseFilePath]);
        }
        return { record: null, error: { message: 'Internal Server Error: SessionId, iteration, or stageSlug missing for contribution.' }};
      }

      const meta = context.contributionMetadata;
      recordData = {
        // id is auto-generated by DB
        session_id: context.pathContext.sessionId,
        model_id: meta.modelIdUsed,
        model_name: meta.modelNameDisplay, // Display name for quick reference
        user_id: context.userId, // Can be null if system generated
        stage: context.pathContext.stageSlug,
        iteration_number: meta.iterationNumber,
        
        storage_bucket: this.storageBucket,
        storage_path: mainContentFilePath, // Path to the main content file
        mime_type: context.mimeType,
        size_bytes: context.sizeBytes,
        file_name: fileName, // The originalFileName of the main content

        raw_response_storage_path: rawJsonResponseFilePath, // Path to the raw JSON, or null if upload failed/not provided
        
        tokens_used_input: meta.tokensUsedInput,
        tokens_used_output: meta.tokensUsedOutput,
        processing_time_ms: meta.processingTimeMs,
        
        seed_prompt_url: meta.seedPromptStoragePath, // Path to the seed prompt that was used
        prompt_template_id_used: meta.promptTemplateIdUsed,

        citations: meta.citations,
        contribution_type: meta.contributionType,
        error: meta.errorDetails, // Error from AI model generation, not service error
        
        target_contribution_id: meta.targetContributionId,
        
        edit_version: meta.editVersion ?? 1,
        is_latest_edit: meta.isLatestEdit ?? true,
        original_model_contribution_id: meta.originalModelContributionId,
        // Ensure all required fields for 'dialectic_contributions' from types_db.ts are covered
      }
    }

    const { data: newRecord, error: insertError } =
      targetTable === 'dialectic_project_resources'
        ? await this.supabase
          .from(targetTable)
          .insert(recordData as TablesInsert<'dialectic_project_resources'>)
          .select()
          .single()
        : await this.supabase
          .from(targetTable)
          .insert(recordData as TablesInsert<'dialectic_contributions'>)
          .select()
          .single()

    if (insertError) {
      // Attempt to clean up the orphaned file if DB insert fails
      await this.supabase.storage.from(this.storageBucket).remove([mainContentFilePath])
      if (rawJsonResponseFilePath) {
        await this.supabase.storage.from(this.storageBucket).remove([rawJsonResponseFilePath])
      }
      return {
        record: null,
        error: { message: "Database insert failed", details: insertError.message },
      }
    }

    return { record: newRecord, error: null }
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
    table: 'dialectic_project_resources' | 'dialectic_contributions',
  ): Promise<{ signedUrl: string | null; error: Error | null }> {
    const { data: fileRecord, error: fetchError } = await this.supabase
      .from(table)
      .select('storage_path')
      .eq('id', fileId)
      .single<{ storage_path: string }>()

    if (fetchError || !fileRecord) {
      return { signedUrl: null, error: new Error('File record not found.') }
    }

    const { data, error: urlError } = await this.supabase.storage
      .from(this.storageBucket)
      .createSignedUrl(fileRecord.storage_path, 60 * 5) // 5-minute expiry

    if (urlError) {
      return {
        signedUrl: null,
        error: new Error(`Could not get signed URL: ${urlError.message}`),
      }
    }

    return { signedUrl: data.signedUrl, error: null }
  }
} 