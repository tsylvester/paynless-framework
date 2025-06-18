import type { PathContext } from '../types/file_manager.types.ts'

/**
 * Sanitizes a string to be used as a file or directory name.
 * Replaces spaces with underscores and converts to lowercase.
 * @param input The string to sanitize.
 * @returns The sanitized string.
 */
function sanitizeForPath(input: string): string {
  return input.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '');
}

/**
 * Constructs a deterministic storage path for a file based on its context.
 * This function is the single source of truth for all file paths in Supabase Storage.
 * @param context The context defining the file's place in the project structure.
 * @returns A relative path for the file within the Supabase Storage bucket.
 */
export function constructStoragePath(context: PathContext): string {
  const {
    projectId,
    fileType,
    sessionId,
    iteration,
    stageSlug,
    modelSlug,
    originalFileName,
  } = context;

  const sanitizedFileName = sanitizeForPath(originalFileName);

  switch (fileType) {
    case 'project_readme':
      return `projects/${projectId}/project_readme.md`;

    case 'general_resource':
      // Assuming a general resource is associated with a project, not a specific session/iteration.
      // A UUID could be added here for uniqueness if needed, but using original name for now.
      return `projects/${projectId}/resources/${sanitizedFileName}`;

    case 'user_prompt':
      if (!sessionId || iteration === undefined) {
        throw new Error('Session ID and iteration are required for user_prompt file type.');
      }
      return `projects/${projectId}/sessions/${sessionId}/iteration_${iteration}/0_seed_inputs/user_prompt.md`;

    case 'system_settings':
      if (!sessionId || iteration === undefined) {
        throw new Error('Session ID and iteration are required for system_settings file type.');
      }
      return `projects/${projectId}/sessions/${sessionId}/iteration_${iteration}/0_seed_inputs/system_settings.json`;
    
    case 'seed_prompt':
      if (!sessionId || iteration === undefined || !stageSlug) {
        throw new Error('Session ID, iteration, and stageSlug are required for seed_prompt file type.');
      }
      return `projects/${projectId}/sessions/${sessionId}/iteration_${iteration}/${stageSlug}/seed_prompt.md`;

    case 'model_contribution':
      if (!sessionId || iteration === undefined || !stageSlug || !modelSlug) {
        throw new Error('Session ID, iteration, stageSlug, and modelSlug are required for model_contribution file type.');
      }
      return `projects/${projectId}/sessions/${sessionId}/iteration_${iteration}/${stageSlug}/${sanitizeForPath(modelSlug)}/${sanitizedFileName}`;
      
    case 'user_feedback':
      if (!sessionId || iteration === undefined || !stageSlug) {
        throw new Error('Session ID, iteration, and stageSlug are required for user_feedback file type.');
      }
      return `projects/${projectId}/sessions/${sessionId}/iteration_${iteration}/${stageSlug}/user_feedback.md`;

    case 'contribution_document':
       if (!sessionId || iteration === undefined || !stageSlug) {
        throw new Error('Session ID, iteration, and stageSlug are required for contribution_document file type.');
      }
      // Documents are nested under a 'documents' folder within the stage directory.
      return `projects/${projectId}/sessions/${sessionId}/iteration_${iteration}/${stageSlug}/documents/${sanitizedFileName}`;

    default:
      // This is a safety net. In a strongly-typed system, this should not be reached.
      // We can assert this at compile time using a helper function.
      const _exhaustiveCheck: never = fileType;
      throw new Error(`Unhandled file type: ${_exhaustiveCheck}`);
  }
} 