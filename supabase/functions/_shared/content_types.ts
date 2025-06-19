export interface ContentReference {
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  raw_response_storage_path?: string | null; // Optional, as per plan
} 