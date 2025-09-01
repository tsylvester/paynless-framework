import { SupabaseClient } from 'npm:@supabase/supabase-js';

interface UploadStorageOptions {
  contentType: string;
  upsert?: boolean;
  contentDisposition?: string;
}

export interface UploadStorageResult {
  path: string | null;
  error: Error | null;
}

export interface DownloadStorageResult {
  data: ArrayBuffer | null;
  mimeType?: string;
  error: Error | null;
}

export type DownloadFromStorageFn = (
  supabase: SupabaseClient,
  bucket: string,
  path: string
) => Promise<DownloadStorageResult>;

export interface FileMetadataSuccess {
    size: number;
    mimeType: string;
}

export interface FileMetadataError {
    error: Error;
    size?: never;
    mimeType?: never;
}

export interface DeleteStorageResult {
    error: Error | null;
}

// Supabase official client supports: File | Blob | ArrayBuffer | FormData | ReadableStream | string
// Let's stick to common ones that are easy to work with in Deno/Node and browser contexts.
// FormData can be useful for multipart uploads but might be more complex than needed here.
// ReadableStream is good for large files but adds complexity for now.
// File is browser-specific for direct file inputs.
type UniversalUploadableContent = string | ArrayBuffer | Blob;

/**
 * Uploads a file to the specified Supabase Storage bucket.
 *
 * @param supabaseClient - The Supabase client instance (typically service role client).
 * @param bucket - The name of the storage bucket.
 * @param path - The path (including filename) where the file will be stored in the bucket.
 * @param content - The file content to upload (string, ArrayBuffer, or Blob).
 * @param options - Upload options, including contentType and upsert behavior.
 * @returns A promise that resolves to an object containing the path of the uploaded file and any error.
 */
export async function uploadToStorage(
  supabaseClient: SupabaseClient,
  bucket: string,
  path: string,
  content: UniversalUploadableContent,
  options: UploadStorageOptions,
): Promise<UploadStorageResult> {
  try {
    // The error from Supabase storage client is typed as `StorageError | null` internally.
    // StorageError extends Error and has a message property.
    const { data, error: uploadErrorObj } = await supabaseClient.storage
      .from(bucket)
      .upload(path, content, {
        contentType: options.contentType,
        upsert: options.upsert || false,
        ...(options.contentDisposition && { contentDisposition: options.contentDisposition }),
      });

    if (uploadErrorObj) {
      console.error(`Supabase storage upload error for path "${path}":`, uploadErrorObj);
      // Explicitly cast `data` to acknowledge it might exist even with an error.
      // Supabase client might return a path in `data` (e.g., if error is 'resource already exists').
      const pathFromDataOnError = (data as ({ path: string } | null))?.path ?? null;
      return { path: pathFromDataOnError, error: new Error(uploadErrorObj.message) };
    }

    // If there was no error object, data should be present and contain the path.
    if (data?.path) {
      return { path: data.path, error: null };
    } else {
      // This case should ideally not be reached if uploadErrorObj is null,
      // as Supabase should return data with a path on success.
      console.error(`Supabase storage upload for path "${path}": No error reported, but no path returned in data.`);
      return { path: null, error: new Error('Upload succeeded according to Supabase, but no path was returned.') };
    }

  } catch (e: unknown) {
    console.error(`Unexpected error in uploadToStorage for path "${path}":`, e);
    const message = e instanceof Error ? e.message : 'An unexpected error occurred during upload.';
    return { path: null, error: new Error(message) };
  }
}

