import { SupabaseClient } from 'npm:@supabase/supabase-js@^2.43.4'
import { constructStoragePath } from '../utils/path_constructor.ts'
import type {
  Database,
  TablesInsert,
} from '../../types_db.ts'
import type { FileManagerResponse, UploadContext } from '../types/file_manager.types.ts'

/**
 * Determines the target database table based on the file type.
 * @param fileType The type of the file.
 * @returns The name of the table to use.
 */
function getTableForFileType(
  fileType: UploadContext['pathContext']['fileType'],
): 'dialectic_project_resources' | 'dialectic_contributions' {
  switch (fileType) {
    case 'model_contribution':
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
    const bucket = Deno.env.get('SUPABASE_CONTENT_STORAGE_BUCKET')
    if (!bucket) {
      throw new Error('SUPABASE_CONTENT_STORAGE_BUCKET environment variable is not set.')
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
    const filePath = constructStoragePath(context.pathContext)

    // 1. Upload file to Storage
    const { error: uploadError } = await this.supabase.storage
      .from(this.storageBucket)
      .upload(filePath, context.fileContent, {
        contentType: context.mimeType,
        upsert: true, // Overwrite if exists, useful for retries
      })

    if (uploadError) {
      return {
        record: null,
        error: { message: `Storage upload failed: ${uploadError.message}`},
      }
    }

    // 2. Insert record into the appropriate database table
    const targetTable = getTableForFileType(context.pathContext.fileType)
    const fileName = context.pathContext.originalFileName

    let recordData:
      | TablesInsert<'dialectic_project_resources'>
      | TablesInsert<'dialectic_contributions'>

    if (targetTable === 'dialectic_project_resources') {
      recordData = {
        project_id: context.pathContext.projectId,
        user_id: context.userId,
        file_name: fileName,
        mime_type: context.mimeType,
        size_bytes: context.sizeBytes,
        storage_bucket: this.storageBucket,
        storage_path: filePath,
        resource_description: context.description ?? null,
      }
    } else {
      // This case is for 'dialectic_contributions'
      recordData = {
        project_id: context.pathContext.projectId,
        session_id: context.pathContext.sessionId!,
        user_id: context.userId,
        stage: context.pathContext.stageSlug!,
        model_name: context.pathContext.modelSlug,
        file_name: fileName,
        mime_type: context.mimeType,
        size_bytes: context.sizeBytes,
        storage_bucket: this.storageBucket,
        storage_path: filePath,
        iteration_number: context.pathContext.iteration ?? 1,
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
      await this.supabase.storage.from(this.storageBucket).remove([filePath])
      return {
        record: null,
        error: { message: `Database insert failed: ${insertError.message}` },
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