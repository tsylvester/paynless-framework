import { SupabaseClient } from '@supabase/supabase-js';

interface UploadStorageOptions {
  contentType: string;
  upsert?: boolean;
}

interface UploadStorageResult {
  path: string | null;
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

// We will add other utility functions here (downloadFromStorage, deleteFromStorage, etc.) 