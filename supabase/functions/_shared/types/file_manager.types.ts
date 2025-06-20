import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts'
import type {
  Database,
  Json
} from '../../types_db.ts'
import type { ServiceError } from '../types.ts';

/**
 * A union of all possible file types the system can manage.
 * This is the primary driver for path construction and database registration logic.
 */
export type FileType =
  | 'project_readme' // The main README for a dialectic project.
  | 'initial_user_prompt' // The initial user-provided prompt file for a project.
  | 'user_prompt' // The initial user-provided prompt file for an iteration (in 0_seed_inputs).
  | 'system_settings' // JSON file with system settings for an iteration (in 0_seed_inputs).
  | 'seed_prompt' // The fully constructed prompt sent to a model for a specific stage.
  | 'model_contribution_main' // For the primary content (e.g., Markdown) of an AI model's output for a stage.
  | 'model_contribution_raw_json' // For the raw JSON response from the AI provider for a stage.
  | 'user_feedback' // User's consolidated feedback on a stage.
  | 'contribution_document' // A refined/derived document (e.g., PRD, checklist) within a stage's 'documents' folder.
  | 'general_resource' // A general file resource uploaded by a user for an iteration (in 0_seed_inputs/general_resource).
  | 'iteration_summary_md'; // For the summary markdown file at the root of an iteration.

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
  userId: string | null; // Allow null for system-generated contributions
  description?: string
  customMetadata?: Record<string, string> // For any extra data to be stored.

  contributionMetadata?: {
    sessionId: string;
    modelIdUsed: string; // FK to ai_providers.id
    modelNameDisplay: string; // For dialectic_contributions.model_name
    stageSlug: string;
    iterationNumber: number;

    // For FileManagerService to upload the raw JSON response.
    // The path for this will be derived by FileManagerService using path_constructor
    // with fileType 'model_contribution_raw_json' and an originalFileName derived
    // from the main contribution's originalFileName (e.g., if main is foo.md, raw is foo_raw.json).
    rawJsonResponseContent: string; // The actual JSON string content for the raw AI response.

    // Tokenomics and other metadata for the primary dialectic_contributions record
    tokensUsedInput?: number;
    tokensUsedOutput?: number;
    processingTimeMs?: number;
    seedPromptStoragePath?: string; // Path to the seed prompt that generated this contribution
    citations?: Json | null;
    contributionType?: string | null; // e.g., 'hypothesis', 'critique', 'synthesis' (align with stage or be more specific)
    errorDetails?: string | null; // If AI model itself reported an error in its generation process
    promptTemplateIdUsed?: string | null; // FK to system_prompts.id
    targetContributionId?: string | null; // For linking critiques or threaded responses
    
    // Fields for edit tracking, typically set by the service managing edits, 
    // but defaults can be provided for new contributions.
    editVersion?: number; // Default to 1 for new contributions
    isLatestEdit?: boolean; // Default to true for new contributions
    originalModelContributionId?: string | null; // Null for new, non-edited contributions
  };
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