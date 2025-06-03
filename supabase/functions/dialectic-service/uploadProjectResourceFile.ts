// deno-lint-ignore-file no-explicit-any
import { SupabaseClient } from '@supabase/supabase-js';
import {
  DialecticProjectResource,
  UploadProjectResourceFileSuccessResponse
} from './dialectic.interface.ts';
import { uploadToStorage, getFileMetadata } from '../_shared/supabase_storage_utils.ts';
import type { // Import other shared types
  ServiceError,
  GetUserFn,
  ILogger
} from '../_shared/types.ts';

// Local DI interfaces are removed as they are now imported/handled.

const BUCKET_NAME = 'dialectic-contributions';

export async function uploadProjectResourceFileHandler(
  req: Request,
  dbAdminClient: SupabaseClient,
  getUserFn: GetUserFn, 
  loggerInstance: ILogger
): Promise<{ data?: UploadProjectResourceFileSuccessResponse; error?: ServiceError }> { 
  loggerInstance.info('uploadProjectResourceFileHandler started');

  if (req.method !== 'POST') {
    return { error: { message: 'Method not allowed. Please use POST.', status: 405, code: 'METHOD_NOT_ALLOWED' } };
  }

  let formData;
  try {
    formData = await req.formData();
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    loggerInstance.error('Failed to parse FormData', { error: errorMessage });
    return { error: { message: 'Invalid FormData.', status: 400, details: errorMessage, code: 'FORMDATA_ERROR' } };
  }

  const file = formData.get('file') as File | null;
  const projectId = formData.get('projectId') as string | null;
  const resourceDescription = formData.get('resourceDescription') as string | null;

  if (!file) {
    return { error: { message: "'file' field is missing in FormData.", status: 400, code: 'MISSING_FILE' } };
  }
  if (!projectId) {
    return { error: { message: "'projectId' field is missing in FormData.", status: 400, code: 'MISSING_PROJECT_ID' } };
  }
  if (typeof projectId !== 'string') {
    return { error: { message: "'projectId' must be a string.", status: 400, code: 'INVALID_PROJECT_ID_TYPE' } };
  }

  const { data: { user }, error: userError } = await getUserFn(); // user here is of type User | null (from npm via GetUserFnResult)
  if (userError || !user) {
    loggerInstance.warn('User not authenticated for uploadProjectResourceFile', { error: userError });
    const errorResponse: ServiceError = userError 
      ? { ...userError, code: userError.code || 'AUTH_ERROR' } 
      : { message: 'User not authenticated.', status: 401, code: 'AUTH_ERROR' };
    return { error: errorResponse };
  }
  // After this check, user is confirmed to be of type User (not null)

  try {
    // 1. Verify project ownership
    const { data: project, error: projectError } = await dbAdminClient
      .from('dialectic_projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', user.id) // user.id is correct as user is of type User
      .single();

    if (projectError) {
      loggerInstance.error('Error fetching project for ownership verification', { projectId, userId: user.id, error: projectError });
      if (projectError.code === 'PGRST116') { 
        return { error: { message: 'Project not found or access denied.', status: 404, code: 'PROJECT_NOT_FOUND_OR_FORBIDDEN' } };
      }
      return { error: { message: 'Failed to verify project ownership.', status: 500, details: projectError.message, code: 'DB_PROJECT_FETCH_ERROR' } };
    }

    if (!project) { 
        loggerInstance.warn('Project not found after successful query (edge case)', { projectId, userId: user.id });
        return { error: { message: 'Project not found or access denied.', status: 404, code: 'PROJECT_NOT_FOUND_UNEXPECTED' } };
    }

    // 2. Prepare for storage
    const resourceId = crypto.randomUUID();
    const originalFileName = file.name;
    const storagePath = `projects/${projectId}/resources/${resourceId}/${originalFileName}`;

    // 3. Upload to Supabase Storage
    loggerInstance.info('Attempting to upload file to storage', { bucket: BUCKET_NAME, path: storagePath, fileName: originalFileName });
    const { error: uploadError } = await uploadToStorage(
      dbAdminClient, 
      BUCKET_NAME,
      storagePath,
      file, 
      { contentType: file.type || 'application/octet-stream', upsert: false }
    );

    if (uploadError) {
      loggerInstance.error('Failed to upload file to Supabase Storage', { error: uploadError, bucket: BUCKET_NAME, path: storagePath });
      const details = uploadError instanceof Error ? uploadError.message : String(uploadError);
      return { error: { message: 'Failed to upload file to storage.', status: 500, details, code: 'STORAGE_UPLOAD_ERROR' } };
    }
    loggerInstance.info('File uploaded successfully', { path: storagePath });
    
    // 4. Get file metadata (size) after upload
    let sizeBytes = file.size; 
    const metadataResult = await getFileMetadata(dbAdminClient, BUCKET_NAME, storagePath);
    if (metadataResult.error) {
        loggerInstance.warn('Failed to get file metadata from storage, using FormData size as fallback.', { path: storagePath, error: metadataResult.error });
    } else if (metadataResult.size !== undefined) {
        sizeBytes = metadataResult.size;
        loggerInstance.info('Got file size from storage metadata', { sizeBytes });
    }

    // 5. Insert record into dialectic_project_resources
    const newResource: Omit<DialecticProjectResource, 'id' | 'created_at' | 'updated_at'> & {id: string} = {
      id: resourceId,
      project_id: projectId,
      user_id: user.id, // user.id is correct
      file_name: originalFileName,
      storage_bucket: BUCKET_NAME,
      storage_path: storagePath,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: sizeBytes,
      resource_description: resourceDescription || null,
    };

    const { data: dbResource, error: dbInsertError } = await dbAdminClient
      .from('dialectic_project_resources')
      .insert(newResource)
      .select()
      .single();

    if (dbInsertError) {
      loggerInstance.error('Failed to insert project resource record into DB', { error: dbInsertError, resourceData: newResource });
      return { error: { message: 'Failed to save resource metadata.', status: 500, details: dbInsertError.message, code: 'DB_INSERT_ERROR' } };
    }
    
    if (!dbResource) {
        loggerInstance.error('DB resource not found after insert (unexpected)', { resourceId });
        return { error: { message: 'Failed to create resource, record not found after insert.', status: 500, code: 'DB_INSERT_UNEXPECTED_MISSING' } };
    }

    loggerInstance.info('Project resource created successfully', { resourceId: dbResource.id, projectId });
    return {
      data: {
        message: 'File uploaded and resource created successfully.',
        resource: dbResource as DialecticProjectResource,
      }
    };

  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    loggerInstance.error('Unexpected error in uploadProjectResourceFileHandler', { error: errorMessage, projectId });
    return { error: { message: 'An unexpected error occurred.', status: 500, details: errorMessage, code: 'UNEXPECTED_ERROR' } };
  }
}
