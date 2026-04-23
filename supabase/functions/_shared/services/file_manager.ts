import { SupabaseClient } from 'npm:@supabase/supabase-js@^2.43.4'
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts'
import type {
  Database,
  TablesInsert,
  TablesUpdate,
  Json,
} from '../../types_db.ts'
import { 
  isPostgrestError, 
  isRecord 
} from '../utils/type_guards.ts'
import { sanitizeJsonContent } from '../utils/jsonSanitizer/jsonSanitizer.ts'
import {
  FileManagerDependencies,
  FileType,
  CanonicalPathParams,
  PathContext,
  DocumentKey,
  ModelContributionFileTypes,
  ResourceFileTypes,
  ModelContributionUploadContext,
  UserFeedbackUploadContext,
  ResourceUploadContext,
  UploadContext,
  ContributionMetadata,
  ContributionInsertResult,
  FileManagerError,
  FileManagerResponse,
  FileRecord,
  IFileManager,
  DocumentRelated,

} from '../types/file_manager.types.ts'
import {
  ContextForDocument,
  ContentToInclude,
} from '../../dialectic-service/dialectic.interface.ts'
import type {
  AssembleChunksDeps,
  AssembleChunksParams,
  AssembleChunksSignature,
} from '../utils/assembleChunks/assembleChunks.interface.ts'
import {
  isModelContributionContext,
  isModelContributionFileType,
  isUserFeedbackContext,
  isResourceContext,
  isFileType,
  isDocumentKey,
} from '../utils/type-guards/type_guards.file_manager.ts'
import { deconstructStoragePath } from '../utils/path_deconstructor.ts'
import { shouldEnqueueRenderJob } from '../utils/shouldEnqueueRenderJob.ts'
import { 
  ShouldEnqueueRenderJobDeps, 
  ShouldEnqueueRenderJobParams 
} from '../types/shouldEnqueueRenderJob.interface.ts'
import { ILogger } from '../types.ts'


const MAX_UPLOAD_ATTEMPTS = 5; // Max attempts for filename collision resolution
const MAX_TRANSIENT_RETRIES = 3; // Retries for transient storage/API errors (must match file_manager.errors.test.ts)

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (!isRecord(error)) return null;
  const m: unknown = error['message'];
  if (typeof m !== 'string') return null;
  return m;
}

function getErrorCode(error: unknown): string | null {
  if (!isRecord(error)) return null;
  const c: unknown = error['code'];
  if (typeof c !== 'string') return null;
  return c;
}

function getErrorStatusCode(error: unknown): number | string | null {
  if (!isRecord(error)) return null;
  const s: unknown = error['statusCode'];
  if (typeof s !== 'number' && typeof s !== 'string') return null;
  return s;
}

function isTransientMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('bad gateway') ||
    lower.includes('gateway timeout') ||
    lower.includes('service unavailable') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('timeout') ||
    /\b502\b/.test(lower) ||
    /\b503\b/.test(lower) ||
    /\b504\b/.test(lower)
  );
}

function isTransientStorageOrApiError(error: unknown): boolean {
  const message: string | null = getErrorMessage(error);
  if (message !== null && isTransientMessage(message)) return true;
  const code: string | null = getErrorCode(error);
  if (code !== null && (code === '502' || code === '503' || code === '504')) return true;
  const statusCode: number | string | null = getErrorStatusCode(error);
  if (statusCode !== null && (statusCode === 502 || statusCode === 503 || statusCode === 504 || statusCode === '502' || statusCode === '503' || statusCode === '504')) return true;
  return false;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CONTINUATION_LIMIT_PLACEHOLDER: string =
  '[Continuation limit reached — value not generated]'

function isNestedContentToIncludeSpec(spec: unknown): spec is ContentToInclude {
  return typeof spec === 'object' && spec !== null && !Array.isArray(spec)
}

function buildPlaceholderSubtree(node: ContentToInclude): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const keys: string[] = Object.keys(node)
  for (let i = 0; i < keys.length; i++) {
    const key: string = keys[i]
    const spec: unknown = node[key]
    if (isNestedContentToIncludeSpec(spec)) {
      out[key] = buildPlaceholderSubtree(spec)
    } else {
      out[key] = CONTINUATION_LIMIT_PLACEHOLDER
    }
  }
  return out
}