export const downloadFromStorage: DownloadFromStorageFn = async (
  supabase: SupabaseClient,
  bucket: string,
  path: string
): Promise<DownloadStorageResult> => {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error) {
      console.error("Error downloading from storage:", error);
      return { data: null, error };
    }
    if (!data) {
      return { data: null, error: new Error("No data returned from storage download.") };
    }

    // Deno specific way to get Blob.arrayBuffer(), not Blob.type for mimeType yet from Supabase JS library
    // The mimeType might need to be fetched via getFileMetadata or assumed based on extension if not directly available
    const arrayBuffer = await data.arrayBuffer();
    return { data: arrayBuffer, mimeType: data.type || undefined, error: null };
  } catch (e) {
    console.error("Exception in downloadFromStorage:", e);
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function deleteFromStorage(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[]
): Promise<{ error: Error | null }> {
  try {
    const { data, error } = await supabase.storage.from(bucket).remove(paths);

    if (error) {
      console.error(`Error deleting from storage (bucket: ${bucket}, paths: ${paths.join(', ')}):`, error);
      return { error };
    }

    // Verify that all requested paths were actually reported as removed.
    // The 'data' returned by 'remove' should be an array of FileObjects corresponding to the deleted files.
    if (!data || data.length !== paths.length) {
      const returnedFileCount = data ? data.length : 'null (or undefined)';
      const returnedFileNames = data ? data.map(f => f.name).join(', ') : 'none';
      const message = `Storage remove operation reported no explicit error for bucket '${bucket}', but file count mismatch. Expected to remove ${paths.length} files, but confirmation received for ${returnedFileCount} files. Input paths: [${paths.join(', ')}]. Confirmed removed names: [${returnedFileNames}].`;
      console.error(message);
      return { error: new Error(message) };
    }

    // Additionally, ensure all specified paths are found in the names of the returned FileObjects.
    // This is crucial if paths can contain folder prefixes, but for simple filenames, it's a direct check.
    const removedFileNames = data.map(fileObject => fileObject.name);
    const allPathsConfirmed = paths.every(path => {
      // Assuming paths are filenames or full paths that match FileObject.name directly.
      // If paths could be like "folder/file.txt" and FileObject.name is "file.txt",
      // a more sophisticated check would be needed. For now, assume direct match.
      return removedFileNames.includes(path);
    });

    if (!allPathsConfirmed) {
      const message = `Storage remove operation reported no explicit error for bucket '${bucket}', and counts matched (${paths.length}), but not all input path names were found in the confirmed deletion list. Input paths: [${paths.join(', ')}]. Confirmed removed names: [${removedFileNames.join(', ')}].`;
      console.error(message);
      return { error: new Error(message) };
    }
    
    // console.log(`Successfully deleted ${data.length} file(s) from storage bucket '${bucket}': ${paths.join(', ')}`);
    return { error: null };
  } catch (e) {
    console.error(`Exception in deleteFromStorage (bucket: ${bucket}, paths: ${paths.join(', ')}):`, e);
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function createSignedUrlForPath(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn: number
): Promise<{ signedUrl: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      console.error("Error creating signed URL:", error);
      return { signedUrl: null, error };
    }

    if (!data || !data.signedUrl) {
      console.error("No signed URL returned from Supabase, despite no explicit error.");
      return { signedUrl: null, error: new Error("Failed to create signed URL: No URL in response.") };
    }

    return { signedUrl: data.signedUrl, error: null };
  } catch (e) {
    console.error("Exception in createSignedUrlForPath:", e);
    return { signedUrl: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function getFileMetadata(
  supabase: SupabaseClient,
  bucket: string,
  path: string // Full path to the file, e.g., "folder/subfolder/file.md"
): Promise<{ size?: number; mimeType?: string; error: Error | null }> {
  try {
    const lastSlashIdx = path.lastIndexOf('/');
    const directoryPath = lastSlashIdx === -1 ? '' : path.substring(0, lastSlashIdx);
    const fileName = lastSlashIdx === -1 ? path : path.substring(lastSlashIdx + 1);

    if (!fileName) {
        return { error: new Error(`Invalid file path provided (fileName is empty): "${path}"`) };
    }

    const { data: fileList, error: listError } = await supabase.storage
      .from(bucket)
      .list(directoryPath, { 
        search: fileName,
        limit: 1 
      });

    if (listError) {
      console.error(`Error listing file metadata for file "${fileName}" in directory "${directoryPath}":`, listError);
      return { error: listError };
    }

    if (!fileList || fileList.length === 0) {
      return { error: new Error(`File not found: "${fileName}" in directory "${directoryPath}".`) };
    }

    const fileMetadata = fileList[0]; // The searched file should be the first and only item

    if (fileMetadata.id === null || !fileMetadata.metadata || typeof fileMetadata.metadata.size === 'undefined' || typeof fileMetadata.metadata.mimetype === 'undefined') {
        console.warn(`Object found for "${fileName}" in "${directoryPath}" does not appear to be a file with complete metadata. ID: ${fileMetadata.id}, Metadata: ${JSON.stringify(fileMetadata.metadata)}`);
        return { error: new Error(`Object found for "${fileName}" is not a file or lacks expected metadata.`) };
    }

    return {
      size: fileMetadata.metadata.size,
      mimeType: fileMetadata.metadata.mimetype,
      error: null,
    };
  } catch (e) {
    console.error(`Exception in getFileMetadata for path "${path}":`, e);
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}