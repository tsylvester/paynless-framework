import { SupabaseClient } from 'npm:@supabase/supabase-js@^2.43.4'
import { constructStoragePath } from '../utils/path_constructor.ts'
import type {
  Database,
  TablesInsert,
} from '../../types_db.ts'
import type { FileManagerResponse, UploadContext, PathContext } from '../types/file_manager.types.ts'
import { FileType } from '../types/file_manager.types.ts'

export interface FileManagerDependencies {
  constructStoragePath: typeof constructStoragePath
}

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
    case 'project_export_zip':
      return 'dialectic_project_resources'
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
  private constructStoragePath: (context: PathContext) => { storagePath: string; fileName: string; }

  constructor(
    supabaseClient: SupabaseClient<Database>,
    dependencies: FileManagerDependencies,
  ) {
    this.supabase = supabaseClient
    this.constructStoragePath = dependencies.constructStoragePath
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
    const isContinuation = context.contributionMetadata?.isContinuation ?? false;

    // --- Path Construction ---
    // Decide which PathContext to use based on whether this is a continuation chunk.
    let pathContextForStorage: PathContext = context.pathContext;
    if (isContinuation) {
      pathContextForStorage = {
        ...context.pathContext,
        isContinuation: true,
        turnIndex: context.contributionMetadata?.turnIndex,
      };
    }

    // --- Standard Upload Logic (Now handles both cases) ---
    let finalMainContentFilePath = ""; 
    let finalFileName = "";
    let mainUploadError: { message: string; status?: number } | Error | null = null;
    let currentAttemptCount = 0;

    // This logic is restored from the original function to handle filename collisions for contributions
    if (pathContextForStorage.fileType === 'model_contribution_main' || pathContextForStorage.fileType === 'model_contribution_raw_json') {
      for (currentAttemptCount = 0; currentAttemptCount < MAX_UPLOAD_ATTEMPTS; currentAttemptCount++) {
        const attemptPathContext: PathContext = {
          ...pathContextForStorage,
          attemptCount: currentAttemptCount,
        };
        const pathParts = this.constructStoragePath(attemptPathContext);
        const fullPathForUpload = `${pathParts.storagePath}/${pathParts.fileName}`;

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
      const pathParts = this.constructStoragePath(pathContextForStorage);
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
          const isModelContribution = getTableForFileType(pathContextForStorage.fileType) === 'dialectic_contributions' && pathContextForStorage.fileType !== 'contribution_document';

    if (isModelContribution && context.contributionMetadata?.rawJsonResponseContent) {
      try {
        const rawJsonPathContext: PathContext = {
          ...pathContextForStorage,
          fileType: FileType.ModelContributionRawJson,
          attemptCount: currentAttemptCount,
        };
        const rawJsonPathParts = this.constructStoragePath(rawJsonPathContext);
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

    const targetTable = getTableForFileType(pathContextForStorage.fileType)

    try {
      if (targetTable === 'dialectic_project_resources') {
        let finalDescriptionString: string | null = null;
        if (typeof context.description === 'string') {
          try {
            const parsedJson = JSON.parse(context.description);
            const descriptionObject = typeof parsedJson === 'object' && parsedJson !== null 
              ? { ...parsedJson, type: pathContextForStorage.fileType }
              : { type: pathContextForStorage.fileType, originalDescription: context.description };
            finalDescriptionString = JSON.stringify(descriptionObject);
          } catch (e) {
            finalDescriptionString = JSON.stringify({ type: pathContextForStorage.fileType, originalDescription: context.description });
          }
        } else {
          finalDescriptionString = null;
        }

        const recordData: TablesInsert<'dialectic_project_resources'> = {
          project_id: pathContextForStorage.projectId,
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
        if (!context.contributionMetadata || !pathContextForStorage.sessionId || context.contributionMetadata.iterationNumber === undefined || !pathContextForStorage.stageSlug) {
          const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`;
          if (!mainUploadError) { 
              await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove]);
              if (rawJsonResponseFullStoragePath) { await this.supabase.storage.from(this.storageBucket).remove([rawJsonResponseFullStoragePath]); }
          }
          return { record: null, error: { message: 'Missing required metadata for contribution.' }};
        }
        const meta = context.contributionMetadata;

        // Enforce strict lineage: continuations must provide target_contribution_id
        if (meta.isContinuation === true) {
          const hasValidLink = typeof meta.target_contribution_id === 'string' && meta.target_contribution_id.length > 0;
          if (!hasValidLink) {
            const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`;
            if (!mainUploadError) {
              await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove]);
              if (rawJsonResponseFullStoragePath) {
                await this.supabase.storage.from(this.storageBucket).remove([rawJsonResponseFullStoragePath]);
              }
            }
            return { record: null, error: { message: 'Missing target_contribution_id for continuation.' } };
          }
        }
        const recordData: TablesInsert<'dialectic_contributions'> = {
          session_id: pathContextForStorage.sessionId,
          model_id: meta.modelIdUsed,
          model_name: meta.modelNameDisplay,
          user_id: context.userId,
          stage: pathContextForStorage.stageSlug, 
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
        const { data: newRecord, error: insertError } = await this.supabase
          .from(targetTable)
          .insert(recordData)
          .select()
          .single();
        
        if (insertError) {
          throw insertError;
        }
        // If this contribution references a parent via target_contribution_id, mark the parent as not latest
        if (typeof meta.target_contribution_id === 'string' && meta.target_contribution_id.length > 0) {
          try {
            await this.supabase
              .from('dialectic_contributions')
              .update({ is_latest_edit: false })
              .eq('id', meta.target_contribution_id);
          } catch (_) {
            // Non-fatal; continue returning the newly created record
          }
        }
        return { record: newRecord, error: null };

      } else { // dialectic_feedback
        if (!pathContextForStorage.projectId || !context.userId || !pathContextForStorage.stageSlug || pathContextForStorage.iteration === undefined || !pathContextForStorage.sessionId ) {
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
          project_id: pathContextForStorage.projectId, 
          session_id: pathContextForStorage.sessionId,
          user_id: context.userId, 
          stage_slug: pathContextForStorage.stageSlug,
          iteration_number: pathContextForStorage.iteration,
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

  /**
   * Assembles contribution chunks into a single final document and uploads it.
   * This is used at the end of a continuation chain to create the final user-facing artifact.
   *
   * @param rootContributionId The ID of the initial contribution in the chain.
   * @returns An object containing the final file path or an error.
   */
  async assembleAndSaveFinalDocument(
    rootContributionId: string,
  ): Promise<{ finalPath: string | null; error: Error | null }> {
    try {
      // 1. Fetch all contributions in the session to build the chain client-side.
      // This is simpler than a complex recursive CTE query.
      const { data: rootContribution, error: rootError } = await this.supabase
        .from('dialectic_contributions')
        .select('id, session_id, storage_path, file_name')
        .eq('id', rootContributionId)
        .single();

      if (rootError || !rootContribution) {
        throw new Error(`Could not find root contribution with ID: ${rootContributionId}`);
      }

      const { data: allContributions, error: fetchError } = await this.supabase
        .from('dialectic_contributions')
        .select('id, document_relationships, storage_path, file_name, created_at, target_contribution_id')
        .eq('session_id', rootContribution.session_id);

      if (fetchError) {
        throw fetchError;
      }

      // 2. Build the ordered chain of chunks.
      const chunkMap = new Map(allContributions.map(c => [c.id, c]));
      const orderedChunks: typeof allContributions = [];
      let currentId: string | null = rootContributionId;

      while (currentId) {
        const currentChunk = chunkMap.get(currentId);
        if (!currentChunk) break;
        
        orderedChunks.push(currentChunk);
        
        // Find the next chunk in the chain
        const nextChunk = allContributions.find(c => c.target_contribution_id === currentId);
        currentId = nextChunk ? nextChunk.id : null;
      }

      // 3. Download and concatenate content.
      let finalContent = '';
      for (const chunk of orderedChunks) {
        const fullPath = `${chunk.storage_path}/${chunk.file_name}`;
        const { data, error } = await this.supabase.storage
          .from(this.storageBucket)
          .download(fullPath);
        if (error) {
          throw new Error(`Failed to download chunk ${chunk.id} from ${fullPath}: ${error.message}`);
        }
        finalContent += await data.text();
      }

      // 4. Upload the final assembled document.
      // The final path is simply the path of the root contribution.
      const finalPath = `${rootContribution.storage_path}/${rootContribution.file_name}`;

      const { error: uploadError } = await this.supabase.storage
        .from(this.storageBucket)
        .upload(finalPath, finalContent, {
          contentType: 'text/markdown',
          upsert: true, // Overwrite if it somehow exists
        });

      if (uploadError) {
        throw new Error(`Failed to upload final document to ${finalPath}: ${uploadError.message}`);
      }

      // 5. Update is_latest_edit flags:
      //    - All continuation chunks in the chain should no longer be latest edits
      //    - The root contribution (final assembled document) should be the latest edit
      try {
        const allChunkIds = orderedChunks.map(c => c.id);
        if (allChunkIds.length > 0) {
          await this.supabase
            .from('dialectic_contributions')
            .update({ is_latest_edit: false })
            .in('id', allChunkIds);
        }
        await this.supabase
          .from('dialectic_contributions')
          .update({ is_latest_edit: true })
          .eq('id', rootContributionId);
      } catch (_) {
        // If this update fails, we still return success for the file assembly; logging occurs below
      }

      return { finalPath, error: null };

    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error('An unknown error occurred during final document assembly.');
      console.error(`[FileManagerService] assembleAndSaveFinalDocument failed:`, error);
      return { finalPath: null, error };
    }
  }
} 