function applyContentToIncludeFill(
  merged: Record<string, unknown>,
  schema: ContentToInclude,
): void {
  const keys: string[] = Object.keys(schema)
  for (let i = 0; i < keys.length; i++) {
    const key: string = keys[i]
    const schemaSpec: unknown = schema[key]
    const mergedVal: unknown = merged[key]

    if (isNestedContentToIncludeSpec(schemaSpec)) {
      const nestedSchema: ContentToInclude = schemaSpec
      if (
        mergedVal === undefined ||
        mergedVal === '' ||
        (Array.isArray(mergedVal) && mergedVal.length === 0)
      ) {
        merged[key] = buildPlaceholderSubtree(nestedSchema)
      } else if (isRecord(mergedVal)) {
        applyContentToIncludeFill(mergedVal, nestedSchema)
      }
    } else {
      if (
        mergedVal === undefined ||
        mergedVal === '' ||
        (Array.isArray(mergedVal) && mergedVal.length === 0)
      ) {
        merged[key] = CONTINUATION_LIMIT_PLACEHOLDER
      }
    }
  }
}

/**
 * The FileManagerService provides a unified API for all file operations
 * within the Dialectic feature, ensuring consistent pathing and database registration.
 */
export class FileManagerService implements IFileManager {
  private supabase: SupabaseClient<Database>
  private storageBucket: string
  private constructStoragePath: (context: PathContext) => { storagePath: string; fileName: string; }
  private logger: ILogger
  private assembleChunks: AssembleChunksSignature

