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

export async function downloadFromStorage(
  supabase: SupabaseClient,
  bucket: string,
  path: string
): Promise<{ data: ArrayBuffer | null; mimeType?: string; error: Error | null }> {
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
      console.error("Error deleting from storage:", error);
      return { error };
    }
    // data from remove is an array of FileObject or null, not typically used for confirming deletion success beyond error being null
    // console.log("Successfully deleted from storage:", data); 
    return { error: null };
  } catch (e) {
    console.error("Exception in deleteFromStorage:", e);
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
  path: string
): Promise<{ size?: number; mimeType?: string; error: Error | null }> {
  try {
    // The list method can be used to get metadata for a specific file by providing its path.
    const { data: fileList, error: listError } = await supabase.storage
      .from(bucket)
      .list(path, { limit: 1 }); // Limit to 1 as we only expect one file or folder if path is a prefix

    if (listError) {
      console.error(`Error listing file metadata for path "${path}":`, listError);
      return { error: listError };
    }

    if (!fileList || fileList.length === 0) {
      return { error: new Error("File not found or no metadata returned.") };
    }
    
    // If path is a directory, list might return items inside it.
    // We are interested in the metadata of the file itself.
    // Supabase list() with a direct file path should return that file if it exists.
    // If the path *is* the file, it should be the first (and only) item.
    const fileMetadata = fileList.find(file => file.name === path.split('/').pop());

    if (!fileMetadata) {
       // This case might occur if the path is a folder and list() returned folder contents
       // or if the file simply doesn't exist and list() returned empty or other items somehow.
      return { error: new Error(`File metadata not found for the exact path "${path}" within list results.`) };
    }

    return {
      size: fileMetadata.metadata?.size,
      mimeType: fileMetadata.metadata?.mimetype,
      error: null,
    };
  } catch (e) {
    console.error(`Exception in getFileMetadata for path "${path}":`, e);
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// We will add other utility functions here (deleteFromStorage, createSignedUrlForPath, getFileMetadata) 