import { SupabaseClient } from 'npm:@supabase/supabase-js@^2.43.4'
import type {
  Database,
  TablesInsert,
  Json,
} from '../../types_db.ts'
import { isPostgrestError, isRecord } from '../utils/type_guards.ts'
import type { FileManagerResponse, UploadContext, PathContext } from '../types/file_manager.types.ts'
import { FileType } from '../types/file_manager.types.ts'
import {
  isModelContributionContext,
  isUserFeedbackContext,
  isResourceContext,
} from '../utils/type-guards/type_guards.file_manager.ts'

export interface FileManagerDependencies {
  constructStoragePath: (context: PathContext) => { storagePath: string; fileName: string; }
}

const MAX_UPLOAD_ATTEMPTS = 5; // Max attempts for filename collision resolution

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
    // --- Path Construction ---
    // The path context can be modified for special cases like continuations.
    let pathContextForStorage: PathContext = context.pathContext
    if (isModelContributionContext(context) && context.contributionMetadata.isContinuation) {
      pathContextForStorage = {
        ...context.pathContext,
        isContinuation: true,
        turnIndex: context.contributionMetadata.turnIndex,
      }
    }

    // --- Standard Upload Logic ---
    let finalMainContentFilePath = ''
    let finalFileName = ''
    let mainUploadError: { message: string; status?: number } | Error | null = null
    let currentAttemptCount = 0

    // This logic is restored from the original function to handle filename collisions for contributions
    if (
      isModelContributionContext(context)
    ) {
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
    
    let rawJsonResponseFullStoragePath: string | null = null // Stores full path for DB

    if (isModelContributionContext(context) && context.contributionMetadata.rawJsonResponseContent) {
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
          .upload(fullPathForRawJsonUpload, JSON.stringify(context.contributionMetadata.rawJsonResponseContent), {
            contentType: 'application/json',
            upsert: true,
          })

        if (rawJsonUploadError) {
          console.warn(`Raw JSON response upload failed for ${finalFileName}: ${rawJsonUploadError.message}.`);
          rawJsonResponseFullStoragePath = null; 
        }
      } catch (e: unknown) {
        console.warn(`Error processing raw JSON for ${finalFileName}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        rawJsonResponseFullStoragePath = null;
      }
    }

    try {
      if (isResourceContext(context)) {
        const targetTable = 'dialectic_project_resources'
        // Build resource_description.
        const resourceDescriptionForDb: Json = {
          type: pathContextForStorage.fileType,
          ...(context.description && { originalDescription: context.description }),
        };

        const resourceType = context.resourceTypeForDb ?? pathContextForStorage.fileType
        const recordData: TablesInsert<'dialectic_project_resources'> = {
          project_id: pathContextForStorage.projectId,
          session_id: pathContextForStorage.sessionId ?? null,
          user_id: context.userId!,
          stage_slug: pathContextForStorage.stageSlug ?? null,
          iteration_number: pathContextForStorage.iteration ?? null,
          resource_type: typeof resourceType === 'string' ? resourceType : String(resourceType),
          file_name: finalFileName, 
          mime_type: context.mimeType,
          size_bytes: context.sizeBytes,
          storage_bucket: this.storageBucket,
          storage_path: finalMainContentFilePath,
          resource_description: resourceDescriptionForDb,
          source_contribution_id: pathContextForStorage.sourceContributionId ?? null,
        };
        // Use upsert only for project export zip; otherwise, insert as before
        if (pathContextForStorage.fileType === 'project_export_zip') {
          const { data: newRecord, error: upsertError } = await this.supabase
            .from(targetTable)
            .upsert(recordData, { onConflict: 'storage_bucket,storage_path,file_name' })
            .select()
            .single();

          if (upsertError) {
            throw upsertError;
          }
          return { record: newRecord, error: null };
        }

        const { data: newRecord, error: insertError } = await this.supabase
          .from(targetTable)
          .insert(recordData)
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }
        return { record: newRecord, error: null };

      } else if (isModelContributionContext(context)) {
        const targetTable = 'dialectic_contributions'
        if (
          !pathContextForStorage.sessionId ||
          context.contributionMetadata.iterationNumber === undefined ||
          !pathContextForStorage.stageSlug
        ) {
          const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`
          if (!mainUploadError) {
            await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove])
            if (rawJsonResponseFullStoragePath) {
              await this.supabase.storage.from(this.storageBucket).remove([rawJsonResponseFullStoragePath])
            }
          }
          return { record: null, error: { message: 'Missing required metadata for contribution.' } }
        }
        const meta = context.contributionMetadata

        // Enforce strict lineage: continuations must provide target_contribution_id
        if (meta.isContinuation === true) {
          const hasValidLink = typeof meta.target_contribution_id === 'string' && meta.target_contribution_id.length > 0
          if (!hasValidLink) {
            const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`
            if (!mainUploadError) {
              await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove])
              if (rawJsonResponseFullStoragePath) {
                await this.supabase.storage.from(this.storageBucket).remove([rawJsonResponseFullStoragePath])
              }
            }
            return { record: null, error: { message: 'Missing target_contribution_id for continuation.' } }
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
          prompt_template_id_used: meta.promptTemplateIdUsed,
          citations: meta.citations,
          contribution_type: meta.contributionType,
          error: meta.errorDetails,
          target_contribution_id: meta.target_contribution_id,
          document_relationships: meta.document_relationships,
          edit_version: meta.editVersion ?? 1,
          is_latest_edit: meta.isLatestEdit ?? true,
          original_model_contribution_id: meta.originalModelContributionId,
        }
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

      } else if (isUserFeedbackContext(context)) {
        const targetTable = 'dialectic_feedback'
        if (
          !pathContextForStorage.projectId ||
          !context.userId ||
          !pathContextForStorage.stageSlug ||
          pathContextForStorage.iteration === undefined ||
          !pathContextForStorage.sessionId
        ) {
          const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`
          if (!mainUploadError) {
            await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove])
          }
          return { record: null, error: { message: 'Missing required fields for feedback record.' } }
        }

        if (typeof context.feedbackTypeForDb !== 'string' || !context.feedbackTypeForDb) {
          const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`
          if (!mainUploadError) {
            await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove])
          }
          return { record: null, error: { message: "'feedbackTypeForDb' is missing in UploadContext for user_feedback." } }
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
          resource_description: context.resourceDescriptionForDb || null,
        }
        const { data: newRecord, error: insertError } = await this.supabase
          .from(targetTable)
          .insert(recordData)
          .select()
          .single();
        
        if (insertError) {
          throw insertError;
        }
        return { record: newRecord, error: null };
      } else {
        // This case should be unreachable if the discriminated union is exhaustive
        throw new Error(`Unhandled context type in uploadAndRegisterFile: ${JSON.stringify(context)}`)
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
      let errorDetails: string | undefined = undefined;
      if (isPostgrestError(e)) {
        errorDetails = JSON.stringify({ code: e.code, details: e.details, message: e.message });
      } else if (isRecord(e)) {
        const code = 'code' in e && typeof e.code === 'string' ? e.code : undefined;
        const details = 'details' in e && typeof e.details === 'string' ? e.details : undefined;
        const message = 'message' in e && typeof e.message === 'string'
          ? e.message
          : (e instanceof Error ? e.message : 'Unknown database error');
        // If only a simple message exists (no code/details), return the raw message string
        if (!code && !details && typeof message === 'string') {
          errorDetails = message;
        } else {
          errorDetails = JSON.stringify({ code, details, message });
        }
      } else if (e instanceof Error) {
        errorDetails = e.message;
      } else {
        errorDetails = 'Unknown database error';
      }
      return {
        record: null,
        error: { message: "Database registration failed after successful upload.", details: errorDetails },
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