  constructor(
    supabaseClient: SupabaseClient<Database>,
    dependencies: FileManagerDependencies,
  ) {
    this.supabase = supabaseClient
    this.constructStoragePath = dependencies.constructStoragePath
    this.logger = dependencies.logger
    this.assembleChunks = dependencies.assembleChunks
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
    // The path context is used directly (isContinuation and turnIndex are already set by callers in pathContext)
    const pathContextForStorage: PathContext = context.pathContext

    // --- FileContent Validation ---
    if (isModelContributionContext(context)) {
      if (!context.fileContent) {
        const err: FileManagerError = { message: 'fileContent is required for model contributions' }
        const response: FileManagerResponse = { record: null, error: err }
        return response
      }
      const isEmpty = typeof context.fileContent === 'string'
        ? context.fileContent.length === 0
        : context.fileContent instanceof ArrayBuffer
        ? context.fileContent.byteLength === 0
        : context.fileContent.length === 0
      if (isEmpty) {
        const err: FileManagerError = { message: 'fileContent is required for model contributions' }
        const response: FileManagerResponse = { record: null, error: err }
        return response
      }
    }

    // --- Standard Upload Logic ---
    let finalMainContentFilePath = ''
    let finalFileName = ''
    let mainUploadError: FileManagerError | null = null
    let currentAttemptCount = 0

    // This logic is restored from the original function to handle filename collisions for contributions
    if (
      isModelContributionContext(context)
    ) {
      // Helper function to extract content preview for logging
      const getContentPreview = (content: Buffer | ArrayBuffer | string): { length: number; first50: string; last50: string } => {
        let contentString: string;
        if (typeof content === 'string') {
          contentString = content;
        } else if (content instanceof ArrayBuffer) {
          contentString = new TextDecoder().decode(content);
        } else if (content instanceof Buffer) {
          contentString = content.toString('utf-8');
        } else {
          contentString = String(content);
        }
        return {
          length: contentString.length,
          first50: contentString.substring(0, 50),
          last50: contentString.substring(Math.max(0, contentString.length - 50)),
        };
      };

      for (currentAttemptCount = 0; currentAttemptCount < MAX_UPLOAD_ATTEMPTS; currentAttemptCount++) {
        const attemptPathContext: PathContext = {
          ...pathContextForStorage,
          attemptCount: currentAttemptCount,
        };
        const pathParts = this.constructStoragePath(attemptPathContext);
        const fullPathForUpload = `${pathParts.storagePath}/${pathParts.fileName}`;

        // 14.b.i: Log before upload attempt
        const contentPreview = getContentPreview(context.fileContent);
        console.log(`[FileManagerService] UPLOAD_ATTEMPT [BEFORE] attemptCount=${currentAttemptCount}, isContinuation=${attemptPathContext.isContinuation ?? false}, turnIndex=${attemptPathContext.turnIndex ?? 'undefined'}, fullPathForUpload=${fullPathForUpload}, fileContentLength=${contentPreview.length}, fileContentFirst50=${JSON.stringify(contentPreview.first50)}, fileContentLast50=${JSON.stringify(contentPreview.last50)}`);

        let lastUploadError: FileManagerError | null = null;
        for (let transientAttempt = 0; transientAttempt <= MAX_TRANSIENT_RETRIES; transientAttempt++) {
          if (transientAttempt > 0) {
            const backoffMs = 1000 * Math.pow(2, transientAttempt - 1);
            this.logger.info(`[FileManagerService] Transient upload error, retry ${transientAttempt}/${MAX_TRANSIENT_RETRIES} after ${backoffMs}ms`);
            await sleepMs(backoffMs);
          }
          const uploadResult = await this.supabase.storage
            .from(this.storageBucket)
            .upload(fullPathForUpload, context.fileContent, {
              contentType: context.mimeType,
              upsert: false,
            });
          mainUploadError = uploadResult.error;

          // 14.b.ii: Log after upload attempt
          const isCollisionError = mainUploadError && mainUploadError.message &&
            (mainUploadError.message.includes('The resource already exists') ||
              ('statusCode' in mainUploadError && mainUploadError.statusCode === '409'));
          const uploadSucceeded = !mainUploadError;
          console.log(`[FileManagerService] UPLOAD_ATTEMPT [AFTER] attemptCount=${currentAttemptCount}, fullPathForUpload=${fullPathForUpload}, uploadSucceeded=${uploadSucceeded}, isCollisionError=${isCollisionError}, errorMessage=${mainUploadError ? JSON.stringify(mainUploadError.message) : 'null'}`);

          if (mainUploadError) {
            console.error(`[FileManagerService] Storage upload failed for path ${fullPathForUpload}. Error:`, JSON.stringify(mainUploadError, null, 2));
          }

          if (!mainUploadError) {
            finalMainContentFilePath = pathParts.storagePath;
            finalFileName = pathParts.fileName;
            lastUploadError = null;
            break;
          }
          if (isCollisionError) {
            lastUploadError = mainUploadError;
            break;
          }
          if (!isTransientStorageOrApiError(mainUploadError)) {
            lastUploadError = mainUploadError;
            break;
          }
          lastUploadError = mainUploadError;
        }
        mainUploadError = lastUploadError;

        if (!mainUploadError) {
          break;
        }
        const collisionMsg: string | null = getErrorMessage(mainUploadError);
        const collisionStatus: number | string | null = getErrorStatusCode(mainUploadError);
        const isCollisionErrorFinal: boolean =
          collisionMsg !== null && collisionMsg.includes('The resource already exists') ||
          collisionStatus === 409 || collisionStatus === '409';
        if (isCollisionErrorFinal) {
          if (currentAttemptCount === MAX_UPLOAD_ATTEMPTS - 1) {
            mainUploadError = {
              message: `Failed to upload file after ${MAX_UPLOAD_ATTEMPTS} attempts due to filename collisions.`,
            };
            break;
          }
          continue;
        }
        break;
      }

      // 14.b.iii: Log after loop completes
      const rawResponseStoragePath = `${finalMainContentFilePath}/${finalFileName}`;
      console.log(`[FileManagerService] UPLOAD_ATTEMPT [COMPLETE] finalMainContentFilePath=${finalMainContentFilePath}, finalFileName=${finalFileName}, raw_response_storage_path=${rawResponseStoragePath}`);
    } else {
      const pathParts = this.constructStoragePath(pathContextForStorage);
      const fullPathForUpload = `${pathParts.storagePath}/${pathParts.fileName}`;
      finalMainContentFilePath = pathParts.storagePath;
      finalFileName = pathParts.fileName;

      for (let transientAttempt = 0; transientAttempt <= MAX_TRANSIENT_RETRIES; transientAttempt++) {
        if (transientAttempt > 0) {
          const backoffMs = 1000 * Math.pow(2, transientAttempt - 1);
          this.logger.info(`[FileManagerService] Transient upload error (non-model), retry ${transientAttempt}/${MAX_TRANSIENT_RETRIES} after ${backoffMs}ms`);
          await sleepMs(backoffMs);
        }
        const { error } = await this.supabase.storage
          .from(this.storageBucket)
          .upload(fullPathForUpload, context.fileContent, {
            contentType: context.mimeType,
            upsert: true,
          });
        mainUploadError = error;
        if (!mainUploadError || !isTransientStorageOrApiError(mainUploadError)) break;
      }
    }

    if (mainUploadError) {
      // If it's already a FileManagerError, return it directly
      if (isPostgrestError(mainUploadError)) {
        const response: FileManagerResponse = { record: null, error: mainUploadError }
        return response
      }
      // Check if it's a StorageError (has 'error' or 'statusCode' property)
      if (isRecord(mainUploadError) && ('error' in mainUploadError || 'statusCode' in mainUploadError)) {
        const response: FileManagerResponse = { record: null, error: mainUploadError }
        return response
      }
      // If it's a ServiceError (record with message but not PostgrestError or StorageError), return it
      if (isRecord(mainUploadError) && 'message' in mainUploadError && !(mainUploadError instanceof Error)) {
        const response: FileManagerResponse = { record: null, error: mainUploadError }
        return response
      }
      // If it's a plain Error, convert to ServiceError
      const err: FileManagerError = {
        message: 'Main content storage upload failed',
        details: mainUploadError.message,
      }
      const response: FileManagerResponse = { record: null, error: err }
      return response
    }

    try {
      if (isResourceContext(context)) {
        const resourceContext: ResourceUploadContext = context
        const resourcePathFileType: ResourceFileTypes = resourceContext.pathContext.fileType
        const targetTable = 'dialectic_project_resources'
        // Build resource_description: base (type, originalDescription) then merge context.resourceDescriptionForDb when provided (step 10.d.i).
        const baseDescription: Json = {
          type: pathContextForStorage.fileType,
          ...(resourceContext.description && { originalDescription: resourceContext.description }),
        };
        const resourceDescriptionForDb: Json = isRecord(resourceContext.resourceDescriptionForDb)
          ? { ...resourceContext.resourceDescriptionForDb, type: pathContextForStorage.fileType, ...(resourceContext.description && { originalDescription: resourceContext.description }) }
          : baseDescription;

        const resourceType = resourceContext.resourceTypeForDb ?? resourcePathFileType
        const recordData: TablesInsert<'dialectic_project_resources'> = {
          project_id: pathContextForStorage.projectId,
          session_id: pathContextForStorage.sessionId,
          user_id: resourceContext.userId!,
          stage_slug: pathContextForStorage.stageSlug,
          iteration_number: pathContextForStorage.iteration,
          resource_type: typeof resourceType === 'string' ? resourceType : String(resourceType),
          file_name: finalFileName,
          mime_type: resourceContext.mimeType,
          size_bytes: resourceContext.sizeBytes,
          storage_bucket: this.storageBucket,
          storage_path: finalMainContentFilePath,
          resource_description: resourceDescriptionForDb,
          source_contribution_id: pathContextForStorage.sourceContributionId ?? null,
        };
        // Use upsert for all project resources to handle duplicate storage paths gracefully
        // The unique constraint on (storage_bucket, storage_path, file_name) will be respected
        const { data: newRecord, error: upsertError } = await this.supabase
          .from(targetTable)
          .upsert(recordData, { onConflict: 'storage_bucket,storage_path,file_name' })
          .select()
          .single();

        if (upsertError) {
          throw upsertError;
        }
        const successResponse: FileManagerResponse = { record: newRecord, error: null }
        return successResponse

      } else if (isModelContributionContext(context)) {
        const modelContext: ModelContributionUploadContext = context
        const targetTable = 'dialectic_contributions'
        if (
          !pathContextForStorage.sessionId ||
          modelContext.contributionMetadata.iterationNumber === undefined ||
          !pathContextForStorage.stageSlug
        ) {
          const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`
          if (!mainUploadError) {
            await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove])
          }
          const err: FileManagerError = { message: 'Missing required metadata for contribution.' }
          const response: FileManagerResponse = { record: null, error: err }
          return response
        }
        const meta: ContributionMetadata = modelContext.contributionMetadata

        // Enforce strict lineage: continuations must provide target_contribution_id
        if (pathContextForStorage.isContinuation === true) {
          const hasValidLink = typeof meta.target_contribution_id === 'string' && meta.target_contribution_id.length > 0
          if (!hasValidLink) {
            const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`
            if (!mainUploadError) {
              await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove])
            }
            const err: FileManagerError = { message: 'Missing target_contribution_id for continuation.' }
            const response: FileManagerResponse = { record: null, error: err }
            return response
          }
        }

