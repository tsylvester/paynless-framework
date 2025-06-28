import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.39.7";
import type { DownloadStorageResult } from "../supabase_storage_utils.ts"; // Assuming this path is correct

export interface IStorageUtils {
  downloadFromStorage: (
    supabase: SupabaseClient,
    bucket: string,
    path: string
  ) => Promise<DownloadStorageResult>;
  createSignedUrlForPath: (
    supabase: SupabaseClient,
    bucket: string,
    path: string,
    expiresIn: number
  ) => Promise<{ signedUrl: string | null; error: Error | null }>;
} 