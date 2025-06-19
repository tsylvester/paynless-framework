import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts'
import type {
  Database,
} from '../../types_db.ts'
import type { ServiceError } from '../types.ts';

/**
 * A union of all possible file types the system can manage.
 * This is the primary driver for path construction and database registration logic.
 */
export type FileType =
  | 'project_readme' // The main README for a dialectic project.
  | 'user_prompt' // The initial user-provided prompt file for an iteration.
  | 'system_settings' // JSON file with system settings for an iteration.
  | 'seed_prompt' // The fully constructed prompt sent to a model for a specific stage.
  | 'model_contribution' // The direct output from an AI model.
  | 'user_feedback' // User's consolidated feedback on a stage.
  | 'contribution_document' // A refined document derived from a model's contribution (e.g., a PRD).
  | 'general_resource' // A general file resource uploaded by a user for a project.

/**
 * The context required to construct a unique, deterministic storage path for a file.
 */
export interface PathContext {
  projectId: string
  fileType: FileType
  sessionId?: string
  iteration?: number
  stageSlug?: string
  modelSlug?: string
  originalFileName: string // The original, user-visible file name, e.g., "my_requirements.md"
}

/**
 * The context required to upload a file to storage and register its metadata in the database.
 */
export interface UploadContext {
  pathContext: PathContext
  fileContent: Buffer | ArrayBuffer | string
  mimeType: string
  sizeBytes: number
  userId: string
  description?: string
  customMetadata?: Record<string, string> // For any extra data to be stored.
}

/**
 * Represents a record in one of the file metadata tables.
 * This is a union type to allow the FileManagerService to return a record
 * from either `dialectic_project_resources` or `dialectic_contributions`.
 */
export type FileRecord =
  | Database['public']['Tables']['dialectic_project_resources']['Row']
  | Database['public']['Tables']['dialectic_contributions']['Row'] 
  
export type FileManagerResponse = 
  | { record: FileRecord; error: null }
  | { record: null; error: ServiceError };
  
export interface IFileManager {
  uploadAndRegisterFile(context: UploadContext): Promise<FileManagerResponse>;
} 