        const recordData: TablesInsert<'dialectic_contributions'> = {
          session_id: pathContextForStorage.sessionId,
          model_id: meta.modelIdUsed,
          model_name: meta.modelNameDisplay,
          user_id: modelContext.userId,
          stage: pathContextForStorage.stageSlug,
          iteration_number: meta.iterationNumber,
          storage_bucket: this.storageBucket,
          storage_path: finalMainContentFilePath,
          mime_type: modelContext.mimeType,
          size_bytes: modelContext.sizeBytes,
          file_name: finalFileName,
          raw_response_storage_path: `${finalMainContentFilePath}/${finalFileName}`,
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
        let insertResult: ContributionInsertResult = { data: null, error: null };
        for (let transientAttempt = 0; transientAttempt <= MAX_TRANSIENT_RETRIES; transientAttempt++) {
          if (transientAttempt > 0) {
            const backoffMs = 1000 * Math.pow(2, transientAttempt - 1);
            this.logger.info(`[FileManagerService] Transient insert error (dialectic_contributions), retry ${transientAttempt}/${MAX_TRANSIENT_RETRIES} after ${backoffMs}ms`);
            await sleepMs(backoffMs);
          }
          const oneResult: ContributionInsertResult = await this.supabase
            .from(targetTable)
            .insert(recordData)
            .select()
            .single();
          insertResult = oneResult;
          if (!insertResult.error) break;
          if (!isTransientStorageOrApiError(insertResult.error)) break;
        }
        if (insertResult.error) {
          throw insertResult.error;
        }
        if (insertResult.data === null) {
          throw new Error('Insert dialectic_contributions returned success but no row.');
        }
        const newRecord: FileRecord = insertResult.data;
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
        const modelSuccessResponse: FileManagerResponse = { record: newRecord, error: null }
        return modelSuccessResponse

      } else if (isUserFeedbackContext(context)) {
        const feedbackContext: UserFeedbackUploadContext = context
        const targetTable = 'dialectic_feedback'
        if (
          !pathContextForStorage.projectId ||
          !feedbackContext.userId ||
          !pathContextForStorage.stageSlug ||
          pathContextForStorage.iteration === undefined ||
          !pathContextForStorage.sessionId
        ) {
          const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`
          if (!mainUploadError) {
            await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove])
          }
          const err: FileManagerError = { message: 'Missing required fields for feedback record.' }
          const response: FileManagerResponse = { record: null, error: err }
          return response
        }

        if (typeof feedbackContext.feedbackTypeForDb !== 'string' || !feedbackContext.feedbackTypeForDb) {
          const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`
          if (!mainUploadError) {
            await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove])
          }
          const err: FileManagerError = { message: "'feedbackTypeForDb' is missing in UploadContext for user_feedback." }
          const response: FileManagerResponse = { record: null, error: err }
          return response
        }

        if (
          pathContextForStorage.documentKey === undefined ||
          pathContextForStorage.modelSlug === undefined ||
          !isFileType(pathContextForStorage.documentKey) ||
          !isDocumentKey(pathContextForStorage.documentKey)
        ) {
          const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`
          if (!mainUploadError) {
            await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove])
          }
          const err: FileManagerError = { message: 'Missing or invalid documentKey/modelSlug in pathContext for feedback upsert.' }
          const response: FileManagerResponse = { record: null, error: err }
          return response
        }
        const documentKey: DocumentKey = pathContextForStorage.documentKey
        const modelId: string = pathContextForStorage.modelSlug

        const { data: existingRow, error: lookupError } = await this.supabase
          .from(targetTable)
          .select('id')
          .eq('session_id', pathContextForStorage.sessionId)
          .eq('project_id', pathContextForStorage.projectId)
          .eq('stage_slug', pathContextForStorage.stageSlug)
          .eq('iteration_number', pathContextForStorage.iteration)
          .filter('resource_description->>document_key', 'eq', documentKey)
          .filter('resource_description->>model_id', 'eq', modelId)
          .maybeSingle()

        if (lookupError) {
          const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`
          if (!mainUploadError) {
            await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove])
          }
          const isMultipleRows: boolean = lookupError.code === 'PGRST116'
          const err: FileManagerError = isMultipleRows
            ? { message: 'Data integrity violation: multiple feedback rows for same logical document.', details: lookupError.message }
            : { message: 'Feedback lookup failed.', details: lookupError.message }
          const response: FileManagerResponse = { record: null, error: err }
          return response
        }

        const recordData: TablesInsert<'dialectic_feedback'> = {
          project_id: pathContextForStorage.projectId,
          session_id: pathContextForStorage.sessionId,
          user_id: feedbackContext.userId,
          stage_slug: pathContextForStorage.stageSlug,
          iteration_number: pathContextForStorage.iteration,
          storage_bucket: this.storageBucket,
          storage_path: finalMainContentFilePath,
          file_name: finalFileName,
          mime_type: feedbackContext.mimeType,
          size_bytes: feedbackContext.sizeBytes,
          feedback_type: feedbackContext.feedbackTypeForDb,
          resource_description: feedbackContext.resourceDescriptionForDb || null,
        }

        if (existingRow !== null) {
          const updatePayload: TablesUpdate<'dialectic_feedback'> = {
            storage_bucket: this.storageBucket,
            storage_path: finalMainContentFilePath,
            file_name: finalFileName,
            mime_type: feedbackContext.mimeType,
            size_bytes: feedbackContext.sizeBytes,
            feedback_type: feedbackContext.feedbackTypeForDb,
            resource_description: feedbackContext.resourceDescriptionForDb || null,
          }
          const { data: updatedRecord, error: updateError } = await this.supabase
            .from(targetTable)
            .update(updatePayload)
            .eq('id', existingRow.id)
            .select()
            .single()
          if (updateError) {
            throw updateError
          }
          this.logger.info('Feedback row updated for logical document', { sessionId: pathContextForStorage.sessionId, documentKey, modelId })
          const feedbackSuccessResponse: FileManagerResponse = { record: updatedRecord, error: null }
          return feedbackSuccessResponse
        }

        const { data: newRecord, error: insertError } = await this.supabase
          .from(targetTable)
          .insert(recordData)
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }
        this.logger.info('Feedback row inserted for logical document', { sessionId: pathContextForStorage.sessionId, documentKey, modelId })
        const feedbackSuccessResponse: FileManagerResponse = { record: newRecord, error: null }
        return feedbackSuccessResponse
      } else {
        // This case should be unreachable if the discriminated union is exhaustive
        throw new Error(`Unhandled context type in uploadAndRegisterFile: ${JSON.stringify(context)}`)
      }
    } catch(e) {
      if (!mainUploadError) {
        const fullPathToRemove = `${finalMainContentFilePath}/${finalFileName}`;
        await this.supabase.storage.from(this.storageBucket).remove([fullPathToRemove]);
      }
      // If upload succeeded but DB registration failed, wrap PostgrestError with descriptive message
      // Otherwise return PostgrestError directly for other cases
      if (isPostgrestError(e)) {
        if (!mainUploadError) {
          // Upload succeeded but DB failed - construct ServiceError from PostgrestError
          // Preserve error information: when e.details is empty, preserve e.message in details
          let errorDetails: string
          if (e.details.length > 0) {
            errorDetails = e.details
          } else {
            errorDetails = e.message
          }
          const err: FileManagerError = {
            message: "Database registration failed after successful upload.",
            code: e.code,
            details: errorDetails,
          }
          const response: FileManagerResponse = { record: null, error: err }
          return response
        }
        // Upload failed or other case - return PostgrestError directly
        const response: FileManagerResponse = { record: null, error: e }
        return response
      }

      // For other errors, construct a ServiceError with unified shape
      if (isRecord(e)) {
        const code: string | undefined = 'code' in e && typeof e.code === 'string' ? e.code : undefined
        const details: string | undefined = 'details' in e && typeof e.details === 'string' ? e.details : undefined
        const err: FileManagerError = {
          message: "Database registration failed after successful upload.",
          code,
          details,
        }
        const response: FileManagerResponse = { record: null, error: err }
        return response
      } else if (e instanceof Error) {
        const err: FileManagerError = {
          message: "Database registration failed after successful upload.",
          details: e.message,
        }
        const response: FileManagerResponse = { record: null, error: err }
        return response
      } else {
        const err: FileManagerError = {
          message: "Database registration failed after successful upload.",
          details: 'Unknown database error',
        }
        const response: FileManagerResponse = { record: null, error: err }
        return response
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
   * Uses `ContextForDocument` (not an untyped record) so the optional schema walk matches PLAN
   * outputs: `content_to_include` mirrors the expected JSON shape; missing or empty values are
   * filled with the continuation placeholder before upload.
   *
   * @param rootContributionId The ID of the initial contribution in the chain.
   * @param expectedSchema When set, merged JSON is aligned to `content_to_include` before upload.
   * @returns An object containing the final file path or an error.
   */
  async assembleAndSaveFinalDocument(
    rootContributionId: string,
    expectedSchema?: ContextForDocument,
  ): Promise<{ finalPath: string | null; error: Error | null }> {
    try {
      // 1. Fetch all contributions in the session to build the chain client-side.
      // This is simpler than a complex recursive CTE query.
      const { data: rootContribution, error: rootError } = await this.supabase
        .from('dialectic_contributions')
        .select('id, session_id, storage_path, file_name, iteration_number, stage')
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

      // 3. Phase 1: Download all chunks into ordered array (chunkId, text, fullPath).
      const downloadedChunks: { chunkId: string; text: string; fullPath: string }[] = [];
      for (const chunk of orderedChunks) {
        if (!chunk.storage_path || typeof chunk.storage_path !== 'string') {
          throw new Error(`Chunk ${chunk.id} is missing storage_path. Storage path is required for JSON assembly.`);
        }
        if (!chunk.file_name || typeof chunk.file_name !== 'string') {
          throw new Error(`Chunk ${chunk.id} is missing file_name. File name is required for JSON assembly.`);
        }

        const fullPath = `${chunk.storage_path}/${chunk.file_name}`;
        const { data, error } = await this.supabase.storage
          .from(this.storageBucket)
          .download(fullPath);

        if (error || !data) {
          throw new Error(`Failed to download chunk ${chunk.id} from ${fullPath}: ${error?.message || 'No data returned'}`);
        }

        const textContent = await data.text();
        downloadedChunks.push({ chunkId: chunk.id, text: textContent, fullPath });
      }

      if (downloadedChunks.length === 0) {
        throw new Error('No chunks to assemble');
      }

      const chunkIdsForError = downloadedChunks.map((c) => c.chunkId).join(', ');
      const pathsForError = downloadedChunks.map((c) => c.fullPath).join('; ');

      const chunkTexts: string[] = downloadedChunks.map((d) => d.text);
      const assembleChunksDeps: AssembleChunksDeps = {
        sanitizeJsonContent,
        isRecord,
      };
      const assembleChunksParams: AssembleChunksParams = {};
      const assembleResult = await this.assembleChunks(
        assembleChunksDeps,
        assembleChunksParams,
        { chunks: chunkTexts },
      );

      if (!assembleResult.success) {
        throw new Error(
          `assembleChunks failed at ${assembleResult.failedAtStep}: ${assembleResult.error}. Chunk IDs: ${chunkIdsForError}; paths: ${pathsForError}`,
        );
      }

      const mergedObject: Record<string, unknown> = assembleResult.mergedObject;

      if (expectedSchema !== undefined) {
        applyContentToIncludeFill(mergedObject, expectedSchema.content_to_include);
      }

      const finalContent = JSON.stringify(mergedObject);

      if(!rootContribution.file_name) {
        throw new Error(`Root contribution file name is missing. File name: ${rootContribution.file_name}`);
      }
      // 5. Extract path context from root contribution to construct AssembledDocumentJson path.
      const pathInfo = deconstructStoragePath({
        storageDir: rootContribution.storage_path,
        fileName: rootContribution.file_name,
      });

      // 5.1. Validate that documentKey is not a rendered document type.
      // assembleAndSaveFinalDocument should only be called for JSON-only artifacts (shouldRender === false),
      // not for rendered documents. Rendered documents should use RENDER jobs via renderDocument instead.
      if (pathInfo.documentKey && pathInfo.stageSlug) {
        const deps: ShouldEnqueueRenderJobDeps = {
          dbClient: this.supabase,
          logger: this.logger,
        };
        const params: ShouldEnqueueRenderJobParams = {
          outputType: pathInfo.documentKey,
          stageSlug: pathInfo.stageSlug,
        };
        const renderDecision = await shouldEnqueueRenderJob(deps, params);
        if (renderDecision.shouldRender && renderDecision.reason === 'is_markdown') {
          throw new Error(`assembleAndSaveFinalDocument should only be called for JSON-only artifacts (shouldRender === false), not for rendered documents. Rendered documents should use RENDER jobs via renderDocument instead. DocumentKey: ${pathInfo.documentKey}, StageSlug: ${pathInfo.stageSlug}`);
        }
        if (!renderDecision.shouldRender && renderDecision.reason !== 'is_json') {
          throw new Error(`assembleAndSaveFinalDocument could not determine render requirement due to configuration/query error. reason=${renderDecision.reason} details=${renderDecision.details ?? ''}`);
        }
      }

      if (!pathInfo.originalProjectId || !pathInfo.stageSlug || !pathInfo.modelSlug || pathInfo.attemptCount === undefined || !pathInfo.documentKey) {
        throw new Error(`Cannot construct AssembledDocumentJson path: missing required path context. ProjectId: ${pathInfo.originalProjectId}, StageSlug: ${pathInfo.stageSlug}, ModelSlug: ${pathInfo.modelSlug}, AttemptCount: ${pathInfo.attemptCount}, DocumentKey: ${pathInfo.documentKey}`);
      }

      if (!isModelContributionFileType(pathInfo.documentKey)) {
        throw new Error(`Invalid model contribution file type: ${pathInfo.documentKey}`);
      }
      const artifactType: ModelContributionFileTypes = pathInfo.documentKey;
      const pathParams: CanonicalPathParams = {
        stageSlug: pathInfo.stageSlug,
        contributionType: 'synthesis',
      }
      const assembledFileType: DocumentRelated = FileType.AssembledDocumentJson
      const pathContext: PathContext = {
        projectId: pathInfo.originalProjectId,
        fileType: assembledFileType,
        sessionId: rootContribution.session_id,
        iteration: pathInfo.iteration ?? rootContribution.iteration_number,
        stageSlug: pathParams.stageSlug,
        modelSlug: pathInfo.modelSlug,
        attemptCount: pathInfo.attemptCount,
        documentKey: artifactType,
      };

      const constructedPath = this.constructStoragePath(pathContext);
      const finalPath = `${constructedPath.storagePath}/${constructedPath.fileName}`;

      // 6. Upload the assembled JSON to the AssembledDocumentJson path.
      const { error: uploadError } = await this.supabase.storage
        .from(this.storageBucket)
        .upload(finalPath, finalContent, {
          contentType: 'application/json',
          upsert: true, // Overwrite if it somehow exists
        });

      if (uploadError) {
        throw new Error(`Failed to upload assembled JSON to ${finalPath}: ${uploadError.message}`);
      }

      // 7. Update is_latest_edit flags:
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
