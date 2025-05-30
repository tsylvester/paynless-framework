export interface ContentReference {
  content_storage_bucket: string;
  content_storage_path: string;
  content_mime_type: string;
  content_size_bytes: number;
  raw_response_storage_path?: string | null; // Optional, as per plan
} 